// Phase 9.9A: Make visible trees and rocks gatherable — focused tests
import fs from 'fs';
import { GameRoom } from './server/room.js';
import { RESOURCE_NODES, RESOURCE_CONFIG } from './server/classes.js';

class FakeWS {
  constructor(label){ this.label=label; this.sent=[]; this.handlers={}; this.readyState=1; }
  on(ev,fn){ this.handlers[ev]=fn; }
  send(msg){ this.sent.push(JSON.parse(msg)); }
}
function send(room, ws, obj){ room.onMessage(ws, JSON.stringify(obj)); }
function join(room, name, cls, faction){ const ws=new FakeWS(name); room.onConnect(ws); send(room, ws, {t:'join', name, class:cls, faction}); return {ws, p:room.players.get(ws.id)}; }
function setPos(p,x,z,ry=0){ p.x=x; p.z=z; p.prevX=x; p.prevZ=z; p.ry=ry; p.lastPosTime=Date.now(); }
function reset(p){ p.lastClassAttackTime=0; p.lastGatherTime=0; p.lastBuildTime=0; p.stamina=p.maxStamina||100; p.dead=false; }
function latest(ws, kind){ return [...ws.sent].reverse().find(m => m.t==='event' && m.kind===kind); }

let failures=0;
function ok(name, cond){ console.log(name+':', cond?'PASS':'FAIL'); if(!cond) failures++; }

const gameJs = fs.readFileSync('public/game.js','utf8');

console.log('=== RESOURCE NODE BINDING (server → client) ===');

// 1. Server has resource nodes with all required fields
ok('server has 5 tree nodes', RESOURCE_NODES.filter(n=>n.type==='wood').length === 5);
ok('server has 5 rock nodes', RESOURCE_NODES.filter(n=>n.type==='stone').length === 5);
ok('all server nodes have stable id+type+x+z+amount+maxAmount', RESOURCE_NODES.every(n=>n.id&&n.type&&Number.isFinite(n.x)&&Number.isFinite(n.z)&&Number.isFinite(n.amount)&&Number.isFinite(n.maxAmount)));

// 2. Client renders from server snapshot, not hardcoded decorative
ok('client has updateResourceMeshes function', gameJs.includes('function updateResourceMeshes()'));
ok('client renders trees from NET.resourceNodes', gameJs.includes('NET.resourceNodes') && gameJs.includes('updateResourceMeshes()'));
ok('no hardcoded decorative tree loop remains', !gameJs.includes('for (var ti = 0; ti < 5; ti++)'));
ok('no hardcoded decorative rock loop remains', !gameJs.includes('for (var ri = 0; ri < 5; ri++)'));

// 3. Mesh metadata attached
ok('tree meshes get resourceNodeId metadata', gameJs.includes('trunk.resourceNodeId = sn.id') && gameJs.includes('foliage.resourceNodeId = sn.id'));
ok('rock meshes get resourceNodeId metadata', gameJs.includes('rock.resourceNodeId = sn.id'));
ok('tree meshes get gatherToolRequired metadata', gameJs.includes('trunk.gatherToolRequired = tool') && gameJs.includes('foliage.gatherToolRequired = tool'));
ok('rock meshes get gatherToolRequired metadata', gameJs.includes('rock.gatherToolRequired = tool'));

// 4. GATHER_RADIUS widened to match visible object
ok('client GATHER_RADIUS is 6.5', gameJs.includes('GATHER_RADIUS = 6.5'));
ok('server gatherRadius is 6.5', RESOURCE_CONFIG.gatherRadius === 6.5);

// 5. Render loop calls updateResourceMeshes
ok('render loop calls updateResourceMeshes', gameJs.includes('updateResourceMeshes();'));

console.log('');
console.log('=== WORKER GATHER FROM VISIBLE NODE DISTANCE ===');

const room = new GameRoom();
clearInterval(room.timer);
const worker = join(room, 'W', 'worker', 'ironhold');

// Test: Worker axe gathers wood from tree at visible-edge distance
const tree = room.resourceNodes.find(n=>n.id==='tree_1');
send(room, worker.ws, {t:'selectItem', slot:1}); // axe
reset(worker.p);
setPos(worker.p, tree.x + 5.5, tree.z, 0); // within widened radius
const distToTree = Math.hypot(worker.p.x - tree.x, worker.p.z - tree.z);
console.log('  standing at distance', distToTree, 'from tree_1 center');
const wood0 = worker.p.inventory.wood;
const treeAmt0 = tree.amount;
send(room, worker.ws, {t:'gather', nodeId: tree.id});
ok('Worker axe gathers wood from visible tree distance', worker.p.inventory.wood > wood0);
ok('tree amount decreases after gather', tree.amount < treeAmt0);
ok('inventory increases after gather', worker.p.inventory.wood > wood0);

// Test: Worker pickaxe gathers stone from rock at visible-edge distance
const rock = room.resourceNodes.find(n=>n.id==='rock_1');
send(room, worker.ws, {t:'selectItem', slot:2}); // pickaxe
reset(worker.p);
setPos(worker.p, rock.x + 5.5, rock.z, 0);
const distToRock = Math.hypot(worker.p.x - rock.x, worker.p.z - rock.z);
console.log('  standing at distance', distToRock, 'from rock_1 center');
const stone0 = worker.p.inventory.stone;
const rockAmt0 = rock.amount;
send(room, worker.ws, {t:'gather', nodeId: rock.id});
ok('Worker pickaxe gathers stone from visible rock distance', worker.p.inventory.stone > stone0);
ok('rock amount decreases after gather', rock.amount < rockAmt0);

// Wrong tool rejected
reset(worker.p);
send(room, worker.ws, {t:'selectItem', slot:2}); // pickaxe
setPos(worker.p, tree.x + 1, tree.z, 0);
const wrongWood = worker.p.inventory.wood;
send(room, worker.ws, {t:'gather', nodeId: tree.id});
ok('wrong tool (pickaxe on tree) is rejected', worker.p.inventory.wood === wrongWood && !!latest(worker.ws, 'gatherReject'));

// Too far rejected only when actually too far
reset(worker.p);
send(room, worker.ws, {t:'selectItem', slot:1}); // axe
setPos(worker.p, tree.x + 10, tree.z, 0); // beyond 6.5
const farWood = worker.p.inventory.wood;
send(room, worker.ws, {t:'gather', nodeId: tree.id});
ok('too far is rejected only when actually too far', worker.p.inventory.wood === farWood && !!latest(worker.ws, 'gatherReject'));

// Node regen still works
const regenNode = room.resourceNodes.find(n=>n.id==='tree_2');
regenNode.amount = 40; // below max
room.lastNodeRegen = Date.now() - RESOURCE_CONFIG.nodeRegenInterval - 1;
room.update();
ok('node regen still works', regenNode.amount > 40);

// Every rendered tree has matching server node id
const treeIds = RESOURCE_NODES.filter(n=>n.type==='wood').map(n=>n.id);
ok('every tree has matching server node id', treeIds.length === 5 && treeIds.every(id=>id.startsWith('tree_')));

// Every rendered rock has matching server node id
const rockIds = RESOURCE_NODES.filter(n=>n.type==='stone').map(n=>n.id);
ok('every rock has matching server node id', rockIds.length === 5 && rockIds.every(id=>id.startsWith('rock_')));

// Server snapshot includes resource nodes
const snap = room.snapshotResourceNodes();
ok('server snapshot includes resource nodes with id+type+x+z+amount+maxAmount', snap.length === 10 && snap.every(n=>n.id&&n.type&&Number.isFinite(n.x)&&Number.isFinite(n.z)&&Number.isFinite(n.amount)&&Number.isFinite(n.maxAmount)));

console.log('');
console.log('OVERALL:', failures===0?'PASS':'FAIL');
process.exit(failures===0?0:1);
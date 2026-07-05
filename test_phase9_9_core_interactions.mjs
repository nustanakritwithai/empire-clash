// Phase 9.9 focused direct/server + static client interaction regression tests
import fs from 'fs';
import { GameRoom } from './server/room.js';

class FakeWS {
  constructor(label){ this.label=label; this.sent=[]; this.handlers={}; this.readyState=1; }
  on(ev,fn){ this.handlers[ev]=fn; }
  send(msg){ this.sent.push(JSON.parse(msg)); }
}
function send(room, ws, obj){ room.onMessage(ws, JSON.stringify(obj)); }
function join(room, name, cls, faction){ const ws=new FakeWS(name); room.onConnect(ws); send(room, ws, {t:'join', name, class:cls, faction}); return {ws,p:room.players.get(ws.id)}; }
function setPos(p,x,z,ry=0){ p.x=x; p.z=z; p.prevX=x; p.prevZ=z; p.ry=ry; p.lastPosTime=Date.now(); }
function reset(p){ p.lastClassAttackTime=0; p.lastGatherTime=0; p.lastBuildTime=0; p.stamina=p.maxStamina||100; p.dead=false; }
function latest(ws, kind){ return [...ws.sent].reverse().find(m => m.t==='event' && m.kind===kind); }
function countEvents(ws, kind){ return ws.sent.filter(m => m.t==='event' && m.kind===kind).length; }
let failures=0;
function ok(name, cond){ console.log(name+':', cond?'PASS':'FAIL'); if(!cond) failures++; }

const gameJs = fs.readFileSync('public/game.js','utf8');
console.log('=== CLIENT INTERACTION ROUTE MARKERS ===');
ok('desktop E calls tryInteract', gameJs.includes('if (e.code === "KeyE") tryInteract();'));
ok('mobile Action calls same tryInteract flow', gameJs.includes('actionBtn.dataset.enabled === "1"') && gameJs.includes('tryInteract();'));
ok('sword action hint is slash', gameJs.includes('ยิง/คลิก: ฟัน') || gameJs.includes('คลิก: ฟัน'));
ok('build sends clamped/near placement marker', gameJs.includes('clampBuildPlacement') && gameJs.includes('BUILD_PLACE_DISTANCE'));
ok('build preview has approximate red/green validity', gameJs.includes('buildPlacementApproxValid') && gameJs.includes('0xff4444') && gameJs.includes('0x55ff66'));

const room = new GameRoom();
clearInterval(room.timer);
const worker = join(room,'Worker','worker','ironhold');
const cmd = join(room,'Cmd','commander','ironhold');
const inf = join(room,'Sword','infantry','ironhold');
const ally = join(room,'Ally','worker','ironhold');
const enemy = join(room,'Enemy','infantry','verdant');
const archer = join(room,'Archer','archer','verdant');

console.log('=== WORKER GATHER FROM VISIBLE NODE DISTANCE ===');
const tree = room.resourceNodes.find(n=>n.id==='tree_1');
const rock = room.resourceNodes.find(n=>n.id==='rock_1');
setPos(worker.p, tree.x + 3.2, tree.z, 0); // near visible foliage/trunk edge, not exact center
send(room, worker.ws, {t:'selectItem', slot:1}); reset(worker.p);
const wood0 = worker.p.inventory.wood;
send(room, worker.ws, {t:'gather', nodeId:tree.id});
ok('Worker axe gathers wood from visible tree distance', worker.p.inventory.wood > wood0 && tree.amount < tree.maxAmount);
setPos(worker.p, rock.x + 3.2, rock.z, 0);
send(room, worker.ws, {t:'selectItem', slot:2}); reset(worker.p);
const stone0 = worker.p.inventory.stone;
send(room, worker.ws, {t:'gather', nodeId:rock.id});
ok('Worker pickaxe gathers stone from visible rock distance', worker.p.inventory.stone > stone0 && rock.amount < rock.maxAmount);
setPos(worker.p, tree.x + 3.2, tree.z, 0);
send(room, worker.ws, {t:'selectItem', slot:2}); reset(worker.p);
const wrongWood = worker.p.inventory.wood;
send(room, worker.ws, {t:'gather', nodeId:tree.id});
ok('wrong tool gather rejects', worker.p.inventory.wood === wrongWood && !!latest(worker.ws,'gatherReject'));
setPos(worker.p, -85, 10, 0); reset(worker.p);
const facWood0 = room.factionResources.ironhold.wood;
send(room, worker.ws, {t:'deposit'});
ok('Worker deposit still works', worker.p.inventory.wood === 0 && worker.p.inventory.stone === 0 && room.factionResources.ironhold.wood >= facWood0);

console.log('=== COMMANDER BUILD DISTANCE ===');
room.factionResources.ironhold.wood = 100; room.factionResources.ironhold.stone = 100;
setPos(cmd.p, -70, 35, -Math.PI/2);
send(room, cmd.ws, {t:'selectItem', slot:2}); reset(cmd.p);
send(room, cmd.ws, {t:'build', buildingType:'wooden_wall', x:cmd.p.x+4, z:cmd.p.z, rot:0});
const wall = room.buildings.find(b=>b.type==='wooden_wall');
ok('Commander wall blueprint builds within valid distance', !!wall);
send(room, cmd.ws, {t:'selectItem', slot:3}); reset(cmd.p);
send(room, cmd.ws, {t:'build', buildingType:'rally_flag', x:cmd.p.x-6, z:cmd.p.z+5, rot:0});
const flag = room.buildings.find(b=>b.type==='rally_flag');
ok('Commander rally blueprint builds within valid distance', !!flag);
reset(cmd.p);
const rejectsBefore = countEvents(cmd.ws,'buildReject');
send(room, cmd.ws, {t:'build', buildingType:'rally_flag', x:cmd.p.x+40, z:cmd.p.z, rot:0});
ok('too-far build reject only when actually too far', countEvents(cmd.ws,'buildReject') > rejectsBefore && latest(cmd.ws,'buildReject')?.data?.reason === 'Too far from Commander');

console.log('=== SWORD ACTION AUTHORITY ===');
send(room, inf.ws, {t:'selectItem', slot:1}); reset(inf.p); reset(enemy.p);
setPos(inf.p,0,0,0); setPos(enemy.p,0,-3,Math.PI);
const snap = room.snapshotPlayers().find(p=>p.id===inf.ws.id);
ok('sword selected appears in snapshot', snap.equippedItem?.id === 'sword');
const sta0 = inf.p.stamina;
const hp0 = enemy.p.hp;
send(room, inf.ws, {t:'classAttack', id:enemy.ws.id, dx:0, dz:-1});
ok('sword swing consumes stamina', inf.p.stamina < sta0);
ok('sword swing damages enemy in range/cone', enemy.p.hp < hp0 && !!latest(inf.ws,'classAttack'));
reset(inf.p); reset(enemy.p); enemy.p.hp=enemy.p.maxHp;
setPos(inf.p,0,0,0); setPos(enemy.p,6,0,Math.PI);
const hpOut = enemy.p.hp;
send(room, inf.ws, {t:'classAttack', id:enemy.ws.id, dx:0, dz:-1});
ok('sword misses target outside cone/range', enemy.p.hp === hpOut);
reset(inf.p); setPos(ally.p,0,-3,Math.PI); const allyHp=ally.p.hp;
send(room, inf.ws, {t:'classAttack', id:ally.ws.id, dx:0, dz:-1});
ok('sword cannot damage ally', ally.p.hp === allyHp);
send(room, inf.ws, {t:'selectItem', slot:1});
setPos(inf.p,0,0,0); setPos(enemy.p,0,-3,Math.PI); reset(inf.p); reset(enemy.p); enemy.p.hp=enemy.p.maxHp;
const swordDmgBaseline = enemy.p.hp;
send(room, inf.ws, {t:'classAttack', id:enemy.ws.id, dx:0, dz:-1});
const baselineDmg = swordDmgBaseline - enemy.p.hp;
send(room, enemy.ws, {t:'selectItem', slot:1}); // enemy infantry sword; then shield slot available
send(room, enemy.ws, {t:'selectItem', slot:2});
setPos(enemy.p,0,-3,Math.PI); // facing attacker at z 0
send(room, enemy.ws, {t:'block', active:true});
reset(inf.p); enemy.p.hp=enemy.p.maxHp;
send(room, inf.ws, {t:'classAttack', id:enemy.ws.id, dx:0, dz:-1});
const blockedDmg = enemy.p.maxHp - enemy.p.hp;
ok('shield block still reduces frontal sword damage', blockedDmg > 0 && blockedDmg < baselineDmg);
reset(archer.p); reset(inf.p); setPos(archer.p,0,0,0); setPos(inf.p,0,-40,Math.PI);
const bowHp = inf.p.hp;
send(room, archer.ws, {t:'classAttack', id:inf.ws.id, dx:0, dz:-1, drawMs:400});
ok('bow still works', inf.p.hp < bowHp);
cmd.p.dead=true; cmd.p.respawnAt=Date.now()-1; room.update();
ok('Rally Flag respawn still works', !cmd.p.dead && flag && Math.hypot(cmd.p.x-flag.x, cmd.p.z-flag.z)<6);
room.capturePoints[0].owner = 'ironhold'; room.lastScoreTick = Date.now()-11000; const score0=room.factionScores.ironhold; room.update();
ok('Central Fort scoring still works', room.factionScores.ironhold > score0);
room.resetRound();
ok('round reset clears temporary state', room.buildings.length===0 && room.rallyFlags.ironhold===null);

console.log('OVERALL:', failures===0?'PASS':'FAIL');
process.exit(failures===0?0:1);

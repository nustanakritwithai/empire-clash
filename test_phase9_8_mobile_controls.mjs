// Phase 9.8 mobile control scheme static + geometry smoke
import fs from 'fs';

const js = fs.readFileSync('public/game.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');
const room = fs.readFileSync('server/room.js', 'utf8');
let failed = false;
function check(name, ok) {
  console.log(`${name}: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) failed = true;
}
function has(s) { return js.includes(s) || html.includes(s) || room.includes(s); }

console.log('=== PHASE 9.8 MOBILE CONTROL MARKERS ===');
check('dynamic movement zone exists', has('moveZone') && has('beginJoystick') && has('joyOriginX'));
check('joystick origin follows touchstart', has('G.touch.joyOriginX = t.clientX') && has('joy.style.left = (t.clientX - 58)'));
check('joystick resets neutral on touchend', has('resetJoystick()') && has('G.touch.joyX = 0') && has('G.touch.sprinting = false'));
check('joystick sprint threshold only strong forward/up', has('G.touch.sprinting = G.touch.joyY < -0.78'));
check('legacy sprint button removed', !has('touchSprint') && !has('sprintBtn'));
check('fire buttons exist and use primary shoot()', has('touchFire') && has('touchFireTop') && has('useMobilePrimary') && has('shoot();'));
check('aim button exists and routes secondary', has('touchAim') && has('mobileSecondary') && has('secondaryAction === "aim"'));
check('jump button exists and triggers jump logic', has('touchJump') && has('G.touch.jumpTriggered = true'));
check('crouch button exists and toggles crouch/prone', has('touchCrouch') && has('crouchState') && has('G.touch.crouching = crouchState === 1') && has('G.touch.prone = crouchState === 2'));
check('mobile action button exists', has('touchAction') && has('G.mobileActionBtn'));
check('mobile action calls desktop interaction flow', has('tryInteract();') && has('actionBtn.dataset.enabled === "1"'));
check('action state detects worker axe wood', has('nearNode.type === "wood" && item.id !== "axe"') && has('เก็บไม้'));
check('action state detects worker pickaxe stone', has('nearNode.type === "stone" && item.id !== "pickaxe"') && has('เก็บหิน'));
check('wrong tool prompts preserved', has('ต้องถือขวาน') && has('ต้องถือพลั่วขุดหิน'));
check('deposit interaction preserved', has('netSend({ t: "deposit" })') && has('label: "ฝาก"'));
check('desktop E still calls tryInteract', has('if (e.code === "KeyE") tryInteract();'));
check('server sprint authority still present', room.includes('sprinting') && room.includes('stamina'));

console.log('=== 390x844 GEOMETRY PROBE ===');
const W = 390, H = 844;
function box(name,x,y,w,h){ return {name,x,y,w,h,r:x+w,b:y+h}; }
function overlap(a,b){ return !(a.r<=b.x || b.r<=a.x || a.b<=b.y || b.b<=a.y); }
const hotbarW = 242, hotbarH = 50;
const boxes = [
  box('joystickVisible',28,H-26-116,116,116),
  box('moveZone',0,H-Math.min(H*0.46,330),Math.min(W*0.56,250),Math.min(H*0.46,330)),
  box('hotbar',(W-hotbarW)/2,H-150-hotbarH,hotbarW,hotbarH),
  box('equippedLabel',(W-120)/2,H-210-24,120,24),
  box('prompt',(W-260)/2,H-248-26,260,26),
  box('resourceHud',10,H-330-44,120,44),
  box('actionDisplay',W-14-140,H-330-62,140,62),
  box('hudLeft',12,8,180,50),
  box('fireTop',14,86,58,58),
  box('fire',W-14-58,H-86-58,58,58),
  box('aim',W-82-58,H-86-58,58,58),
  box('jump',W-14-58,H-18-58,58,58),
  box('action',W-82-58,H-18-58,58,58),
  box('crouch',W-14-66,136,66,44),
  box('minimap',W-130,10,120,120),
  box('captureHud',(W-260)/2,200,260,40),
  box('scoreHud',120,62,130,40)
];
const blocking = boxes.filter(b => b.name !== 'moveZone');
let overlaps = [];
for (const a of blocking) for (const b of blocking) if (a.name < b.name && overlap(a,b)) overlaps.push(`${a.name}/${b.name}`);
console.log('overlaps:', overlaps.join(', ') || 'none');
check('no visible UI overlap on 390x844', overlaps.length === 0);
check('move zone is large and forgiving', boxes.find(b=>b.name==='moveZone').w >= 200 && boxes.find(b=>b.name==='moveZone').h >= 300);

if (failed) process.exit(1);
console.log('OVERALL: PASS');

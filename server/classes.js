// classes.js — faction-war MVP class definitions
// Old class ids map: soldier -> infantry, merchant -> worker, engineer -> worker, commander -> commander
const CLASS_COMPAT = {
  soldier: "infantry",
  merchant: "worker",
  engineer: "worker",
  commander: "commander"
};

export const CLASSES = {
  infantry: {
    name: "ทหารราบ",
    nameEn: "Infantry",
    hp: 130,
    speed: 5.5,
    damage: 18,
    income: 2,
    desc: "แนวหน้า HP สูง ต่อสู้ระยะประชิดแข็งแกร่ง"
  },
  archer: {
    name: "พลธนู",
    nameEn: "Archer",
    hp: 80,
    speed: 5.2,
    damage: 15,
    income: 3,
    desc: "สนับสนุนระยะไกล HP ต่ำ ยิงแม่นแต่เปราะ"
  },
  worker: {
    name: "คนงาน",
    nameEn: "Worker",
    hp: 100,
    speed: 5.0,
    damage: 8,
    income: 6,
    desc: "เก็บทรัพยากร เศรษฐกิจฝ่าย ต่อสู้อ่อน"
    // TODO Phase 7: gathering (wood/stone), deposit at warehouse
  },
  commander: {
    name: "แม่ทัพ",
    nameEn: "Commander",
    hp: 140,
    speed: 4.8,
    damage: 14,
    income: 3,
    desc: "วางแผน สั่งการ สร้างกำแพง/ธงรวมพล HP กลาง-สูง"
    // TODO Phase 8: build walls, rally flags using faction resources
  }
};

// Resolve class id with backward-compatible mapping
export function resolveClass(raw) {
  if (!raw) return "infantry";
  if (CLASSES[raw]) return raw;
  if (CLASS_COMPAT[raw]) return CLASS_COMPAT[raw];
  return "infantry";
}

// Legacy gun definitions kept for hidden/debug references only.
// Phase 9 normal gameplay uses CLASS_WEAPONS below.
export const WEAPONS = {
  rifle:  { dmg: 18, range: 80 },
  smg:    { dmg: 10, range: 50 },
  sniper: { dmg: 85, range: 160 },
  melee:  { dmg: 35, range: 5 }
};

// Phase 9: medieval/fantasy class combat config.
export const STAMINA_CONFIG = {
  max: 100,
  regenPerSecond: 18,
  sprintCostPerSecond: 12,
  blockDrainPerSecond: 10
};

export const CLASS_WEAPONS = {
  infantry: {
    id: "sword_shield",
    name: "Sword + Shield",
    mode: "melee",
    damage: 28,
    range: 4.8,
    cooldown: 650,
    staminaCost: 18,
    coneCos: 0.45,
    windupMs: 120,
    activeMs: 160,
    buildingDamage: 18,
    canBlock: true,
    blockReduction: 0.65,
    blockConeCos: 0.25
  },
  archer: {
    id: "bow",
    name: "Bow",
    mode: "ranged",
    damage: 22,
    range: 85,
    cooldown: 900,
    drawTime: 350,
    staminaCost: 16,
    coneCos: 0.82,
    buildingDamage: 8,
    canBlock: false
  },
  worker: {
    id: "tools",
    name: "Axe / Pickaxe",
    mode: "melee",
    damage: 10,
    range: 3.8,
    cooldown: 850,
    staminaCost: 12,
    coneCos: 0.35,
    buildingDamage: 10,
    canBlock: false
  },
  commander: {
    id: "sword_banner",
    name: "Sword + Banner",
    mode: "melee",
    damage: 18,
    range: 4.5,
    cooldown: 750,
    staminaCost: 16,
    coneCos: 0.4,
    windupMs: 140,
    activeMs: 150,
    buildingDamage: 14,
    canBlock: false
  }
};

export const EQUIPMENT_LOADOUTS = {
  infantry: [
    { id: "sword", displayName: "Sword", classRestrictions: ["infantry"], slot: 1, itemType: "melee", primaryAction: "melee", secondaryAction: "none", weaponKey: "infantry_sword" },
    { id: "shield", displayName: "Shield", classRestrictions: ["infantry"], slot: 2, itemType: "shield", primaryAction: "bash", secondaryAction: "block", weaponKey: "infantry_shield" }
  ],
  archer: [
    { id: "bow", displayName: "Bow", classRestrictions: ["archer"], slot: 1, itemType: "ranged", primaryAction: "bow", secondaryAction: "aim", weaponKey: "bow" }
  ],
  worker: [
    { id: "axe", displayName: "Axe", classRestrictions: ["worker"], slot: 1, itemType: "tool", primaryAction: "melee_gather", secondaryAction: "none", weaponKey: "worker_axe", gatherType: "wood" },
    { id: "pickaxe", displayName: "Pickaxe", classRestrictions: ["worker"], slot: 2, itemType: "tool", primaryAction: "melee_gather", secondaryAction: "none", weaponKey: "worker_pickaxe", gatherType: "stone" }
  ],
  commander: [
    { id: "commander_sword", displayName: "Sword", classRestrictions: ["commander"], slot: 1, itemType: "melee", primaryAction: "melee", secondaryAction: "none", weaponKey: "commander_sword" },
    { id: "wall_blueprint", displayName: "Wall Plan", classRestrictions: ["commander"], slot: 2, itemType: "blueprint", primaryAction: "build", secondaryAction: "rotate", buildType: "wooden_wall", cost: { wood: 10, stone: 0 } },
    { id: "rally_blueprint", displayName: "Rally Plan", classRestrictions: ["commander"], slot: 3, itemType: "blueprint", primaryAction: "build", secondaryAction: "rotate", buildType: "rally_flag", cost: { wood: 5, stone: 5 } }
  ]
};

export function loadoutForClass(cls) {
  return EQUIPMENT_LOADOUTS[cls] || EQUIPMENT_LOADOUTS.infantry;
}

export function itemForSlot(cls, slot) {
  return loadoutForClass(cls).find(it => it.slot === +slot) || null;
}

export function defaultEquipment(cls) {
  const item = loadoutForClass(cls)[0];
  return { equippedSlot: item?.slot || 1, equippedItem: item || null };
}

export const UNITS = {
  infantry: {
    name: "ทหารราบ",
    cost: 50,
    hp: 60,
    damage: 10,
    speed: 3.5,
    reqLevel: 1
  },
  archer: {
    name: "พลธนู",
    cost: 80,
    hp: 40,
    damage: 15,
    speed: 3.0,
    reqLevel: 3
  },
  cavalry: {
    name: "ม้าศึก",
    cost: 150,
    hp: 100,
    damage: 20,
    speed: 6.0,
    reqLevel: 5
  }
};

export const FACTIONS = {
  ironhold: {
    name: "Ironhold",
    color: 0x4a7da8,       // blue
    colorHex: "#4a7da8",
    spawn: { x: -80, z: 0 },
    desc: "ฝ่ายฟ้า — กำลังทหารแข็งแกร่ง"
  },
  verdant: {
    name: "Verdant",
    color: 0x4aa84a,       // green
    colorHex: "#4aa84a",
    spawn: { x: 80, z: 0 },
    desc: "ฝ่ายเขียว — ธรรมชาติยั่งยืน"
  }
};

export const WORLD = {
  W: 200,   // world width (3D units)
  D: 200,   // world depth
  BUILDINGS: 24,  // number of buildings in city
  SPAWN_POINTS: [
    { x: 0, z: 0 },
    { x: 80, z: 80 },
    { x: -80, z: 80 },
    { x: 80, z: -80 },
    { x: -80, z: -80 }
  ]
};

// Round config — config-driven for Phase 21 balance pass
export const ROUND_CONFIG = {
  scoreInterval: 10000,     // ms between score ticks
  scorePerTick: 10,         // points per tick for owning Central Fort
  winScore: 1000,           // first faction to this score wins
  roundResetDelay: 5000,   // ms countdown before new round
  initialScore: 0
};

// Capture point configuration — config-driven for Phase 6 scoring reuse
export const CAPTURE_POINTS = [
  {
    id: "central_fort",
    name: "Central Fort",
    x: 0,
    z: 0,
    radius: 15,          // capture radius in world units
    captureRate: 5,      // progress per second (reaches 100 in 20s with 1 player)
    owner: null,         // faction that currently owns it
    capturing: null,     // faction currently capturing
    progress: 0,          // 0-100, positive = toward capturing faction
    contested: false      // true when equal players from both factions inside
  }
];

// Resource node config — Phase 7 Worker resource loop
export const RESOURCE_CONFIG = {
  gatherCooldown: 800,   // ms between gather actions per player
  gatherAmount: 5,        // amount per gather
  carryCapacity: 30,      // max per resource type in player inventory
  nodeRegenAmount: 2,    // amount regenerated per regen tick
  nodeRegenInterval: 15000, // ms between node regen ticks
  depositRadius: 12,    // distance to warehouse to deposit
  gatherRadius: 6.5,       // distance to node to gather (Phase 9.9A: widened to match visible object size)
  depositReward: 3,      // coins per resource deposited
  initialFactionResources: { wood: 0, stone: 0 }
};

// Resource nodes: trees in North Forest (wood), rocks in South Quarry (stone)
export const RESOURCE_NODES = [
  // North Forest — trees (wood) at z < -40
  { id: "tree_1", type: "wood", x: -20, z: -60, amount: 50, maxAmount: 50 },
  { id: "tree_2", type: "wood", x: 0,   z: -65, amount: 50, maxAmount: 50 },
  { id: "tree_3", type: "wood", x: 20,  z: -60, amount: 50, maxAmount: 50 },
  { id: "tree_4", type: "wood", x: -10, z: -50, amount: 50, maxAmount: 50 },
  { id: "tree_5", type: "wood", x: 10,  z: -50, amount: 50, maxAmount: 50 },
  // South Quarry — rocks (stone) at z > 40
  { id: "rock_1", type: "stone", x: -20, z: 60, amount: 50, maxAmount: 50 },
  { id: "rock_2", type: "stone", x: 0,   z: 65, amount: 50, maxAmount: 50 },
  { id: "rock_3", type: "stone", x: 20,  z: 60, amount: 50, maxAmount: 50 },
  { id: "rock_4", type: "stone", x: -10, z: 50, amount: 50, maxAmount: 50 },
  { id: "rock_5", type: "stone", x: 10,  z: 50, amount: 50, maxAmount: 50 }
];

// Faction warehouses — near each base, for depositing resources
export const WAREHOUSES = {
  ironhold: { x: -85, z: 10, radius: 12 },
  verdant:  { x: 85,  z: 10, radius: 12 }
};

// Building config — Phase 8 Commander building
export const BUILDINGS = {
  wooden_wall: {
    name: "กำแพงไม้",
    nameEn: "Wooden Wall",
    cost: { wood: 10, stone: 0 },
    hp: 100,
    size: { w: 3, h: 3, d: 1 },
    buildDistance: 8,    // max distance from Commander to place
    buildCooldown: 500  // ms between builds
  },
  rally_flag: {
    name: "ธงรวมพล",
    nameEn: "Rally Flag",
    cost: { wood: 5, stone: 5 },
    hp: 80,
    size: { w: 1, h: 6, d: 1 },
    buildDistance: 8,
    buildCooldown: 1000,
    onePerFaction: true  // only one Rally Flag per faction
  }
};

export const MAP_BOUNDS = { minX: -95, maxX: 95, minZ: -95, maxZ: 95 };
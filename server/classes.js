// classes.js — อาชีพและทหาร
export const CLASSES = {
  soldier: {
    name: "ทหาร",
    hp: 120,
    speed: 5.5,
    damage: 15,
    income: 2,
    desc: "ฮึดสู้ ตีใกล้แข็งแรง เงินเก็บช้า"
  },
  merchant: {
    name: "พ่อค้า",
    hp: 80,
    speed: 5.0,
    damage: 8,
    income: 6,
    desc: "เก็บเงินเร็ว ซื้อทหารได้เยอะ แต่อ่อน"
  },
  engineer: {
    name: "ช่าง",
    hp: 100,
    speed: 5.2,
    damage: 10,
    income: 4,
    desc: "สร้างสิ่งก่อสร้างได้ กลางๆ"
  },
  commander: {
    name: "แม่ทัพ",
    hp: 150,
    speed: 4.8,
    damage: 12,
    income: 3,
    desc: "แข็งที่สุด บังคับทหารได้เยอะ แต่ช้า"
  }
};

export const WEAPONS = {
  rifle:  { dmg: 18, range: 80 },
  smg:    { dmg: 10, range: 50 },
  sniper: { dmg: 85, range: 160 },
  melee:  { dmg: 35, range: 5 }
};

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
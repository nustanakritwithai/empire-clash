// game.js — 3D FPS engine + controls + rendering
(function () {
  "use strict";

  // ===== GLOBAL STATE =====
  var G = {
    playerName: "player",
    playerClass: "infantry",
    player: { x: 0, y: 1.6, z: 0, hp: 100, maxHp: 100, gold: 100, level: 1, kills: 0, deaths: 0, speed: 5.5, damage: 15 },
    dead: false,
    blocking: false,
    scene: null, camera: null, renderer: null,
    buildings: [], remoteMeshes: new Map(), unitMeshes: new Map(),
    keys: {}, mouseLocked: false,
    yaw: 0, pitch: 0,
    velocity: null,
    // weapon system
    weaponIdx: 0,
    weapons: {
      rifle:  { mag: 30, reserve: 90,  reloading: false, reloadStart: 0 },
      smg:    { mag: 50, reserve: 150, reloading: false, reloadStart: 0 },
      sniper: { mag: 5,  reserve: 20,  reloading: false, reloadStart: 0 }
    },
    lastShoot: 0,
    currentRecoil: 0,
    hitMarker: 0,
    lastMelee: 0,
    meleeCooldown: 600, // ms between melee attacks
    meleeRange: 4.5, // world units
    meleeDamage: 35,
    meleeAnim: 0, // timestamp of last melee swing for animation
    zooming: false,
    baseFov: 75,
    zoomFov: 35,
    bullets: [],
    worldSize: 100
  };
  window.G = G;

  // ===== CLASSES (client-side, mirrors server) =====
  // Old ids: soldier -> infantry, merchant -> worker, engineer -> worker, commander -> commander
  var CLASS_COMPAT = { soldier: "infantry", merchant: "worker", engineer: "worker", commander: "commander" };
  var CLASSES = {
    infantry: { hp: 130, speed: 5.5, damage: 18, color: 0x4a7da8, name: "ทหารราบ" },
    archer:   { hp: 80,  speed: 5.2, damage: 15, color: 0x6fa84a, name: "พลธนู" },
    worker:   { hp: 100, speed: 5.0, damage: 8,  color: 0xe0a23c, name: "คนงาน" }, // TODO Phase 7: gathering
    commander:{ hp: 140, speed: 4.8, damage: 14, color: 0xc4452f, name: "แม่ทัพ" }  // TODO Phase 8: building
  };

  // ===== LEGACY GUNS (hidden/debug reference only after Phase 9) =====
  var WEAPONS = {
    rifle:  { name: "ไรเฟิล(debug)",   mag: 30, reserve: 90,  fireRate: 120, dmg: 18, range: 80,  spread: 0.018, recoil: 0.012, reloadTime: 1800, auto: true,  color: 0x8a8a8a, bulletSpeed: 100 },
    smg:    { name: "ปืนกลMT(debug)",  mag: 50, reserve: 150, fireRate: 70,  dmg: 10, range: 50,  spread: 0.038, recoil: 0.009, reloadTime: 1500, auto: true,  color: 0x6a6a8a, bulletSpeed: 90 },
    sniper: { name: "สไนเปอร์(debug)", mag: 5,  reserve: 20,  fireRate: 900, dmg: 85, range: 160, spread: 0.002, recoil: 0.055, reloadTime: 2600, auto: false, color: 0x3a3a3a, bulletSpeed: 200, zoomFov: 15 }
  };
  var WEAPON_KEYS = ["rifle", "smg", "sniper"];
  var CLASS_WEAPONS = {
    infantry: { name: "ดาบ+โล่", action: "คลิก=ฟัน | คลิกขวา=ยกโล่", range: 4.8, cooldown: 650, color: 0xd8d0b0, projectile: false },
    archer: { name: "ธนู", action: "คลิก=ยิงธนู", range: 85, cooldown: 900, color: 0x8b5a2b, projectile: true },
    worker: { name: "ขวาน/พลั่ว", action: "คลิก=ตีเบา | E=เก็บ/ฝาก", range: 3.8, cooldown: 850, color: 0xe0a23c, projectile: false },
    commander: { name: "ดาบ+ธง", action: "คลิก=ฟัน | B/G=สร้าง", range: 4.5, cooldown: 750, color: 0xc4452f, projectile: false }
  };

  function currentEquippedItem() {
    var loadout = (G.player && G.player.loadout) || [];
    var slot = (G.player && G.player.equippedSlot) || 1;
    var item = (G.player && G.player.equippedItem) || null;
    return item || loadout.find(function (it) { return it.slot === slot; }) || loadout[0] || { id: "sword", displayName: "Sword", slot: 1, itemType: "melee", primaryAction: "melee", secondaryAction: "none" };
  }

  var ITEM_LABELS = {
    sword: { name: "ดาบ", short: "ดาบ", icon: "⚔" },
    commander_sword: { name: "ดาบ", short: "ดาบ", icon: "⚔" },
    shield: { name: "โล่", short: "โล่", icon: "🛡" },
    bow: { name: "ธนู", short: "ธนู", icon: "🏹" },
    axe: { name: "ขวาน", short: "ขวาน", icon: "🪓" },
    pickaxe: { name: "พลั่ว", short: "พลั่ว", icon: "⛏" },
    wall_blueprint: { name: "แปลนกำแพง", short: "กำแพง", icon: "▦" },
    rally_blueprint: { name: "ธงรวมพล", short: "ธง", icon: "⚑" }
  };

  function itemThaiName(item) {
    var meta = item && ITEM_LABELS[item.id];
    return (meta && meta.name) || (item && (item.displayName || item.id)) || "-";
  }

  function itemShortLabel(item) {
    var meta = item && ITEM_LABELS[item.id];
    if (!item) return { icon: "", text: "-" };
    return { icon: (meta && meta.icon) || "•", text: (meta && meta.short) || (item.displayName || item.id || "?") };
  }

  function itemActionHint(item) {
    if (!item) return "เลือกของจาก hotbar";
    if (item.id === "shield") return "คลิก=กระแทก | คลิกขวา/รอง=ยกโล่";
    if (item.id === "bow") return "ยิง/คลิก: ยิง | เล็ง: ง้างธนู";
    if (item.id === "axe") return "ใช้/E: เก็บไม้ | ยิง/คลิก: ตี";
    if (item.id === "pickaxe") return "ใช้/E: เก็บหิน | ยิง/คลิก: ตี";
    if (item.id === "wall_blueprint") return "ยิง/คลิก: วางกำแพง";
    if (item.id === "rally_blueprint") return "ยิง/คลิก: วางธง";
    if (item.id === "sword" || item.id === "commander_sword") return "ยิง/คลิก: ฟัน";
    return "คลิก=โจมตี";
  }

  function currentClassWeapon() {
    var item = currentEquippedItem();
    var labels = {
      sword: { name: "ดาบ", action: itemActionHint(item), color: 0xd8d0b0, projectile: false, range: 4.8, cooldown: 650 },
      shield: { name: "โล่", action: itemActionHint(item), color: 0x777766, projectile: false, range: 3.2, cooldown: 800 },
      bow: { name: "ธนู", action: itemActionHint(item), color: 0x8b5a2b, projectile: true, range: 85, cooldown: 900 },
      axe: { name: "ขวาน", action: itemActionHint(item), color: 0xe0a23c, projectile: false, range: 3.8, cooldown: 850 },
      pickaxe: { name: "พลั่ว", action: itemActionHint(item), color: 0x9aa0a6, projectile: false, range: 3.8, cooldown: 850 },
      commander_sword: { name: "ดาบ", action: itemActionHint(item), color: 0xc4452f, projectile: false, range: 4.5, cooldown: 750 },
      wall_blueprint: { name: "แปลนกำแพง", action: itemActionHint(item), color: 0x8b6b3f, projectile: false, range: 8, cooldown: 500 },
      rally_blueprint: { name: "ธงรวมพล", action: itemActionHint(item), color: 0xc4452f, projectile: false, range: 8, cooldown: 1000 }
    };
    return labels[item.id] || { name: item.displayName || "Item", action: item.primaryAction || "ใช้", color: 0xeeeeee, projectile: false };
  }

  function selectSlot(slot) {
    if (!slot || slot < 1 || slot > 5) return;
    if (typeof netSend === "function") netSend({ t: "selectItem", slot: slot });
    var local = ((G.player && G.player.loadout) || []).find(function (it) { return it.slot === slot; });
    if (local) G.player.equippedItem = local;
    G.player.equippedSlot = slot;
    updateHotbar();
    updateHeldModel();
    updateAmmoDisplay();
    if (typeof toast === "function" && local) toast("ถือ: " + itemThaiName(local));
  }

  function updateHotbar() {
    var bar = document.getElementById("hotbar");
    var label = document.getElementById("equippedLabel");
    if (!bar || !label) return;
    var loadout = (G.player && G.player.loadout) || [];
    var item = currentEquippedItem();
    if (!loadout.length) { bar.style.display = "none"; label.style.display = "none"; return; }
    bar.style.display = "flex";
    label.style.display = "block";
    label.textContent = "ถือ: " + itemThaiName(item);
    bar.innerHTML = "";
    for (var i = 1; i <= 5; i++) {
      var it = loadout.find(function (x) { return x.slot === i; });
      var b = document.createElement("div");
      b.dataset.slot = i;
      var selected = item && it && item.slot === it.slot;
      var short = itemShortLabel(it);
      b.style.cssText = "width:42px;height:42px;padding:2px 3px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:" + (it ? "pointer" : "default") + ";background:" + (selected ? "linear-gradient(180deg,rgba(255,210,122,.96),rgba(210,122,32,.92))" : "rgba(15,18,28,.78)") + ";border:" + (selected ? "2px solid #fff2b0" : "1px solid rgba(255,255,255,.22)") + ";color:" + (selected ? "#201205" : "#eee") + ";font-size:10px;text-align:center;box-shadow:" + (selected ? "0 0 0 2px rgba(224,162,60,.28),0 0 14px rgba(255,210,122,.42)" : "0 2px 8px rgba(0,0,0,.35)") + ";touch-action:manipulation;user-select:none";
      b.innerHTML = "<b style='font-size:10px;line-height:10px'>" + i + "</b><span style='font-size:14px;line-height:15px'>" + (it ? short.icon : "·") + "</span><span style='font-size:8px;line-height:9px;max-width:38px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + (it ? short.text : "-") + "</span>";
      if (it) {
        b.title = "ถือ: " + itemThaiName(it);
        b.addEventListener("click", (function (slot) { return function () { selectSlot(slot); }; })(i));
        b.addEventListener("touchstart", (function (slot) { return function (e) { e.preventDefault(); selectSlot(slot); }; })(i), { passive: false });
      }
      bar.appendChild(b);
    }
  }
  window.updateHotbar = updateHotbar;

  function updateHeldModel() {
    if (!G.gunGroup || typeof THREE === "undefined") return;
    var item = currentEquippedItem();
    var w = currentClassWeapon();
    while (G.gunGroup.children.length) G.gunGroup.remove(G.gunGroup.children[0]);
    function mat(color) { return new THREE.MeshLambertMaterial({ color: color }); }
    function box(x, y, z, color, px, py, pz) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat(color));
      m.position.set(px || 0, py || 0, pz || 0);
      G.gunGroup.add(m);
      return m;
    }
    function cyl(r, h, color, px, py, pz, rx) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), mat(color));
      m.rotation.x = rx || 0;
      m.position.set(px || 0, py || 0, pz || 0);
      G.gunGroup.add(m);
      return m;
    }
    if (item.id === "shield") {
      box(0.48, 0.58, 0.08, 0x777766, 0.1, 0.0, -0.38);
      box(0.12, 0.14, 0.12, 0x3a2a1a, 0.1, -0.24, -0.24);
    } else if (item.id === "bow") {
      var bow = cyl(0.035, 0.95, 0x8b5a2b, 0.05, 0, -0.38, 0);
      bow.rotation.z = 0.28;
      box(0.02, 0.82, 0.02, 0xd8d0b0, 0.18, 0, -0.38);
    } else if (item.id === "axe") {
      cyl(0.035, 0.72, 0x6b4423, 0, -0.05, -0.32, 0.15);
      box(0.34, 0.18, 0.08, 0xb8b8aa, 0.12, 0.28, -0.55);
    } else if (item.id === "pickaxe") {
      cyl(0.035, 0.72, 0x6b4423, 0, -0.05, -0.32, 0.15);
      box(0.48, 0.08, 0.08, 0x9aa0a6, 0.03, 0.3, -0.55);
    } else if (item.id === "wall_blueprint") {
      box(0.48, 0.34, 0.04, 0x8b6b3f, 0.05, 0.02, -0.38);
      box(0.34, 0.04, 0.05, 0xd8d0b0, 0.05, 0.03, -0.34);
    } else if (item.id === "rally_blueprint") {
      cyl(0.025, 0.78, 0x6b4423, -0.06, -0.02, -0.36, 0);
      box(0.34, 0.22, 0.04, 0xc4452f, 0.09, 0.22, -0.36);
    } else {
      box(0.1, 0.12, 0.88, w.color, 0, 0.02, -0.42);
      box(0.04, 0.04, 0.26, 0xf0f0d0, 0, 0.02, -0.92);
    }
    box(0.1, 0.22, 0.12, 0x3a2a1a, 0, -0.22, -0.08);
    if (G.muzzleFlash) G.gunGroup.add(G.muzzleFlash);
    G.gunGroup.position.set(0.45, -0.35, -0.7);
  }

  // ===== INIT =====
  function init() {
    if (typeof THREE === "undefined") {
      console.error("THREE.js not loaded yet!");
      alert("Three.js ยังไม่โหลด กรุณารีเฟรชหน้า");
      return;
    }
    G.velocity = new THREE.Vector3();
    G.scene = new THREE.Scene();
    G.scene.background = new THREE.Color(0x87ceeb);
    G.scene.fog = new THREE.Fog(0x87ceeb, 50, 150);

    G.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    G.renderer = new THREE.WebGLRenderer({ antialias: true });
    G.renderer.setSize(window.innerWidth, window.innerHeight);
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(G.renderer.domElement);

    // lights
    G.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    var dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(50, 80, 30);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.left = -100;
    dir.shadow.camera.right = 100;
    dir.shadow.camera.top = 100;
    dir.shadow.camera.bottom = -100;
    G.scene.add(dir);
    G.renderer.shadowMap.enabled = true;

    // ground
    var groundGeo = new THREE.PlaneGeometry(200, 200);
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x3a6d3a });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    G.scene.add(ground);

    // roads
    var roadMat = new THREE.MeshLambertMaterial({ color: 0x6a6a6a });
    for (var i = -1; i <= 1; i++) {
      var road1 = new THREE.Mesh(new THREE.PlaneGeometry(200, 8), roadMat);
      road1.rotation.x = -Math.PI / 2;
      road1.position.set(0, 0.1, i * 40);
      G.scene.add(road1);
      var road2 = new THREE.Mesh(new THREE.PlaneGeometry(8, 200), roadMat);
      road2.rotation.x = -Math.PI / 2;
      road2.position.set(i * 40, 0.1, 0);
      G.scene.add(road2);
    }

    // buildings — low poly boxes
    var buildingColors = [0x8a7a6a, 0x9a8a7a, 0x7a6a5a, 0x6a5a4a, 0xb0a090];
    for (var b = 0; b < 24; b++) {
      var bw = 8 + Math.random() * 12;
      var bh = 6 + Math.random() * 20;
      var bd = 8 + Math.random() * 12;
      var bx = (Math.random() - 0.5) * 170;
      var bz = (Math.random() - 0.5) * 170;
      // keep buildings off roads
      if (Math.abs(bx) < 10 || Math.abs(bz) < 10) { bx += 15; bz += 15; }
      var bMat = new THREE.MeshLambertMaterial({ color: buildingColors[b % buildingColors.length] });
      var bMesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bMat);
      bMesh.position.set(bx, bh / 2, bz);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      G.scene.add(bMesh);
      G.buildings.push({ x: bx, z: bz, w: bw, d: bd, h: bh, mesh: bMesh });
      // roof
      var roofMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
      var roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(bw, bd) * 0.7, 3, 4), roofMat);
      roof.position.set(bx, bh + 1.5, bz);
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      G.scene.add(roof);
    }

    // boundary walls
    var wallMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
    var wallGeo = new THREE.BoxGeometry(200, 6, 1);
    for (var s = 0; s < 4; s++) {
      var wall = new THREE.Mesh(wallGeo, wallMat);
      wall.castShadow = true;
      if (s === 0) wall.position.set(0, 3, 100);
      else if (s === 1) wall.position.set(0, 3, -100);
      else if (s === 2) { wall.rotation.y = Math.PI / 2; wall.position.set(100, 3, 0); }
      else { wall.rotation.y = Math.PI / 2; wall.position.set(-100, 3, 0); }
      G.scene.add(wall);
    }

    // ===== CAPTURE POINT: Central Fort flag at world center =====
    G.captureFlags = {}; // id -> {pole, flag, ring}
    var cpPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a8a8a })
    );
    cpPole.position.set(0, 4, 0);
    cpPole.castShadow = true;
    G.scene.add(cpPole);

    var cpFlag = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 2),
      new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide })
    );
    cpFlag.position.set(1.5, 6.5, 0);
    G.scene.add(cpFlag);

    // capture radius ring on ground
    var ringGeo = new THREE.RingGeometry(14.5, 15, 32);
    var ringMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.4 });
    var cpRing = new THREE.Mesh(ringGeo, ringMat);
    cpRing.rotation.x = -Math.PI / 2;
    cpRing.position.set(0, 0.2, 0);
    G.scene.add(cpRing);

    G.captureFlags["central_fort"] = { pole: cpPole, flag: cpFlag, ring: cpRing };

    // ===== RESOURCE NODES: trees (North Forest) + rocks (South Quarry) =====
    G.resourceMeshes = {}; // id -> mesh
    // trees
    for (var ti = 0; ti < 5; ti++) {
      var tx = [-20, 0, 20, -10, 10][ti];
      var tz = [-60, -65, -60, -50, -50][ti];
      // trunk
      var trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 3, 6),
        new THREE.MeshLambertMaterial({ color: 0x6b4423 })
      );
      trunk.position.set(tx, 1.5, tz);
      trunk.castShadow = true;
      G.scene.add(trunk);
      // foliage (cone)
      var foliage = new THREE.Mesh(
        new THREE.ConeGeometry(2, 4, 6),
        new THREE.MeshLambertMaterial({ color: 0x2d6b2d })
      );
      foliage.position.set(tx, 4.5, tz);
      foliage.castShadow = true;
      G.scene.add(foliage);
      G.resourceMeshes["tree_" + (ti + 1)] = { trunk: trunk, foliage: foliage };
    }
    // rocks
    for (var ri = 0; ri < 5; ri++) {
      var rx = [-20, 0, 20, -10, 10][ri];
      var rz = [60, 65, 60, 50, 50][ri];
      var rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.5, 0),
        new THREE.MeshLambertMaterial({ color: 0x888888 })
      );
      rock.position.set(rx, 1, rz);
      rock.castShadow = true;
      G.scene.add(rock);
      G.resourceMeshes["rock_" + (ri + 1)] = { mesh: rock };
    }

    // ===== WAREHOUSES (faction-colored buildings at each base) =====
    G.warehouseMeshes = {};
    // Ironhold warehouse (left, blue roof)
    var wh1Base = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4, 6),
      new THREE.MeshLambertMaterial({ color: 0x555555 })
    );
    wh1Base.position.set(-85, 2, 10);
    wh1Base.castShadow = true;
    G.scene.add(wh1Base);
    var wh1Roof = new THREE.Mesh(
      new THREE.ConeGeometry(5, 2, 4),
      new THREE.MeshLambertMaterial({ color: 0x4a7da8 })
    );
    wh1Roof.position.set(-85, 5, 10);
    G.scene.add(wh1Roof);
    G.warehouseMeshes["ironhold"] = { base: wh1Base, roof: wh1Roof };

    // Verdant warehouse (right, green roof)
    var wh2Base = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4, 6),
      new THREE.MeshLambertMaterial({ color: 0x555555 })
    );
    wh2Base.position.set(85, 2, 10);
    wh2Base.castShadow = true;
    G.scene.add(wh2Base);
    var wh2Roof = new THREE.Mesh(
      new THREE.ConeGeometry(5, 2, 4),
      new THREE.MeshLambertMaterial({ color: 0x4aa84a })
    );
    wh2Roof.position.set(85, 5, 10);
    G.scene.add(wh2Roof);
    G.warehouseMeshes["verdant"] = { base: wh2Base, roof: wh2Roof };

    // player stats already set by class select, just set position
    G.camera.position.set(G.player.x, G.player.y, G.player.z);

    // ===== LOCAL PLAYER MESH (for 3rd person) =====
    var pColor = CLASSES[G.playerClass] ? CLASSES[G.playerClass].color : 0x4a7da8;
    G.playerMesh = new THREE.Group();
    // body
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 1.2, 8),
      new THREE.MeshLambertMaterial({ color: pColor })
    );
    body.position.y = 0.8;
    body.castShadow = true;
    G.playerMesh.add(body);
    // head
    var head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xefc79d })
    );
    head.position.y = 1.6;
    head.castShadow = true;
    G.playerMesh.add(head);
    // simple class weapon placeholder (box) pointing forward
    var gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.6),
      new THREE.MeshLambertMaterial({ color: currentClassWeapon().color })
    );
    gun.position.set(0.3, 1.0, -0.3);
    G.playerMesh.add(gun);
    G.playerMesh.visible = false; // hidden in 1st person
    G.scene.add(G.playerMesh);

    // camera mode: 1st or 3rd person
    G.cameraMode = "first"; // "first" or "third"
    G.cameraDistance = 4.5;

    // ===== CLASS WEAPON MODEL (attached to camera for 1st person) =====
    G.gunGroup = new THREE.Group();
    // sword/bow/tool shaft
    var gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(G.playerClass === "archer" ? 0.08 : 0.12, 0.12, 0.8),
      new THREE.MeshLambertMaterial({ color: currentClassWeapon().color })
    );
    gunBody.position.set(0, 0, -0.3);
    G.gunGroup.add(gunBody);
    // barrel
    var barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.7);
    G.gunGroup.add(barrel);
    // grip
    var grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.25, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x3a2a1a })
    );
    grip.position.set(0, -0.18, -0.1);
    G.gunGroup.add(grip);
    if (G.playerClass === "infantry") {
      var shield = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.5, 0.06),
        new THREE.MeshLambertMaterial({ color: 0x777766 })
      );
      shield.position.set(-0.28, -0.02, -0.35);
      G.gunGroup.add(shield);
    }
    updateHeldModel();
    // muzzle/arrow flash placeholder (hidden by default)
    var flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 });
    G.muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), flashMat);
    G.muzzleFlash.position.set(0, 0, -0.9);
    G.gunGroup.add(G.muzzleFlash);
    // position gun at bottom-right of view
    G.gunGroup.position.set(0.35, -0.3, -0.5);
    G.camera.add(G.gunGroup);
    G.scene.add(G.camera);

    // bullet system
    G.bullets = [];
    G.impacts = [];

    // events
    window.addEventListener("keydown", function (e) { G.keys[e.code] = true; });
    window.addEventListener("keyup", function (e) { G.keys[e.code] = false; });
    document.addEventListener("mousemove", function (e) {
      if (!G.mouseLocked) return;
      var sens = G.zooming ? 0.001 : 0.002;
      G.yaw -= e.movementX * sens;
      G.pitch -= e.movementY * sens;
      G.pitch = Math.max(-1.5, Math.min(1.5, G.pitch));
    });
    document.addEventListener("click", function () {
      if (!G.mouseLocked) {
        G.renderer.domElement.requestPointerLock();
        return;
      }
      shoot();
    });
    function useSecondaryAction(hold) {
      var item = currentEquippedItem();
      if (item.secondaryAction === "block") {
        G.blocking = !!hold;
        netSend({ t: "block", active: !!hold });
        updateAmmoDisplay();
      } else if (item.secondaryAction === "aim") {
        if (hold && !G.zooming) toggleZoom();
        if (!hold && G.zooming) toggleZoom();
      } else if (item.itemType === "blueprint" && hold) {
        toast("รอง: หมุน/ยกเลิกแบบก่อสร้าง");
      }
    }
    document.addEventListener("mousedown", function (e) {
      if (e.button === 2 && G.mouseLocked) useSecondaryAction(true);
    });
    document.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      if (G.mouseLocked) useSecondaryAction(true);
    });
    document.addEventListener("mouseup", function (e) {
      if (e.button === 2) useSecondaryAction(false);
    });
    document.addEventListener("pointerlockchange", function () {
      G.mouseLocked = (document.pointerLockElement === G.renderer.domElement);
    });
    window.addEventListener("resize", function () {
      G.camera.aspect = window.innerWidth / window.innerHeight;
      G.camera.updateProjectionMatrix();
      G.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // shop buttons
    document.querySelectorAll(".shopBtn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        netSend({ t: "buyUnit", unit: btn.dataset.unit });
      });
    });

    // Phase 9.6+: no floating legacy camera/layout buttons; use V for camera and hotbar for actions.

    // keyboard hotkey V camera, F/Q alternate class attack. Legacy gun switch/reload hidden after Phase 9.
    window.addEventListener("keydown", function (e) {
      if (e.code === "KeyV") toggleCamera();
      if (e.code === "Digit1") selectSlot(1);
      if (e.code === "Digit2") selectSlot(2);
      if (e.code === "Digit3") selectSlot(3);
      if (e.code === "Digit4") selectSlot(4);
      if (e.code === "Digit5") selectSlot(5);
      if (e.code === "KeyF" || e.code === "KeyQ") melee();
      if (e.code === "KeyE") tryInteract();
      if (e.code === "KeyH") tryAttackBuilding();
    });
    window.addEventListener("wheel", function (e) {
      var loadout = (G.player && G.player.loadout) || [];
      if (!loadout.length) return;
      var idx = loadout.findIndex(function (it) { return it.slot === G.player.equippedSlot; });
      idx = idx < 0 ? 0 : idx;
      idx = (idx + (e.deltaY > 0 ? 1 : -1) + loadout.length) % loadout.length;
      selectSlot(loadout[idx].slot);
    }, { passive: true });

    // ===== TOUCH CONTROLS =====
    initTouchControls();

    animate();
  }

  function applyMobileHotbarLayout() {
    var hotbar = document.getElementById("hotbar");
    var label = document.getElementById("equippedLabel");
    var prompt = document.getElementById("interactPrompt");
    var resource = document.getElementById("resourceHud");
    var action = document.getElementById("actionDisplay");
    if (hotbar) hotbar.style.bottom = "150px";
    if (label) label.style.bottom = "210px";
    if (prompt) prompt.style.bottom = "248px";
    if (resource) resource.style.bottom = "330px";
    if (action) action.style.bottom = "330px";
  }

  // ===== TOUCH CONTROLS (mobile) =====
  function initTouchControls() {
    G.touch = {
      joyActive: false, joyX: 0, joyY: 0, joyId: null,
      joyOriginX: 0, joyOriginY: 0,
      lookId: null, lookX: 0, lookY: 0,
      shooting: false, reloading: false,
      crouching: false, prone: false,
      jumpTriggered: false,
      sprinting: false
    };
    var isMobile = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    if (!isMobile) return;
    applyMobileHotbarLayout();

    var W = window.innerWidth;
    var H = window.innerHeight;
    var moveW = Math.min(W * 0.56, 250);
    var moveH = Math.min(H * 0.46, 330);

    // === PHASE 9.8 MOBILE LAYOUT ===
    // lower-left: large dynamic movement zone, floating joystick origin
    // bottom-center: hotbar
    // lower-right: Fire / Aim / Jump / Action cluster
    // upper-right: crouch, below minimap/capture-safe lane

    var moveZone = document.createElement("div");
    moveZone.id = "moveZone";
    moveZone.style.cssText = "position:fixed;left:0;bottom:0;width:" + moveW + "px;height:" + moveH + "px;z-index:6;touch-action:none;background:rgba(255,255,255,0.015);border-top-right-radius:28px";
    document.body.appendChild(moveZone);

    var joy = document.createElement("div");
    joy.id = "touchJoy";
    joy.style.cssText = "position:fixed;left:28px;bottom:26px;width:116px;height:116px;border-radius:50%;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.22);z-index:20;touch-action:none;pointer-events:none;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(0,0,0,.32)";
    var nub = document.createElement("div");
    nub.id = "touchNub";
    nub.style.cssText = "position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,0.28);border:1px solid rgba(255,255,255,0.46)";
    joy.appendChild(nub);
    document.body.appendChild(joy);

    function makeBtn(id, text, css) {
      var b = document.createElement("div");
      b.id = id;
      b.textContent = text;
      b.style.cssText = css + ";position:fixed;z-index:24;display:flex;align-items:center;justify-content:center;color:#fff;font-family:monospace;touch-action:none;user-select:none;text-align:center;box-shadow:0 3px 12px rgba(0,0,0,.35)";
      document.body.appendChild(b);
      return b;
    }

    var fireBtn = makeBtn("touchFire", "ยิง", "right:14px;bottom:86px;width:58px;height:58px;border-radius:50%;background:rgba(196,69,47,0.74);border:2px solid rgba(255,255,255,0.38);font-size:14px");
    var fireTopBtn = makeBtn("touchFireTop", "ยิง", "left:14px;top:86px;width:58px;height:58px;border-radius:50%;background:rgba(196,69,47,0.66);border:2px solid rgba(255,255,255,0.34);font-size:14px");
    var aimBtn = makeBtn("touchAim", "เล็ง", "right:82px;bottom:86px;width:58px;height:58px;border-radius:50%;background:rgba(74,125,168,0.62);border:2px solid rgba(255,255,255,0.30);font-size:13px");
    var jumpBtn = makeBtn("touchJump", "โดด", "right:14px;bottom:18px;width:58px;height:58px;border-radius:50%;background:rgba(74,157,74,0.66);border:2px solid rgba(255,255,255,0.32);font-size:13px");
    var actionBtn = makeBtn("touchAction", "ใช้", "right:82px;bottom:18px;width:58px;height:58px;border-radius:50%;background:rgba(224,162,60,0.38);border:2px solid rgba(255,210,122,0.25);font-size:13px;opacity:.55");
    var crouchBtn = makeBtn("touchCrouch", "ย่อ", "right:14px;top:136px;width:66px;height:44px;border-radius:14px;background:rgba(74,125,168,0.58);border:2px solid rgba(255,255,255,0.28);font-size:12px");

    G.mobileActionBtn = actionBtn;

    function setBtnActive(btn, active, normal, activeColor) {
      btn.style.background = active ? activeColor : normal;
    }

    function resetJoystick() {
      G.touch.joyActive = false;
      G.touch.joyId = null;
      G.touch.joyX = 0;
      G.touch.joyY = 0;
      G.touch.sprinting = false;
      nub.style.left = "50%";
      nub.style.top = "50%";
      joy.style.borderColor = "rgba(255,255,255,0.22)";
      joy.style.left = "28px";
      joy.style.top = "auto";
      joy.style.bottom = "26px";
    }

    function beginJoystick(t) {
      G.touch.joyActive = true;
      G.touch.joyId = t.identifier;
      G.touch.joyOriginX = t.clientX;
      G.touch.joyOriginY = t.clientY;
      joy.style.left = (t.clientX - 58) + "px";
      joy.style.top = (t.clientY - 58) + "px";
      joy.style.bottom = "auto";
      updateJoystick(t.clientX, t.clientY);
    }

    function updateJoystick(tx, ty) {
      var maxR = 58;
      var dx = tx - G.touch.joyOriginX;
      var dy = ty - G.touch.joyOriginY;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxR) { dx = (dx / d) * maxR; dy = (dy / d) * maxR; }
      G.touch.joyX = dx / maxR;
      G.touch.joyY = dy / maxR;
      G.touch.sprinting = G.touch.joyY < -0.78;
      nub.style.left = (50 + (dx / maxR) * 40) + "%";
      nub.style.top = (50 + (dy / maxR) * 40) + "%";
      joy.style.borderColor = G.touch.sprinting ? "rgba(74,255,120,0.85)" : "rgba(255,255,255,0.22)";
    }

    moveZone.addEventListener("touchstart", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      if (G.touch.joyActive) return;
      beginJoystick(e.changedTouches[0]);
    }, { passive: false });

    moveZone.addEventListener("touchmove", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === G.touch.joyId) updateJoystick(t.clientX, t.clientY);
      }
    }, { passive: false });

    moveZone.addEventListener("touchend", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === G.touch.joyId) resetJoystick();
      }
    }, { passive: false });
    moveZone.addEventListener("touchcancel", function (e) { resetJoystick(); }, { passive: false });

    function useMobilePrimary(activeBtn) {
      G.touch.shooting = true;
      shoot();
      var btn = activeBtn || fireBtn;
      var normal = btn === fireTopBtn ? "rgba(196,69,47,0.66)" : "rgba(196,69,47,0.74)";
      setBtnActive(btn, true, normal, "rgba(196,69,47,0.95)");
      setTimeout(function () { setBtnActive(btn, false, normal, "rgba(196,69,47,0.95)"); }, 110);
    }

    function mobileSecondary(hold) {
      var item = currentEquippedItem();
      if (item.secondaryAction === "block") {
        G.blocking = !!hold;
        netSend({ t: "block", active: !!hold });
        setBtnActive(aimBtn, !!hold, "rgba(74,125,168,0.62)", "rgba(74,157,74,0.86)");
        updateAmmoDisplay();
      } else if (item.secondaryAction === "aim") {
        if (hold && !G.zooming) toggleZoom();
        if (!hold && G.zooming) toggleZoom();
        setBtnActive(aimBtn, !!hold, "rgba(74,125,168,0.62)", "rgba(74,157,74,0.86)");
      } else if (item.itemType === "blueprint" && hold) {
        toast("รอง: หมุน/ยกเลิกแบบก่อสร้าง");
      } else if (hold) {
        toast("ไม่มีใช้รอง");
      }
    }

    fireBtn.addEventListener("touchstart", function (e) { if (layoutMode) return; e.preventDefault(); useMobilePrimary(fireBtn); }, { passive: false });
    fireBtn.addEventListener("touchend", function (e) { e.preventDefault(); G.touch.shooting = false; }, { passive: false });
    fireTopBtn.addEventListener("touchstart", function (e) { if (layoutMode) return; e.preventDefault(); useMobilePrimary(fireTopBtn); }, { passive: false });
    fireTopBtn.addEventListener("touchend", function (e) { e.preventDefault(); G.touch.shooting = false; }, { passive: false });

    aimBtn.addEventListener("touchstart", function (e) { if (layoutMode) return; e.preventDefault(); mobileSecondary(true); }, { passive: false });
    aimBtn.addEventListener("touchend", function (e) { if (layoutMode) return; e.preventDefault(); mobileSecondary(false); }, { passive: false });
    aimBtn.addEventListener("touchcancel", function (e) { mobileSecondary(false); }, { passive: false });

    jumpBtn.addEventListener("touchstart", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      G.touch.jumpTriggered = true;
      setBtnActive(jumpBtn, true, "rgba(74,157,74,0.66)", "rgba(74,200,100,0.92)");
      setTimeout(function () { setBtnActive(jumpBtn, false, "rgba(74,157,74,0.66)", "rgba(74,200,100,0.92)"); }, 120);
    }, { passive: false });

    actionBtn.addEventListener("touchstart", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      if (actionBtn.dataset.enabled === "1") {
        tryInteract();
        setBtnActive(actionBtn, true, "rgba(224,162,60,0.70)", "rgba(224,162,60,0.95)");
        setTimeout(function () { updateMobileActionButton(); }, 120);
      } else {
        toast("ยังไม่มีอะไรให้ใช้");
      }
    }, { passive: false });

    var crouchState = 0; // 0 stand, 1 crouch, 2 prone
    function updateCrouchButton() {
      crouchBtn.textContent = crouchState === 0 ? "ย่อ" : (crouchState === 1 ? "หมอบ" : "ยืน");
      crouchBtn.style.background = crouchState === 0 ? "rgba(74,125,168,0.58)" : (crouchState === 1 ? "rgba(224,162,60,0.72)" : "rgba(120,74,168,0.78)");
    }
    crouchBtn.addEventListener("touchstart", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      crouchState = (crouchState + 1) % 3;
      G.touch.crouching = crouchState === 1;
      G.touch.prone = crouchState === 2;
      updateCrouchButton();
    }, { passive: false });
    updateCrouchButton();

    // Invisible look zone: drag anywhere on the right half except buttons to look.
    var lookZone = document.createElement("div");
    lookZone.id = "lookZone";
    lookZone.style.cssText = "position:fixed;right:0;bottom:0;width:" + (W / 2) + "px;height:" + H + "px;z-index:5;touch-action:none";
    document.body.appendChild(lookZone);
    lookZone.addEventListener("touchstart", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (G.touch.lookId === null) { G.touch.lookId = t.identifier; G.touch.lookX = t.clientX; G.touch.lookY = t.clientY; }
      }
    }, { passive: false });
    lookZone.addEventListener("touchmove", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === G.touch.lookId) {
          var dx = t.clientX - G.touch.lookX;
          var dy = t.clientY - G.touch.lookY;
          var lookSens = G.zooming ? 0.0025 : 0.005;
          G.yaw -= dx * lookSens;
          G.pitch -= dy * lookSens;
          G.pitch = Math.max(-1.5, Math.min(1.5, G.pitch));
          G.touch.lookX = t.clientX;
          G.touch.lookY = t.clientY;
        }
      }
    }, { passive: false });
    lookZone.addEventListener("touchend", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === G.touch.lookId) G.touch.lookId = null;
    }, { passive: false });

    setInterval(function () {
      if (!G.mobileActionBtn) return;
      updateMobileActionButton();
      var item = currentEquippedItem();
      aimBtn.textContent = item.secondaryAction === "block" ? "โล่" : (item.secondaryAction === "aim" ? "เล็ง" : "รอง");
    }, 300);

    var ch = document.getElementById("crosshair");
    if (ch) ch.style.display = "block";
    var ctrl = document.getElementById("controls");
    if (ctrl) ctrl.textContent = "ซ้ายล่าง: จอยลอย | ซ้ายบน: ยิงสำรอง | ดันขึ้นแรง=วิ่ง | ขวาล่าง: ยิง/เล็ง/โดด/ใช้ | ขวาบน: ย่อ/หมอบ | Hotbar: เปลี่ยนของ";
  }

  // ===== LAYOUT EDIT MODE =====
  var layoutMode = false;
  var layoutBtns = []; // {el, id, x, y, w, h}
  var LAYOUT_KEY = "empire_clash_layout";

  function saveLayout() {
    var data = {};
    layoutBtns.forEach(function (b) {
      data[b.id] = { x: b.x, y: b.y, w: b.w, h: b.h };
    });
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function loadLayout() {
    try {
      var raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function registerLayoutBtn(el, id) {
    var rect = el.getBoundingClientRect();
    var stored = loadLayout();
    var s = stored && stored[id] ? stored[id] : null;
    var x = s ? s.x : rect.left;
    var y = s ? s.y : rect.top;
    var w = s ? s.w : rect.width;
    var h = s ? s.h : rect.height;
    applyBtnPos(el, x, y, w, h);
    layoutBtns.push({ el: el, id: id, x: x, y: y, w: w, h: h });
  }

  function applyBtnPos(el, x, y, w, h) {
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.width = w + "px";
    el.style.height = h + "px";
  }

  function toggleLayoutMode() {
    layoutMode = !layoutMode;
    var btn = document.getElementById("layoutToggle");
    if (layoutMode) {
      btn.textContent = "บันทึก";
      btn.style.background = "rgba(74,157,74,0.8)";
      // enable drag + resize on all buttons
      layoutBtns.forEach(function (b) {
        b.el.style.border = "2px dashed rgba(255,255,255,0.6)";
        b.el.style.opacity = "0.8";
        enableDrag(b);
      });
      // show help
      if (!window._layoutHelp) {
        var help = document.createElement("div");
        help.id = "layoutHelp";
        help.style.cssText = "position:fixed;left:50%;top:45px;transform:translateX(-50%);background:rgba(0,0,0,0.8);padding:8px 14px;border-radius:4px;font-size:10px;color:#eee;z-index:30;text-align:center;font-family:monospace";
        help.innerHTML = "ลากเพื่อย้าย | แตะที่มุมขวาล่างเพื่อย่อ/ขยาย<br>กด บันทึก เพื่อเสร็จ";
        document.body.appendChild(help);
        window._layoutHelp = help;
      }
      window._layoutHelp.style.display = "block";
    } else {
      btn.textContent = "บันทึกตำแหน่ง";
      btn.style.background = "rgba(0,0,0,0.6)";
      // disable + save
      layoutBtns.forEach(function (b) {
        b.el.style.border = "";
        b.el.style.opacity = "";
        disableDrag(b);
        var rect = b.el.getBoundingClientRect();
        b.x = rect.left; b.y = rect.top; b.w = rect.width; b.h = rect.height;
      });
      saveLayout();
      if (window._layoutHelp) window._layoutHelp.style.display = "none";
    }
  }

  function enableDrag(b) {
    var el = b.el;
    var dragId = null, resizeId = null;
    var startX, startY, startBX, startBY, startBW, startBH;

    // resize handle (bottom-right corner)
    var handle = document.createElement("div");
    handle.style.cssText = "position:absolute;right:-6px;bottom:-6px;width:18px;height:18px;background:rgba(255,255,255,0.5);border-radius:50%;cursor:nwse-resize;z-index:30";
    handle.dataset.resizeHandle = "1";
    el.appendChild(handle);
    b._handle = handle;

    el._dragStart = function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.target === handle || (handle.contains && handle.contains(t.target))) {
          resizeId = t.identifier;
          startX = t.clientX; startY = t.clientY;
          startBW = el.offsetWidth; startBH = el.offsetHeight;
          e.preventDefault(); return;
        }
        dragId = t.identifier;
        startX = t.clientX; startY = t.clientY;
        startBX = el.offsetLeft; startBY = el.offsetTop;
        e.preventDefault();
      }
    };

    el._dragMove = function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === dragId) {
          var nx = startBX + (t.clientX - startX);
          var ny = startBY + (t.clientY - startY);
          nx = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, nx));
          ny = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, ny));
          el.style.left = nx + "px";
          el.style.top = ny + "px";
        } else if (t.identifier === resizeId) {
          var nw = Math.max(36, startBW + (t.clientX - startX));
          var nh = Math.max(36, startBH + (t.clientY - startY));
          el.style.width = nw + "px";
          el.style.height = nh + "px";
        }
      }
    };

    el._dragEnd = function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === dragId) dragId = null;
        if (e.changedTouches[i].identifier === resizeId) resizeId = null;
      }
    };

    el.addEventListener("touchstart", el._dragStart, { passive: false });
    el.addEventListener("touchmove", el._dragMove, { passive: false });
    el.addEventListener("touchend", el._dragEnd, { passive: false });

    // mouse support
    var mDown = false, mResize = false;
    el._mouseDown = function (e) {
      if (e.target === handle) { mResize = true; startX = e.clientX; startY = e.clientY; startBW = el.offsetWidth; startBH = el.offsetHeight; }
      else { mDown = true; startX = e.clientX; startY = e.clientY; startBX = el.offsetLeft; startBY = el.offsetTop; }
      e.preventDefault();
    };
    el._mouseMove = function (e) {
      if (mDown) {
        var nx = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, startBX + (e.clientX - startX)));
        var ny = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startBY + (e.clientY - startY)));
        el.style.left = nx + "px"; el.style.top = ny + "px";
      } else if (mResize) {
        el.style.width = Math.max(36, startBW + (e.clientX - startX)) + "px";
        el.style.height = Math.max(36, startBH + (e.clientY - startY)) + "px";
      }
    };
    el._mouseUp = function () { mDown = false; mResize = false; };
    el.addEventListener("mousedown", el._mouseDown);
    document.addEventListener("mousemove", el._mouseMove);
    document.addEventListener("mouseup", el._mouseUp);
  }

  function disableDrag(b) {
    var el = b.el;
    if (el._dragStart) { el.removeEventListener("touchstart", el._dragStart); el.removeEventListener("touchmove", el._dragMove); el.removeEventListener("touchend", el._dragEnd); }
    if (el._mouseDown) { el.removeEventListener("mousedown", el._mouseDown); document.removeEventListener("mousemove", el._mouseMove); document.removeEventListener("mouseup", el._mouseUp); }
    if (b._handle && b._handle.parentNode) b._handle.parentNode.removeChild(b._handle);
  }

  // ===== CAMERA TOGGLE =====
  function toggleCamera() {
    G.cameraMode = (G.cameraMode === "first") ? "third" : "first";
    var btn = document.getElementById("camToggle");
    if (btn) btn.textContent = (G.cameraMode === "first") ? "1st" : "3rd";
    if (G.playerMesh) G.playerMesh.visible = (G.cameraMode === "third");
    if (G.gunGroup) G.gunGroup.visible = (G.cameraMode === "first");
  }

  // ===== SHOOTING =====
  // ===== WEAPON HELPERS =====
  function currentWeaponKey() { return WEAPON_KEYS[G.weaponIdx] || "rifle"; }
  function currentWeapon() { return WEAPONS[currentWeaponKey()]; }
  function currentAmmo() { return G.weapons[currentWeaponKey()]; }
  function isMoving() {
    var k = G.keys;
    return k["KeyW"] || k["KeyA"] || k["KeyS"] || k["KeyD"] || (G.touch && G.touch.moving);
  }

  function switchWeapon(idx) {
    if (idx < 0 || idx >= WEAPON_KEYS.length) return;
    if (G.weaponIdx === idx) return;
    G.weaponIdx = idx;
    G.currentRecoil = 0;
    // cancel zoom on weapon switch
    if (G.zooming) toggleZoom();
    // cancel reload
    var ammo = currentAmmo();
    ammo.reloading = false;
    // update gun model color
    if (G.gunGroup) {
      G.gunGroup.children.forEach(function (c) {
        if (c.material && c.material.color) c.material.color.setHex(currentWeapon().color);
      });
    }
    toast(currentWeapon().name);
    updateAmmoDisplay();
  }

  function toggleZoom() {
    if (G.dead) return;
    G.zooming = !G.zooming;
    var targetFov = G.zooming ? (currentWeapon().zoomFov || G.zoomFov) : G.baseFov;
    G.camera.fov = targetFov;
    G.camera.updateProjectionMatrix();
    // hide gun model when zooming (especially sniper)
    if (G.gunGroup) G.gunGroup.visible = !G.zooming;
    // toggle scope overlay + crosshair
    var scope = document.getElementById("scopeOverlay");
    var ch = document.getElementById("crosshair");
    if (G.zooming) {
      if (scope) scope.style.display = "block";
      if (ch) ch.style.display = "none";
    } else {
      if (scope) scope.style.display = "none";
      if (ch) ch.style.display = "block";
    }
  }

  // Dynamic crosshair: 4 lines spread based on current weapon spread + movement + recoil
  function updateCrosshair() {
    if (G.dead || G.zooming) return;
    var w = currentWeapon();
    var baseGap = 6; // minimum gap px
    var moveSpread = isMoving() ? w.spread * 2.5 : w.spread;
    var zoomMult = G.zooming ? 0.3 : 1.0;
    var totalSpread = (moveSpread * zoomMult) + G.currentRecoil;
    // map spread to pixel gap (scale factor)
    var gap = baseGap + totalSpread * 4000;
    if (gap > 60) gap = 60;
    var top = document.getElementById("chTop");
    var bot = document.getElementById("chBot");
    var left = document.getElementById("chLeft");
    var right = document.getElementById("chRight");
    if (top) top.style.top = (-gap - 8) + "px";
    if (bot) bot.style.top = gap + "px";
    if (left) left.style.left = (-gap - 8) + "px";
    if (right) right.style.left = gap + "px";
  }

  // Legacy reload removed from player flow; equipment/hotbar uses stamina and item actions.

  function updateAmmoDisplay() {
    var el = document.getElementById("actionDisplay") || document.getElementById("ammoDisplay");
    if (!el) return;
    var w = currentClassWeapon();
    var me = G.player || null;
    var stamina = me && me.maxStamina ? Math.round(me.stamina || 0) + "/" + Math.round(me.maxStamina) : "100/100";
    var block = me && me.blocking ? " | โล่: ยก" : "";
    el.innerHTML = w.name + "<br>STA " + stamina + block + "<br><span style='font-size:11px;color:#ccc'>" + w.action + "</span>";
    el.style.color = me && me.stamina < 20 ? "#e0584a" : "#eee";
  }

  // ===== PHASE 9 CLASS ATTACK =====
  function shoot() {
    classAttack();
  }

  function classAttack() {
    if (G.dead) return;
    var item = currentEquippedItem();
    var w = currentClassWeapon();
    if (item.itemType === "blueprint") {
      tryBuild(item.buildType);
      return;
    }
    // Worker tools near resource nodes should gather on Fire/click too.
    // This prevents pickaxe/axe mining from falling into classAttack target search.
    if (G.playerClass === "worker" && (item.id === "axe" || item.id === "pickaxe")) {
      var toolInteraction = getInteractionInfo();
      if (toolInteraction.node || toolInteraction.reason) {
        tryInteract();
        return;
      }
    }
    w.range = w.range || (item.id === "bow" ? 85 : 4.5);
    w.cooldown = w.cooldown || (item.id === "bow" ? 900 : 750);
    if (Date.now() - G.lastShoot < w.cooldown) return;
    G.lastShoot = Date.now();
    updateAmmoDisplay();

    var camDir = new THREE.Vector3();
    G.camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();

    if (G.gunGroup) {
      G.gunGroup.rotation.z = G.playerClass === "archer" ? 0.25 : -0.9;
      G.gunGroup.position.z = -0.28;
      setTimeout(function () {
        if (G.gunGroup) {
          G.gunGroup.rotation.z = 0;
          G.gunGroup.position.z = -0.5;
        }
      }, 180);
    }

    var hitId = null, hitDist = Infinity;
    if (typeof NET !== "undefined" && NET.players.size > 0) {
      NET.players.forEach(function (p, id) {
        if (id === NET.id || p.dead) return;
        if (p.faction === G.playerFaction) return;
        var dx = p.tx - G.player.x, dz = p.tz - G.player.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d > w.range) return;
        var toTarget = new THREE.Vector3(dx, 0, dz).normalize();
        var dot = camDir.dot(toTarget);
        var threshold = G.playerClass === "archer" ? 0.82 : 0.35;
        if (dot > threshold && d < hitDist) { hitId = id; hitDist = d; }
      });
    }

    var buildingId = null, buildingDist = Infinity;
    if (typeof NET !== "undefined" && NET.buildings) {
      NET.buildings.forEach(function (b) {
        if (b.faction === G.playerFaction) return;
        var dx = b.x - G.player.x, dz = b.z - G.player.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d > w.range) return;
        var toB = new THREE.Vector3(dx, 0, dz).normalize();
        var dot = camDir.dot(toB);
        var threshold = G.playerClass === "archer" ? 0.82 : 0.35;
        if (dot > threshold && d < buildingDist) { buildingId = b.id; buildingDist = d; }
      });
    }

    var payload = { t: "classAttack", dx: camDir.x, dz: camDir.z };
    if (hitId && hitDist <= buildingDist) payload.id = hitId;
    else if (buildingId !== null) payload.buildingId = buildingId;
    else if (item.itemType === "melee" || item.itemType === "tool" || item.itemType === "shield") payload.swing = true;
    if (G.playerClass === "archer") payload.drawMs = 400;
    netSend(payload);

    if (item.itemType === "melee" || item.itemType === "tool" || item.itemType === "shield") {
      showSwordSwingArc(item.id);
    }

    if (w.projectile) {
      var startPos = new THREE.Vector3(G.player.x, G.player.y - 0.1, G.player.z);
      spawnBullet(startPos, camDir, 70);
    } else {
      flashCrosshair();
    }
  }

  // ===== MELEE ATTACK =====
  function showSwordSwingArc(itemId) {
    if (!G.gunGroup || typeof THREE === "undefined") return;
    G.meleeAnim = Date.now();
    var color = (itemId === "sword" || itemId === "commander_sword") ? 0xfff0aa : 0xffcc66;
    var arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.018, 6, 28, Math.PI * 1.25),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.72 })
    );
    arc.rotation.set(Math.PI / 2, 0, -0.8);
    arc.position.set(0.15, 0.02, -0.55);
    G.gunGroup.add(arc);
    G.gunGroup.rotation.z = -1.05;
    G.gunGroup.position.z = -0.25;
    setTimeout(function () {
      if (arc.parent) arc.parent.remove(arc);
      if (G.gunGroup) { G.gunGroup.rotation.z = 0; G.gunGroup.position.z = -0.5; }
    }, 210);
  }

  function melee() {
    classAttack();
  }

  // ===== BULLET SYSTEM =====
  function spawnBullet(start, dir, speed) {
    speed = speed || 100;
    var bulletMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    var bullet = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), bulletMat);
    bullet.position.copy(start);
    bullet.userData = {
      vx: dir.x * speed,
      vy: dir.y * speed,
      vz: dir.z * speed,
      life: 1.0,
      maxLife: 1.0
    };
    G.scene.add(bullet);
    G.bullets.push(bullet);

    // tracer trail (thin line)
    var trailGeo = new THREE.Geometry();
    trailGeo.vertices.push(start.clone(), start.clone());
    var trailMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.6 });
    var trail = new THREE.Line(trailGeo, trailMat);
    bullet.userData.trail = trail;
    G.scene.add(trail);
  }

  function spawnImpact(x, y, z) {
    var mat = new THREE.MeshBasicMaterial({ color: 0xff6633, transparent: true, opacity: 1 });
    var impact = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), mat);
    impact.position.set(x, y, z);
    impact.userData = { life: 0.3, maxLife: 0.3, scale: 1 };
    G.scene.add(impact);
    G.impacts.push(impact);
  }

  function spawnBlood(x, y, z) {
    for (var i = 0; i < 6; i++) {
      var mat = new THREE.MeshBasicMaterial({ color: 0xcc1133, transparent: true, opacity: 1 });
      var p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), mat);
      p.position.set(x, y, z);
      p.userData = {
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 1,
        vz: (Math.random() - 0.5) * 4,
        life: 0.5, maxLife: 0.5
      };
      G.scene.add(p);
      G.impacts.push(p);
    }
  }

  function updateBullets(dt) {
    // bullets
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var b = G.bullets[i];
      var ud = b.userData;
      b.position.x += ud.vx * dt;
      b.position.y += ud.vy * dt;
      b.position.z += ud.vz * dt;
      ud.life -= dt;
      // update trail
      if (ud.trail) {
        ud.trail.geometry.vertices[0].copy(b.position);
        ud.trail.geometry.vertices[1].copy(b.position).add(new THREE.Vector3(-ud.vx * 0.03, -ud.vy * 0.03, -ud.vz * 0.03));
        ud.trail.geometry.verticesNeedUpdate = true;
        ud.trail.material.opacity = Math.max(0, ud.life / ud.maxLife * 0.6);
      }
      // check building collision
      var hit = false;
      for (var bi = 0; bi < G.buildings.length; bi++) {
        var bld = G.buildings[bi];
        if (Math.abs(b.position.x - bld.x) < bld.w/2 && Math.abs(b.position.z - bld.z) < bld.d/2 && b.position.y < bld.h) {
          spawnImpact(b.position.x, b.position.y, b.position.z);
          hit = true; break;
        }
      }
      // ground hit
      if (b.position.y <= 0) {
        spawnImpact(b.position.x, 0.1, b.position.z);
        hit = true;
      }
      if (hit || ud.life <= 0) {
        if (ud.trail) G.scene.remove(ud.trail);
        G.scene.remove(b);
        G.bullets.splice(i, 1);
      }
    }
    // impacts + blood particles
    for (var j = G.impacts.length - 1; j >= 0; j--) {
      var im = G.impacts[j];
      var iud = im.userData;
      if (iud.vx != null) {
        im.position.x += iud.vx * dt;
        im.position.y += iud.vy * dt;
        im.position.z += iud.vz * dt;
        iud.vy -= 10 * dt; // gravity on blood
      }
      iud.life -= dt;
      im.material.opacity = Math.max(0, iud.life / iud.maxLife);
      im.scale.multiplyScalar(0.95);
      if (iud.life <= 0) {
        G.scene.remove(im);
        G.impacts.splice(j, 1);
      }
    }
  }

  function flashCrosshair() {
    var ch = document.getElementById("crosshair");
    if (ch) { ch.style.opacity = "0.3"; setTimeout(function () { ch.style.opacity = "1"; }, 100); }
  }

  // ===== MOVEMENT =====
  function updateMovement(dt) {
    if (G.dead) return;
    var speed = G.player.speed || 5.5;

    // crouch = slower, prone = slowest
    if (G.touch) {
      if (G.touch.prone) speed *= 0.3;
      else if (G.touch.crouching) speed *= 0.5;
    }

    var isSprinting = !!(G.keys["ShiftLeft"] || G.keys["ShiftRight"] || (G.touch && G.touch.sprinting));
    if (isSprinting) speed *= 1.25;

    // keyboard crouch (Ctrl) and prone (C)
    if (G.keys["ControlLeft"] || G.keys["ControlRight"]) speed *= 0.5;
    if (G.keys["KeyC"]) speed *= 0.3;

    var fwd = new THREE.Vector3(-Math.sin(G.yaw), 0, -Math.cos(G.yaw));
    var right = new THREE.Vector3(Math.cos(G.yaw), 0, -Math.sin(G.yaw));
    var move = new THREE.Vector3();

    // keyboard
    if (G.keys["KeyW"]) move.add(fwd);
    if (G.keys["KeyS"]) move.sub(fwd);
    if (G.keys["KeyA"]) move.sub(right);
    if (G.keys["KeyD"]) move.add(right);

    // touch joystick
    if (G.touch && G.touch.joyActive) {
      if (G.touch.joyY < -0.1) move.add(fwd.clone().multiplyScalar(-G.touch.joyY));
      if (G.touch.joyY > 0.1) move.sub(fwd.clone().multiplyScalar(G.touch.joyY));
      if (G.touch.joyX < -0.1) move.sub(right.clone().multiplyScalar(-G.touch.joyX));
      if (G.touch.joyX > 0.1) move.add(right.clone().multiplyScalar(G.touch.joyX));
    }

    if (move.length() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      var nx = G.player.x + move.x;
      var nz = G.player.z + move.z;
      if (!checkCollision(nx, G.player.z)) G.player.x = nx;
      if (!checkCollision(G.player.x, nz)) G.player.z = nz;
      G.player.x = Math.max(-98, Math.min(98, G.player.x));
      G.player.z = Math.max(-98, Math.min(98, G.player.z));
    }

    // ===== JUMP =====
    if (G.touch && G.touch.jumpTriggered) {
      G.touch.jumpTriggered = false;
      if (G.player.y <= 1.7) G.player.vy = 6.0; // jump velocity
    }
    // keyboard jump (Space)
    if (G.keys["Space"] && G.player.y <= 1.7) {
      G.player.vy = 6.0;
    }
    // apply gravity + vertical movement
    if (G.player.vy != null) {
      G.player.y += G.player.vy * dt;
      G.player.vy -= 18 * dt; // gravity
      if (G.player.y <= 1.6) { G.player.y = 1.6; G.player.vy = 0; }
    }

    // crouch/prone affects camera height
    var targetY = 1.6;
    if (G.touch) {
      if (G.touch.prone) targetY = 0.8;
      else if (G.touch.crouching) targetY = 1.1;
    }
    if (G.keys["ControlLeft"] || G.keys["ControlRight"]) targetY = 1.1;
    if (G.keys["KeyC"]) targetY = 0.8;
    // smooth camera height transition
    if (!G.player.vy || G.player.vy === 0) {
      G.player.y += (targetY - G.player.y) * Math.min(1, dt * 8);
    }

    // send position
    if (typeof netSend === "function" && NET.connected) {
      var anim = move.length() > 0 ? "walk" : "idle";
      netSend({
        t: "pos",
        x: G.player.x, y: G.player.y, z: G.player.z,
        rx: G.pitch, ry: G.yaw,
        hp: G.player.hp, anim: anim,
        sprinting: isSprinting
      });
    }
  }

  function checkCollision(x, z) {
    for (var i = 0; i < G.buildings.length; i++) {
      var b = G.buildings[i];
      var hw = b.w / 2 + 1.2, hd = b.d / 2 + 1.2;
      if (x > b.x - hw && x < b.x + hw && z > b.z - hd && z < b.z + hd) return true;
    }
    return false;
  }

  // ===== REMOTE PLAYERS =====
  // faction color lookup for client rendering
  var FACTION_COLORS = {
    ironhold: 0x4a7da8,
    verdant:  0x4aa84a
  };
  var FACTION_HEX = {
    ironhold: "#4a7da8",
    verdant:  "#4aa84a"
  };

  function updateRemotes(dt) {
    if (typeof NET === "undefined") return;
    NET.players.forEach(function (p, id) {
      if (p.tx == null) return;
      // lerp
      if (!p.mesh) {
        var geo = new THREE.CylinderGeometry(0.4, 0.4, 1.4, 8);
        var facColor = FACTION_COLORS[p.faction] || 0x888888;
        var mat = new THREE.MeshLambertMaterial({ color: facColor });
        p.mesh = new THREE.Mesh(geo, mat);
        p.mesh.castShadow = true;
        G.scene.add(p.mesh);
        // name tag
        var canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 32;
        p.tagCtx = canvas.getContext("2d");
        var tex = new THREE.CanvasTexture(canvas);
        var tagMat = new THREE.SpriteMaterial({ map: tex });
        p.tag = new THREE.Sprite(tagMat);
        p.tag.scale.set(4, 1, 1);
        p.tag.position.y = 2.5;
        G.scene.add(p.tag);
      }
      // update faction color if it changed or arrived after mesh creation
      var expectedColor = FACTION_COLORS[p.faction] || 0x888888;
      if (p.mesh.material.color.getHex() !== expectedColor) {
        p.mesh.material.color.setHex(expectedColor);
      }
      p.mesh.position.x += (p.tx - p.mesh.position.x) * Math.min(1, dt * 10);
      p.mesh.position.z += (p.tz - p.mesh.position.z) * Math.min(1, dt * 10);
      p.mesh.position.y = p.dead ? -5 : 0.8;
      p.mesh.rotation.y = p.ry || 0;
      p.tag.position.x = p.mesh.position.x;
      p.tag.position.z = p.mesh.position.z;
      // update name tag with faction color
      var facHex = FACTION_HEX[p.faction] || "#888";
      p.tagCtx.clearRect(0, 0, 128, 32);
      p.tagCtx.fillStyle = "rgba(0,0,0,0.6)";
      p.tagCtx.fillRect(0, 0, 128, 32);
      // faction-colored name
      p.tagCtx.fillStyle = facHex;
      p.tagCtx.font = "bold 12px monospace";
      p.tagCtx.textAlign = "center";
      p.tagCtx.fillText(p.name + " (" + p.hp + ")", 64, 20);
      p.tag.material.map.needsUpdate = true;
    });
    // remove stale
    G.remoteMeshes.forEach(function (mesh, id) {
      if (!NET.players.has(id)) {
        G.scene.remove(mesh);
        G.remoteMeshes.delete(id);
      }
    });
  }

  // ===== UNITS =====
  function updateUnits(dt) {
    if (typeof NET === "undefined") return;
    var seen = {};
    NET.units.forEach(function (u) {
      seen[u.id] = 1;
      var mesh = G.unitMeshes.get(u.id);
      if (!mesh) {
        var color = u.type === "archer" ? 0x4a9d4a : u.type === "cavalry" ? 0x9d4a4a : 0x4a4a9d;
        var size = u.type === "cavalry" ? 0.8 : 0.5;
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(size, size, 1.0, 6),
          new THREE.MeshLambertMaterial({ color: color })
        );
        mesh.castShadow = true;
        G.scene.add(mesh);
        G.unitMeshes.set(u.id, mesh);
      }
      if (u.x != null) {
        mesh.position.x = u.x;
        mesh.position.z = u.z;
        mesh.position.y = 0.5;
      }
      mesh.visible = u.hp > 0;
    });
    G.unitMeshes.forEach(function (mesh, id) {
      if (!seen[id]) { G.scene.remove(mesh); G.unitMeshes.delete(id); }
    });
  }

  // ===== EVENTS =====
  function processEvents() {
    if (typeof NET === "undefined") return;
    while (NET.events.length > 0) {
      var m = NET.events.shift();
      var d = m.data || {};
      if (m.kind === "kill") {
        var killText = d.killerName + " ฆ่า " + d.victimName;
        if (d.headshot) killText = "HEADSHOT! " + killText;
        addKillFeed(killText);
        if (d.victim === NET.id) {
          G.dead = true;
          showOverlay("คุณถูกฆ่าโดย " + d.killerName + " — รอเกิดใหม่...");
          setTimeout(function () { G.dead = false; hideOverlay(); }, 5000);
        }
      } else if (m.kind === "respawn") {
        if (d.id === NET.id) {
          G.player.x = d.x; G.player.z = d.z;
          G.dead = false; hideOverlay();
        }
      } else if (m.kind === "shoot") {
        // could draw bullet trail
      } else if (m.kind === "melee") {
        // could show enemy melee swing animation
      } else if (m.kind === "classAttack") {
        if (d.from === NET.id) {
          if (d.damage > 0) { G.hitMarker = Date.now(); toast(d.blocked ? "โล่บล็อก" : "ฟันโดน"); }
          else toast("ฟันพลาด");
        }
      } else if (m.kind === "classAttackReject") {
        if (d.reason) toast(d.reason);
      } else if (m.kind === "gatherReject") {
        if (d.reason) toast(d.reason);
      } else if (m.kind === "capture") {
        var capText = d.name + " ถูกยึดโดย " + (d.owner === "ironhold" ? "Ironhold" : "Verdant");
        addKillFeed(capText);
        if (typeof toast === "function") toast(capText);
      } else if (m.kind === "roundWin") {
        var winText = d.winnerName + " ชนะรอบ!";
        addKillFeed(winText);
        if (typeof toast === "function") toast(winText);
      } else if (m.kind === "roundReset") {
        addKillFeed("รอบใหม่เริ่มแล้ว!");
        if (typeof toast === "function") toast("รอบใหม่เริ่มแล้ว!");
      } else if (m.kind === "build") {
        addKillFeed(d.faction + " สร้าง " + (d.type === "wooden_wall" ? "กำแพงไม้" : "ธงรวมพล"));
      } else if (m.kind === "buildingDestroyed") {
        addKillFeed((d.type === "wooden_wall" ? "กำแพง" : "ธง") + " ฝ่าย " + d.faction + " ถูกทำลาย");
      } else if (m.kind === "buildReject") {
        var reason = d.reason || "สร้างไม่ได้";
        addKillFeed("สร้างไม่ได้: " + reason);
        if (typeof toast === "function") toast("สร้างไม่ได้: " + reason);
      }
    }
  }

  function addKillFeed(text) {
    var feed = document.getElementById("killFeed");
    if (!feed) return;
    var div = document.createElement("div");
    div.className = "kf";
    div.textContent = text;
    feed.appendChild(div);
    setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
  }

  function showOverlay(text) {
    var o = document.getElementById("overlay");
    o.textContent = text;
    o.style.display = "flex";
  }
  function hideOverlay() {
    document.getElementById("overlay").style.display = "none";
  }

  // ===== HUD =====
  function updateHUD() {
    if (typeof NET === "undefined" || !NET.id) return;
    var p = G.player;
    document.querySelector("#hpBar > i").style.width = (p.hp / p.maxHp * 100) + "%";
    document.querySelector("#hpBar > span").textContent = "HP " + p.hp;
    document.querySelector("#goldBar > i").style.width = Math.min(100, p.gold / 5) + "%";
    document.querySelector("#goldBar > span").textContent = "Gold " + p.gold;
    document.querySelector("#xpBar > i").style.width = ((p.score || 0) % 100) + "%";
    document.querySelector("#xpBar > span").textContent = "LV " + p.level;
    document.getElementById("score").textContent = "K " + p.kills + " / D " + p.deaths;
    if (typeof NET !== "undefined") document.getElementById("playersOnline").textContent = NET.players.size + 1 + " คนออนไลน์";
  }

  // ===== MINIMAP =====
  function drawMinimap() {
    var cv = document.getElementById("minimap");
    if (!cv) return;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, 120, 120);
    var scale = 120 / 200;
    // buildings
    ctx.fillStyle = "rgba(150,130,100,0.4)";
    G.buildings.forEach(function (b) {
      ctx.fillRect((b.x + 100) * scale - 1, (b.z + 100) * scale - 1, 3, 3);
    });
    // units
    if (typeof NET !== "undefined") {
      ctx.fillStyle = "#4a4a9d";
      NET.units.forEach(function (u) {
        ctx.fillRect((u.x + 100) * scale - 1, (u.z + 100) * scale - 1, 2, 2);
      });
      // remote players — faction colors on minimap
      NET.players.forEach(function (p) {
        if (p.dead) return;
        ctx.fillStyle = FACTION_HEX[p.faction] || "#888";
        ctx.fillRect((p.tx + 100) * scale - 1, (p.tz + 100) * scale - 1, 3, 3);
      });
    }
    // self — own faction color, slightly bigger
    ctx.fillStyle = FACTION_HEX[G.playerFaction] || "#e0a23c";
    ctx.fillRect((G.player.x + 100) * scale - 2, (G.player.z + 100) * scale - 2, 4, 4);
  }

  // ===== ANIMATE LOOP =====
  var lastTime = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    var now = performance.now();
    var dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    updateMovement(dt);
    updateRemotes(dt);
    updateUnits(dt);
    updateBullets(dt);
    processEvents();

    // recoil recovery
    if (G.currentRecoil > 0) {
      G.currentRecoil *= 0.92;
      if (G.currentRecoil < 0.001) G.currentRecoil = 0;
    }

    // hit marker display (show for 200ms after hit)
    var hm = document.getElementById("hitMarker");
    if (hm) {
      if (G.hitMarker && Date.now() - G.hitMarker < 200) {
        hm.style.opacity = "1";
      } else {
        hm.style.opacity = "0";
      }
    }

    // dynamic crosshair (gap reflects spread + recoil)
    updateCrosshair();

    // legacy weapon bar removed; hotbar owns selected-item highlight.

    // camera follows player
    G.camera.rotation.order = "YXZ";
    G.camera.rotation.y = G.yaw;
    G.camera.rotation.x = G.pitch;

    if (G.cameraMode === "third" && G.playerMesh) {
      // 3rd person: camera behind and above player
      G.playerMesh.position.set(G.player.x, 0, G.player.z);
      G.playerMesh.rotation.y = G.yaw;
      // calculate camera offset behind player based on yaw/pitch
      var camDist = G.cameraDistance;
      var camHeight = 2.0 + Math.sin(G.pitch) * 2;
      var offsetX = Math.sin(G.yaw) * camDist * Math.cos(G.pitch);
      var offsetZ = Math.cos(G.yaw) * camDist * Math.cos(G.pitch);
      G.camera.position.set(
        G.player.x + offsetX,
        G.player.y + camHeight,
        G.player.z + offsetZ
      );
      // collision: don't let camera go through buildings
      for (var bi = 0; bi < G.buildings.length; bi++) {
        var bld = G.buildings[bi];
        if (Math.abs(G.camera.position.x - bld.x) < bld.w/2 + 0.5 &&
            Math.abs(G.camera.position.z - bld.z) < bld.d/2 + 0.5) {
          G.camera.position.set(G.player.x, G.player.y + 2, G.player.z);
          break;
        }
      }
    } else {
      // 1st person: camera at eye level
      G.camera.position.set(G.player.x, G.player.y, G.player.z);
    }

    updateHUD();
    drawMinimap();
    updateCaptureFlags();
    updateScoreHud();
    updateInteractionPrompt();
    updateMobileActionButton();
    updateResourceHud();
    updateAmmoDisplay();
    updateBuildings();

    G.renderer.render(G.scene, G.camera);
  }

  // ===== CAPTURE POINT RENDERING + HUD =====
  var CP_COLORS = {
    ironhold: 0x4a7da8,
    verdant:  0x4aa84a,
    neutral:  0x888888,
    contested: 0xe0a23c
  };
  var CP_HEX = {
    ironhold: "#4a7da8",
    verdant:  "#4aa84a",
    neutral:  "#888888",
    contested: "#e0a23c"
  };

  function updateCaptureFlags() {
    if (typeof NET === "undefined" || !NET.capturePoints) return;
    var hud = document.getElementById("captureHud");
    NET.capturePoints.forEach(function (cp) {
      // update 3D flag color
      var flagObj = G.captureFlags ? G.captureFlags[cp.id] : null;
      if (flagObj) {
        var flagColor;
        if (cp.contested) flagColor = CP_COLORS.contested;
        else if (cp.owner) flagColor = CP_COLORS[cp.owner] || CP_COLORS.neutral;
        else if (cp.capturing) flagColor = CP_COLORS[cp.capturing] || CP_COLORS.neutral;
        else flagColor = CP_COLORS.neutral;

        if (flagObj.flag.material.color.getHex() !== flagColor) {
          flagObj.flag.material.color.setHex(flagColor);
        }
        if (flagObj.ring.material.color.getHex() !== flagColor) {
          flagObj.ring.material.color.setHex(flagColor);
        }
      }

      // update HUD
      if (hud) {
        hud.style.display = "block";
        var ownerColor = cp.owner ? CP_HEX[cp.owner] : CP_HEX.neutral;
        var ownerText = cp.owner ? (cp.owner === "ironhold" ? "Ironhold" : "Verdant") : "Neutral";
        var statusText = "";
        var statusColor = "#eee";
        if (cp.contested) {
          statusText = "CONTESTED";
          statusColor = CP_HEX.contested;
        } else if (cp.capturing) {
          statusText = "Capturing: " + (cp.capturing === "ironhold" ? "Ironhold" : "Verdant");
          statusColor = CP_HEX[cp.capturing];
        } else {
          statusText = "No contest";
        }

        var barColor = cp.capturing ? CP_HEX[cp.capturing] : ownerColor;
        hud.innerHTML =
          '<div style="font-size:12px;font-weight:bold;color:' + ownerColor + '">' + cp.name + ': ' + ownerText + '</div>' +
          '<div style="width:120px;height:8px;border:1px solid rgba(255,255,255,.3);border-radius:3px;background:rgba(0,0,0,.5);margin:3px auto;overflow:hidden">' +
          '<div style="height:100%;width:' + cp.progress + '%;background:' + barColor + ';transition:width .3s"></div></div>' +
          '<div style="font-size:10px;color:' + statusColor + '">' + statusText + ' (' + cp.progress + '%)</div>';
      }
    });
  }

  // ===== SCORE HUD + WINNER OVERLAY =====
  function updateScoreHud() {
    if (typeof NET === "undefined" || !NET.id) return;
    var hud = document.getElementById("scoreHud");
    if (!hud) return;
    hud.style.display = "block";
    var scores = NET.factionScores || { ironhold: 0, verdant: 0 };
    var iron = scores.ironhold || 0;
    var verdant = scores.verdant || 0;
    var winScore = 1000;
    var ironPct = Math.min(100, (iron / winScore) * 100);
    var verdantPct = Math.min(100, (verdant / winScore) * 100);
    hud.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;font-size:11px">' +
      '<span style="color:#4a7da8;font-weight:bold">Ironhold ' + iron + '</span>' +
      '<div style="width:120px;height:10px;border:1px solid rgba(255,255,255,.2);border-radius:3px;background:rgba(0,0,0,.5);overflow:hidden;display:flex">' +
      '<div style="height:100%;width:' + ironPct + '%;background:#4a7da8"></div>' +
      '<div style="height:100%;width:' + verdantPct + '%;background:#4aa84a;margin-left:auto"></div>' +
      '</div>' +
      '<span style="color:#4aa84a;font-weight:bold">' + verdant + ' Verdant</span>' +
      '</div>';

    var overlay = document.getElementById("winnerOverlay");
    if (overlay) {
      if (NET.roundWinner) {
        overlay.style.display = "flex";
        var winnerName = NET.roundWinner === "ironhold" ? "Ironhold" : "Verdant";
        var winnerColor = NET.roundWinner === "ironhold" ? "#4a7da8" : "#4aa84a";
        var countdown = Math.max(0, Math.ceil((NET.roundResetAt - Date.now()) / 1000));
        overlay.innerHTML =
          '<div style="text-align:center">' +
          '<div style="font-size:28px;font-weight:bold;color:' + winnerColor + ';letter-spacing:3px;margin-bottom:10px">' + winnerName + ' VICTORY!</div>' +
          '<div style="font-size:14px;color:#eee;margin-bottom:8px">Ironhold: ' + iron + ' | Verdant: ' + verdant + '</div>' +
          '<div style="font-size:12px;color:#aaa">รอบใหม่ใน ' + countdown + ' วินาที...</div>' +
          '</div>';
      } else {
        overlay.style.display = "none";
      }
    }
  }

  // ===== RESOURCE INTERACTION (Phase 7) =====
  var GATHER_RADIUS = 5;
  var DEPOSIT_RADIUS = 12;

  function getInteractionInfo() {
    if (G.dead || typeof NET === "undefined") return { valid: false, label: "ใช้", reason: "" };
    var nearNode = null, nearDist = Infinity;
    if (NET.resourceNodes) {
      for (var i = 0; i < NET.resourceNodes.length; i++) {
        var node = NET.resourceNodes[i];
        var dx = node.x - G.player.x, dz = node.z - G.player.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < GATHER_RADIUS && d < nearDist) { nearNode = node; nearDist = d; }
      }
    }
    if (nearNode) {
      if (G.playerClass !== "worker") return { valid: false, label: "ใช้", reason: "ต้องเป็นคนงานเท่านั้น" };
      var item = currentEquippedItem();
      if (nearNode.type === "wood" && item.id !== "axe") return { valid: false, label: "ขวาน", reason: "ต้องถือขวาน" };
      if (nearNode.type === "stone" && item.id !== "pickaxe") return { valid: false, label: "พลั่ว", reason: "ต้องถือพลั่วขุดหิน" };
      return { valid: true, label: nearNode.type === "wood" ? "เก็บไม้" : "เก็บหิน", node: nearNode };
    }
    var wh = NET.warehouses ? NET.warehouses[G.playerFaction] : null;
    if (wh) {
      var wdx = wh.x - G.player.x, wdz = wh.z - G.player.z;
      var wd = Math.sqrt(wdx * wdx + wdz * wdz);
      var inv = G.player.inventory || { wood: 0, stone: 0 };
      if (wd < (wh.radius || DEPOSIT_RADIUS) && ((inv.wood || 0) > 0 || (inv.stone || 0) > 0)) {
        return { valid: true, label: "ฝาก", deposit: true };
      }
    }
    return { valid: false, label: "ใช้", reason: "" };
  }

  function updateMobileActionButton() {
    var btn = G.mobileActionBtn || document.getElementById("touchAction");
    if (!btn) return;
    var info = getInteractionInfo();
    btn.textContent = info.label || "ใช้";
    btn.dataset.enabled = info.valid ? "1" : "0";
    btn.style.opacity = info.valid ? "1" : ".55";
    btn.style.background = info.valid ? "rgba(224,162,60,0.70)" : "rgba(224,162,60,0.38)";
    btn.style.borderColor = info.valid ? "rgba(255,210,122,0.58)" : "rgba(255,210,122,0.25)";
  }

  function tryInteract() {
    if (G.dead) return;
    var info = getInteractionInfo();
    if (!info.valid) {
      if (info.reason) toast(info.reason);
      return;
    }
    if (info.node) {
      netSend({ t: "gather", nodeId: info.node.id });
      toast(info.label || "เก็บ");
      return;
    }
    if (info.deposit) {
      netSend({ t: "deposit" });
      toast("ฝากทรัพยากร");
      return;
    }
  }

  function updateInteractionPrompt() {
    if (G.dead || typeof NET === "undefined" || !NET.resourceNodes) { hideInteractionPrompt(); return; }
    var prompt = document.getElementById("interactPrompt");
    if (!prompt) return;
    // check near resource node
    var nearNode = null, nearDist = Infinity;
    for (var i = 0; i < NET.resourceNodes.length; i++) {
      var node = NET.resourceNodes[i];
      var dx = node.x - G.player.x, dz = node.z - G.player.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < GATHER_RADIUS && d < nearDist) { nearNode = node; nearDist = d; }
    }
    if (nearNode) {
      prompt.style.display = "block";
      if (G.playerClass === "worker") {
        var item = currentEquippedItem();
        var okTool = (nearNode.type === "wood" && item.id === "axe") || (nearNode.type === "stone" && item.id === "pickaxe");
        if (okTool) {
          prompt.textContent = nearNode.type === "wood" ? "E/ใช้: เก็บไม้" : "E/ใช้: เก็บหิน";
          prompt.textContent += " (" + nearNode.amount + ")";
          prompt.style.color = "#e0a23c";
        } else {
          prompt.textContent = nearNode.type === "wood" ? "ต้องถือขวาน" : "ต้องถือพลั่วขุดหิน";
          prompt.style.color = "#aaa";
        }
      } else {
        prompt.textContent = "ต้องเป็นคนงานเท่านั้น";
        prompt.style.color = "#888";
      }
      return;
    }
    // check near own warehouse
    var wh = NET.warehouses ? NET.warehouses[G.playerFaction] : null;
    if (wh) {
      var wdx = wh.x - G.player.x, wdz = wh.z - G.player.z;
      var wd = Math.sqrt(wdx * wdx + wdz * wdz);
      if (wd < (wh.radius || DEPOSIT_RADIUS)) {
        var inv = G.player.inventory || { wood: 0, stone: 0 };
        if (inv.wood > 0 || inv.stone > 0) {
          prompt.style.display = "block";
          prompt.textContent = "E/ใช้: ฝากทรัพยากร (ไม้ " + (inv.wood || 0) + " หิน " + (inv.stone || 0) + ")";
          prompt.style.color = "#e0a23c";
          return;
        }
      }
    }
    if (G.playerClass === "commander") {
      var item = currentEquippedItem();
      if (item && item.itemType === "blueprint") {
        prompt.style.display = "block";
        prompt.textContent = item.buildType === "wooden_wall" ? "คลิก: วางกำแพง" : "คลิก: วางธงรวมพล";
        prompt.style.color = "#e0a23c";
        return;
      }
    }
    hideInteractionPrompt();
  }

  function hideInteractionPrompt() {
    var prompt = document.getElementById("interactPrompt");
    if (prompt) prompt.style.display = "none";
  }

  function updateResourceHud() {
    if (typeof NET === "undefined" || !NET.id) return;
    var hud = document.getElementById("resourceHud");
    if (!hud) return;
    hud.style.display = "block";
    var inv = G.player.inventory || { wood: 0, stone: 0 };
    var facRes = NET.factionResources || {};
    var myFac = G.playerFaction;
    var fr = facRes[myFac] || { wood: 0, stone: 0 };
    hud.innerHTML =
      '<div style="font-size:10px;color:#aaa">กระเป๋า: ไม้ ' + (inv.wood || 0) + ' | หิน ' + (inv.stone || 0) + '</div>' +
      '<div style="font-size:10px;color:' + (myFac === "ironhold" ? "#4a7da8" : "#4aa84a") + '">ฝ่าย: ไม้ ' + (fr.wood || 0) + ' | หิน ' + (fr.stone || 0) + '</div>';
  }

  // ===== BUILDING SYSTEM (Phase 8) =====
  G.buildingMeshes = {}; // id -> mesh

  function updateBuildings() {
    if (typeof NET === "undefined" || !NET.buildings) return;
    var seen = {};
    NET.buildings.forEach(function (b) {
      seen[b.id] = true;
      if (!G.buildingMeshes[b.id]) {
        // create mesh
        var mesh;
        if (b.type === "wooden_wall") {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(3, 3, 0.5),
            new THREE.MeshLambertMaterial({ color: 0x8b6914 })
          );
          mesh.position.set(b.x, 1.5, b.z);
          mesh.rotation.y = b.rot || 0;
          mesh.castShadow = true;
          G.scene.add(mesh);
        } else if (b.type === "rally_flag") {
          var grp = new THREE.Group();
          var pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, 6, 6),
            new THREE.MeshLambertMaterial({ color: 0x8a8a8a })
          );
          pole.position.set(0, 3, 0);
          grp.add(pole);
          var flag = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 1.5),
            new THREE.MeshLambertMaterial({ color: b.faction === "ironhold" ? 0x4a7da8 : 0x4aa84a, side: THREE.DoubleSide })
          );
          flag.position.set(1, 4.5, 0);
          grp.add(flag);
          grp.position.set(b.x, 0, b.z);
          G.scene.add(grp);
          mesh = grp;
        }
        if (mesh) {
          G.buildingMeshes[b.id] = mesh;
        }
      }
    });
    // remove destroyed buildings
    Object.keys(G.buildingMeshes).forEach(function (id) {
      if (!seen[id]) {
        G.scene.remove(G.buildingMeshes[id]);
        delete G.buildingMeshes[id];
      }
    });
  }

  // Build placement via equipped blueprint hotbar item
  // Phase 9.9: clamp client request to a valid short distance in front of Commander; server remains final authority.
  var BUILD_PLACE_DISTANCE = 5.5;
  var BUILD_PLACE_MAX_DISTANCE = 7.5;
  function clampBuildPlacement(dir) {
    var len = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1;
    var nx = dir.x / len, nz = dir.z / len;
    var dist = Math.min(BUILD_PLACE_DISTANCE, BUILD_PLACE_MAX_DISTANCE);
    return { x: G.player.x + nx * dist, z: G.player.z + nz * dist, rot: G.yaw || 0, valid: dist <= BUILD_PLACE_MAX_DISTANCE };
  }
  function buildPlacementApproxValid(pos, buildingType) {
    if (!pos) return false;
    if (Math.abs(pos.x) > 96 || Math.abs(pos.z) > 96) return false;
    var w = buildingType === "wooden_wall" ? 3.0 : 2.2;
    var d = buildingType === "wooden_wall" ? 1.4 : 2.2;
    function nearRect(cx, cz, hw, hd, pad) {
      return Math.abs(pos.x - cx) < (w / 2 + hw + pad) && Math.abs(pos.z - cz) < (d / 2 + hd + pad);
    }
    if (NET && NET.buildings) {
      for (var i = 0; i < NET.buildings.length; i++) {
        var b = NET.buildings[i];
        var bw = b.type === "wooden_wall" ? 3.0 : 2.2;
        var bd = b.type === "wooden_wall" ? 1.4 : 2.2;
        if (nearRect(b.x, b.z, bw / 2, bd / 2, 0.65)) return false;
      }
    }
    if (NET && NET.resourceNodes) {
      for (var r = 0; r < NET.resourceNodes.length; r++) {
        var n = NET.resourceNodes[r];
        var ndx = pos.x - n.x, ndz = pos.z - n.z;
        if (Math.sqrt(ndx * ndx + ndz * ndz) < 4.2) return false;
      }
    }
    if (NET && NET.warehouses) {
      for (var fk in NET.warehouses) {
        var wh = NET.warehouses[fk];
        var wx = pos.x - wh.x, wz = pos.z - wh.z;
        if (Math.sqrt(wx * wx + wz * wz) < ((wh.radius || 10) + 3)) return false;
      }
    }
    // central fort/capture point exclusion, approximate client-side only
    var cdx = pos.x, cdz = pos.z;
    if (Math.sqrt(cdx * cdx + cdz * cdz) < 13) return false;
    return true;
  }

  function showBuildPreview(pos, valid) {
    if (typeof THREE === "undefined" || !G.scene || !pos) return;
    if (!G.buildPreview) {
      var geo = new THREE.BoxGeometry(2.8, 0.25, 1.2);
      var mat = new THREE.MeshBasicMaterial({ color: 0x55ff66, transparent: true, opacity: 0.35 });
      G.buildPreview = new THREE.Mesh(geo, mat);
      G.scene.add(G.buildPreview);
    }
    G.buildPreview.position.set(pos.x, 0.15, pos.z);
    G.buildPreview.rotation.y = pos.rot || 0;
    G.buildPreview.material.color.set(valid ? 0x55ff66 : 0xff4444);
    G.buildPreview.visible = true;
    setTimeout(function () { if (G.buildPreview) G.buildPreview.visible = false; }, 450);
  }

  function tryBuild(buildingType) {
    if (G.playerClass !== "commander") {
      toast("ต้องเป็นแม่ทัพเท่านั้น");
      return;
    }
    var item = currentEquippedItem();
    if (!item || item.itemType !== "blueprint" || item.buildType !== buildingType) {
      toast("ต้องถือแบบก่อสร้างก่อน");
      return;
    }
    // place in front of player using horizontal camera/facing direction, clamped inside server build radius
    var dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    dir.y = 0;
    if (Math.abs(dir.x) + Math.abs(dir.z) < 0.001) {
      dir.x = -Math.sin(G.yaw || 0);
      dir.z = -Math.cos(G.yaw || 0);
    }
    var pos = clampBuildPlacement(dir);
    var approxValid = pos.valid && buildPlacementApproxValid(pos, buildingType);
    showBuildPreview(pos, approxValid);
    if (!approxValid) {
      toast("ตำแหน่งวางไม่ได้");
      return;
    }
    netSend({ t: "build", buildingType: buildingType, x: pos.x, z: pos.z, rot: pos.rot });
  }

  // Attack nearby enemy building with melee
  function tryAttackBuilding() {
    if (typeof NET === "undefined" || !NET.buildings) return;
    var near = null, nearDist = Infinity;
    NET.buildings.forEach(function (b) {
      if (b.faction === G.playerFaction) return; // skip own faction
      var dx = b.x - G.player.x, dz = b.z - G.player.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 10 && d < nearDist) { near = b; nearDist = d; }
    });
    if (near) {
      var dx = near.x - G.player.x, dz = near.z - G.player.z;
      var d = Math.sqrt(dx * dx + dz * dz) || 1;
      netSend({ t: "classAttack", buildingId: near.id, dx: dx / d, dz: dz / d, drawMs: G.playerClass === "archer" ? 400 : 0 });
      toast("โจมตี " + (near.type === "wooden_wall" ? "กำแพง" : "ธง") + " ด้วย " + currentClassWeapon().name);
    }
  }

  // ===== FACTION SELECT =====
  var FACTIONS = {
    ironhold: { name: "Ironhold", color: 0x4a7da8, colorHex: "#4a7da8" },
    verdant:  { name: "Verdant",  color: 0x4aa84a, colorHex: "#4aa84a" }
  };
  G.playerFaction = null;

  document.querySelectorAll(".factionCard").forEach(function (card) {
    card.addEventListener("click", function () {
      G.playerFaction = card.dataset.faction;
      var fac = FACTIONS[G.playerFaction];
      // show faction HUD
      var fh = document.getElementById("factionHud");
      fh.style.display = "block";
      fh.innerHTML = '<span style="color:' + fac.colorHex + ';font-weight:bold">' + fac.name + '</span> | <span style="font-size:10px;opacity:.7">ฝ่ายของคุณ</span>';
      // show class select
      document.getElementById("factionSelect").style.display = "none";
      document.getElementById("classSelect").style.display = "flex";
    });
  });

  // ===== CLASS SELECT =====
  document.querySelectorAll(".classCard").forEach(function (card) {
    card.addEventListener("click", function () {
      try {
        var rawClass = card.dataset.class;
        // backward-compatible mapping
        var cls = CLASS_COMPAT[rawClass] || rawClass;
        if (!CLASSES[cls]) cls = "infantry"; // fallback
        var name = document.getElementById("nameInput").value || "player";
        G.playerName = name;
        G.playerClass = cls;
        var def = CLASSES[cls];
        G.player.maxHp = def.hp;
        G.player.hp = def.hp;
        G.player.speed = def.speed;
        G.player.damage = def.damage;

        document.getElementById("classSelect").style.display = "none";
        document.getElementById("hud").style.display = "flex";
        document.getElementById("crosshair").style.display = "block";
        document.getElementById("shop").style.display = "flex";
        document.getElementById("controls").style.display = "block";

        init();
        if (G.scene) netConnect(name, cls, G.playerFaction);
      } catch (e) {
        console.error("init failed:", e);
        alert("เกิดข้อผิดพลาด: " + e.message + "\nกรุณารีเฟรชหน้า");
      }
    });
  });

  // Build buttons removed; Commander builds via equipped blueprint hotbar item.

  window.toast = function (text) {
    var div = document.createElement("div");
    div.style.cssText = "position:fixed;top:140px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);padding:5px 12px;border-radius:3px;font-size:11px;z-index:30;animation:tf 2s forwards";
    div.textContent = text;
    document.body.appendChild(div);
    setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 2000);
  };
})();
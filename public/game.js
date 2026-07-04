// game.js — 3D FPS engine + controls + rendering
(function () {
  "use strict";

  // ===== GLOBAL STATE =====
  var G = {
    playerName: "player",
    playerClass: "soldier",
    player: { x: 0, y: 1.6, z: 0, hp: 100, maxHp: 100, gold: 100, level: 1, kills: 0, deaths: 0, speed: 5.5, damage: 15 },
    dead: false,
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
    zooming: false,
    baseFov: 75,
    zoomFov: 35,
    bullets: [],
    worldSize: 100
  };
  window.G = G;

  var CLASSES = {
    soldier: { hp: 120, speed: 5.5, damage: 15, color: 0x4a7da8 },
    merchant: { hp: 80, speed: 5.0, damage: 8, color: 0xe0a23c },
    engineer: { hp: 100, speed: 5.2, damage: 10, color: 0x5fa05a },
    commander: { hp: 150, speed: 4.8, damage: 12, color: 0xc4452f }
  };

  // ===== WEAPONS =====
  var WEAPONS = {
    rifle:  { name: "ไรเฟิล",   mag: 30, reserve: 90,  fireRate: 120, dmg: 18, range: 80,  spread: 0.018, recoil: 0.012, reloadTime: 1800, auto: true,  color: 0x8a8a8a, bulletSpeed: 100 },
    smg:    { name: "ปืนกลMT",  mag: 50, reserve: 150, fireRate: 70,  dmg: 10, range: 50,  spread: 0.038, recoil: 0.009, reloadTime: 1500, auto: true,  color: 0x6a6a8a, bulletSpeed: 90 },
    sniper: { name: "สไนเปอร์", mag: 5,  reserve: 20,  fireRate: 900, dmg: 85, range: 160, spread: 0.002, recoil: 0.055, reloadTime: 2600, auto: false, color: 0x3a3a3a, bulletSpeed: 200, zoomFov: 15 }
  };
  var WEAPON_KEYS = ["rifle", "smg", "sniper"];

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
    // simple gun (box) pointing forward
    var gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    gun.position.set(0.3, 1.0, -0.3);
    G.playerMesh.add(gun);
    G.playerMesh.visible = false; // hidden in 1st person
    G.scene.add(G.playerMesh);

    // camera mode: 1st or 3rd person
    G.cameraMode = "first"; // "first" or "third"
    G.cameraDistance = 4.5;

    // ===== GUN MODEL (attached to camera for 1st person) =====
    G.gunGroup = new THREE.Group();
    // gun body
    var gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
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
    // muzzle flash (hidden by default)
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
    document.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      if (G.mouseLocked) toggleZoom();
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

    // camera toggle button
    var camBtn = document.createElement("div");
    camBtn.id = "camToggle";
    camBtn.style.cssText = "position:fixed;right:20px;top:180px;width:48px;height:48px;border-radius:50%;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3);z-index:15;display:flex;align-items:center;justify-content:center;font-size:9px;color:#eee;font-family:monospace;cursor:pointer;touch-action:none";
    camBtn.textContent = "1st";
    camBtn.title = "สลับมุมกล้อง (V)";
    camBtn.addEventListener("click", function () { toggleCamera(); });
    document.body.appendChild(camBtn);

    // ===== LAYOUT EDIT MODE BUTTON =====
    var layoutBtn = document.createElement("div");
    layoutBtn.id = "layoutToggle";
    layoutBtn.style.cssText = "position:fixed;left:50%;top:10px;transform:translateX(-50%);width:80px;height:28px;border-radius:4px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3);z-index:25;display:flex;align-items:center;justify-content:center;font-size:10px;color:#eee;font-family:monospace;cursor:pointer;touch-action:none";
    layoutBtn.textContent = "จัดปุ่ม";
    layoutBtn.addEventListener("click", function () { toggleLayoutMode(); });
    document.body.appendChild(layoutBtn);

    // keyboard hotkey V to toggle camera, R to reload, 1/2/3 weapon switch
    window.addEventListener("keydown", function (e) {
      if (e.code === "KeyV") toggleCamera();
      if (e.code === "KeyR") startReload();
      if (e.code === "Digit1") switchWeapon(0);
      if (e.code === "Digit2") switchWeapon(1);
      if (e.code === "Digit3") switchWeapon(2);
    });

    // ===== TOUCH CONTROLS =====
    initTouchControls();

    animate();
  }

  // ===== TOUCH CONTROLS (mobile) =====
  function initTouchControls() {
    G.touch = {
      joyActive: false, joyX: 0, joyY: 0, joyId: null,
      lookId: null, lookX: 0, lookY: 0,
      shooting: false, reloading: false,
      crouching: false,
      jumpTriggered: false,
      sprinting: false
    };
    var isMobile = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    if (!isMobile) return;

    var W = window.innerWidth;
    var H = window.innerHeight;
    var halfW = W / 2;
    var halfH = H / 2;

    // === QUADRANT ZONES ===
    // Q1 = left-bottom: joystick movement
    // Q2 = left-top: shoot / hold reload
    // Q3 = right-top: crouch / hold prone
    // Q4 = right-bottom: look drag / tap jump

    // --- Q1: joystick (left-bottom) ---
    var joy = document.createElement("div");
    joy.id = "touchJoy";
    joy.style.cssText = "position:fixed;left:20px;bottom:20px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.25);z-index:20;touch-action:none";
    var nub = document.createElement("div");
    nub.id = "touchNub";
    nub.style.cssText = "position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.4)";
    joy.appendChild(nub);
    document.body.appendChild(joy);
    registerLayoutBtn(joy, "joystick");

    // --- Q2: shoot button (left-top) ---
    var shootBtn = document.createElement("div");
    shootBtn.id = "touchShoot";
    shootBtn.style.cssText = "position:fixed;left:20px;top:70px;width:80px;height:80px;border-radius:50%;background:rgba(196,69,47,0.65);border:2px solid rgba(255,255,255,0.35);z-index:20;display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-family:monospace;touch-action:none";
    shootBtn.textContent = "ยิง";
    document.body.appendChild(shootBtn);
    registerLayoutBtn(shootBtn, "shoot");

    var shootHint = document.createElement("div");
    shootHint.style.cssText = "position:fixed;left:20px;top:155px;font-size:9px;color:rgba(255,255,255,0.5);z-index:20;font-family:monospace;text-align:center;width:80px";
    shootHint.textContent = "กดค้าง=ยิงรัว";
    document.body.appendChild(shootHint);

    // --- Q3: crouch button (right-top) ---
    var crouchBtn = document.createElement("div");
    crouchBtn.id = "touchCrouch";
    crouchBtn.style.cssText = "position:fixed;right:80px;top:70px;width:64px;height:64px;border-radius:50%;background:rgba(74,125,168,0.5);border:2px solid rgba(255,255,255,0.3);z-index:20;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-family:monospace;touch-action:none";
    crouchBtn.textContent = "ย่อ";
    document.body.appendChild(crouchBtn);
    registerLayoutBtn(crouchBtn, "crouch");

    var crouchHint = document.createElement("div");
    crouchHint.id = "crouchHint";
    crouchHint.style.cssText = "position:fixed;right:80px;top:140px;font-size:9px;color:rgba(255,255,255,0.5);z-index:20;font-family:monospace;text-align:center;width:64px";
    crouchHint.textContent = "กดค้าง=หมอบ";
    document.body.appendChild(crouchHint);

    // --- Q4: look zone (right-bottom) ---
    var lookZone = document.createElement("div");
    lookZone.id = "lookZone";
    lookZone.style.cssText = "position:fixed;right:0;bottom:0;width:" + halfW + "px;height:" + halfH + "px;z-index:5;touch-action:none";
    document.body.appendChild(lookZone);

    // --- Q4 buttons: reload + sprint (right-bottom, above look zone) ---
    var reloadBtn = document.createElement("div");
    reloadBtn.id = "touchReload";
    reloadBtn.style.cssText = "position:fixed;right:90px;bottom:20px;width:60px;height:60px;border-radius:50%;background:rgba(224,162,60,0.6);border:2px solid rgba(255,255,255,0.3);z-index:20;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-family:monospace;touch-action:none";
    reloadBtn.textContent = "รีโหลด";
    document.body.appendChild(reloadBtn);
    registerLayoutBtn(reloadBtn, "reload");

    var sprintBtn = document.createElement("div");
    sprintBtn.id = "touchSprint";
    sprintBtn.style.cssText = "position:fixed;right:160px;bottom:20px;width:56px;height:56px;border-radius:50%;background:rgba(74,125,168,0.5);border:2px solid rgba(255,255,255,0.3);z-index:20;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-family:monospace;touch-action:none";
    sprintBtn.textContent = "วิ่ง";
    document.body.appendChild(sprintBtn);
    registerLayoutBtn(sprintBtn, "sprint");

    var lookHint = document.createElement("div");
    lookHint.style.cssText = "position:fixed;right:20px;bottom:85px;font-size:9px;color:rgba(255,255,255,0.4);z-index:20;font-family:monospace;text-align:right";
    lookHint.textContent = "ลาก=มอง | แตะ=กระโดด";
    document.body.appendChild(lookHint);

    // ===== JOYSTICK (Q1) =====
    joy.addEventListener("touchstart", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      var t = e.changedTouches[0];
      G.touch.joyActive = true;
      G.touch.joyId = t.identifier;
      updateJoystick(t.clientX, t.clientY);
    }, { passive: false });

    joy.addEventListener("touchmove", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === G.touch.joyId) updateJoystick(t.clientX, t.clientY);
      }
    }, { passive: false });

    joy.addEventListener("touchend", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === G.touch.joyId) {
          G.touch.joyActive = false;
          G.touch.joyId = null;
          G.touch.joyX = 0;
          G.touch.joyY = 0;
          nub.style.left = "50%";
          nub.style.top = "50%";
        }
      }
    }, { passive: false });

    function updateJoystick(tx, ty) {
      var rect = joy.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var dx = tx - cx, dy = ty - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      var maxR = rect.width / 2;
      if (d > maxR) { dx = (dx / d) * maxR; dy = (dy / d) * maxR; }
      G.touch.joyX = dx / maxR;
      G.touch.joyY = dy / maxR;
      nub.style.left = (50 + (dx / maxR) * 40) + "%";
      nub.style.top = (50 + (dy / maxR) * 40) + "%";
    }

    // ===== SHOOT (Q2 — hold = auto-fire) =====
    shootBtn.addEventListener("touchstart", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      G.touch.shooting = true;
      shoot();
      shootBtn.style.background = "rgba(196,69,47,0.9)";
    }, { passive: false });

    shootBtn.addEventListener("touchend", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      G.touch.shooting = false;
      shootBtn.style.background = "rgba(196,69,47,0.65)";
    }, { passive: false });

    // auto-fire while holding (use weapon fireRate, not fixed 150ms)
    var autoFireInterval = setInterval(function () {
      if (G.touch.shooting && currentWeapon().auto) shoot();
    }, 50);

    // ===== RELOAD (Q4 — right-bottom) =====
    reloadBtn.addEventListener("touchstart", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      startReload();
      reloadBtn.style.background = "rgba(224,162,60,0.9)";
      setTimeout(function () {
        reloadBtn.style.background = "rgba(224,162,60,0.6)";
      }, currentWeapon().reloadTime);
    }, { passive: false });

    // ===== SPRINT (Q4 — right-bottom) =====
    var sprinting = false;
    sprintBtn.addEventListener("touchstart", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      sprinting = !sprinting;
      sprintBtn.style.background = sprinting ? "rgba(74,157,74,0.8)" : "rgba(74,125,168,0.5)";
      G.touch.sprinting = sprinting;
    }, { passive: false });

    // ===== CROUCH / PRONE (Q3 — toggle, stays until pressed again) =====
    // 1 tap = crouch (stays), 2nd tap = prone (stays), 3rd tap = stand
    var crouchState = 0; // 0=stand, 1=crouch, 2=prone
    crouchBtn.addEventListener("touchstart", function (e) {
      if (layoutMode) return; // skip game action in layout mode
      e.preventDefault();
      crouchState = (crouchState + 1) % 3;
      if (crouchState === 0) {
        // stand
        G.touch.crouching = false;
        G.touch.prone = false;
        crouchBtn.textContent = "ย่อ";
        crouchBtn.style.background = "rgba(74,125,168,0.5)";
      } else if (crouchState === 1) {
        // crouch — stays
        G.touch.crouching = true;
        G.touch.prone = false;
        crouchBtn.textContent = "ย่อ";
        crouchBtn.style.background = "rgba(74,157,74,0.7)";
      } else {
        // prone — stays
        G.touch.crouching = false;
        G.touch.prone = true;
        crouchBtn.textContent = "หมอบ";
        crouchBtn.style.background = "rgba(90,60,40,0.8)";
      }
    }, { passive: false });

    // ===== WEAPON SWITCH BUTTONS (top-center) =====
    var wpnBar = document.createElement("div");
    wpnBar.id = "weaponBar";
    wpnBar.style.cssText = "position:fixed;top:50px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:15";
    document.body.appendChild(wpnBar);
    WEAPON_KEYS.forEach(function (wk, i) {
      var wb = document.createElement("div");
      wb.id = "wpnBtn" + i;
      wb.style.cssText = "padding:5px 12px;background:rgba(20,20,40,0.7);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:#aaa;font-family:monospace;font-size:10px;cursor:pointer;touch-action:none";
      wb.textContent = (i + 1) + " " + WEAPONS[wk].name;
      wb.addEventListener("touchstart", function (e) {
        e.preventDefault();
        switchWeapon(i);
      }, { passive: false });
      wb.addEventListener("click", function () { switchWeapon(i); });
      wpnBar.appendChild(wb);
      registerLayoutBtn(wb, "wpn" + i);
    });

    // ===== ZOOM / AIM BUTTON (right side, above reload) =====
    var zoomBtn = document.createElement("div");
    zoomBtn.id = "touchZoom";
    zoomBtn.style.cssText = "position:fixed;right:90px;bottom:90px;width:56px;height:56px;border-radius:50%;background:rgba(74,125,168,0.5);border:2px solid rgba(255,255,255,0.3);z-index:20;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-family:monospace;touch-action:none";
    zoomBtn.textContent = "เล็ง";
    document.body.appendChild(zoomBtn);
    registerLayoutBtn(zoomBtn, "zoom");
    zoomBtn.addEventListener("touchstart", function (e) {
      if (layoutMode) return;
      e.preventDefault();
      toggleZoom();
      zoomBtn.style.background = G.zooming ? "rgba(74,157,74,0.8)" : "rgba(74,125,168,0.5)";
    }, { passive: false });
    zoomBtn.addEventListener("click", function () { toggleZoom(); });

    // ===== LOOK / JUMP (Q4) =====
    lookZone.addEventListener("touchstart", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (G.touch.lookId === null) {
          G.touch.lookId = t.identifier;
          G.touch.lookX = t.clientX;
          G.touch.lookY = t.clientY;
          G.touch.lookStartX = t.clientX;
          G.touch.lookStartY = t.clientY;
          G.touch.lookMoved = false;
        }
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
          // track if moved enough (to distinguish tap=jump from drag=look)
          var totalMove = Math.abs(t.clientX - G.touch.lookStartX) + Math.abs(t.clientY - G.touch.lookStartY);
          if (totalMove > 15) G.touch.lookMoved = true;
        }
      }
    }, { passive: false });

    lookZone.addEventListener("touchend", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === G.touch.lookId) {
          // tap (no significant move) = jump
          if (!G.touch.lookMoved) {
            G.touch.jumpTriggered = true;
          }
          G.touch.lookId = null;
        }
      }
    }, { passive: false });

    // hide crosshair on mobile
    var ch = document.getElementById("crosshair");
    if (ch) ch.style.display = "none";

    // update controls hint
    var ctrl = document.getElementById("controls");
    if (ctrl) ctrl.textContent = "ซ้ายล่าง:เดิน | ซ้ายบน:ยิงรัว | ขวาบน:ย่อ/หมอบ | ขวาล่าง:มอง/กระโดด/รีโหลด/วิ่ง";
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
      btn.textContent = "จัดปุ่ม";
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
  }

  function startReload() {
    var w = currentWeapon();
    var ammo = currentAmmo();
    if (ammo.reloading) return;
    if (ammo.mag >= w.mag) return;
    if (ammo.reserve <= 0) return;
    ammo.reloading = true;
    ammo.reloadStart = Date.now();
    toast("รีโหลด " + w.name + "...");
  }

  function finishReload() {
    var w = currentWeapon();
    var ammo = currentAmmo();
    if (!ammo.reloading) return;
    var needed = w.mag - ammo.mag;
    var take = Math.min(needed, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
    ammo.reloading = false;
    updateAmmoDisplay();
  }

  function updateAmmoDisplay() {
    var el = document.getElementById("ammoDisplay");
    if (!el) return;
    var ammo = currentAmmo();
    var w = currentWeapon();
    if (ammo.reloading) {
      el.textContent = "รีโหลด...";
      el.style.color = "#e0a23c";
    } else {
      el.textContent = ammo.mag + " / " + ammo.reserve;
      el.style.color = ammo.mag === 0 ? "#e0584a" : "#eee";
    }
  }

  function updateReload() {
    var ammo = currentAmmo();
    if (!ammo.reloading) return;
    var w = currentWeapon();
    if (Date.now() - ammo.reloadStart >= w.reloadTime) finishReload();
  }

  // ===== SHOOT =====
  function shoot() {
    if (G.dead) return;
    var w = currentWeapon();
    var ammo = currentAmmo();
    if (ammo.reloading) return;
    if (Date.now() - G.lastShoot < w.fireRate) return;
    if (ammo.mag <= 0) {
      // auto reload on empty
      startReload();
      return;
    }

    G.lastShoot = Date.now();
    ammo.mag--;
    updateAmmoDisplay();

    // muzzle flash
    if (G.muzzleFlash) {
      G.muzzleFlash.material.opacity = 1;
      G.muzzleFlash.scale.set(1, 1, 1);
      setTimeout(function () { if (G.muzzleFlash) G.muzzleFlash.material.opacity = 0; }, 50);
    }
    // gun recoil animation
    if (G.gunGroup) {
      G.gunGroup.position.z = -0.35;
      setTimeout(function () { if (G.gunGroup) G.gunGroup.position.z = -0.5; }, 80);
    }

    // get camera direction
    var camDir = new THREE.Vector3();
    G.camera.getWorldDirection(camDir);

    // apply spread (more if moving, less if zooming)
    var moveSpread = isMoving() ? w.spread * 2.5 : w.spread;
    var zoomMult = G.zooming ? 0.3 : 1.0;
    moveSpread *= zoomMult;
    var recoilAdd = G.currentRecoil;
    var totalSpread = moveSpread + recoilAdd;
    camDir.x += (Math.random() - 0.5) * totalSpread;
    camDir.y += (Math.random() - 0.5) * totalSpread;
    camDir.z += (Math.random() - 0.5) * totalSpread;
    camDir.normalize();

    // accumulate recoil (recovers over time in animate)
    G.currentRecoil += w.recoil;
    if (G.currentRecoil > w.spread * 8) G.currentRecoil = w.spread * 8;
    // kick camera up slightly
    G.pitch += w.recoil * 0.5;

    // check remote players (cone check + distance)
    var hitId = null, hitDist = Infinity, hitHead = false;
    if (typeof NET !== "undefined" && NET.players.size > 0) {
      NET.players.forEach(function (p, id) {
        if (p.dead) return;
        var dx = p.tx - G.player.x, dz = p.tz - G.player.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d > w.range) return;
        var toTarget = new THREE.Vector3(dx, 0, dz).normalize();
        var dot = camDir.dot(toTarget);
        // tighter cone for sniper, wider for smg
        var coneThreshold = w.spread < 0.005 ? 0.998 : 0.94;
        if (dot > coneThreshold && d < hitDist) {
          hitId = id; hitDist = d;
          // headshot: aiming up and target close-ish
          if (camDir.y < -0.15 && d < w.range * 0.6) hitHead = true;
        }
      });
    }

    if (hitId) {
      var dmg = w.dmg;
      // damage falloff: half damage at max range
      var falloff = 1 - (hitDist / w.range) * 0.5;
      dmg = Math.round(dmg * falloff);
      if (hitHead) dmg = Math.round(dmg * 2.2);
      netSend({ t: "hit", id: hitId, dmg: dmg, weapon: currentWeaponKey(), headshot: hitHead });
      // hit marker
      G.hitMarker = Date.now();
      // impact effect at hit location
      if (typeof NET !== "undefined" && NET.players.get(hitId)) {
        var hp = NET.players.get(hitId);
        spawnImpact(hp.tx, 1.0, hp.tz);
        spawnBlood(hp.tx, 1.0, hp.tz);
      }
    }

    // send shoot visual to server
    netSend({
      t: "shoot",
      weapon: currentWeaponKey(),
      x: G.player.x, y: G.player.y, z: G.player.z,
      dx: camDir.x, dy: camDir.y, dz: camDir.z
    });

    // spawn visible bullet (tracer)
    var startPos = new THREE.Vector3(G.player.x, G.player.y - 0.1, G.player.z);
    spawnBullet(startPos, camDir, w.bulletSpeed);

    flashCrosshair();
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
      if (G.touch.sprinting) speed *= 1.6;
    }

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
        hp: G.player.hp, anim: anim
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
  function updateRemotes(dt) {
    if (typeof NET === "undefined") return;
    NET.players.forEach(function (p, id) {
      if (p.tx == null) return;
      // lerp
      if (!p.mesh) {
        var geo = new THREE.CylinderGeometry(0.4, 0.4, 1.4, 8);
        var mat = new THREE.MeshLambertMaterial({ color: CLASSES[p.class] ? CLASSES[p.class].color : 0x888888 });
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
      p.mesh.position.x += (p.tx - p.mesh.position.x) * Math.min(1, dt * 10);
      p.mesh.position.z += (p.tz - p.mesh.position.z) * Math.min(1, dt * 10);
      p.mesh.position.y = p.dead ? -5 : 0.8;
      p.mesh.rotation.y = p.ry || 0;
      p.tag.position.x = p.mesh.position.x;
      p.tag.position.z = p.mesh.position.z;
      // update name tag
      p.tagCtx.clearRect(0, 0, 128, 32);
      p.tagCtx.fillStyle = "rgba(0,0,0,0.6)";
      p.tagCtx.fillRect(0, 0, 128, 32);
      p.tagCtx.fillStyle = "#eee";
      p.tagCtx.font = "12px monospace";
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
      // remote players
      ctx.fillStyle = "#e0584a";
      NET.players.forEach(function (p) {
        if (p.dead) return;
        ctx.fillRect((p.tx + 100) * scale - 1, (p.tz + 100) * scale - 1, 3, 3);
      });
    }
    // self
    ctx.fillStyle = "#e0a23c";
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
    updateReload();

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

    // weapon bar highlight
    for (var wi = 0; wi < 3; wi++) {
      var btn = document.getElementById("wpnBtn" + wi);
      if (btn) {
        if (wi === G.weaponIdx) {
          btn.style.borderColor = "#e0a23c";
          btn.style.color = "#e0a23c";
          btn.style.background = "rgba(224,162,60,0.2)";
        } else {
          btn.style.borderColor = "rgba(255,255,255,0.2)";
          btn.style.color = "#aaa";
          btn.style.background = "rgba(20,20,40,0.7)";
        }
      }
    }

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

    G.renderer.render(G.scene, G.camera);
  }

  // ===== CLASS SELECT =====
  document.querySelectorAll(".classCard").forEach(function (card) {
    card.addEventListener("click", function () {
      try {
        var cls = card.dataset.class;
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
        if (G.scene) netConnect(name, cls);
      } catch (e) {
        console.error("init failed:", e);
        alert("เกิดข้อผิดพลาด: " + e.message + "\nกรุณารีเฟรชหน้า");
      }
    });
  });

  window.toast = function (text) {
    var div = document.createElement("div");
    div.style.cssText = "position:fixed;top:140px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);padding:5px 12px;border-radius:3px;font-size:11px;z-index:30;animation:tf 2s forwards";
    div.textContent = text;
    document.body.appendChild(div);
    setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 2000);
  };
})();
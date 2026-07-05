// room.js — GameRoom: tick loop, players, units, combat, economy
import { CLASSES, UNITS, WEAPONS, CLASS_WEAPONS, STAMINA_CONFIG, WORLD, FACTIONS, resolveClass, defaultEquipment, itemForSlot, loadoutForClass, CAPTURE_POINTS, ROUND_CONFIG, RESOURCE_CONFIG, RESOURCE_NODES, WAREHOUSES, BUILDINGS, MAP_BOUNDS } from "./classes.js";
import { encode, decode, clamp, PROTO_VERSION } from "./protocol.js";

const TICK_MS = 66; // ~15 Hz
const TICK_RATE = 1000 / TICK_MS;
const RESPAWN_MS = 5000;
const INCOME_INTERVAL_MS = 3000; // เงินเข้าทุก 3 วินาที

// --- Server authority constants ---
const MAX_POS_RATE = 30;        // max pos packets per second per player
const MAX_SHOOT_RATE = 15;     // max shoot packets per second per player
const POS_WINDOW_MS = 1000;    // rate limit window
const TELEPORT_THRESHOLD = 8;  // max units moved per packet (safety margin)
const SPEED_TOLERANCE = 1.5;   // allow client to be slightly faster than class speed
const MAX_Y = 50;              // max height (anti-fly)

const rand = (a, b) => a + Math.random() * (b - a);
const yawForward = (ry = 0) => ({ x: -Math.sin(ry), z: -Math.cos(ry) });
const dot2 = (ax, az, bx, bz) => ax * bx + az * bz;
const len2 = (x, z) => Math.sqrt(x * x + z * z) || 1;
function getEquippedItem(p) {
  const item = itemForSlot(p.class, p.equippedSlot) || defaultEquipment(p.class).equippedItem;
  if (item && (!p.equippedItem || p.equippedItem.id !== item.id)) p.equippedItem = item;
  return item;
}
function combatDefForItem(item, p) {
  if (!item) return null;
  const base = CLASS_WEAPONS[p.class] || CLASS_WEAPONS.infantry;
  if (item.id === "shield") return { ...base, id: "shield", name: "Shield", damage: 8, range: 3.2, cooldown: 800, staminaCost: 10, coneCos: 0.35, buildingDamage: 4, canBlock: true, blockReduction: 0.65, blockConeCos: 0.25 };
  if (item.id === "axe") return { ...base, id: "axe", name: "Axe", damage: 10, range: 3.8, cooldown: 850, staminaCost: 12, coneCos: 0.35, buildingDamage: 10 };
  if (item.id === "pickaxe") return { ...base, id: "pickaxe", name: "Pickaxe", damage: 10, range: 3.8, cooldown: 850, staminaCost: 12, coneCos: 0.35, buildingDamage: 12 };
  if (item.id === "commander_sword") return { ...base, id: "commander_sword", name: "Commander Sword" };
  if (item.id === "sword") return { ...base, id: "sword", name: "Sword" };
  if (item.id === "bow") return { ...base, id: "bow", name: "Bow" };
  return base;
}
function isFrontalBlock(target, attacker) {
  const item = getEquippedItem(target);
  const def = combatDefForItem(item, target);
  if (!def?.canBlock || !target.blocking || target.stamina <= 0) return false;
  const toAttackerX = attacker.x - target.x;
  const toAttackerZ = attacker.z - target.z;
  const d = len2(toAttackerX, toAttackerZ);
  const f = yawForward(target.ry);
  return dot2(f.x, f.z, toAttackerX / d, toAttackerZ / d) >= (def.blockConeCos ?? 0.25);
}
function applyClassDamage(target, attacker, baseDamage) {
  let dmg = baseDamage;
  if (isFrontalBlock(target, attacker)) {
    const item = getEquippedItem(target);
    const def = combatDefForItem(item, target);
    dmg = Math.max(1, Math.round(dmg * (1 - (def.blockReduction || 0.6))));
    target.stamina = clamp((target.stamina || 0) - 10, 0, target.maxStamina || STAMINA_CONFIG.max);
  }
  target.hp -= dmg;
  return dmg;
}

export class GameRoom {
  constructor() {
    this.players = new Map(); // id -> {ws,name,class,hp,x,y,z,rx,ry,level,gold,units,score,lastIncome,last}
    this.units = [];          // shared AI units
    this._uid = 1;
    // deep copy capture points so we don't mutate the config export
    this.capturePoints = CAPTURE_POINTS.map(cp => ({ ...cp }));
    // round state
    this.factionScores = { ironhold: ROUND_CONFIG.initialScore, verdant: ROUND_CONFIG.initialScore };
    this.lastScoreTick = Date.now();
    this.roundWinner = null;       // faction that won, null during active round
    this.roundResetAt = 0;         // timestamp when new round starts (after countdown)
    // resource state
    this.resourceNodes = RESOURCE_NODES.map(n => ({ ...n }));
    this.factionResources = {
      ironhold: { ...RESOURCE_CONFIG.initialFactionResources },
      verdant:  { ...RESOURCE_CONFIG.initialFactionResources }
    };
    this.lastNodeRegen = Date.now();
    // Phase 8: building state
    this.buildings = []; // {id, type, faction, x, z, rot, hp, maxHp}
    this.rallyFlags = { ironhold: null, verdant: null }; // building id or null
    this._bid = 1;
    this.timer = setInterval(() => this.update(), TICK_MS);
    this.lastTick = Date.now();
  }

  onConnect(ws) {
    ws.id = Math.random().toString(36).slice(2, 9);
    ws.isAlive = true;
    ws.on("message", (buf) => this.onMessage(ws, buf));
    ws.on("close", () => this.onClose(ws));
    ws.on("pong", () => { ws.isAlive = true; });
    ws.send(encode({
      t: "welcome",
      v: PROTO_VERSION,
      id: ws.id,
      players: this.snapshotPlayers(),
      units: this.snapshotUnits()
    }));
  }

  onMessage(ws, buf) {
    try { this._onMessage(ws, buf); }
    catch (e) { console.error("onMessage:", e); }
  }

  _onMessage(ws, buf) {
    const m = decode(buf);
    if (!m || typeof m.t !== "string") return;

    if (m.t === "join") {
      const cls = resolveClass(m.class); // backward-compatible class resolution, fallback infantry
      const faction = FACTIONS[m.faction] ? m.faction : "ironhold";
      const sp = FACTIONS[faction].spawn;
      const eq = defaultEquipment(cls);
      this.players.set(ws.id, {
        ws,
        name: String(m.name || "player").slice(0, 16),
        class: cls,
        faction,
        hp: CLASSES[cls].hp,
        maxHp: CLASSES[cls].hp,
        x: sp.x + rand(-5, 5), y: 0, z: sp.z + rand(-5, 5),
        prevX: sp.x, prevZ: sp.z, // for speed/teleport check
        rx: 0, ry: 0,
        level: 1,
        gold: 100,
        units: [],
        score: 0,
        kills: 0,
        deaths: 0,
        dead: false,
        respawnAt: 0,
        lastIncome: Date.now(),
        last: Date.now(),
        lastPosTime: 0,
        posCount: 0,
        posWindowStart: Date.now(),
        shootCount: 0,
        shootWindowStart: Date.now(),
        lastHitTime: 0,
        lastShootTime: 0,
        lastClassAttackTime: 0,
        stamina: STAMINA_CONFIG.max,
        maxStamina: STAMINA_CONFIG.max,
        blocking: false,
        blockStartedAt: 0,
        sprinting: false,
        anim: "idle",
        equippedSlot: eq.equippedSlot,
        equippedItem: eq.equippedItem,
        inventory: { wood: 0, stone: 0 }, // Phase 7: player resource inventory
        lastGatherTime: 0
      });
      return;
    }

    const p = this.players.get(ws.id);
    if (!p) return;
    // dead players cannot send movement
    if (p.dead) return;
    p.last = Date.now();

    const now = Date.now();

    if (m.t === "pos") {
      // --- rate limit: max N pos packets per second ---
      if (now - p.posWindowStart > POS_WINDOW_MS) {
        p.posWindowStart = now;
        p.posCount = 0;
      }
      p.posCount++;
      if (p.posCount > MAX_POS_RATE) return; // drop packet

      const newX = clamp(+m.x || p.x, -WORLD.W, WORLD.W);
      const newY = clamp(+m.y || 0, 0, MAX_Y);
      const newZ = clamp(+m.z || p.z, -WORLD.D, WORLD.D);

      // --- teleport rejection: check distance moved since last position ---
      const dx = newX - p.x;
      const dz = newZ - p.z;
      const distMoved = Math.sqrt(dx * dx + dz * dz);
      const timeDelta = (now - (p.lastPosTime || now)) / 1000;
      p.lastPosTime = now;

      // allow first packet (no previous position)
      if (p.prevX !== undefined && timeDelta > 0) {
        const classSpeed = CLASSES[p.class].speed;
        const maxSpeed = (classSpeed + SPEED_TOLERANCE) * Math.max(timeDelta, 0.1);
        // hard teleport threshold: if moved more than threshold in one tick, reject
        if (distMoved > TELEPORT_THRESHOLD && distMoved > maxSpeed) {
          // reject: keep old position, don't update
          return;
        }
      }

      p.prevX = p.x;
      p.prevZ = p.z;
      p.x = newX;
      p.y = newY;
      p.z = newZ;
      p.rx = +m.rx || 0;
      p.ry = +m.ry || 0;
      p.anim = m.anim || "idle";
      p.sprinting = !!m.sprinting;
    } else if (m.t === "selectItem") {
      const item = itemForSlot(p.class, +m.slot);
      if (!item) {
        try { ws.send(encode({ t: "event", kind: "selectReject", data: { reason: "Invalid slot" } })); } catch {}
        return;
      }
      p.equippedSlot = item.slot;
      p.equippedItem = item;
      p.blocking = false;
      this.broadcast({ t: "event", kind: "selectItem", data: { from: ws.id, slot: item.slot, itemId: item.id } }, ws.id);
    } else if (m.t === "block") {
      const item = getEquippedItem(p);
      const def = combatDefForItem(item, p);
      p.blocking = !!m.active && item?.secondaryAction === "block" && !!def?.canBlock && p.stamina > 0;
      p.blockStartedAt = p.blocking ? now : 0;
      this.broadcast({
        t: "event",
        kind: "block",
        data: { from: ws.id, active: p.blocking }
      }, ws.id);
    } else if (m.t === "classAttack") {
      this.handleClassAttack(ws, p, m, now);
    } else if (m.t === "shoot") {
      // --- rate limit shoots ---
      if (now - p.shootWindowStart > POS_WINDOW_MS) {
        p.shootWindowStart = now;
        p.shootCount = 0;
      }
      p.shootCount++;
      if (p.shootCount > MAX_SHOOT_RATE) return;

      // relay shoot event to all other players for visual
      this.broadcast({
        t: "event",
        kind: "shoot",
        data: { from: ws.id, x: m.x, y: m.y, z: m.z, dx: m.dx, dy: m.dy, dz: m.dz }
      }, ws.id);
    } else if (m.t === "melee") {
      // relay melee swing to other players for visual
      this.broadcast({
        t: "event",
        kind: "melee",
        data: { from: ws.id, x: m.x, y: m.y, z: m.z, dx: m.dx, dz: m.dz }
      }, ws.id);
    } else if (m.t === "hit") {
      // player reports hitting another player
      const wpn = WEAPONS[m.weapon] || WEAPONS.rifle;
      // --- weapon cooldown validation (server-side) ---
      const meleeCd = 600;
      const gunCd = m.weapon === "melee" ? meleeCd : 100; // min 100ms between hits
      if (now - p.lastHitTime < gunCd) return;

      // server-side damage cap: can't exceed weapon base * 2.5 (headshot)
      const maxDmg = Math.round(wpn.dmg * 2.5);
      const dmg = clamp(+m.dmg || 0, 0, maxDmg);
      const tgt = this.players.get(m.id);
      if (!tgt || tgt.dead || m.id === ws.id || dmg <= 0) return;
      // --- friendly fire off: same faction can't damage each other ---
      if (tgt.faction === p.faction) return;
      // All validation passed — set cooldown timer now
      p.lastHitTime = now;
      const dx = (tgt.x - p.x), dz = (tgt.z - p.z);
      const distSq = dx * dx + dz * dz;
      if (distSq > wpn.range * wpn.range) return; // range check by weapon
      tgt.hp -= dmg;
      if (tgt.hp <= 0) {
        tgt.dead = true;
        tgt.deaths++;
        tgt.respawnAt = Date.now() + RESPAWN_MS;
        p.kills++;
        p.score += m.headshot ? 20 : 10;
        p.gold += m.headshot ? 35 : 20;
        this.broadcast({
          t: "event",
          kind: "kill",
          data: { killer: ws.id, killerName: p.name, victim: m.id, victimName: tgt.name, headshot: !!m.headshot }
        });
      }
    } else if (m.t === "buyUnit") {
      const unitDef = UNITS[m.unit];
      if (!unitDef) return;
      if (p.level < unitDef.reqLevel) return;
      if (p.gold < unitDef.cost) return;
      p.gold -= unitDef.cost;
      const unit = {
        id: this._uid++,
        owner: ws.id,
        type: m.unit,
        x: p.x + rand(-5, 5),
        z: p.z + rand(-5, 5),
        hp: unitDef.hp,
        maxHp: unitDef.hp,
        target: null
      };
      this.units.push(unit);
      p.units.push(unit.id);
      this.broadcast({
        t: "event",
        kind: "buy",
        data: { player: ws.id, unit: m.unit, unitId: unit.id }
      });
    } else if (m.t === "ping") {
      ws.send(encode({ t: "pong" }));
    } else if (m.t === "gather") {
      // Phase 9.9: Worker gathers with equipped tool, explicit reject reasons for UI.
      const rejectGather = (reason) => {
        try { ws.send(encode({ t: "event", kind: "gatherReject", data: { reason } })); } catch {}
        return;
      };
      if (p.class !== "worker") return rejectGather("ต้องเป็นคนงานเท่านั้น");
      const item = getEquippedItem(p);
      if (!item || item.itemType !== "tool") return rejectGather("ต้องถือเครื่องมือ");
      const node = this.resourceNodes.find(n => n.id === m.nodeId);
      if (!node || node.amount <= 0) return rejectGather("ทรัพยากรหมด");
      if (item.gatherType !== node.type) return rejectGather(node.type === "wood" ? "ต้องถือขวาน" : "ต้องถือพลั่ว");
      if (now - p.lastGatherTime < RESOURCE_CONFIG.gatherCooldown) return rejectGather("ยังไม่พร้อม");
      const dx = p.x - node.x, dz = p.z - node.z;
      if (dx * dx + dz * dz > RESOURCE_CONFIG.gatherRadius * RESOURCE_CONFIG.gatherRadius) return rejectGather("อยู่ไกลเกินไป");
      // check inventory capacity
      if (p.inventory[node.type] >= RESOURCE_CONFIG.carryCapacity) return rejectGather("กระเป๋าเต็ม");
      // all validation passed
      p.lastGatherTime = now;
      const amount = Math.min(RESOURCE_CONFIG.gatherAmount, node.amount, RESOURCE_CONFIG.carryCapacity - p.inventory[node.type]);
      node.amount -= amount;
      p.inventory[node.type] += amount;
      p.gold += 1; // small reward for gathering
    } else if (m.t === "deposit") {
      // Phase 7: deposit resources at faction warehouse
      const wh = WAREHOUSES[p.faction];
      if (!wh) return;
      const dx = p.x - wh.x, dz = p.z - wh.z;
      if (dx * dx + dz * dz > wh.radius * wh.radius) return;
      // move resources from inventory to faction resources
      let totalDeposited = 0;
      for (const res of ["wood", "stone"]) {
        const amt = p.inventory[res] || 0;
        if (amt > 0) {
          this.factionResources[p.faction][res] = (this.factionResources[p.faction][res] || 0) + amt;
          p.gold += amt * RESOURCE_CONFIG.depositReward;
          totalDeposited += amt;
          p.inventory[res] = 0;
        }
      }
      if (totalDeposited > 0) {
        p.score += totalDeposited; // contribution score
      }
    } else if (m.t === "build") {
      // Phase 8: Commander builds walls and rally flags
      const rejectBuild = (reason) => {
        try { ws.send(encode({ t: "event", kind: "buildReject", data: { reason } })); } catch {}
        return;
      };
      if (p.class !== "commander") return rejectBuild("Commander required");
      const item = getEquippedItem(p);
      if (!item || item.itemType !== "blueprint") return rejectBuild("Blueprint required");
      const requestedType = m.buildingType || item.buildType;
      if (requestedType !== item.buildType) return rejectBuild("Wrong blueprint");
      const def = BUILDINGS[requestedType];
      if (!def) return rejectBuild("Unknown building");
      if (now - (p.lastBuildTime || 0) < def.buildCooldown) return rejectBuild("Build cooldown");
      // validate placement distance
      const bx = +m.x, bz = +m.z;
      if (isNaN(bx) || isNaN(bz)) return rejectBuild("Invalid placement");
      const bdx = bx - p.x, bdz = bz - p.z;
      if (bdx * bdx + bdz * bdz > def.buildDistance * def.buildDistance) return rejectBuild("Too far from Commander");
      // validate map bounds
      if (bx < MAP_BOUNDS.minX || bx > MAP_BOUNDS.maxX || bz < MAP_BOUNDS.minZ || bz > MAP_BOUNDS.maxZ) return rejectBuild("Outside map bounds");
      // validate not overlapping capture point
      for (const cp of this.capturePoints) {
        const cpdx = bx - cp.x, cpdz = bz - cp.z;
        if (cpdx * cpdx + cpdz * cpdz < (cp.radius + 2) * (cp.radius + 2)) return rejectBuild("Too close to capture point");
      }
      // validate not overlapping warehouse
      for (const fac of Object.keys(WAREHOUSES)) {
        const wh = WAREHOUSES[fac];
        const whdx = bx - wh.x, whdz = bz - wh.z;
        if (whdx * whdx + whdz * whdz < (wh.radius + 2) * (wh.radius + 2)) return rejectBuild("Too close to warehouse");
      }
      // validate not overlapping resource nodes
      for (const node of this.resourceNodes) {
        const ndx = bx - node.x, ndz = bz - node.z;
        if (ndx * ndx + ndz * ndz < 16) return rejectBuild("Too close to resource node"); // 4 unit buffer
      }
      // validate not overlapping existing buildings
      for (const b of this.buildings) {
        const bldx = bx - b.x, bldz = bz - b.z;
        if (bldx * bldx + bldz * bldz < 9) return rejectBuild("Too close to another building"); // 3 unit buffer
      }
      // one Rally Flag per faction
      if (def.onePerFaction && this.rallyFlags[p.faction]) return rejectBuild("Rally Flag already exists");
      // check faction resources
      const fr = this.factionResources[p.faction];
      if (!fr || fr.wood < (def.cost.wood || 0) || fr.stone < (def.cost.stone || 0)) return rejectBuild("Not enough faction resources");
      // all validation passed — build!
      p.lastBuildTime = now;
      fr.wood -= (def.cost.wood || 0);
      fr.stone -= (def.cost.stone || 0);
      const building = {
        id: this._bid++,
        type: requestedType,
        faction: p.faction,
        x: bx,
        z: bz,
        rot: +m.rot || 0,
        hp: def.hp,
        maxHp: def.hp
      };
      this.buildings.push(building);
      if (def.onePerFaction) {
        this.rallyFlags[p.faction] = building.id;
      }
      this.broadcast({
        t: "event",
        kind: "build",
        data: { id: building.id, type: building.type, faction: building.faction, x: building.x, z: building.z, hp: building.hp }
      });
    } else if (m.t === "attackBuilding") {
      // Phase 9: class weapon building attack, enemy buildings only.
      const bld = this.buildings.find(b => b.id === m.id);
      if (!bld) return;
      if (bld.faction === p.faction) return; // friendly fire blocked
      const bdef = BUILDINGS[bld.type];
      const item = getEquippedItem(p);
      const wdef = combatDefForItem(item, p);
      if (!bdef || !wdef || item?.itemType === "blueprint") return;
      if (now - (p.lastClassAttackTime || 0) < wdef.cooldown) return;
      if ((p.stamina || 0) < wdef.staminaCost) return;
      const bdx = bld.x - p.x, bdz = bld.z - p.z;
      const dist = len2(bdx, bdz);
      if (dist > wdef.range) return;
      const f = yawForward(p.ry);
      if (dist >= 0.5 && dot2(f.x, f.z, bdx / dist, bdz / dist) < wdef.coneCos) return;
      p.lastClassAttackTime = now;
      p.stamina = clamp(p.stamina - wdef.staminaCost, 0, p.maxStamina || STAMINA_CONFIG.max);
      const dmg = wdef.buildingDamage || Math.ceil(wdef.damage / 2);
      bld.hp -= dmg;
      this.broadcast({ t: "event", kind: "classAttack", data: { from: ws.id, weapon: wdef.id, buildingId: bld.id, damage: dmg } });
      if (bld.hp <= 0) {
        this.buildings = this.buildings.filter(b => b.id !== bld.id);
        if (this.rallyFlags[bld.faction] === bld.id) {
          this.rallyFlags[bld.faction] = null;
        }
        this.broadcast({
          t: "event",
          kind: "buildingDestroyed",
          data: { id: bld.id, type: bld.type, faction: bld.faction }
        });
      }
    }
  }

  onClose(ws) {
    // remove player's units
    this.units = this.units.filter(u => u.owner !== ws.id);
    this.players.delete(ws.id);
  }

  handleClassAttack(ws, p, m, now = Date.now()) {
    const rejectAttack = (reason) => {
      try { ws.send(encode({ t: "event", kind: "classAttackReject", data: { reason } })); } catch {}
      return;
    };
    const item = getEquippedItem(p);
    const def = combatDefForItem(item, p);
    if (!def || item?.itemType === "blueprint") return rejectAttack("ถืออาวุธก่อน");
    if (p.dead) return rejectAttack("ตายอยู่");
    if (now - (p.lastClassAttackTime || 0) < def.cooldown) return rejectAttack("ยังไม่พร้อม");
    if ((p.stamina || 0) < def.staminaCost) return rejectAttack("แรงไม่พอ");

    const dirX = Number.isFinite(+m.dx) ? +m.dx : yawForward(p.ry).x;
    const dirZ = Number.isFinite(+m.dz) ? +m.dz : yawForward(p.ry).z;
    const dirLen = len2(dirX, dirZ);
    const nx = dirX / dirLen;
    const nz = dirZ / dirLen;

    // Bow needs a short server-visible draw time. Direct tests may pass drawMs.
    if (def.mode === "ranged" && (+m.drawMs || 0) < (def.drawTime || 0)) return;

    // Building target path — enemies only, class weapon building damage.
    if (m.buildingId !== undefined && m.buildingId !== null) {
      const bld = this.buildings.find(b => b.id === +m.buildingId);
      if (!bld || bld.faction === p.faction) return rejectAttack("เป้าหมายไม่ถูกต้อง");
      const bx = bld.x - p.x;
      const bz = bld.z - p.z;
      const dist = len2(bx, bz);
      if (dist > def.range) return rejectAttack("อยู่ไกลเกินไป");
      if (dist >= 0.5 && dot2(nx, nz, bx / dist, bz / dist) < def.coneCos) return rejectAttack("ไม่ได้หันหาเป้าหมาย");
      p.lastClassAttackTime = now;
      p.stamina = clamp(p.stamina - def.staminaCost, 0, p.maxStamina || STAMINA_CONFIG.max);
      bld.hp -= def.buildingDamage || Math.ceil(def.damage / 2);
      this.broadcast({ t: "event", kind: "classAttack", data: { from: ws.id, weapon: def.id, buildingId: bld.id, damage: def.buildingDamage || Math.ceil(def.damage / 2) } });
      if (bld.hp <= 0) {
        this.buildings = this.buildings.filter(b => b.id !== bld.id);
        if (this.rallyFlags[bld.faction] === bld.id) this.rallyFlags[bld.faction] = null;
        this.broadcast({ t: "event", kind: "buildingDestroyed", data: { id: bld.id, type: bld.type, faction: bld.faction } });
      }
      return;
    }

    const tgt = this.players.get(m.id);
    if (!tgt || tgt.dead || tgt.ws.id === ws.id) {
      if (m.swing && (item?.itemType === "melee" || item?.itemType === "tool" || item?.itemType === "shield")) {
        p.lastClassAttackTime = now;
        p.stamina = clamp(p.stamina - def.staminaCost, 0, p.maxStamina || STAMINA_CONFIG.max);
        this.broadcast({ t: "event", kind: "classAttack", data: { from: ws.id, target: null, weapon: def.id, damage: 0, blocked: false, reason: "miss" } });
        return;
      }
      return rejectAttack("ไม่พบเป้าหมาย");
    }
    if (tgt.faction === p.faction) return rejectAttack("ห้ามตีพวกเดียวกัน"); // friendly fire remains blocked
    const tx = tgt.x - p.x;
    const tz = tgt.z - p.z;
    const dist = len2(tx, tz);
    if (dist > def.range) return rejectAttack("อยู่ไกลเกินไป");
    if (dot2(nx, nz, tx / dist, tz / dist) < def.coneCos) return rejectAttack("ฟันพลาด");

    p.lastClassAttackTime = now;
    p.stamina = clamp(p.stamina - def.staminaCost, 0, p.maxStamina || STAMINA_CONFIG.max);
    const blocked = isFrontalBlock(tgt, p);
    const damageDone = applyClassDamage(tgt, p, def.damage);
    this.broadcast({ t: "event", kind: "classAttack", data: { from: ws.id, target: tgt.ws.id, weapon: def.id, damage: damageDone, blocked } });
    if (tgt.hp <= 0) {
      tgt.dead = true;
      tgt.blocking = false;
      tgt.deaths++;
      tgt.respawnAt = Date.now() + RESPAWN_MS;
      p.kills++;
      p.score += 10;
      p.gold += 20;
      this.broadcast({
        t: "event",
        kind: "kill",
        data: { killer: ws.id, killerName: p.name, victim: tgt.ws.id, victimName: tgt.name, weapon: def.id }
      });
    }
  }

  update() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    // Phase 9 stamina loop: sprint/block drain, idle regen.
    for (const p of this.players.values()) {
      if (p.dead) {
        p.blocking = false;
        p.sprinting = false;
        continue;
      }
      if (p.blocking) {
        p.stamina = clamp((p.stamina ?? STAMINA_CONFIG.max) - STAMINA_CONFIG.blockDrainPerSecond * dt, 0, p.maxStamina || STAMINA_CONFIG.max);
        if (p.stamina <= 0) p.blocking = false;
      } else if (p.sprinting) {
        p.stamina = clamp((p.stamina ?? STAMINA_CONFIG.max) - STAMINA_CONFIG.sprintCostPerSecond * dt, 0, p.maxStamina || STAMINA_CONFIG.max);
        if (p.stamina <= 0) p.sprinting = false;
      } else {
        p.stamina = clamp((p.stamina ?? STAMINA_CONFIG.max) + STAMINA_CONFIG.regenPerSecond * dt, 0, p.maxStamina || STAMINA_CONFIG.max);
      }
    }

    // income
    for (const p of this.players.values()) {
      if (now - p.lastIncome >= INCOME_INTERVAL_MS) {
        const cls = CLASSES[p.class];
        p.gold += cls.income;
        p.lastIncome = now;
        // level up: every 100 score
        const newLevel = Math.floor(p.score / 100) + 1;
        if (newLevel > p.level) {
          p.level = newLevel;
          this.broadcast({
            t: "event",
            kind: "levelup",
            data: { player: p.ws.id, level: newLevel }
          });
        }
      }
      // respawn — at Rally Flag if alive, otherwise faction base
      if (p.dead && now >= p.respawnAt) {
        let spawnX, spawnZ;
        // check if faction has alive rally flag
        const rfId = this.rallyFlags[p.faction];
        const rf = rfId ? this.buildings.find(b => b.id === rfId) : null;
        if (rf) {
          spawnX = rf.x + rand(-3, 3);
          spawnZ = rf.z + rand(-3, 3);
        } else {
          const fsp = FACTIONS[p.faction] ? FACTIONS[p.faction].spawn : { x: 0, z: 0 };
          spawnX = fsp.x + rand(-5, 5);
          spawnZ = fsp.z + rand(-5, 5);
        }
        p.dead = false;
        p.hp = p.maxHp;
        p.x = spawnX;
        p.z = spawnZ;
        p.prevX = p.x;
        p.prevZ = p.z;
        this.broadcast({
          t: "event",
          kind: "respawn",
          data: { id: p.ws.id, x: p.x, z: p.z }
        });
      }
    }

    // unit AI: move toward nearest enemy player
    for (const u of this.units) {
      const owner = this.players.get(u.owner);
      if (!owner) continue;
      // find nearest enemy (different faction)
      let nearest = null, nd = Infinity;
      for (const p of this.players.values()) {
        if (p.ws.id === u.owner || p.dead) continue;
        if (p.faction === owner.faction) continue; // same faction skip
        const dx = p.x - u.x, dz = p.z - u.z;
        const d = dx * dx + dz * dz;
        if (d < nd) { nd = d; nearest = p; }
      }
      if (nearest && nd < 100 * 100) {
        const def = UNITS[u.type];
        const dx = nearest.x - u.x, dz = nearest.z - u.z;
        const d = Math.sqrt(nd) || 1;
        u.x += (dx / d) * def.speed * dt;
        u.z += (dz / d) * def.speed * dt;
        // attack if close
        if (nd < 15 * 15) {
          nearest.hp -= def.damage * dt;
          if (nearest.hp <= 0 && !nearest.dead) {
            nearest.dead = true;
            nearest.deaths++;
            nearest.respawnAt = now + RESPAWN_MS;
            owner.kills++;
            owner.score += 5;
            this.broadcast({
              t: "event",
              kind: "kill",
              data: { killer: u.owner, killerName: owner.name + "'s " + UNITS[u.type].name, victim: nearest.ws.id, victimName: nearest.name }
            });
          }
        }
      }
    }

    // ===== CAPTURE POINTS =====
    for (const cp of this.capturePoints) {
      // count alive players inside radius by faction
      let ironCount = 0, verdantCount = 0;
      for (const p of this.players.values()) {
        if (p.dead) continue;
        const dx = p.x - cp.x, dz = p.z - cp.z;
        if (dx * dx + dz * dz <= cp.radius * cp.radius) {
          if (p.faction === "ironhold") ironCount++;
          else if (p.faction === "verdant") verdantCount++;
        }
      }

      // determine capture state
      if (ironCount > verdantCount) {
        cp.contested = false;
        cp.capturing = "ironhold";
        cp.progress = clamp(cp.progress + cp.captureRate * dt, 0, 100);
      } else if (verdantCount > ironCount) {
        cp.contested = false;
        cp.capturing = "verdant";
        cp.progress = clamp(cp.progress + cp.captureRate * dt, 0, 100);
      } else if (ironCount > 0 && verdantCount > 0 && ironCount === verdantCount) {
        // equal players from both factions = contested, pause progress
        cp.contested = true;
        cp.capturing = null;
      } else {
        // no players inside or both zero = pause, no contest
        cp.contested = false;
        cp.capturing = null;
      }

      // check if capture complete
      if (cp.progress >= 100 && cp.capturing) {
        const oldOwner = cp.owner;
        cp.owner = cp.capturing;
        cp.progress = 0; // reset progress after capture
        cp.capturing = null;
        if (oldOwner !== cp.owner) {
          console.log("[Capture] Central Fort captured by", cp.owner, "(was", oldOwner + ")");
          this.broadcast({
            t: "event",
            kind: "capture",
            data: { id: cp.id, name: cp.name, owner: cp.owner, prevOwner: oldOwner }
          });
        }
      }
    }

    // ===== RESOURCE NODE REGEN =====
    if (now - this.lastNodeRegen >= RESOURCE_CONFIG.nodeRegenInterval) {
      this.lastNodeRegen = now;
      for (const node of this.resourceNodes) {
        if (node.amount < node.maxAmount) {
          node.amount = Math.min(node.maxAmount, node.amount + RESOURCE_CONFIG.nodeRegenAmount);
        }
      }
    }

    // ===== FACTION SCORE + ROUND LOOP =====
    if (!this.roundWinner) {
      // active round: award score to faction owning central fort
      if (now - this.lastScoreTick >= ROUND_CONFIG.scoreInterval) {
        this.lastScoreTick = now;
        for (const cp of this.capturePoints) {
          if (cp.owner) {
            this.factionScores[cp.owner] = (this.factionScores[cp.owner] || 0) + ROUND_CONFIG.scorePerTick;
          }
        }
        // check win condition
        for (const fac of Object.keys(this.factionScores)) {
          if (this.factionScores[fac] >= ROUND_CONFIG.winScore) {
            this.roundWinner = fac;
            this.roundResetAt = now + ROUND_CONFIG.roundResetDelay;
            console.log("[Round] " + fac + " wins with " + this.factionScores[fac] + " points!");
            this.broadcast({
              t: "event",
              kind: "roundWin",
              data: { winner: fac, winnerName: FACTIONS[fac].name, scores: { ...this.factionScores } }
            });
            break;
          }
        }
      }
    } else {
      // round over: wait for countdown, then reset
      if (now >= this.roundResetAt) {
        this.resetRound();
      }
    }

    // broadcast snapshot with capture data + round state
    this.broadcast({
      t: "snapshot",
      players: this.snapshotPlayers(),
      units: this.snapshotUnits(),
      capturePoints: this.snapshotCapturePoints(),
      factionScores: { ...this.factionScores },
      roundWinner: this.roundWinner,
      roundResetAt: this.roundResetAt,
      resourceNodes: this.snapshotResourceNodes(),
      factionResources: { ...this.factionResources },
      warehouses: WAREHOUSES,
      buildings: this.snapshotBuildings(),
      rallyFlags: { ...this.rallyFlags }
    });
  }

  snapshotPlayers() {
    const arr = [];
    for (const p of this.players.values()) {
      arr.push({
        id: p.ws.id,
        name: p.name,
        class: p.class,
        faction: p.faction,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        z: Math.round(p.z * 10) / 10,
        rx: p.rx, ry: p.ry,
        hp: Math.round(p.hp),
        maxHp: p.maxHp,
        level: p.level,
        gold: p.gold,
        kills: p.kills,
        deaths: p.deaths,
        dead: p.dead,
        stamina: Math.round((p.stamina ?? STAMINA_CONFIG.max) * 10) / 10,
        maxStamina: p.maxStamina || STAMINA_CONFIG.max,
        blocking: !!p.blocking,
        equippedSlot: p.equippedSlot || 1,
        equippedItem: getEquippedItem(p),
        loadout: loadoutForClass(p.class),
        weapon: combatDefForItem(getEquippedItem(p), p)?.id || "unknown",
        anim: p.anim,
        inventory: p.inventory ? { ...p.inventory } : { wood: 0, stone: 0 }
      });
    }
    return arr;
  }

  snapshotUnits() {
    return this.units.map(u => ({
      id: u.id,
      owner: u.owner,
      type: u.type,
      x: Math.round(u.x * 10) / 10,
      z: Math.round(u.z * 10) / 10,
      hp: Math.round(u.hp),
      maxHp: u.maxHp
    }));
  }

  snapshotCapturePoints() {
    return this.capturePoints.map(cp => ({
      id: cp.id,
      name: cp.name,
      x: cp.x,
      z: cp.z,
      radius: cp.radius,
      owner: cp.owner,
      capturing: cp.capturing,
      progress: Math.round(cp.progress * 10) / 10,
      contested: cp.contested
    }));
  }

  snapshotResourceNodes() {
    return this.resourceNodes.map(n => ({
      id: n.id,
      type: n.type,
      x: n.x,
      z: n.z,
      amount: Math.round(n.amount),
      maxAmount: n.maxAmount
    }));
  }

  snapshotBuildings() {
    return this.buildings.map(b => ({
      id: b.id,
      type: b.type,
      faction: b.faction,
      x: b.x,
      z: b.z,
      rot: b.rot,
      hp: Math.round(b.hp),
      maxHp: b.maxHp
    }));
  }

  resetRound() {
    // reset scores
    this.factionScores = { ironhold: ROUND_CONFIG.initialScore, verdant: ROUND_CONFIG.initialScore };
    this.lastScoreTick = Date.now();
    this.roundWinner = null;
    this.roundResetAt = 0;
    // reset capture points
    for (const cp of this.capturePoints) {
      cp.owner = null;
      cp.capturing = null;
      cp.progress = 0;
      cp.contested = false;
    }
    // clear temporary units
    this.units = [];
    // Phase 8: clear buildings and rally flags on round reset
    this.buildings = [];
    this.rallyFlags = { ironhold: null, verdant: null };
    // Phase 7: reset resource nodes, faction resources, and player inventories on round reset
    this.resourceNodes = RESOURCE_NODES.map(n => ({ ...n }));
    this.factionResources = {
      ironhold: { ...RESOURCE_CONFIG.initialFactionResources },
      verdant:  { ...RESOURCE_CONFIG.initialFactionResources }
    };
    // respawn all players at faction base
    for (const p of this.players.values()) {
      const fsp = FACTIONS[p.faction] ? FACTIONS[p.faction].spawn : { x: 0, z: 0 };
      p.dead = false;
      p.hp = p.maxHp;
      p.x = fsp.x + rand(-5, 5);
      p.z = fsp.z + rand(-5, 5);
      p.prevX = p.x;
      p.prevZ = p.z;
      p.kills = 0;
      p.deaths = 0;
      p.score = 0;
      p.inventory = { wood: 0, stone: 0 }; // reset player inventory
    }
    console.log("[Round] New round started");
    this.broadcast({
      t: "event",
      kind: "roundReset",
      data: {}
    });
  }

  broadcast(msg, exceptId) {
    const data = encode(msg);
    for (const p of this.players.values()) {
      if (exceptId && p.ws.id === exceptId) continue;
      if (p.ws.readyState === 1) {
        try { p.ws.send(data); } catch {}
      }
    }
  }

  humanCount() { return this.players.size; }
}
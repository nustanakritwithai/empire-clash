// room.js — GameRoom: tick loop, players, units, combat, economy
import { CLASSES, UNITS, WEAPONS, WORLD } from "./classes.js";
import { encode, decode, clamp, PROTO_VERSION } from "./protocol.js";

const TICK_MS = 66; // ~15 Hz
const TICK_RATE = 1000 / TICK_MS;
const RESPAWN_MS = 5000;
const INCOME_INTERVAL_MS = 3000; // เงินเข้าทุก 3 วินาที

const rand = (a, b) => a + Math.random() * (b - a);

export class GameRoom {
  constructor() {
    this.players = new Map(); // id -> {ws,name,class,hp,x,y,z,rx,ry,level,gold,units,score,lastIncome,last}
    this.units = [];          // shared AI units
    this._uid = 1;
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
      const cls = CLASSES[m.class] ? m.class : "soldier";
      const sp = WORLD.SPAWN_POINTS[Math.floor(Math.random() * WORLD.SPAWN_POINTS.length)];
      this.players.set(ws.id, {
        ws,
        name: String(m.name || "player").slice(0, 16),
        class: cls,
        hp: CLASSES[cls].hp,
        maxHp: CLASSES[cls].hp,
        x: sp.x, y: 0, z: sp.z,
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
        anim: "idle"
      });
      return;
    }

    const p = this.players.get(ws.id);
    if (!p || p.dead) return;
    p.last = Date.now();

    if (m.t === "pos") {
      p.x = clamp(+m.x || p.x, -WORLD.W, WORLD.W);
      p.y = clamp(+m.y || 0, 0, 50);
      p.z = clamp(+m.z || p.z, -WORLD.D, WORLD.D);
      p.rx = +m.rx || 0;
      p.ry = +m.ry || 0;
      p.anim = m.anim || "idle";
    } else if (m.t === "shoot") {
      // relay shoot event to all other players for visual
      this.broadcast({
        t: "event",
        kind: "shoot",
        data: { from: ws.id, x: m.x, y: m.y, z: m.z, dx: m.dx, dy: m.dy, dz: m.dz }
      }, ws.id);
    } else if (m.t === "hit") {
      // player reports hitting another player
      const wpn = WEAPONS[m.weapon] || WEAPONS.rifle;
      // server-side damage cap: can't exceed weapon base * 2.5 (headshot)
      const maxDmg = Math.round(wpn.dmg * 2.5);
      const dmg = clamp(+m.dmg || 0, 0, maxDmg);
      const tgt = this.players.get(m.id);
      if (!tgt || tgt.dead || m.id === ws.id || dmg <= 0) return;
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
    }
  }

  onClose(ws) {
    // remove player's units
    this.units = this.units.filter(u => u.owner !== ws.id);
    this.players.delete(ws.id);
  }

  update() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    // economy: passive income
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
      // respawn
      if (p.dead && now >= p.respawnAt) {
        const sp = WORLD.SPAWN_POINTS[Math.floor(Math.random() * WORLD.SPAWN_POINTS.length)];
        p.dead = false;
        p.hp = p.maxHp;
        p.x = sp.x; p.z = sp.z;
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
      // find nearest enemy
      let nearest = null, nd = Infinity;
      for (const p of this.players.values()) {
        if (p.id === u.owner || p.dead) continue;
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

    // broadcast snapshot
    this.broadcast({
      t: "snapshot",
      players: this.snapshotPlayers(),
      units: this.snapshotUnits()
    });
  }

  snapshotPlayers() {
    const arr = [];
    for (const p of this.players.values()) {
      arr.push({
        id: p.ws.id,
        name: p.name,
        class: p.class,
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
        anim: p.anim
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
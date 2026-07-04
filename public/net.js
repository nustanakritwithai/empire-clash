// net.js — WebSocket client layer for Empire Clash
(function () {
  "use strict";
  var WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
  var NET = { ws: null, id: null, connected: false, players: new Map(), units: [], events: [], capturePoints: [], factionScores: { ironhold: 0, verdant: 0 }, roundWinner: null, roundResetAt: 0, resourceNodes: [], factionResources: { ironhold: { wood: 0, stone: 0 }, verdant: { wood: 0, stone: 0 } }, warehouses: {}, buildings: [], rallyFlags: { ironhold: null, verdant: null } };
  window.NET = NET;

  function netSend(o) {
    if (NET.connected && NET.ws && NET.ws.readyState === 1) {
      try { NET.ws.send(JSON.stringify(o)); } catch (e) {}
    }
  }
  window.netSend = netSend;

  function netConnect(name, cls, faction) {
    try { NET.ws = new WebSocket(WS_URL); } catch (e) { NET.connected = false; return; }
    NET.ws.onopen = function () {
      NET.connected = true;
      netSend({ t: "join", name: name, class: cls, faction: faction || "ironhold" });
      if (typeof toast === "function") toast("เชื่อมต่อเซิร์ฟเวอร์แล้ว");
    };
    NET.ws.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (err) { return; }
      netHandle(m);
    };
    NET.ws.onclose = function () {
      NET.connected = false;
      setTimeout(function () { if (window.G && G.playerName) netConnect(G.playerName, G.playerClass, G.playerFaction); }, 2000);
    };
    NET.ws.onerror = function () {};
  }
  window.netConnect = netConnect;

  function netHandle(m) {
    if (!m || !m.t) return;
    if (m.t === "welcome") {
      NET.id = m.id;
      if (m.players) m.players.forEach(function (p) { if (p.id !== NET.id) NET.players.set(p.id, p); });
      if (m.units) NET.units = m.units;
    } else if (m.t === "snapshot") {
      // update remote players
      var seen = {};
      (m.players || []).forEach(function (p) {
        if (p.id === NET.id) {
          // update our own HP/gold/level from server
          if (typeof G !== "undefined" && G.player) {
            G.player.hp = p.hp; G.player.maxHp = p.maxHp;
            G.player.gold = p.gold; G.player.level = p.level;
            G.player.kills = p.kills; G.player.deaths = p.deaths;
            G.player.dead = p.dead;
            G.player.stamina = p.stamina; G.player.maxStamina = p.maxStamina; G.player.blocking = p.blocking; G.player.weapon = p.weapon;
            G.player.equippedSlot = p.equippedSlot; G.player.equippedItem = p.equippedItem; G.player.loadout = p.loadout || [];
            if (typeof window !== "undefined" && typeof window.updateHotbar === "function") window.updateHotbar();
            if (p.inventory) G.player.inventory = p.inventory;
          }
          return;
        }
        seen[p.id] = 1;
        var e = NET.players.get(p.id);
        if (!e) { e = { x: p.x, y: p.y, z: p.z }; NET.players.set(p.id, e); }
        e.id = p.id; e.name = p.name; e.class = p.class; e.faction = p.faction;
        e.tx = p.x; e.ty = p.y; e.tz = p.z; e.rx = p.rx; e.ry = p.ry;
        e.hp = p.hp; e.maxHp = p.maxHp; e.dead = p.dead; e.anim = p.anim;
        e.stamina = p.stamina; e.maxStamina = p.maxStamina; e.blocking = p.blocking; e.weapon = p.weapon;
        e.equippedSlot = p.equippedSlot; e.equippedItem = p.equippedItem; e.loadout = p.loadout || [];
      });
      NET.players.forEach(function (v, k) { if (!seen[k]) NET.players.delete(k); });
      NET.units = m.units || [];
      NET.capturePoints = m.capturePoints || [];
      NET.factionScores = m.factionScores || { ironhold: 0, verdant: 0 };
      NET.roundWinner = m.roundWinner || null;
      NET.roundResetAt = m.roundResetAt || 0;
      NET.resourceNodes = m.resourceNodes || [];
      NET.factionResources = m.factionResources || { ironhold: { wood: 0, stone: 0 }, verdant: { wood: 0, stone: 0 } };
      NET.warehouses = m.warehouses || {};
      NET.buildings = m.buildings || [];
      NET.rallyFlags = m.rallyFlags || { ironhold: null, verdant: null };
    } else if (m.t === "event") {
      NET.events.push(m);
      if (NET.events.length > 20) NET.events.shift();
    }
  }
})();
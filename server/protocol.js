// protocol.js — message shapes for Empire Clash
export const PROTO_VERSION = 1;

export function encode(obj) {
  return JSON.stringify(obj);
}

export function decode(buf) {
  try {
    return JSON.parse(typeof buf === "string" ? buf : buf.toString());
  } catch {
    return null;
  }
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/*
Client -> Server
  { t:"join", name, class:"soldier"|"merchant"|"engineer"|"commander" }
  { t:"pos", x, y, z, rx, ry, hp, anim }
  { t:"shoot", x, y, z, dx, dy, dz }
  { t:"hit", id, dmg }
  { t:"buyUnit", unit:"infantry"|"archer"|"cavalry" }
  { t:"ping" }

Server -> Client
  { t:"welcome", v, id, city, players, units }
  { t:"snapshot", players:[...], units:[...] }
  { t:"event", kind:"hit"|"kill"|"buy"|"spawn"|"respawn", data }
  { t:"pong" }
*/
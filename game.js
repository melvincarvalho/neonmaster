// NEON MASTER — a tribute to Dungeon Master (FTL Games, 1987)
// Copyright © 2026 Melvin Carvalho — AGPL-3.0-or-later
// Zero assets: every pixel and every sound is generated from code.

'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 1280, H = 720;
const HUD_H = 152, MQ = 34;
const VX = 40, VY = MQ + 10, VVW = 880, VVH = H - MQ - HUD_H - 24;   // the dungeon eye
const MONO = '"Courier New", monospace';
const SIMSTEP = 1 / 60;

// ---------- deterministic RNG ----------
let _seed = 1;
function srand(s) { _seed = (s >>> 0) || 1; }
function rand() {
  _seed ^= _seed << 13; _seed >>>= 0;
  _seed ^= _seed >> 17;
  _seed ^= _seed << 5; _seed >>>= 0;
  return _seed / 4294967296;
}
function rng(a, b) { return a + rand() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------- audio ----------
let AC = null, AUDIO_ON = true;
function audio() { if (!AC && AUDIO_ON) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AUDIO_ON = false; } } }
function blip(f0, f1, dur, type, vol) {
  if (!AC || !AUDIO_ON) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(28, f1), t + dur);
  g.gain.setValueAtTime(vol || 0.08, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function thud(vol, dur) {
  if (!AC || !AUDIO_ON) return;
  const t = AC.currentTime;
  const len = (AC.sampleRate * dur) | 0;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) { v = v * 0.96 + (Math.random() * 2 - 1) * 0.5; d[i] = v * (1 - i / len); }
  const s = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 300;
  s.buffer = buf; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(AC.destination);
  s.start(t);
}
const SFX = {
  step: () => thud(0.05, 0.09),
  bump: () => { thud(0.1, 0.12); blip(120, 80, 0.1, 'square', 0.06); },
  turn: () => blip(300, 260, 0.04, 'sine', 0.03),
  door: () => { blip(140, 90, 0.4, 'sawtooth', 0.08); thud(0.08, 0.3); },
  swing: () => blip(220, 90, 0.12, 'sawtooth', 0.06),
  hit: () => { thud(0.1, 0.15); blip(400, 150, 0.1, 'square', 0.07); },
  hurt: () => blip(300, 90, 0.25, 'sawtooth', 0.09),
  die: () => { thud(0.2, 0.6); blip(500, 60, 0.7, 'sawtooth', 0.1); },
  monDie: () => { blip(600, 100, 0.35, 'square', 0.08); thud(0.1, 0.3); },
  rune: () => blip(700, 900, 0.08, 'sine', 0.05),
  cast: () => { blip(500, 1200, 0.2, 'sine', 0.09); blip(900, 400, 0.25, 'triangle', 0.06); },
  fizzle: () => blip(300, 80, 0.3, 'sawtooth', 0.05),
  eat: () => blip(200, 160, 0.15, 'triangle', 0.06),
  drink: () => blip(400, 700, 0.2, 'sine', 0.05),
  grab: () => blip(500, 650, 0.08, 'square', 0.05),
  key: () => { blip(800, 1100, 0.1, 'square', 0.06); blip(1100, 1400, 0.12, 'sine', 0.05); },
  plate: () => { thud(0.09, 0.2); blip(200, 300, 0.15, 'square', 0.06); },
  teleport: () => { blip(300, 1400, 0.3, 'sine', 0.09); blip(1400, 300, 0.3, 'sine', 0.06); },
  fall: () => { blip(600, 100, 0.5, 'sawtooth', 0.1); thud(0.18, 0.5); },
  stairs: () => { blip(400, 550, 0.15, 'triangle', 0.07); blip(550, 700, 0.15, 'triangle', 0.06); },
  win: () => { [440, 554, 659, 880, 1109].forEach((f, i) => setTimeout(() => blip(f, f * 1.01, 0.35, 'triangle', 0.1), i * 140)); },
  fail: () => { [330, 311, 262, 196].forEach((f, i) => setTimeout(() => blip(f, f * 0.98, 0.4, 'sawtooth', 0.08), i * 170)); },
};

// ---------- the dungeon ----------
// Tile legend: # wall, . floor, D door, L locked door, P pit, > stairs down, < stairs up,
// F fountain, T pressure plate, @ teleporter pad, ~ the Core, spaces outside are void walls.
// Uppercase letters in MON/ITEM maps place monsters and items.
const FLOORS = [
  {
    name: 'THE THRESHOLD', rim: '#33d6ff',
    map: [
      '################',
      '#....#.....#...#',
      '#.##.#.###.#.#.#',
      '#.#..#...#...#.#',
      '#.#.####.###.#.#',
      '#.#....D.....#.#',
      '#.####.######..#',
      '#....#.#.....#.#',
      '###.##.#.###.#.#',
      '#...#....#.#...#',
      '#.###.####.###.#',
      '#.....L....#..>#',
      '################',
    ],
    start: [1, 1, 1],   // x, y, facing (0N 1E 2S 3W)
    monsters: [{ t: 'husk', x: 9, y: 3 }, { t: 'husk', x: 5, y: 9 }, { t: 'screamer', x: 13, y: 7 }],
    items: [
      { t: 'ration', x: 3, y: 3 }, { t: 'torch', x: 1, y: 5 },
      { t: 'key', x: 14, y: 1 }, { t: 'ration', x: 9, y: 9 },
    ],
    doors: { '7,5': {}, '6,11': { locked: true } },
  },
  {
    name: 'THE HOLLOWS', rim: '#ffd12a',
    map: [
      '################',
      '#<...#....#....#',
      '#.##.#.##.#.##.#',
      '#.#..#..#.#..#.#',
      '#.#.##P.#.##.#.#',
      '#.#....P..T#.#.#',
      '#.####P##.##.#.#',
      '#.#.......L..#.#',
      '#.#.#####.####.#',
      '#...#...F....#.#',
      '#.###.#####.##.#',
      '#.....#...#...>#',
      '################',
    ],
    start: [1, 1, 2],
    monsters: [{ t: 'screamer', x: 7, y: 3 }, { t: 'screamer', x: 3, y: 9 }, { t: 'husk', x: 11, y: 3 }, { t: 'husk', x: 8, y: 9 }],
    items: [{ t: 'torch', x: 1, y: 9 }, { t: 'ration', x: 14, y: 5 }],
    doors: { '10,7': { locked: true, plate: [10, 5] } },
  },
  {
    name: 'THE SHIFTING COURT', rim: '#b06bff',
    map: [
      '################',
      '#<..#..........#',
      '###.#.########.#',
      '#...#.#......#.#',
      '#.###.#.####.#.#',
      '#.#...#.#..@.#.#',
      '#.#.###.#.####.#',
      '#.#.#.....#....#',
      '#.#.#.#####.##.#',
      '#.#...#...#..#.#',
      '#.#####.#.##.#.#',
      '#@......#....L>#',
      '################',
    ],
    start: [1, 1, 2],
    monsters: [{ t: 'wisp', x: 9, y: 3 }, { t: 'wisp', x: 13, y: 9 }, { t: 'husk', x: 6, y: 7 }, { t: 'husk', x: 3, y: 9 }],
    items: [{ t: 'key', x: 10, y: 5 }, { t: 'ration', x: 5, y: 3 }, { t: 'torch', x: 14, y: 7 }],
    doors: { '13,11': { locked: true } },
    teleports: { '11,5': [1, 11], '1,11': [11, 5] },
  },
  {
    name: 'THE EMBER CORE', rim: '#ff5c5c',
    map: [
      '################',
      '#<.....#.......#',
      '#.#####.#####..#',
      '#.#.........#.#.',
      '#.#.#######.#.##',
      '#.#.#..~..#.#..#',
      '#.#.#.....#.##.#',
      '#.#.#..*..#..#.#',
      '#.#.###D###.##.#',
      '#.#.........#..#',
      '#.###########.##',
      '#..............#',
      '################',
    ],
    start: [1, 1, 2],
    monsters: [{ t: 'golem', x: 7, y: 9 }, { t: 'wisp', x: 13, y: 3 }, { t: 'husk', x: 3, y: 11 }, { t: 'husk', x: 11, y: 11 }],
    items: [{ t: 'ration', x: 14, y: 9 }, { t: 'torch', x: 1, y: 9 }],
    doors: { '7,8': {} },
    // '*' = the Ember Prism pedestal; '~' = the Core. Carry the prism to the Core.
  },
];
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // N E S W

// ---------- runes: the canon six powers, a working grimoire ----------
const POWER_RUNES = ['LO', 'UM', 'ON', 'EE', 'PAL', 'MON'];   // tiers 1..6
const EFFECT_RUNES = ['FUL', 'IR', 'VI', 'YA', 'DES', 'VEN', 'ZO'];
const SPELLS = [
  { runes: ['FUL'], name: 'Glow', school: 'wizard', cost: 2, desc: 'Conjured torchlight' },
  { runes: ['FUL', 'IR'], name: 'Fireball', school: 'wizard', cost: 5, desc: 'A bolt of fire down the corridor' },
  { runes: ['DES', 'VEN'], name: 'Venom Bolt', school: 'wizard', cost: 4, desc: 'A gout of poison' },
  { runes: ['VI'], name: 'Mend', school: 'priest', cost: 3, desc: 'Knit the caster\'s wounds' },
  { runes: ['YA'], name: 'Vigour', school: 'priest', cost: 2, desc: 'Restore the caster\'s stamina' },
  { runes: ['ZO'], name: 'Open', school: 'wizard', cost: 3, desc: 'Command the door ahead' },
];

const MON_DEFS = {
  husk: { name: 'VAULT HUSK', hp: 34, dmg: [8, 14], cool: 1.5, speed: 0.9, xp: 14, col: '#7fdcff', ranged: false },
  screamer: { name: 'SPORE SCREAMER', hp: 14, dmg: [2, 5], cool: 2.2, speed: 1.3, xp: 6, col: '#5aff9e', ranged: false, food: true },
  wisp: { name: 'ARC WISP', hp: 22, dmg: [6, 12], cool: 2.0, speed: 1.1, xp: 18, col: '#ffd12a', ranged: true },
  golem: { name: 'EMBER WARDEN', hp: 260, dmg: [18, 30], cool: 1.8, speed: 1.4, xp: 120, col: '#ff5c5c', ranged: false, boss: true },
};

let G = null;

function parseFloor(fi) {
  const F = FLOORS[fi];
  const rows = F.map;
  const grid = [];
  let prism = null, core = null;
  for (let y = 0; y < rows.length; y++) {
    grid[y] = [];
    for (let x = 0; x < rows[y].length; x++) {
      let c = rows[y][x];
      if (c === '*') { prism = [x, y]; c = '.'; }
      if (c === '~') { core = [x, y]; c = '.'; }
      grid[y][x] = c === ' ' ? '#' : c;
    }
  }
  return { grid, w: rows[0].length, h: rows.length, prism, core };
}
function tileAt(x, y) {
  const L = G.floor;
  if (x < 0 || y < 0 || y >= L.h || x >= L.w) return '#';
  return L.grid[y][x];
}
function doorState(x, y) {
  return G.doors[`${x},${y}`] || null;
}
function passable(x, y, forMonster) {
  const t = tileAt(x, y);
  if (t === '#') return false;
  if (t === 'D' || t === 'L') {
    const d = doorState(x, y);
    return d && d.open;
  }
  if (forMonster && (t === 'P' || t === '@')) return false;   // monsters shun pits and pads
  return true;
}

// ---------- game state ----------
function newGame(seed, opts) {
  opts = opts || {};
  G = {
    seed, time: 0, tick: 0, showTitle: !!opts.attract,
    floorIdx: 0, floor: null, doors: {}, monsters: [], groundItems: [], projectiles: [],
    px: 0, py: 0, facing: 2, moveT: 0, bumpT: 0, stepBob: 0,
    party: [
      mkChamp('SIRRA', 60, 14, { fight: 2, ninja: 1, priest: 0, wizard: 0 }, 'blade'),
      mkChamp('KOTH', 70, 8, { fight: 3, ninja: 0, priest: 0, wizard: 0 }, 'maul'),
      mkChamp('WREN', 45, 30, { fight: 0, ninja: 1, priest: 1, wizard: 2 }, 'staff'),
      mkChamp('ASH', 40, 34, { fight: 0, ninja: 0, priest: 2, wizard: 3 }, 'staff'),
    ],
    food: 78, water: 78, torch: 100, spareTorches: 1, glowT: 0, glowTier: 0,
    keys: 0, hasPrism: false,
    runeSeq: [], castMsg: '', castMsgT: 0,
    mode: 'play', modeT: 0, msg: [], msgT: 0,
    shake: 0, hitFlashT: 0, healFlashT: 0,
    stats: { steps: 0, kills: 0, casts: 0, meals: 0, drinks: 0, dmgDealt: 0, dmgTaken: 0, falls: 0 },
    log: [], hintT: 26,
  };
  loadFloor(0, null);
}
function mkChamp(name, hp, mana, skills, weapon) {
  return {
    name, hp, maxHp: hp, sta: 100, mana, maxMana: mana,
    skills, weapon, coolT: 0, dead: false, hurtT: 0,
    xp: { fight: 0, ninja: 0, priest: 0, wizard: 0 },
  };
}
function loadFloor(fi, from) {
  G.floorIdx = fi;
  G.floor = parseFloor(fi);
  const F = FLOORS[fi];
  G.doors = {};
  for (const k in (F.doors || {})) G.doors[k] = { ...F.doors[k], open: false };
  G.teleports = F.teleports || {};
  srand(G.seed ^ (fi * 7919));
  G.monsters = (F.monsters || []).map((m, i) => ({
    id: i, ...m, ...structuredClone(MON_DEFS[m.t]),
    hp: MON_DEFS[m.t].hp, coolT: rng(0.5, 1.5), moveT: rng(0.2, 1),
    hurtT: 0, dead: false,
  }));
  G.groundItems = (F.items || []).map(it => ({ ...it }));
  if (G.floor.prism && !G.hasPrism) G.groundItems.push({ t: 'prism', x: G.floor.prism[0], y: G.floor.prism[1] });
  G.projectiles = [];
  if (from === 'down' || from === null) { [G.px, G.py, G.facing] = F.start; }
  else { // arrived by falling: keep position (set by caller)
  }
  say(`— ${F.name} —`);
}
function say(s) { G.msg.unshift(s); if (G.msg.length > 4) G.msg.pop(); G.msgT = 5; }
function frontChamps() { return [G.party[0], G.party[1]].filter(c => !c.dead); }
function aliveChamps() { return G.party.filter(c => !c.dead); }
function lightLevel() {
  const t = clamp(G.torch / 100, 0, 1);
  return clamp(0.16 + t * 0.7 + (G.glowT > 0 ? G.glowTier * 0.12 : 0), 0.12, 1.15);
}

// ---------- actions ----------
function tryMove(dx, dy, strafe) {
  if (G.moveT > 0 || G.mode !== 'play') return false;
  const nx = G.px + dx, ny = G.py + dy;
  if (!passable(nx, ny)) {
    const t = tileAt(nx, ny);
    if ((t === 'D' || t === 'L') && !doorState(nx, ny)?.open) say(t === 'L' && !doorState(nx, ny)?.unlocked ? 'A rune-locked gate bars the way.' : 'The gate is closed.');
    G.bumpT = 0.18; SFX.bump();
    return false;
  }
  G.px = nx; G.py = ny;
  G.moveT = 0.24;
  G.stepBob += 1;
  G.stats.steps++;
  SFX.step();
  onEnterTile();
  return true;
}
function forward() { const [dx, dy] = DIRS[G.facing]; return tryMove(dx, dy); }
function backward() { const [dx, dy] = DIRS[(G.facing + 2) % 4]; return tryMove(dx, dy); }
function strafeL() { const [dx, dy] = DIRS[(G.facing + 3) % 4]; return tryMove(dx, dy, true); }
function strafeR() { const [dx, dy] = DIRS[(G.facing + 1) % 4]; return tryMove(dx, dy, true); }
function turn(dir) {
  if (G.moveT > 0 || G.mode !== 'play') return;
  G.facing = (G.facing + dir + 4) % 4;
  G.moveT = 0.16;
  SFX.turn();
}
function onEnterTile() {
  const t = tileAt(G.px, G.py);
  if (t === 'P') {
    // the floor is a lie
    SFX.fall();
    G.shake = 8;
    G.stats.falls++;
    for (const c of aliveChamps()) hurtChamp(c, 10 + rng(0, 8), 'the fall');
    const nf = G.floorIdx + 1;
    if (nf < FLOORS.length) {
      const px = G.px, py = G.py;
      loadFloor(nf, 'fall');
      G.px = px; G.py = py;
      if (!passable(G.px, G.py)) { [G.px, G.py] = [FLOORS[nf].start[0], FLOORS[nf].start[1]]; }
      say('The pit swallows you to the floor below.');
    }
    return;
  }
  if (t === '>') {
    SFX.stairs();
    const nf = G.floorIdx + 1;
    if (nf < FLOORS.length) loadFloor(nf, 'down');
    return;
  }
  if (t === 'T') {
    // plates press for whoever stands on them
    SFX.plate();
    for (const k in G.doors) {
      const d = G.doors[k];
      const def = (FLOORS[G.floorIdx].doors || {})[k];
      if (def && def.plate && def.plate[0] === G.px && def.plate[1] === G.py) {
        if (!d.open) { d.open = true; SFX.door(); say('Stone grinds: a gate opens somewhere.'); }
      }
    }
  }
  const tp = G.teleports[`${G.px},${G.py}`];
  if (tp) {
    SFX.teleport();
    G.shake = 4;
    [G.px, G.py] = tp;
    say('The world folds.');
  }
  // core victory
  if (G.floor.core && G.px === G.floor.core[0] && G.py === G.floor.core[1]) {
    if (G.hasPrism) {
      G.mode = 'won'; G.modeT = 0;
      SFX.win();
    } else {
      say('The Core hungers for the Ember Prism.');
    }
  }
}
function facingTile() {
  const [dx, dy] = DIRS[G.facing];
  return [G.px + dx, G.py + dy];
}
function useDoor() {
  const [fx, fy] = facingTile();
  const t = tileAt(fx, fy);
  const d = doorState(fx, fy);
  if ((t === 'D' || t === 'L') && d) {
    if (d.open) { d.open = false; SFX.door(); say('The gate rumbles shut.'); return true; }
    if (t === 'L' && !d.unlocked) {
      if (G.keys > 0) { G.keys--; d.unlocked = true; d.open = true; SFX.key(); SFX.door(); say('The key turns. The gate opens.'); return true; }
      say('Locked. It wants a key — or a word of command.');
      return false;
    }
    d.open = true; SFX.door(); say('The gate grinds open.');
    return true;
  }
  return false;
}
function grabHere() {
  // pick up anything on this tile or the facing tile
  for (const it of [...G.groundItems]) {
    const here = (it.x === G.px && it.y === G.py);
    const [fx, fy] = facingTile();
    const front = (it.x === fx && it.y === fy);
    if (!here && !front) continue;
    G.groundItems.splice(G.groundItems.indexOf(it), 1);
    if (it.t === 'ration') { G.rations = (G.rations || 0) + 1; say('Picked up a ration.'); }
    else if (it.t === 'torch') { G.spareTorches++; say('Picked up a torch.'); }
    else if (it.t === 'key') { G.keys++; SFX.key(); say('Picked up an iron key.'); }
    else if (it.t === 'food') { G.rations = (G.rations || 0) + 1; say('Gathered screamer flesh.'); }
    else if (it.t === 'prism') { G.hasPrism = true; say('THE EMBER PRISM. It burns cold in your hands.'); }
    SFX.grab();
    return true;
  }
  return false;
}
function eat() {
  if ((G.rations || 0) <= 0) { say('No food left.'); return false; }
  G.rations--;
  G.food = clamp(G.food + 38, 0, 100);
  G.stats.meals++;
  SFX.eat();
  say('You eat. The dark feels smaller.');
  return true;
}
function drink() {
  const [fx, fy] = facingTile();
  const here = tileAt(G.px, G.py) === 'F' || tileAt(fx, fy) === 'F';
  if (!here) { say('No water here.'); return false; }
  G.water = clamp(G.water + 50, 0, 100);
  G.stats.drinks++;
  SFX.drink();
  say('Cold water. You drink deep.');
  return true;
}
function relight() {
  if (G.spareTorches <= 0) { say('No spare torches.'); return false; }
  G.spareTorches--;
  G.torch = 100;
  say('A fresh torch takes the flame.');
  return true;
}
function swapRanks() {
  const p = G.party;
  [p[0], p[2]] = [p[2], p[0]];
  [p[1], p[3]] = [p[3], p[1]];
  say('The ranks change places.');
}

// ---------- combat ----------
const WEAPON_DMG = { blade: [7, 13], maul: [10, 18], staff: [3, 7], fist: [2, 5] };
function attack(ci) {
  const c = G.party[ci];
  if (!c || c.dead || c.coolT > 0 || G.mode !== 'play') return false;
  const isFront = ci < 2;
  const [fx, fy] = facingTile();
  const mon = G.monsters.find(m => !m.dead && m.x === fx && m.y === fy);
  c.coolT = isFront ? 1.1 : 1.5;
  c.sta = Math.max(0, c.sta - 3);
  SFX.swing();
  if (!mon) { return false; }
  if (!isFront) {
    // back rank pokes over shoulders: weaker, ninja practice
    const dmg = Math.round(rng(1, 4) + c.skills.ninja * 1.5);
    damageMonster(mon, dmg, c, 'ninja');
    return true;
  }
  const [lo, hi] = WEAPON_DMG[c.weapon] || WEAPON_DMG.fist;
  const dmg = Math.round(rng(lo, hi) + c.skills.fight * 2 + (c.sta < 20 ? -3 : 0));
  damageMonster(mon, Math.max(1, dmg), c, 'fight');
  return true;
}
function damageMonster(m, dmg, c, school) {
  m.hp -= dmg;
  m.hurtT = 0.3;
  G.stats.dmgDealt += dmg;
  SFX.hit();
  if (c && school) gainXP(c, school, dmg);
  if (m.hp <= 0 && !m.dead) {
    m.dead = true;
    G.stats.kills++;
    SFX.monDie();
    say(`The ${m.name.toLowerCase()} comes apart.`);
    if (m.food) G.groundItems.push({ t: 'food', x: m.x, y: m.y });
    for (const cc of aliveChamps()) gainXP(cc, 'fight', Math.round(m.xp / 4));
  }
}
function gainXP(c, school, amt) {
  c.xp[school] += amt;
  const before = c.skills[school];
  const need = (before + 1) * (before + 1) * 30;
  if (c.xp[school] >= need) {
    c.skills[school]++;
    c.xp[school] = 0;
    c.maxHp += 4; c.hp = Math.min(c.maxHp, c.hp + 4);
    c.maxMana += school === 'wizard' || school === 'priest' ? 3 : 1;
    say(`${c.name} advances: ${school.toUpperCase()} ${c.skills[school]}.`);
    blip(600, 900, 0.2, 'triangle', 0.08);
  }
}
function hurtChamp(c, dmg, src) {
  if (c.dead) return;
  c.hp -= dmg;
  c.hurtT = 0.5;
  G.hitFlashT = 0.25;
  G.stats.dmgTaken += Math.round(dmg);
  SFX.hurt();
  if (c.hp <= 0) {
    c.hp = 0; c.dead = true;
    SFX.die();
    say(`${c.name} falls.`);
    if (aliveChamps().length === 0) {
      G.mode = 'lost'; G.modeT = 0;
      SFX.fail();
    }
  }
}

// ---------- runes ----------
function tapRune(r) {
  if (G.mode !== 'play') return;
  SFX.rune();
  if (POWER_RUNES.includes(r)) { G.runeSeq = [r]; return; }
  if (G.runeSeq.length === 0) { say('Begin with a power rune.'); return; }
  G.runeSeq.push(r);
}
function castRunes() {
  if (G.runeSeq.length < 2) { say('The sequence is incomplete.'); SFX.fizzle(); return false; }
  const tier = POWER_RUNES.indexOf(G.runeSeq[0]) + 1;
  const effect = G.runeSeq.slice(1);
  const spell = SPELLS.find(s => s.runes.length === effect.length && s.runes.every((r, i) => r === effect[i]));
  G.runeSeq = [];
  if (!spell) { say('The runes refuse each other.'); SFX.fizzle(); return false; }
  // the best living caster of that school casts it
  let caster = null;
  for (const c of aliveChamps()) if (!caster || c.skills[spell.school] > caster.skills[spell.school]) caster = c;
  if (!caster) return false;
  const cost = spell.cost + tier;
  if (caster.mana < cost) { say(`${caster.name} lacks the mana (${cost}).`); SFX.fizzle(); return false; }
  caster.mana -= cost;
  G.stats.casts++;
  SFX.cast();
  gainXP(caster, spell.school, cost * 3);
  const power = tier + Math.floor(caster.skills[spell.school] / 2);
  if (spell.name === 'Glow') {
    G.glowT = 30 + tier * 20; G.glowTier = Math.min(4, tier);
    say('Conjured light blooms.');
  } else if (spell.name === 'Fireball' || spell.name === 'Venom Bolt') {
    const [dx, dy] = DIRS[G.facing];
    G.projectiles.push({
      x: G.px, y: G.py, dx, dy, t: 0, stepT: 0,
      dmg: spell.name === 'Fireball' ? 10 + power * 7 : 8 + power * 5,
      col: spell.name === 'Fireball' ? '#ff8c42' : '#5aff9e',
      name: spell.name,
    });
    say(`${caster.name} hurls ${spell.name.toLowerCase()}.`);
  } else if (spell.name === 'Mend') {
    caster.hp = Math.min(caster.maxHp, caster.hp + 8 + power * 6);
    G.healFlashT = 0.3;
    say(`${caster.name}'s wounds close.`);
  } else if (spell.name === 'Vigour') {
    caster.sta = Math.min(100, caster.sta + 20 + power * 10);
    say(`${caster.name} breathes easier.`);
  } else if (spell.name === 'Open') {
    const [fx, fy] = facingTile();
    const t = tileAt(fx, fy);
    const d = doorState(fx, fy);
    if ((t === 'D' || t === 'L') && d && !d.open) {
      if (t === 'L' && !d.unlocked && tier < 4) { say('The lock resists this power. (ZO needs EE or better.)'); }
      else { d.unlocked = true; d.open = true; SFX.door(); say('ZO. The gate obeys.'); }
    } else say('Nothing before you answers.');
  }
  return true;
}

// ---------- monsters ----------
function simMonsters(dt) {
  for (const m of G.monsters) {
    if (m.dead) continue;
    if (m.hurtT > 0) m.hurtT -= dt;
    m.moveT -= dt;
    m.coolT -= dt;
    const distX = G.px - m.x, distY = G.py - m.y;
    const dist = Math.abs(distX) + Math.abs(distY);
    const adjacent = dist === 1;
    if (adjacent && m.coolT <= 0) {
      m.coolT = m.cool;
      const target = frontChamps()[Math.floor(rand() * Math.max(1, frontChamps().length))] || aliveChamps()[0];
      if (target) {
        const dmg = rng(m.dmg[0], m.dmg[1]);
        hurtChamp(target, dmg, m.name);
        say(`The ${m.name.toLowerCase()} strikes ${target.name}.`);
        G.shake = Math.max(G.shake, 3);
      }
      continue;
    }
    if (m.ranged && dist <= 4 && (m.x === G.px || m.y === G.py) && m.coolT <= 0) {
      // line of sight bolt
      let blocked = false;
      const sx = Math.sign(distX), sy = Math.sign(distY);
      let cx = m.x + sx, cy = m.y + sy;
      while (cx !== G.px || cy !== G.py) { if (!passable(cx, cy, true) && tileAt(cx, cy) !== 'P') { blocked = true; break; } cx += sx; cy += sy; }
      if (!blocked) {
        m.coolT = m.cool;
        const target = aliveChamps()[Math.floor(rand() * aliveChamps().length)];
        if (target) {
          hurtChamp(target, rng(m.dmg[0], m.dmg[1]) * 0.8, m.name);
          say(`An arc bolt sears ${target ? target.name : 'the party'}.`);
        }
        continue;
      }
    }
    if (m.moveT <= 0 && dist > 1 && dist < 9) {
      m.moveT = m.speed;
      // greedy step with fallback
      const opts = [];
      if (Math.abs(distX) >= Math.abs(distY)) {
        opts.push([Math.sign(distX), 0], [0, Math.sign(distY) || 1], [0, -(Math.sign(distY) || 1)]);
      } else {
        opts.push([0, Math.sign(distY)], [Math.sign(distX) || 1, 0], [-(Math.sign(distX) || 1), 0]);
      }
      for (const [ox, oy] of opts) {
        const nx = m.x + ox, ny = m.y + oy;
        if (!passable(nx, ny, true)) continue;
        if (nx === G.px && ny === G.py) break;
        if (G.monsters.some(o => !o.dead && o !== m && o.x === nx && o.y === ny)) continue;
        m.x = nx; m.y = ny;
        break;
      }
    }
  }
}
function simProjectiles(dt) {
  for (const p of [...G.projectiles]) {
    p.stepT += dt;
    if (p.stepT < 0.12) continue;
    p.stepT = 0;
    p.x += p.dx; p.y += p.dy;
    p.t++;
    const mon = G.monsters.find(m => !m.dead && m.x === p.x && m.y === p.y);
    if (mon) {
      damageMonster(mon, p.dmg, null, null);
      say(`${p.name} bursts against the ${mon.name.toLowerCase()}.`);
      G.projectiles.splice(G.projectiles.indexOf(p), 1);
      continue;
    }
    if (!passable(p.x, p.y) || p.t > 6) {
      G.projectiles.splice(G.projectiles.indexOf(p), 1);
    }
  }
}

// ---------- world sim ----------
function sim(dt) {
  G.time += dt; G.tick++; G.modeT += dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - 18 * dt);
  if (G.hitFlashT > 0) G.hitFlashT -= dt;
  if (G.healFlashT > 0) G.healFlashT -= dt;
  if (G.castMsgT > 0) G.castMsgT -= dt;
  if (G.msgT > 0) G.msgT -= dt;
  G.hintT = Math.max(0, G.hintT - dt);
  if (G.mode !== 'play') return;
  if (G.moveT > 0) G.moveT -= dt;
  // survival drains: hunger, thirst, torchlight
  G.food = Math.max(0, G.food - dt * 0.55);
  G.water = Math.max(0, G.water - dt * 0.7);
  G.torch = Math.max(0, G.torch - dt * 0.85);
  if (G.glowT > 0) G.glowT -= dt;
  for (const c of aliveChamps()) {
    if (c.coolT > 0) c.coolT -= dt;
    if (c.hurtT > 0) c.hurtT -= dt;
    c.sta = Math.min(100, c.sta + dt * 1.2);
    c.mana = Math.min(c.maxMana, c.mana + dt * 0.25);
    if (G.food <= 0 || G.water <= 0) {
      hurtQuiet(c, dt * 1.1);
    } else if (c.hp < c.maxHp && G.food > 30 && G.water > 30) {
      c.hp = Math.min(c.maxHp, c.hp + dt * 0.35);   // rest heals the fed
    }
  }
  simMonsters(dt);
  simProjectiles(dt);
}
function hurtQuiet(c, dmg) {
  c.hp -= dmg;
  if (c.hp <= 0 && !c.dead) {
    c.hp = 0; c.dead = true;
    SFX.die();
    say(`${c.name} succumbs to the dark.`);
    if (aliveChamps().length === 0) { G.mode = 'lost'; G.modeT = 0; SFX.fail(); }
  }
}

// ---------- the dungeon eye: a first-person view built from nested planes ----------
function planeRect(k) {
  const s = [1.18, 0.74, 0.48, 0.335, 0.245, 0.185][Math.min(k, 5)];
  const cx = VX + VVW / 2, cy = VY + VVH / 2 + VVH * 0.02;
  return { x: cx - VVW * s / 2, y: cy - VVH * s / 2, w: VVW * s, h: VVH * s, cx, cy };
}
function cellX(k, o) {
  // lateral center of cell offset o at plane k
  const p = planeRect(k);
  return p.cx + o * p.w * 0.62;
}
function cellEdge(k, j) {
  const p = planeRect(k);
  return p.cx + j * p.w * 0.62;
}
function tileFrom(d, o) {
  const [fx, fy] = DIRS[G.facing];
  const [rx, ry] = DIRS[(G.facing + 1) % 4];
  return [G.px + fx * d + rx * o, G.py + fy * d + ry * o];
}
function drawEye() {
  const light = lightLevel();
  ctx.save();
  ctx.beginPath(); ctx.rect(VX, VY, VVW, VVH); ctx.clip();
  // the dark behind everything
  ctx.fillStyle = '#020308';
  ctx.fillRect(VX, VY, VVW, VVH);
  if (G.shake > 0) ctx.translate(rng(-1, 1) * G.shake * 0.6, rng(-1, 1) * G.shake * 0.4);
  const bob = Math.sin(G.stepBob * Math.PI) * 0;   // reserved
  const MAXD = 5;
  for (let d = MAXD - 1; d >= 0; d--) {
    const bNear = clamp(light * (1 - d * 0.17), 0.03, 1);
    const bFar = clamp(light * (1 - (d + 1) * 0.17), 0.02, 1);
    const pn = planeRect(d), pf = planeRect(d + 1);
    // floor band
    const fg = ctx.createLinearGradient(0, pf.y + pf.h, 0, pn.y + pn.h);
    fg.addColorStop(0, shade('#0d1322', -0.5 + bFar * 0.5));
    fg.addColorStop(1, shade('#131b2e', -0.5 + bNear * 0.5));
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(pf.x - pf.w, pf.y + pf.h); ctx.lineTo(pf.x + pf.w * 2, pf.y + pf.h);
    ctx.lineTo(pn.x + pn.w * 2, pn.y + pn.h); ctx.lineTo(pn.x - pn.w, pn.y + pn.h);
    ctx.closePath(); ctx.fill();
    // ceiling band
    const cg = ctx.createLinearGradient(0, pf.y, 0, pn.y);
    cg.addColorStop(0, shade('#0a0e1a', -0.5 + bFar * 0.4));
    cg.addColorStop(1, shade('#0e1424', -0.5 + bNear * 0.4));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(pf.x - pf.w, pf.y); ctx.lineTo(pf.x + pf.w * 2, pf.y);
    ctx.lineTo(pn.x + pn.w * 2, pn.y); ctx.lineTo(pn.x - pn.w, pn.y);
    ctx.closePath(); ctx.fill();
    // floor features in this band (pits, plates, pads, items) for cells at depth d
    for (const o of [-2, -1, 0, 1, 2]) {
      const [tx, ty] = tileFrom(d, o);
      const t = tileAt(tx, ty);
      if (t === '#') continue;
      const x0 = cellEdge(d + 1, o - 0.5), x1 = cellEdge(d + 1, o + 0.5);
      const x2 = cellEdge(d, o + 0.5), x3 = cellEdge(d, o - 0.5);
      const yF = pf.y + pf.h, yN = pn.y + pn.h;
      if (t === 'P') {
        ctx.fillStyle = `rgba(0,0,4,${0.92})`;
        ctx.beginPath(); ctx.moveTo(x0, yF); ctx.lineTo(x1, yF); ctx.lineTo(x2, yN); ctx.lineTo(x3, yN); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = hexA('#33d6ff', 0.3 * bNear);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else if (t === 'T') {
        ctx.fillStyle = hexA('#8a97b8', 0.28 * bNear);
        ctx.beginPath();
        ctx.ellipse((x0 + x1 + x2 + x3) / 4, (yF + yN) / 2, Math.abs(x2 - x3) * 0.3, (yN - yF) * 0.24, 0, 0, 7);
        ctx.fill();
        ctx.strokeStyle = hexA('#c6d4ee', 0.5 * bNear);
        ctx.lineWidth = 1.2; ctx.stroke();
      } else if (t === '@') {
        const pulse = 0.5 + Math.sin(G.time * 4 + tx) * 0.4;
        ctx.strokeStyle = hexA('#b06bff', (0.35 + pulse * 0.4) * bNear);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse((x0 + x1 + x2 + x3) / 4, (yF + yN) / 2, Math.abs(x2 - x3) * 0.3, (yN - yF) * 0.26, 0, 0, 7);
        ctx.stroke();
      } else if (t === '>') {
        // stairwell mouth in the floor
        ctx.fillStyle = `rgba(2,3,10,0.95)`;
        ctx.beginPath(); ctx.moveTo(x0, yF); ctx.lineTo(x1, yF); ctx.lineTo(x2, yN); ctx.lineTo(x3, yN); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = hexA(FLOORS[G.floorIdx].rim, 0.6 * bNear);
        ctx.lineWidth = 1.5;
        for (let s2 = 1; s2 <= 3; s2++) {
          const k2 = s2 / 4;
          ctx.beginPath();
          ctx.moveTo(x3 + (x0 - x3) * k2, yN + (yF - yN) * k2);
          ctx.lineTo(x2 + (x1 - x2) * k2, yN + (yF - yN) * k2);
          ctx.stroke();
        }
      }
    }
    // side walls flanking open cells at this depth
    for (const o of [-2, -1, 1, 2]) {
      const inner = o - Math.sign(o);
      const [tx, ty] = tileFrom(d, o);
      const [ix, iy] = tileFrom(d, inner);
      if (tileAt(tx, ty) !== '#') continue;
      if (tileAt(ix, iy) === '#') continue;
      const j = o - Math.sign(o) * 0.5;
      const xn = cellEdge(d, j), xf = cellEdge(d + 1, j);
      const b = (bNear + bFar) / 2;
      ctx.fillStyle = shade('#1b2540', -0.45 + b * 0.55);
      ctx.beginPath();
      ctx.moveTo(xn, pn.y); ctx.lineTo(xf, pf.y); ctx.lineTo(xf, pf.y + pf.h); ctx.lineTo(xn, pn.y + pn.h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hexA('#6f8ad6', 0.45 * b);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // front faces of wall cells at depth d+1 (their near plane)
    for (const o of [-2, -1, 0, 1, 2]) {
      const [tx, ty] = tileFrom(d + 1, o);
      const t = tileAt(tx, ty);
      const x0 = cellEdge(d + 1, o - 0.5), x1 = cellEdge(d + 1, o + 0.5);
      if (t === '#') {
        const g2 = ctx.createLinearGradient(0, pf.y, 0, pf.y + pf.h);
        g2.addColorStop(0, shade('#232f4a', -0.5 + bFar * 0.62));
        g2.addColorStop(1, shade('#141d33', -0.5 + bFar * 0.5));
        ctx.fillStyle = g2;
        ctx.fillRect(x0, pf.y, x1 - x0, pf.h);
        ctx.strokeStyle = hexA('#6f8ad6', 0.5 * bFar);
        ctx.lineWidth = 1.3;
        ctx.strokeRect(x0 + 0.5, pf.y + 0.5, x1 - x0 - 1, pf.h - 1);
        // stone joints
        ctx.strokeStyle = hexA('#0a0e1a', 0.5);
        ctx.lineWidth = 1;
        for (let r2 = 1; r2 < 3; r2++) {
          const yy = pf.y + pf.h * r2 / 3;
          ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
        }
      } else if (t === 'D' || t === 'L') {
        const d2 = doorState(tx, ty);
        // frame
        ctx.fillStyle = shade('#1a2338', -0.65 + bFar * 0.6);
        ctx.fillRect(x0, pf.y, x1 - x0, pf.h);
        const inset = (x1 - x0) * 0.12;
        if (d2 && d2.open) {
          // open arch: see through to darkness of the next cell
          ctx.fillStyle = '#04050c';
          ctx.fillRect(x0 + inset, pf.y + pf.h * 0.08, (x1 - x0) - inset * 2, pf.h * 0.92);
        } else {
          const col = t === 'L' && !(d2 && d2.unlocked) ? '#ffd12a' : FLOORS[G.floorIdx].rim;
          ctx.fillStyle = shade('#0e1424', -0.3 + bFar * 0.4);
          ctx.fillRect(x0 + inset, pf.y + pf.h * 0.08, (x1 - x0) - inset * 2, pf.h * 0.92);
          ctx.strokeStyle = hexA(col, 0.65 * bFar);
          ctx.lineWidth = 2;
          for (let bar = 1; bar <= 4; bar++) {
            const bx = x0 + inset + ((x1 - x0) - inset * 2) * bar / 5;
            ctx.beginPath(); ctx.moveTo(bx, pf.y + pf.h * 0.1); ctx.lineTo(bx, pf.y + pf.h * 0.98); ctx.stroke();
          }
          if (t === 'L' && !(d2 && d2.unlocked)) {
            ctx.fillStyle = hexA('#ffd12a', 0.85 * bFar);
            ctx.beginPath(); ctx.arc((x0 + x1) / 2, pf.y + pf.h * 0.5, (x1 - x0) * 0.06, 0, 7); ctx.fill();
          }
        }
        ctx.strokeStyle = hexA('#5f79c2', 0.35 * bFar);
        ctx.lineWidth = 1.3;
        ctx.strokeRect(x0 + 0.5, pf.y + 0.5, x1 - x0 - 1, pf.h - 1);
      } else if (t === 'F') {
        // fountain: a lit basin against the dark opening
        ctx.fillStyle = '#04050c';
        ctx.fillRect(x0, pf.y, x1 - x0, pf.h);
        const cxx = (x0 + x1) / 2, byy = pf.y + pf.h * 0.72;
        ctx.strokeStyle = hexA('#5fd4ff', 0.7 * bFar);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cxx, byy, (x1 - x0) * 0.26, pf.h * 0.06, 0, 0, 7); ctx.stroke();
        const wob = Math.sin(G.time * 5) * 2;
        ctx.strokeStyle = hexA('#7fdcff', 0.6 * bFar);
        ctx.beginPath(); ctx.moveTo(cxx, byy - pf.h * 0.28 + wob); ctx.quadraticCurveTo(cxx + 6, byy - pf.h * 0.14, cxx, byy); ctx.stroke();
      } else if (t === '<') {
        ctx.fillStyle = shade('#141c30', -0.5 + bFar * 0.4);
        ctx.fillRect(x0, pf.y, x1 - x0, pf.h);
        ctx.strokeStyle = hexA('#5f79c2', 0.4 * bFar);
        for (let s3 = 1; s3 <= 4; s3++) {
          const yy = pf.y + pf.h - pf.h * s3 / 5;
          ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * 0.2, yy); ctx.lineTo(x1 - (x1 - x0) * 0.2, yy); ctx.stroke();
        }
      }
    }
    // entities in cells at depth d (drawn near plane, on the floor)
    for (const o of [-2, -1, 0, 1, 2]) {
      if (d === 0 && o === 0) continue;
      const [tx, ty] = tileFrom(d, o);
      // ground items
      for (const it of G.groundItems) {
        if (it.x !== tx || it.y !== ty) continue;
        drawItem(it, d, o, bNear);
      }
      // core
      if (G.floor.core && G.floor.core[0] === tx && G.floor.core[1] === ty) drawCore(d, o, bNear);
      // monsters
      const m = G.monsters.find(mm => !mm.dead && mm.x === tx && mm.y === ty);
      if (m) drawMonster(m, d, o, bNear);
    }
    // projectiles at this depth
    for (const p of G.projectiles) {
      const [fx2, fy2] = DIRS[G.facing];
      const rel = (p.x - G.px) * fx2 + (p.y - G.py) * fy2;
      const [rx2, ry2] = DIRS[(G.facing + 1) % 4];
      const lat = (p.x - G.px) * rx2 + (p.y - G.py) * ry2;
      if (rel !== d || Math.abs(lat) > 2) continue;
      const px2 = cellX(d, lat), py2 = planeRect(d).cy;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gl = ctx.createRadialGradient(px2, py2, 0, px2, py2, 26 * (1 - d * 0.14));
      gl.addColorStop(0, hexA('#ffffff', 0.9)); gl.addColorStop(0.4, hexA(p.col, 0.7)); gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(px2, py2, 26 * (1 - d * 0.14), 0, 7); ctx.fill();
      ctx.restore();
    }
  }
  // breath of the dark: vignette scaled by torchlight
  const vg = ctx.createRadialGradient(VX + VVW / 2, VY + VVH / 2, VVH * 0.2, VX + VVW / 2, VY + VVH / 2, VVH * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,6,${clamp(0.9 - light * 0.55, 0.25, 0.85)})`);
  ctx.fillStyle = vg;
  ctx.fillRect(VX, VY, VVW, VVH);
  // hurt / heal flashes
  if (G.hitFlashT > 0) {
    ctx.fillStyle = `rgba(255,40,50,${G.hitFlashT * 0.8})`;
    ctx.fillRect(VX, VY, VVW, VVH);
  }
  if (G.healFlashT > 0) {
    ctx.fillStyle = `rgba(90,255,158,${G.healFlashT * 0.4})`;
    ctx.fillRect(VX, VY, VVW, VVH);
  }
  ctx.restore();
  // frame
  ctx.strokeStyle = 'rgba(200,220,240,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(VX, VY, VVW, VVH);
}
function drawItem(it, d, o, b) {
  const p = planeRect(d);
  const x = cellX(d + 0.4, o), y = p.y + p.h * 0.94;
  const s = (1 - d * 0.15) * 1.1;
  const COLS = { ration: '#c9a06b', torch: '#ff8c42', key: '#ffd12a', food: '#5aff9e', prism: '#ff5c5c' };
  const col = COLS[it.t] || '#ffffff';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.shadowColor = col; ctx.shadowBlur = 8;
  ctx.strokeStyle = hexA(col, 0.9 * b);
  ctx.fillStyle = hexA(col, 0.35 * b);
  ctx.lineWidth = 2;
  if (it.t === 'key') {
    ctx.beginPath(); ctx.arc(-4, 0, 4, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.moveTo(7, 0); ctx.lineTo(7, 4); ctx.moveTo(10, 0); ctx.lineTo(10, 4); ctx.stroke();
  } else if (it.t === 'torch') {
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -4); ctx.stroke();
    const fl = 0.7 + Math.sin(G.time * 9) * 0.3;
    ctx.fillStyle = hexA('#ffd12a', fl * b);
    ctx.beginPath(); ctx.ellipse(0, -8, 3, 5 * fl, 0, 0, 7); ctx.fill();
  } else if (it.t === 'prism') {
    const pulse = 0.6 + Math.sin(G.time * 3) * 0.4;
    ctx.shadowBlur = 16 * pulse;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 0); ctx.lineTo(0, 10); ctx.lineTo(-7, 0); ctx.closePath();
    ctx.fillStyle = hexA('#ff5c5c', (0.3 + pulse * 0.4) * b);
    ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 0); ctx.lineTo(0, 6); ctx.lineTo(-6, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
function drawCore(d, o, b) {
  const p = planeRect(d);
  const x = cellX(d + 0.5, o), y = p.cy;
  const s = (1 - d * 0.14);
  const pulse = 0.6 + Math.sin(G.time * 2.4) * 0.4;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, 90 * s);
  g.addColorStop(0, hexA('#ff5c5c', 0.5 * pulse * b));
  g.addColorStop(0.5, hexA('#ff2e6d', 0.2 * pulse * b));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, 90 * s, 0, 7); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = hexA('#ff8c9e', 0.8 * b);
  ctx.lineWidth = 2;
  for (let r = 0; r < 3; r++) {
    ctx.beginPath();
    ctx.ellipse(x, y, (30 + r * 14) * s, (44 + r * 10) * s, (G.time * 0.5 + r) % 6.28, 0, 7);
    ctx.stroke();
  }
}
function drawMonster(m, d, o, b) {
  const p = planeRect(d);
  const x = cellX(d + 0.5, o);
  const baseY = p.y + p.h * 0.93;
  const s = (1 - d * 0.15) * (m.boss ? 1.6 : 1);
  const wob = Math.sin(G.time * 3 + m.id * 2) * 3;
  const col = m.col;
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(s, s);
  if (m.hurtT > 0) { ctx.translate(rng(-2, 2), 0); }
  // shadow
  ctx.fillStyle = 'rgba(0,0,8,0.6)';
  ctx.beginPath(); ctx.ellipse(0, 2, 34, 8, 0, 0, 7); ctx.fill();
  ctx.shadowColor = col; ctx.shadowBlur = 12;
  ctx.strokeStyle = hexA(col, 0.9 * b);
  ctx.fillStyle = hexA(col, 0.16 * b);
  ctx.lineWidth = 2.4;
  if (m.t === 'husk') {
    // a hollow armored shell, dragging
    ctx.beginPath();
    ctx.moveTo(-26, 0); ctx.quadraticCurveTo(-30, -70 + wob, 0, -84 + wob);
    ctx.quadraticCurveTo(30, -70 + wob, 26, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, -52 + wob); ctx.lineTo(-4, -46 + wob); ctx.moveTo(12, -52 + wob); ctx.lineTo(4, -46 + wob); ctx.stroke();
    ctx.strokeStyle = hexA(col, 0.5 * b);
    for (let r = 1; r <= 3; r++) { ctx.beginPath(); ctx.moveTo(-24 + r * 2, -r * 18); ctx.lineTo(24 - r * 2, -r * 18); ctx.stroke(); }
  } else if (m.t === 'screamer') {
    // a fungal bloom on stalks
    const puls = 1 + Math.sin(G.time * 6 + m.id) * 0.08;
    ctx.beginPath(); ctx.ellipse(0, -34 + wob, 24 * puls, 20 * puls, 0, 0, 7); ctx.fill(); ctx.stroke();
    for (let st = -2; st <= 2; st++) {
      ctx.beginPath(); ctx.moveTo(st * 8, -16 + wob); ctx.lineTo(st * 5, 0); ctx.stroke();
    }
    ctx.fillStyle = hexA(col, 0.7 * b);
    for (let sp = 0; sp < 5; sp++) ctx.fillRect(-16 + sp * 8, -38 + wob + Math.sin(G.time * 8 + sp) * 3, 2.5, 2.5);
  } else if (m.t === 'wisp') {
    // crackling arc-light
    ctx.globalCompositeOperation = 'lighter';
    const g2 = ctx.createRadialGradient(0, -44 + wob * 2, 0, 0, -44 + wob * 2, 34);
    g2.addColorStop(0, hexA('#ffffff', 0.8 * b)); g2.addColorStop(0.4, hexA(col, 0.5 * b)); g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(0, -44 + wob * 2, 34, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = hexA('#ffffff', 0.8 * b);
    ctx.lineWidth = 1.6;
    srand((G.tick >> 2) + m.id * 99);
    for (let a = 0; a < 4; a++) {
      ctx.beginPath();
      ctx.moveTo(0, -44 + wob * 2);
      let zx = 0, zy = -44 + wob * 2;
      for (let seg = 0; seg < 3; seg++) { zx += rng(-14, 14); zy += rng(-8, 12); ctx.lineTo(zx, zy); }
      ctx.stroke();
    }
  } else if (m.t === 'golem') {
    // the ember warden: mass, ember joints, coal heart
    ctx.beginPath();
    ctx.moveTo(-34, 0); ctx.lineTo(-40, -60); ctx.lineTo(-20, -92); ctx.lineTo(20, -92); ctx.lineTo(40, -60); ctx.lineTo(34, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-40, -60); ctx.lineTo(-58, -30 + wob); ctx.lineTo(-48, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, -60); ctx.lineTo(58, -30 - wob); ctx.lineTo(48, -8); ctx.stroke();
    const heart = 0.6 + Math.sin(G.time * 5) * 0.4;
    ctx.globalCompositeOperation = 'lighter';
    const g3 = ctx.createRadialGradient(0, -50, 0, 0, -50, 26);
    g3.addColorStop(0, hexA('#ffd12a', heart * b)); g3.addColorStop(0.5, hexA('#ff5c5c', 0.5 * heart * b)); g3.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g3;
    ctx.beginPath(); ctx.arc(0, -50, 26, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = hexA('#ffd12a', 0.9 * b);
    ctx.beginPath(); ctx.arc(-10, -74, 3, 0, 7); ctx.arc(10, -74, 3, 0, 7); ctx.fill();
  }
  // hp sliver
  if (m.hp < MON_DEFS[m.t].hp) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,10,0.7)';
    ctx.fillRect(-24, -100, 48, 5);
    ctx.fillStyle = hexA(col, 0.9);
    ctx.fillRect(-24, -100, 48 * (m.hp / MON_DEFS[m.t].hp), 5);
  }
  ctx.restore();
}

// ---------- chrome ----------
function label(txt, x, y) {
  ctx.font = '700 10px Verdana, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(140,175,210,0.75)';
  ctx.fillText(txt, x, y);
  ctx.letterSpacing = '0px';
}
function bar(x, y, w, h, k, col, back) {
  ctx.fillStyle = back || 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
  if (k > 0) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * clamp(k, 0, 1)), h, h / 2); ctx.fill();
  }
}
function drawTopBar() {
  ctx.fillStyle = '#05080f';
  ctx.fillRect(0, 0, W, MQ);
  ctx.fillStyle = 'rgba(200,220,240,0.4)';
  ctx.fillRect(0, MQ - 1.5, W, 1.5);
  const F = FLOORS[G.floorIdx];
  ctx.font = '700 13px Verdana, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.fillStyle = F.rim;
  ctx.fillText(`FLOOR ${G.floorIdx + 1} · ${F.name}`, 26, 23);
  // compass
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(220,235,255,0.9)';
  ctx.fillText(['NORTH', 'EAST', 'SOUTH', 'WEST'][G.facing], W / 2, 23);
  ctx.textAlign = 'right';
  ctx.fillStyle = G.hasPrism ? '#ff5c5c' : 'rgba(160,190,220,0.6)';
  ctx.fillText(G.hasPrism ? 'THE PRISM BURNS IN YOUR PACK' : `KEYS ${G.keys} · TORCHES ${G.spareTorches} · RATIONS ${G.rations || 0}`, W - 26, 23);
  ctx.letterSpacing = '0px';
}
function drawSidebar() {
  const SX = VX + VVW + 16, SW = W - SX - 24;
  // survival gauges
  label('FOOD', SX, VY + 16);
  bar(SX, VY + 24, SW, 9, G.food / 100, G.food < 25 ? '#ff5c5c' : '#c9a06b');
  label('WATER', SX, VY + 52);
  bar(SX, VY + 60, SW, 9, G.water / 100, G.water < 25 ? '#ff5c5c' : '#5fd4ff');
  label('TORCH', SX, VY + 88);
  bar(SX, VY + 96, SW, 9, G.torch / 100, G.torch < 25 ? '#ff5c5c' : '#ff8c42');
  if (G.glowT > 0) {
    ctx.font = `700 9px ${MONO}`;
    ctx.fillStyle = hexA('#5aff9e', 0.8);
    ctx.textAlign = 'right';
    ctx.fillText(`GLOW ${Math.ceil(G.glowT)}s`, SX + SW, VY + 92);
  }
  // rune panel
  label('RUNES', SX, VY + 136);
  const half = POWER_RUNES.length;
  POWER_RUNES.forEach((r, i) => {
    drawRuneBtn(r, SX + (i % 3) * ((SW + 8) / 3), VY + 146 + Math.floor(i / 3) * 34, (SW - 16) / 3, 28, '#33d6ff');
  });
  EFFECT_RUNES.forEach((r, i) => {
    drawRuneBtn(r, SX + (i % 3) * ((SW + 8) / 3), VY + 226 + Math.floor(i / 3) * 34, (SW - 16) / 3, 28, '#b06bff');
  });
  // sequence + cast
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.strokeStyle = 'rgba(160,195,230,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(SX, VY + 336, SW - 92, 30, 6); ctx.fill(); ctx.stroke();
  ctx.font = `800 13px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(G.runeSeq.join(' ') || '—', SX + 10, VY + 356);
  const castHov = mouse.x > SX + SW - 84 && mouse.x < SX + SW && mouse.y > VY + 336 && mouse.y < VY + 366;
  ctx.fillStyle = G.runeSeq.length >= 2 ? hexA('#5aff9e', castHov ? 0.4 : 0.25) : 'rgba(255,255,255,0.04)';
  ctx.strokeStyle = G.runeSeq.length >= 2 ? '#5aff9e' : 'rgba(160,195,230,0.3)';
  ctx.beginPath(); ctx.roundRect(SX + SW - 84, VY + 336, 84, 30, 6); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = '800 12px Verdana, sans-serif';
  ctx.fillStyle = G.runeSeq.length >= 2 ? '#ffffff' : 'rgba(160,195,230,0.5)';
  ctx.fillText('CAST', SX + SW - 42, VY + 356);
  // grimoire hint
  ctx.font = `600 8.5px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(150,180,215,0.6)';
  const gy = VY + 384;
  ['LO..MON = power', 'FUL glow · FUL IR fireball', 'DES VEN venom · VI mend', 'YA vigour · ZO opens doors'].forEach((s, i) => {
    ctx.fillText(s, SX, gy + i * 14);
  });
  // message log
  label('THE DARK SPEAKS', SX, gy + 66);
  ctx.font = '600 10.5px Verdana, sans-serif';
  G.msg.slice(0, 4).forEach((m, i) => {
    ctx.fillStyle = `rgba(210,232,255,${0.95 - i * 0.22})`;
    ctx.fillText(m.length > 42 ? m.slice(0, 42) + '…' : m, SX, gy + 84 + i * 16);
  });
}
function drawRuneBtn(r, x, y, w, h, col) {
  const hov = mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + h;
  const active = G.runeSeq.includes(r);
  ctx.fillStyle = active ? hexA(col, 0.3) : hov ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
  ctx.strokeStyle = active ? col : 'rgba(160,195,230,0.4)';
  ctx.lineWidth = active ? 1.8 : 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.fill(); ctx.stroke();
  ctx.font = `800 11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = active ? '#ffffff' : hexA(col, 0.85);
  ctx.fillText(r, x + w / 2, y + h / 2 + 4);
}
function champCardRects() {
  const HY = H - HUD_H;
  return G.party.map((c, i) => ({ x: 24 + i * 250, y: HY + 12, w: 236, h: HUD_H - 24 }));
}
function drawHUD() {
  const HY = H - HUD_H;
  ctx.fillStyle = '#05080f';
  ctx.fillRect(0, HY, W, HUD_H);
  ctx.fillStyle = 'rgba(200,220,240,0.45)';
  ctx.fillRect(0, HY, W, 1.5);
  const rects = champCardRects();
  G.party.forEach((c, i) => {
    const r = rects[i];
    const isFront = i < 2;
    ctx.fillStyle = c.dead ? 'rgba(80,40,50,0.15)' : 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = c.dead ? 'rgba(255,80,90,0.3)' : c.hurtT > 0 ? '#ff5c5c' : isFront ? 'rgba(200,225,250,0.55)' : 'rgba(160,195,230,0.3)';
    ctx.lineWidth = c.hurtT > 0 ? 2.2 : 1.2;
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill(); ctx.stroke();
    // name + rank
    ctx.font = '800 12px Verdana, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.textAlign = 'left';
    ctx.fillStyle = c.dead ? 'rgba(255,120,130,0.6)' : '#ffffff';
    ctx.fillText(c.name, r.x + 12, r.y + 20);
    ctx.font = '600 8.5px Verdana, sans-serif';
    ctx.fillStyle = 'rgba(150,180,215,0.7)';
    ctx.fillText(c.dead ? 'FALLEN' : isFront ? 'FRONT RANK' : 'BACK RANK', r.x + 12, r.y + 34);
    ctx.letterSpacing = '0px';
    // skills line
    ctx.font = `700 9px ${MONO}`;
    ctx.fillStyle = 'rgba(180,210,240,0.75)';
    ctx.fillText(`F${c.skills.fight} N${c.skills.ninja} P${c.skills.priest} W${c.skills.wizard}`, r.x + 12, r.y + 50);
    // bars
    bar(r.x + 12, r.y + 60, 130, 8, c.hp / c.maxHp, c.hp / c.maxHp < 0.3 ? '#ff5c5c' : '#5aff9e');
    bar(r.x + 12, r.y + 74, 130, 6, c.sta / 100, '#ffd12a');
    bar(r.x + 12, r.y + 86, 130, 6, c.mana / c.maxMana, '#5fd4ff');
    ctx.font = `700 9px ${MONO}`;
    ctx.fillStyle = 'rgba(200,225,250,0.8)';
    ctx.fillText(`${Math.ceil(c.hp)}`, r.x + 148, r.y + 68);
    // attack hand
    const hb = { x: r.x + r.w - 62, y: r.y + 44, w: 50, h: 54 };
    const ready = !c.dead && c.coolT <= 0;
    const hov = mouse.x > hb.x && mouse.x < hb.x + hb.w && mouse.y > hb.y && mouse.y < hb.y + hb.h;
    ctx.fillStyle = ready ? hexA(FLOORS[G.floorIdx].rim, hov ? 0.35 : 0.2) : 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = ready ? FLOORS[G.floorIdx].rim : 'rgba(160,195,230,0.25)';
    ctx.lineWidth = ready ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(hb.x, hb.y, hb.w, hb.h, 7); ctx.fill(); ctx.stroke();
    ctx.font = '900 14px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ready ? '#ffffff' : 'rgba(160,195,230,0.4)';
    ctx.fillText(isFront ? '⚔' : '✦', hb.x + hb.w / 2, hb.y + 24);
    ctx.font = '700 7.5px Verdana, sans-serif';
    ctx.fillText(c.weapon.toUpperCase(), hb.x + hb.w / 2, hb.y + 38);
    if (!ready && !c.dead) {
      ctx.fillStyle = 'rgba(0,0,10,0.55)';
      ctx.beginPath(); ctx.roundRect(hb.x, hb.y, hb.w, hb.h * clamp(c.coolT / 1.5, 0, 1), 7); ctx.fill();
    }
    ctx.font = `700 8px ${MONO}`;
    ctx.fillStyle = 'rgba(160,195,230,0.6)';
    ctx.fillText(String(i + 1), hb.x + hb.w / 2, hb.y + 50);
  });
  // controls line
  ctx.font = `700 9px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(150,180,215,0.6)';
  ctx.fillText('WASD+QE MOVE · 1-4 STRIKE · SPACE USE/GRAB · X EAT · C DRINK · R TORCH · Z SWAP RANKS', 24, H - 6);
}
function banner(title, color, sub) {
  ctx.save();
  const by = H / 2 - 78, bh = 140;
  ctx.fillStyle = 'rgba(5,8,15,0.94)';
  ctx.fillRect(0, by, W, bh);
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillRect(0, by, W, 2);
  ctx.fillRect(0, by + bh - 2, W, 2);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.font = '900 40px "Arial Black", Arial, sans-serif';
  ctx.letterSpacing = '5px';
  ctx.shadowColor = color; ctx.shadowBlur = 24;
  ctx.fillStyle = color;
  ctx.fillText(title, W / 2, by + 58);
  ctx.shadowBlur = 0;
  ctx.font = '600 14px Verdana, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillStyle = 'rgba(225,240,255,0.92)';
  ctx.fillText(sub, W / 2, by + 96);
  ctx.letterSpacing = '0px';
  ctx.restore();
}
function bannerButton(label2, color) {
  const bw2 = 280, bh2 = 40, bx2 = W / 2 - bw2 / 2, by2 = H / 2 + 76;
  const hov = mouse.x > bx2 && mouse.x < bx2 + bw2 && mouse.y > by2 && mouse.y < by2 + bh2;
  ctx.save();
  ctx.fillStyle = hov ? hexA(color, 0.3) : hexA(color, 0.12);
  ctx.strokeStyle = color; ctx.lineWidth = hov ? 2.5 : 1.5;
  if (hov) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
  ctx.beginPath(); ctx.roundRect(bx2, by2, bw2, bh2, 8); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = '800 15px Verdana, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label2, W / 2, by2 + 26);
  ctx.letterSpacing = '0px';
  ctx.restore();
}
function endStats() {
  const s = G.stats;
  return `FLOOR ${G.floorIdx + 1} · ${s.steps} STEPS · ${s.kills} SLAIN · ${s.casts} SPELLS · ${Math.round(s.dmgDealt)} DEALT`;
}
function draw() {
  if (G.showTitle) { drawTitle(); return; }
  ctx.fillStyle = '#05060c';
  ctx.fillRect(0, 0, W, H);
  drawEye();
  drawTopBar();
  drawSidebar();
  drawHUD();
  if (G.hintT > 0 && G.mode === 'play') {
    const HINTS = [
      'FOUR CHAMPIONS, ONE BODY: FRONT RANKS SWING, BACK RANKS CAST',
      'THE TORCH IS LIFE: RELIGHT WITH R, OR CAST FUL FOR CONJURED GLOW',
      'EAT AND DRINK OR THE DARK WILL DO IT FOR YOU',
      'RUNES: A POWER RUNE FIRST, THEN THE WORD — LO FUL IR IS A SMALL FIREBALL',
    ];
    ctx.globalAlpha = Math.min(1, G.hintT * 0.5);
    ctx.font = '600 12px Verdana, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(210,232,255,0.9)';
    ctx.fillText(HINTS[Math.floor(G.time / 8) % HINTS.length], VX + VVW / 2, VY + 24);
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
  }
  if (G.mode === 'won') {
    ctx.fillStyle = 'rgba(4,5,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    banner('THE CORE IS FED', '#ff8c9e', `THE DUNGEON EXHALES · ${endStats()}`);
    bannerButton('DESCEND AGAIN  ·  SPACE', '#ff8c9e');
  }
  if (G.mode === 'lost') {
    ctx.fillStyle = 'rgba(4,5,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    banner('THE DARK KEEPS YOU', '#ff5c5c', `ALL FOUR FELL · ${endStats()}`);
    bannerButton('NEW PARTY  ·  SPACE', '#ff5c5c');
  }
}
function drawTitle() {
  ctx.fillStyle = '#05060c';
  ctx.fillRect(0, 0, W, H);
  // the eye stares down an empty corridor behind the title
  ctx.save();
  ctx.globalAlpha = 0.55;
  const keep = G.showTitle; G.showTitle = false;
  drawEye();
  G.showTitle = keep;
  ctx.restore();
  ctx.fillStyle = 'rgba(5,6,12,0.62)';
  ctx.fillRect(0, 0, W, H);
  const by = 108, bh = 310;
  ctx.fillStyle = 'rgba(5,8,15,0.9)';
  ctx.fillRect(0, by, W, bh);
  ctx.save();
  ctx.shadowColor = '#b06bff'; ctx.shadowBlur = 9;
  ctx.fillStyle = 'rgba(176,107,255,0.6)';
  ctx.fillRect(0, by, W, 1.5);
  ctx.fillRect(0, by + bh - 1.5, W, 1.5);
  ctx.restore();
  ctx.textAlign = 'center';
  const ly = 240;
  ctx.font = '900 82px "Arial Black", Arial, sans-serif';
  ctx.letterSpacing = '8px';
  ctx.save();
  ctx.shadowColor = '#b06bff'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#d0a8ff'; ctx.fillText('NEON MASTER', W / 2, ly);
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#ffffff'; ctx.fillText('NEON MASTER', W / 2, ly);
  ctx.restore();
  ctx.letterSpacing = '5px';
  ctx.font = '600 17px Verdana, sans-serif';
  ctx.fillStyle = '#b49ad0';
  ctx.fillText('A TRIBUTE TO DUNGEON MASTER', W / 2, ly + 46);
  const a = (Math.sin(G.time * 4) + 1) / 2 * 0.45 + 0.55;
  ctx.globalAlpha = a;
  ctx.font = '900 24px "Arial Black", Arial, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#b06bff'; ctx.shadowBlur = 12;
  ctx.fillText('PRESS SPACE TO DESCEND', W / 2, ly + 118);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.font = '600 13px Verdana, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillStyle = 'rgba(180,210,235,0.95)';
  ctx.fillText('FOUR CHAMPIONS. FOUR FLOORS. ONE TORCH BETWEEN YOU AND THE DARK.', W / 2, 468);
  ctx.fillStyle = 'rgba(160,190,220,0.85)';
  ctx.fillText('CARRY THE EMBER PRISM TO THE CORE — AND FEED IT', W / 2, 496);
  ctx.letterSpacing = '0px';
}

// ---------- input ----------
const keys = {};
let mouse = { x: 0, y: 0 };
window.addEventListener('keydown', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.key === ' ') e.preventDefault();
  audio();
  if (G.showTitle && (e.key === ' ' || e.key === 'Enter')) { G.showTitle = false; newGame((Math.random() * 1e9) >>> 0, {}); return; }
  if ((G.mode === 'won' || G.mode === 'lost') && e.key === ' ' && G.modeT > 0.6) { newGame((Math.random() * 1e9) >>> 0, {}); return; }
  if (G.mode !== 'play') return;
  if (k === 'w' || e.key === 'ArrowUp') forward();
  if (k === 's' || e.key === 'ArrowDown') backward();
  if (k === 'a') strafeL();
  if (k === 'd') strafeR();
  if (k === 'q' || e.key === 'ArrowLeft') turn(-1);
  if (k === 'e' || e.key === 'ArrowRight') turn(1);
  if (e.key === ' ') { if (!useDoor()) grabHere(); }
  if (k === 'g') grabHere();
  if (k === 'x') eat();
  if (k === 'c') drink();
  if (k === 'r') relight();
  if (k === 'z') swapRanks();
  const num = Number(k) - 1;
  if (num >= 0 && num < 4) attack(num);
});
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (W / r.width);
  mouse.y = (e.clientY - r.top) * (H / r.height);
  canvas.style.cursor = (mouse.y > H - HUD_H || mouse.x > VX + VVW || G.mode !== 'play') ? 'pointer' : 'crosshair';
});
canvas.addEventListener('mousedown', () => {
  audio();
  if (G.showTitle) { G.showTitle = false; newGame((Math.random() * 1e9) >>> 0, {}); return; }
  if ((G.mode === 'won' || G.mode === 'lost') && G.modeT > 0.6) {
    const bx2 = W / 2 - 140, by2 = H / 2 + 76;
    if (mouse.x > bx2 && mouse.x < bx2 + 280 && mouse.y > by2 && mouse.y < by2 + 40) newGame((Math.random() * 1e9) >>> 0, {});
    return;
  }
  if (G.mode !== 'play') return;
  // champion attack hands
  champCardRects().forEach((r, i) => {
    const hb = { x: r.x + r.w - 62, y: r.y + 44, w: 50, h: 54 };
    if (mouse.x > hb.x && mouse.x < hb.x + hb.w && mouse.y > hb.y && mouse.y < hb.y + hb.h) attack(i);
  });
  // runes
  const SX = VX + VVW + 16, SW = W - SX - 24;
  POWER_RUNES.forEach((r, i) => {
    const x = SX + (i % 3) * ((SW + 8) / 3), y = VY + 146 + Math.floor(i / 3) * 34, w = (SW - 16) / 3;
    if (mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + 28) tapRune(r);
  });
  EFFECT_RUNES.forEach((r, i) => {
    const x = SX + (i % 3) * ((SW + 8) / 3), y = VY + 226 + Math.floor(i / 3) * 34, w = (SW - 16) / 3;
    if (mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + 28) tapRune(r);
  });
  if (mouse.x > SX + SW - 84 && mouse.x < SX + SW && mouse.y > VY + 336 && mouse.y < VY + 366) castRunes();
  // click the view: interact
  if (mouse.x > VX && mouse.x < VX + VVW && mouse.y > VY && mouse.y < VY + VVH) {
    if (!useDoor()) grabHere();
  }
});

// ---------- main loop ----------
let last = 0, acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min((t - last) / 1000, 1 / 15);
  last = t;
  acc += dt;
  let n = 0;
  while (acc >= SIMSTEP && n < 5) { sim(SIMSTEP); acc -= SIMSTEP; n++; }
  draw();
}

// ---------- harnesses: descents as theorems ----------
function stepFor(s) { const n2 = Math.round(s / SIMSTEP); for (let i = 0; i < n2; i++) sim(SIMSTEP); }
function stepUntil(cond, cap) { let n2 = 0; while (!cond() && n2 < cap) { sim(SIMSTEP); n2++; } }
// A solution is a list of atomic actions replayed deterministically.
// F forward, B back, SL/SR strafe, L/R turn, U use door, G grab, E eat, DR drink, RT relight,
// A0..A3 attack, C:<runes> cast, W:<sec> wait, Z swap.
function doAction(a) {
  if (a === 'F') return forward();
  if (a === 'B') return backward();
  if (a === 'SL') return strafeL();
  if (a === 'SR') return strafeR();
  if (a === 'L') { turn(-1); return true; }
  if (a === 'R') { turn(1); return true; }
  if (a === 'U') return useDoor();
  if (a === 'G') return grabHere();
  if (a === 'E') return eat();
  if (a === 'DR') return drink();
  if (a === 'RT') return relight();
  if (a === 'Z') { swapRanks(); return true; }
  if (a.startsWith('A')) return attack(Number(a[1]));
  if (a.startsWith('C:')) {
    G.runeSeq = [];
    for (const r of a.slice(2).split(',')) tapRune(r);
    return castRunes();
  }
  if (a.startsWith('W:')) { stepFor(Number(a.slice(2))); return true; }
  return false;
}
function runScript(script, filter, cap) {
  let n = 0;
  for (const a of script) {
    if (filter && filter(a)) continue;
    if (G.mode !== 'play') break;
    // wait until the party can act
    stepUntil(() => G.moveT <= 0, 60 * 3);
    if (a.startsWith('A')) {
      const ci = Number(a[1]);
      stepUntil(() => G.party[ci].dead || G.party[ci].coolT <= 0, 60 * 4);
    }
    doAction(a);
    G.log.push({ a, x: G.px, y: G.py, f: G.floorIdx, t: Math.round(G.time * 10) / 10 });
    if (++n > (cap || 4000)) break;
  }
}
// kill whatever stands ahead with champion strikes (and keep striking until it dies or we do)
function scriptKill() {
  const out = [];
  for (let i = 0; i < 26; i++) out.push('A0', 'A1', 'W:1.2');
  return out;
}
const SOLUTION = [
  // ---- FLOOR 1: THE THRESHOLD (start 1,1 facing E) ----
  'W:0.5',
  // to the ration at (3,3): east then south twice
  'F', 'F', 'F',              // 1,1 -> 4,1... wait: walls; path: (1,1)E ->(2,1)(3,1)(4,1)
  'R',                        // face S
  // ... we will rely on the recorded log to correct these paths during development
];
function runVerify(mode) {
  try { runVerifyInner(mode); }
  catch (e) { document.title = 'ERR:' + String(e && e.stack || e).replace(/\n/g, ' | ').slice(0, 300); }
}
function runVerifyInner(mode) {
  AUDIO_ON = false;
  const seed = 20261;
  let outcome = 'FAILED', extra = {};
  newGame(seed, {});
  if (mode === 'probe') {
    // developer probe: report the world as parsed
    const F = G.floor;
    extra = { floor: G.floorIdx, px: G.px, py: G.py, facing: G.facing, w: F.w, h: F.h };
  } else if (mode === 'mech-hunger') {
    // starvation is real: an idle party dies in the dark
    const hp0 = G.party.reduce((a, c) => a + c.hp, 0);
    stepFor(300);
    const hp1 = G.party.reduce((a, c) => a + c.hp, 0);
    outcome = (G.food === 0 && hp1 < hp0) ? 'SOLVED' : 'FAILED';
    extra = { food: Math.round(G.food), water: Math.round(G.water), hpBefore: Math.round(hp0), hpAfter: Math.round(hp1) };
  } else if (mode === 'mech-torch') {
    const l0 = lightLevel();
    stepFor(120);
    const l1 = lightLevel();
    relight();
    const l2 = lightLevel();
    outcome = l1 < l0 - 0.3 && l2 > l1 + 0.3 ? 'SOLVED' : 'FAILED';
    extra = { light0: Math.round(l0 * 100) / 100, decayed: Math.round(l1 * 100) / 100, relit: Math.round(l2 * 100) / 100 };
  } else if (mode === 'mech-glow') {
    G.torch = 0;   // the torch is spent; only sorcery remains
    const l0 = lightLevel();
    G.party[3].mana = 20;
    G.runeSeq = [];
    ['ON', 'FUL'].forEach(tapRune);
    castRunes();
    const l1 = lightLevel();
    outcome = l1 > l0 + 0.2 ? 'SOLVED' : 'FAILED';
    extra = { before: Math.round(l0 * 100) / 100, after: Math.round(l1 * 100) / 100 };
  } else if (mode === 'mech-door') {
    // walk to the plain door on floor 1 at (7,5) and open it
    G.px = 7; G.py = 4; G.facing = 2;   // north of it, facing south... (7,5) is south of (7,4)
    const before = passable(7, 5);
    useDoor();
    const after = passable(7, 5);
    outcome = !before && after ? 'SOLVED' : 'FAILED';
    extra = { before, after };
  } else if (mode === 'mech-key') {
    G.px = 6; G.py = 10; G.facing = 2;   // north of locked door (6,11)
    const noKey = useDoor();
    G.keys = 1;
    const withKey = useDoor();
    outcome = !noKey && withKey && passable(6, 11) ? 'SOLVED' : 'FAILED';
    extra = { noKey, withKey, keysLeft: G.keys };
  } else if (mode === 'mech-zo') {
    G.px = 6; G.py = 10; G.facing = 2;
    G.party[3].mana = 30;
    G.runeSeq = [];
    ['LO', 'ZO'].forEach(tapRune);
    const weak = castRunes();
    const openedWeak = passable(6, 11);
    G.runeSeq = [];
    ['EE', 'ZO'].forEach(tapRune);
    castRunes();
    const openedStrong = passable(6, 11);
    outcome = !openedWeak && openedStrong ? 'SOLVED' : 'FAILED';
    extra = { weakCast: weak, openedWeak, openedStrong };
  } else if (mode === 'mech-fireball') {
    // put a husk dead ahead and burn it
    G.px = 1; G.py = 1; G.facing = 1;
    const m = G.monsters[0];
    m.x = 3; m.y = 1; m.t = 'husk';
    const hp0 = m.hp;
    G.party[3].mana = 30;
    G.runeSeq = [];
    ['ON', 'FUL', 'IR'].forEach(tapRune);
    castRunes();
    stepFor(1.5);
    outcome = m.hp < hp0 ? 'SOLVED' : 'FAILED';
    extra = { hp0, hpAfter: Math.round(m.hp) };
  } else if (mode === 'mech-mend') {
    const c = G.party[3];
    c.hp = 10;
    c.mana = 30;
    G.runeSeq = [];
    ['ON', 'VI'].forEach(tapRune);
    castRunes();
    outcome = c.hp > 20 ? 'SOLVED' : 'FAILED';
    extra = { healedTo: Math.round(c.hp) };
  } else if (mode === 'mech-xp') {
    // hitting things is the only teacher
    const c = G.party[0];
    const skill0 = c.skills.fight;
    const m = G.monsters[0];
    m.x = 2; m.y = 1; m.hp = 100000; m.dmg = [0, 0];   // a training dummy that hits back for nothing
    G.px = 1; G.py = 1; G.facing = 1;
    for (let i = 0; i < 120 && c.skills.fight === skill0; i++) {
      c.coolT = 0;
      attack(0);
      stepFor(0.1);
    }
    outcome = c.skills.fight > skill0 ? 'SOLVED' : 'FAILED';
    extra = { skillBefore: skill0, skillAfter: c.skills.fight };
  } else if (mode === 'mech-screamer') {
    const sc = G.monsters.find(m => m.t === 'screamer');
    sc.x = 2; sc.y = 1;
    G.px = 1; G.py = 1; G.facing = 1;
    const items0 = G.groundItems.filter(i => i.t === 'food').length;
    for (let i = 0; i < 30 && !sc.dead; i++) { G.party[0].coolT = 0; attack(0); stepFor(0.1); }
    const items1 = G.groundItems.filter(i => i.t === 'food').length;
    outcome = sc.dead && items1 > items0 ? 'SOLVED' : 'FAILED';
    extra = { dead: sc.dead, foodDropped: items1 - items0 };
  } else if (mode === 'mech-pit') {
    // step onto floor 2's pit and fall to floor 3, hurt
    loadFloor(1, 'down');
    G.px = 6; G.py = 3; G.facing = 2;
    const hp0 = G.party.reduce((a, c) => a + c.hp, 0);
    tryMove(0, 1);   // onto the pit at (6,4)
    const hp1 = G.party.reduce((a, c) => a + c.hp, 0);
    outcome = G.floorIdx === 2 && hp1 < hp0 ? 'SOLVED' : 'FAILED';
    extra = { floor: G.floorIdx + 1, hpLost: Math.round(hp0 - hp1) };
  } else if (mode === 'mech-plate') {
    loadFloor(1, 'down');
    const before = passable(10, 7);
    G.px = 10; G.py = 4; G.facing = 2;
    tryMove(0, 1);   // step onto the plate at (10,5)
    const after = passable(10, 7);
    outcome = !before && after ? 'SOLVED' : 'FAILED';
    extra = { before, after, on: [G.px, G.py] };
  } else if (mode === 'mech-teleport') {
    loadFloor(2, 'down');
    G.px = 11; G.py = 4; G.facing = 2;
    tryMove(0, 1);   // onto the pad at (11,5)
    outcome = (G.px === 1 && G.py === 11) ? 'SOLVED' : 'FAILED';
    extra = { landedAt: [G.px, G.py] };
  } else if (mode === 'mech-rest') {
    const c = G.party[0];
    c.hp = 30;
    G.food = 90; G.water = 90;
    stepFor(30);
    outcome = c.hp > 32 ? 'SOLVED' : 'FAILED';
    extra = { hpAfterRest: Math.round(c.hp) };
  } else if (mode === 'null') {
    // a party that does nothing is eaten by the dungeon's arithmetic
    stepFor(600);
    outcome = G.mode === 'lost' ? 'LOST' : 'SURVIVED';
    extra = { time: 600, endMode: G.mode, food: Math.round(G.food) };
  }
  const report = { mode, outcome, seed, ...extra };
  document.title = 'VERIFY:' + JSON.stringify(report);
  const el = document.createElement('pre');
  el.id = 'verify-report';
  el.textContent = document.title;
  document.body.appendChild(el);
  draw();
}
function runShot(name) {
  AUDIO_ON = false;
  newGame(20261, {});
  G.hintT = 0;
  if (name === 'title') {
    G.showTitle = true; G.time = 1.2;
  } else if (name === 'corridor') {
    G.hintT = 10;
  } else if (name === 'combat') {
    G.monsters[0].x = 3; G.monsters[0].y = 1;
    G.px = 1; G.py = 1; G.facing = 1;
    stepFor(1.5);
  } else if (name === 'door') {
    G.px = 7; G.py = 3; G.facing = 2;
    stepFor(0.5);
  } else if (name === 'runes') {
    G.monsters[0].x = 4; G.monsters[0].y = 1;
    G.px = 1; G.py = 1; G.facing = 1;
    G.party[3].mana = 30;
    ['ON', 'FUL', 'IR'].forEach(tapRune);
    castRunes();
    stepFor(0.15);
  } else if (name === 'fountain') {
    loadFloor(1, 'down');
    G.px = 8; G.py = 9; G.facing = 1;   // fountain at (8,9)... F is at map col 8 row 9
    stepFor(0.5);
  } else if (name === 'pit') {
    loadFloor(1, 'down');
    G.px = 6; G.py = 2; G.facing = 2;
    stepFor(0.5);
  } else if (name === 'boss') {
    loadFloor(3, 'down');
    G.px = 4; G.py = 9; G.facing = 1;
    G.monsters[0].x = 7; G.monsters[0].y = 9;
    stepFor(1);
  } else if (name === 'prism') {
    loadFloor(3, 'down');
    G.px = 7; G.py = 6; G.facing = 2;   // prism pedestal below at (7,7)
    stepFor(0.8);
  } else if (name === 'win') {
    loadFloor(3, 'down');
    G.hasPrism = true;
    G.px = 7; G.py = 6; G.facing = 0;
    G.monsters.forEach(m => m.dead = true);
    tryMove(0, -1);
    stepFor(0.4);
    if (G.mode !== 'won') { document.title = 'shot-FAILED'; return; }
  } else if (name === 'fail') {
    for (const c of G.party) { c.hp = 1; }
    G.food = 0; G.water = 0;
    stepFor(30);
    if (G.mode !== 'lost') { document.title = 'shot-FAILED'; return; }
  } else {
    stepFor(1);
  }
  draw();
  if (document.title !== 'shot-FAILED') document.title = 'shot-ready';
}

const q = new URLSearchParams(location.search);
const shotName = q.get('shot');
const verifyMode = q.get('verify');
if (shotName) runShot(shotName);
else if (verifyMode !== null) runVerify(verifyMode || 'probe');
else { newGame(445566, { attract: true }); requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); }); }

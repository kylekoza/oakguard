'use strict';
/* ============================================================
   OAKGUARD data.js — constants, defs, audio, save
   ============================================================ */
const W = 960, H = 600;
const CELL = 40, COLS = 24, ROWS = 15;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.floor(n).toString();
const cellCx = c => c * CELL + CELL / 2;
const cellCy = r => r * CELL + CELL / 2;

/* ---------- audio ---------- */
const AudioSys = {
  ctx: null, muted: false, master: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) {}
  },
  tone(freq, dur, type = 'square', vol = 0.5, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur, vol = 0.4, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.master); src.start(t0);
  },
  shoot()   { this.tone(rand(640, 720), 0.07, 'square', 0.12, -300); },
  thump()   { this.tone(120, 0.22, 'sine', 0.5, -70); this.noise(0.12, 0.18); },
  zap()     { this.tone(1400, 0.09, 'sawtooth', 0.18, -900); this.tone(700, 0.12, 'square', 0.1, -400, 0.02); },
  splat()   { this.tone(300, 0.1, 'sine', 0.22, -150); },
  whoosh()  { this.noise(0.16, 0.1); },
  buzz()    { this.tone(rand(210, 260), 0.14, 'sawtooth', 0.1, 40); },
  freezeSfx(){ this.tone(1100, 0.12, 'triangle', 0.16, -500); },
  hit()     { this.tone(rand(180, 220), 0.06, 'triangle', 0.15, -60); },
  kill()    { this.tone(500, 0.08, 'triangle', 0.18, 250); },
  coin()    { this.tone(880, 0.07, 'square', 0.13); this.tone(1320, 0.09, 'square', 0.11, 0, 0.06); },
  leak()    { this.tone(200, 0.3, 'sawtooth', 0.38, -120); this.noise(0.2, 0.28); },
  waveGo()  { [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, 'square', 0.2, 0, i * 0.09)); },
  perk()    { [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.18, 0, i * 0.07)); },
  build()   { this.tone(300, 0.08, 'square', 0.18, 150); this.tone(450, 0.1, 'square', 0.16, 150, 0.07); },
  upgrade() { [440, 587, 880].forEach((f, i) => this.tone(f, 0.11, 'square', 0.18, 0, i * 0.06)); },
  levelup() { [523, 698, 1047].forEach((f, i) => this.tone(f, 0.13, 'triangle', 0.2, 0, i * 0.07)); },
  sell()    { this.tone(500, 0.1, 'square', 0.16, -200); this.tone(350, 0.12, 'square', 0.13, -150, 0.08); },
  boss()    { [110, 110, 98].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.38, -20, i * 0.3)); },
  lose()    { [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.28, 0, i * 0.25)); },
  win()     { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, 'square', 0.2, 0, i * 0.13)); },
  achieve() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.22, 0, i * 0.09)); },
  error()   { this.tone(160, 0.12, 'square', 0.18, -40); },
};

/* ---------- save ---------- */
const SAVE_KEY = 'oakguard_save_v2';
let SAVE = {
  ga: 0, meta: {}, ach: {},
  stats: { runs: 0, wins: 0, bestWave: 0, kills: 0, towersBuilt: 0, gaLifetime: 0, bossKills: 0, perksTaken: 0 },
};
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      SAVE.ga = p.ga || 0;
      SAVE.meta = p.meta || {};
      SAVE.ach = p.ach || {};
      SAVE.stats = Object.assign(SAVE.stats, p.stats || {});
    }
  } catch (e) {}
}
function persistSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {}
}
const metaRank = id => SAVE.meta[id] || 0;
loadSave();

/* ---------- prestige tree ---------- */
const META_DEFS = [
  { id: 'oak_hp',   ico: '🌳', name: 'Mighty Roots',    desc: '+4 Great Oak HP per rank',             ranks: 5, cost: r => 3 + r * 2 },
  { id: 'stash',    ico: '🌰', name: 'Winter Stash',    desc: '+25 starting acorns per rank',         ranks: 5, cost: r => 3 + r * 2 },
  { id: 'claws',    ico: '⚔️', name: 'Sharp Claws',     desc: '+4% tower damage per rank',            ranks: 8, cost: r => 4 + r * 2 },
  { id: 'caffeine', ico: '☕', name: 'Caffeinated',     desc: '+3% attack speed per rank',            ranks: 8, cost: r => 4 + r * 2 },
  { id: 'forager',  ico: '💰', name: 'Forager',         desc: '+8% acorns from kills per rank',       ranks: 5, cost: r => 4 + r * 3 },
  { id: 'bargain',  ico: '🏷️', name: 'Nut Bargains',    desc: '−4% tower cost per rank',              ranks: 5, cost: r => 4 + r * 3 },
  { id: 'mentor',   ico: '📚', name: 'Drill Sergeant',  desc: '+10% tower XP per rank',               ranks: 5, cost: r => 4 + r * 2 },
  { id: 'walnut',   ico: '🥥', name: 'Walnut Cannon',   desc: 'Unlock: heavy piercing sniper tower',  ranks: 1, cost: () => 12 },
  { id: 'static',   ico: '⚡', name: 'Static Squirrel', desc: 'Unlock: chain-lightning tower',        ranks: 1, cost: () => 18 },
  { id: 'banker',   ico: '🏦', name: 'Acorn Banker',    desc: 'Unlock: tower that earns acorns',      ranks: 1, cost: () => 25 },
  { id: 'reroll',   ico: '🎲', name: 'Second Thoughts', desc: 'Reroll perk choices once per wave',    ranks: 1, cost: () => 15 },
  { id: 'lucky',    ico: '🍀', name: 'Lucky Whiskers',  desc: 'A 4th perk to choose from',            ranks: 1, cost: () => 25 },
];

/* ---------- enemies ---------- */
const ENEMY_TYPES = {
  mouse:  { name: 'Field Mouse', hp: 24,  spd: 64,  dmg: 1,  gold: 3,  r: 11, ico: '🐭', minWave: 1,  cost: 1 },
  wasp:   { name: 'Wasp',        hp: 15,  spd: 120, dmg: 1,  gold: 3,  r: 9,  ico: '🐝', minWave: 3,  cost: 1 },
  rat:    { name: 'Sewer Rat',   hp: 62,  spd: 50,  dmg: 2,  gold: 6,  r: 13, ico: '🐀', minWave: 5,  cost: 2 },
  magpie: { name: 'Magpie',      hp: 40,  spd: 96,  dmg: 1,  gold: 6,  r: 12, ico: '🐦‍⬛', minWave: 8, cost: 2 },
  snake:  { name: 'Grass Snake', hp: 115, spd: 44,  dmg: 2,  gold: 8,  r: 14, ico: '🐍', minWave: 11, cost: 3, slowResist: 0.5 },
  boar:   { name: 'Wild Boar',   hp: 300, spd: 32,  dmg: 4,  gold: 18, r: 18, ico: '🐗', minWave: 14, cost: 5 },
  skunk:  { name: 'Stink Skunk', hp: 180, spd: 56,  dmg: 3,  gold: 14, r: 15, ico: '🦨', minWave: 18, cost: 4 },
  bear:   { name: 'HONEY BEAR',  hp: 950, spd: 24,  dmg: 10, gold: 50, r: 26, ico: '🐻', minWave: 99, cost: 0, boss: true },
};
const hpMult = gw => 1 + 0.22 * (gw - 1) + 0.020 * (gw - 1) * (gw - 1);
const goldMult = gw => Math.min(2.2, 1 + 0.04 * (gw - 1));

/* ---------- towers ----------
   kind: proj | lob | zap | cone | swarm | aura | bank
   spec A/B unlock as a choice at level 3 */
const TOWER_TYPES = {
  flinger: { name: 'Acorn Flinger', ico: '🐿️', cost: 50, range: 115, rate: 1.3, dmg: 9,
    desc: 'Rapid single-target acorns', color: '#c98a4b', kind: 'proj', projSpd: 420, projKind: 'acorn',
    specs: [{ name: 'Gatling Paws', desc: '+45% attack speed', ico: '🌀' },
            { name: 'Big Nuts', desc: '+70% damage, +1 pierce', ico: '🪨' }] },
  mortar:  { name: 'Pinecone Mortar', ico: '🌲', cost: 100, range: 155, rate: 0.42, dmg: 24, splash: 55,
    desc: 'Lobbed splash damage', color: '#5a8f5a', kind: 'lob', projSpd: 240,
    specs: [{ name: 'Napalm Cones', desc: 'Splash sets enemies on fire', ico: '🔥' },
            { name: 'Heavy Shells', desc: '+50% damage, +25% splash', ico: '💣' }] },
  sap:     { name: 'Sap Sprayer', ico: '🍯', cost: 70, range: 105, rate: 1.0, dmg: 4, slow: 0.4, slowDur: 1.6,
    desc: 'Sticky sap slows enemies', color: '#d9a23a', kind: 'proj', projSpd: 340, projKind: 'sap',
    specs: [{ name: 'Super Glue', desc: 'Slow +15%, lasts 60% longer', ico: '🫠' },
            { name: 'Acid Sap', desc: 'Damage ×3', ico: '🧪' }] },
  flame:   { name: 'Flame Squirrel', ico: '🔥', cost: 110, range: 85, rate: 4.0, dmg: 3, burnDps: 6, burnDur: 2,
    desc: 'Flamethrower! Burns enemies', color: '#e06030', kind: 'cone',
    specs: [{ name: 'Inferno', desc: 'Burn damage ×2', ico: '🌋' },
            { name: 'Long Nozzle', desc: '+45% range', ico: '🧯' }] },
  frost:   { name: 'Snowball Chucker', ico: '❄️', cost: 120, range: 120, rate: 0.6, dmg: 10, splash: 40, slow: 0.5, slowDur: 1.4,
    desc: 'AoE snowballs chill crowds', color: '#8ac4e8', kind: 'lob', projSpd: 300, frost: true,
    specs: [{ name: 'Deep Freeze', desc: '15% chance to freeze solid 1s', ico: '🧊' },
            { name: 'Blizzard', desc: '+35% splash & slow lasts longer', ico: '🌨️' }] },
  bees:    { name: 'Bee Keeper', ico: '🍎', cost: 125, range: 140, rate: 0.7, dmg: 7, beeCount: 3,
    desc: 'Releases homing attack bees', color: '#c9b23a', kind: 'swarm',
    specs: [{ name: 'Angry Swarm', desc: '+2 bees per volley', ico: '🐝' },
            { name: 'Killer Bees', desc: 'Bee damage ×1.7', ico: '💀' }] },
  disco:   { name: 'Disco Squirrel', ico: '🪩', cost: 90, range: 0, aura: 2, auraBuff: 0.15,
    desc: 'Buffs neighbors: +15% dmg & speed', color: '#c77dff', kind: 'aura',
    specs: [{ name: 'Wider Groove', desc: 'Aura reaches 1 cell further', ico: '📡' },
            { name: 'Bass Boost', desc: 'Aura buff +10% stronger', ico: '🔊' }] },
  walnut:  { name: 'Walnut Cannon', ico: '🥥', cost: 140, range: 180, rate: 0.48, dmg: 42, pierce: 2,
    desc: 'Long-range piercing shots', color: '#8a5a33', kind: 'proj', projSpd: 560, projKind: 'walnut', meta: 'walnut',
    specs: [{ name: 'Railgun', desc: '+2 pierce', ico: '🚄' },
            { name: 'Dead Eye', desc: '+25% crit chance', ico: '🎯' }] },
  static:  { name: 'Static Squirrel', ico: '⚡', cost: 150, range: 125, rate: 0.8, dmg: 13, chain: 3,
    desc: 'Lightning chains between foes', color: '#7db4e0', kind: 'zap', meta: 'static',
    specs: [{ name: 'Superconductor', desc: '+2 chain jumps', ico: '🔗' },
            { name: 'High Voltage', desc: '+60% damage', ico: '⚡' }] },
  bank:    { name: 'Acorn Banker', ico: '🏦', cost: 130, range: 0, income: 12,
    desc: 'Earns acorns during each wave', color: '#d4b352', kind: 'bank', meta: 'banker',
    specs: [{ name: 'Compound Interest', desc: 'Income +60%', ico: '📈' },
            { name: 'War Bonds', desc: 'Also heals Oak 1 HP per wave', ico: '💚' }] },
};
const TOWER_ORDER = ['flinger', 'mortar', 'sap', 'flame', 'frost', 'bees', 'disco', 'walnut', 'static', 'bank'];
const MAX_TLVL = 5;
const SPEC_LEVEL = 3;
// each additional copy of the same tower type costs more
const PRICE_GROWTH = 1.22;

/* ---------- perks ---------- */
const PERKS = [
  // common
  { id: 'sharp',    rar: 0, ico: '🗡️', name: 'Sharp Teeth',    desc: '+12% tower damage',                          apply: m => m.dmg *= 1.12 },
  { id: 'quick',    rar: 0, ico: '💨', name: 'Quick Paws',     desc: '+10% attack speed',                          apply: m => m.rate *= 1.10 },
  { id: 'eyes',     rar: 0, ico: '👀', name: 'Keen Eyes',      desc: '+12% tower range',                           apply: m => m.range *= 1.12 },
  { id: 'bounty',   rar: 0, ico: '🪙', name: 'Bounty Hunter',  desc: '+1 acorn per kill',                          apply: m => m.goldFlat += 1 },
  { id: 'booms',    rar: 0, ico: '💥', name: 'Bigger Booms',   desc: '+22% splash radius',                         apply: m => m.splash *= 1.22 },
  { id: 'sticky',   rar: 0, ico: '🍯', name: 'Extra Sticky',   desc: 'Slows are 10% stronger',                     apply: m => m.slowPower += 0.10 },
  { id: 'bark',     rar: 0, ico: '🌳', name: 'Thick Bark',     desc: 'Oak: +3 max HP and heal 3',                  apply: m => m.oakBonus += 3 },
  { id: 'discount', rar: 0, ico: '🏷️', name: 'Nut Coupon',     desc: 'Towers cost 8% less',                        apply: m => m.costMult *= 0.92 },
  { id: 'kindle',   rar: 0, ico: '🕯️', name: 'Kindling',       desc: 'Burn damage +30%',                           apply: m => m.burnMult *= 1.30 },
  { id: 'study',    rar: 0, ico: '📖', name: 'Study Break',    desc: 'Towers gain +25% XP',                        apply: m => m.xpMult *= 1.25 },
  // rare
  { id: 'crit',     rar: 1, ico: '🎯', name: 'Weak Spotter',   desc: '+10% crit chance (2.5× damage)',             apply: m => m.critCh += 0.10 },
  { id: 'pierce',   rar: 1, ico: '➡️', name: 'Punch Through',  desc: 'Acorn & walnut shots pierce +1',             apply: m => m.pierceBonus += 1 },
  { id: 'chainp',   rar: 1, ico: '🔗', name: 'Conductive Fur', desc: 'Lightning chains +1 target',                 apply: m => m.chainBonus += 1 },
  { id: 'slayer',   rar: 1, ico: '🛡️', name: 'Giant Slayer',   desc: '+30% damage to bosses',                      apply: m => m.bossDmg *= 1.30 },
  { id: 'interest', rar: 1, ico: '🏦', name: 'Acorn Interest', desc: '+5% of your acorns each wave (max 60)',      apply: m => m.interest += 1 },
  { id: 'snare',    rar: 1, ico: '🕸️', name: 'Root Snare',     desc: 'Enemies near the Oak are 30% slower',        apply: m => m.rootSnare = true, unique: true },
  { id: 'regen',    rar: 1, ico: '💚', name: 'Spring Sap',     desc: 'Oak heals 1 HP after each wave',             apply: m => m.regen += 1 },
  { id: 'goldr',    rar: 1, ico: '💰', name: 'Gold Rush',      desc: '+20% acorns from kills',                     apply: m => m.goldKill *= 1.20 },
  { id: 'swarm',    rar: 1, ico: '🐝', name: 'Bee Frenzy',     desc: 'Bee Keepers release +1 bee',                 apply: m => m.beeBonus += 1 },
  { id: 'scrap',    rar: 1, ico: '♻️', name: 'Scrapper',       desc: 'Selling refunds 90% (was 70%)',              apply: m => m.sellRate = Math.max(m.sellRate, 0.9), unique: true },
  { id: 'groove',   rar: 1, ico: '🕺', name: 'Funky Beat',     desc: 'Disco auras are 8% stronger',                apply: m => m.auraBonus += 0.08 },
  // epic
  { id: 'explo',    rar: 2, ico: '🧨', name: 'Explosive Acorns', desc: 'Acorn hits explode for 60% splash',        apply: m => m.acornExplode = true, unique: true },
  { id: 'double',   rar: 2, ico: '👯', name: 'Twin Tails',     desc: '25% chance to fire a second shot',           apply: m => m.doubleShot += 0.25 },
  { id: 'frenzy',   rar: 2, ico: '🔥', name: 'Wave Frenzy',    desc: '+60% attack speed for first 6s of waves',    apply: m => m.frenzy = true, unique: true },
  { id: 'midas',    rar: 2, ico: '👑', name: 'Midas Whiskers', desc: '+35% acorns from kills',                     apply: m => m.goldKill *= 1.35 },
  { id: 'over',     rar: 2, ico: '⚡', name: 'Overcharge',     desc: '+25% tower damage',                          apply: m => m.dmg *= 1.25 },
  { id: 'wrath',    rar: 2, ico: '😡', name: "Oak's Wrath",    desc: 'When the Oak is hit, it blasts ALL enemies', apply: m => m.oakWrath = true, unique: true },
  { id: 'veteran',  rar: 2, ico: '🎖️', name: 'Veterans',       desc: 'New towers start at level 2',                apply: m => m.veteran = true, unique: true },
  { id: 'blizzard', rar: 2, ico: '🌨️', name: 'Cold Snap',      desc: 'ALL hits slow enemies by 15%',               apply: m => m.coldSnap = true, unique: true },
];
const RAR_NAMES = ['common', 'rare', 'epic'];
const RAR_COLORS = ['var(--common)', 'var(--rare)', 'var(--epic)'];

function freshMods() {
  return {
    dmg: 1, rate: 1, range: 1, goldKill: 1, goldFlat: 0, splash: 1, slowPower: 0,
    critCh: 0, pierceBonus: 0, chainBonus: 0, bossDmg: 1, costMult: 1,
    interest: 0, regen: 0, oakBonus: 0, burnMult: 1, xpMult: 1, beeBonus: 0, auraBonus: 0, sellRate: 0.7,
    acornExplode: false, doubleShot: 0, frenzy: false, rootSnare: false, oakWrath: false,
    veteran: false, coldSnap: false,
  };
}

/* ---------- shop (between forests) ---------- */
const SHOP_ITEMS = [
  { id: 'heal',    ico: '🩹', name: 'Repair Kit',    desc: 'Restore 6 Oak HP right now',            cost: l => 60 + 30 * l,  },
  { id: 'fort',    ico: '🛡️', name: 'Fortify',       desc: '+5 max Oak HP (and heal 5)',            cost: l => 120 + 45 * l },
  { id: 'scroll',  ico: '📜', name: 'Perk Scroll',   desc: 'Immediately choose a bonus perk',       cost: l => 170 + 60 * l },
  { id: 'paint',   ico: '🎨', name: 'War Paint',     desc: '+6% tower damage for the rest of the run', cost: l => 150 + 50 * l },
  { id: 'espresso',ico: '☕', name: 'Triple Espresso', desc: '+6% attack speed for the rest of the run', cost: l => 150 + 50 * l },
  { id: 'tools',   ico: '🧰', name: 'Tool Belt',     desc: 'Towers cost 8% less for the rest of the run', cost: l => 130 + 40 * l },
  { id: 'tome',    ico: '📚', name: 'Training Tome', desc: 'Towers gain +30% XP for the rest of the run', cost: l => 140 + 40 * l },
  { id: 'charm',   ico: '🧿', name: 'Lucky Charm',   desc: '+10% acorns from kills for the rest of the run', cost: l => 130 + 45 * l },
];

/* ---------- achievements ---------- */
const ACHIEVEMENTS = [
  { id: 'first_blood', ico: '🩸', name: 'First Blood',     desc: 'Defeat your first enemy',              ga: 2 },
  { id: 'wave10',      ico: '🌊', name: 'Making Waves',    desc: 'Reach wave 10 in a single run',        ga: 3 },
  { id: 'wave20',      ico: '🌊', name: 'Tsunami',         desc: 'Reach wave 20 in a single run',        ga: 5 },
  { id: 'win',         ico: '🏆', name: 'Forest Savior',   desc: 'Win a full run (all 5 forests)',       ga: 15 },
  { id: 'boss1',       ico: '🐻', name: 'Bear Necessities', desc: 'Defeat a Honey Bear',                 ga: 3 },
  { id: 'boss10',      ico: '🧸', name: 'Unbearable',      desc: 'Defeat 10 Honey Bears (lifetime)',     ga: 8 },
  { id: 'kills500',    ico: '☠️', name: 'Pest Control',    desc: '500 total kills (lifetime)',           ga: 5 },
  { id: 'kills5000',   ico: '💀', name: 'Exterminator',    desc: '5,000 total kills (lifetime)',         ga: 12 },
  { id: 'rich',        ico: '🤑', name: 'Nut Egg',         desc: 'Hold 1,000 acorns at once',            ga: 4 },
  { id: 'max_tower',   ico: '🌟', name: 'Elite Squirrel',  desc: 'Get a tower to level 5',               ga: 5 },
  { id: 'spec',        ico: '🎓', name: 'Specialist',      desc: 'Choose a tower specialization',        ga: 3 },
  { id: 'builder',     ico: '🏗️', name: 'City Planner',    desc: 'Have 12 towers alive at once',         ga: 4 },
  { id: 'perk8',       ico: '🎁', name: 'Perk Addict',     desc: 'Hold 8 perks in one run',              ga: 4 },
  { id: 'no_leak',     ico: '🔒', name: 'Not One Step',    desc: 'Clear a forest with zero Oak damage',  ga: 6 },
  { id: 'grove5',      ico: '✨', name: 'Green Thumb',     desc: 'Buy 5 Grove upgrade ranks',            ga: 4 },
  { id: 'ga100',       ico: '💎', name: 'Golden Hoard',    desc: 'Earn 100 Golden Acorns (lifetime)',    ga: 10 },
];

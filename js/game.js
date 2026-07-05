'use strict';
/* ============================================================
   OAKGUARD game.js — state, mapgen, combat, flow
   ============================================================ */
const G = {
  state: 'menu',            // menu | prep | wave | over
  level: 0, wave: 0,
  gold: 0, path: null, grid: null, features: [], levelDefs: [],
  oakHp: 20, oakMax: 20,
  towers: [], enemies: [], projs: [], parts: [], texts: [], beams: [],
  spawnQ: [], waveTime: 0,
  perks: [], mods: freshMods(),
  speed: 1, paused: false, shake: 0, time: 0,
  placing: null, selected: new Set(), dragBox: null,
  kills: 0, wavesCleared: 0, gaEarned: 0, leakedThisLevel: false,
  rerollUsed: false, wrathCd: 0,
  bgCanvas: null,
};
const globalWave = () => {
  let g = 0;
  for (let i = 0; i < G.level; i++) g += G.levelDefs[i].waves;
  return g + G.wave + 1;
};
const totalWavesOf = defs => defs.reduce((a, l) => a + l.waves, 0);

/* ============================================================
   MAP GENERATION
   ============================================================ */
const FOREST_NAMES = ['Meadow Run', 'Twisty Hollow', 'Birch Glen', 'Maple Rise', 'Fern Gully',
  'Bramble Pass', 'Mossy Bend', 'Thistle Vale', 'Cedar Cross', 'The Gauntlet'];
const GRASS_PALETTES = [
  ['#4a7a2e', '#3f6b26', '#e8a33d'], ['#49743a', '#3b6130', '#d97941'],
  ['#597a2e', '#486826', '#e5c04a'], ['#456e3c', '#375c31', '#c4573a'],
  ['#6b7a2e', '#586826', '#a83a2e'],
];
function genLevelDefs() {
  const names = FOREST_NAMES.slice();
  return [5, 6, 7, 8, 9].map((waves, i) => {
    const ni = randi(0, names.length - 1);
    const name = names.splice(ni, 1)[0];
    return { name, waves, pal: GRASS_PALETTES[i % GRASS_PALETTES.length] };
  });
}
// generate a grid path: alternating rightward and vertical runs
function genMap() {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  // rows hidden behind HUD bars are unbuildable
  for (let c = 0; c < COLS; c++) { grid[0][c] = 2; grid[13][c] = 2; grid[14][c] = 2; }
  let r = randi(3, 10), c = 0;
  const corners = [[-1, r]];
  const mark = (cc, rr) => { grid[rr][cc] = 1; };
  mark(c, r);
  let guard = 0;
  while (c < 21 && guard++ < 60) {
    // horizontal run rightward
    const hlen = Math.min(randi(2, 5), 21 - c);
    for (let i = 0; i < hlen; i++) { c++; mark(c, r); }
    corners.push([c, r]);
    if (c >= 21) break;
    // vertical run
    const dirs = [];
    if (r >= 5) dirs.push(-1);
    if (r <= 8) dirs.push(1);
    const dir = pick(dirs);
    const maxLen = dir === -1 ? r - 2 : 11 - r;
    const vlen = Math.min(randi(2, 5), maxLen);
    for (let i = 0; i < vlen; i++) { r += dir; mark(c, r); }
    corners.push([c, r]);
  }
  // finish to oak cell at col 22
  while (c < 22) { c++; mark(c, r); }
  corners.push([22, r]);
  const oakCell = { c: 22, r };
  // waypoints in px
  const pts = corners.map(([cc, rr]) => [cc < 0 ? -40 : cellCx(cc), cellCy(rr)]);
  // ---- terrain features ----
  const features = [];
  const free = (cc, rr) => rr >= 1 && rr <= 12 && cc >= 0 && cc < COLS && grid[rr][cc] === 0;
  const claim = (cc, rr, type, code) => { grid[rr][cc] = code; features.push({ type, c: cc, r: rr }); };
  // mountain clusters (blocking)
  for (let m = 0; m < randi(2, 4); m++) {
    const cc = randi(1, COLS - 3), rr = randi(2, 10);
    if (!free(cc, rr)) continue;
    claim(cc, rr, 'mountain', 2);
    for (const [dc, dr] of [[1, 0], [0, 1], [1, 1]]) {
      if (Math.random() < 0.55 && free(cc + dc, rr + dr)) claim(cc + dc, rr + dr, 'mountain', 2);
    }
  }
  // a pond (blocking)
  for (let m = 0; m < randi(1, 2); m++) {
    const cc = randi(2, COLS - 3), rr = randi(2, 10);
    if (!free(cc, rr)) continue;
    claim(cc, rr, 'lake', 2);
    for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [1, 1]]) {
      if (Math.random() < 0.5 && free(cc + dc, rr + dr)) claim(cc + dc, rr + dr, 'lake', 2);
    }
  }
  // boulders & pines (blocking singles)
  for (let m = 0; m < randi(4, 8); m++) {
    const cc = randi(0, COLS - 1), rr = randi(1, 12);
    if (free(cc, rr)) claim(cc, rr, pick(['boulder', 'pine', 'pine']), 2);
  }
  // mounds: +range build spots
  for (let m = 0; m < randi(2, 3); m++) {
    const cc = randi(1, COLS - 2), rr = randi(2, 11);
    if (free(cc, rr)) claim(cc, rr, 'mound', 3);
  }
  // mushroom patches: +dmg build spots
  for (let m = 0; m < randi(1, 3); m++) {
    const cc = randi(1, COLS - 2), rr = randi(2, 11);
    if (free(cc, rr)) claim(cc, rr, 'mush', 4);
  }
  return { grid, pts, features, oakCell };
}
function makePath(pts) {
  const segs = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.001) continue;
    segs.push({ x1, y1, x2, y2, len, start: total });
    total += len;
  }
  return {
    pts, segs, total,
    at(d) {
      d = clamp(d, 0, total - 0.001);
      let s = segs[0];
      for (const seg of segs) { if (d >= seg.start && d <= seg.start + seg.len) { s = seg; break; } }
      const t = (d - s.start) / s.len;
      return { x: lerp(s.x1, s.x2, t), y: lerp(s.y1, s.y2, t), ang: Math.atan2(s.y2 - s.y1, s.x2 - s.x1) };
    }
  };
}

/* ============================================================
   COSTS / XP / STATS
   ============================================================ */
function typeCount(key) { return G.towers.filter(t => t.key === key).length; }
function towerCost(key) {
  return Math.round(TOWER_TYPES[key].cost * Math.pow(PRICE_GROWTH, typeCount(key))
    * G.mods.costMult * (1 - 0.04 * metaRank('bargain')));
}
function upgCost(t) {
  return Math.round(TOWER_TYPES[t.key].cost * 0.8 * Math.pow(1.9, t.level - 1)
    * G.mods.costMult * (1 - 0.04 * metaRank('bargain')));
}
function xpNeed(t) { return Math.round(TOWER_TYPES[t.key].cost * 5 * Math.pow(2.2, t.level - 1)); }
function gainXp(t, amt) {
  if (t.level >= MAX_TLVL) return;
  t.xp += amt * G.mods.xpMult * (1 + 0.10 * metaRank('mentor'));
  while (t.level < MAX_TLVL && t.xp >= xpNeed(t)) {
    t.xp -= xpNeed(t);
    t.level++;
    puff(t.x, t.y, '#8fd8ff', 12, 110, 0.5, 4);
    if (t.level === SPEC_LEVEL && t.spec == null && TOWER_TYPES[t.key].specs)
      floatText(t.x, t.y - 32, '⚡ SPECIALIZE!', '#c77dff', 14);
    else floatText(t.x, t.y - 32, 'LEVEL UP!', '#8fd8ff', 14);
    AudioSys.levelup();
    if (t.level >= MAX_TLVL) { t.xp = 0; checkAch('max_tower'); }
    if (typeof refreshTowerPanel === 'function') refreshTowerPanel();
  }
}
function makeTower(key, col, row) {
  const t = { key, col, row, x: cellCx(col), y: cellCy(row), level: 1, xp: 0, spec: null,
    cd: rand(0, 0.3), invested: towerCost(key), anim: 0, angle: rand(0, TAU) };
  if (G.mods.veteran) t.level = 2;
  return t;
}
function auraFor(t) {
  // disco neighbors buff damage & rate
  let buff = 0;
  for (const d of G.towers) {
    if (d.kind === 'aura') continue;
    if (d === t || d.key !== 'disco') continue;
    const tt = TOWER_TYPES.disco;
    const reach = tt.aura + (d.spec === 0 ? 1 : 0);
    if (Math.max(Math.abs(d.col - t.col), Math.abs(d.row - t.row)) <= reach) {
      buff += tt.auraBuff + (d.spec === 1 ? 0.10 : 0) + G.mods.auraBonus;
    }
  }
  return 1 + buff;
}
function towerStats(t) {
  const tt = TOWER_TYPES[t.key];
  const lv = t.level - 1;
  let dmg = tt.dmg * Math.pow(1.32, lv);
  let rate = (tt.rate || 1) * (1 + 0.08 * lv);
  let range = (tt.range || 0) * (1 + 0.06 * lv);
  let splash = (tt.splash || 0);
  let slow = tt.slow || 0, slowDur = tt.slowDur || 0;
  let pierce = tt.pierce || 0, chain = tt.chain || 0;
  let burnDps = (tt.burnDps || 0) * Math.pow(1.32, lv), burnDur = tt.burnDur || 0;
  let beeCount = (tt.beeCount || 0) + G.mods.beeBonus;
  let income = (tt.income || 0) * Math.pow(1.45, lv);
  let critAdd = 0, freezeCh = 0, burnOnSplash = false, healPerWave = 0;
  const s = t.spec;
  if (s !== null && s !== undefined) {
    if (t.key === 'flinger') { if (s === 0) rate *= 1.45; else { dmg *= 1.7; pierce += 1; } }
    if (t.key === 'mortar')  { if (s === 0) burnOnSplash = true; else { dmg *= 1.5; splash *= 1.25; } }
    if (t.key === 'sap')     { if (s === 0) { slow += 0.15; slowDur *= 1.6; } else dmg *= 3; }
    if (t.key === 'flame')   { if (s === 0) burnDps *= 2; else range *= 1.45; }
    if (t.key === 'frost')   { if (s === 0) freezeCh = 0.15; else { splash *= 1.35; slowDur *= 1.5; } }
    if (t.key === 'bees')    { if (s === 0) beeCount += 2; else dmg *= 1.7; }
    if (t.key === 'walnut')  { if (s === 0) pierce += 2; else critAdd = 0.25; }
    if (t.key === 'static')  { if (s === 0) chain += 2; else dmg *= 1.6; }
    if (t.key === 'bank')    { if (s === 0) income *= 1.6; else healPerWave = 1; }
  }
  // terrain bonus
  if (G.grid && G.grid[t.row] && G.grid[t.row][t.col] === 3) range *= 1.15;
  if (G.grid && G.grid[t.row] && G.grid[t.row][t.col] === 4) dmg *= 1.12;
  // global mods + meta + disco aura
  const aura = auraFor(t);
  dmg *= G.mods.dmg * (1 + 0.04 * metaRank('claws')) * aura;
  rate *= G.mods.rate * (1 + 0.03 * metaRank('caffeine')) * aura;
  range *= G.mods.range;
  splash *= G.mods.splash;
  burnDps *= G.mods.burnMult;
  if (slow) slow = Math.min(0.88, slow + G.mods.slowPower);
  if (t.key === 'flinger' || t.key === 'walnut') pierce += G.mods.pierceBonus;
  if (chain) chain += G.mods.chainBonus;
  return { dmg, rate, range, splash, slow, slowDur, pierce, chain, burnDps, burnDur,
    beeCount, income, critAdd, freezeCh, burnOnSplash, healPerWave };
}

/* ============================================================
   WAVES
   ============================================================ */
function buildWave() {
  const gw = globalWave();
  const L = G.levelDefs[G.level];
  const isBoss = G.wave === L.waves - 1;
  const q = [];
  let budget = 8 + gw * 3 + G.level * 4;
  const avail = Object.keys(ENEMY_TYPES).filter(k => !ENEMY_TYPES[k].boss && ENEMY_TYPES[k].minWave <= gw);
  const interval = Math.max(0.34, 0.9 - gw * 0.015);
  let t = 0.5;
  while (budget > 0) {
    const key = pick(avail);
    const et = ENEMY_TYPES[key];
    const clump = randi(2, 4 + Math.floor(gw / 5));
    for (let i = 0; i < clump && budget > 0; i++) {
      q.push({ key, t }); t += interval * (et.spd > 80 ? 0.65 : 1);
      budget -= et.cost;
    }
    t += interval * 1.7;
  }
  if (isBoss) {
    const bears = 1 + Math.floor(G.level / 2);
    for (let b = 0; b < bears; b++) q.push({ key: 'bear', t: t + 1.2 + b * 5 });
  }
  return q;
}
let previewCache = null;
function buildWavePreviewCache() {
  if (!previewCache) previewCache = buildWave();
  return previewCache;
}
function wavePreviewText() {
  const counts = {};
  buildWavePreviewCache().forEach(e => counts[e.key] = (counts[e.key] || 0) + 1);
  return Object.entries(counts).map(([k, n]) => `${ENEMY_TYPES[k].ico}×${n}`).join('  ');
}
function spawnEnemy(key) {
  const et = ENEMY_TYPES[key];
  const gw = globalWave();
  const hm = hpMult(gw) * (et.boss ? (1 + G.level * 0.4) : 1);
  G.enemies.push({
    key, boss: !!et.boss, r: et.r,
    hp: et.hp * hm, maxHp: et.hp * hm,
    spd: et.spd * rand(0.92, 1.08),
    dmg: et.dmg + Math.floor(gw / 12),
    gold: Math.round(et.gold * goldMult(gw)),
    dist: rand(-8, 0), slowT: 0, slowAmt: 0, slowResist: et.slowResist || 0,
    frozenT: 0, burn: null, burnAcc: 0,
    wob: rand(0, TAU), x: -40, y: -40, ang: 0, flash: 0,
  });
  if (et.boss) { AudioSys.boss(); banner('🐻 BOSS INCOMING!'); G.shake = Math.max(G.shake, 8); }
}

/* ============================================================
   EFFECTS
   ============================================================ */
function puff(x, y, col, n = 8, spd = 90, life = 0.5, size = 4) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(spd * 0.3, spd);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.5, life), maxLife: life, col, size: rand(size * 0.5, size) });
  }
}
function floatText(x, y, txt, col = '#fff', size = 13) {
  if (G.texts.length > 80) return;
  G.texts.push({ x: x + rand(-6, 6), y, txt, col, size, life: 0.9, vy: -46 });
}
function banner(txt) {
  const el = document.getElementById('waveBanner');
  el.textContent = txt;
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
}

/* ============================================================
   ACHIEVEMENTS
   ============================================================ */
function checkAch(id) {
  if (SAVE.ach[id]) return;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  SAVE.ach[id] = 1;
  SAVE.ga += a.ga;
  SAVE.stats.gaLifetime += a.ga;
  persistSave();
  showToast(a);
  AudioSys.achieve();
  if (typeof updateHUD === 'function') updateHUD();
  if (Object.values(SAVE.meta).reduce((s, v) => s + v, 0) >= 5) checkAch('grove5');
  if (SAVE.stats.gaLifetime >= 100) checkAch('ga100');
}
function showToast(a) {
  const zone = document.getElementById('toastZone');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="tico2">${a.ico}</div><div>
    <div class="tt1">ACHIEVEMENT UNLOCKED</div>
    <div class="tt2">${a.name}</div>
    <div class="tt3">+${a.ga} ✨ Golden Acorns</div></div>`;
  zone.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
function achTick() { // threshold checks
  if (G.gold >= 1000) checkAch('rich');
  if (G.towers.length >= 12) checkAch('builder');
  if (G.perks.length >= 8) checkAch('perk8');
  const gw = globalWave();
  if (gw >= 10 && G.wavesCleared >= 10) checkAch('wave10');
  if (gw >= 20 && G.wavesCleared >= 20) checkAch('wave20');
  if (SAVE.stats.kills >= 500) checkAch('kills500');
  if (SAVE.stats.kills >= 5000) checkAch('kills5000');
  if (SAVE.stats.bossKills >= 1) checkAch('boss1');
  if (SAVE.stats.bossKills >= 10) checkAch('boss10');
}

/* ============================================================
   COMBAT
   ============================================================ */
function dealDamage(e, amt, src = null, critAdd = 0) {
  let dmg = amt;
  if (e.boss) dmg *= G.mods.bossDmg;
  let crit = false;
  if (Math.random() < G.mods.critCh + critAdd) { dmg *= 2.5; crit = true; }
  const applied = Math.min(dmg, Math.max(0, e.hp));
  e.hp -= dmg; e.flash = 0.1;
  // normalize XP to wave-1-equivalent damage so late-wave HP inflation doesn't turbo-level towers
  if (src) gainXp(src, applied / hpMult(globalWave()));
  if (G.mods.coldSnap) { e.slowAmt = Math.max(e.slowAmt, 0.15); e.slowT = Math.max(e.slowT, 0.8); }
  floatText(e.x, e.y - e.r - 6, fmt(dmg), crit ? '#ffe14d' : '#ffffffcc', crit ? 16 : 11);
  if (crit) puff(e.x, e.y, '#ffe14d', 5, 70, 0.4, 3);
  if (e.hp <= 0 && !e.dead) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true;
  const reward = Math.max(1, Math.round(e.gold * G.mods.goldKill * (1 + 0.08 * metaRank('forager')) + G.mods.goldFlat));
  G.gold += reward; G.kills++;
  SAVE.stats.kills++;
  if (e.boss) SAVE.stats.bossKills++;
  floatText(e.x, e.y - e.r - 16, '+' + reward + '🌰', '#ffc94d', 12);
  puff(e.x, e.y, e.boss ? '#e5533d' : '#c9a86a', e.boss ? 30 : 10, e.boss ? 180 : 100, 0.6, e.boss ? 7 : 4);
  AudioSys.kill();
  checkAch('first_blood');
  if (e.boss) { G.shake = Math.max(G.shake, 12); AudioSys.coin(); checkAch('boss1'); }
  updateHUD();
}
function splashDamage(x, y, radius, dmg, src, exclude, burnDps = 0, burnDur = 0) {
  for (const e of G.enemies) {
    if (e.dead || e === exclude) continue;
    if (dist2(e.x, e.y, x, y) < (radius + e.r) * (radius + e.r)) {
      dealDamage(e, dmg, src);
      if (burnDps > 0) applyBurn(e, burnDps, burnDur);
    }
  }
}
function applyBurn(e, dps, dur) {
  if (!e.burn || dps >= e.burn.dps) e.burn = { dps, t: dur };
  else e.burn.t = Math.max(e.burn.t, dur * 0.5);
}
function applySlow(e, slow, dur) {
  e.slowT = Math.max(e.slowT, dur);
  e.slowAmt = Math.max(e.slowAmt, slow);
}
function oakDamaged(amt) {
  G.oakHp -= amt;
  G.leakedThisLevel = true;
  G.shake = Math.max(G.shake, 6 + amt);
  AudioSys.leak();
  const oak = G.path.at(G.path.total);
  puff(oak.x, oak.y, '#e5533d', 14, 130, 0.6, 5);
  floatText(oak.x, oak.y - 50, '-' + amt, '#ff6a55', 20);
  if (G.mods.oakWrath && G.wrathCd <= 0) {
    G.wrathCd = 2.5;
    const wd = 30 * G.mods.dmg * (1 + 0.04 * metaRank('claws'));
    for (const e of G.enemies) if (!e.dead) { dealDamage(e, wd); puff(e.x, e.y, '#aef05a', 4, 80, 0.4, 3); }
    G.shake = Math.max(G.shake, 10);
    banner("🌳 OAK'S WRATH!");
    AudioSys.zap();
  }
  updateHUD();
  if (G.oakHp <= 0) endRun(false);
}

/* ============================================================
   FIRING
   ============================================================ */
function acquireTarget(t, range) {
  let best = null, bestDist = -1;
  for (const e of G.enemies) {
    if (e.dead || e.dist < 0) continue;
    const rr = (range + e.r) * (range + e.r);
    if (dist2(t.x, t.y, e.x, e.y) <= rr && e.dist > bestDist) { best = e; bestDist = e.dist; }
  }
  return best;
}
function fireTower(t, st, target) {
  const tt = TOWER_TYPES[t.key];
  t.angle = Math.atan2(target.y - t.y, target.x - t.x);
  t.anim = 1;
  const shots = 1 + (Math.random() < G.mods.doubleShot ? 1 : 0);
  for (let s = 0; s < shots; s++) {
    if (tt.kind === 'zap') {
      const hits = [target]; let cur = target;
      for (let c = 0; c < st.chain; c++) {
        let next = null, nd = 1e9;
        for (const e of G.enemies) {
          if (e.dead || hits.includes(e) || e.dist < 0) continue;
          const d = dist2(cur.x, cur.y, e.x, e.y);
          if (d < 110 * 110 && d < nd) { nd = d; next = e; }
        }
        if (!next) break;
        hits.push(next); cur = next;
      }
      const pts = [[t.x, t.y - 14]];
      hits.forEach((e, i) => { dealDamage(e, st.dmg * Math.pow(0.78, i), t); pts.push([e.x, e.y]); });
      G.beams.push({ pts, life: 0.14 });
      AudioSys.zap();
    } else if (tt.kind === 'lob') {
      const eta = Math.hypot(target.x - t.x, target.y - t.y) / tt.projSpd;
      const lead = clamp(target.dist + target.spd * eta * 0.7, 0, G.path.total);
      const ip = G.path.at(lead);
      G.projs.push({ kind: tt.frost ? 'snow' : 'lob', x: t.x, y: t.y - 14, sx: t.x, sy: t.y - 14,
        ix: ip.x + rand(-8, 8), iy: ip.y + rand(-8, 8),
        t: 0, dur: eta, dmg: st.dmg, splash: st.splash, src: t, spin: rand(0, TAU),
        slow: st.slow, slowDur: st.slowDur, freezeCh: st.freezeCh,
        burnDps: st.burnOnSplash ? 8 * G.mods.burnMult : 0, burnDur: 2 });
      AudioSys.thump();
    } else if (tt.kind === 'cone') {
      // instant cone hit
      const arc = 0.6;
      for (const e of G.enemies) {
        if (e.dead || e.dist < 0) continue;
        if (dist2(t.x, t.y, e.x, e.y) > (st.range + e.r) * (st.range + e.r)) continue;
        const a = Math.atan2(e.y - t.y, e.x - t.x);
        let da = Math.abs(a - t.angle); if (da > Math.PI) da = TAU - da;
        if (da < arc) {
          dealDamage(e, st.dmg, t);
          applyBurn(e, st.burnDps, st.burnDur);
        }
      }
      // flame particles
      for (let i = 0; i < 3; i++) {
        const a = t.angle + rand(-0.35, 0.35), sp = rand(120, 220);
        G.parts.push({ x: t.x + Math.cos(t.angle) * 14, y: t.y - 10 + Math.sin(t.angle) * 14,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, st.range / 260),
          maxLife: 0.45, col: pick(['#ff9a3d', '#ffcc4d', '#e56030']), size: rand(3, 6) });
      }
      if (Math.random() < 0.2) AudioSys.whoosh();
    } else if (tt.kind === 'swarm') {
      // release bees at enemies in range
      const inRange = G.enemies.filter(e => !e.dead && e.dist >= 0 &&
        dist2(t.x, t.y, e.x, e.y) <= (st.range + e.r) * (st.range + e.r));
      for (let b = 0; b < st.beeCount; b++) {
        const tgt = inRange.length ? inRange[b % inRange.length] : target;
        G.projs.push({ kind: 'bee', x: t.x + rand(-6, 6), y: t.y - 12 + rand(-6, 6),
          target: tgt, spd: rand(150, 200), dmg: st.dmg, src: t, wob: rand(0, TAU), life: 4,
          hitSet: new Set(), vx: 0, vy: 0, spin: 0 });
      }
      AudioSys.buzz();
    } else {
      G.projs.push({ kind: tt.projKind || 'acorn',
        x: t.x, y: t.y - 14, target, spd: tt.projSpd, dmg: st.dmg, src: t, critAdd: st.critAdd,
        slow: st.slow, slowDur: st.slowDur, pierce: st.pierce, hitSet: new Set(),
        vx: 0, vy: 0, spin: rand(0, TAU), splash: st.splash });
      if (t.key === 'sap') AudioSys.splat(); else AudioSys.shoot();
    }
  }
}

/* ============================================================
   UPDATE
   ============================================================ */
function update(dt) {
  G.time += dt;
  G.shake = Math.max(0, G.shake - dt * 24);
  G.wrathCd = Math.max(0, G.wrathCd - dt);

  for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; p.life -= dt; }
  G.parts = G.parts.filter(p => p.life > 0);
  for (const t of G.texts) { t.y += t.vy * dt; t.life -= dt; }
  G.texts = G.texts.filter(t => t.life > 0);
  for (const b of G.beams) b.life -= dt;
  G.beams = G.beams.filter(b => b.life > 0);
  for (const t of G.towers) t.anim = Math.max(0, t.anim - dt * 5);

  if (G.state !== 'wave') return;
  G.waveTime += dt;

  while (G.spawnQ.length && G.spawnQ[0].t <= G.waveTime) spawnEnemy(G.spawnQ.shift().key);

  // enemies
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.slowT = Math.max(0, e.slowT - dt);
    e.frozenT = Math.max(0, e.frozenT - dt);
    // burn DoT
    if (e.burn) {
      e.burn.t -= dt;
      e.burnAcc += e.burn.dps * dt;
      if (e.burnAcc >= 1) {
        const d = Math.floor(e.burnAcc); e.burnAcc -= d;
        e.hp -= d; e.flash = 0.06;
        if (Math.random() < 0.25) puff(e.x, e.y - 4, '#ff9a3d', 2, 40, 0.35, 3);
        if (e.hp <= 0 && !e.dead) { killEnemy(e); continue; }
      }
      if (e.burn.t <= 0) e.burn = null;
    }
    let slow = e.slowT > 0 ? e.slowAmt * (1 - e.slowResist) : 0;
    if (G.mods.rootSnare && e.dist > G.path.total - 160) slow = Math.max(slow, 0.3 * (1 - e.slowResist));
    const speedFac = e.frozenT > 0 ? 0 : (1 - slow);
    e.dist += e.spd * speedFac * dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.dist >= G.path.total) {
      e.dead = true;
      oakDamaged(e.dmg);
      continue;
    }
    const p = G.path.at(Math.max(0, e.dist));
    e.wob += dt * (4 + e.spd * 0.05) * (e.frozenT > 0 ? 0 : 1);
    e.x = p.x + Math.sin(e.wob) * 2;
    e.y = p.y + Math.cos(e.wob * 0.7) * 2;
    e.ang = p.ang;
  }
  G.enemies = G.enemies.filter(e => !e.dead);

  // towers
  const frenzyMult = (G.mods.frenzy && G.waveTime < 6) ? 1.6 : 1;
  for (const t of G.towers) {
    const kind = TOWER_TYPES[t.key].kind;
    if (kind === 'aura' || kind === 'bank') continue;
    const st = towerStats(t);
    t.cd -= dt * frenzyMult;
    if (t.cd <= 0) {
      const target = acquireTarget(t, st.range);
      if (target) { fireTower(t, st, target); t.cd = 1 / st.rate; }
      else t.cd = 0.05;
    }
  }

  // projectiles
  for (const p of G.projs) {
    if (p.kind === 'lob' || p.kind === 'snow') {
      p.t += dt;
      const k = clamp(p.t / p.dur, 0, 1);
      p.x = lerp(p.sx, p.ix, k);
      p.y = lerp(p.sy, p.iy, k) - Math.sin(k * Math.PI) * 70;
      p.spin += dt * 8;
      if (k >= 1) {
        p.dead = true;
        splashDamage(p.ix, p.iy, p.splash, p.dmg, p.src, null, p.burnDps, p.burnDur);
        if (p.slow) {
          for (const e of G.enemies) {
            if (e.dead) continue;
            if (dist2(e.x, e.y, p.ix, p.iy) < (p.splash + e.r) * (p.splash + e.r)) {
              applySlow(e, p.slow, p.slowDur);
              if (p.freezeCh && Math.random() < p.freezeCh) { e.frozenT = 1; AudioSys.freezeSfx(); }
            }
          }
        }
        puff(p.ix, p.iy, p.kind === 'snow' ? '#cfeaff' : '#e8c46a', 14, 150, 0.5, 5);
        puff(p.ix, p.iy, p.kind === 'snow' ? '#8ac4e8' : '#8f6a3a', 8, 90, 0.4, 4);
        G.shake = Math.max(G.shake, 2);
        AudioSys.hit();
      }
      continue;
    }
    if (p.kind === 'bee') {
      p.life -= dt;
      if (p.life <= 0) { p.dead = true; continue; }
      if (!p.target || p.target.dead) {
        // retarget nearest
        let nd = 1e9, nt = null;
        for (const e of G.enemies) {
          if (e.dead || e.dist < 0) continue;
          const d = dist2(p.x, p.y, e.x, e.y);
          if (d < nd) { nd = d; nt = e; }
        }
        p.target = nt;
        if (!p.target) { p.x += p.vx * dt; p.y += p.vy * dt; continue; }
      }
      p.wob += dt * 14;
      const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy) || 1;
      p.vx = dx / d * p.spd + Math.cos(p.wob) * 60;
      p.vy = dy / d * p.spd + Math.sin(p.wob) * 60;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (d < p.target.r + 6) {
        dealDamage(p.target, p.dmg, p.src);
        puff(p.x, p.y, '#e8c93a', 3, 50, 0.3, 2);
        p.dead = true;
      }
      continue;
    }
    // homing / straight (acorn, walnut, sap)
    let tx, ty;
    if (p.target && !p.target.dead) { tx = p.target.x; ty = p.target.y; }
    else if (p.vx || p.vy) { tx = p.x + p.vx; ty = p.y + p.vy; }
    else { p.dead = true; continue; }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    p.vx = dx / d * p.spd; p.vy = dy / d * p.spd;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.spin += dt * 14;
    if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) { p.dead = true; continue; }
    for (const e of G.enemies) {
      if (e.dead || p.hitSet.has(e) || e.dist < 0) continue;
      if (dist2(p.x, p.y, e.x, e.y) < (e.r + 7) * (e.r + 7)) {
        p.hitSet.add(e);
        if (p.kind === 'sap') {
          dealDamage(e, p.dmg, p.src);
          applySlow(e, p.slow, p.slowDur);
          puff(p.x, p.y, '#e8c93a', 6, 60, 0.4, 3);
          p.dead = true;
        } else {
          dealDamage(e, p.dmg, p.src, p.critAdd || 0);
          if (G.mods.acornExplode && (p.kind === 'acorn' || p.kind === 'walnut')) {
            splashDamage(p.x, p.y, 34, p.dmg * 0.6, p.src, e);
            puff(p.x, p.y, '#ff9a4d', 7, 100, 0.35, 3);
          } else puff(p.x, p.y, '#d9b380', 4, 60, 0.3, 2.5);
          AudioSys.hit();
          if (p.pierce > 0) { p.pierce--; p.target = null; }
          else p.dead = true;
        }
        break;
      }
    }
  }
  G.projs = G.projs.filter(p => !p.dead);

  achTick();
  if (!G.spawnQ.length && !G.enemies.length) waveCleared();
}

/* ============================================================
   FLOW
   ============================================================ */
function startRun() {
  G.gold = 110 + 25 * metaRank('stash');
  G.oakMax = 20 + 4 * metaRank('oak_hp');
  G.oakHp = G.oakMax;
  G.level = 0; G.wave = 0;
  G.perks = []; G.mods = freshMods();
  G.kills = 0; G.wavesCleared = 0; G.gaEarned = 0;
  G.speed = 1; G.paused = false;
  G.levelDefs = genLevelDefs();
  SAVE.stats.runs++; persistSave();
  enterLevel(0);
}
function enterLevel(idx) {
  G.level = idx; G.wave = 0;
  G.towers = []; G.enemies = []; G.projs = []; G.parts = []; G.texts = []; G.beams = [];
  G.spawnQ = []; G.selected = new Set(); G.placing = null; G.dragBox = null;
  G.leakedThisLevel = false;
  const map = genMap();
  G.grid = map.grid; G.features = map.features;
  G.path = makePath(map.pts);
  G.bgCanvas = buildBackground(idx);
  previewCache = null;
  G.state = 'prep';
  banner(`🗺️ ${G.levelDefs[idx].name}`);
  updateHUD(); renderPalette(); hideTowerPanel();
  setSpeedUI();
  document.getElementById('waveBtn').disabled = false;
  updateWavePreview();
}
function startWave() {
  if (G.state !== 'prep') return;
  G.spawnQ = buildWavePreviewCache();
  previewCache = null;
  G.waveTime = 0; G.rerollUsed = false; G.paused = false;
  G.state = 'wave';
  if (G.mods.interest > 0) {
    const gain = Math.min(60, Math.floor(G.gold * 0.05 * G.mods.interest));
    if (gain > 0) { G.gold += gain; floatText(W / 2, 90, `+${gain}🌰 interest`, '#ffc94d', 14); }
  }
  banner(`WAVE ${globalWave()}`);
  AudioSys.waveGo();
  setSpeedUI();
  document.getElementById('waveBtn').disabled = true;
  document.getElementById('wavePreview').style.display = 'none';
  updateHUD();
}
function waveCleared() {
  G.state = 'prep'; // lock immediately so multi-step frames can't re-trigger
  G.wavesCleared++;
  G.gaEarned += 1;
  SAVE.stats.bestWave = Math.max(SAVE.stats.bestWave, globalWave());
  let bonus = 12 + globalWave() * 3;
  // banker towers pay out + support XP
  for (const t of G.towers) {
    const st = towerStats(t);
    if (TOWER_TYPES[t.key].kind === 'bank') {
      G.gold += Math.round(st.income);
      floatText(t.x, t.y - 30, '+' + Math.round(st.income) + '🌰', '#ffc94d', 12);
      if (st.healPerWave) G.oakHp = Math.min(G.oakMax, G.oakHp + st.healPerWave);
      gainXp(t, xpNeed(t) * 0.3);
    }
    if (TOWER_TYPES[t.key].kind === 'aura') gainXp(t, xpNeed(t) * 0.3);
  }
  G.gold += bonus;
  if (G.mods.regen > 0) G.oakHp = Math.min(G.oakMax, G.oakHp + G.mods.regen);
  AudioSys.coin();
  achTick();
  updateHUD();
  const L = G.levelDefs[G.level];
  if (G.wave >= L.waves - 1) {
    G.gaEarned += 4;
    const lvlBonus = 80 + 40 * (G.level + 1);
    G.gold += lvlBonus;
    if (!G.leakedThisLevel) checkAch('no_leak');
    if (G.level >= G.levelDefs.length - 1) { endRun(true); return; }
    showLevelComplete(bonus, lvlBonus);
  } else {
    G.wave++;
    showPerkChoice(bonus);
  }
}
function endRun(victory) {
  G.state = 'over';
  const leftover = Math.floor(G.gold / 200);
  G.gaBreakdown = {
    waves: G.wavesCleared,
    levels: (victory ? G.levelDefs.length : G.level) * 4,
    victory: victory ? 30 : 0,
    leftover,
  };
  G.gaEarned += (victory ? 30 : 0) + leftover;
  // note: wave GA (+1 each) and level GA (+4 each) already accumulated in gaEarned
  if (victory) { SAVE.stats.wins++; AudioSys.win(); checkAch('win'); }
  else AudioSys.lose();
  SAVE.ga += G.gaEarned;
  SAVE.stats.gaLifetime += G.gaEarned;
  persistSave();
  showGameOver(victory);
}
function retreat() {
  if (G.state === 'menu' || G.state === 'over') return;
  endRun(false);
}

/* ---------- perk rolling ---------- */
function rollPerks() {
  const owned = new Set(G.perks.map(p => p.id));
  const pool = PERKS.filter(p => !(p.unique && owned.has(p.id)));
  const n = 3 + metaRank('lucky');
  const out = [];
  const bag = pool.slice();
  while (out.length < n && bag.length) {
    const roll = Math.random();
    const rar = roll < 0.58 ? 0 : roll < 0.88 ? 1 : 2;
    let cand = bag.filter(p => p.rar === rar);
    if (!cand.length) cand = bag;
    const p = pick(cand);
    bag.splice(bag.indexOf(p), 1);
    out.push(p);
  }
  return out;
}
function applyPerk(perk) {
  G.perks.push(perk);
  SAVE.stats.perksTaken++;
  perk.apply(G.mods);
  if (G.mods.oakBonus > 0) {
    G.oakMax += G.mods.oakBonus;
    G.oakHp = Math.min(G.oakMax, G.oakHp + G.mods.oakBonus);
    G.mods.oakBonus = 0;
  }
  AudioSys.perk();
  achTick();
  updateHUD();
}

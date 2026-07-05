'use strict';
/* ============================================================
   OAKGUARD render.js — canvas drawing + main loop
   ============================================================ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
(function setupDPR() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
})();

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ============================================================
   BACKGROUND (cached per level)
   ============================================================ */
function buildBackground(levelIdx) {
  const pal = G.levelDefs[levelIdx].pal;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const b = c.getContext('2d');
  const grad = b.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, pal[0]); grad.addColorStop(1, pal[1]);
  b.fillStyle = grad; b.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    b.fillStyle = `rgba(${randi(20, 80)},${randi(80, 130)},${randi(20, 60)},${rand(0.04, 0.1)})`;
    b.beginPath(); b.ellipse(rand(0, W), rand(0, H), rand(8, 40), rand(5, 20), rand(0, TAU), 0, TAU); b.fill();
  }
  // path
  const pts = G.path.pts;
  b.lineCap = 'round'; b.lineJoin = 'round';
  const drawPath = (w2, col) => {
    b.strokeStyle = col; b.lineWidth = w2;
    b.beginPath(); b.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) b.lineTo(x, y);
    b.stroke();
  };
  drawPath(46, '#00000030');
  drawPath(40, '#a67b48');
  drawPath(33, '#c49767');
  for (let d = 10; d < G.path.total; d += 14) {
    const p = G.path.at(d + rand(-5, 5));
    b.fillStyle = `rgba(120,85,45,${rand(0.15, 0.4)})`;
    b.beginPath(); b.arc(p.x + rand(-11, 11), p.y + rand(-11, 11), rand(1.5, 3.5), 0, TAU); b.fill();
  }
  // ---- terrain features ----
  // water highlights pass (after all lake bases, so groups read as one pond)
  const lakes = G.features.filter(f => f.type === 'lake');
  for (const f of G.features) {
    const x = cellCx(f.c), y = cellCy(f.r);
    if (f.type === 'mountain') {
      b.fillStyle = '#00000038';
      b.beginPath(); b.ellipse(x + 3, y + 15, 20, 7, 0, 0, TAU); b.fill();
      b.fillStyle = '#7d7d85';
      b.beginPath(); b.moveTo(x - 19, y + 15); b.lineTo(x - 2, y - 21); b.lineTo(x + 16, y + 15); b.closePath(); b.fill();
      b.fillStyle = '#94949c';
      b.beginPath(); b.moveTo(x - 6, y + 15); b.lineTo(x + 6, y - 14); b.lineTo(x + 19, y + 15); b.closePath(); b.fill();
      b.fillStyle = '#e8ecf0';
      b.beginPath(); b.moveTo(x - 8, y - 8); b.lineTo(x - 2, y - 21); b.lineTo(x + 4, y - 8);
      b.quadraticCurveTo(x - 2, y - 3, x - 8, y - 8); b.closePath(); b.fill();
    } else if (f.type === 'lake') {
      b.fillStyle = '#2d5a78';
      b.beginPath(); b.ellipse(x, y, 27, 23, 0, 0, TAU); b.fill();
    } else if (f.type === 'boulder') {
      b.fillStyle = '#00000038';
      b.beginPath(); b.ellipse(x + 2, y + 8, 13, 6, 0, 0, TAU); b.fill();
      b.fillStyle = '#8f9a8f';
      b.beginPath(); b.ellipse(x, y + 2, 13, 10, rand(-0.2, 0.2), 0, TAU); b.fill();
      b.fillStyle = '#a7b0a7';
      b.beginPath(); b.ellipse(x - 3, y - 2, 6, 4, 0, 0, TAU); b.fill();
    } else if (f.type === 'pine') {
      b.fillStyle = '#00000038';
      b.beginPath(); b.ellipse(x + 2, y + 14, 12, 5, 0, 0, TAU); b.fill();
      b.fillStyle = '#5a3a22'; b.fillRect(x - 2.5, y + 4, 5, 10);
      for (let i = 0; i < 3; i++) {
        b.fillStyle = i % 2 ? '#33582a' : '#3f6b33';
        const w2 = 17 - i * 4, yy = y + 4 - i * 9;
        b.beginPath(); b.moveTo(x - w2, yy); b.lineTo(x, yy - 14); b.lineTo(x + w2, yy); b.closePath(); b.fill();
      }
    } else if (f.type === 'mound') {
      b.fillStyle = '#00000022';
      b.beginPath(); b.ellipse(x + 2, y + 10, 16, 6, 0, 0, TAU); b.fill();
      b.fillStyle = shade(pal[0], 28);
      b.beginPath(); b.ellipse(x, y + 4, 16, 10, 0, 0, TAU); b.fill();
      b.fillStyle = shade(pal[0], 45);
      b.beginPath(); b.ellipse(x, y + 1, 11, 6, 0, 0, TAU); b.fill();
      b.fillStyle = '#ffffffaa'; b.font = 'bold 9px Trebuchet MS'; b.textAlign = 'center';
      b.fillText('+RNG', x, y - 8);
    } else if (f.type === 'mush') {
      for (const [ox, oy, s] of [[-8, 4, 1], [6, -2, 1.2], [0, 8, 0.8]]) {
        b.fillStyle = '#e8e0d0';
        b.fillRect(x + ox - 2 * s, y + oy - 2 * s, 4 * s, 7 * s);
        b.fillStyle = '#c9483a';
        b.beginPath(); b.arc(x + ox, y + oy - 3 * s, 6 * s, Math.PI, 0); b.closePath(); b.fill();
        b.fillStyle = '#ffffffcc';
        b.beginPath(); b.arc(x + ox - 2, y + oy - 5 * s, 1.4, 0, TAU); b.arc(x + ox + 3, y + oy - 4 * s, 1.1, 0, TAU); b.fill();
      }
      b.fillStyle = '#ffd0d0aa'; b.font = 'bold 9px Trebuchet MS'; b.textAlign = 'center';
      b.fillText('+DMG', x, y - 12);
    }
  }
  // lake inner water + shine on top of merged bases
  for (const f of lakes) {
    const x = cellCx(f.c), y = cellCy(f.r);
    b.fillStyle = '#4a86ad';
    b.beginPath(); b.ellipse(x, y - 1, 22, 18, 0, 0, TAU); b.fill();
  }
  for (const f of lakes) {
    const x = cellCx(f.c), y = cellCy(f.r);
    b.fillStyle = '#ffffff2e';
    b.beginPath(); b.ellipse(x - 5, y - 5, 8, 3, -0.4, 0, TAU); b.fill();
  }
  // scattered flowers/leaves
  for (let i = 0; i < 26; i++) {
    const cc = randi(0, COLS - 1), rr = randi(1, 12);
    if (G.grid[rr][cc] !== 0) continue;
    const x = cellCx(cc) + rand(-12, 12), y = cellCy(rr) + rand(-12, 12);
    if (Math.random() < 0.5) {
      b.fillStyle = pick(['#e8d44d', '#e88a9e', '#e8e8e8', pal[2]]);
      for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; b.beginPath(); b.arc(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, 2.4, 0, TAU); b.fill(); }
      b.fillStyle = '#c9861e'; b.beginPath(); b.arc(x, y, 2, 0, TAU); b.fill();
    } else {
      b.save(); b.translate(x, y); b.rotate(rand(0, TAU));
      b.fillStyle = pal[2] + 'bb';
      b.beginPath(); b.ellipse(0, 0, 6, 3.2, 0, 0, TAU); b.fill();
      b.restore();
    }
  }
  const v = b.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
  b.fillStyle = v; b.fillRect(0, 0, W, H);
  return c;
}

/* ============================================================
   ENTITY DRAWING
   ============================================================ */
function drawSquirrel(x, y, col, angle, anim, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const recoil = anim * 3;
  ctx.save();
  ctx.rotate(Math.sin(G.time * 3 + x) * 0.08);
  ctx.fillStyle = shade(col, -18);
  ctx.beginPath();
  ctx.moveTo(-6, 2);
  ctx.bezierCurveTo(-22, 0, -26, -26, -12, -30);
  ctx.bezierCurveTo(-4, -32, -2, -22, -8, -16);
  ctx.bezierCurveTo(-14, -12, -12, -2, -4, -2);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(0, 0, 11, 12.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = shade(col, 35);
  ctx.beginPath(); ctx.ellipse(1, 3, 6.5, 7.5, 0, 0, TAU); ctx.fill();
  const hx = Math.cos(angle) * (3 - recoil), hy = -13 + Math.sin(angle) * 1.5;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(hx, hy, 8, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(hx - 5, hy - 7, 3.2, 0, TAU); ctx.arc(hx + 5, hy - 7, 3.2, 0, TAU); ctx.fill();
  ctx.fillStyle = shade(col, 40);
  ctx.beginPath(); ctx.arc(hx - 5, hy - 7, 1.6, 0, TAU); ctx.arc(hx + 5, hy - 7, 1.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#241812';
  ctx.beginPath(); ctx.arc(hx - 3, hy - 1, 1.7, 0, TAU); ctx.arc(hx + 3, hy - 1, 1.7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(hx - 2.4, hy - 1.6, 0.7, 0, TAU); ctx.arc(hx + 3.6, hy - 1.6, 0.7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a2415';
  ctx.beginPath(); ctx.arc(hx, hy + 2.5, 1.3, 0, TAU); ctx.fill();
  ctx.restore();
}

const TOWER_ITEM = { flinger: '🌰', mortar: '🌲', sap: '🍯', flame: '🔥', frost: '❄️',
  bees: '🐝', disco: '🪩', walnut: '🥥', static: '⚡', bank: '💰' };

function drawTower(t) {
  const tt = TOWER_TYPES[t.key];
  const sel = G.selected.has(t);
  if (sel && G.selected.size === 1) {
    const st = towerStats(t);
    if (st.range > 0) {
      ctx.fillStyle = '#ffffff10'; ctx.strokeStyle = '#ffffff55';
      ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(t.x, t.y, st.range, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (tt.kind === 'aura') {
      const reach = (tt.aura + (t.spec === 0 ? 1 : 0)) * CELL + CELL / 2;
      ctx.fillStyle = '#c77dff18'; ctx.strokeStyle = '#c77dff77';
      ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
      roundRect(t.x - reach, t.y - reach, reach * 2, reach * 2, 10);
      ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (sel) {
    ctx.strokeStyle = '#ffc94d';
    ctx.lineWidth = 2.5;
    roundRect(t.x - CELL / 2 + 3, t.y - CELL / 2 + 3, CELL - 6, CELL - 6, 8);
    ctx.stroke();
  }
  // stump base
  ctx.fillStyle = '#00000040';
  ctx.beginPath(); ctx.ellipse(t.x + 2, t.y + 12, 15, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6b4426';
  ctx.beginPath(); ctx.ellipse(t.x, t.y + 8, 14, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a5a33';
  ctx.beginPath(); ctx.ellipse(t.x, t.y + 5, 14, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#a87748';
  ctx.beginPath(); ctx.ellipse(t.x, t.y + 5, 9, 4.5, 0, 0, TAU); ctx.fill();
  // squirrel + gear
  const dance = tt.kind === 'aura' ? Math.sin(G.time * 6) * 0.4 : 0;
  drawSquirrel(t.x, t.y - 4 + (tt.kind === 'aura' ? Math.abs(Math.sin(G.time * 6)) * -3 : 0), tt.color, t.angle + dance, t.anim);
  const ix = t.x + Math.cos(t.angle) * 12, iy = t.y - 12 + Math.sin(t.angle) * 6;
  ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(TOWER_ITEM[t.key], ix, iy);
  if (tt.kind === 'aura') { // disco ball
    ctx.font = '13px sans-serif';
    ctx.fillText('🪩', t.x, t.y - 36 + Math.sin(G.time * 4) * 2);
  }
  // level pips
  if (t.level > 1) {
    ctx.fillStyle = '#ffc94d';
    for (let i = 0; i < t.level - 1; i++) {
      ctx.beginPath(); ctx.arc(t.x - 8 + i * 4.5, t.y - 30, 1.8, 0, TAU); ctx.fill();
    }
  }
  // spec badge
  if (t.spec !== null && t.spec !== undefined) {
    ctx.font = '9px sans-serif';
    ctx.fillText(tt.specs[t.spec].ico, t.x + 13, t.y - 26);
  } else if (t.level >= SPEC_LEVEL && tt.specs) {
    // pulsing "choose a specialization!" bubble
    const bob = Math.sin(G.time * 5) * 2;
    const pulse = 1 + Math.sin(G.time * 5) * 0.08;
    ctx.save();
    ctx.translate(t.x, t.y - 42 + bob);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#c77dff';
    ctx.shadowColor = '#c77dff'; ctx.shadowBlur = 8;
    roundRect(-8, -9, 16, 17, 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, 7); ctx.lineTo(4, 7); ctx.lineTo(0, 13); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Trebuchet MS';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 0);
    ctx.restore();
  }
  // XP bar
  if (t.level < MAX_TLVL && t.xp > 0) {
    const w2 = 24, pct = clamp(t.xp / xpNeed(t), 0, 1);
    ctx.fillStyle = '#00000088'; ctx.fillRect(t.x - w2 / 2, t.y + 15, w2, 3);
    ctx.fillStyle = '#5ab4e5'; ctx.fillRect(t.x - w2 / 2, t.y + 15, w2 * pct, 3);
  }
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const bob = Math.sin(e.wob * 2) * 1.5;
  ctx.fillStyle = '#00000038';
  ctx.beginPath(); ctx.ellipse(0, e.r * 0.75, e.r * 0.95, e.r * 0.4, 0, 0, TAU); ctx.fill();
  ctx.translate(0, bob);
  if (e.flash > 0) ctx.filter = 'brightness(1.9)';
  if (e.slowT > 0 && e.frozenT <= 0) {
    ctx.fillStyle = '#e8c93a44';
    ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, TAU); ctx.fill();
  }
  const flip = Math.cos(e.ang) < 0 ? -1 : 1;
  ctx.scale(flip, 1);
  ctx.font = `${e.r * 2.1}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ENEMY_TYPES[e.key].ico, 0, 0);
  ctx.filter = 'none';
  ctx.scale(flip, 1);
  if (e.frozenT > 0) {
    ctx.fillStyle = '#a8d8ff66';
    roundRect(-e.r - 2, -e.r - 2, e.r * 2 + 4, e.r * 2 + 4, 6);
    ctx.fill();
    ctx.strokeStyle = '#d8efff99'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (e.burn) {
    ctx.font = '10px sans-serif';
    ctx.fillText('🔥', 0, -e.r - 3 + Math.sin(G.time * 10) * 1.5);
  }
  if (e.hp < e.maxHp) {
    const w2 = e.r * 2.2, pct = clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = '#000000aa'; ctx.fillRect(-w2 / 2, -e.r - 12, w2, 4.5);
    ctx.fillStyle = pct > 0.5 ? '#8fdb4a' : pct > 0.25 ? '#e8c93a' : '#e5533d';
    ctx.fillRect(-w2 / 2 + 0.5, -e.r - 11.5, (w2 - 1) * pct, 3.5);
  }
  ctx.restore();
}

function drawOak() {
  const oak = G.path.at(G.path.total);
  const x = oak.x, y = oak.y;
  const sway = Math.sin(G.time * 1.2) * 2;
  const hurt = G.oakHp / G.oakMax;
  ctx.fillStyle = '#00000045';
  ctx.beginPath(); ctx.ellipse(x, y + 22, 46, 13, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6b4426';
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 22);
  ctx.bezierCurveTo(x - 10, y - 4, x - 8, y - 14, x - 6 + sway * 0.4, y - 30);
  ctx.lineTo(x + 6 + sway * 0.4, y - 30);
  ctx.bezierCurveTo(x + 8, y - 14, x + 10, y - 4, x + 14, y + 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7d5230';
  ctx.fillRect(x - 3, y - 20, 3, 34);
  const canopy = hurt > 0.6 ? '#4f8a2e' : hurt > 0.3 ? '#8a8a2e' : '#8a5a2e';
  const canopy2 = hurt > 0.6 ? '#67a83c' : hurt > 0.3 ? '#a8a83c' : '#a8703c';
  for (const [ox, oy, r] of [[-26, -44, 22], [26, -44, 22], [0, -62, 26], [-13, -50, 20], [13, -50, 20], [0, -42, 24]]) {
    ctx.fillStyle = canopy;
    ctx.beginPath(); ctx.arc(x + ox + sway, y + oy, r, 0, TAU); ctx.fill();
  }
  for (const [ox, oy, r] of [[-20, -50, 13], [18, -56, 12], [-2, -66, 14]]) {
    ctx.fillStyle = canopy2;
    ctx.beginPath(); ctx.arc(x + ox + sway, y + oy, r, 0, TAU); ctx.fill();
  }
  if (hurt > 0.6) {
    ctx.fillStyle = '#d7f0a222';
    ctx.beginPath(); ctx.arc(x + sway, y - 52, 42 + Math.sin(G.time * 2) * 3, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#3a2415';
  ctx.beginPath(); ctx.arc(x - 4, y - 12, 1.8, 0, TAU); ctx.arc(x + 4, y - 12, 1.8, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3a2415'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (hurt > 0.5) ctx.arc(x, y - 7, 4, 0.15 * Math.PI, 0.85 * Math.PI);
  else ctx.arc(x, y - 2, 4, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.stroke();
}

function drawSpawnHole() {
  const p = G.path.at(2);
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 4, 26, 15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#241a10';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 25, 14, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0f0a06';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 18, 9, 0, 0, TAU); ctx.fill();
}

function drawProjectile(p) {
  if (p.kind === 'lob' || p.kind === 'snow') {
    const k = clamp(p.t / p.dur, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.25 * k})`;
    ctx.beginPath(); ctx.ellipse(p.ix, p.iy, 8 * k + 3, 4 * k + 1.5, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin);
    if (p.kind === 'snow') {
      ctx.fillStyle = '#e8f4ff';
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(-2, -2, 3, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#4f6b34';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#37502a';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, -4 + i * 4, 3.5, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.kind === 'bee') {
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🐝', 0, 0);
    ctx.restore();
    return;
  }
  ctx.rotate(p.spin);
  if (p.kind === 'sap') {
    ctx.fillStyle = '#e8b83a';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.arc(-1.5, -1.5, 2, 0, TAU); ctx.fill();
  } else if (p.kind === 'walnut') {
    ctx.fillStyle = '#6b4426';
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 5.6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a5f38'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke();
  } else {
    ctx.fillStyle = '#a8703c';
    ctx.beginPath(); ctx.ellipse(0, 1, 4.4, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6b4426';
    ctx.beginPath(); ctx.arc(0, -3, 4.2, Math.PI, 0); ctx.lineTo(4.2, -1.8); ctx.lineTo(-4.2, -1.8); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawBeams() {
  for (const b of G.beams) {
    const alpha = b.life / 0.14;
    ctx.strokeStyle = `rgba(160,220,255,${alpha})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#7db4e0'; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(b.pts[0][0], b.pts[0][1]);
    for (let i = 1; i < b.pts.length; i++) {
      const [x1, y1] = b.pts[i - 1], [x2, y2] = b.pts[i];
      ctx.quadraticCurveTo((x1 + x2) / 2 + rand(-8, 8), (y1 + y2) / 2 + rand(-8, 8), x2, y2);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawPlacingGhost() {
  if (!G.placing || mouseX < 0) return;
  // faint grid over buildable cells
  ctx.strokeStyle = '#ffffff14';
  ctx.lineWidth = 1;
  for (let r = 1; r <= 12; r++) {
    for (let c = 0; c < COLS; c++) {
      const g = G.grid[r][c];
      if (g === 1 || g === 2) continue;
      const occupied = G.towers.some(t => t.col === c && t.row === r);
      if (occupied) continue;
      ctx.strokeRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
      if (g === 3 || g === 4) {
        ctx.fillStyle = g === 3 ? '#5ab4e51c' : '#e5533d1c';
        ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
      }
    }
  }
  const c = Math.floor(mouseX / CELL), r = Math.floor(mouseY / CELL);
  const ok = validCell(c, r);
  const x = cellCx(c), y = cellCy(r);
  const tt = TOWER_TYPES[G.placing];
  if (tt.range > 0) {
    const range = tt.range * G.mods.range;
    ctx.fillStyle = ok ? '#7fce4d22' : '#e5533d22';
    ctx.strokeStyle = ok ? '#7fce4d99' : '#e5533d99';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, range, 0, TAU); ctx.fill(); ctx.stroke();
  }
  if (tt.kind === 'aura') {
    const reach = tt.aura * CELL + CELL / 2;
    ctx.fillStyle = ok ? '#c77dff22' : '#e5533d22';
    ctx.strokeStyle = ok ? '#c77dff88' : '#e5533d88';
    ctx.lineWidth = 2;
    roundRect(x - reach, y - reach, reach * 2, reach * 2, 10);
    ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = ok ? '#7fce4d33' : '#e5533d44';
  roundRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 7);
  ctx.fill();
  ctx.globalAlpha = 0.75;
  drawSquirrel(x, y - 4, tt.color, 0, 0);
  ctx.globalAlpha = 1;
  if (!ok) {
    ctx.strokeStyle = '#ff5540'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 10); ctx.lineTo(x + 10, y + 10);
    ctx.moveTo(x + 10, y - 10); ctx.lineTo(x - 10, y + 10);
    ctx.stroke();
  }
}

function drawDragBox() {
  if (!G.dragBox) return;
  const { x0, y0, x1, y1 } = G.dragBox;
  ctx.fillStyle = '#ffc94d18';
  ctx.strokeStyle = '#ffc94daa';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  const x = Math.min(x0, x1), y = Math.min(y0, y1);
  ctx.fillRect(x, y, Math.abs(x1 - x0), Math.abs(y1 - y0));
  ctx.strokeRect(x, y, Math.abs(x1 - x0), Math.abs(y1 - y0));
  ctx.setLineDash([]);
}

function drawBossBar() {
  const boss = G.enemies.find(e => e.boss && !e.dead);
  if (!boss) return;
  const w2 = 380, x = (W - w2) / 2, y = 44;
  ctx.fillStyle = '#000000aa';
  roundRect(x - 4, y - 4, w2 + 8, 22, 8); ctx.fill();
  const pct = clamp(boss.hp / boss.maxHp, 0, 1);
  const grad = ctx.createLinearGradient(x, 0, x + w2, 0);
  grad.addColorStop(0, '#e5533d'); grad.addColorStop(1, '#ff8a5b');
  ctx.fillStyle = grad;
  roundRect(x, y, Math.max(6, w2 * pct), 14, 6); ctx.fill();
  ctx.fillStyle = '#ffe1d0'; ctx.font = 'bold 11px Trebuchet MS'; ctx.textAlign = 'center';
  ctx.fillText('🐻 ' + ENEMY_TYPES.bear.name, W / 2, y + 26);
}

/* ambient falling leaves */
const leaves = Array.from({ length: 14 }, () => ({
  x: rand(0, W), y: rand(0, H), spd: rand(12, 30), sway: rand(0, TAU), size: rand(3, 6),
  col: pick(['#e8a33d', '#d97941', '#c4573a', '#e5c04a'])
}));
function drawAmbient() {
  for (const l of leaves) {
    l.y += l.spd * 0.016;
    l.sway += 0.032;
    l.x += Math.sin(l.sway) * 0.5;
    if (l.y > H + 10) { l.y = -10; l.x = rand(0, W); }
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.sway);
    ctx.fillStyle = l.col + '99';
    ctx.beginPath(); ctx.ellipse(0, 0, l.size, l.size * 0.55, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function render() {
  ctx.save();
  if (G.shake > 0.2) ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);
  if (G.bgCanvas) ctx.drawImage(G.bgCanvas, 0, 0);
  else { ctx.fillStyle = '#2a3d1e'; ctx.fillRect(0, 0, W, H); }
  if (G.path) drawSpawnHole();

  const drawables = [];
  for (const e of G.enemies) if (!e.dead && e.dist >= 0) drawables.push({ y: e.y, fn: () => drawEnemy(e) });
  for (const t of G.towers) drawables.push({ y: t.y, fn: () => drawTower(t) });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.fn();

  if (G.path) drawOak();
  for (const p of G.projs) drawProjectile(p);
  drawBeams();

  for (const p of G.parts) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const t of G.texts) {
    ctx.globalAlpha = clamp(t.life / 0.4, 0, 1);
    ctx.font = `bold ${t.size}px Trebuchet MS`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000aa'; ctx.lineWidth = 3;
    ctx.strokeText(t.txt, t.x, t.y);
    ctx.fillStyle = t.col;
    ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  drawPlacingGhost();
  drawDragBox();
  drawBossBar();
  ctx.restore();
  drawAmbient();
}

/* ============================================================
   MAIN LOOP
   ============================================================ */
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const halted = document.getElementById('modalLayer').classList.contains('show') || G.paused;
  if (!halted) {
    for (let i = 0; i < G.speed; i++) {
      update(dt);
      if (G.state !== 'wave' && i > 0) break;
    }
  }
  render();
  requestAnimationFrame(frame);
}

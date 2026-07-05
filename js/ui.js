'use strict';
/* ============================================================
   OAKGUARD ui.js — HUD, panels, modals, input, boot
   ============================================================ */
const modalLayer = document.getElementById('modalLayer');
const modalBox = document.getElementById('modalBox');
function openModal(html) { modalBox.innerHTML = html; modalLayer.classList.add('show'); }
function closeModal() { modalLayer.classList.remove('show'); }

/* ---------- HUD ---------- */
function updateHUD() {
  document.getElementById('goldTxt').textContent = fmt(G.gold);
  document.getElementById('gaTxt').textContent = SAVE.ga + (G.gaEarned && G.state !== 'menu' ? ` +${G.gaEarned}` : '');
  const tw = G.levelDefs.length ? totalWavesOf(G.levelDefs) : 35;
  document.getElementById('lvlTxt').textContent = `${G.level + 1}/${G.levelDefs.length || 5}`;
  document.getElementById('waveTxt').textContent = `${globalWave()}/${tw}`;
  const pct = clamp(G.oakHp / G.oakMax, 0, 1);
  const bar = document.getElementById('hpBarInner');
  bar.style.width = (pct * 100) + '%';
  bar.classList.toggle('low', pct < 0.35);
  document.getElementById('hpText').textContent = `GREAT OAK ${Math.max(0, Math.ceil(G.oakHp))}/${G.oakMax}`;
  document.getElementById('perkCount').textContent = G.perks.length;
  if (perkPanel.style.display === 'block') renderPerkPanel();
  renderPaletteAfford();
}
function updateWavePreview() {
  const el = document.getElementById('wavePreview');
  if (G.state === 'prep') {
    el.style.display = 'block';
    el.innerHTML = `🔭 Next wave: ${wavePreviewText()}`;
  } else el.style.display = 'none';
}

/* ---------- perk tray ---------- */
const perkPanel = document.getElementById('perkPanel');
function perkEffectLines() {
  const m = G.mods, out = [];
  const pct = v => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  if (m.dmg !== 1) out.push(['Tower damage', pct(m.dmg - 1)]);
  if (m.rate !== 1) out.push(['Attack speed', pct(m.rate - 1)]);
  if (m.range !== 1) out.push(['Tower range', pct(m.range - 1)]);
  if (m.costMult !== 1) out.push(['Tower cost', pct(m.costMult - 1)]);
  if (m.goldKill !== 1) out.push(['Acorns from kills', pct(m.goldKill - 1)]);
  if (m.goldFlat > 0) out.push(['Bonus per kill', `+${m.goldFlat}🌰`]);
  if (m.splash !== 1) out.push(['Splash radius', pct(m.splash - 1)]);
  if (m.slowPower > 0) out.push(['Slow strength', pct(m.slowPower)]);
  if (m.burnMult !== 1) out.push(['Burn damage', pct(m.burnMult - 1)]);
  if (m.xpMult !== 1) out.push(['Tower XP', pct(m.xpMult - 1)]);
  if (m.critCh > 0) out.push(['Crit chance (2.5×)', Math.round(m.critCh * 100) + '%']);
  if (m.doubleShot > 0) out.push(['Double-shot chance', Math.round(m.doubleShot * 100) + '%']);
  if (m.pierceBonus > 0) out.push(['Acorn/walnut pierce', `+${m.pierceBonus}`]);
  if (m.chainBonus > 0) out.push(['Lightning chains', `+${m.chainBonus}`]);
  if (m.bossDmg !== 1) out.push(['Boss damage', pct(m.bossDmg - 1)]);
  if (m.beeBonus > 0) out.push(['Bees per volley', `+${m.beeBonus}`]);
  if (m.auraBonus > 0) out.push(['Disco aura', pct(m.auraBonus)]);
  if (m.interest > 0) out.push(['Acorn interest/wave', `${5 * m.interest}% (max 60)`]);
  if (m.regen > 0) out.push(['Oak heal per wave', `+${m.regen} HP`]);
  if (m.sellRate > 0.7) out.push(['Sell refund', Math.round(m.sellRate * 100) + '%']);
  const uniq = [];
  if (m.acornExplode) uniq.push('🧨 Acorn hits explode');
  if (m.frenzy) uniq.push('🔥 +60% speed, first 6s of waves');
  if (m.rootSnare) uniq.push('🕸️ Enemies near Oak 30% slower');
  if (m.oakWrath) uniq.push("😡 Oak blasts all foes when hit");
  if (m.veteran) uniq.push('🎖️ New towers start at Lv 2');
  if (m.coldSnap) uniq.push('🌨️ All hits slow enemies 15%');
  return { out, uniq };
}
function renderPerkPanel() {
  // stacked perk icons
  const stacks = {};
  for (const p of G.perks) {
    if (!stacks[p.id]) stacks[p.id] = { p, n: 0 };
    stacks[p.id].n++;
  }
  const icons = Object.values(stacks).map(({ p, n }) =>
    `<span class="pstack" title="${p.name}: ${p.desc}">${p.ico}${n > 1 ? `<span class="n">×${n}</span>` : ''}</span>`).join('');
  const { out, uniq } = perkEffectLines();
  const lines = out.map(([k, v]) => `<div class="effline"><span>${k}</span><b>${v}</b></div>`).join('');
  const uniqs = uniq.map(u => `<div class="effline effuniq">${u}</div>`).join('');
  perkPanel.innerHTML = `
    <h3>🎁 Active bonuses (${G.perks.length} perk${G.perks.length === 1 ? '' : 's'})</h3>
    ${G.perks.length || out.length || uniq.length ? `
      ${icons ? `<div class="picons">${icons}</div>` : ''}
      ${lines}${uniqs}
      <div class="xpTxt" style="margin-top:6px;">Includes shop boosts · hover an icon for details</div>`
      : `<div class="pempty">No perks yet.<br>Clear a wave to choose your first one!</div>`}
  `;
}
function togglePerkPanel(force) {
  const show = force !== undefined ? force : perkPanel.style.display !== 'block';
  perkPanel.style.display = show ? 'block' : 'none';
  if (show) renderPerkPanel();
}
document.getElementById('perkPill').onclick = () => { AudioSys.init(); togglePerkPanel(); };

/* ---------- speed / pause ---------- */
function setSpeedUI() {
  document.getElementById('spPause').classList.toggle('pauseOn', G.paused);
  document.getElementById('sp1').classList.toggle('on', !G.paused && G.speed === 1);
  document.getElementById('sp2').classList.toggle('on', !G.paused && G.speed === 2);
  document.getElementById('sp3').classList.toggle('on', !G.paused && G.speed === 3);
  document.getElementById('pausedBadge').style.display = G.paused ? 'block' : 'none';
}
function setSpeed(n) { G.speed = n; G.paused = false; setSpeedUI(); }
function togglePause() { G.paused = !G.paused; setSpeedUI(); }
document.getElementById('spPause').onclick = () => { AudioSys.init(); togglePause(); };
document.getElementById('sp1').onclick = () => { AudioSys.init(); setSpeed(1); };
document.getElementById('sp2').onclick = () => { AudioSys.init(); setSpeed(2); };
document.getElementById('sp3').onclick = () => { AudioSys.init(); setSpeed(3); };

/* ---------- palette ---------- */
function renderPalette() {
  const pal = document.getElementById('palette');
  pal.innerHTML = '';
  TOWER_ORDER.forEach((key, i) => {
    const tt = TOWER_TYPES[key];
    const locked = tt.meta && metaRank(tt.meta) === 0;
    const div = document.createElement('div');
    div.className = 'tcard' + (locked ? ' off' : '');
    div.dataset.key = key;
    div.title = locked ? 'Unlock in The Grove (✨)' : `${tt.desc}${tt.specs ? ' · Specializes at Lv3' : ''}`;
    div.innerHTML = `<div class="tkey">${(i + 1) % 10}</div><div class="tico">${tt.ico}</div>
      <div class="tname">${tt.name}</div><div class="tcost">🌰${towerCost(key)}</div>
      ${locked ? '<div class="tlock">🔒</div>' : ''}`;
    if (!locked) div.onclick = () => beginPlacing(key);
    pal.appendChild(div);
  });
  renderPaletteAfford();
}
function renderPaletteAfford() {
  document.querySelectorAll('.tcard').forEach(el => {
    const key = el.dataset.key;
    const tt = TOWER_TYPES[key];
    if (tt.meta && metaRank(tt.meta) === 0) return;
    const afford = G.gold >= towerCost(key);
    el.classList.toggle('off', !afford);
    el.classList.toggle('sel', G.placing === key);
    const costEl = el.querySelector('.tcost');
    if (costEl) costEl.textContent = `🌰${towerCost(key)}`;
  });
}
function beginPlacing(key) {
  if (G.state !== 'prep' && G.state !== 'wave') return;
  if (G.gold < towerCost(key)) { AudioSys.error(); return; }
  G.placing = G.placing === key ? null : key;
  G.selected = new Set(); hideTowerPanel();
  renderPaletteAfford();
}

/* ---------- tower panel ---------- */
const towerPanel = document.getElementById('towerPanel');
function hideTowerPanel() { towerPanel.style.display = 'none'; }
function refreshTowerPanel() {
  if (G.selected.size === 0) { hideTowerPanel(); return; }
  if (G.selected.size === 1) showTowerPanel([...G.selected][0]);
  else showGroupPanel();
}
function showTowerPanel(t) {
  const tt = TOWER_TYPES[t.key];
  const st = towerStats(t);
  const maxed = t.level >= MAX_TLVL;
  const uc = upgCost(t);
  const sell = Math.round(t.invested * G.mods.sellRate);
  const needsSpec = t.level >= SPEC_LEVEL && (t.spec === null || t.spec === undefined) && tt.specs;
  // stats at next level, for the upgrade preview column
  const nx = maxed ? null : towerStats(Object.assign({}, t, { level: t.level + 1 }));
  const row = (label, cur, next, fmtFn = v => fmt(v)) => {
    if (!cur && !next) return '';
    const arrow = nx && next != null && fmtFn(next) !== fmtFn(cur)
      ? ` <span style="opacity:.55">➜</span> <b style="color:#b9e25a">${fmtFn(next)}</b>` : '';
    return `<div class="stat"><span>${label}</span><span><b>${fmtFn(cur)}</b>${arrow}</span></div>`;
  };
  towerPanel.style.display = 'block';
  towerPanel.innerHTML = `
    <h3>${tt.ico} ${tt.name} <span class="lvltag">Lv ${t.level}/${MAX_TLVL}</span></h3>
    ${t.spec != null ? `<div class="specTag">${tt.specs[t.spec].ico} ${tt.specs[t.spec].name}</div>` : ''}
    ${st.range > 0 ? row('Damage', st.dmg, nx && nx.dmg) +
      row('Speed', st.rate, nx && nx.rate, v => v.toFixed(2) + '/s') +
      row('Range', st.range, nx && nx.range, v => Math.round(v)) : ''}
    ${st.splash ? row('Splash', st.splash, nx && nx.splash, v => Math.round(v)) : ''}
    ${st.slow ? row('Slow', st.slow, nx && nx.slow, v => Math.round(v * 100) + '%') : ''}
    ${st.pierce ? row('Pierce', st.pierce, nx && nx.pierce, v => v) : ''}
    ${st.chain ? row('Chains', st.chain, nx && nx.chain, v => v) : ''}
    ${st.burnDps ? row('Burn', st.burnDps, nx && nx.burnDps, v => fmt(v) + '/s') : ''}
    ${st.beeCount ? row('Bees', st.beeCount, nx && nx.beeCount, v => v) : ''}
    ${st.income ? row('Income', st.income, nx && nx.income, v => Math.round(v) + '/wv') : ''}
    ${tt.kind === 'aura' ? `<div class="stat"><span>Aura buff</span><span><b>+${Math.round((auraBuffOf(t)) * 100)}%</b></span></div>` : ''}
    ${!maxed ? `<div class="xpOuter"><div class="xpInner" style="width:${clamp(t.xp / xpNeed(t), 0, 1) * 100}%"></div></div>
    <div class="xpTxt">XP ${Math.floor(t.xp)} / ${xpNeed(t)} — earned by dealing damage</div>` :
    '<div class="xpTxt" style="color:var(--gold)">★ MAX LEVEL ★</div>'}
    ${needsSpec ? `<div class="specHead">⚡ CHOOSE SPECIALIZATION</div>
      <button class="pbtn specBtn" data-spec="0">${tt.specs[0].ico} <b>${tt.specs[0].name}</b><br>${tt.specs[0].desc}</button>
      <button class="pbtn specBtn" data-spec="1">${tt.specs[1].ico} <b>${tt.specs[1].name}</b><br>${tt.specs[1].desc}</button>` : ''}
    ${tt.specs && t.spec == null && t.level < SPEC_LEVEL ?
      `<div class="xpTxt" style="color:var(--epic)">🔒 Specialization unlocks at Lv ${SPEC_LEVEL}</div>` : ''}
    <button class="pbtn" id="upgBtn" ${maxed || G.gold < uc ? 'disabled' : ''}>
      ${maxed ? 'MAX LEVEL' : `⬆ BUY LEVEL — 🌰${uc}`}</button>
    <button class="pbtn" id="sellBtn">💸 SELL — 🌰${sell}</button>
  `;
  towerPanel.querySelectorAll('.specBtn').forEach(btn => {
    btn.onclick = () => {
      if (t.level < SPEC_LEVEL || t.spec != null) return;
      t.spec = +btn.dataset.spec;
      puff(t.x, t.y, '#c77dff', 14, 120, 0.5, 4);
      floatText(t.x, t.y - 34, tt.specs[t.spec].name + '!', '#c77dff', 13);
      AudioSys.upgrade();
      checkAch('spec');
      refreshTowerPanel();
    };
  });
  document.getElementById('upgBtn').onclick = () => payUpgrade(t);
  document.getElementById('sellBtn').onclick = () => sellTowers([t]);
}
function auraBuffOf(d) {
  return TOWER_TYPES.disco.auraBuff + (d.spec === 1 ? 0.10 : 0) + G.mods.auraBonus;
}
function showGroupPanel() {
  const list = [...G.selected];
  const upgradable = list.filter(t => t.level < MAX_TLVL);
  const totalUpg = upgradable.reduce((s, t) => s + upgCost(t), 0);
  const totalSell = list.reduce((s, t) => s + Math.round(t.invested * G.mods.sellRate), 0);
  towerPanel.style.display = 'block';
  towerPanel.innerHTML = `
    <h3>👥 ${list.length} towers selected</h3>
    <div class="stat"><span>Upgradable</span><b>${upgradable.length}</b></div>
    <button class="pbtn upgAllBtn" id="upgAllBtn" ${!upgradable.length || G.gold < totalUpg ? 'disabled' : ''}>
      ⬆ UPGRADE ALL — 🌰${totalUpg}</button>
    <button class="pbtn sellAllBtn" id="sellAllBtn">💸 SELL ALL — 🌰${totalSell}</button>
    <div class="xpTxt">Tip: drag on the map or Shift-click to multi-select</div>
  `;
  document.getElementById('upgAllBtn').onclick = () => {
    if (G.gold < totalUpg) return;
    for (const t of upgradable) payUpgrade(t, true);
    AudioSys.upgrade();
    refreshTowerPanel(); updateHUD();
  };
  document.getElementById('sellAllBtn').onclick = () => sellTowers(list);
}
function payUpgrade(t, silent = false) {
  if (t.level >= MAX_TLVL) return;
  const cost = upgCost(t);
  if (G.gold < cost) return;
  G.gold -= cost;
  t.invested += cost;
  t.level++;
  puff(t.x, t.y, '#b9e25a', 12, 110, 0.5, 4);
  if (t.level === SPEC_LEVEL && t.spec == null && TOWER_TYPES[t.key].specs)
    floatText(t.x, t.y - 30, '⚡ SPECIALIZE!', '#c77dff', 14);
  else floatText(t.x, t.y - 30, 'LEVEL UP!', '#b9e25a', 14);
  if (!silent) AudioSys.upgrade();
  if (t.level >= MAX_TLVL) { t.xp = 0; checkAch('max_tower'); }
  updateHUD(); refreshTowerPanel();
}
function sellTowers(list) {
  for (const t of list) {
    G.gold += Math.round(t.invested * G.mods.sellRate);
    puff(t.x, t.y, '#ffc94d', 10, 90, 0.4, 4);
  }
  const sold = new Set(list);
  G.towers = G.towers.filter(x => !sold.has(x));
  AudioSys.sell();
  G.selected = new Set();
  hideTowerPanel(); updateHUD();
}

/* ---------- input ---------- */
let mouseX = -100, mouseY = -100;
let downPos = null;
function canvasPos(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * (W / r.width), y: (ev.clientY - r.top) * (H / r.height) };
}
function validCell(c, r) {
  if (c < 0 || c >= COLS || r < 1 || r > 12) return false;
  if (!G.grid) return false;
  const g = G.grid[r][c];
  if (g !== 0 && g !== 3 && g !== 4) return false;
  if (G.towers.some(t => t.col === c && t.row === r)) return false;
  return true;
}
canvas.addEventListener('pointermove', ev => {
  const p = canvasPos(ev);
  mouseX = p.x; mouseY = p.y;
  if (downPos && !G.placing && (Math.abs(p.x - downPos.x) > 8 || Math.abs(p.y - downPos.y) > 8)) {
    G.dragBox = { x0: downPos.x, y0: downPos.y, x1: p.x, y1: p.y };
  }
  if (G.dragBox) { G.dragBox.x1 = p.x; G.dragBox.y1 = p.y; }
});
canvas.addEventListener('pointerleave', () => { mouseX = -100; mouseY = -100; });
canvas.addEventListener('contextmenu', ev => {
  ev.preventDefault();
  G.placing = null; G.selected = new Set();
  hideTowerPanel(); renderPaletteAfford();
});
canvas.addEventListener('pointerdown', ev => {
  if (ev.button !== 0) return;
  AudioSys.init();
  if (G.state !== 'prep' && G.state !== 'wave') return;
  downPos = canvasPos(ev);
});
canvas.addEventListener('pointerup', ev => {
  if (ev.button !== 0) return;
  if (G.state !== 'prep' && G.state !== 'wave') { downPos = null; return; }
  const p = canvasPos(ev);
  // drag-select finish
  if (G.dragBox) {
    const { x0, y0, x1, y1 } = G.dragBox;
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const hit = G.towers.filter(t => t.x >= xa && t.x <= xb && t.y >= ya && t.y <= yb);
    if (!ev.shiftKey) G.selected = new Set();
    hit.forEach(t => G.selected.add(t));
    G.dragBox = null; downPos = null;
    refreshTowerPanel();
    return;
  }
  downPos = null;
  // placement
  if (G.placing) {
    const c = Math.floor(p.x / CELL), r = Math.floor(p.y / CELL);
    const cost = towerCost(G.placing);
    if (G.gold >= cost && validCell(c, r)) {
      G.gold -= cost;
      const t = makeTower(G.placing, c, r);
      G.towers.push(t);
      SAVE.stats.towersBuilt++;
      puff(t.x, t.y, '#c9a86a', 10, 90, 0.4, 4);
      AudioSys.build();
      achTick();
      if (G.gold < towerCost(G.placing)) G.placing = null;
      updateHUD();
    } else AudioSys.error();
    return;
  }
  // click select
  const c = Math.floor(p.x / CELL), r = Math.floor(p.y / CELL);
  const found = G.towers.find(t => t.col === c && t.row === r);
  if (ev.shiftKey) {
    if (found) { G.selected.has(found) ? G.selected.delete(found) : G.selected.add(found); }
  } else {
    G.selected = new Set(found ? [found] : []);
  }
  refreshTowerPanel();
});
window.addEventListener('keydown', ev => {
  if (modalLayer.classList.contains('show')) return;
  if (ev.key === 'Escape') { G.placing = null; G.selected = new Set(); hideTowerPanel(); togglePerkPanel(false); renderPaletteAfford(); }
  if (ev.key === ' ') { ev.preventDefault(); if (G.state === 'prep') startWave(); else togglePause(); }
  if (ev.key === 'p' || ev.key === 'P') togglePause();
  if (ev.key === 'f' || ev.key === 'F') setSpeed(G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1);
  const n = parseInt(ev.key);
  if (!isNaN(n)) {
    const idx = n === 0 ? 9 : n - 1;
    if (idx < TOWER_ORDER.length) {
      const key = TOWER_ORDER[idx];
      const tt = TOWER_TYPES[key];
      if (!tt.meta || metaRank(tt.meta) > 0) beginPlacing(key);
    }
  }
});
document.getElementById('waveBtn').onclick = () => { AudioSys.init(); startWave(); };
document.getElementById('muteBtn').onclick = () => {
  AudioSys.init();
  AudioSys.muted = !AudioSys.muted;
  document.getElementById('muteBtn').textContent = AudioSys.muted ? '🔇' : '🔊';
};
document.getElementById('helpBtn').onclick = () => {
  if (G.state === 'menu' || G.state === 'over') return;
  G.paused = true; setSpeedUI();
  showHelp(() => { closeModal(); G.paused = false; setSpeedUI(); });
};
document.getElementById('quitBtn').onclick = () => {
  if (G.state === 'menu' || G.state === 'over') return;
  if (confirm(`Retreat from this run?\n\nYou keep the ✨${G.gaEarned} Golden Acorns earned so far (plus ${Math.floor(G.gold / 200)} more from your ${fmt(G.gold)} leftover acorns).`)) retreat();
};

/* ============================================================
   SCREENS
   ============================================================ */
function showMenu() {
  G.state = 'menu';
  const unl = TOWER_ORDER.filter(k => !TOWER_TYPES[k].meta || metaRank(TOWER_TYPES[k].meta) > 0).length;
  const achN = Object.keys(SAVE.ach).length;
  openModal(`
    <div id="title-logo">🐿️ OAKGUARD</div>
    <div id="title-sub">Squirrel Roguelike Tower Defense</div>
    <div class="sub">Pests are marching on the <b style="color:var(--gold)">Great Oak</b>.<br>
      Build squirrel towers, pick wild perks, survive 5 randomly generated forests.</div>
    <div class="statline">
      <span>✨ Golden Acorns: <b>${SAVE.ga}</b></span>
      <span>🌊 Best wave: <b>${SAVE.stats.bestWave}</b></span>
      <span>🏆 Wins: <b>${SAVE.stats.wins}</b></span>
      <span>🏰 Towers: <b>${unl}/${TOWER_ORDER.length}</b></span>
      <span>🎖️ ${achN}/${ACHIEVEMENTS.length}</span>
    </div>
    <button class="bigbtn" id="mPlay">▶ NEW RUN<span class="btnnote">start fresh from forest 1</span></button>
    <button class="bigbtn alt" id="mGrove">✨ THE GROVE<span class="btnnote">spend Golden Acorns on permanent upgrades</span></button>
    <br>
    <button class="bigbtn ghost" id="mAch">🎖️ ACHIEVEMENTS</button>
    <button class="bigbtn ghost" id="mHelp">❓ HOW TO PLAY</button>
    <div class="hint">Every run earns ✨ Golden Acorns (kept forever) — even when you lose.<br>
      Leftover 🌰 acorns convert at 200 : 1 when a run ends, so spend them in the shop!</div>
  `);
  document.getElementById('mPlay').onclick = () => { AudioSys.init(); closeModal(); startRun(); };
  document.getElementById('mGrove').onclick = () => { AudioSys.init(); showGrove(); };
  document.getElementById('mAch').onclick = () => { AudioSys.init(); showAchievements(); };
  document.getElementById('mHelp').onclick = () => { AudioSys.init(); showHelp(showMenu); };
}

function showHelp(backFn) {
  openModal(`
    <h2>How to play</h2>
    <div style="text-align:left; font-size:13px; line-height:1.65; max-width:560px;">
      🐿️ <b>Prepare:</b> click a tower card, then a grid square. Each copy of a tower type costs more, so upgrades matter!
      Build on <b>mounds (+range)</b> and <b>mushroom patches (+damage)</b>.<br>
      ⚔️ <b>XP:</b> towers earn XP by dealing damage and level up free (max 5). Or pay acorns to level instantly.
      At <b>level 3</b> every tower picks one of two specializations.<br>
      🖱️ <b>Multi-select:</b> drag a box or Shift-click to select several towers and upgrade them all at once.<br>
      🌊 <b>Waves:</b> hit START WAVE when ready. Leaked enemies hurt the Great Oak — 0 HP ends the run.<br>
      🎁 <b>Perks:</b> after each wave pick 1 of ${3 + metaRank('lucky')}. They stack all run.<br>
      🛒 <b>Shop:</b> between forests, spend acorns on run-long boosts. Towers don't travel — gold &amp; perks do.<br>
      ✨ <b>Golden Acorns</b> (prestige, kept forever): +1 per wave, +4 per forest, +30 for a win,
      +1 per 200 leftover acorns, plus achievement bonuses. Spend in The Grove.<br>
      ⌨️ <b>Keys:</b> 1-9,0 towers · Space start/pause · P pause · F speed · Shift multi-select · Esc cancel
    </div>
    <button class="bigbtn" id="mBack">GOT IT</button>
  `);
  document.getElementById('mBack').onclick = backFn;
}

function showGrove(backFn = showMenu) {
  const nodes = META_DEFS.map(d => {
    const r = metaRank(d.id);
    const maxed = r >= d.ranks;
    const cost = maxed ? 0 : d.cost(r);
    const pips = Array.from({ length: d.ranks }, (_, i) =>
      `<span class="${i < r ? 'on' : 'offp'}">●</span>`).join('');
    return `<div class="gnode ${maxed ? 'maxed' : ''}">
      <div class="gico">${d.ico}</div>
      <div class="gname">${d.name}</div>
      <div class="gdesc">${d.desc}</div>
      <div class="gpips">${pips}</div>
      <button class="gbuy" data-id="${d.id}" ${maxed || SAVE.ga < cost ? 'disabled' : ''}>
        ${maxed ? 'MAXED' : `✨ ${cost}`}</button>
    </div>`;
  }).join('');
  openModal(`
    <h2>✨ The Grove — permanent upgrades</h2>
    <div class="sub">These survive forever, across every run · You have <b style="color:var(--gold)">✨ ${SAVE.ga}</b></div>
    <div id="groveGrid">${nodes}</div>
    <button class="bigbtn" id="mBack">BACK</button>
  `);
  modalBox.querySelectorAll('.gbuy').forEach(btn => {
    btn.onclick = () => {
      const d = META_DEFS.find(x => x.id === btn.dataset.id);
      const r = metaRank(d.id);
      const cost = d.cost(r);
      if (r >= d.ranks || SAVE.ga < cost) return;
      SAVE.ga -= cost;
      SAVE.meta[d.id] = r + 1;
      persistSave();
      AudioSys.upgrade();
      if (Object.values(SAVE.meta).reduce((s, v) => s + v, 0) >= 5) checkAch('grove5');
      showGrove(backFn);
    };
  });
  document.getElementById('mBack').onclick = backFn;
}

function showAchievements() {
  const cards = ACHIEVEMENTS.map(a => {
    const got = !!SAVE.ach[a.id];
    return `<div class="achCard ${got ? 'got' : ''}">
      <div class="aico">${a.ico}</div>
      <div><div class="aname">${a.name}</div><div class="adesc">${a.desc}</div>
      <div class="aga">${got ? '✓ earned' : `+${a.ga} ✨`}</div></div>
    </div>`;
  }).join('');
  openModal(`
    <h2>🎖️ Achievements — ${Object.keys(SAVE.ach).length}/${ACHIEVEMENTS.length}</h2>
    <div class="sub">Each unlock instantly grants ✨ Golden Acorns</div>
    <div id="achGrid">${cards}</div>
    <button class="bigbtn" id="mBack">BACK</button>
  `);
  document.getElementById('mBack').onclick = showMenu;
}

/* ---------- perk choice ---------- */
function perkCardHTML(p, i) {
  return `<div class="perk" data-i="${i}" style="--rc:${RAR_COLORS[p.rar]}">
    <div class="prar">${RAR_NAMES[p.rar]}</div>
    <div class="pico">${p.ico}</div>
    <div class="pname">${p.name}</div>
    <div class="pdesc">${p.desc}</div>
  </div>`;
}
function perkChooser(title, sub, after) {
  let choices = rollPerks();
  const render = () => {
    openModal(`
      <h2>${title}</h2>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
      <div id="perkRow">${choices.map(perkCardHTML).join('')}</div>
      ${metaRank('reroll') > 0 ? `<button class="rerollbtn" id="mReroll" ${G.rerollUsed ? 'disabled' : ''}>🎲 Reroll${G.rerollUsed ? ' (used)' : ''}</button>` : ''}
    `);
    modalBox.querySelectorAll('.perk').forEach(el => {
      el.onclick = () => { applyPerk(choices[+el.dataset.i]); after(); };
    });
    const rb = document.getElementById('mReroll');
    if (rb) rb.onclick = () => { if (G.rerollUsed) return; G.rerollUsed = true; choices = rollPerks(); render(); };
  };
  render();
}
function showPerkChoice(waveBonus) {
  perkChooser(`Wave cleared! <span style="color:#dff0bd">+${waveBonus}🌰</span>`,
    'The forest offers a gift — choose one perk', () => { closeModal(); enterPrep(); });
}
function enterPrep() {
  G.state = 'prep';
  document.getElementById('waveBtn').disabled = false;
  updateHUD(); renderPalette(); updateWavePreview();
}

/* ---------- level complete + shop ---------- */
function showLevelComplete(waveBonus, lvlBonus) {
  const next = G.levelDefs[G.level + 1];
  openModal(`
    <h1>🌲 FOREST CLEARED!</h1>
    <div class="sub"><b>${G.levelDefs[G.level].name}</b> is safe. The horde retreats… for now.</div>
    <div class="statline">
      <span>Forest bonus: <b>+${lvlBonus}🌰</b></span>
      <span>Acorns: <b>${fmt(G.gold)}🌰</b></span>
      <span>Perks: <b>${G.perks.length}</b></span>
    </div>
    <div class="sub" style="margin-top:8px;">Next: <b style="color:var(--gold)">${next.name}</b> (${next.waves} waves) —
      towers stay behind; acorns &amp; perks travel with you.</div>
    <button class="bigbtn" id="mNext">🥾 MARCH ON</button>
  `);
  document.getElementById('mNext').onclick = () => {
    perkChooser('Choose a perk', null, () => showShop(() => { closeModal(); enterLevel(G.level + 1); }));
  };
}
function showShop(afterFn) {
  const offers = [];
  const bag = SHOP_ITEMS.slice();
  while (offers.length < 4 && bag.length) offers.push(bag.splice(randi(0, bag.length - 1), 1)[0]);
  const bought = new Set();
  const render = () => {
    const items = offers.map((it, i) => {
      const cost = it.cost(G.level);
      return `<div class="shopItem ${bought.has(i) ? 'bought' : ''}">
        <div class="sico">${it.ico}</div>
        <div class="sname">${it.name}</div>
        <div class="sdesc">${it.desc}</div>
        <button data-i="${i}" ${bought.has(i) || G.gold < cost ? 'disabled' : ''}>🌰 ${cost}</button>
      </div>`;
    }).join('');
    openModal(`
      <h2>🛒 Traveling Nut Market</h2>
      <div class="sub">Spend acorns before marching on — you have <b style="color:var(--gold)">🌰 ${fmt(G.gold)}</b>
      <br><span style="opacity:.7; font-size:11.5px">(unspent acorns convert to ✨ at 200:1 when the run ends)</span></div>
      <div id="shopRow">${items}</div>
      <button class="bigbtn" id="mDone">CONTINUE ➜</button>
    `);
    modalBox.querySelectorAll('.shopItem button').forEach(btn => {
      btn.onclick = () => {
        const i = +btn.dataset.i;
        const it = offers[i];
        const cost = it.cost(G.level);
        if (bought.has(i) || G.gold < cost) return;
        G.gold -= cost;
        bought.add(i);
        AudioSys.coin();
        if (it.id === 'heal') G.oakHp = Math.min(G.oakMax, G.oakHp + 6);
        if (it.id === 'fort') { G.oakMax += 5; G.oakHp = Math.min(G.oakMax, G.oakHp + 5); }
        if (it.id === 'paint') G.mods.dmg *= 1.06;
        if (it.id === 'espresso') G.mods.rate *= 1.06;
        if (it.id === 'tools') G.mods.costMult *= 0.92;
        if (it.id === 'tome') G.mods.xpMult *= 1.30;
        if (it.id === 'charm') G.mods.goldKill *= 1.10;
        updateHUD();
        if (it.id === 'scroll') { perkChooser('📜 Perk Scroll', 'Choose your bonus perk', render); return; }
        render();
      };
    });
    document.getElementById('mDone').onclick = afterFn;
  };
  render();
}

/* ---------- game over ---------- */
function showGameOver(victory) {
  const title = victory ? '🏆 THE FOREST IS SAVED!' : '💀 THE OAK HAS FALLEN';
  const sub = victory
    ? `All ${G.levelDefs.length} forests defended. The squirrels sing your name!`
    : `You held out for <b>${G.wavesCleared}</b> wave${G.wavesCleared === 1 ? '' : 's'}, falling in <b>${G.levelDefs[G.level].name}</b>.`;
  const bd = G.gaBreakdown || { waves: 0, levels: 0, victory: 0, leftover: 0 };
  openModal(`
    <h1>${title}</h1>
    <div class="sub">${sub}</div>
    <div class="statline">
      <span>🌊 Waves: <b>${G.wavesCleared}</b></span>
      <span>☠️ Kills: <b>${G.kills}</b></span>
      <span>🎁 Perks: <b>${G.perks.length}</b></span>
    </div>
    <div class="gaBreakdown">
      ✨ <b>+${G.gaEarned} Golden Acorns</b> banked forever:<br>
      &nbsp;· ${bd.waves} from waves cleared (+1 each)<br>
      &nbsp;· ${bd.levels} from forests cleared (+4 each)<br>
      ${bd.victory ? `&nbsp;· ${bd.victory} victory bonus<br>` : ''}
      &nbsp;· ${bd.leftover} from leftover acorns (200:1)
    </div>
    <div class="sub">Total: ✨${SAVE.ga}</div>
    <button class="bigbtn alt" id="mGrove">✨ THE GROVE<span class="btnnote">spend Golden Acorns on permanent power</span></button>
    <button class="bigbtn" id="mAgain">🔁 NEW RUN<span class="btnnote">jump straight into another attempt</span></button>
    <button class="bigbtn ghost" id="mMenu">MENU</button>
  `);
  document.getElementById('mGrove').onclick = () => showGrove(() => showGameOver(victory));
  document.getElementById('mAgain').onclick = () => { closeModal(); startRun(); };
  document.getElementById('mMenu').onclick = showMenu;
}

/* ---------- fit-to-window scaling (canvas + HUD together) ---------- */
function fitScale() {
  const s = Math.min((window.innerWidth - 16) / 960, (window.innerHeight - 16) / 600);
  document.getElementById('game-wrap').style.transform = `scale(${Math.min(s, 1.6)})`;
}
window.addEventListener('resize', fitScale);
fitScale();

/* ============================================================
   BOOT
   ============================================================ */
G.levelDefs = genLevelDefs();
{
  const map = genMap();
  G.grid = map.grid; G.features = map.features;
  G.path = makePath(map.pts);
  G.bgCanvas = buildBackground(0);
}
updateHUD();
renderPalette();
setSpeedUI();
document.getElementById('waveBtn').disabled = true;
showMenu();
requestAnimationFrame(frame);

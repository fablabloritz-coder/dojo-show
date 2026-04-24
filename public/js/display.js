/* ═══════════════════════════════════════════════════════
   DOJO SHOW 2.0 — Display Logic (Spectator View)
   ═══════════════════════════════════════════════════════ */

let state = {
  matches: [],
  history: [],
  settings: { displayMode: 'matches', layout: { rows: 2, cols: 2 }, sncfBlueMode: false, avatarSize: 32, fontProfiles: {} },
  bracket: { rounds: [], name: '' },
  players: [],
  gameSettings: {},
  serverTime: Date.now(),
};
let lastSyncTime = Date.now();
let previousWaitingIds = [];
let autoRotationTimer = null;
let localDisplayMode = null;
let rotationStartTime = 0;
let rotationProgressTimer = null;
let viewportScale = 1;
const DISPLAY_MODES = ['matches', 'waiting', 'bracket'];

let DEFAULT_AVATAR = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#7b2ff7"/><text x="40" y="52" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">?</text></svg>');

function updateDefaultAvatar(hex) {
  DEFAULT_AVATAR = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="${hex}"/><text x="40" y="52" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">?</text></svg>`);
}

function getPlayerAvatar(playerName) {
  const p = state.players && state.players.find(p => p.name === playerName);
  return (p && p.avatar) || DEFAULT_AVATAR;
}

function avatarImg(name, size) {
  if (!size) return '';
  return `<img class="player-avatar" src="${getPlayerAvatar(name)}" style="width:${size}px;height:${size}px" alt="">`;
}

// ─── SOCKET ─────────────────────────────────────────────
const socket = io();

socket.on('state:full', (newState) => {
  const oldMode = state.settings.displayMode;
  const oldWaiting = state.matches.filter(m => m.status === 'waiting').map(m => m.id);
  state = newState;
  lastSyncTime = Date.now();
  applyAccentColor(state.settings.accentColor || '#7b2ff7');
  document.body.style.fontFamily = `'${state.settings.fontFamily || 'Inter'}', sans-serif`;
  setupAutoRotation();

  // Detect new waiting matches for flip animation
  const newWaiting = state.matches.filter(m => m.status === 'waiting').map(m => m.id);
  const addedWaiting = newWaiting.filter(id => !oldWaiting.includes(id));

  render(addedWaiting);
  previousWaitingIds = newWaiting;
});

// ─── RENDER ─────────────────────────────────────────────
function render(newWaitingIds = []) {
  const mode = localDisplayMode || state.settings.displayMode;

  // Toggle views
  document.getElementById('viewMatches').classList.toggle('active', mode === 'matches');
  document.getElementById('viewWaiting').classList.toggle('active', mode === 'waiting');
  document.getElementById('viewBracket').classList.toggle('active', mode === 'bracket');

  // SNCF blue mode
  document.getElementById('viewWaiting').classList.toggle('blue-mode', state.settings.sncfBlueMode);

  if (mode === 'matches') renderMatches();
  if (mode === 'waiting') renderWaiting(newWaitingIds);
  if (mode === 'bracket') renderBracket();

  updateSNCFClock();
}

// ─── MATCHES VIEW ───────────────────────────────────────
function getScaleFactor(rows, cols) {
  const cells = rows * cols;
  if (cells <= 1) return 1.4;
  if (cells <= 2) return 1.1;
  if (cells <= 4) return 1.0;
  if (cells <= 6) return 0.78;
  return 0.6;
}

function getDensityClass(rows, cols) {
  const cells = rows * cols;
  if (cells > 6) return 'density-high';
  if (cells > 2) return 'density-medium';
  return '';
}

function renderMatches() {
  const grid = document.getElementById('matchGrid');
  const highlightId = state.settings.highlightMatchId;
  const activeMatches = state.matches.filter(m => m.status === 'active' || m.status === 'cancelled');
  const viewportFactor = viewportScale;

  // Spotlight mode: single match in 1×1
  if (highlightId) {
    const hm = activeMatches.find(m => m.id === highlightId);
    if (hm) {
      const fp = state.settings.fontProfiles['1x1'] || {};
      const scale = getScaleFactor(1, 1);
      grid.style.gridTemplateRows = '1fr';
      grid.style.gridTemplateColumns = '1fr';
      grid.classList.remove('density-high', 'density-medium');

      const titleSize = Math.max(10, Math.round((fp.matchTitle || 20) * scale * viewportFactor));
      const nameSize = Math.max(12, Math.round((fp.playerName || 22) * scale * viewportFactor));
      const scoreSize = Math.max(16, Math.round((fp.score || 42) * scale * viewportFactor));
      const timerSize = Math.max(9, Math.round((fp.timer || 16) * scale * viewportFactor));
      const avSize = Math.max(0, Math.round((state.settings.avatarSize || 0) * scale * viewportFactor));

      grid.innerHTML = renderSingleMatchCard(hm, titleSize, nameSize, scoreSize, timerSize, avSize, false);
      return;
    }
  }

  const { rows, cols } = state.settings.layout;
  const key = `${rows}x${cols}`;
  const fp = state.settings.fontProfiles[key] || {};
  const scale = getScaleFactor(rows, cols);

  grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  // Apply density class
  grid.classList.remove('density-high', 'density-medium');
  const densityClass = getDensityClass(rows, cols);
  if (densityClass) grid.classList.add(densityClass);

  if (activeMatches.length === 0) {
    grid.innerHTML = '<div class="display-empty">EN ATTENTE DE MATCHS</div>';
    return;
  }

  // Show up to rows*cols matches
  const maxShow = rows * cols;
  const shown = activeMatches.slice(0, maxShow);

  // Compute scaled font sizes (fontProfile values as base, scale by density, with floor)
  const titleSize = Math.max(10, Math.round((fp.matchTitle || 20) * scale * viewportFactor));
  const nameSize = Math.max(12, Math.round((fp.playerName || 22) * scale * viewportFactor));
  const scoreSize = Math.max(16, Math.round((fp.score || 42) * scale * viewportFactor));
  const timerSize = Math.max(9, Math.round((fp.timer || 16) * scale * viewportFactor));
  const avSize = Math.max(0, Math.round((state.settings.avatarSize || 0) * scale * viewportFactor));

  grid.innerHTML = shown.map((m, i) => renderSingleMatchCard(m, titleSize, nameSize, scoreSize, timerSize, avSize, i % 2 === 1)).join('');
}

function renderSingleMatchCard(m, titleSize, nameSize, scoreSize, timerSize, avSize, isAlt) {
    const elapsed = getElapsed(m);
    const phase = m.phase || 'playing';
  const hasTopBadges = !!(m.station || m.streaming || m.bracketMatch);

    // Timer: countdown during calling, countup during playing
    let timeStr, timerClass;
    if (phase === 'calling') {
      const remaining = Math.max(0, (m.timerDuration || 120) * 1000 - elapsed);
      timeStr = formatTime(remaining);
      const pct = remaining / ((m.timerDuration || 120) * 1000);
      timerClass = 'dmc-timer countdown' + (pct < 0.25 ? ' timer-critical' : pct < 0.5 ? ' timer-warning' : '');
    } else if (phase === 'playing') {
      timeStr = formatTime(elapsed);
      timerClass = 'dmc-timer' + (m.timerRunning ? ' running' : '');
    } else {
      timeStr = '';
      timerClass = 'dmc-timer';
    }

    // Winner highlight
    const w1 = phase === 'decided' && m.winner === 1 ? ' dmc-winner' : '';
    const w2 = phase === 'decided' && m.winner === 2 ? ' dmc-winner' : '';
    const cardExtra = m.status === 'cancelled' ? ' card-cancelled'
                    : (m.forfeit && phase === 'decided') ? ' card-forfeit card-decided'
                    : phase === 'decided' ? ' card-decided' : '';

    // Forfeit: loser class
    const f1 = m.forfeit && phase === 'decided' && m.winner === 2 ? ' dmc-forfeit-loser' : '';
    const f2 = m.forfeit && phase === 'decided' && m.winner === 1 ? ' dmc-forfeit-loser' : '';

    // Overlay for forfeit / cancelled
    const overlay = m.status === 'cancelled' ? '<div class="dmc-overlay dmc-overlay-cancel"><span>ANNULÉ</span></div>'
                  : (m.forfeit && phase === 'decided') ? '<div class="dmc-overlay dmc-overlay-forfeit"><span>FORFAIT</span></div>'
                  : '';

    return `
    <div class="display-match-card ${isAlt ? 'alt' : ''}${cardExtra}${hasTopBadges ? ' has-top-badges' : ''}" data-id="${m.id}">
      ${overlay}
      ${(() => { const gi = getGameImage(m.game); return gi ? `<div class="dmc-game-bg" style="background-image:url('${gi.image}');opacity:${gi.imageOpacity || 0.3}"></div>` : ''; })()}
      ${m.station ? `<div class="dmc-station">${esc(m.station)}</div>` : ''}
      ${m.streaming ? '<div class="dmc-twitch"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M11.64 5.93H13.07V10.21H11.64M15.57 5.93H17V10.21H15.57M7 2L3.43 5.57V18.43H7.71V22L11.29 18.43H14.14L20.57 12V2M19.14 11.29L16.29 14.14H13.43L10.93 16.64V14.14H7.71V3.43H19.14Z"/></svg> LIVE</div>' : ''}
      ${m.bracketMatch ? '<div class="dmc-tournament">⚡ TOURNOI</div>' : ''}
      <div class="dmc-game" style="font-size:${titleSize}px${getGameColorStyle(m.game)}">${esc(m.game)}</div>
      ${m.round ? `<div class="dmc-round" style="font-size:${Math.round(titleSize * 0.6)}px">${esc(m.round)}</div>` : ''}
      <div class="dmc-players">
        <div class="dmc-player">
          ${avatarImg(m.player1.name, avSize)}
          <div class="dmc-player-name${w1}${f1}" style="font-size:${nameSize}px">${esc(m.player1.name)}</div>
          ${phase === 'calling' ? `<div class="dmc-presence ${m.player1.present ? 'present' : ''}"></div>` : ''}
          ${w1 ? '<div class="dmc-winner-badge">🏆</div>' : ''}
        </div>
        <div class="dmc-vs" style="font-size:${Math.round(nameSize * 0.7)}px">VS</div>
        <div class="dmc-player">
          ${avatarImg(m.player2.name, avSize)}
          <div class="dmc-player-name${w2}${f2}" style="font-size:${nameSize}px">${esc(m.player2.name)}</div>
          ${phase === 'calling' ? `<div class="dmc-presence ${m.player2.present ? 'present' : ''}"></div>` : ''}
          ${w2 ? '<div class="dmc-winner-badge">🏆</div>' : ''}
        </div>
      </div>
      <div class="dmc-scores">
        <span class="dmc-score" style="font-size:${scoreSize}px">${m.score1}</span>
        <span class="dmc-score-sep" style="font-size:${Math.round(scoreSize * 0.6)}px">:</span>
        <span class="dmc-score" style="font-size:${scoreSize}px">${m.score2}</span>
      </div>
      ${timeStr ? `<div class="${timerClass}" style="font-size:${timerSize}px" id="dtimer-${m.id}">${timeStr}</div>` : ''}
    </div>`;
}

// ─── WAITING / SNCF VIEW ────────────────────────────────
function renderWaiting(newIds = []) {
  const body = document.getElementById('sncfBody');
  const waiting = state.matches.filter(m => m.status === 'waiting');
  const key = `${state.settings.layout.rows}x${state.settings.layout.cols}`;
  const fp = state.settings.fontProfiles[key] || {};
  const rowSize = Math.max(10, Math.round((fp.sncfRow || 16) * viewportScale));
  const gameSize = Math.max(9, Math.round((fp.sncfGame || 13) * viewportScale));
  const statusSize = Math.max(9, Math.round((fp.sncfStatus || 12) * viewportScale));
  const headerSize = Math.max(11, Math.round((fp.sncfHeader || 18) * viewportScale));
  const avSize = Math.max(0, Math.round((state.settings.avatarSize || 0) * 0.7 * viewportScale));

  // Apply header font size
  const ths = document.querySelectorAll('.sncf-table thead th');
  ths.forEach(th => th.style.fontSize = headerSize + 'px');

  if (waiting.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:60px;font-size:24px;color:#444;letter-spacing:4px">AUCUN MATCH EN ATTENTE</td></tr>`;
    return;
  }

  body.innerHTML = waiting.map((m, i) => {
    const isNew = newIds.includes(m.id);
    const gi = getGameImage(m.game);
    // For table rows: use background-image on TR with a dark overlay to simulate opacity
    const overlayAlpha = gi ? (1 - (gi.imageOpacity || 0.3)).toFixed(2) : 1;
    const trStyle = gi
      ? `background-image:linear-gradient(rgba(10,10,20,${overlayAlpha}),rgba(10,10,20,${overlayAlpha})),url('${gi.image}');background-size:cover;background-position:center;`
      : '';
    return `
    <tr class="${isNew ? 'sncf-flip' : ''}" ${trStyle ? `style="${trStyle}"` : ''}>
      <td class="sncf-num" style="font-size:${rowSize}px">${i + 1}</td>
      <td class="sncf-game-cell" style="font-size:${gameSize}px${getGameColorStyle(m.game)}">${esc(m.game)}</td>
      <td class="sncf-player1" style="font-size:${rowSize}px">${avatarImg(m.player1.name, avSize)} ${esc(m.player1.name)}</td>
      <td class="sncf-vs-cell" style="font-size:${rowSize}px">VS</td>
      <td class="sncf-player2" style="font-size:${rowSize}px">${avatarImg(m.player2.name, avSize)} ${esc(m.player2.name)}</td>
      <td class="sncf-station-cell" style="font-size:${rowSize}px">${esc(m.station || '—')}</td>
      <td class="sncf-status-cell" style="font-size:${statusSize}px">${m.streaming ? '<span class="sncf-twitch-badge"><svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M11.64 5.93H13.07V10.21H11.64M15.57 5.93H17V10.21H15.57M7 2L3.43 5.57V18.43H7.71V22L11.29 18.43H14.14L20.57 12V2M19.14 11.29L16.29 14.14H13.43L10.93 16.64V14.14H7.71V3.43H19.14Z"/></svg> LIVE</span>' : '<span class="sncf-status-badge" style="font-size:${statusSize}px">EN ATTENTE</span>'}</td>
    </tr>`;
  }).join('');
}

// ─── BRACKET VIEW ───────────────────────────────────────
function renderBracket() {
  const container = document.getElementById('bracketContainer');
  const titleEl = document.getElementById('bracketTitle');
  const key = `${state.settings.layout.rows}x${state.settings.layout.cols}`;
  const fp = state.settings.fontProfiles[key] || {};
  const titleSize = Math.max(14, Math.round((fp.bracketTitle || 24) * viewportScale));
  const nameSize = Math.max(10, Math.round((fp.bracketName || 14) * viewportScale));
  const scoreSize = Math.max(10, Math.round((fp.bracketScore || 14) * viewportScale));
  const roundSize = Math.max(10, Math.round((fp.bracketRound || 13) * viewportScale));
  const avSize = Math.max(0, Math.round((state.settings.avatarSize || 0) * 0.5 * viewportScale));

  if (!state.bracket || !state.bracket.rounds || state.bracket.rounds.length === 0) {
    container.innerHTML = '<div class="display-empty">AUCUN BRACKET CONFIGURÉ</div>';
    return;
  }

  titleEl.textContent = state.bracket.name || 'BRACKET';
  titleEl.style.fontSize = titleSize + 'px';

  // Add auto tournament indicator
  const autoIndicator = state.bracket?.autoTournament ? '<span class="auto-tournament-badge">AUTO</span>' : '';
  titleEl.innerHTML = (state.bracket.name || 'BRACKET') + autoIndicator;

  const roundNames = getRoundNames(state.bracket.rounds.length);

  container.innerHTML = state.bracket.rounds.map((round, ri) => {
    return `
    <div class="bracket-round">
      <div class="bracket-round-label" style="font-size:${roundSize}px">${roundNames[ri]}</div>
      ${round.map(m => {
        const w = m.winner;
        const isBye1 = m.player1 === 'BYE' || !m.player1;
        const isBye2 = m.player2 === 'BYE' || !m.player2;
        const isTBD = m.player1 === '?' || m.player2 === '?';
        const hideScores = isBye1 || isBye2 || isTBD;
        return `
        <div class="bracket-match-card">
          <div class="bmc-player">
            ${!isBye1 && m.player1 !== '?' ? avatarImg(m.player1, avSize) : ''}
            <span class="bmc-name ${w === 1 ? 'winner' : ''} ${isBye1 ? 'bye' : ''}" style="font-size:${nameSize}px">${esc(m.player1 || '?')}</span>
            <span class="bmc-score${hideScores ? ' hidden' : ''}" style="font-size:${scoreSize}px">${m.score1 || 0}</span>
          </div>
          <div class="bmc-player">
            ${!isBye2 && m.player2 !== '?' ? avatarImg(m.player2, avSize) : ''}
            <span class="bmc-name ${w === 2 ? 'winner' : ''} ${isBye2 ? 'bye' : ''}" style="font-size:${nameSize}px">${esc(m.player2 || '?')}</span>
            <span class="bmc-score${hideScores ? ' hidden' : ''}" style="font-size:${scoreSize}px">${m.score2 || 0}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function getRoundNames(count) {
  if (count <= 1) return ['FINALE'];
  if (count === 2) return ['DEMI-FINALES', 'FINALE'];
  if (count === 3) return ['QUARTS DE FINALE', 'DEMI-FINALES', 'FINALE'];
  const names = [];
  for (let i = 0; i < count; i++) {
    if (i === count - 1) names.push('FINALE');
    else if (i === count - 2) names.push('DEMI-FINALES');
    else if (i === count - 3) names.push('QUARTS DE FINALE');
    else names.push(`TOUR ${i + 1}`);
  }
  return names;
}

// ─── SNCF CLOCK ─────────────────────────────────────────
function updateSNCFClock() {
  const el = document.getElementById('sncfClock');
  if (!el) return;
  const now = new Date();
  el.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// ─── TIMER LOOP ─────────────────────────────────────────
setInterval(() => {
  // Update running match timers
  state.matches.filter(m => m.status === 'active').forEach(m => {
    const el = document.getElementById(`dtimer-${m.id}`);
    if (!el) return;
    const elapsed = getElapsed(m);
    const phase = m.phase || 'playing';
    if (phase === 'calling') {
      const remaining = Math.max(0, (m.timerDuration || 120) * 1000 - elapsed);
      el.textContent = formatTime(remaining);
      const pct = remaining / ((m.timerDuration || 120) * 1000);
      el.classList.toggle('timer-critical', pct < 0.25);
      el.classList.toggle('timer-warning', pct >= 0.25 && pct < 0.5);
    } else if (phase === 'playing' && m.timerRunning) {
      el.textContent = formatTime(elapsed);
    }
  });
  // Update SNCF clock
  updateSNCFClock();
}, 200);

// ─── HELPERS ────────────────────────────────────────────
function getElapsed(m) {
  const base = m.timerElapsed || 0;
  if (!m.timerRunning) return base;
  return base + (Date.now() - lastSyncTime);
}

function formatTime(ms) {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── GAME HELPERS ────────────────────────────────────────
function getGameColorStyle(gameName) {
  const gs = state.gameSettings && state.gameSettings[gameName];
  return gs && gs.color ? `;color:${gs.color}` : '';
}

function getGameImage(gameName) {
  const gs = state.gameSettings && state.gameSettings[gameName];
  return (gs && gs.image) ? gs : null;
}

// ─── AUTO ROTATION ───────────────────────────────────────
function getRotationDuration(mode) {
  const ar = state.settings.autoRotation;
  if (!ar || typeof ar !== 'object') return 0;
  return ar[mode] || 0;
}

function getNextMode(current) {
  const idx = DISPLAY_MODES.indexOf(current);
  // Find next mode that has a duration > 0
  for (let i = 1; i <= DISPLAY_MODES.length; i++) {
    const candidate = DISPLAY_MODES[(idx + i) % DISPLAY_MODES.length];
    if (getRotationDuration(candidate) > 0) return candidate;
  }
  return null;
}

function isRotationActive() {
  const ar = state.settings.autoRotation;
  if (!ar || typeof ar !== 'object') return false;
  if (!state.settings.rotationEnabled) return false;
  const activeModes = DISPLAY_MODES.filter(m => (ar[m] || 0) > 0);
  return activeModes.length >= 2; // Need at least 2 modes with duration to rotate
}

function setupAutoRotation() {
  if (autoRotationTimer) { clearTimeout(autoRotationTimer); autoRotationTimer = null; }
  if (rotationProgressTimer) { clearInterval(rotationProgressTimer); rotationProgressTimer = null; }

  if (!isRotationActive()) {
    localDisplayMode = null;
    updateModeIndicator();
    return;
  }

  // If no local mode yet, pick the first mode with a duration
  if (!localDisplayMode) {
    localDisplayMode = DISPLAY_MODES.find(m => getRotationDuration(m) > 0) || state.settings.displayMode;
  }

  scheduleNextRotation();
}

function scheduleNextRotation() {
  if (autoRotationTimer) clearTimeout(autoRotationTimer);
  if (rotationProgressTimer) clearInterval(rotationProgressTimer);

  const current = localDisplayMode || state.settings.displayMode;
  const duration = getRotationDuration(current) * 1000;
  if (duration <= 0) { setupAutoRotation(); return; }

  rotationStartTime = Date.now();
  updateModeIndicator();

  // Progress bar update every 50ms
  rotationProgressTimer = setInterval(() => updateModeIndicator(), 50);

  autoRotationTimer = setTimeout(() => {
    const next = getNextMode(current);
    if (next) {
      localDisplayMode = next;
      render();
      scheduleNextRotation();
    }
  }, duration);
}

// ─── MODE INDICATOR ──────────────────────────────────────
const MODE_LABELS = { matches: 'MATCHS', waiting: 'ATTENTE', bracket: 'BRACKET' };

function updateModeIndicator() {
  let bar = document.getElementById('modeIndicator');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'modeIndicator';
    bar.className = 'mode-indicator';
    document.getElementById('displayRoot').appendChild(bar);
  }

  if (!isRotationActive()) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const current = localDisplayMode || state.settings.displayMode;
  const duration = getRotationDuration(current) * 1000;
  const elapsed = Date.now() - rotationStartTime;
  const pct = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  bar.innerHTML = DISPLAY_MODES.map(m => {
    const dur = getRotationDuration(m);
    if (dur <= 0) return '';
    const isActive = m === current;
    return `<div class="mode-indicator-item ${isActive ? 'active' : ''}">
      <span class="mode-indicator-label">${MODE_LABELS[m]}</span>
      ${isActive ? `<div class="mode-indicator-progress"><div class="mode-indicator-fill" style="width:${(pct * 100).toFixed(1)}%"></div></div>` : ''}
    </div>`;
  }).join('');
}

function updateViewportScale() {
  const widthScale = window.innerWidth / 1920;
  const heightScale = window.innerHeight / 1080;
  viewportScale = Math.max(0.5, Math.min(1, widthScale, heightScale));
  document.documentElement.style.setProperty('--display-scale', String(viewportScale));
}

window.addEventListener('resize', () => {
  updateViewportScale();
  render();
  updateModeIndicator();
});

updateViewportScale();

/* ═══════════════════════════════════════════════════════
   DOJO SHOW 2.0 — Admin Logic
   ═══════════════════════════════════════════════════════ */

// ─── STATE ──────────────────────────────────────────────
let state = {
  matches: [],
  history: [],
  settings: { displayMode: 'matches', layout: { rows: 2, cols: 2 }, sncfBlueMode: false, fontProfiles: {} },
  bracket: { rounds: [], name: '' },
  games: [],
  players: [],
  gameSettings: {},
  serverTime: Date.now(),
};
let lastSyncTime = Date.now();
let timerInterval = null;
let collapsedGames = {};

// ─── SOCKET ─────────────────────────────────────────────
const socket = io();

socket.on('state:full', (newState) => {
  state = newState;
  lastSyncTime = Date.now();
  applyAccentColor(state.settings.accentColor || '#7b2ff7');
  document.body.style.fontFamily = `'${state.settings.fontFamily || 'Inter'}', sans-serif`;
  render();
});

socket.on('connect', () => {
  document.title = 'DOJO SHOW 2.0 — Admin ✓';
});

socket.on('disconnect', () => {
  document.title = 'DOJO SHOW 2.0 — Admin ✗ Déconnecté';
});

// ─── RENDER ─────────────────────────────────────────────
function getPlayerAvatar(playerName) {
  const p = state.players && state.players.find(pl => pl.name === playerName);
  return (p && p.avatar) || '';
}

function adminAvatarImg(name) {
  const src = getPlayerAvatar(name);
  if (!src) return '';
  return `<img class="admin-avatar" src="${escapeAttr(src)}" alt="" onerror="this.style.display='none'">`;
}

function getGameColor(gameName) {
  const gs = state.gameSettings && state.gameSettings[gameName];
  return (gs && gs.color) || '';
}

function gameColorStyle(gameName) {
  const c = getGameColor(gameName);
  return c ? ` style="color:${c}"` : '';
}

function render() {
  renderMatches();
  renderQueue();
  renderHistory();
  renderFontSettings();
  updateLayoutSelect();
  updateModeButtons();
  updateGamesDatalist();
  updatePlayersDatalist();
  scalePreview();
  refreshBackupList();
  updateTournamentUI();
}

// ─── MATCH RENDERING ────────────────────────────────────
function renderMatches() {
  const grid = document.getElementById('matchesGrid');
  const activeMatches = state.matches.filter(m => m.status === 'active');
  document.getElementById('activeCount').textContent = activeMatches.length;

  if (activeMatches.length === 0) {
    grid.innerHTML = '<div class="empty-state">Aucun match actif. Créez un match ou activez-en un depuis la file d\'attente.</div>';
    return;
  }

  // Group by game
  const groups = {};
  activeMatches.forEach(m => {
    if (!groups[m.game]) groups[m.game] = [];
    groups[m.game].push(m);
  });

  let html = '';
  for (const [game, matches] of Object.entries(groups)) {
    const isCollapsed = collapsedGames[game];
    html += `<div class="game-group">
      <div class="game-group-header ${isCollapsed ? 'collapsed' : ''}" onclick="toggleGameGroup('${escapeAttr(game)}')">
        <span class="arrow">▼</span>
        <span class="game-name"${gameColorStyle(game)}>${esc(game)}</span>
        <span class="game-count">${matches.length} match${matches.length > 1 ? 's' : ''}</span>
      </div>
      <div class="game-group-content ${isCollapsed ? 'collapsed' : ''}">`;
    for (const match of matches) {
      html += renderMatchCard(match);
    }
    html += '</div></div>';
  }
  grid.innerHTML = html;
}

function renderMatchCard(m) {
  const phase = m.phase || 'playing';
  const elapsed = getElapsed(m);

  // Phase badge
  const phaseBadge = phase === 'calling' ? '<span class="phase-badge calling">📢 APPEL</span>'
    : phase === 'playing' ? '<span class="phase-badge playing">🎮 EN JEU</span>'
    : '<span class="phase-badge decided">🏆 DÉCIDÉ</span>';

  // Players section
  let playersHtml = '';
  if (phase === 'calling') {
    playersHtml = `
      <div class="match-players">
        <div class="player-side">
          <div class="player-name">${adminAvatarImg(m.player1.name)}${esc(m.player1.name)}</div>
          <button class="btn-presence ${m.player1.present ? 'present' : ''}" onclick="togglePresence('${m.id}', 1)">
            ${m.player1.present ? '✓ Présent' : '○ Absent'}
          </button>
        </div>
        <span class="match-vs">VS</span>
        <div class="player-side">
          <div class="player-name">${adminAvatarImg(m.player2.name)}${esc(m.player2.name)}</div>
          <button class="btn-presence ${m.player2.present ? 'present' : ''}" onclick="togglePresence('${m.id}', 2)">
            ${m.player2.present ? '✓ Présent' : '○ Absent'}
          </button>
        </div>
      </div>`;
  } else {
    const w1 = phase === 'decided' && m.winner === 1 ? ' winner-name' : '';
    const w2 = phase === 'decided' && m.winner === 2 ? ' winner-name' : '';
    playersHtml = `
      <div class="match-players">
        <div class="player-side">
          <div class="player-name${w1}">${adminAvatarImg(m.player1.name)}${esc(m.player1.name)}</div>
        </div>
        <span class="match-vs">VS</span>
        <div class="player-side">
          <div class="player-name${w2}">${adminAvatarImg(m.player2.name)}${esc(m.player2.name)}</div>
        </div>
      </div>`;
  }

  // Timer section
  let timerHtml = '';
  if (phase === 'calling') {
    const remaining = Math.max(0, (m.timerDuration || 120) * 1000 - elapsed);
    const timeStr = formatTime(remaining);
    const pct = remaining / ((m.timerDuration || 120) * 1000);
    const timerClass = pct < 0.25 ? 'timer-critical' : pct < 0.5 ? 'timer-warning' : '';
    timerHtml = `<div class="match-timer countdown ${timerClass}" id="timer-${m.id}">${timeStr}</div>`;
  } else if (phase === 'playing') {
    const timeStr = formatTime(elapsed);
    timerHtml = `<div class="match-timer ${m.timerRunning ? 'running' : ''}" id="timer-${m.id}">${timeStr}</div>`;
  }

  // Scores section
  let scoresHtml = '';
  if (phase === 'playing') {
    scoresHtml = `
      <div class="match-scores">
        <button class="score-btn" onclick="changeScore('${m.id}', 1, -1)">−</button>
        <button class="score-btn" onclick="changeScore('${m.id}', 1, 1)">＋</button>
        <span class="score-value">${m.score1}</span>
        <span class="score-sep">:</span>
        <span class="score-value">${m.score2}</span>
        <button class="score-btn" onclick="changeScore('${m.id}', 2, -1)">−</button>
        <button class="score-btn" onclick="changeScore('${m.id}', 2, 1)">＋</button>
      </div>`;
  } else if (phase === 'decided') {
    scoresHtml = `
      <div class="match-scores decided">
        <span class="score-value">${m.score1}</span>
        <span class="score-sep">:</span>
        <span class="score-value">${m.score2}</span>
      </div>`;
  }

  // Actions by phase
  let actionsHtml = '';
  if (phase === 'calling') {
    const bothPresent = m.player1.present && m.player2.present;
    const onePresent = (m.player1.present || m.player2.present) && !bothPresent;
    const nonePresent = !m.player1.present && !m.player2.present;
    actionsHtml = `
      <div class="match-actions calling-actions">
        <button class="btn btn-launch ${bothPresent ? '' : 'disabled'}" onclick="launchMatch('${m.id}')" ${bothPresent ? '' : 'disabled'}>🚀 Lancer le match</button>
        ${onePresent ? `<button class="btn btn-forfeit" onclick="forfeitMatch('${m.id}')">⚠ Forfait</button>` : ''}
        ${nonePresent ? `<button class="btn btn-cancel-match" onclick="cancelMatch('${m.id}')">✕ Annuler</button>` : ''}
        <button class="btn btn-back-queue" onclick="moveToQueue('${m.id}')">⏪</button>
      </div>`;
  } else if (phase === 'playing') {
    actionsHtml = `
      <div class="match-actions playing-actions">
        ${!m.timerRunning
          ? `<button class="btn btn-timer" onclick="startTimer('${m.id}')">▶</button>`
          : `<button class="btn btn-timer-stop" onclick="stopTimer('${m.id}')">⏸</button>`
        }
        <button class="btn btn-timer-reset" onclick="resetTimer('${m.id}')">↺</button>
        <button class="btn btn-win1" onclick="declareWinner('${m.id}', 1)">🏆 ${esc(m.player1.name)}</button>
        <button class="btn btn-win2" onclick="declareWinner('${m.id}', 2)">🏆 ${esc(m.player2.name)}</button>
        <button class="btn btn-back-queue" onclick="moveToQueue('${m.id}')">⏪</button>
      </div>`;
  } else if (phase === 'decided') {
    const winnerName = m.winner === 1 ? m.player1.name : m.player2.name;
    actionsHtml = `
      <div class="match-actions decided-actions">
        <div class="winner-badge">🏆 ${esc(winnerName)} remporte le match !</div>
        <div class="decided-btns">
          <button class="btn btn-validate" onclick="validateMatch('${m.id}')">✓ Valider</button>
          <button class="btn btn-undeclare" onclick="undeclareWinner('${m.id}')">↩ Annuler</button>
        </div>
      </div>`;
  }

  return `
    <div class="match-card phase-${phase}" data-id="${m.id}">
      <div class="match-card-header">
        <span class="match-game"${gameColorStyle(m.game)}>${esc(m.game)}</span>
        ${phaseBadge}
        ${m.streaming ? '<span class="twitch-badge" title="Stream Twitch"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M11.64 5.93H13.07V10.21H11.64M15.57 5.93H17V10.21H15.57M7 2L3.43 5.57V18.43H7.71V22L11.29 18.43H14.14L20.57 12V2M19.14 11.29L16.29 14.14H13.43L10.93 16.64V14.14H7.71V3.43H19.14Z"/></svg> LIVE</span>' : ''}
        ${m.station ? `<span class="match-station">${esc(m.station)}</span>` : ''}
        <button class="btn btn-spotlight ${state.settings.highlightMatchId === m.id ? 'active' : ''}" onclick="toggleHighlight('${m.id}')" title="${state.settings.highlightMatchId === m.id ? 'Annuler mise en avant' : 'Mettre en avant 1×1'}">🔦</button>
      </div>
      ${m.round ? `<div class="match-round">${esc(m.round)}</div>` : ''}
      ${playersHtml}
      ${timerHtml}
      ${scoresHtml}
      ${actionsHtml}
    </div>`;
}

// ─── QUEUE RENDERING ────────────────────────────────────
function renderQueue() {
  const list = document.getElementById('queueList');
  const waiting = state.matches.filter(m => m.status === 'waiting');
  document.getElementById('queueCount').textContent = waiting.length;

  if (waiting.length === 0) {
    list.innerHTML = '<div class="empty-state-sm">Aucun match en attente</div>';
    return;
  }

  list.innerHTML = waiting.map(m => `
    <div class="queue-item" data-id="${m.id}">
      <div class="queue-info">
        <div class="queue-game"${gameColorStyle(m.game)}>${esc(m.game)}${m.streaming ? ' <span class="twitch-badge-sm" title="Stream Twitch"><svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M11.64 5.93H13.07V10.21H11.64M15.57 5.93H17V10.21H15.57M7 2L3.43 5.57V18.43H7.71V22L11.29 18.43H14.14L20.57 12V2M19.14 11.29L16.29 14.14H13.43L10.93 16.64V14.14H7.71V3.43H19.14Z"/></svg></span>' : ''}</div>
        <div class="queue-players">${adminAvatarImg(m.player1.name)} ${esc(m.player1.name)} vs ${adminAvatarImg(m.player2.name)} ${esc(m.player2.name)}</div>
      </div>
      <div class="queue-actions">
        <button class="btn btn-xs ${m.streaming ? 'btn-twitch-active' : 'btn-twitch'}" onclick="toggleStream('${m.id}')" title="Toggle Stream">📺</button>
        <button class="btn btn-xs btn-primary" onclick="activateMatch('${m.id}')">▶ Activer</button>
        <button class="btn btn-xs btn-danger" onclick="deleteMatch('${m.id}')">✕</button>
      </div>
    </div>
  `).join('');
}

// ─── HISTORY RENDERING ──────────────────────────────────
function renderHistory() {
  const list = document.getElementById('historyList');
  if (state.history.length === 0) {
    list.innerHTML = '<div class="empty-state-sm">Aucun match terminé</div>';
    return;
  }

  list.innerHTML = state.history.map(h => {
    const w = h.winner;
    const p1Class = w === 1 ? 'winner' : 'loser';
    const p2Class = w === 2 ? 'winner' : 'loser';
    const time = h.finishedAt ? new Date(h.finishedAt) : null;
    const timeStr = time ? `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}` : '--:--';
    return `
      <div class="history-item">
        <div class="history-main">
          <span class="history-time">${timeStr}</span>
          <span class="${p1Class}">${esc(h.player1)}</span>
          <span class="history-vs">Vs</span>
          <span class="${p2Class}">${esc(h.player2)}</span>
          <span class="score">${h.score1} - ${h.score2}</span>
        </div>
        <div class="history-meta">
          <span class="game-tag"${gameColorStyle(h.game)}>${esc(h.game)}${h.round ? ' — ' + esc(h.round) : ''}</span>
          <button class="btn btn-xs btn-restore" onclick="restoreMatch('${h.id}')" title="Restaurer ce match">↩</button>
        </div>
      </div>`;
  }).join('');
}

// ─── FONT SETTINGS ──────────────────────────────────────
function renderFontSettings() {
  const key = `${state.settings.layout.rows}x${state.settings.layout.cols}`;
  const profile = state.settings.fontProfiles[key];
  document.getElementById('profileBadge').textContent = key.replace('x', '×');

  // Avatar size (global)
  const avatarSlider = document.getElementById('sliderAvatarSize');
  const avatarVal = document.getElementById('valAvatarSize');
  if (avatarSlider && avatarVal) {
    avatarSlider.value = state.settings.avatarSize || 0;
    avatarVal.textContent = state.settings.avatarSize || 0;
  }

  if (!profile) return;
  const allProps = [
    'matchTitle', 'playerName', 'score', 'timer', 'header', 'queue',
    'sncfHeader', 'sncfRow', 'sncfGame', 'sncfStatus',
    'bracketTitle', 'bracketName', 'bracketScore', 'bracketRound',
  ];

  allProps.forEach(prop => {
    const capProp = prop.charAt(0).toUpperCase() + prop.slice(1);
    const slider = document.getElementById('slider' + capProp);
    const val = document.getElementById('val' + capProp);
    if (slider && val && profile[prop] !== undefined) {
      slider.value = profile[prop];
      val.textContent = profile[prop];
    }
  });
}

function updateAvatarSize(value) {
  document.getElementById('valAvatarSize').textContent = value;
  socket.emit('settings:avatarSize', parseInt(value));
}

function updateFont(property, value) {
  const valId = 'val' + property.charAt(0).toUpperCase() + property.slice(1);
  const el = document.getElementById(valId);
  if (el) el.textContent = value;
  socket.emit('settings:font', { property, value: parseInt(value) });
}

// ─── LAYOUT / DISPLAY ───────────────────────────────────
function updateLayoutSelect() {
  const sel = document.getElementById('layoutSelect');
  sel.value = `${state.settings.layout.rows}x${state.settings.layout.cols}`;
}

function changeLayout(val) {
  const [rows, cols] = val.split('x').map(Number);
  socket.emit('settings:layout', { rows, cols });
}

function updateModeButtons() {
  document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.settings.displayMode);
  });
  document.getElementById('sncfBlueToggle').checked = state.settings.sncfBlueMode;
}

function setDisplayMode(mode) {
  socket.emit('settings:displayMode', { mode });
}

function toggleSNCFBlue(enabled) {
  socket.emit('settings:sncfBlue', { enabled });
}

// ─── PREVIEW ────────────────────────────────────────────
function scalePreview() {
  const container = document.querySelector('.preview-container');
  const iframe = document.getElementById('previewFrame');
  if (!container || !iframe) return;
  const containerWidth = container.clientWidth;
  const scale = containerWidth / 1920;
  iframe.style.transform = `scale(${scale})`;
  container.style.height = `${1080 * scale}px`;
}

window.addEventListener('resize', scalePreview);

// ─── ACTIONS ────────────────────────────────────────────
function togglePresence(matchId, player) {
  socket.emit('match:presence', { id: matchId, player });
}

function changeScore(matchId, player, delta) {
  socket.emit('match:score', { id: matchId, player, delta });
}

function startTimer(matchId) {
  socket.emit('timer:start', { id: matchId });
}

function stopTimer(matchId) {
  socket.emit('timer:stop', { id: matchId });
}

function resetTimer(matchId) {
  socket.emit('timer:reset', { id: matchId });
}

function declareWinner(matchId, winner) {
  socket.emit('match:declareWinner', { id: matchId, winner });
}

function validateMatch(matchId) {
  socket.emit('match:validate', { id: matchId });
}

function undeclareWinner(matchId) {
  socket.emit('match:undeclare', { id: matchId });
}

function launchMatch(matchId) {
  socket.emit('match:launch', { id: matchId });
}

function forfeitMatch(matchId) {
  if (confirm('Déclarer forfait ?')) {
    socket.emit('match:forfeit', { id: matchId });
  }
}

function cancelMatch(matchId) {
  if (confirm('Annuler ce match (les deux joueurs sont absents) ?')) {
    socket.emit('match:cancel', { id: matchId });
  }
}

function restoreMatch(historyId) {
  socket.emit('match:restore', { id: historyId });
}

function deleteMatch(matchId) {
  if (confirm('Supprimer ce match ?')) {
    socket.emit('match:delete', { id: matchId });
  }
}

function activateMatch(matchId) {
  socket.emit('match:activate', { id: matchId });
}

function moveToQueue(matchId) {
  socket.emit('match:toQueue', { id: matchId });
}

function toggleStream(matchId) {
  socket.emit('match:toggleStream', { id: matchId });
}

function toggleHighlight(matchId) {
  const current = state.settings.highlightMatchId;
  socket.emit('settings:highlight', { matchId: current === matchId ? null : matchId });
}

function toggleGameGroup(game) {
  collapsedGames[game] = !collapsedGames[game];
  renderMatches();
}

// ─── CREATE MATCH ───────────────────────────────────────
function openCreateModal() { openModal('modalCreate'); }

function createMatch() {
  const game = document.getElementById('inputGame').value.trim();
  const player1 = document.getElementById('inputPlayer1').value.trim();
  const player2 = document.getElementById('inputPlayer2').value.trim();
  const station = document.getElementById('inputStation').value.trim();
  const round = document.getElementById('inputRound').value.trim();
  const status = document.getElementById('inputStatus').value;
  const streaming = document.getElementById('inputStreaming').checked;

  if (!player1 || !player2) {
    alert('Veuillez entrer les noms des deux joueurs.');
    return;
  }

  socket.emit('match:create', { game: game || 'Autre', player1, player2, station, round, status, streaming, timerDuration: parseInt(document.getElementById('inputTimerDuration').value) || 120 });
  closeModal('modalCreate');
  // Reset form
  document.getElementById('inputGame').value = '';
  document.getElementById('inputPlayer1').value = '';
  document.getElementById('inputPlayer2').value = '';
  document.getElementById('inputStation').value = '';
  document.getElementById('inputRound').value = '';
  document.getElementById('inputStatus').value = 'waiting';
  document.getElementById('inputTimerDuration').value = '120';
  document.getElementById('inputStreaming').checked = false;
}

// ─── MODALS ─────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Close on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// ─── START.GG (moved to settings.html) ──────────────────
function openSettings() {
  window.open('/settings.html', 'dojoSettings');
}

// ─── AUTOCOMPLETE ───────────────────────────────────────
function setupAutocomplete(inputId, listId, optionsFn, onSelect) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;
  let activeIdx = -1;

  function render() {
    const val = input.value.trim().toLowerCase();
    const options = optionsFn();
    const filtered = val
      ? options.filter(o => o.label.toLowerCase().includes(val))
      : options;
    activeIdx = -1;
    if (filtered.length === 0 || (filtered.length === 1 && filtered[0].label.toLowerCase() === val)) {
      list.classList.remove('visible');
      list.innerHTML = '';
      return;
    }
    list.innerHTML = filtered.map((o, i) => {
      const avatarHtml = o.avatar ? `<img src="${escapeAttr(o.avatar)}" class="ac-avatar" onerror="this.style.display='none'">` : '';
      const tagsHtml = o.tags ? `<span class="ac-tags">${o.tags.map(t => esc(t)).join(', ')}</span>` : '';
      return `<div class="ac-item" data-idx="${i}" data-value="${escapeAttr(o.label)}">${avatarHtml}<span class="ac-label">${esc(o.label)}</span>${tagsHtml}</div>`;
    }).join('');
    list.classList.add('visible');
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', render);

  list.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('.ac-item');
    if (item) {
      input.value = item.dataset.value;
      list.classList.remove('visible');
      if (onSelect) onSelect(item.dataset.value);
    }
  });

  input.addEventListener('keydown', (e) => {
    const items = list.querySelectorAll('.ac-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
      items[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      input.value = items[activeIdx].dataset.value;
      list.classList.remove('visible');
      if (onSelect) onSelect(input.value);
    } else if (e.key === 'Escape') {
      list.classList.remove('visible');
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => list.classList.remove('visible'), 150);
  });
}

function getPlayersForSelectedGame() {
  const game = document.getElementById('inputGame')?.value?.trim();
  if (!game) return state.players;
  return state.players.filter(p => !p.games || p.games.length === 0 || p.games.includes(game));
}

function initAutocompletes() {
  setupAutocomplete('inputGame', 'acGameList', () =>
    state.games.map(g => ({ label: g }))
  , () => {
    // Refresh player lists when game changes
    document.getElementById('inputPlayer1')?.dispatchEvent(new Event('input'));
    document.getElementById('inputPlayer2')?.dispatchEvent(new Event('input'));
  });

  setupAutocomplete('inputPlayer1', 'acPlayer1List', () =>
    getPlayersForSelectedGame().map(p => ({
      label: typeof p === 'string' ? p : p.name,
      avatar: p.avatar || null,
      tags: p.games?.length ? p.games : null,
    }))
  );

  setupAutocomplete('inputPlayer2', 'acPlayer2List', () =>
    getPlayersForSelectedGame().map(p => ({
      label: typeof p === 'string' ? p : p.name,
      avatar: p.avatar || null,
      tags: p.games?.length ? p.games : null,
    }))
  );
}

// Also refresh autocomplete when game input changes
document.getElementById('inputGame')?.addEventListener('input', () => {
  document.getElementById('inputPlayer1')?.dispatchEvent(new Event('focus'));
  document.getElementById('inputPlayer2')?.dispatchEvent(new Event('focus'));
});

function updateGamesDatalist() {
  // Kept for backward compat — autocomplete handles rendering
}

function updatePlayersDatalist() {
  // Kept for backward compat — autocomplete handles rendering
}

// ─── BRACKET ────────────────────────────────────────────
function openBracketModal() {
  openModal('modalBracket');
  if (state.bracket && state.bracket.rounds.length > 0) {
    renderBracketPreview();
  }
}

function generateBracket() {
  const name = document.getElementById('inputBracketName').value.trim() || 'Bracket';
  const playersText = document.getElementById('inputBracketPlayers').value.trim();
  const players = playersText.split('\n').map(p => p.trim()).filter(p => p.length > 0);

  if (players.length < 2) {
    alert('Ajoutez au moins 2 joueurs.');
    return;
  }

  socket.emit('bracket:generate', { name, players });
  setTimeout(renderBracketPreview, 500);
}

function renderBracketPreview() {
  const container = document.getElementById('bracketPreview');
  if (!state.bracket || !state.bracket.rounds.length) {
    container.innerHTML = '<div class="empty-state-sm">Aucun bracket généré</div>';
    return;
  }

  const roundNames = ['Premier Tour', 'Quarts', 'Demis', 'Finale', 'Champion'];

  container.innerHTML = state.bracket.rounds.map((round, ri) => {
    const rName = ri < roundNames.length ? roundNames[ri] : `Tour ${ri + 1}`;
    if (ri === 0 && state.bracket.rounds.length > roundNames.length) {
      // For large brackets
    }
    return `<div class="bracket-round">
      <div class="bracket-round-title">${rName}</div>
      ${round.map((m, mi) => `
        <div class="bracket-match">
          <div class="bp ${m.winner === 1 ? 'winner' : ''}">${esc(m.player1 || '?')} ${m.score1 || ''}</div>
          <div class="bp ${m.winner === 2 ? 'winner' : ''}">${esc(m.player2 || '?')} ${m.score2 || ''}</div>
        </div>
      `).join('')}
    </div>`;
  }).join('');
}

// ─── HISTORY EXPORT ─────────────────────────────────────
function exportHistory(format) {
  if (state.history.length === 0) {
    alert('Aucun historique à exporter.');
    return;
  }

  if (format === 'html') {
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DOJO SHOW - Historique</title>
<style>
body{font-family:Inter,sans-serif;background:#0a0a14;color:#f0f0f5;padding:40px}
h1{color:#7b2ff7;margin-bottom:20px}
table{width:100%;border-collapse:collapse}
th{background:#1a1a2e;padding:10px;text-align:left;color:#9d4edd;font-size:13px}
td{padding:8px 10px;border-bottom:1px solid #2a2a42;font-size:13px}
.winner{color:#00c853;font-weight:700}
.score{font-family:monospace;color:#9d4edd}
</style></head><body>
<h1>⚔ DOJO SHOW 2.0 — Historique des matchs</h1>
<table>
<tr><th>Jeu</th><th>Joueur 1</th><th>Joueur 2</th><th>Score</th><th>Round</th></tr>
${state.history.map(h => `<tr>
<td>${esc(h.game)}</td>
<td class="${h.winner === 1 ? 'winner' : ''}">${esc(h.player1)}</td>
<td class="${h.winner === 2 ? 'winner' : ''}">${esc(h.player2)}</td>
<td class="score">${h.score1}:${h.score2}</td>
<td>${esc(h.round || '')}</td>
</tr>`).join('')}
</table></body></html>`;
    downloadFile('historique.html', html, 'text/html');
  } else {
    const sep = '\t';
    let csv = `Jeu${sep}Joueur 1${sep}Joueur 2${sep}Vainqueur${sep}Score${sep}Round\n`;
    state.history.forEach(h => {
      const winner = h.winner === 1 ? h.player1 : h.player2;
      csv += `${h.game}${sep}${h.player1}${sep}${h.player2}${sep}${winner}${sep}${h.score1}:${h.score2}${sep}${h.round || ''}\n`;
    });
    downloadFile('historique.csv', csv, 'text/csv');
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function clearHistory() {
  if (confirm('Vider tout l\'historique ?')) {
    socket.emit('history:clear');
  }
}

// ─── DISPLAY WINDOW ─────────────────────────────────────
let displayWindow = null;

function openDisplayWindow() {
  if (displayWindow && !displayWindow.closed) {
    displayWindow.focus();
    return;
  }
  displayWindow = window.open('/display.html', 'dojoDisplay', 'width=1920,height=1080');
}

// ─── TIMER UPDATE LOOP ──────────────────────────────────
function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    state.matches.filter(m => m.status === 'active').forEach(m => {
      const el = document.getElementById(`timer-${m.id}`);
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
  }, 200);
}

function getElapsed(m) {
  if (m.timerElapsed !== undefined && !m.timerRunning) return m.timerElapsed;
  const base = m.timerElapsed || m.timerAccumulated || 0;
  if (!m.timerRunning) return base;
  return base + (Date.now() - lastSyncTime);
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ─── HELPERS ────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── FONT ACCORDION ────────────────────────────────────
function toggleFontAccordion(headerEl) {
  headerEl.classList.toggle('open');
  const body = headerEl.nextElementSibling;
  if (body) body.classList.toggle('open');
}

// ─── BACKUP & RESTORE ──────────────────────────────────
function createBackup() {
  const nameInput = document.getElementById('backupName');
  const name = nameInput.value.trim();
  
  socket.emit('state:backup', { name });
  showBackupStatus('Création du backup...', 'success');
}

function restoreBackup(filename) {
  if (!confirm(`Êtes-vous sûr de vouloir restaurer la sauvegarde "${filename}" ?\n\nTous les matchs et paramètres actuels seront remplacés.`)) {
    return;
  }
  
  socket.emit('state:restore', { filename });
  showBackupStatus('Restauration en cours...', 'success');
}

function refreshBackupList() {
  socket.emit('state:list-backups');
}

function showBackupStatus(message, type) {
  const status = document.getElementById('backupStatus');
  status.textContent = message;
  status.className = `backup-status ${type}`;
  status.style.display = 'block';
  
  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}

function renderBackupList(backups) {
  const container = document.getElementById('backupList');
  
  if (!backups || backups.length === 0) {
    container.innerHTML = '<div class="backup-item-empty">Aucune sauvegarde trouvée</div>';
    return;
  }
  
  container.innerHTML = backups.map(backup => `
    <div class="backup-item" onclick="restoreBackup('${backup.filename}')">
      <div class="backup-item-name">${esc(backup.backupName)}</div>
      <div class="backup-item-meta">
        <span>📅 ${new Date(backup.created).toLocaleString()}</span>
        <span>🎮 ${backup.matchCount} matchs</span>
        <span>👥 ${backup.playerCount} joueurs</span>
        <span>💾 ${(backup.size / 1024).toFixed(1)} KB</span>
      </div>
    </div>
  `).join('');
}

// Socket event handlers for backup
socket.on('backup:success', (data) => {
  showBackupStatus(`✅ Backup créé: ${data.filename}`, 'success');
  document.getElementById('backupName').value = '';
  refreshBackupList();
});

socket.on('backup:error', (data) => {
  showBackupStatus(`❌ Erreur: ${data.message}`, 'error');
});

socket.on('restore:success', (data) => {
  showBackupStatus(`✅ État restauré depuis: ${data.filename}`, 'success');
});

socket.on('restore:error', (data) => {
  showBackupStatus(`❌ Erreur restauration: ${data.message}`, 'error');
});

socket.on('backups:list', (backups) => {
  renderBackupList(backups);
});

socket.on('backups:error', (data) => {
  showBackupStatus(`❌ Erreur liste: ${data.message}`, 'error');
});
// ─── TOURNAMENT AUTOMATION ─────────────────────────────────────────
function toggleAutoTournament(enabled) {
  socket.emit('tournament:toggleAuto');
}

function updateTournamentUI() {
  const toggle = document.getElementById('autoTournamentToggle');
  const status = document.getElementById('tournamentStatus');
  const actions = document.getElementById('tournamentActions');
  const roundsContainer = document.getElementById('tournamentRounds');
  
  const isEnabled = state.bracket?.autoTournament || false;
  
  toggle.checked = isEnabled;
  
  if (isEnabled) {
    status.textContent = 'Mode tournoi automatisé actif';
    status.className = 'tournament-status active';
    actions.style.display = 'block';
    
    // Generate round buttons
    const rounds = state.bracket?.rounds || [];
    roundsContainer.innerHTML = rounds.map((round, idx) => {
      const pendingMatches = round.filter(match => !match.winner && match.player1 !== '?' && match.player2 !== '?');
      const buttonText = `Round ${idx + 1} (${pendingMatches.length} match${pendingMatches.length !== 1 ? 's' : ''})`;
      const isDisabled = pendingMatches.length === 0;
      
      return `
        <button class="tournament-round-btn" 
                onclick="createRoundMatches(${idx})"
                ${isDisabled ? 'disabled' : ''}>
          <span>${buttonText}</span>
          <span>${isDisabled ? '✓' : '⚡'}</span>
        </button>
      `;
    }).join('');
  } else {
    status.textContent = 'Mode manuel actif';
    status.className = 'tournament-status';
    actions.style.display = 'none';
  }
}

function createRoundMatches(roundIdx) {
  socket.emit('tournament:createRoundMatches', { roundIdx });
}

// Socket events for tournament
socket.on('tournament:matchesCreated', (data) => {
  showBackupStatus(`⚡ ${data.count} match${data.count !== 1 ? 's' : ''} créé${data.count !== 1 ? 's' : ''} pour le round ${data.round + 1}`, 'success');
  updateTournamentUI();
});

socket.on('bracket:syncCompleted', (data) => {
  showBackupStatus(`✅ Bracket synchronisé depuis le match`, 'success');
});

// Update tournament UI in the render function
// (updateTournamentUI is now called directly in the render function above)
// ─── INIT ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startTimerLoop();
  setTimeout(scalePreview, 200);
  initAutocompletes();
});

/* ═══════════════════════════════════════════════════════
   DOJO SHOW 2.0 — Settings Logic
   ═══════════════════════════════════════════════════════ */

let state = {
  games: [],
  players: [],
  startgg: { apiKey: '', tournamentSlug: '' },
  gameSettings: {},
};

// ─── SOCKET ─────────────────────────────────────────────
const socket = io();

socket.on('state:full', (newState) => {
  state.games = newState.games || [];
  state.players = newState.players || [];
  state.startgg = newState.startgg || { apiKey: '', tournamentSlug: '' };
  state.settings = newState.settings || {};
  state.gameSettings = newState.gameSettings || {};
  renderGames();
  renderPlayers();
  loadStartGGConfig();
  loadAccentColor();
  loadFontFamily();
  loadAutoRotation();
  loadAutoSave();
});

socket.on('connect', () => {
  const el = document.getElementById('connectionStatus');
  el.textContent = '●  Connecté';
  el.classList.remove('disconnected');
  // Request full state including API key
  socket.emit('request:fullState');
});

socket.on('disconnect', () => {
  const el = document.getElementById('connectionStatus');
  el.textContent = '●  Déconnecté';
  el.classList.add('disconnected');
});

// ─── TABS ───────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tabId));
}

// ─── START.GG ───────────────────────────────────────────
function loadStartGGConfig() {
  if (state.startgg.apiKey) {
    document.getElementById('inputApiKey').value = state.startgg.apiKey;
  }
  if (state.startgg.tournamentSlug) {
    document.getElementById('inputTournamentUrl').value = 'https://start.gg/tournament/' + state.startgg.tournamentSlug;
  }
}

function saveStartGGConfig() {
  const apiKey = document.getElementById('inputApiKey').value.trim();
  const url = document.getElementById('inputTournamentUrl').value.trim();
  const slugMatch = url.match(/start\.gg\/tournament\/([^\/\?]+)/);

  socket.emit('startgg:configure', {
    apiKey,
    tournamentSlug: slugMatch ? slugMatch[1] : '',
  });

  showStatus('startggStatus', 'success', '✅ Configuration sauvegardée');
}

async function testStartGGConnection() {
  const apiKey = document.getElementById('inputApiKey').value.trim();
  const url = document.getElementById('inputTournamentUrl').value.trim();
  const statusEl = document.getElementById('startggStatus');

  if (!apiKey || !url) {
    showStatus('startggStatus', 'error', 'Remplissez la clé API et l\'URL du tournoi.');
    return;
  }

  const slugMatch = url.match(/start\.gg\/tournament\/([^\/\?]+)/);
  if (!slugMatch) {
    showStatus('startggStatus', 'error', 'URL invalide. Format : https://start.gg/tournament/nom-du-tournoi');
    return;
  }

  showStatus('startggStatus', 'loading', '🔄 Test de connexion...');

  const query = `query($slug:String!){tournament(slug:$slug){name events{name videogame{name}entrants(query:{perPage:1}){pageInfo{total}}}}}`;

  try {
    const resp = await fetch('/api/startgg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { slug: slugMatch[1] }, apiKey }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    if (data.errors) throw new Error(data.errors.map(e => e.message).join(', '));
    if (!data.data?.tournament) throw new Error('Tournoi introuvable');

    const t = data.data.tournament;
    const events = (t.events || []).map(e =>
      `${e.name} (${e.videogame?.name || '?'}) — ${e.entrants?.pageInfo?.total || 0} participants`
    ).join('<br>');

    showStatus('startggStatus', 'success', `✅ Connexion réussie : ${esc(t.name)}`);
    document.getElementById('startggResults').innerHTML = `<div style="margin-top:8px;font-size:12px;color:#a0a0b8">${events}</div>`;
  } catch (err) {
    showStatus('startggStatus', 'error', '❌ Erreur : ' + err.message);
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈 Masquer';
  } else {
    input.type = 'password';
    btn.textContent = '👁 Voir';
  }
}

// ─── GAMES ──────────────────────────────────────────────
function renderGames() {
  const container = document.getElementById('gamesList');
  if (state.games.length === 0) {
    container.innerHTML = '<div class="empty-state-sm">Aucun jeu enregistré</div>';
    return;
  }
  container.innerHTML = state.games.map(g => {
    const gs = state.gameSettings[g] || {};
    const safeId = g.replace(/[^a-zA-Z0-9]/g, '_');
    return `
    <div class="list-item game-item" data-game="${escAttr(g)}">
      <div class="game-item-top">
        <span class="list-item-name">🎮 ${esc(g)}</span>
        <div class="list-item-actions">
          <button class="btn btn-secondary btn-sm" onclick="editGame(this)">✏</button>
          <button class="btn btn-danger" onclick="deleteGame('${escAttr(g)}')">✕</button>
        </div>
      </div>
      <div class="game-settings-row">
        <div class="game-setting">
          <label>Couleur</label>
          <input type="color" value="${gs.color || '#888888'}" onchange="updateGameSetting('${escAttr(g)}', 'color', this.value)">
        </div>
        <div class="game-setting">
          <label>Image</label>
          <input type="file" accept="image/*" onchange="uploadGameImage('${escAttr(g)}', this)" style="display:none" id="gameImg-${safeId}">
          <button class="btn btn-secondary btn-xs" onclick="document.getElementById('gameImg-${safeId}').click()">📷</button>
          ${gs.image ? `<img src="${escAttr(gs.image)}" class="game-thumb" alt=""><button class="btn btn-danger btn-xs" onclick="updateGameSetting('${escAttr(g)}', 'image', '')">✕</button>` : ''}
        </div>
        <div class="game-setting">
          <label>Opacité ${Math.round((gs.imageOpacity || 0.3) * 100)}%</label>
          <input type="range" min="0" max="100" step="5" value="${Math.round((gs.imageOpacity || 0.3) * 100)}" onchange="updateGameSetting('${escAttr(g)}', 'imageOpacity', this.value / 100)">
        </div>
      </div>
    </div>`;
  }).join('');
}

function addGame() {
  const input = document.getElementById('inputNewGame');
  const name = input.value.trim();
  if (!name) return;
  socket.emit('games:add', { name });
  // Set initial color if picked
  const colorInput = document.getElementById('inputNewGameColor');
  if (colorInput && colorInput.value !== '#888888') {
    setTimeout(() => socket.emit('games:updateSettings', { name, color: colorInput.value }), 100);
  }
  input.value = '';
  if (colorInput) colorInput.value = '#888888';
  input.focus();
}

function deleteGame(name) {
  if (confirm(`Supprimer le jeu "${name}" ?`)) {
    socket.emit('games:delete', { name });
  }
}

function editGame(btn) {
  const item = btn.closest('.list-item');
  if (!item) return;
  const name = item.dataset.game;
  item.innerHTML = `
    <div class="list-item-edit">
      <input type="text" class="edit-game-input" value="${escAttr(name)}" onkeydown="if(event.key==='Enter')saveGameEdit(this);if(event.key==='Escape')renderGames();">
    </div>
    <div class="list-item-actions">
      <button class="btn btn-primary btn-sm" onclick="saveGameEdit(this.closest('.list-item').querySelector('.edit-game-input'))">✓</button>
      <button class="btn btn-secondary btn-sm" onclick="renderGames()">✕</button>
    </div>`;
  item.dataset.oldGame = name;
  const input = item.querySelector('.edit-game-input');
  input.focus();
  input.select();
}

function saveGameEdit(input) {
  if (!input) return;
  const item = input.closest('.list-item');
  const oldName = item.dataset.oldGame;
  const newName = input.value.trim();
  if (!newName || newName === oldName) { renderGames(); return; }
  if (state.games.includes(newName)) { alert(`Le jeu "${newName}" existe déjà.`); return; }
  socket.emit('games:rename', { oldName, newName });
}

// ─── IMPORT START.GG — 3 PHASES ─────────────────────────
let _startggAvatarMap = new Map(); // playerName → avatarUrl

function getStartGGCredentials() {
  const apiKey = document.getElementById('inputApiKey')?.value?.trim() || state.startgg.apiKey;
  const url = document.getElementById('inputTournamentUrl')?.value?.trim() || '';
  const slugMatch = url.match(/start\.gg\/tournament\/([^\/\?]+)/) || [null, state.startgg.tournamentSlug];
  return { apiKey, slug: slugMatch ? slugMatch[1] : '' };
}

function importLog(msg, type) {
  const log = document.getElementById('importLog');
  if (!log) return;
  const time = new Date().toLocaleTimeString();
  const cls = type === 'error' ? 'color:#ff1744' : type === 'success' ? 'color:#00c853' : 'color:#a0a0b8';
  log.innerHTML += `<div style="${cls}"><span style="opacity:.5">[${time}]</span> ${esc(msg)}</div>`;
  log.scrollTop = log.scrollHeight;
}

function updateProgress(step, current, total) {
  const fill = document.getElementById(`step${step}ProgressFill`);
  const label = document.getElementById(`step${step}ProgressLabel`);
  const wrap = document.getElementById(`step${step}ProgressWrap`);
  if (!fill || !label || !wrap) return;
  wrap.style.display = '';
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  fill.style.width = pct + '%';
  label.textContent = `${current}/${total} (${pct}%)`;
}

function setStepStatus(step, msg, type) {
  const el = document.getElementById(`step${step}Status`);
  if (!el) return;
  el.className = 'import-step-status' + (type ? ' status-' + type : '');
  el.textContent = msg;
}

function populateImportGameSelectors(events) {
  const selectors = ['importPlayersGame', 'importAvatarsGame'];
  const games = [...new Map(events.map(e => [e.videogame?.name, e])).values()];
  for (const selId of selectors) {
    const sel = document.getElementById(selId);
    if (!sel) continue;
    sel.innerHTML = '<option value="__all__">🎮 Tous les jeux</option>' +
      games.map(e => `<option value="${escAttr(e.videogame?.name || e.name)}">${esc(e.videogame?.name || e.name)}</option>`).join('');
  }
}

async function importStep1_Games() {
  const { apiKey, slug } = getStartGGCredentials();
  if (!apiKey || !slug) { importLog('Configuration Start.gg manquante', 'error'); return; }

  const btn = document.getElementById('btnImportGames');
  btn.disabled = true;
  setStepStatus(1, 'Import en cours...', 'loading');
  importLog('Étape 1 : Récupération des jeux...', '');

  const query = `query($slug:String!){tournament(slug:$slug){events{id name videogame{name images{url}}}}}`;
  try {
    const resp = await fetch('/api/startgg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { slug }, apiKey }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    if (data.errors) throw new Error(data.errors.map(e => e.message).join(', '));
    if (!data.data?.tournament) throw new Error('Tournoi introuvable');

    const events = data.data.tournament.events || [];
    const gameMap = new Map();
    for (const event of events) {
      const vg = event.videogame;
      if (vg?.name && !gameMap.has(vg.name)) {
        gameMap.set(vg.name, vg.images?.[0]?.url || null);
      }
    }

    for (const [name, imageUrl] of gameMap) {
      socket.emit('games:add', { name, startggImage: imageUrl });
    }

    populateImportGameSelectors(events);
    // Store events for step 2
    window._startggEvents = events;

    const names = [...gameMap.keys()].join(', ');
    importLog(`${gameMap.size} jeu(x) importé(s) : ${names}`, 'success');
    setStepStatus(1, `✅ ${gameMap.size} jeu(x) importé(s)`, 'success');
  } catch (err) {
    importLog('Erreur étape 1 : ' + err.message, 'error');
    setStepStatus(1, '❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function importStep2_Players() {
  const { apiKey, slug } = getStartGGCredentials();
  if (!apiKey || !slug) { importLog('Configuration Start.gg manquante', 'error'); return; }

  const btn = document.getElementById('btnImportPlayers');
  btn.disabled = true;
  setStepStatus(2, 'Import en cours...', 'loading');
  _startggAvatarMap.clear();

  const selectedGame = document.getElementById('importPlayersGame')?.value || '__all__';

  // Get events list (use cached from step 1 or fetch)
  let events = window._startggEvents;
  if (!events) {
    importLog('Récupération de la liste des événements...', '');
    const eventsQuery = `query($slug:String!){tournament(slug:$slug){events{id name videogame{name}}}}`;
    try {
      const resp = await fetch('/api/startgg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: eventsQuery, variables: { slug }, apiKey }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      if (!data.data?.tournament) throw new Error('Tournoi introuvable');
      events = data.data.tournament.events || [];
      window._startggEvents = events;
      populateImportGameSelectors(events);
    } catch (err) {
      importLog('Erreur : ' + err.message, 'error');
      setStepStatus(2, '❌ ' + err.message, 'error');
      btn.disabled = false;
      return;
    }
  }

  // Filter events by selected game
  const filteredEvents = selectedGame === '__all__'
    ? events
    : events.filter(e => (e.videogame?.name || e.name) === selectedGame);

  if (filteredEvents.length === 0) {
    importLog('Aucun événement trouvé pour ce filtre', 'error');
    setStepStatus(2, '❌ Aucun événement', 'error');
    btn.disabled = false;
    return;
  }

  importLog(`Étape 2 : Import joueurs de ${filteredEvents.length} événement(s)...`, '');
  const playerMap = new Map();
  const PER_PAGE = 100;
  let totalProcessed = 0;

  // First, count total for progress
  let estimatedTotal = 0;
  for (const ev of filteredEvents) estimatedTotal += 500; // rough estimate

  for (const event of filteredEvents) {
    const gameName = event.videogame?.name || event.name || 'Inconnu';
    let page = 1;
    let hasMore = true;

    importLog(`  → ${gameName} (${event.name})...`, '');

    while (hasMore) {
      const pageQuery = `query($eventId:ID!,$page:Int!,$perPage:Int!){event(id:$eventId){entrants(query:{page:$page,perPage:$perPage}){pageInfo{totalPages total}nodes{participants{gamerTag user{images(type:"profile"){url}}}}}}}`;
      try {
        const resp = await fetch('/api/startgg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: pageQuery, variables: { eventId: event.id, page, perPage: PER_PAGE }, apiKey }),
        });
        const data = await resp.json();
        if (data.errors) { importLog('Erreur API page ' + page + ': ' + data.errors[0].message, 'error'); break; }
        const entrants = data.data?.event?.entrants;
        if (!entrants?.nodes) break;

        // Update total estimate on first page
        if (page === 1 && entrants.pageInfo?.total) {
          estimatedTotal = estimatedTotal - 500 + entrants.pageInfo.total;
        }

        for (const entrant of entrants.nodes) {
          for (const p of (entrant.participants || [])) {
            const tag = p.gamerTag;
            if (!tag) continue;
            if (playerMap.has(tag)) {
              playerMap.get(tag).games.push(gameName);
            } else {
              playerMap.set(tag, { name: tag, games: [gameName] });
            }
            // Store avatar URL for step 3
            const avatarUrl = p.user?.images?.[0]?.url || null;
            if (avatarUrl && !_startggAvatarMap.has(tag)) {
              _startggAvatarMap.set(tag, avatarUrl);
            }
            totalProcessed++;
          }
        }

        updateProgress(2, totalProcessed, estimatedTotal > totalProcessed ? estimatedTotal : totalProcessed);
        hasMore = page < (entrants.pageInfo?.totalPages || 1);
        page++;
      } catch (err) {
        importLog(`Erreur page ${page} : ${err.message}`, 'error');
        break;
      }
    }
    importLog(`  ✓ ${gameName} terminé`, 'success');
  }

  const players = [...playerMap.values()];
  players.forEach(p => p.games = [...new Set(p.games)]);

  if (players.length === 0) {
    importLog('Aucun joueur trouvé', 'error');
    setStepStatus(2, '❌ Aucun joueur', 'error');
    btn.disabled = false;
    return;
  }

  // Send players WITHOUT avatars (they'll have default avatar)
  socket.emit('startgg:setData', { players: players.map(p => ({ name: p.name, avatar: null, games: p.games })) });

  const withAvatar = _startggAvatarMap.size;
  importLog(`${players.length} joueur(s) importé(s) (${withAvatar} avec avatar disponible)`, 'success');
  setStepStatus(2, `✅ ${players.length} joueur(s) importé(s)`, 'success');
  updateProgress(2, totalProcessed, totalProcessed);
  btn.disabled = false;
}

async function importStep3_Avatars() {
  const btn = document.getElementById('btnImportAvatars');
  btn.disabled = true;
  setStepStatus(3, 'Import en cours...', 'loading');

  const selectedGame = document.getElementById('importAvatarsGame')?.value || '__all__';

  // Filter players by selected game
  let targetPlayers = state.players.filter(p => {
    if (selectedGame !== '__all__' && !(p.games || []).includes(selectedGame)) return false;
    // Only process players that have a Start.gg avatar URL stored
    return _startggAvatarMap.has(p.name);
  });

  // Skip only players that already have a real stored avatar.
  // The default avatar is a data URI (data:image/svg+xml;base64,...) and must be replaced.
  targetPlayers = targetPlayers.filter((p) => {
    const avatar = typeof p.avatar === 'string' ? p.avatar : '';
    return !avatar || !avatar.startsWith('/avatars/');
  });

  if (targetPlayers.length === 0) {
    if (_startggAvatarMap.size === 0) {
      importLog('Aucune URL d\'avatar en mémoire. Lancez l\'étape 2 d\'abord.', 'error');
    } else {
      importLog('Tous les joueurs ont déjà un avatar', 'success');
    }
    setStepStatus(3, _startggAvatarMap.size === 0 ? '❌ Lancez l\'étape 2 d\'abord' : '✅ Rien à faire', _startggAvatarMap.size === 0 ? 'error' : 'success');
    btn.disabled = false;
    return;
  }

  importLog(`Étape 3 : Téléchargement de ${targetPlayers.length} avatar(s)...`, '');
  let done = 0;
  let errors = 0;

  for (const player of targetPlayers) {
    const avatarUrl = _startggAvatarMap.get(player.name);
    if (!avatarUrl) continue;

    try {
      await new Promise((resolve, reject) => {
        socket.emit('players:update', { id: player.id, avatar: avatarUrl }, (ack) => {
          if (ack?.ok) resolve(); else reject(new Error('Échec'));
        });
        // Timeout after 15s
        setTimeout(() => reject(new Error('Timeout')), 15000);
      });
      done++;
    } catch (err) {
      errors++;
      importLog(`  ✗ ${player.name} : ${err.message}`, 'error');
    }

    updateProgress(3, done + errors, targetPlayers.length);

    // Log progress every 50 players
    if ((done + errors) % 50 === 0) {
      importLog(`  ... ${done + errors}/${targetPlayers.length} traité(s)`, '');
    }
  }

  importLog(`Avatars : ${done} OK, ${errors} erreur(s) sur ${targetPlayers.length}`, done > 0 ? 'success' : 'error');
  setStepStatus(3, `✅ ${done} avatar(s), ${errors} erreur(s)`, 'success');
  updateProgress(3, targetPlayers.length, targetPlayers.length);
  btn.disabled = false;
}

// ─── PLAYERS ────────────────────────────────────────────
function renderPlayers() {
  const container = document.getElementById('playersList');
  const filterGroup = document.getElementById('playerFilterGroup');
  const filterSelect = document.getElementById('playerGameFilter');

  // Collect all games from players
  const allGames = new Set();
  state.players.forEach(p => (p.games || []).forEach(g => allGames.add(g)));

  // Show/hide filter
  if (filterGroup) {
    filterGroup.style.display = allGames.size > 0 ? '' : 'none';
    if (filterSelect && allGames.size > 0) {
      const current = filterSelect.value;
      filterSelect.innerHTML = '<option value="">Tous les joueurs</option>' +
        [...allGames].sort().map(g => `<option value="${escAttr(g)}" ${g === current ? 'selected' : ''}>${esc(g)}</option>`).join('');
    }
  }

  const filterGame = filterSelect?.value || '';
  let filtered = state.players;
  if (filterGame) {
    filtered = state.players.filter(p => (p.games || []).includes(filterGame));
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state-sm">${filterGame ? 'Aucun joueur inscrit à ' + esc(filterGame) : 'Aucun joueur enregistré'}</div>`;
    return;
  }
  const countLabel = filterGame ? `<div class="player-count">${filtered.length} joueur(s) sur ${esc(filterGame)}</div>` : `<div class="player-count">${filtered.length} joueur(s)</div>`;
  container.innerHTML = countLabel + filtered.map(p => {
    const gameTags = (p.games && p.games.length)
      ? p.games.map(g => `<span class="player-game-tag">${esc(g)}</span>`).join('')
      : '';
    return `
    <div class="list-item">
      <div class="player-info">
        <img src="${escAttr(p.avatar || '')}" alt="" class="player-avatar" onerror="this.style.display='none'">
        <div class="player-details">
          <span class="list-item-name">${esc(p.name)}</span>
          ${gameTags ? `<div class="player-game-tags">${gameTags}</div>` : ''}
        </div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary btn-sm" onclick="editPlayer('${escAttr(p.id)}')">✏</button>
        <button class="btn btn-danger" onclick="deletePlayer('${escAttr(p.id)}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function addPlayer() {
  const input = document.getElementById('inputNewPlayer');
  const name = input.value.trim();
  if (!name) return;

  const fileInput = document.getElementById('inputNewPlayerAvatar');
  if (fileInput.files.length > 0) {
    const reader = new FileReader();
    reader.onload = () => {
      socket.emit('players:add', { name, avatar: reader.result });
      input.value = '';
      fileInput.value = '';
      resetAvatarPreview();
    };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    socket.emit('players:add', { name });
    input.value = '';
  }
  input.focus();
}

function deletePlayer(id) {
  const player = state.players.find(p => p.id === id);
  if (player && confirm(`Supprimer le joueur "${player.name}" ?`)) {
    socket.emit('players:delete', { id });
  }
}

function previewAvatar(input, previewId) {
  const preview = document.getElementById(previewId);
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => { preview.src = e.target.result; };
    reader.readAsDataURL(input.files[0]);
  }
}

function resetAvatarPreview() {
  document.getElementById('newPlayerAvatarPreview').src = '';
}

// ─── EDIT PLAYER ────────────────────────────────────────
let editPlayerAvatarChanged = false;

function editPlayer(id) {
  const player = state.players.find(p => p.id === id);
  if (!player) return;
  document.getElementById('editPlayerId').value = id;
  document.getElementById('editPlayerName').value = player.name;
  document.getElementById('editPlayerAvatarPreview').src = player.avatar || '';
  document.getElementById('editPlayerAvatarFile').value = '';
  editPlayerAvatarChanged = false;
  document.getElementById('modalEditPlayer').classList.add('active');
}

function closeEditPlayer() {
  document.getElementById('modalEditPlayer').classList.remove('active');
}

function clearEditAvatar() {
  document.getElementById('editPlayerAvatarPreview').src = '';
  document.getElementById('editPlayerAvatarFile').value = '';
  editPlayerAvatarChanged = true;
}

function savePlayerEdit() {
  const id = document.getElementById('editPlayerId').value;
  const name = document.getElementById('editPlayerName').value.trim();
  if (!name) { alert('Le nom ne peut pas être vide.'); return; }

  const fileInput = document.getElementById('editPlayerAvatarFile');
  if (fileInput.files.length > 0) {
    const reader = new FileReader();
    reader.onload = () => {
      socket.emit('players:update', { id, name, avatar: reader.result });
      closeEditPlayer();
    };
    reader.readAsDataURL(fileInput.files[0]);
  } else if (editPlayerAvatarChanged) {
    // Avatar was cleared
    socket.emit('players:update', { id, name, avatar: '' });
    closeEditPlayer();
  } else {
    // Only name changed, keep existing avatar
    socket.emit('players:update', { id, name });
    closeEditPlayer();
  }
}

// ─── ACCENT COLOR ───────────────────────────────────────
function loadAccentColor() {
  const hex = (state.settings && state.settings.accentColor) || '#7b2ff7';
  const picker = document.getElementById('accentColorPicker');
  const display = document.getElementById('accentHexDisplay');
  if (picker) picker.value = hex;
  if (display) display.textContent = hex;
  applyAccentColor(hex);
  renderPresets(hex);
}

function renderPresets(currentHex) {
  const grid = document.getElementById('presetGrid');
  if (!grid) return;
  grid.innerHTML = ACCENT_PRESETS.map(p => `
    <button class="preset-swatch ${p.hex.toLowerCase() === currentHex.toLowerCase() ? 'active' : ''}" 
            style="background:${p.hex}" 
            onclick="setAccentColor('${p.hex}')"
            title="${p.name}">
      ${p.hex.toLowerCase() === currentHex.toLowerCase() ? '✓' : ''}
    </button>
  `).join('');
}

function previewAccentColor(hex) {
  applyAccentColor(hex);
  const display = document.getElementById('accentHexDisplay');
  if (display) display.textContent = hex;
}

function setAccentColor(hex) {
  applyAccentColor(hex);
  const picker = document.getElementById('accentColorPicker');
  const display = document.getElementById('accentHexDisplay');
  if (picker) picker.value = hex;
  if (display) display.textContent = hex;
  socket.emit('settings:accentColor', hex);
  renderPresets(hex);
}

// ─── FONT FAMILY ────────────────────────────────────────────
function loadFontFamily() {
  const font = (state.settings && state.settings.fontFamily) || 'Inter';
  const select = document.getElementById('fontFamilySelect');
  if (select) select.value = font;
  document.body.style.fontFamily = `'${font}', sans-serif`;
  const preview = document.getElementById('fontPreview');
  if (preview) preview.style.fontFamily = `'${font}', sans-serif`;
}

function setFontFamily(font) {
  document.body.style.fontFamily = `'${font}', sans-serif`;
  const preview = document.getElementById('fontPreview');
  if (preview) preview.style.fontFamily = `'${font}', sans-serif`;
  socket.emit('settings:fontFamily', font);
}

// ─── AUTO ROTATION ────────────────────────────────────────
function loadAutoRotation() {
  const ar = (state.settings && state.settings.autoRotation) || { matches: 0, waiting: 0, bracket: 0 };
  const enabled = !!(state.settings && state.settings.rotationEnabled);
  // Migrate old single-value format
  const vals = typeof ar === 'number' ? { matches: ar, waiting: ar, bracket: ar } : ar;
  const modes = ['matches', 'waiting', 'bracket'];
  modes.forEach(m => {
    const slider = document.getElementById(`rotation-${m}`);
    const label = document.getElementById(`rotation-${m}-val`);
    if (slider) slider.value = vals[m] || 0;
    if (label) label.textContent = (vals[m] || 0) > 0 ? `${vals[m]}s` : 'Off';
  });
  // Toggle
  const toggle = document.getElementById('rotationEnabledToggle');
  if (toggle) toggle.checked = enabled;
  const slidersArea = document.getElementById('rotationSliders');
  if (slidersArea) slidersArea.classList.toggle('disabled', !enabled);
  updateRotationSummary(vals, enabled);
}

function setRotationEnabled(enabled) {
  const slidersArea = document.getElementById('rotationSliders');
  if (slidersArea) slidersArea.classList.toggle('disabled', !enabled);
  socket.emit('settings:rotationEnabled', enabled);
  // Update summary
  const ar = {};
  ['matches', 'waiting', 'bracket'].forEach(m => {
    const slider = document.getElementById(`rotation-${m}`);
    ar[m] = slider ? parseInt(slider.value) || 0 : 0;
  });
  updateRotationSummary(ar, enabled);
}

function setAutoRotationView(mode, value) {
  const seconds = parseInt(value) || 0;
  const label = document.getElementById(`rotation-${mode}-val`);
  if (label) label.textContent = seconds > 0 ? `${seconds}s` : 'Off';
  // Read all current values and send the full object
  const ar = {};
  ['matches', 'waiting', 'bracket'].forEach(m => {
    const slider = document.getElementById(`rotation-${m}`);
    ar[m] = m === mode ? seconds : (slider ? parseInt(slider.value) || 0 : 0);
  });
  const enabled = document.getElementById('rotationEnabledToggle')?.checked || false;
  updateRotationSummary(ar, enabled);
  socket.emit('settings:autoRotation', ar);
}

function updateRotationSummary(ar, enabled) {
  const el = document.getElementById('rotationSummary');
  if (!el) return;
  if (!enabled) {
    el.textContent = 'Rotation désactivée';
    el.className = 'rotation-summary off';
    return;
  }
  const active = ['matches', 'waiting', 'bracket'].filter(m => (ar[m] || 0) > 0);
  if (active.length < 2) {
    el.textContent = 'Au moins 2 modes doivent avoir une durée';
    el.className = 'rotation-summary off';
  } else {
    const total = active.reduce((s, m) => s + ar[m], 0);
    el.textContent = `Cycle actif : ${active.length} modes, ${total}s total`;
    el.className = 'rotation-summary on';
  }
}

// ─── AUTO SAVE ────────────────────────────────────────────
function loadAutoSave() {
  const seconds = (state.settings && state.settings.autoSaveInterval) || 30;
  const slider = document.getElementById('autoSaveSlider');
  const val = document.getElementById('autoSaveVal');
  if (slider) slider.value = seconds;
  if (val) val.textContent = seconds >= 60 ? `${Math.round(seconds / 60)}min` : `${seconds}s`;
}

function setAutoSaveInterval(value) {
  const seconds = parseInt(value) || 30;
  const slider = document.getElementById('autoSaveSlider');
  const val = document.getElementById('autoSaveVal');
  if (slider) slider.value = seconds;
  if (val) val.textContent = seconds >= 60 ? `${Math.round(seconds / 60)}min` : `${seconds}s`;
  socket.emit('settings:autoSaveInterval', seconds);
}

// ─── GAME SETTINGS ────────────────────────────────────────
function updateGameSetting(gameName, prop, value) {
  socket.emit('games:updateSettings', { name: gameName, [prop]: value });
}

function uploadGameImage(gameName, input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = () => {
    socket.emit('games:updateSettings', { name: gameName, image: reader.result });
  };
  reader.readAsDataURL(input.files[0]);
}

// ─── FAKE DATA ──────────────────────────────────────────
function generateFakeData() {
  if (confirm('⚠️ Ceci va remplacer toutes les données actuelles.\n\nGénérer les données de test ?')) {
    socket.emit('data:generateFake');
    showStatus('fakeDataStatus', 'success', '✅ Données de test générées ! Vérifiez la page Admin.');
  }
}

// ─── RESET ──────────────────────────────────────────────
function resetData(target) {
  const labels = {
    all: 'TOUTES LES DONNÉES',
    matches: 'tous les matchs',
    history: 'l\'historique',
    bracket: 'le bracket',
    games: 'tous les jeux',
    players: 'tous les joueurs',
  };

  const label = labels[target] || target;

  if (target === 'all') {
    if (!confirm(`⚠️ ATTENTION : Vous êtes sur le point de supprimer ${label}.\n\nCette action est IRRÉVERSIBLE.`)) return;
    if (!confirm(`🔴 DERNIÈRE CONFIRMATION\n\nTapez OK pour confirmer la suppression de ${label}.`)) return;
  } else {
    if (!confirm(`Supprimer ${label} ?\n\nCette action est irréversible.`)) return;
  }

  socket.emit('data:reset', { target });
}

// ─── HELPERS ────────────────────────────────────────────
function showStatus(elementId, type, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.className = 'status-message ' + type;
  el.innerHTML = message;
  if (type === 'success') {
    setTimeout(() => { el.className = 'status-message'; el.innerHTML = ''; }, 4000);
  }
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

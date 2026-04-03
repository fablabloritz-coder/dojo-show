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

async function importGamesFromStartGG() {
  const apiKey = document.getElementById('inputApiKey')?.value?.trim() || state.startgg.apiKey;
  const url = document.getElementById('inputTournamentUrl')?.value?.trim() || '';
  const slugMatch = url.match(/start\.gg\/tournament\/([^\/\?]+)/) || [null, state.startgg.tournamentSlug];

  if (!apiKey || !slugMatch[1]) {
    alert('Configurez d\'abord Start.gg dans l\'onglet Start.gg');
    switchTab('startgg');
    return;
  }

  const query = `query($slug:String!){tournament(slug:$slug){events{videogame{name}}}}`;
  try {
    const resp = await fetch('/api/startgg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { slug: slugMatch[1] }, apiKey }),
    });
    const data = await resp.json();
    if (!data.data?.tournament) throw new Error('Tournoi introuvable');

    const games = [...new Set(data.data.tournament.events
      .map(e => e.videogame?.name)
      .filter(Boolean))];

    games.forEach(g => socket.emit('games:add', { name: g }));
    alert(`${games.length} jeu(x) importé(s) : ${games.join(', ')}`);
  } catch (err) {
    alert('Erreur : ' + err.message);
  }
}

// ─── PLAYERS ────────────────────────────────────────────
function renderPlayers() {
  const container = document.getElementById('playersList');
  if (state.players.length === 0) {
    container.innerHTML = '<div class="empty-state-sm">Aucun joueur enregistré</div>';
    return;
  }
  container.innerHTML = state.players.map(p => `
    <div class="list-item">
      <div class="player-info">
        <img src="${escAttr(p.avatar || '')}" alt="" class="player-avatar" onerror="this.style.display='none'">
        <span class="list-item-name">${esc(p.name)}</span>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary btn-sm" onclick="editPlayer('${escAttr(p.id)}')">✏</button>
        <button class="btn btn-danger" onclick="deletePlayer('${escAttr(p.id)}')">✕</button>
      </div>
    </div>
  `).join('');
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

async function importPlayersFromStartGG() {
  const apiKey = document.getElementById('inputApiKey')?.value?.trim() || state.startgg.apiKey;
  const url = document.getElementById('inputTournamentUrl')?.value?.trim() || '';
  const slugMatch = url.match(/start\.gg\/tournament\/([^\/\?]+)/) || [null, state.startgg.tournamentSlug];

  if (!apiKey || !slugMatch[1]) {
    alert('Configurez d\'abord Start.gg dans l\'onglet Start.gg');
    switchTab('startgg');
    return;
  }

  const query = `query($slug:String!){tournament(slug:$slug){events{entrants(query:{perPage:500}){nodes{participants{gamerTag user{images(type:"profile"){url}}}}}}}}`;
  try {
    const resp = await fetch('/api/startgg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { slug: slugMatch[1] }, apiKey }),
    });
    const data = await resp.json();
    if (!data.data?.tournament) throw new Error('Tournoi introuvable');

    const players = [];
    const seen = new Set();
    for (const event of (data.data.tournament.events || [])) {
      for (const entrant of (event.entrants?.nodes || [])) {
        for (const p of (entrant.participants || [])) {
          if (!seen.has(p.gamerTag)) {
            seen.add(p.gamerTag);
            const avatarUrl = p.user?.images?.[0]?.url || null;
            players.push({ name: p.gamerTag, avatar: avatarUrl });
          }
        }
      }
    }

    socket.emit('startgg:setData', { players });
    alert(`${players.length} joueur(s) importé(s)`);
  } catch (err) {
    alert('Erreur : ' + err.message);
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
  // Migrate old single-value format
  const vals = typeof ar === 'number' ? { matches: ar, waiting: ar, bracket: ar } : ar;
  const modes = ['matches', 'waiting', 'bracket'];
  modes.forEach(m => {
    const slider = document.getElementById(`rotation-${m}`);
    const label = document.getElementById(`rotation-${m}-val`);
    if (slider) slider.value = vals[m] || 0;
    if (label) label.textContent = (vals[m] || 0) > 0 ? `${vals[m]}s` : 'Off';
  });
  updateRotationSummary(vals);
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
  updateRotationSummary(ar);
  socket.emit('settings:autoRotation', ar);
}

function updateRotationSummary(ar) {
  const el = document.getElementById('rotationSummary');
  if (!el) return;
  const active = ['matches', 'waiting', 'bracket'].filter(m => (ar[m] || 0) > 0);
  if (active.length < 2) {
    el.textContent = 'Désactivé — au moins 2 modes doivent avoir une durée';
    el.className = 'rotation-summary off';
  } else {
    const total = active.reduce((s, m) => s + ar[m], 0);
    el.textContent = `Cycle actif : ${active.length} modes, ${total}s total`;
    el.className = 'rotation-summary on';
  }
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

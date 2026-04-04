const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => res.redirect('/admin.html'));

// ─── STATE ──────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

const defaultFontProfile = (scale = 1) => ({
  matchTitle: Math.round(20 * scale),
  playerName: Math.round(22 * scale),
  score: Math.round(42 * scale),
  timer: Math.round(16 * scale),
  header: Math.round(18 * scale),
  queue: Math.round(16 * scale),
  // Attente (SNCF)
  sncfHeader: Math.round(22 * scale),
  sncfRow: Math.round(16 * scale),
  sncfGame: Math.round(15 * scale),
  sncfStatus: Math.round(14 * scale),
  // Bracket
  bracketTitle: Math.round(24 * scale),
  bracketName: Math.round(14 * scale),
  bracketScore: Math.round(14 * scale),
  bracketRound: Math.round(13 * scale),
});

let state = {
  matches: [],
  history: [],
  settings: {
    displayMode: 'matches', // matches | waiting | bracket
    layout: { rows: 2, cols: 2 },
    sncfBlueMode: false,
    avatarSize: 32,
    accentColor: '#7b2ff7',
    fontFamily: 'Inter',
    autoRotation: { matches: 0, waiting: 0, bracket: 0 },
    rotationEnabled: false,
    highlightMatchId: null,
    autoSaveInterval: 30,
    fontProfiles: {
      '1x1': defaultFontProfile(2.0),
      '1x2': defaultFontProfile(1.6),
      '1x3': defaultFontProfile(1.3),
      '2x1': defaultFontProfile(1.6),
      '2x2': defaultFontProfile(1.0),
      '2x3': defaultFontProfile(0.85),
      '3x1': defaultFontProfile(1.3),
      '3x2': defaultFontProfile(0.85),
      '3x3': defaultFontProfile(0.7),
    },
  },
  bracket: { rounds: [], name: '', autoTournament: false },
  startgg: { apiKey: '', tournamentSlug: '' },
  games: [],
  players: [],  // { id, name, avatar }
  gameSettings: {},  // { gameName: { color, image, imageOpacity } }
};

const DEFAULT_SETTINGS = JSON.parse(JSON.stringify(state.settings));
const DEFAULT_BRACKET = { rounds: [], name: '', autoTournament: false };

function applySettingsDefaults(rawSettings) {
  const incoming = (rawSettings && typeof rawSettings === 'object') ? rawSettings : {};
  const merged = { ...DEFAULT_SETTINGS, ...incoming };
  merged.layout = { ...DEFAULT_SETTINGS.layout, ...(incoming.layout || {}) };
  merged.autoRotation = { ...DEFAULT_SETTINGS.autoRotation, ...(incoming.autoRotation || {}) };
  merged.fontProfiles = { ...DEFAULT_SETTINGS.fontProfiles, ...(incoming.fontProfiles || {}) };
  return merged;
}

function applyBracketDefaults(rawBracket) {
  const incoming = (rawBracket && typeof rawBracket === 'object') ? rawBracket : {};
  return {
    ...DEFAULT_BRACKET,
    ...incoming,
    rounds: Array.isArray(incoming.rounds) ? incoming.rounds : [],
  };
}

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#7b2ff7"/><text x="40" y="52" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">?</text></svg>').toString('base64');

const FONT_WHITELIST = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Orbitron', 'Press Start 2P', 'Raleway', 'Oswald'];

function getClientState(includeSecrets = false) {
  const now = Date.now();
  return {
    matches: state.matches.map(m => ({
      ...m,
      timerElapsed: m.timerAccumulated + (m.timerRunning ? now - m.timerStartedAt : 0),
    })),
    history: state.history,
    settings: state.settings,
    bracket: state.bracket,
    startgg: includeSecrets
      ? { apiKey: state.startgg.apiKey, tournamentSlug: state.startgg.tournamentSlug }
      : { apiKey: '', tournamentSlug: state.startgg.tournamentSlug },
    games: state.games,
    players: state.players,
    gameSettings: state.gameSettings,
    serverTime: now,
  };
}

// ─── PERSISTENCE ────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
const BACKUP_MAX_KEEP = 100;

app.use('/avatars', express.static(AVATARS_DIR));

function ensureDataDir() {
  if (!fsSync.existsSync(DATA_DIR)) {
    fsSync.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fsSync.existsSync(AVATARS_DIR)) {
    fsSync.mkdirSync(AVATARS_DIR, { recursive: true });
  }
}

function sanitizeFilename(name) {
  if (!name) return '';
  return name
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

function extFromContentType(contentType) {
  const type = (contentType || '').toLowerCase();
  if (type.includes('image/png')) return 'png';
  if (type.includes('image/jpeg') || type.includes('image/jpg')) return 'jpg';
  if (type.includes('image/webp')) return 'webp';
  if (type.includes('image/gif')) return 'gif';
  return null;
}

async function saveAvatarBuffer(buffer, contentType, prefix = 'avatar') {
  ensureDataDir();
  const ext = extFromContentType(contentType);
  if (!ext) return null;
  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 12);
  const filename = `${prefix}-${Date.now()}-${hash}.${ext}`;
  const filepath = path.join(AVATARS_DIR, filename);
  await fs.writeFile(filepath, buffer);
  return `/avatars/${filename}`;
}

async function saveDataUrlAvatar(dataUrl, prefix = 'avatar', maxBytes = 500000) {
  const match = /^data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl || '');
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  const raw = Buffer.from(match[3], 'base64');
  if (raw.length > maxBytes) return null;
  return saveAvatarBuffer(raw, contentType, prefix);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.max(1, limit)).fill(null).map(async () => {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= items.length) break;
      results[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

async function pruneOldBackupFiles(maxKeep = BACKUP_MAX_KEEP) {
  ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const backupFiles = files.filter((f) => f.startsWith('backup-') && f.endsWith('.json'));
  if (backupFiles.length <= maxKeep) return 0;

  const withMtime = await mapWithConcurrency(backupFiles, 6, async (filename) => {
    try {
      const stats = await fs.stat(path.join(DATA_DIR, filename));
      return { filename, mtimeMs: stats.mtimeMs };
    } catch {
      return null;
    }
  });

  const sorted = withMtime
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toDelete = sorted.slice(maxKeep);

  await mapWithConcurrency(toDelete, 6, async (entry) => {
    try {
      await fs.unlink(path.join(DATA_DIR, entry.filename));
    } catch {
      // Ignore deletion failures for best-effort retention cleanup.
    }
  });

  return toDelete.length;
}

let avatarPruneTimer = null;

function getReferencedAvatarFilenames() {
  const files = new Set();
  if (Array.isArray(state.players)) {
    for (const p of state.players) {
      const a = (p && typeof p.avatar === 'string') ? p.avatar : '';
      if (!a.startsWith('/avatars/')) continue;
      const filename = a.slice('/avatars/'.length).trim();
      if (filename) files.add(filename);
    }
  }

  // Game backgrounds are also stored in /avatars and must be preserved.
  if (state.gameSettings && typeof state.gameSettings === 'object') {
    for (const gs of Object.values(state.gameSettings)) {
      const img = (gs && typeof gs.image === 'string') ? gs.image : '';
      if (!img.startsWith('/avatars/')) continue;
      const filename = img.slice('/avatars/'.length).trim();
      if (filename) files.add(filename);
    }
  }

  return files;
}

async function pruneOrphanAvatarFiles() {
  ensureDataDir();
  const referenced = getReferencedAvatarFilenames();
  const existing = await fs.readdir(AVATARS_DIR);
  const toDelete = existing.filter((f) => !referenced.has(f));
  await mapWithConcurrency(toDelete, 4, async (filename) => {
    try {
      await fs.unlink(path.join(AVATARS_DIR, filename));
    } catch {
      // Ignore deletion failures for best-effort cleanup.
    }
  });
}

function scheduleAvatarPrune(delayMs = 1500) {
  if (avatarPruneTimer) clearTimeout(avatarPruneTimer);
  avatarPruneTimer = setTimeout(() => {
    pruneOrphanAvatarFiles().catch(() => {});
  }, delayMs);
}

async function saveState() {
  const tempStateFile = `${STATE_FILE}.tmp`;
  try {
    ensureDataDir();
    const data = {
      ...state,
      savedAt: new Date().toISOString(),
      version: '2.0',
    };
    const serialized = JSON.stringify(data, null, 2);
    await fs.writeFile(tempStateFile, serialized);
    await fs.rename(tempStateFile, STATE_FILE);
    console.log(`✅ État sauvegardé: ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    try {
      await fs.unlink(tempStateFile);
    } catch {
      // No-op: temp file may not exist.
    }
    console.error('❌ Erreur sauvegarde:', error.message);
  }
}

function loadState() {
  try {
    if (!fsSync.existsSync(STATE_FILE)) return false;
    const data = JSON.parse(fsSync.readFileSync(STATE_FILE, 'utf8'));
    
    // Restore state but reset runtime properties
    state.matches = (data.matches || []).map(m => ({
      ...m,
      timerRunning: false,
      timerStartedAt: 0,
    }));
    state.history = data.history || [];
    state.settings = applySettingsDefaults(data.settings);
    // Migrate old single-value autoRotation to per-view object
    if (typeof state.settings.autoRotation === 'number') {
      const v = state.settings.autoRotation;
      state.settings.autoRotation = { matches: v, waiting: v, bracket: v };
    }
    state.bracket = applyBracketDefaults(data.bracket);
    state.startgg = data.startgg || state.startgg;
    state.games = data.games || [];
    state.players = data.players || [];
    state.gameSettings = data.gameSettings || {};
    
    console.log(`✅ État restauré depuis ${data.savedAt || 'date inconnue'}`);
    return true;
  } catch (error) {
    console.error('❌ Erreur restauration:', error.message);
    return false;
  }
}

function broadcast() {
  markStateDirty();
  io.emit('state:full', getClientState());
}

function normalizeRestoredMatch(m) {
  const match = (m && typeof m === 'object') ? m : {};
  const accumulated = Number(match.timerAccumulated) || 0;
  const startedAt = Number(match.timerStartedAt) || 0;
  const extraElapsed = (match.timerRunning && startedAt > 0)
    ? Math.max(0, Date.now() - startedAt)
    : 0;
  return {
    ...match,
    timerRunning: false,
    timerStartedAt: 0,
    timerAccumulated: accumulated + extraElapsed,
  };
}

// ─── TOURNAMENT HELPERS ─────────────────────────────────
function findBracketMatchByPlayers(player1Name, player2Name) {
  for (let roundIdx = 0; roundIdx < state.bracket.rounds.length; roundIdx++) {
    const round = state.bracket.rounds[roundIdx];
    for (let matchIdx = 0; matchIdx < round.length; matchIdx++) {
      const bm = round[matchIdx];
      if ((bm.player1 === player1Name && bm.player2 === player2Name) ||
          (bm.player1 === player2Name && bm.player2 === player1Name)) {
        return { roundIdx, matchIdx, match: bm };
      }
    }
  }
  return null;
}

function createMatchesFromBracket(roundIdx) {
  if (!state.bracket.rounds[roundIdx]) return [];
  
  const round = state.bracket.rounds[roundIdx];
  const createdMatches = [];
  
  for (const bm of round) {
    // Skip if already decided or has BYE
    if (bm.winner || bm.player1 === 'BYE' || bm.player2 === 'BYE' || bm.player1 === '?' || bm.player2 === '?') {
      continue;
    }
    
    // Check if match already exists
    const existingMatch = state.matches.find(m => 
      (m.player1.name === bm.player1 && m.player2.name === bm.player2) ||
      (m.player1.name === bm.player2 && m.player2.name === bm.player1)
    );
    
    if (!existingMatch) {
      const newMatch = {
        id: genId(),
        game: state.games[0] || 'Game',
        player1: { name: bm.player1, present: false },
        player2: { name: bm.player2, present: false },
        score1: 0,
        score2: 0,
        status: 'waiting',
        phase: 'waiting',
        winner: null,
        station: '',
        round: `Round ${roundIdx + 1}`,
        streaming: false,
        order: state.matches.length,
        timerDuration: 120,
        timerAccumulated: 0,
        timerRunning: false,
        timerStartedAt: 0,
        bracketMatch: { roundIdx, matchIdx: round.indexOf(bm) }
      };
      
      state.matches.push(newMatch);
      createdMatches.push(newMatch);
    }
  }
  
  return createdMatches;
}

function updateBracketFromMatch(match) {
  if (!match.bracketMatch || match.winner === null) return false;
  
  const { roundIdx, matchIdx } = match.bracketMatch;
  if (!state.bracket.rounds[roundIdx] || !state.bracket.rounds[roundIdx][matchIdx]) return false;
  
  const bm = state.bracket.rounds[roundIdx][matchIdx];
  bm.winner = match.winner;
  bm.score1 = match.score1;
  bm.score2 = match.score2;
  
  // Advance winner to next round
  const nextRound = roundIdx + 1;
  if (state.bracket.rounds[nextRound]) {
    const nextMatchIdx = Math.floor(matchIdx / 2);
    const slot = matchIdx % 2 === 0 ? 'player1' : 'player2';
    const winnerName = match.winner === 1 ? match.player1.name : match.player2.name;
    if (state.bracket.rounds[nextRound][nextMatchIdx]) {
      state.bracket.rounds[nextRound][nextMatchIdx][slot] = winnerName;
    }
  }
  
  return true;
}

// ─── AVATAR HELPERS ─────────────────────────────────────
async function urlToLocalAvatar(url, maxBytes = 500000) {
  try {
    const fetch = (await import('node-fetch')).default;
    const resp = await fetch(url, { timeout: 5000 });
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) return null;
    const buffer = await resp.buffer();
    if (buffer.length > maxBytes) return null;
    return saveAvatarBuffer(buffer, contentType, 'ext');
  } catch {
    return null;
  }
}

async function resolveAvatarInput(avatarInput, prefix = 'avatar') {
  if (!avatarInput || typeof avatarInput !== 'string') return DEFAULT_AVATAR;
  if (avatarInput.startsWith('/avatars/')) return avatarInput;
  if (avatarInput.startsWith('http://') || avatarInput.startsWith('https://')) {
    return (await urlToLocalAvatar(avatarInput)) || DEFAULT_AVATAR;
  }
  if (avatarInput.startsWith('data:image/')) {
    return (await saveDataUrlAvatar(avatarInput, prefix)) || DEFAULT_AVATAR;
  }
  return DEFAULT_AVATAR;
}

async function resolveGameImageInput(imageInput) {
  if (!imageInput || typeof imageInput !== 'string') return null;
  if (imageInput.startsWith('/avatars/')) return imageInput;
  if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
    // Game artworks are often larger than player avatars.
    return await urlToLocalAvatar(imageInput, 5_000_000);
  }
  if (imageInput.startsWith('data:image/')) {
    return await saveDataUrlAvatar(imageInput, 'game', 5_000_000);
  }
  return null;
}

async function migrateStoredPlayerAvatars(prefix = 'migrated') {
  if (!Array.isArray(state.players) || state.players.length === 0) return false;
  let changed = false;
  state.players = await mapWithConcurrency(state.players, 4, async (player, index) => {
    if (!player || typeof player !== 'object') return player;
    const current = typeof player.avatar === 'string' ? player.avatar : '';
    if (!current || current.startsWith('/avatars/') || current === DEFAULT_AVATAR) return player;
    const migrated = await resolveAvatarInput(current, `${prefix}-${index}`);
    if (migrated !== current) changed = true;
    return { ...player, avatar: migrated };
  });
  return changed;
}

// ─── SOCKET.IO ──────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.emit('state:full', getClientState());

  // Allow settings page to request secrets
  socket.on('request:fullState', () => {
    socket.emit('state:full', getClientState(true));
  });

  // --- Match CRUD ---
  socket.on('match:create', (data) => {
    try {
      if (!data || typeof data !== 'object') {
        console.warn('⚠ match:create received invalid data type');
        return;
      }
      // Input validation
      const sanitize = (s, max = 50) => (typeof s === 'string' ? s : '').trim().substring(0, max);
      const game = sanitize(data.game, 80) || 'Autre';
      const p1 = sanitize(data.player1, 50) || 'Joueur 1';
      const p2 = sanitize(data.player2, 50) || 'Joueur 2';
      const station = sanitize(data.station, 30);
      const round = sanitize(data.round, 40);
      const initialStatus = data.status || 'waiting';
      if (!['waiting', 'active', 'cancelled'].includes(initialStatus)) {
        console.warn('⚠ match:create invalid status:', initialStatus);
        return;
      }
      const match = {
        id: genId(),
        game,
        player1: { name: p1, present: false },
        player2: { name: p2, present: false },
        score1: 0,
        score2: 0,
        status: initialStatus,
        winner: null,
        phase: initialStatus === 'active' ? 'calling' : null,
        timerRunning: initialStatus === 'active',
        timerStartedAt: initialStatus === 'active' ? Date.now() : 0,
        timerAccumulated: 0,
        timerDuration: Math.max(10, Math.min(600, parseInt(data.timerDuration) || 120)),
        station,
        round,
        streaming: !!data.streaming,
        order: state.matches.filter(m => m.status === initialStatus).length,
        createdAt: Date.now(),
      };
      state.matches.push(match);
      if (data.game && !state.games.includes(data.game)) {
        state.games.push(data.game);
      }
      broadcast();
    } catch (err) {
      console.error('❌ match:create error:', err.message);
    }
  });

  socket.on('match:update', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const idx = state.matches.findIndex(m => m.id === data.id);
      if (idx === -1) return;
      const match = state.matches[idx];
      // Whitelist updatable fields with type validation
      const allowed = ['game', 'station', 'round', 'score1', 'score2', 'status', 'order', 'streaming'];
      for (const key of allowed) {
        if (data[key] !== undefined) {
          if (key === 'streaming') {
            match[key] = !!data[key];
          } else if (key === 'score1' || key === 'score2' || key === 'order') {
            match[key] = Math.max(0, parseInt(data[key]) || 0);
          } else if (typeof data[key] === 'string') {
            match[key] = data[key].substring(0, key === 'round' ? 40 : 80);
          }
        }
      }
      if (data.player1 && typeof data.player1 === 'object') match.player1 = { ...match.player1, ...data.player1 };
      if (data.player2 && typeof data.player2 === 'object') match.player2 = { ...match.player2, ...data.player2 };
      broadcast();
    } catch (err) {
      console.error('❌ match:update error:', err.message);
    }
  });

  socket.on('match:delete', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      if (state.settings.highlightMatchId === data.id) state.settings.highlightMatchId = null;
      state.matches = state.matches.filter(m => m.id !== data.id);
      broadcast();
    } catch (err) {
      console.error('❌ match:delete error:', err.message);
    }
  });

  socket.on('match:presence', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match || match.phase !== 'calling') return;
      const player = parseInt(data.player);
      if (player === 1) match.player1.present = !match.player1.present;
      else if (player === 2) match.player2.present = !match.player2.present;
      broadcast();
    } catch (err) {
      console.error('❌ match:presence error:', err.message);
    }
  });

  socket.on('match:score', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match || match.phase !== 'playing') return;
      const delta = Number(data.delta) || 0;
      if (data.player === 1) match.score1 = Math.max(0, match.score1 + delta);
      if (data.player === 2) match.score2 = Math.max(0, match.score2 + delta);
      broadcast();
    } catch (err) {
      console.error('❌ match:score error:', err.message);
    }
  });

  socket.on('match:activate', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match) return;
      match.status = 'active';
      match.phase = 'calling';
      match.player1.present = false;
      match.player2.present = false;
      match.timerRunning = true;
      match.timerStartedAt = Date.now();
      match.timerAccumulated = 0;
      broadcast();
    } catch (err) {
      console.error('❌ match:activate error:', err.message);
    }
  });

  socket.on('match:toQueue', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match) return;
      match.status = 'waiting';
      match.phase = null;
      match.winner = null;
      if (match.timerRunning) {
        match.timerAccumulated += Date.now() - match.timerStartedAt;
      }
      match.timerRunning = false;
      match.timerAccumulated = 0;
      broadcast();
    } catch (err) {
      console.error('❌ match:toQueue error:', err.message);
    }
  });

  // --- Match Workflow: Launch, Declare, Validate, Forfeit, Cancel, Restore ---
  socket.on('match:launch', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match || match.phase !== 'calling') return;
      if (!match.player1.present || !match.player2.present) return;
      match.phase = 'playing';
      if (match.timerRunning) {
        match.timerAccumulated += Date.now() - match.timerStartedAt;
      }
      match.timerRunning = true;
      match.timerStartedAt = Date.now();
      match.timerAccumulated = 0;
      broadcast();
    } catch (err) {
      console.error('❌ match:launch error:', err.message);
    }
  });

  socket.on('match:declareWinner', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match || (match.phase !== 'playing' && match.phase !== 'calling')) return;
      const winner = parseInt(data.winner);
      if (winner !== 1 && winner !== 2) return;
      match.phase = 'decided';
      match.winner = winner; // 1 or 2
      if (match.timerRunning) {
        match.timerAccumulated += Date.now() - match.timerStartedAt;
        match.timerRunning = false;
      }
      // Mark match as part of bracket if in auto tournament mode
      if (state.bracket.autoTournament && match.bracketMatch) {
        match.bracketMatch = true;
      }
      broadcast();
    } catch (err) {
      console.error('❌ match:declareWinner error:', err.message);
    }
  });

  socket.on('match:undeclare', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match || match.phase !== 'decided') return;
      match.phase = 'playing';
      match.winner = null;
      broadcast();
    } catch (err) {
      console.error('❌ match:undeclare error:', err.message);
    }
  });

  socket.on('match:validate', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match || match.phase !== 'decided') return;
      
      // Update bracket if in auto tournament mode
      if (state.bracket.autoTournament && match.bracketMatch) {
        try {
          updateBracketFromMatch(match);
        } catch (e) {
          console.error('⚠ updateBracketFromMatch failed:', e.message);
        }
      }
      
      state.history.unshift({
        id: genId(),
        game: match.game,
        player1: match.player1.name,
        player2: match.player2.name,
        score1: match.score1,
        score2: match.score2,
        winner: match.winner,
        station: match.station,
        round: match.round,
        streaming: match.streaming || false,
        finishedAt: Date.now(),
      });
      state.matches = state.matches.filter(m => m.id !== match.id);
      // Clear highlight if this match was highlighted
      if (state.settings.highlightMatchId === match.id) state.settings.highlightMatchId = null;
      broadcast();
    } catch (err) {
      console.error('❌ match:validate error:', err.message);
    }
  });

  socket.on('match:forfeit', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match || match.phase !== 'calling') return;
      const p1 = match.player1.present;
      const p2 = match.player2.present;
      if (p1 && p2) return;
      if (!p1 && !p2) return;
      if (match.timerRunning) {
        match.timerAccumulated += Date.now() - match.timerStartedAt;
        match.timerRunning = false;
      }
      match.phase = 'decided';
      match.winner = p1 ? 1 : 2;
      match.forfeit = true;
      broadcast();
    } catch (err) {
      console.error('❌ match:forfeit error:', err.message);
    }
  });

  socket.on('match:toggleStream', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match) return;
      match.streaming = !match.streaming;
      broadcast();
    } catch (err) {
      console.error('❌ match:toggleStream error:', err.message);
    }
  });

  socket.on('match:cancel', (data) => {
    const matchId = data && data.id;
    if (!matchId || typeof matchId !== 'string') return;
    const match = state.matches.find(m => m.id === matchId);
    if (!match) return;
    if (state.settings.highlightMatchId === matchId) state.settings.highlightMatchId = null;
    match.status = 'cancelled';
    match.cancelledAt = Date.now();
    broadcast();
    setTimeout(() => {
      // Safety guard: verify match still exists before removal
      const stillExists = state.matches.some(m => m.id === matchId);
      if (stillExists) {
        state.matches = state.matches.filter(m => m.id !== matchId);
        broadcast();
      }
    }, 3000);
  });

  socket.on('match:restore', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const hIdx = state.history.findIndex(h => h.id === data.id);
      if (hIdx === -1) return;
      const h = state.history[hIdx];
      const match = {
        id: genId(),
        game: h.game,
        player1: { name: h.player1, present: true },
        player2: { name: h.player2, present: true },
        score1: h.score1,
        score2: h.score2,
        status: 'active',
        winner: null,
        phase: 'playing',
        timerRunning: false,
        timerStartedAt: 0,
        timerAccumulated: 0,
        timerDuration: 120,
        station: h.station || '',
        round: h.round || '',
        streaming: !!h.streaming,
        order: state.matches.filter(m => m.status === 'active').length,
        createdAt: Date.now(),
      };
      state.matches.unshift(match);
      if (h.game && !state.games.includes(h.game)) {
        state.games.push(h.game);
      }
      state.history.splice(hIdx, 1);
      broadcast();
    } catch (err) {
      console.error('❌ match:restore error:', err.message);
    }
  });

  // --- Timer ---
  socket.on('timer:start', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match) return;
      match.timerRunning = true;
      match.timerStartedAt = Date.now();
      broadcast();
    } catch (err) {
      console.error('❌ timer:start error:', err.message);
    }
  });

  socket.on('timer:stop', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match) return;
      if (match.timerRunning) {
        match.timerAccumulated += Date.now() - match.timerStartedAt;
        match.timerRunning = false;
      }
      broadcast();
    } catch (err) {
      console.error('❌ timer:stop error:', err.message);
    }
  });

  socket.on('timer:reset', (data) => {
    try {
      if (!data || !data.id || typeof data.id !== 'string') return;
      const match = state.matches.find(m => m.id === data.id);
      if (!match) return;
      match.timerRunning = false;
      match.timerStartedAt = 0;
      match.timerAccumulated = 0;
      broadcast();
    } catch (err) {
      console.error('❌ timer:reset error:', err.message);
    }
  });

  // --- Settings ---
  socket.on('settings:layout', (data) => {
    try {
      if (!data || typeof data !== 'object') return;
      const rows = parseInt(data.rows) || 2;
      const cols = parseInt(data.cols) || 2;
      if (rows >= 1 && rows <= 3 && cols >= 1 && cols <= 3) {
        state.settings.layout = { rows, cols };
        broadcast();
      }
    } catch (err) {
      console.error('❌ settings:layout error:', err.message);
    }
  });

  socket.on('settings:displayMode', (data) => {
    try {
      if (!data || !data.mode || typeof data.mode !== 'string') return;
      if (['matches', 'waiting', 'bracket'].includes(data.mode)) {
        state.settings.displayMode = data.mode;
        broadcast();
      }
    } catch (err) {
      console.error('❌ settings:displayMode error:', err.message);
    }
  });

  socket.on('settings:highlight', (data) => {
    try {
      const matchId = (data && data.matchId) || null;
      if (matchId && (typeof matchId !== 'string' || !state.matches.find(m => m.id === matchId))) return;
      state.settings.highlightMatchId = matchId;
      broadcast();
    } catch (err) {
      console.error('❌ settings:highlight error:', err.message);
    }
  });

  socket.on('settings:sncfBlue', (data) => {
    try {
      state.settings.sncfBlueMode = !!(data && data.enabled);
      broadcast();
    } catch (err) {
      console.error('❌ settings:sncfBlue error:', err.message);
    }
  });

  socket.on('settings:avatarSize', (data) => {
    try {
      const size = parseInt(data);
      if (!isNaN(size) && size >= 0 && size <= 80) {
        state.settings.avatarSize = size;
      }
      broadcast();
    } catch (err) {
      console.error('❌ settings:avatarSize error:', err.message);
    }
  });

  socket.on('settings:accentColor', (data) => {
    try {
      const hex = (data || '').trim();
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        state.settings.accentColor = hex;
        broadcast();
      }
    } catch (err) {
      console.error('❌ settings:accentColor error:', err.message);
    }
  });

  socket.on('settings:fontFamily', (data) => {
    try {
      const font = (data || '').trim();
      if (FONT_WHITELIST.includes(font)) {
        state.settings.fontFamily = font;
        broadcast();
      }
    } catch (err) {
      console.error('❌ settings:fontFamily error:', err.message);
    }
  });

  socket.on('settings:autoRotation', (data) => {
    try {
      if (typeof data !== 'object' || !data) return;
      const modes = ['matches', 'waiting', 'bracket'];
      for (const mode of modes) {
        if (data[mode] !== undefined) {
          const seconds = parseInt(data[mode]);
          if (!isNaN(seconds) && seconds >= 0 && seconds <= 300) {
            state.settings.autoRotation[mode] = seconds;
          }
        }
      }
      broadcast();
    } catch (err) {
      console.error('❌ settings:autoRotation error:', err.message);
    }
  });

  socket.on('settings:rotationEnabled', (data) => {
    try {
      state.settings.rotationEnabled = !!data;
      broadcast();
    } catch (err) {
      console.error('❌ settings:rotationEnabled error:', err.message);
    }
  });

  socket.on('settings:autoSaveInterval', (data) => {
    try {
      const seconds = parseInt(data);
      if (!isNaN(seconds) && seconds >= 10 && seconds <= 600) {
        state.settings.autoSaveInterval = seconds;
        restartAutoSave();
        broadcast();
      }
    } catch (err) {
      console.error('❌ settings:autoSaveInterval error:', err.message);
    }
  });

  socket.on('games:updateSettings', (data) => {
    try {
      if (!data || typeof data !== 'object') return;
      const name = (data.name || '').trim();
      if (!name || !state.games.includes(name)) return;
      const gs = state.gameSettings[name] || {};
      if (data.color !== undefined) {
        gs.color = /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : '';
      }
      if (data.image !== undefined) {
        gs.image = (data.image && data.image.length < 2000000 && /^data:image\/(png|jpe?g|gif|webp);/.test(data.image)) ? data.image : '';
      }
      if (data.imageOpacity !== undefined) {
        gs.imageOpacity = Math.max(0, Math.min(1, parseFloat(data.imageOpacity) || 0.3));
      }
      state.gameSettings[name] = gs;
      if (data.image !== undefined) scheduleAvatarPrune();
      broadcast();
    } catch (err) {
      console.error('❌ games:updateSettings error:', err.message);
    }
  });

  socket.on('settings:font', (data) => {
    const FONT_PROPS = ['matchTitle','playerName','score','timer','header','queue','vs','sncfHeader','sncfRow','sncfGame','sncfStatus','bracketTitle','bracketName','bracketScore','bracketRound'];
    const key = `${state.settings.layout.rows}x${state.settings.layout.cols}`;
    if (state.settings.fontProfiles[key] && FONT_PROPS.includes(data.property)) {
      state.settings.fontProfiles[key][data.property] = data.value;
    }
    broadcast();
  });

  // --- Bracket ---
  socket.on('bracket:update', (data) => {
    state.bracket = data;
    broadcast();
  });

  socket.on('bracket:generate', (data) => {
    const players = data.players || [];
    const name = data.name || 'Bracket';
    // Pad to next power of 2
    let size = 1;
    while (size < players.length) size *= 2;
    const padded = [...players];
    while (padded.length < size) padded.push(null); // BYE

    const rounds = [];
    // Round 1
    const r1 = [];
    for (let i = 0; i < padded.length; i += 2) {
      const isBye = !padded[i] || !padded[i + 1];
      r1.push({
        id: genId(),
        player1: padded[i] || 'BYE',
        player2: padded[i + 1] || 'BYE',
        score1: 0, score2: 0,
        winner: isBye ? (padded[i] ? 1 : 2) : null,
      });
    }
    rounds.push(r1);

    // Subsequent rounds
    let prev = r1;
    while (prev.length > 1) {
      const round = [];
      for (let i = 0; i < prev.length; i += 2) {
        round.push({
          id: genId(),
          player1: prev[i].winner ? (prev[i].winner === 1 ? prev[i].player1 : prev[i].player2) : '?',
          player2: prev[i + 1] && prev[i + 1].winner ? (prev[i + 1].winner === 1 ? prev[i + 1].player1 : prev[i + 1].player2) : '?',
          score1: 0, score2: 0,
          winner: null,
        });
      }
      rounds.push(round);
      prev = round;
    }

    state.bracket = { rounds, name };
    broadcast();
  });

  socket.on('bracket:matchResult', (data) => {
    const { roundIdx, matchIdx, winner } = data;
    if (!state.bracket.rounds[roundIdx] || !state.bracket.rounds[roundIdx][matchIdx]) return;
    const bm = state.bracket.rounds[roundIdx][matchIdx];
    bm.winner = winner;
    if (data.score1 !== undefined) bm.score1 = data.score1;
    if (data.score2 !== undefined) bm.score2 = data.score2;

    // Advance winner to next round
    const nextRound = roundIdx + 1;
    if (state.bracket.rounds[nextRound]) {
      const nextMatchIdx = Math.floor(matchIdx / 2);
      const slot = matchIdx % 2 === 0 ? 'player1' : 'player2';
      const winnerName = winner === 1 ? bm.player1 : bm.player2;
      if (state.bracket.rounds[nextRound][nextMatchIdx]) {
        state.bracket.rounds[nextRound][nextMatchIdx][slot] = winnerName;
      }
    }
    broadcast();
  });

  // --- Start.gg ---
  socket.on('startgg:configure', (data) => {
    state.startgg.apiKey = data.apiKey || '';
    state.startgg.tournamentSlug = data.tournamentSlug || '';
    broadcast();
  });

  socket.on('startgg:setData', async (data) => {
    if (data.games) state.games = data.games;
    if (data.players) {
      const players = await mapWithConcurrency(data.players, 4, async (p) => {
        if (typeof p === 'string') {
          return { id: genId(), name: p, avatar: DEFAULT_AVATAR, games: [] };
        }
        const avatar = await resolveAvatarInput(p.avatar, 'startgg');
        return { id: p.id || genId(), name: p.name, avatar, games: Array.isArray(p.games) ? p.games : [] };
      });
      state.players = players;
      scheduleAvatarPrune();
    }
    broadcast();
  });

  // --- Games CRUD ---
  socket.on('games:add', async (data) => {
    const name = (data.name || '').trim();
    if (!name || state.games.includes(name)) return;
    state.games.push(name);
    // If Start.gg provided a game image, save it
    if (data.startggImage && typeof data.startggImage === 'string') {
      try {
        const localPath = await resolveGameImageInput(data.startggImage);
        if (localPath) {
          const gs = state.gameSettings[name] || {};
          gs.image = localPath;
          gs.imageOpacity = gs.imageOpacity || 0.3;
          state.gameSettings[name] = gs;
        }
      } catch (e) { /* ignore failed image download */ }
    }
    broadcast();
  });

  socket.on('games:delete', (data) => {
    state.games = state.games.filter(g => g !== data.name);
    delete state.gameSettings[data.name];
    scheduleAvatarPrune();
    broadcast();
  });

  socket.on('games:rename', (data) => {
    const oldName = (data.oldName || '').trim();
    const newName = (data.newName || '').trim();
    if (!oldName || !newName || oldName === newName) return;
    if (!state.games.includes(oldName)) return;
    if (state.games.includes(newName)) return;
    const idx = state.games.indexOf(oldName);
    state.games[idx] = newName;
    // Propagate rename to all matches
    state.matches.forEach(m => { if (m.game === oldName) m.game = newName; });
    state.history.forEach(h => { if (h.game === oldName) h.game = newName; });
    if (state.gameSettings[oldName]) {
      state.gameSettings[newName] = state.gameSettings[oldName];
      delete state.gameSettings[oldName];
    }
    broadcast();
  });

  // --- Players CRUD ---
  socket.on('players:add', async (data) => {
    const name = (data.name || '').trim();
    if (!name) return;
    const avatar = await resolveAvatarInput(data.avatar, 'player');
    state.players.push({ id: genId(), name, avatar });
    broadcast();
  });

  socket.on('players:update', async (data, callback) => {
    const player = state.players.find(p => p.id === data.id);
    if (!player) { if (typeof callback === 'function') callback({ ok: false }); return; }
    if (data.name) player.name = data.name.trim();
    if (data.avatar !== undefined) {
      player.avatar = await resolveAvatarInput(data.avatar, `player-${data.id || 'u'}`);
      scheduleAvatarPrune();
    }
    if (data.games && Array.isArray(data.games)) player.games = data.games;
    broadcast();
    if (typeof callback === 'function') callback({ ok: true });
  });

  socket.on('players:delete', (data) => {
    state.players = state.players.filter(p => p.id !== data.id);
    scheduleAvatarPrune();
    broadcast();
  });

  // --- Backup & Restore ---
  socket.on('state:backup', async (data) => {
    let tempBackupPath = '';
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedName = sanitizeFilename(data.name);
      const filename = sanitizedName ? `backup-${sanitizedName}-${timestamp}.json` : `backup-${timestamp}.json`;
      const backupPath = path.join(DATA_DIR, filename);
      tempBackupPath = `${backupPath}.tmp`;
      
      ensureDataDir();
      const backupData = {
        ...state,
        savedAt: new Date().toISOString(),
        version: '2.0',
        backupName: sanitizedName || 'Manuel',
        backupType: 'manual',
      };
      
      const serialized = JSON.stringify(backupData, null, 2);
      await fs.writeFile(tempBackupPath, serialized);
      await fs.rename(tempBackupPath, backupPath);
      const removed = await pruneOldBackupFiles();
      if (removed > 0) {
        console.log(`🧹 Backups anciens supprimés: ${removed}`);
      }
      socket.emit('backup:success', { filename, path: backupPath });
      console.log(`✅ Backup créé: ${filename}`);
    } catch (error) {
      try {
        if (tempBackupPath) await fs.unlink(tempBackupPath);
      } catch {
        // No-op: temporary backup may not exist.
      }
      socket.emit('backup:error', { message: error.message });
      console.error('❌ Erreur backup:', error.message);
    }
  });

  socket.on('state:restore', async (data) => {
    try {
      const sanitizedFilename = sanitizeFilename(data.filename);
      if (!sanitizedFilename || !sanitizedFilename.match(/^backup-.*\.json$/)) {
        socket.emit('restore:error', { message: 'Nom de fichier invalide' });
        return;
      }
      
      const backupPath = path.join(DATA_DIR, sanitizedFilename);
      // Path traversal protection
      const resolved = path.resolve(backupPath);
      if (!resolved.startsWith(path.resolve(DATA_DIR))) {
        socket.emit('restore:error', { message: 'Chemin invalide' });
        return;
      }
      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
      
      // Restore state but reset runtime properties
      state.matches = (backupData.matches || []).map(normalizeRestoredMatch);
      state.history = backupData.history || [];
      state.settings = applySettingsDefaults(backupData.settings);
      state.bracket = applyBracketDefaults(backupData.bracket);
      state.startgg = backupData.startgg || state.startgg;
      state.games = backupData.games || [];
      state.players = backupData.players || [];
      state.gameSettings = backupData.gameSettings || {};
      await migrateStoredPlayerAvatars('restore');
      scheduleAvatarPrune();
      
      broadcast();
      socket.emit('restore:success', { filename: sanitizedFilename, savedAt: backupData.savedAt });
      console.log(`✅ État restauré depuis: ${sanitizedFilename}`);
    } catch (error) {
      socket.emit('restore:error', { message: error.message });
      console.error('❌ Erreur restauration:', error.message);
    }
  });

  socket.on('state:list-backups', async () => {
    try {
      ensureDataDir();
      const files = await fs.readdir(DATA_DIR);
      const backups = [];
      
      for (const f of files.filter(f => f.endsWith('.json') && f.startsWith('backup-'))) {
        try {
          const filepath = path.join(DATA_DIR, f);
          const stats = await fs.stat(filepath);
          const content = JSON.parse(await fs.readFile(filepath, 'utf8'));
          backups.push({
            filename: f,
            size: stats.size,
            created: stats.mtime,
            savedAt: content.savedAt,
            backupName: content.backupName || 'Sans nom',
            matchCount: (content.matches || []).length,
            playerCount: (content.players || []).length,
          });
        } catch {
          // Skip corrupted files
        }
      }
      
      backups.sort((a, b) => new Date(b.created) - new Date(a.created));
      socket.emit('backups:list', backups);
    } catch (error) {
      socket.emit('backups:error', { message: error.message });
      console.error('❌ Erreur liste backups:', error.message);
    }
  });

  // --- Fake Data Generator ---
  socket.on('data:generateFake', () => {
    const fakeGames = ['Street Fighter 6', 'Tekken 8', 'Guilty Gear Strive', 'Super Smash Bros. Ultimate', 'Mortal Kombat 1', 'Dragon Ball FighterZ'];
    const fakeNames = ['SonicFox', 'MenaRD', 'Tokido', 'Punk', 'Daigo', 'Knee', 'JDCR', 'Arslan Ash', 'MkLeo', 'Tweek', 'Light', 'Sparg0', 'Marss', 'Nairo', 'Leffen', 'HungryBox'];
    const stations = ['Setup A', 'Setup B', 'Setup C', 'Setup D', 'Stream'];
    const rounds = ['Winners R1', 'Winners R2', 'Winners QF', 'Winners SF', 'Losers R1', 'Losers R2', 'Grand Final'];

    // Set games
    state.games = [...fakeGames];

    // Game settings (colors)
    state.gameSettings = {
      'Street Fighter 6': { color: '#e74c3c', image: '', imageOpacity: 0.3 },
      'Tekken 8': { color: '#3498db', image: '', imageOpacity: 0.3 },
      'Guilty Gear Strive': { color: '#e67e22', image: '', imageOpacity: 0.3 },
      'Super Smash Bros. Ultimate': { color: '#2ecc71', image: '', imageOpacity: 0.3 },
      'Mortal Kombat 1': { color: '#f39c12', image: '', imageOpacity: 0.3 },
      'Dragon Ball FighterZ': { color: '#9b59b6', image: '', imageOpacity: 0.3 },
    };

    // Set players
    state.players = fakeNames.map(name => ({ id: genId(), name, avatar: DEFAULT_AVATAR }));

    // Generate active matches (4)
    const activeMatches = [];
    for (let i = 0; i < 4; i++) {
      const p1Idx = i * 2;
      const p2Idx = i * 2 + 1;
      activeMatches.push({
        id: genId(),
        game: fakeGames[i % fakeGames.length],
        player1: { name: fakeNames[p1Idx], present: true },
        player2: { name: fakeNames[p2Idx], present: true },
        score1: Math.floor(Math.random() * 3),
        score2: Math.floor(Math.random() * 3),
        status: 'active',
        winner: null,
        phase: 'playing',
        timerRunning: i < 2,
        timerStartedAt: i < 2 ? Date.now() - Math.floor(Math.random() * 300000) : 0,
        timerAccumulated: i >= 2 ? Math.floor(Math.random() * 180000) : 0,
        timerDuration: 120,
        station: stations[i],
        round: rounds[i],
        streaming: stations[i] === 'Stream',
        order: i,
        createdAt: Date.now() - i * 60000,
      });
    }

    // Generate waiting matches (4)
    const waitingMatches = [];
    for (let i = 0; i < 4; i++) {
      const p1Idx = 8 + i * 2;
      const p2Idx = 8 + i * 2 + 1;
      const st = stations[(i + 2) % stations.length];
      waitingMatches.push({
        id: genId(),
        game: fakeGames[(i + 2) % fakeGames.length],
        player1: { name: fakeNames[p1Idx % fakeNames.length], present: false },
        player2: { name: fakeNames[p2Idx % fakeNames.length], present: false },
        score1: 0,
        score2: 0,
        status: 'waiting',
        winner: null,
        phase: null,
        timerRunning: false,
        timerStartedAt: 0,
        timerAccumulated: 0,
        timerDuration: 120,
        station: st,
        round: rounds[(i + 4) % rounds.length],
        streaming: st === 'Stream',
        order: i,
        createdAt: Date.now() - (i + 4) * 60000,
      });
    }

    state.matches = [...activeMatches, ...waitingMatches];

    // Generate history (3 finished)
    state.history = [
      { id: genId(), game: fakeGames[0], player1: 'Tokido', player2: 'Daigo', score1: 3, score2: 1, winner: 1, station: 'Stream', round: 'Winners SF', streaming: true, finishedAt: Date.now() - 600000 },
      { id: genId(), game: fakeGames[1], player1: 'Knee', player2: 'JDCR', score1: 2, score2: 3, winner: 2, station: 'Setup A', round: 'Winners R1', streaming: false, finishedAt: Date.now() - 1200000 },
      { id: genId(), game: fakeGames[2], player1: 'SonicFox', player2: 'MenaRD', score1: 3, score2: 0, winner: 1, station: 'Stream', round: 'Grand Final', streaming: true, finishedAt: Date.now() - 1800000 },
    ];

    // Generate bracket (8 players)
    const bracketPlayers = fakeNames.slice(0, 8);
    const bracketRounds = [];
    const r1 = [];
    for (let i = 0; i < bracketPlayers.length; i += 2) {
      r1.push({ id: genId(), player1: bracketPlayers[i], player2: bracketPlayers[i + 1], score1: 0, score2: 0, winner: null });
    }
    bracketRounds.push(r1);
    // R2
    bracketRounds.push([
      { id: genId(), player1: '?', player2: '?', score1: 0, score2: 0, winner: null },
      { id: genId(), player1: '?', player2: '?', score1: 0, score2: 0, winner: null },
    ]);
    // Final
    bracketRounds.push([
      { id: genId(), player1: '?', player2: '?', score1: 0, score2: 0, winner: null },
    ]);
    state.bracket = { rounds: bracketRounds, name: 'Bracket Principal', autoTournament: false };

    broadcast();
  });

  // --- Data Reset ---
  socket.on('data:reset', (data) => {
    try {
      const validTargets = ['all', 'matches', 'history', 'bracket', 'games', 'players'];
      const target = data && data.target;
      if (!target || !validTargets.includes(target)) return;

      if (target === 'all' || target === 'matches') {
        state.matches = [];
      }
      if (target === 'all' || target === 'history') {
        state.history = [];
      }
      if (target === 'all' || target === 'bracket') {
        state.bracket = { ...DEFAULT_BRACKET };
      }
      if (target === 'all' || target === 'games') {
        state.games = [];
        state.gameSettings = {};
      }
      if (target === 'all' || target === 'players') {
        state.players = [];
      }
      if (target === 'all') {
        state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        state.startgg = { apiKey: '', tournamentSlug: '' };
      }
      broadcast();
      scheduleAutoSave(true);
      console.log('✅ État réinitialisé:', target);
    } catch (err) {
      console.error('❌ data:reset error:', err.message);
    }
  });

  // --- History ---
  socket.on('history:clear', () => {
    state.history = [];
    broadcast();
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  // --- Tournament Automation ---
  socket.on('tournament:toggleAuto', (data) => {
    state.bracket.autoTournament = !state.bracket.autoTournament;
    broadcast();
  });

  socket.on('tournament:createRoundMatches', (data) => {
    if (!state.bracket.autoTournament) return;
    const roundIdx = data.roundIdx;
    if (!state.bracket.rounds[roundIdx]) return;
    
    const createdMatches = createMatchesFromBracket(roundIdx);
    socket.emit('tournament:matchesCreated', { 
      count: createdMatches.length, 
      round: roundIdx 
    });
  });

  socket.on('bracket:syncFromMatch', (data) => {
    const match = state.matches.find(m => m.id === data.matchId);
    if (!match || match.phase !== 'decided') return;
    
    updateBracketFromMatch(match);
    socket.emit('bracket:syncCompleted', { matchId: data.matchId });
  });
});

// ─── START.GG API PROXY ─────────────────────────────────
app.post('/api/startgg', async (req, res) => {
  const { query, variables, apiKey } = req.body;
  if (!apiKey || !query) {
    return res.status(400).json({ error: 'Missing apiKey or query' });
  }
  // Block mutations — only allow read queries
  const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
  if (normalized.startsWith('mutation')) {
    return res.status(403).json({ error: 'Mutations not allowed' });
  }
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.start.gg/gql/alpha', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── START ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// Initialize state from saved data
loadState();

// Migrate legacy avatars (data URLs / external URLs) to local files in background.
(async () => {
  try {
    const changed = await migrateStoredPlayerAvatars('state');
    if (changed) {
      await saveState();
      broadcast();
      console.log('🖼️ Avatars migrés vers des fichiers locaux');
    }
    scheduleAvatarPrune(500);
    const removed = await pruneOldBackupFiles();
    if (removed > 0) {
      console.log(`🧹 Backups anciens supprimés au démarrage: ${removed}`);
    }
  } catch (error) {
    console.error('⚠️ Migration avatars ignorée:', error.message);
  }
})();

// Auto-save (non-concurrent, configurable interval)
let saveInterval;
let isSaving = false;
let savePending = false;
let saveDebounceTimer = null;

function markStateDirty() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    scheduleAutoSave().catch(() => {});
  }, 1200);
}

async function scheduleAutoSave(force = false) {
  if (isSaving && !force) {
    savePending = true;
    return;
  }
  isSaving = true;
  try {
    await saveState();
    if (savePending) {
      savePending = false;
      await saveState();
    }
  } finally {
    isSaving = false;
  }
}

function restartAutoSave() {
  if (saveInterval) clearInterval(saveInterval);
  const ms = (state.settings.autoSaveInterval || 30) * 1000;
  saveInterval = setInterval(scheduleAutoSave, ms);
  console.log(`🔄 Auto-save: toutes les ${state.settings.autoSaveInterval || 30}s`);
}

restartAutoSave();

// Cleanup on process exit
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du serveur...');
  clearInterval(saveInterval);
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  scheduleAutoSave(true).then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du serveur (SIGTERM)...');
  clearInterval(saveInterval);
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  scheduleAutoSave(true).then(() => {
    process.exit(0);
  });
});

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n  ==========================================`);
  console.log(`       DOJO SHOW 2.0 - Serveur`);
  console.log(`  ==========================================`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Reseau:  http://${ip}:${PORT}`);
  console.log(`  ------------------------------------------`);
  console.log(`  Les autres organisateurs peuvent ouvrir`);
  console.log(`  l'adresse reseau dans leur navigateur.`);
  console.log(`  ==========================================\n`);
});

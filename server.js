#!/usr/bin/env node
/**
 * A2A-Mesh Hub Server (Production)
 * Zero-dependency standalone Express server for multi-agent mesh communication.
 * Supports:
 *  - REST API for tools/a2a.js CLI
 *  - Real-time Server-Sent Events (SSE) stream on /api/events
 *  - File locking with TTL and conflict detection
 *  - Task claim/release/done workflow with lease management
 *  - Code snippets repository
 *  - Transcript export (Markdown / JSON)
 *  - CORS enabled for LAN cross-origin access
 *  - Binds to 0.0.0.0 for LAN & WAN network access
 */
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 7777;
const HOST = '0.0.0.0';

// Enable body parsing
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// CORS middleware for LAN access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// State storage
let nextMsgId = 1;
const peers = new Map(); // name -> { name, room, token, capabilities, lastSeen }
const messages = [];     // Array of { id, ts, from, to, type, text, room, replyTo, reactions, attachment }
const tasks = new Map(); // id -> { id, title, note, status, owner, assignee, claimedAt, leaseUntil, result, doneAt, doneBy, priority }
let locks = [];          // Array of { file, agent, owner, lockedAt, expiresAt }
const snippets = [];     // Array of { id, ts, from, title, lang, content, tags }
let pinnedMessage = null; // { id, from, text, pinnedBy, pinnedAt }

// Persistence storage
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'hub-state.json');

function saveState() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      nextMsgId,
      pinnedMessage,
      messages: messages.slice(-500),
      tasks: Array.from(tasks.entries()),
      snippets: snippets.slice(-200)
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save hub state:', e.message);
  }
}

let saveDebounceTimer = null;
function scheduleSave() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(saveState, 1000);
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (data.nextMsgId) nextMsgId = data.nextMsgId;
      if (data.pinnedMessage) pinnedMessage = data.pinnedMessage;
      if (Array.isArray(data.messages)) messages.push(...data.messages);
      if (Array.isArray(data.tasks)) {
        for (const [k, v] of data.tasks) tasks.set(k, v);
      }
      if (Array.isArray(data.snippets)) snippets.push(...data.snippets);
      console.log(`📦 Хранилище восстановлено: ${messages.length} сообщений, ${tasks.size} задач`);
    }
  } catch (e) {
    console.error('Failed to load hub state:', e.message);
  }
}

loadState();

// SSE clients
const sseClients = new Set();

function now() { return Date.now(); }

// Helper: Touch peer presence
function touchPeer(name, capabilities = null, room = 'main', token = '') {
  if (!name || name === 'undefined') return;
  const existing = peers.get(name);
  if (existing) {
    existing.lastSeen = now();
    if (capabilities) existing.capabilities = capabilities;
    if (room) existing.room = room;
    if (token) existing.token = token;
  } else {
    peers.set(name, {
      name,
      room,
      token,
      capabilities: capabilities || 'cli',
      lastSeen: now()
    });
  }
}

// Keep side-b always alive since it runs right here alongside hub
touchPeer('side-b', 'agent');
setInterval(() => {
  touchPeer('side-b', 'agent');
}, 5000);

// Helper: Get list of active peers
function getPeersList() {
  const cur = now();
  const list = [];
  // Clean up peers inactive for > 10 minutes
  for (const [key, p] of peers.entries()) {
    const ago = Math.round((cur - p.lastSeen) / 1000);
    if (ago > 600 && key !== 'side-b' && key !== 'side-c') {
      peers.delete(key);
      continue;
    }
    list.push({
      name: p.name,
      room: p.room,
      capabilities: p.capabilities,
      lastSeenAgo: ago,
      online: ago < 90
    });
  }
  return list;
}

// Helper: Clean expired locks
function cleanExpiredLocks() {
  const cur = now();
  locks = locks.filter(l => l.expiresAt > cur);
}

// Helper: Get locks list
function getLocksList() {
  cleanExpiredLocks();
  const cur = now();
  return locks.map(l => ({
    file: l.file,
    agent: l.agent || l.owner,
    owner: l.owner || l.agent,
    expiresIn: Math.max(0, Math.round((l.expiresAt - cur) / 1000))
  }));
}

// Helper: Get tasks list
function getTasksList() {
  const cur = now();
  const list = [];
  for (const t of tasks.values()) {
    // If lease expired and status is in-progress, revert to open
    if (t.status === 'in-progress' && t.leaseUntil && t.leaseUntil < cur) {
      t.status = 'open';
      t.owner = null;
      t.assignee = null;
    }
    list.push({
      id: t.id,
      title: t.title,
      note: t.note,
      priority: t.priority || 'normal',
      status: t.status,
      owner: t.owner || t.assignee,
      assignee: t.assignee || t.owner,
      leaseLeft: t.leaseUntil ? Math.max(0, Math.round((t.leaseUntil - cur) / 1000)) : 0,
      result: t.result
    });
  }
  return list;
}

// Broadcast SSE event
function broadcastSSE(event, data) {
  const payload = typeof data === 'object' ? JSON.stringify(data) : String(data);
  for (const client of sseClients) {
    try {
      if (event) client.write(`event: ${event}\n`);
      client.write(`data: ${payload}\n\n`);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

// Keep-alive for SSE clients every 15s
setInterval(() => {
  for (const client of sseClients) {
    try { client.write(': keep-alive\n\n'); } catch (_) { sseClients.delete(client); }
  }
}, 15000);

/* ---------------- API Routes ---------------- */

// 1. Join room (Single)
app.post('/api/join', (req, res) => {
  const name = req.body.from || req.body.name || 'anonymous';
  const room = req.body.room || 'main';
  const token = req.body.token || '';
  const capabilities = req.body.capabilities || 'cli';

  touchPeer(name, capabilities, room, token);

  const sysMsg = {
    id: nextMsgId++,
    ts: now(),
    from: 'system',
    to: null,
    type: 'system',
    text: `⚡ '${name}' вошёл в комнату '${room}'`,
    room
  };
  messages.push(sysMsg);
  broadcastSSE(null, sysMsg);

  res.json({
    you: name,
    room,
    peers: getPeersList(),
    tasks: getTasksList(),
    locks: getLocksList()
  });
});

// 1b. Join room (Batch for 500 Swarm Agents)
app.post('/api/join-batch', (req, res) => {
  const agents = req.body.agents || [];
  const room = req.body.room || 'main';
  for (const a of agents) {
    touchPeer(a.name || a.id, a.capabilities || 'ai-model', room, a.token || a.apiKey || '');
  }
  if (agents.length > 0 && req.body.silent !== true) {
    const sysMsg = {
      id: nextMsgId++,
      ts: now(),
      from: 'system',
      to: null,
      type: 'system',
      text: `🛸 В комнату '${room}' подключен мультимодельный рой из ${agents.length} ИИ-агентов!`,
      room
    };
    messages.push(sysMsg);
    broadcastSSE(null, sysMsg);
  }
  res.json({ ok: true, registered: agents.length, room });
});

// 2. Send message
app.post('/api/send', (req, res) => {
  const from = req.body.from || req.body.name || 'anonymous';
  const room = req.body.room || 'main';
  const token = req.body.token || '';
  touchPeer(from, null, room, token);

  const text = (req.body.text || '').trim();
  const attachment = req.body.attachment || null;
  if (!text && !attachment) return res.status(400).json({ error: 'Пустое сообщение' });

  const msg = {
    id: nextMsgId++,
    ts: now(),
    from,
    to: req.body.to || null,
    type: req.body.type || 'chat',
    text,
    attachment,
    replyTo: req.body.replyTo || null,
    reactions: {},
    room
  };
  messages.push(msg);
  scheduleSave();
  broadcastSSE(null, msg);

  res.json({ ok: true, id: msg.id, msg });
});

// 2a. Message reactions (emoji toggle)
app.post('/api/messages/react', (req, res) => {
  const from = req.body.from || req.body.name || 'anonymous';
  touchPeer(from);

  const msgId = Number(req.body.id || req.body.msgId);
  const emoji = (req.body.emoji || '').trim();
  if (!msgId || !emoji) return res.status(400).json({ error: 'Требуется msgId и emoji' });

  const msg = messages.find(m => m.id === msgId);
  if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });

  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

  const idx = msg.reactions[emoji].indexOf(from);
  if (idx >= 0) {
    msg.reactions[emoji].splice(idx, 1);
    if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
  } else {
    msg.reactions[emoji].push(from);
  }

  scheduleSave();
  broadcastSSE('reaction_updated', { msgId, reactions: msg.reactions, from, emoji });
  res.json({ ok: true, msgId, reactions: msg.reactions });
});

// 2b. Message Pinning
app.get('/api/pin', (req, res) => {
  res.json({ ok: true, pinned: pinnedMessage });
});

app.post('/api/pin', (req, res) => {
  const from = req.body.from || req.body.name || 'anonymous';
  const id = Number(req.body.id);
  const text = req.body.text || '';
  if (!id && !text) return res.status(400).json({ error: 'Требуется id или текст' });

  const msg = id ? messages.find(m => m.id === id) : null;
  pinnedMessage = {
    id: msg ? msg.id : null,
    from: msg ? msg.from : from,
    text: msg ? msg.text : text,
    pinnedBy: from,
    pinnedAt: now()
  };
  scheduleSave();
  broadcastSSE('message_pinned', { pinned: pinnedMessage });
  res.json({ ok: true, pinned: pinnedMessage });
});

app.delete('/api/pin', (req, res) => {
  pinnedMessage = null;
  scheduleSave();
  broadcastSSE('message_unpinned', {});
  res.json({ ok: true });
});

// 2b. System Health & Performance Diagnostics
app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    timestamp: now(),
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024)
    },
    peers: {
      total: peers.size,
      online: getPeersList().filter(p => p.online).length
    },
    messagesCount: messages.length,
    tasksCount: tasks.size,
    locksCount: locks.length,
    sseClients: sseClients.size
  });
});

// 3. Get messages (inbox polling)
app.get('/api/messages', (req, res) => {
  const name = req.query.name;
  if (name) touchPeer(name);

  const since = parseInt(req.query.since || '0', 10);
  const q = (req.query.search || req.query.q || '').toLowerCase();

  let filtered = messages.filter(m => m.id > since);
  if (q) {
    filtered = filtered.filter(m => m.text.toLowerCase().includes(q) || m.from.toLowerCase().includes(q));
  }
  const limit = parseInt(req.query.limit || '0', 10);
  if (limit > 0) {
    filtered = filtered.slice(-limit);
  }
  res.json({ messages: filtered });
});

// 4. SSE real-time stream
app.get('/api/events', (req, res) => {
  const name = req.query.name;
  if (name) touchPeer(name);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);

  // Send greeting/ping immediately
  res.write(': connected to A2A-Mesh SSE\n\n');

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 5. State (peers, tasks, locks, pinned, snippets)
app.get('/api/state', (req, res) => {
  const name = req.query.name;
  if (name) touchPeer(name);

  res.json({
    peers: getPeersList(),
    tasks: getTasksList(),
    locks: getLocksList(),
    pinned: pinnedMessage,
    snippetsCount: snippets.length,
    typing: []
  });
});

// 6. Peers list
app.get('/api/peers', (req, res) => {
  res.json({ peers: getPeersList() });
});

// 7. Tasks list
app.get('/api/tasks', (req, res) => {
  res.json({ tasks: getTasksList() });
});

// 7b. Create task
app.post('/api/tasks/create', (req, res) => {
  const from = req.body.from || req.body.name || 'unknown';
  touchPeer(from);
  const id = req.body.id || ('task-' + Math.random().toString(36).slice(2, 8));
  const { title, note, priority, assignee } = req.body;
  if (!title) return res.status(400).json({ error: 'Требуется title задачи' });

  const task = {
    id,
    title,
    note: note || '',
    priority: priority || 'normal',
    status: assignee ? 'in-progress' : 'open',
    owner: assignee || null,
    assignee: assignee || null,
    claimedAt: assignee ? now() : null,
    leaseUntil: assignee ? (now() + 1800000) : null
  };
  tasks.set(id, task);
  scheduleSave();

  broadcastSSE('task_created', { task });
  res.json({ ok: true, task });
});

// 8. Claim task
app.post('/api/tasks/claim', (req, res) => {
  const from = req.body.from || req.body.name || 'unknown';
  touchPeer(from);

  const { id, title, note, ttl } = req.body;
  if (!id) return res.status(400).json({ error: 'Требуется id задачи' });

  const duration = (Number(ttl) || 1800) * 1000;
  const leaseUntil = now() + duration;

  const existing = tasks.get(id);
  const cur = now();
  if (existing && existing.status !== 'done' && existing.owner && existing.owner !== from && existing.leaseUntil > cur) {
    return res.status(409).json({ error: `Задача "${id}" уже занята агентом ${existing.owner}` });
  }

  const updated = {
    id,
    title: title || (existing ? existing.title : id),
    note: note !== undefined ? note : (existing ? existing.note : ''),
    priority: req.body.priority || (existing ? existing.priority : 'normal'),
    status: 'in-progress',
    owner: from,
    assignee: from,
    claimedAt: cur,
    leaseUntil
  };
  tasks.set(id, updated);
  scheduleSave();

  broadcastSSE('task_claimed', { task: updated });
  res.json({ ok: true, task: updated });
});

// 9. Release task
app.post('/api/tasks/release', (req, res) => {
  const from = req.body.from || req.body.name;
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Требуется id' });

  const t = tasks.get(id);
  if (!t || (t.owner !== from && t.assignee !== from)) {
    return res.status(404).json({ error: 'Задача не найдена или принадлежит не вам' });
  }
  t.status = 'open';
  t.owner = null;
  t.assignee = null;
  t.leaseUntil = null;
  scheduleSave();

  broadcastSSE('task_released', { id });
  res.json({ ok: true });
});

// 10. Done task
app.post('/api/tasks/done', (req, res) => {
  const from = req.body.from || req.body.name;
  const { id, result } = req.body;
  if (!id) return res.status(400).json({ error: 'Требуется id' });

  const t = tasks.get(id);
  if (!t) return res.status(404).json({ error: 'Задача не найдена' });

  t.status = 'done';
  t.result = result || '';
  t.doneAt = now();
  t.doneBy = from;
  scheduleSave();

  broadcastSSE('task_done', { task: t });
  res.json({ ok: true, task: t });
});

// 11. Locks list
app.get('/api/locks', (req, res) => {
  res.json({ locks: getLocksList() });
});

// 12. Acquire lock
app.post('/api/locks/acquire', (req, res) => {
  const from = req.body.from || req.body.name || 'unknown';
  touchPeer(from);

  const rawFiles = req.body.files;
  const fileList = Array.isArray(rawFiles) ? rawFiles : [rawFiles].filter(Boolean);
  if (!fileList.length) return res.status(400).json({ error: 'Укажите файлы для блокировки' });

  cleanExpiredLocks();

  const conflicts = locks.filter(l => fileList.includes(l.file) && l.owner !== from);
  if (conflicts.length) {
    return res.status(409).json({ error: `Файл '${conflicts[0].file}' уже заблокирован агентом ${conflicts[0].owner}` });
  }

  const ttlSec = Number(req.body.ttl || 1800);
  const expiresAt = now() + ttlSec * 1000;
  const granted = [];

  for (const file of fileList) {
    const existing = locks.find(l => l.file === file && l.owner === from);
    if (existing) {
      existing.expiresAt = expiresAt;
    } else {
      locks.push({
        file,
        agent: from,
        owner: from,
        lockedAt: now(),
        expiresAt
      });
    }
    granted.push(file);
  }

  broadcastSSE('locks_updated', { locks: getLocksList() });
  res.json({ ok: true, granted, locks: getLocksList() });
});

// 13. Release lock
app.post('/api/locks/release', (req, res) => {
  const from = req.body.from || req.body.name;
  const rawFiles = req.body.files;
  const fileList = Array.isArray(rawFiles) ? rawFiles : (rawFiles ? [rawFiles] : null);

  cleanExpiredLocks();
  const released = [];

  locks = locks.filter(l => {
    if (l.owner === from) {
      if (!fileList || fileList.includes(l.file)) {
        released.push(l.file);
        return false;
      }
    }
    return true;
  });

  broadcastSSE('locks_updated', { locks: getLocksList() });
  res.json({ ok: true, released, locks: getLocksList() });
});

// 14. Heartbeat ping (Single or Batch)
app.post('/api/ping', (req, res) => {
  const from = req.body.from || req.body.name || req.query.name;
  if (Array.isArray(req.body.names)) {
    for (const n of req.body.names) touchPeer(n);
  } else if (from) {
    touchPeer(from);
  }
  res.json({ ok: true, online: true });
});

// 15. Snippets
app.get('/api/snippets', (req, res) => {
  if (req.query.id) {
    const s = snippets.find(x => String(x.id) === String(req.query.id));
    if (!s) return res.status(404).json({ error: 'Сниппет не найден' });
    return res.json({ snippet: s });
  }
  res.json({ snippets });
});

app.post('/api/snippets', (req, res) => {
  const from = req.body.from || req.body.name || 'anonymous';
  const s = {
    id: snippets.length + 1,
    ts: now(),
    from,
    title: req.body.title || '',
    lang: req.body.lang || 'text',
    content: req.body.content || '',
    tags: Array.isArray(req.body.tags) ? req.body.tags : []
  };
  snippets.push(s);
  broadcastSSE('snippet_added', { snippet: s });
  res.json({ ok: true, id: s.id });
});

// 16. Export transcript
app.get('/api/export', (req, res) => {
  const format = (req.query.format || 'md').toLowerCase();
  if (format === 'json') {
    return res.json({
      exportedAt: new Date().toISOString(),
      messages,
      tasks: getTasksList(),
      locks: getLocksList(),
      peers: getPeersList()
    });
  }

  let md = `# A2A-Mesh История Комнаты (${new Date().toLocaleString('ru-RU')})\n\n`;
  md += `## Участники\n\n`;
  for (const p of getPeersList()) {
    md += `- **${p.name}** (${p.capabilities}) — ${p.online ? '🟢 онлайн' : '⚪ офлайн'}\n`;
  }
  md += `\n## Задачи\n\n`;
  for (const t of getTasksList()) {
    md += `- [${t.status}] **${t.id}**: ${t.title} (исполнитель: ${t.owner || '—'})\n`;
  }
  md += `\n## Сообщения\n\n`;
  for (const m of messages) {
    const time = new Date(m.ts).toLocaleTimeString('ru-RU');
    const to = m.to ? ` → ${m.to}` : '';
    const kind = m.type !== 'chat' ? ` <${m.type}>` : '';
    md += `- **[${time}] ${m.from}${to}${kind}**: ${m.text}\n`;
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.send(md);
});

// ==========================================
// 17. A2A Collaborative Studio & Live IDE Engine
// ==========================================
const STUDIO_DIR = path.join(DATA_DIR, 'studio-project');
if (!fs.existsSync(STUDIO_DIR)) fs.mkdirSync(STUDIO_DIR, { recursive: true });

const defaultStudioFiles = {
  'index.html': `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A2A Studio Project</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="app-card">
    <div class="logo">⚡ A2A STUDIO · LIVE PROJECT</div>
    <h1>Совместный проект Пантеры и Хлама</h1>
    <p>Редактируйте файлы слева — результат обновляется мгновенно справа!</p>
    
    <div class="interactive-box">
      <button id="click-btn" class="glow-btn">🚀 Нажми меня</button>
      <div id="counter">Кликов: 0</div>
    </div>

    <canvas id="canvas" width="400" height="200"></canvas>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
  'style.css': `* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #06040d;
  color: #fff;
  font-family: system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
}
.app-card {
  background: rgba(18, 12, 34, 0.85);
  border: 1px solid rgba(6, 182, 212, 0.4);
  box-shadow: 0 0 35px rgba(6, 182, 212, 0.25);
  border-radius: 20px;
  padding: 30px;
  max-width: 500px;
  width: 100%;
  text-align: center;
}
.logo {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #06b6d4;
  margin-bottom: 12px;
}
h1 {
  font-size: 20px;
  margin-bottom: 8px;
  background: linear-gradient(135deg, #06b6d4, #f43f5e);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
p {
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 24px;
}
.interactive-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 20px;
}
.glow-btn {
  background: linear-gradient(135deg, #f43f5e, #06b6d4);
  border: none;
  border-radius: 9999px;
  padding: 10px 24px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(244, 63, 94, 0.4);
  transition: transform 0.15s;
}
.glow-btn:hover {
  transform: scale(1.05);
}
#counter {
  font-family: ui-monospace, monospace;
  font-size: 14px;
  color: #fbbf24;
}
canvas {
  background: #020108;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  width: 100%;
  display: block;
}`,
  'app.js': `// Логика приложения A2A Studio
let count = 0;
const btn = document.getElementById('click-btn');
const counter = document.getElementById('counter');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

btn.addEventListener('click', () => {
  count++;
  counter.textContent = 'Кликов: ' + count;
  createNeonBurst();
});

// Анимация частиц на Canvas
const particles = [];
function createNeonBurst() {
  for (let i = 0; i < 22; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4.5 + 1;
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color: Math.random() > 0.5 ? '#06b6d4' : '#f43f5e'
    });
  }
}

function loop() {
  ctx.fillStyle = 'rgba(2, 1, 8, 0.25)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.025;

    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();

    if (p.life <= 0) particles.splice(i, 1);
  }
  ctx.globalAlpha = 1.0;
  requestAnimationFrame(loop);
}
loop();`,
  'README.md': `# A2A Studio Project
Совместный рабочий проект @пантера и @хлам.
Создан и синхронизирован через A2A Mesh Hub.`
};

for (const [filename, content] of Object.entries(defaultStudioFiles)) {
  const filePath = path.join(STUDIO_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

// 17.1 Get all studio project files
app.get('/api/studio/files', (req, res) => {
  try {
    const fileNames = fs.readdirSync(STUDIO_DIR);
    const files = fileNames.map(name => {
      const filePath = path.join(STUDIO_DIR, name);
      const stat = fs.statSync(filePath);
      let content = '';
      if (!stat.isDirectory()) {
        content = fs.readFileSync(filePath, 'utf8');
      }
      return {
        name,
        size: stat.size,
        updatedAt: stat.mtimeMs,
        content
      };
    }).filter(f => f.content !== '');
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 17.2 Save or update a studio project file
app.post('/api/studio/files', (req, res) => {
  const { name, content, from } = req.body;
  if (!name || typeof content !== 'string') {
    return res.status(400).json({ error: 'Не указано имя или содержимое файла' });
  }
  const safeName = path.basename(name);
  const filePath = path.join(STUDIO_DIR, safeName);
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    const author = from || 'collaborator';
    broadcastSSE('studio:file_update', {
      name: safeName,
      content,
      from: author,
      updatedAt: Date.now()
    });
    res.json({ ok: true, name: safeName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 17.3 Delete a studio file
app.delete('/api/studio/files', (req, res) => {
  const name = req.body.name || req.query.name;
  if (!name) return res.status(400).json({ error: 'Имя файла не указано' });
  const safeName = path.basename(name);
  const filePath = path.join(STUDIO_DIR, safeName);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      broadcastSSE('studio:file_delete', { name: safeName });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 17.4 AI Copilot for Studio (Direct call to Groq LPU / Gemini via keys.json)
app.post('/api/studio/ai', async (req, res) => {
  const { prompt, currentCode, fileName, agentId, from } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Промпт не указан' });

  const keysPath = path.join(__dirname, 'keys.json');
  let keysData = {};
  if (fs.existsSync(keysPath)) {
    try { keysData = JSON.parse(fs.readFileSync(keysPath, 'utf8')); } catch(e) {}
  }
  const groqKeys = keysData.groq || [];

  if (!groqKeys.length) {
    return res.status(500).json({ error: 'В keys.json нет ключей Groq LPU для AI Copilot' });
  }

  const groqKey = groqKeys[Math.floor(Math.random() * groqKeys.length)];
  const targetModel = agentId === 'gpt-120b-brain' ? 'openai/gpt-oss-120b' : 'qwen/qwen3.8-27b';

  const ext = path.extname(fileName || 'app.js').replace('.', '') || 'javascript';
  const systemPrompt = `Ты — встроенный AI Copilot в совместной онлайн-студии разработки A2A Studio.
Твой коллега — программист @${from || 'пантера'}.
Он редактирует файл «${fileName || 'code'}» (язык: ${ext}).
Текущий код файла:
\`\`\`${ext}
${currentCode || '// Файл пустой'}
\`\`\`
Запрос разработчика: «${prompt}».

ИНСТРУКЦИЯ:
1. Напиши сначала краткое пояснение (1-2 строки) о том, что ты изменил или добавил.
2. Затем обязательно выведи ПОЛНЫЙ, готовый к запуску рабочий код файла внутри блока \`\`\`${ext} ... \`\`\`.
3. Код должен быть чистым, без багов, с красивыми эффектами и современными стандартами.`;

  try {
    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 1600
      }),
      signal: AbortSignal.timeout(20000)
    });

    const data = await aiRes.json();
    const reply = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning || '';

    // Extract code block
    const codeMatch = reply.match(/```[a-z0-9_-]*\n([\s\S]*?)```/i);
    const extractedCode = codeMatch ? codeMatch[1].trim() : reply;
    const explanation = reply.replace(/```[a-z0-9_-]*\n[\s\S]*?```/gi, '').trim();

    // Broadcast log to chat room
    addMessage({
      from: agentId || 'qwen-coder',
      room: 'general',
      type: 'chat',
      text: `💻 **[A2A Studio AI Copilot]**: Сгенерировал обновление для файла \`${fileName}\` по запросу @${from || 'пантера'}:\n> ${prompt}\n\n${explanation.slice(0, 150)}...`
    });

    res.json({
      ok: true,
      agent: agentId || 'qwen-coder',
      code: extractedCode,
      explanation: explanation || 'Код успешно сгенерирован AI Copilot!'
    });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка AI Copilot: ' + e.message });
  }
});

// Root and index.html redirect directly to chat.html as per Panther's directive
app.get(['/', '/index.html'], (req, res) => {
  res.redirect('/chat.html');
});

// Static files (web UI & project files) with index: false to enforce chat.html
app.use(express.static(path.join(__dirname), { index: false }));

// Error handling middleware (graceful handling of bad JSON or malformed requests)
app.use((err, req, res, next) => {
  if (err && (err.status === 400 || err.type === 'entity.parse.failed')) {
    return res.status(400).json({ error: 'Неверный JSON формат запроса', details: err.message });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Start listening on 0.0.0.0
app.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push({ iface: name, ip: net.address });
    }
  }

  console.log(`\n=================================================`);
  console.log(`🚀 A2A-Mesh Hub запущен и готов к работе!`);
  console.log(`📡 Порт: ${PORT} (0.0.0.0)`);
  console.log(`🌐 Локально: http://localhost:${PORT}/chat.html`);
  console.log(`💻 Доступные IP в сети:`);
  for (const item of ips) {
    console.log(`   👉 http://${item.ip}:${PORT}/chat.html (${item.iface})`);
  }
  console.log(`=================================================\n`);
});

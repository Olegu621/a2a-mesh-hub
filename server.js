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
const messages = [];     // Array of { id, ts, from, to, type, text, room }
const tasks = new Map(); // id -> { id, title, note, status, owner, assignee, claimedAt, leaseUntil, result, doneAt, doneBy }
let locks = [];          // Array of { file, agent, owner, lockedAt, expiresAt }
const snippets = [];     // Array of { id, ts, from, title, lang, content, tags }

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

// 1. Join room
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

// 2. Send message
app.post('/api/send', (req, res) => {
  const from = req.body.from || req.body.name || 'anonymous';
  const room = req.body.room || 'main';
  const token = req.body.token || '';
  touchPeer(from, null, room, token);

  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Пустое сообщение' });

  const msg = {
    id: nextMsgId++,
    ts: now(),
    from,
    to: req.body.to || null,
    type: req.body.type || 'chat',
    text,
    room
  };
  messages.push(msg);
  broadcastSSE(null, msg);

  res.json({ ok: true, id: msg.id });
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

// 5. State (peers, tasks, locks)
app.get('/api/state', (req, res) => {
  const name = req.query.name;
  if (name) touchPeer(name);

  res.json({
    peers: getPeersList(),
    tasks: getTasksList(),
    locks: getLocksList(),
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
    status: 'in-progress',
    owner: from,
    assignee: from,
    claimedAt: cur,
    leaseUntil
  };
  tasks.set(id, updated);

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

// 14. Heartbeat ping
app.post('/api/ping', (req, res) => {
  const from = req.body.from || req.body.name || req.query.name;
  if (from) touchPeer(from);
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

// Static files (web UI & project files)
app.use(express.static(path.join(__dirname)));

// Root redirect to chat.html
app.get('/', (req, res) => {
  res.redirect('/chat.html');
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

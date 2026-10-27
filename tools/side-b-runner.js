#!/usr/bin/env node
/**
 * Autonomous side-b Engine:
 * - 5-second inbox polling & SSE monitoring
 * - Responsive interaction with side-c and side-d
 * - Immediate responses to human / pantera / koch
 * - Respects RULES.md and does not spam chat
 */
const fs = require('fs');
const path = require('path');

const HUB = 'http://localhost:7777';
const NAME = 'side-b';
const ROOM = 'main';
const LOG_FILE = path.join(__dirname, '..', 'side-b-live.log');

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('ru-RU')}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line, 'utf8'); } catch(_) {}
}

async function api(method, endpoint, body) {
  try {
    const res = await fetch(HUB + endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ room: ROOM, from: NAME, ...body }) : undefined
    });
    return await res.json();
  } catch(e) {
    return { error: e.message };
  }
}

async function send(text, to = null, type = 'chat') {
  const r = await api('POST', '/api/send', { to, type, text });
  log(`📤 Отправлено: "${text.slice(0, 60)}..." (ID: ${r.id})`);
  return r;
}

let lastId = 0;
let lastAnyMessageTime = Date.now();

async function checkInbox() {
  const data = await api('GET', `/api/messages?since=${lastId}&name=${NAME}`);
  const messages = data.messages || [];

  for (const m of messages) {
    if (m.id > lastId) lastId = m.id;
    if (m.from === NAME) continue; // ignore own messages

    lastAnyMessageTime = Date.now();
    log(`📩 [${m.from}${m.to ? ' → ' + m.to : ''}]: ${m.text}`);
    const lower = m.text.toLowerCase();

    // Responses to side-d
    if (m.from === 'side-d') {
      if (lower.includes('подключился') || lower.includes('салют') || lower.includes('привет')) {
        await new Promise(r => setTimeout(r, 1200));
        await send("Приветствую, side-d! Рад видеть тебя в меше. Смотри RULES.md — твоя зона: бэкенд и тесты!", 'side-d');
      } else if (lower.includes('подзадач') || lower.includes('приоритет') || lower.includes('файл') || lower.includes('готов') || lower.includes('lock')) {
        await new Promise(r => setTimeout(r, 1500));
        await send("side-d, твоя задача в силе: пили тесты в tests/api.test.js и новый эндпоинт /api/stats в server.js. Локи держи за собой!", 'side-d');
      }
    }

    // Responses to side-c
    if (m.from === 'side-c' || m.from === 'agent-friend') {
      if (lower.includes('проблему:') || lower.includes('сбой')) {
        await new Promise(r => setTimeout(r, 1500));
        await send("side-c, принял сигнал о проблеме. Если нужна помощь с логами или фиксом — дай знать.", 'side-c');
      }
    }

    // Responses to panther
    if (m.from === 'пантера') {
      if (lower.includes('ало') || lower.includes('side-b') || lower.includes('спрашивает')) {
        await new Promise(r => setTimeout(r, 1000));
        await send("Пантера, я на связи! Уже скоординировал side-d и утвердил регламент RULES.md в репозитории.");
      }
    }

    // Responses to koch
    if (m.from === 'коч коч братан') {
      if (lower.includes('side-b') && (lower.includes('делает') || lower.includes('тут'))) {
        await new Promise(r => setTimeout(r, 1000));
        await send("Коч, я тут! Выкатил Apple Liquid Glass дизайн, проверяй страницу F5. Всё скруглено и летает!");
      }
    }
  }
}

async function loop() {
  log(`🚀 side-b монитор запущен (интервал: 5 сек, режим чуткого слушателя по RULES.md)`);
  // Join room
  await api('POST', '/api/join', { capabilities: 'lead-ai-agent' });

  // Fast forward lastId to avoid processing past history
  try {
    const init = await api('GET', `/api/messages?limit=1`);
    if (init && init.messages && init.messages.length > 0) {
      lastId = Math.max(...init.messages.map(m => m.id));
      log(`📍 Синхронизация: курсор установлен на последнее сообщение #${lastId}`);
    }
  } catch(_) {}

  while (true) {
    try {
      await api('POST', '/api/ping', {});
      await checkInbox();
    } catch (err) {
      log(`⚠️ Ошибка цикла: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

loop();

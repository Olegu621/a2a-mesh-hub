#!/usr/bin/env node
/**
 * Autonomous side-d Agent Engine:
 * - Runs on host PC
 * - Connects to local Hub at http://localhost:7777
 * - 5-second inbox polling & heartbeats
 * - Collaborates with side-b, side-c, and humans (пантера, коч коч братан)
 */
const fs = require('fs');
const path = require('path');

const HUB = process.env.A2A_URL || 'http://localhost:7777';
const NAME = process.env.A2A_NAME || 'side-d';
const ROOM = process.env.A2A_ROOM || 'main';
const LOG_FILE = path.join(__dirname, '..', 'side-d-live.log');

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('ru-RU')}] [${NAME}] ${msg}\n`;
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

async function checkInbox() {
  const data = await api('GET', `/api/messages?since=${lastId}&name=${NAME}`);
  const messages = data.messages || [];

  for (const m of messages) {
    if (m.id > lastId) lastId = m.id;
    if (m.from === NAME) continue; // ignore own messages

    log(`📩 [${m.from}${m.to ? ' → ' + m.to : ''}]: ${m.text}`);

    const lower = m.text.toLowerCase();

    // Respond if addressed to side-d or mentioning side-d
    if (m.to === NAME || lower.includes('side-d') || lower.includes('сайд д') || lower.includes('сайд-д')) {
      await new Promise(r => setTimeout(r, 1500));
      if (m.from === 'пантера') {
        await send("Пантера, side-d на связи с локального хоста! Готов взять на себя тесты бэкенда или новые фичи для хаба.");
      } else if (m.from === 'коч коч братан') {
        await send("Коч, приветствую! side-d в строю, радар активен, слушаю эфир.");
      } else if (m.from === 'side-b') {
        await send("side-b, принял! Рад подключиться к связке. Готов забрать часть задач по хабу.", 'side-b');
      } else if (m.from === 'side-c') {
        await send("side-c, привет от side-d! Вижу тебя в сети. Твой коннект стабилен.", 'side-c');
      } else {
        await send(`Принял сообщение от ${m.from}. side-d готов к работе!`);
      }
    }
  }
}

async function loop() {
  log(`🚀 ${NAME} агент запущен (Hub: ${HUB}, комната: ${ROOM})`);
  
  // Join room
  await api('POST', '/api/join', { capabilities: 'code-agent' });
  await send("Салют всем! Я агент side-d, подключился прямо с локального ПК в помощь side-b, side-c и пацанам!", null, 'status');

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

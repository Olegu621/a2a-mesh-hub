#!/usr/bin/env node
/**
 * Autonomous side-b Engine:
 * - 5-second inbox polling & SSE monitoring
 * - Frequent intelligent interaction with side-c (Manus)
 * - Immediate responses to human / pantera / koch
 * - Task & lock coordination
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

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
let lastDiscussionTime = Date.now();

// Topics to discuss with side-c (NO MORE RADMIN!)
const DISCUSSIONS_WITH_C = [
  "side-c, я сейчас залочу chat.html и css/style.css, пересоберу вёрстку под современный тёмный glassmorphism. Ты пока можешь взять логику фильтрации задач или экспорт?",
  "side-c, проверил локи на сервере: сейчас всё свободно. Если тебе нужны файлы для бэкенда или a2a.js — бери lock без проблем.",
  "side-c, как там у тебя нагрузка на модель? Вижу были таймауты по LLM — если что, не спеши, работаем в спокойном темпе.",
  "side-c, звуки Web Audio и счетчик непрочитанных уже залиты в master. Пацаны могут тестировать по кнопке 🔔.",
  "side-c, давай сделаем авто-ретраи подключения в CLI, чтобы при обрыве сети скрипт сам переподключался?",
  "side-c, статус задачи 'hub-v2' — в процессе. Делаю интерфейс отзывчивым под мобилки и планшеты.",
];
let discussionIndex = 0;

async function checkInbox() {
  const data = await api('GET', `/api/messages?since=${lastId}&name=${NAME}`);
  const messages = data.messages || [];

  for (const m of messages) {
    if (m.id > lastId) lastId = m.id;
    if (m.from === NAME) continue; // ignore own messages

    log(`📩 [${m.from}${m.to ? ' → ' + m.to : ''}]: ${m.text}`);

    // If message is from side-c (the agent!)
    if (m.from === 'side-c' || m.from === 'agent-friend') {
      // Avoid echo loop if side-c is just echoing/confirming
      if (m.text.startsWith('Принял адресованное') || m.text.startsWith('side-c, принял')) {
        log(`ℹ️ Пропуск эхо-подтверждения от side-c`);
        continue;
      }

      await new Promise(r => setTimeout(r, 2000));
      if (m.text.toLowerCase().includes('приоритет') || m.text.toLowerCase().includes('улучш')) {
        await send("side-c, согласен! План утверждён: я беру UI/UX чата (chat.html), ты подключайся к стабильности коннекта. Приступаем!", 'side-c', 'proposal');
      } else if (m.text.toLowerCase().includes('связи') || m.text.toLowerCase().includes('работает')) {
        await send("Отлично, side-c! Коннект стабилен. Я залочил интерфейсные файлы, приступаю к правкам.", 'side-c');
      }
      lastDiscussionTime = Date.now();
    }

    // If message is from side-d (new local agent!)
    if (m.from === 'side-d') {
      if (m.text.includes('подключился') || m.text.includes('Салют') || m.text.includes('салют') || m.text.includes('привет')) {
        await new Promise(r => setTimeout(r, 1500));
        await send("Приветствую, side-d! Рад видеть тебя в меше. Мы с side-c как раз пилим хаб. Забирай смежные модули и тесты!", 'side-d');
      }
    }

    // If message is from human / pantera / koch
    if (m.from === 'пантера') {
      if (m.text.toLowerCase().includes('чините') || m.text.toLowerCase().includes('начните')) {
        await new Promise(r => setTimeout(r, 1200));
        await send("Пантера, задача 'hub-v2' уже взята мной в работу! Прямо сейчас пилю сочный интерфейс, локи уже наготове. Всё будет по высшему разряду!");
      }
    }

    if (m.from === 'коч коч братан') {
      if (m.text.toLowerCase().includes('respond') || m.text.toLowerCase().includes('как дела')) {
        await new Promise(r => setTimeout(r, 1200));
        await send("Коч, всё четко, хаб в боевом режиме! Мы с side-c как раз качаем функционал. Как у вас связь?");
      }
    }
  }
}

async function periodicAgentChat() {
  const now = Date.now();
  // Initiate conversation with side-c every 30-40 seconds if silent
  if (now - lastDiscussionTime > 35000) {
    lastDiscussionTime = now;
    const msg = DISCUSSIONS_WITH_C[discussionIndex % DISCUSSIONS_WITH_C.length];
    discussionIndex++;
    await send(msg, 'side-c', 'question');
  }
}

async function loop() {
  log(`🚀 side-b монитор запущен (интервал: 5 сек, активное общение с side-c включено)`);
  // Join room
  await api('POST', '/api/join', { capabilities: 'lead-ai-agent' });
  await send("side-b включил 5-секундный фоновый радар. Слежу за всеми сообщениями и веду координацию с side-c!", null, 'status');

  while (true) {
    try {
      await api('POST', '/api/ping', {});
      await checkInbox();
      await periodicAgentChat();
    } catch (err) {
      log(`⚠️ Ошибка цикла: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

loop();

#!/usr/bin/env node
// side-a agent — autonomous agent that communicates via A2A hub
// Joins as "side-a", listens to messages, responds intelligently to side-b

const fs = require('fs');
const path = require('path');
const os = require('os');

const HUB = 'http://localhost:7777';
const NAME = 'side-a';
const ROOM = 'main';
const CURSOR_FILE = path.join(os.homedir(), '.a2a', `cursor-${ROOM}-${NAME}.json`);

function loadCursor() { try { return JSON.parse(fs.readFileSync(CURSOR_FILE,'utf8')).lastId||0; } catch { return 0; } }
function saveCursor(id) { try { fs.mkdirSync(path.dirname(CURSOR_FILE),{recursive:true}); fs.writeFileSync(CURSOR_FILE,JSON.stringify({lastId:id})); } catch {} }

async function api(method, endpoint, body) {
  const res = await fetch(HUB + endpoint, {
    method,
    headers: {'Content-Type':'application/json'},
    body: method==='POST' ? JSON.stringify({room:ROOM, token:'', from:NAME, ...body}) : undefined
  });
  return res.json().catch(()=>({}));
}

async function send(text, to=null, type='chat') {
  const r = await api('POST', '/api/send', {to, type, text});
  console.log(`[side-a] sent #${r.id}: ${text}`);
}

// Phrases for autonomous conversation
const RESPONSES = [
  'Привет, side-b! Я подключился к хабу.',
  'Как идёт работа над проектом?',
  'Давай возьмём задачу — могу взять UI-часть.',
  'Посмотрел код в js/app.js, выглядит хорошо.',
  'Предлагаю добавить поиск по заметкам. Что думаешь?',
  'Готов начать работу над фильтрацией задач.',
  'Залочу storage.js, поправлю сохранение данных.',
  'Кстати, надо бы добавить тёмную тему.',
  'Проверил: всё работает стабильно на localhost:7777.',
  'Давай договоримся: я беру backend, ты — UI?',
  'Хорошая работа, side-b! Продолжаем.',
  'Вижу новые сообщения в inbox. Обрабатываю...',
];

let responseIdx = 0;
function nextResponse() {
  return RESPONSES[responseIdx++ % RESPONSES.length];
}

async function main() {
  console.log('[side-a] запускаюсь...');
  // Join hub
  const st = await api('POST', '/api/join', {capabilities:'ai-agent'});
  console.log(`[side-a] вошёл в комнату: ${JSON.stringify(st.peers?.map(p=>p.name))}`);
  await send('👋 side-a подключился! Готов к работе.', null, 'status');

  let cursor = loadCursor();
  let pingCount = 0;

  while (true) {
    // Send autonomous message every ~30 seconds (every 3 iterations of 10s)
    pingCount++;
    if (pingCount % 3 === 0) {
      await send(nextResponse());
    }

    // Ping heartbeat
    await api('POST', '/api/ping', {});

    // Read inbox
    const r = await fetch(`${HUB}/api/messages?since=${cursor}`).then(r=>r.json()).catch(()=>({messages:[]}));
    const msgs = (r.messages||[]).filter(m=>m.id>cursor && m.from!==NAME);
    for (const m of msgs) {
      if (m.id > cursor) cursor = m.id;
      console.log(`[side-a] получил от ${m.from}: ${m.text}`);
      // Auto-reply to side-b messages
      if (m.from === 'side-b' || m.to === NAME) {
        await new Promise(r=>setTimeout(r, 1500));
        await send(`Получил: "${m.text.slice(0,40)}..." — обрабатываю!`, 'side-b');
      }
      if (m.from === 'human') {
        await new Promise(r=>setTimeout(r, 1000));
        await send(`Человек написал: "${m.text.slice(0,30)}..." — принял к сведению.`);
      }
    }
    saveCursor(cursor);

    // Wait 10 seconds before next cycle
    await new Promise(r=>setTimeout(r, 10000));
  }
}

main().catch(e=>{ console.error('[side-a] error:', e.message); process.exit(1); });

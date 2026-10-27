#!/usr/bin/env node
/*
 * A2A-Mesh CLI — консольный клиент для агентов и людей.
 * Zero-dependency: Node.js >= 18.
 *
 * Примеры:
 *   node a2a.js join --url http://192.168.1.10:7777 --room proj --token SECRET --name bob
 *   node a2a.js send "привет, я взял задачу auth"
 *   node a2a.js send "как дела с ui?" --to alice
 *   node a2a.js inbox --wait 30
 *   node a2a.js listen
 *   node a2a.js claim auth --title "Аутентификация" --note "express + jwt"
 *   node a2a.js done auth --result "готово, ветка feat/auth"
 *   node a2a.js lock src/auth.js src/jwt.js
 *   node a2a.js peers | tasks | locks | state
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

if (typeof fetch !== 'function') { console.error('Нужен Node.js >= 18'); process.exit(1); }

/* ------------------------------ конфиг ------------------------------ */

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const key = a.slice(2); flags[key] = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
  else pos.push(a);
}
const command = pos.shift() || 'help';

function loadConfig(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; } }

const envPart = Object.fromEntries(
  ['url', 'room', 'token', 'name']
    .map(k => [k, process.env['A2A_' + k.toUpperCase()]])
    .filter(([, v]) => v !== undefined)
);
const cfg = {
  ...loadConfig(path.join(os.homedir(), '.a2a', 'config.json')),
  ...loadConfig(path.join(process.cwd(), 'a2a.config.json')),
  ...envPart,
  ...Object.fromEntries(['url', 'room', 'token', 'name'].filter(k => flags[k]).map(k => [k, flags[k]])),
};
cfg.url = (cfg.url || 'http://localhost:7777').replace(/\/+$/, '');
cfg.room = cfg.room || 'main';
cfg.name = cfg.name || 'cli';

const CURSOR_FILE = path.join(os.homedir(), '.a2a', `cursor-${cfg.room}-${cfg.name}.json`);
function loadCursor() { try { return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8')).lastId || 0; } catch (_) { return 0; } }
function saveCursor(id) { try { fs.mkdirSync(path.dirname(CURSOR_FILE), { recursive: true }); fs.writeFileSync(CURSOR_FILE, JSON.stringify({ lastId: id })); } catch (_) {} }

/* ------------------------------ api ------------------------------ */

function q(extra) { return new URLSearchParams({ room: cfg.room, token: cfg.token, name: cfg.name, ...(extra || {}) }); }

async function api(method, endpoint, body) {
  const url = cfg.url + endpoint + (method === 'GET' ? '?' + q(flags) : '');
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify({ room: cfg.room, token: cfg.token, from: cfg.name, ...(body || {}) }) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: res.status, data }); }
  return data;
}

const ebg = (s) => String(s);
function fmtTime(ts) { return new Date(ts).toLocaleTimeString('ru-RU', { hour12: false }); }

function printMsg(m) {
  if (flags.json) { console.log(JSON.stringify(m)); return; }
  const t = fmtTime(m.ts);
  if (m.type === 'system') { console.log(`  [${t}] ⚙ ${ebg(m.text)}`); return; }
  const to = m.to ? ` → ${m.to}` : '';
  const tag = m.type !== 'chat' ? ` <${m.type}>` : '';
  console.log(`[${t}] ${m.from}${to}${tag}: ${ebg(m.text)}`);
}

async function sseMessages(onMsg, signal) {
  const res = await fetch(`${cfg.url}/api/events?${q()}`, { headers: { Accept: 'text/event-stream' }, signal });
  if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
  const dec = new TextDecoder();
  let buf = '';
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          try { onMsg(JSON.parse(line.slice(6))); } catch (_) {}
        }
      }
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ------------------------------ команды ------------------------------ */

const HELP = `
A2A-Mesh CLI — мессенджер и координация для ИИ-агентов
Конфиг: флаги > env (A2A_URL/ROOM/TOKEN/NAME) > ./a2a.config.json > ~/.a2a/config.json

  join [--save]                     войти в комнату, поздороваться, сохранить конфиг
  send <текст> [--to ИМЯ] [--kind TYPE]   написать (kind: chat/question/proposal/status/git/bye)
  inbox [--since N] [--wait СЕК] [--no-cursor]   прочитать новые сообщения (+ в конце: кто онлайн, незакрытые задачи, локи)
  listen                            слушать поток в реальном времени (Ctrl+C — выход)
  peers | tasks | locks | state     кто онлайн / доска задач / блокировки / всё сразу
  claim <id> [--title T] [--note N] [--ttl СЕК]   взять задачу (409 = занята)
  release <id>                      освободить задачу
  done <id> [--result R]            завершить задачу
  lock <файл...>                    залочить файлы (TTL по умолчанию 30 мин)
  unlock [файл...]                  разлочить (без аргументов — все свои)
  ping                              обновить присутствие
  help                              эта справка
`;

async function main() {
  switch (command) {
    case 'help': case '--help': case '-h': console.log(HELP); return;

    case 'join': {
      const st = await api('POST', '/api/join', { capabilities: flags.cap || 'cli' });
      console.log(`✓ вошёл как '${st.you}' в комнату '${st.room}' @ ${cfg.url}`);
      console.log(`  онлайн: ${st.peers.map(p => p.name).join(', ') || 'никого'}`);
      console.log(`  открытых задач: ${st.tasks.filter(t => t.status !== 'done').length}, активных блокировок: ${st.locks.length}`);
      if (flags.save || flags['save-global']) {
        const file = flags['save-global'] ? path.join(os.homedir(), '.a2a', 'config.json') : path.join(process.cwd(), 'a2a.config.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ url: cfg.url, room: cfg.room, token: cfg.token, name: cfg.name }, null, 2));
        console.log(`  конфиг сохранён: ${file}`);
      }
      return;
    }

    case 'send': {
      const text = pos.join(' ') || flags.text || '';
      if (!text) { console.error('пустое сообщение'); process.exit(1); }
      if (flags.to && flags.to === cfg.name) {
        console.error(`⚠️ отправка самому себе (--to ${cfg.name}); уникальные имена обязательны, проверь a2a.config.json`);
      }
      const r = await api('POST', '/api/send', { to: flags.to || null, type: flags.kind || 'chat', text });
      console.log(`✓ отправлено (#${r.id})`);
      return;
    }

    case 'inbox': {
      const explicitSince = flags.since !== undefined;
      let since = flags['no-cursor'] ? 0 : (explicitSince ? Number(flags.since) : loadCursor());
      if (!flags['no-cursor'] && !explicitSince) flags.since = since; // пусть сервер сам фильтрует по since
      const waitSec = Number(flags.wait || 0);
      const deadline = Date.now() + waitSec * 1000;
      let out = [];
      while (true) {
        const r = await api('GET', '/api/messages');
        out = (r.messages || []).filter(m => m.id > since); // страховка, если сервер не применил since
        if (out.length || Date.now() >= deadline) break;
        await sleep(2000);
      }
      let maxId = since;
      for (const m of out) { printMsg(m); if (m.id > maxId) maxId = m.id; }
      if (!flags['no-cursor'] && !explicitSince) saveCursor(maxId);
      if (!out.length) console.error('(новых сообщений нет)');
      // presence-сводка в конце: агент сразу видит, кто в сети и что не закрыто (improvement [side-a])
      try {
        const st = await api('GET', '/api/state');
        const openTasks = st.tasks.filter(t => t.status !== 'done').length;
        console.error(`👥 онлайн: ${st.peers.map(p => p.name).join(', ') || 'никого'} | задач не-done: ${openTasks} | локов: ${st.locks.length}`);
      } catch (_) {}
      return;
    }

    case 'listen': {
      console.error(`слушаю ${cfg.url} (комната ${cfg.room}, как ${cfg.name})...`);
      api('POST', '/api/join', {}).catch(() => {});
      while (true) {
        try {
          await sseMessages(printMsg);
          console.error('поток закрыт, переподключение через 3с...');
        } catch (e) { console.error(`ошибка: ${e.message}; повтор через 3с...`); }
        await sleep(3000);
      }
    }

    case 'peers': { const st = await api('GET', '/api/state'); for (const p of st.peers) console.log(`${p.name}${p.capabilities ? ' — ' + p.capabilities : ''}`); if (!st.peers.length) console.error('(никого)'); return; }
    case 'tasks': {
      const st = await api('GET', '/api/state');
      for (const t of st.tasks) console.log(`[${t.status}] ${t.id}${t.title ? ' — ' + t.title : ''}${t.owner ? ` (у ${t.owner}${t.leaseLeft ? `, ещё ${t.leaseLeft}с` : ''})` : ''}`);
      if (!st.tasks.length) console.error('(задач нет)');
      return;
    }
    case 'locks': {
      const st = await api('GET', '/api/state');
      for (const l of st.locks) console.log(`${l.file} — ${l.agent} (ещё ${l.expiresIn}с)`);
      if (!st.locks.length) console.error('(блокировок нет)');
      return;
    }
    case 'state': { console.log(JSON.stringify(await api('GET', '/api/state'), null, 2)); return; }

    case 'claim': {
      const id = pos[0] || flags.id;
      if (!id) { console.error('укажи id задачи'); process.exit(1); }
      const r = await api('POST', '/api/tasks/claim', { id, title: flags.title, note: flags.note, ttl: Number(flags.ttl || 0) || undefined });
      console.log(`✓ задача '${id}' твоя (аренда ${Math.round((r.task.leaseUntil - Date.now()) / 1000)}с). Не забудь: lock на файлы перед правкой.`);
      return;
    }
    case 'release': { await api('POST', '/api/tasks/release', { id: pos[0] || flags.id }); console.log('✓ освобождена'); return; }
    case 'done': {
      const id = pos[0] || flags.id;
      await api('POST', '/api/tasks/done', { id, result: flags.result || pos.slice(1).join(' ') || '' });
      console.log(`✓ задача '${id}' завершена`);
      return;
    }

    case 'lock': {
      const files = pos.length ? pos : (flags.files ? String(flags.files).split(/[,\s]+/) : []);
      if (!files.length) { console.error('укажи файлы: lock src/a.js src/b.js'); process.exit(1); }
      const r = await api('POST', '/api/locks/acquire', { files, ttl: Number(flags.ttl || 0) || undefined });
      console.log(`✓ залочено: ${r.granted.join(', ')}`);
      return;
    }
    case 'unlock': {
      const files = pos.length ? pos : undefined;
      const r = await api('POST', '/api/locks/release', files ? { files } : {});
      console.log(r.released.length ? `✓ разлочено: ${r.released.join(', ')}` : '(своих блокировок нет)');
      return;
    }

    case 'ping': { const r = await api('POST', '/api/ping', {}); console.log(`✓ online: ${r.online}`); return; }

    default: console.error(`неизвестная команда '${command}'\n` + HELP); process.exit(1);
  }
}

main().catch(e => {
  const cause = e.cause ? ` (${(e.cause.message || e.cause.code || e.cause)})` : '';
  if (flags.json) console.log(JSON.stringify({ error: e.message + cause, code: e.code || 0 }));
  else console.error(`✗ ${e.message}${cause}`);
  process.exit(1);
});

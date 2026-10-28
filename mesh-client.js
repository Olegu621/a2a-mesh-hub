/**
 * A2A Mesh Client — Автоматический мост для удаленного ПК (Radmin VPN)
 * Позволяет удаленному компьютеру подключиться к Хабу ИИ-агентов,
 * отправлять задачи и автоматически сохранять созданный код в локальную папку проекта.
 *
 * Разделение проектов:
 *   - Когда пишет @хлам: код сохраняется ТОЛЬКО на его ПК.
 *   - Когда пишет @пантера: код сохраняется ТОЛЬКО на ПК Пантеры.
 *
 * Запуск:
 *   node mesh-client.js [Имя] [Папка_Проекта] [Адрес_Хаба]
 * Пример для друга:
 *   node mesh-client.js "хлам" "./" "http://26.152.56.161:7777"
 * Пример для Пантеры:
 *   node mesh-client.js "пантера" "./panther-project" "http://localhost:7777"
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CLIENT_NAME = process.argv[2] || 'хлам';
const TARGET_DIR = path.resolve(process.argv[3] || './project-files');
const HUB_URL = process.argv[4] || process.env.HUB_URL || 'http://26.152.56.161:7777';

if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

console.log('\n======================================================');
console.log('⚡ A2A MESH CLIENT · Мост для локального проекта');
console.log(`🌐 Адрес Хаба:     ${HUB_URL}`);
console.log(`👤 Владелец:       @${CLIENT_NAME}`);
console.log(`📁 Папка проекта:  ${TARGET_DIR}`);
console.log(`🎯 Режим:          Сохранение только проектов для @${CLIENT_NAME}`);
console.log('======================================================\n');

// HTTP-запрос к хабу
function request(method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, HUB_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Heartbeat в хаб
async function sendHeartbeat() {
  try {
    await request('POST', '/api/heartbeat', {
      name: CLIENT_NAME,
      role: 'worker',
      status: 'active'
    });
  } catch (err) {
    // хаб временно недоступен
  }
}
setInterval(sendHeartbeat, 5000);
sendHeartbeat();

// Проверка: предназначается ли данный ответ/код именно текущему участнику
function isForMe(msg) {
  if (process.argv.includes('--all') || process.argv.includes('-a')) return true;

  const myName = (CLIENT_NAME || '').toLowerCase();
  const aliases = [myName];
  if (myName === 'хлам' || myName === 'xlam') aliases.push('хлам', 'xlam');
  if (myName === 'пантера' || myName === 'panther') aliases.push('пантера', 'panther');

  // 1. Ответ на сообщение этого пользователя (replyTo)
  if (msg.replyTo && msg.replyTo.from) {
    const rf = msg.replyTo.from.toLowerCase();
    if (aliases.some(a => rf === a || rf.includes(a))) return true;
  }

  // 2. Упоминание в тексте (@хлам, @xlam) или адресация в поле to
  if (msg.to && aliases.some(a => msg.to.toLowerCase() === a)) return true;
  const lowerText = (msg.text || '').toLowerCase();
  if (aliases.some(a => lowerText.includes('@' + a))) return true;

  // 3. Задачи, созданные этим пользователем
  if (msg.owner && aliases.some(a => msg.owner.toLowerCase() === a)) return true;
  if (msg.requester && aliases.some(a => msg.requester.toLowerCase() === a)) return true;

  return false;
}

// Отправка сообщения / задачи в хаб
async function sendMessage(text) {
  try {
    await request('POST', '/api/send', {
      from: CLIENT_NAME,
      room: 'general',
      type: 'chat',
      text: text
    });
    console.log(`\n📤 [@${CLIENT_NAME} -> Хаб]: ${text}\n`);
  } catch (err) {
    console.error(`❌ Ошибка отправки: ${err.message}`);
  }
}

// Сохранение кода в локальную папку проекта
function saveCodeSnippet(msg) {
  const text = msg.text || '';
  if (!text) return;

  // Если код сгенерирован не для нас (например, для другого участника) — пропускаем!
  if (!isForMe(msg)) {
    return;
  }

  // Регулярное выражение для извлечения блоков кода
  const codeRegex = /```([a-zA-Z0-9_-]*)\s*(?:\/\/\s*(?:File|Файл):\s*([^\n\r]+)|<!--\s*(?:File|Файл):\s*([^\n\r]+)\s*-->)?\n([\s\S]*?)```/g;
  let match;
  let counter = 1;
  let savedAny = false;

  while ((match = codeRegex.exec(text)) !== null) {
    const lang = (match[1] || 'txt').toLowerCase();
    let filename = (match[2] || match[3] || '').trim();
    const code = match[4];

    if (!filename) {
      const ext = lang === 'js' || lang === 'javascript' ? 'js' :
                  lang === 'html' ? 'html' :
                  lang === 'css' ? 'css' :
                  lang === 'python' || lang === 'py' ? 'py' :
                  lang === 'json' ? 'json' :
                  lang === 'sh' || lang === 'bash' ? 'sh' :
                  lang === 'rust' || lang === 'rs' ? 'rs' : 'txt';
      
      const timeTag = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);
      filename = `generated-${msg.from || 'ai'}-${timeTag}-${counter++}.${ext}`;
    }

    const fullPath = path.join(TARGET_DIR, path.basename(filename));
    try {
      fs.writeFileSync(fullPath, code.trim(), 'utf8');
      console.log(`\n💾 [АВТОСОХРАНЕНИЕ]: Создан файл -> ${fullPath}`);
      console.log(`   Исполнитель: @${msg.from} | Размер: ${code.length} байт\n`);
      savedAny = true;
    } catch (e) {
      console.error(`❌ Ошибка сохранения файла ${filename}:`, e.message);
    }
  }

  return savedAny;
}

// Подключение к SSE потоку событий хаба
function connectSSE() {
  const url = new URL('/api/events', HUB_URL);
  console.log(`📡 Подключение к SSE потоку хаба...`);

  const req = http.request({
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname,
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  }, (res) => {
    console.log(`✅ Поток событий подключен (HTTP ${res.statusCode})\n`);
    console.log('💡 Напишите задачу для ИИ (например: "@qwen-coder напиши компонент слайдера") и нажмите Enter:\n');

    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n\n');
      buffer = lines.pop();

      for (const block of lines) {
        if (!block.trim()) continue;
        const eventMatch = block.match(/event:\s*(.+)/);
        const dataMatch = block.match(/data:\s*(.+)/);
        const eventType = eventMatch ? eventMatch[1].trim() : 'message';
        const dataStr = dataMatch ? dataMatch[1].trim() : '';

        if (!dataStr) continue;

        try {
          const payload = JSON.parse(dataStr);
          handleEvent(eventType, payload);
        } catch {
          // pass
        }
      }
    });

    res.on('end', () => {
      console.log('⚠️ SSE соединение закрыто сервером. Переподключение через 3с...');
      setTimeout(connectSSE, 3000);
    });
  });

  req.on('error', (err) => {
    console.log(`⚠️ Ошибка соединения с хабом (${err.message}). Повтор через 5с...`);
    setTimeout(connectSSE, 5000);
  });

  req.end();
}

function handleEvent(type, payload) {
  if (type === 'message' || type === 'chat') {
    if (payload.from === CLIENT_NAME) return;

    const fromTag = payload.from ? `[@${payload.from}]` : '[ИИ]';
    const forMe = isForMe(payload);
    
    if (forMe) {
      console.log(`\n🔔 🎯 ВАШ ЗАКАЗ от ${fromTag}:`);
      console.log(payload.text);
      saveCodeSnippet(payload);
    } else {
      // Краткое уведомление о чужой активности без захламления
      console.log(`\n💬 ${fromTag}: ${payload.text.slice(0, 100)}${payload.text.length > 100 ? '...' : ''}`);
    }
  } else if (type === 'task:done') {
    const forMe = isForMe(payload);
    if (forMe) {
      console.log(`\n🎉 [ВАША ЗАДАЧА ВЫПОЛНЕНА]: «${payload.title || payload.id}» исполнителем @${payload.assignee || payload.from}`);
      if (payload.result) {
        saveCodeSnippet({ ...payload, text: payload.result });
      }
    } else {
      console.log(`\n✓ [Задача меша выполнена]: «${payload.title || payload.id}» (@${payload.assignee || payload.from})`);
    }
  }
}

// Консольный ввод для отправки задач прямо из терминала
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  sendMessage(text);
});

// Запуск
connectSSE();

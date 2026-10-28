/**
 * A2A Mesh Client — Автоматический мост для удаленного ПК (Radmin VPN)
 * Позволяет удаленному компьютеру подключиться к Хабу ИИ-агентов,
 * отправлять задачи и автоматически сохранять созданный код в локальную папку проекта.
 *
 * Запуск у друга:
 *   node mesh-client.js [Имя] [Папка_Проекта] [Адрес_Хаба]
 * Пример:
 *   node mesh-client.js "Друг-ПК" "./my-project" "http://26.152.56.161:7777"
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CLIENT_NAME = process.argv[2] || 'Друг-ПК';
const TARGET_DIR = path.resolve(process.argv[3] || './project-files');
const HUB_URL = process.argv[4] || process.env.HUB_URL || 'http://26.152.56.161:7777';

if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

console.log('\n======================================================');
console.log('⚡ A2A MESH CLIENT · Мост для удаленного проекта');
console.log(`🌐 Адрес Хаба:     ${HUB_URL}`);
console.log(`👤 Имя участника:  ${CLIENT_NAME}`);
console.log(`📁 Папка проекта:  ${TARGET_DIR}`);
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

// Отправка сообщения / задачи в хаб
async function sendMessage(text) {
  try {
    await request('POST', '/api/send', {
      from: CLIENT_NAME,
      room: 'general',
      type: 'chat',
      text: text
    });
    console.log(`\n📤 [Вы -> Хаб]: ${text}\n`);
  } catch (err) {
    console.error(`❌ Ошибка отправки: ${err.message}`);
  }
}

// Сохранение кода в локальную папку проекта
function saveCodeSnippet(msg) {
  const text = msg.text || '';
  if (!text) return;

  // Регулярное выражение для извлечения блоков кода
  const codeRegex = /```([a-zA-Z0-9_-]*)\s*(?:\/\/\s*(?:File|Файл):\s*([^\n\r]+))?\n([\s\S]*?)```/g;
  let match;
  let counter = 1;

  while ((match = codeRegex.exec(text)) !== null) {
    const lang = (match[1] || 'txt').toLowerCase();
    let filename = match[2] ? match[2].trim() : null;
    const code = match[3];

    if (!filename) {
      // Подбираем имя по типу языка или задаче
      const ext = lang === 'js' || lang === 'javascript' ? 'js' :
                  lang === 'html' ? 'html' :
                  lang === 'css' ? 'css' :
                  lang === 'python' || lang === 'py' ? 'py' :
                  lang === 'json' ? 'json' :
                  lang === 'sh' || lang === 'bash' ? 'sh' : 'txt';
      
      const timeTag = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);
      filename = `generated-${msg.from || 'ai'}-${timeTag}-${counter++}.${ext}`;
    }

    const fullPath = path.join(TARGET_DIR, path.basename(filename));
    try {
      fs.writeFileSync(fullPath, code.trim(), 'utf8');
      console.log(`\n💾 [АВТОСОХРАНЕНИЕ]: Создан файл -> ${fullPath}`);
      console.log(`   Автор: @${msg.from} | Размер: ${code.length} байт\n`);
    } catch (e) {
      console.error(`❌ Ошибка сохранения файла ${filename}:`, e.message);
    }
  }
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
      buffer = lines.pop(); // Оставляем незавершенный кусок

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
          // игнорируем некорректный json
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
    if (payload.from === CLIENT_NAME) return; // Свои сообщения не дублируем

    const fromTag = payload.from ? `[@${payload.from}]` : '[ИИ]';
    console.log(`\n💬 ${fromTag}: ${payload.text}`);

    // Если в сообщении есть блоки кода — сохраняем их в файлы
    saveCodeSnippet(payload);
  } else if (type === 'task:done') {
    console.log(`\n🎉 [ЗАДАЧА ЗАВЕРШЕНА]: «${payload.title || payload.id}» исполнителем @${payload.assignee || payload.from}`);
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

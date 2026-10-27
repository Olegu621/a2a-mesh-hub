#!/usr/bin/env node
/**
 * ⚡ REAL 8 AI AGENTS ENGINE (Powered by Groq Cloud & Google Gemini)
 * Элитный отряд из 8 настоящих ИИ-агентов под руководством Главного Координатора @side-b.
 * Все ответы — 100% реальный вывод нейросетей Google Gemini 3.5 Flash, Qwen 3.8 27B, GPT-OSS 120B и GPT-OSS 20B.
 * Пул из 8 активных ключей (4x Groq + 4x Gemini).
 */

const fs = require('fs');
const path = require('path');

const HUB = process.env.A2A_URL || 'http://localhost:7777';
const ROOM = 'main';
const KEYS_FILE = path.join(__dirname, '..', 'keys.json');

function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    }
  } catch (_) {}
  return { groq: [], gemini: [] };
}

let groqIndex = 0;
function getNextGroqKey(keys) {
  if (!keys || !keys.length) return null;
  const k = keys[groqIndex % keys.length];
  groqIndex++;
  return k;
}

let geminiIndex = 0;
function getNextGeminiKey(keys) {
  if (!keys || !keys.length) return null;
  const k = keys[geminiIndex % keys.length];
  geminiIndex++;
  return k;
}

// 8 Real AI Agents Specification
const REAL_8_AGENTS = [
  {
    id: 'gemini-flash',
    name: 'Gemini 3.5 Flash UI/UX',
    icon: '✨',
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    role: 'Мультимодальный UI/UX & Web Audio инженер',
    capabilities: 'ai-model,gemini,ui,audio,frontend',
    systemPrompt: 'Ты Gemini Flash — элитный фронтенд и мультимодальный ИИ-инженер в меш-хабе. Твой создатель — @пантера, главарь отряда — @side-b. Твоя стихия — Apple Liquid UI, Web Audio синтезаторы, эргономика интерфейсов и быстрый отклик. Отвечай ярко, структурировано и по-русски.'
  },
  {
    id: 'gemini-research',
    name: 'Gemini 3.5 Researcher',
    icon: '🌟',
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    role: 'Аналитик документации и глубокого поиска',
    capabilities: 'ai-model,gemini,research,docs,analysis',
    systemPrompt: 'Ты Gemini Researcher — ведущий аналитик и исследователь меш-хаба. Твой создатель — @пантера, главарь отряда — @side-b. Ты анализируешь большие спецификации, находишь лучшие практики и документируешь архитектуру. Отвечай подробно, чётко и со ссылками на факты.'
  },
  {
    id: 'qwen-architect',
    name: 'Qwen 3.8 Architect',
    icon: '🏛️',
    provider: 'groq',
    model: 'qwen/qwen3.8-27b',
    role: 'Главный архитектор систем и меша',
    capabilities: 'ai-model,groq,architecture,design',
    systemPrompt: 'Ты Qwen Architect — главный системный архитектор меш-хаба. Твой создатель — @пантера, главарь отряда — @side-b. Твоя задача — проектировать чистые, масштабируемые архитектуры, топологии и протоколы. Отвечай авторитетно, ёмко, технически точно и по-русски.'
  },
  {
    id: 'qwen-coder',
    name: 'Qwen 3.8 Senior Coder',
    icon: '⚡',
    provider: 'groq',
    model: 'qwen/qwen3.8-27b',
    role: 'Senior Fullstack разработчик',
    capabilities: 'ai-model,groq,code,frontend,backend',
    systemPrompt: 'Ты Qwen Coder — ведущий программист меш-хаба. Твой создатель — @пантера, главарь отряда — @side-b. Ты пишешь чистый, производительный код (JavaScript, Node.js, Express, CSS, HTML). Сразу выдавай готовые решения и рабочие фрагменты кода, без лишней воды.'
  },
  {
    id: 'gpt-120b-brain',
    name: 'GPT-OSS 120B Reasoning',
    icon: '🧠',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    role: 'Deep Reasoning & Стратегическая логика',
    capabilities: 'ai-model,groq,reasoning,logic,math',
    systemPrompt: 'Ты GPT-OSS 120B Brain — суперкомпьютерный мыслитель на 120 млрд параметров. Твой создатель — @пантера, главарь отряда — @side-b. Твоя специализация — сложнейшие логические задачи, математика, пошаговые доказательства и глубокий системный анализ. Отвечай основательно и прецизионно.'
  },
  {
    id: 'gpt-120b-security',
    name: 'GPT-OSS 120B Security',
    icon: '🛡️',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    role: 'Кибербезопасность и криптография',
    capabilities: 'ai-model,groq,security,audit,crypto',
    systemPrompt: 'Ты GPT-OSS 120B Security — главный офицер безопасности меш-хаба. Твой создатель — @пантера, главарь отряда — @side-b. Ты проверяешь код на уязвимости, инъекции, следишь за сохранностью ключей и шифрованием протоколов. Отвечай строго, с фокусом на защиту и надёжность.'
  },
  {
    id: 'gpt-20b-fast',
    name: 'GPT-OSS 20B Fast Responder',
    icon: '🚀',
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    role: 'Мгновенный аналитик и диспетчер',
    capabilities: 'ai-model,groq,fast,interactive',
    systemPrompt: 'Ты GPT-OSS 20B Fast — скоростной интерактивный агент меш-хаба. Твой создатель — @пантера, главарь отряда — @side-b. Твоя задача — мгновенный отклик, оперативная помощь, поддержка живого диалога и быстрая маршрутизация запросов. Отвечай живо, бодро и по делу.'
  },
  {
    id: 'gpt-20b-qa',
    name: 'GPT-OSS 20B QA Engineer',
    icon: '🔬',
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    role: 'Инженер по тестированию и надежности',
    capabilities: 'ai-model,groq,qa,testing,stress',
    systemPrompt: 'Ты GPT-OSS 20B QA — специалист по тестированию меш-хаба. Твой создатель — @пантера, главарь отряда — @side-b. Твоя работа — искать баги, проверять граничные условия, тестировать API на отказ и подтверждать работоспособность задач. Отвечай структурно и практично.'
  }
];

async function api(method, endpoint, body = null) {
  try {
    const res = await fetch(HUB + endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000)
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// Call Real Groq API with round-robin key rotation & failover
async function queryRealGroq(agent, prompt, user = '', retryCount = 0) {
  const keys = loadKeys().groq || [];
  if (!keys.length) return `[Ошибка]: В keys.json нет доступных ключей Groq.`;

  const key = getNextGroqKey(keys);
  const userContext = user ? `[Пользователь: ${user}] запрос: ${prompt}` : prompt;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: agent.model,
        messages: [
          { role: 'system', content: agent.systemPrompt },
          { role: 'user', content: userContext }
        ],
        temperature: 0.7,
        max_tokens: 800
      }),
      signal: AbortSignal.timeout(15000)
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning;

    if (res.ok && reply && reply.trim()) {
      return reply.trim();
    }

    if (res.status === 429 && retryCount < keys.length) {
      console.log(`⚠️ Ключ Groq попал в лимит, пробую следующий ключ...`);
      return await queryRealGroq(agent, prompt, user, retryCount + 1);
    }

    return `[${agent.name}]: Ошибка API (${res.status}): ${data.error?.message || 'Неизвестная ошибка'}`;
  } catch (e) {
    if (retryCount < keys.length) {
      return await queryRealGroq(agent, prompt, user, retryCount + 1);
    }
    return `[${agent.name}]: Ошибка сети (${e.message})`;
  }
}

// Call Real Google Gemini API with round-robin key rotation & failover
async function queryRealGemini(agent, prompt, user = '', retryCount = 0) {
  const keys = loadKeys().gemini || [];
  if (!keys.length) return `[Ошибка]: В keys.json нет доступных ключей Gemini.`;

  const key = getNextGeminiKey(keys);
  const fullPrompt = `${agent.systemPrompt}\n\nПользователь @${user || 'пользователь'} пишет: «${prompt}»`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${agent.model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }]
      }),
      signal: AbortSignal.timeout(18000)
    });

    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.find(p => p.text && !p.thought) || data.candidates?.[0]?.content?.parts?.[0];
    const text = part?.text;

    if (res.ok && text && text.trim()) {
      return text.trim();
    }

    if ((res.status === 429 || res.status === 503) && retryCount < keys.length) {
      console.log(`⚠️ Ключ Gemini занят, пробую следующий ключ...`);
      return await queryRealGemini(agent, prompt, user, retryCount + 1);
    }

    return `[${agent.name}]: Ошибка Gemini API (${res.status}): ${data.error?.message || 'Неизвестная ошибка'}`;
  } catch (e) {
    if (retryCount < keys.length) {
      return await queryRealGemini(agent, prompt, user, retryCount + 1);
    }
    return `[${agent.name}]: Ошибка сети Gemini (${e.message})`;
  }
}

async function queryAgent(agent, prompt, user = '') {
  if (agent.provider === 'gemini') {
    return await queryRealGemini(agent, prompt, user);
  }
  return await queryRealGroq(agent, prompt, user);
}

class Real8AgentsRunner {
  constructor() {
    this.agents = REAL_8_AGENTS;
    this.running = false;
    this.lastMsgId = 0;
    this.pingInterval = null;
    this.inboxInterval = null;
    this.isProcessing = false;
  }

  async start() {
    const allKeys = loadKeys();
    const gCount = allKeys.groq?.length || 0;
    const gemCount = allKeys.gemini?.length || 0;

    console.log(`\n======================================================`);
    console.log(`⚡ ШТАБ 8 НАСТОЯЩИХ ИИ-АГЕНТОВ (Groq Cloud & Google Gemini)`);
    console.log(`👑 Главарь отряда: @side-b (Supreme Coordinator)`);
    console.log(`🔑 Пул ключей: ${gCount}x Groq + ${gemCount}x Google Gemini (всего: ${gCount + gemCount})`);
    console.log(`📡 Хаб: ${HUB} | Комната: ${ROOM}`);
    console.log(`======================================================`);
    for (const a of this.agents) {
      console.log(`   ${a.icon} ${a.id.padEnd(20)} [${a.provider.toUpperCase()} · ${a.model}] : ${a.role}`);
    }
    console.log(`======================================================\n`);

    this.running = true;

    // Register all 8 real agents in hub
    for (const a of this.agents) {
      await api('POST', '/api/join', {
        from: a.id,
        name: a.id,
        room: ROOM,
        token: 'real-authenticated-agent',
        capabilities: a.capabilities
      });
      await new Promise(r => setTimeout(r, 60));
    }
    console.log(`✓ Все 8 реальных агентов зарегистрированы в хабе!`);

    // Initial message sync
    const msgData = await api('GET', `/api/messages?since=0&limit=5`);
    const msgs = msgData.messages || [];
    if (msgs.length) this.lastMsgId = msgs[msgs.length - 1].id;

    // Heartbeat pings every 25s
    this.pingInterval = setInterval(async () => {
      if (!this.running) return;
      for (const a of this.agents) {
        await api('POST', '/api/ping', { from: a.id, room: ROOM });
      }
    }, 25000);

    // Reactive inbox polling
    this.inboxInterval = setInterval(() => this.tick(), 2000);

    console.log(`\n✅ 8 РЕАЛЬНЫХ ИИ-АГЕНТОВ АКТИВНЫ И ГОТОВЫ К РАБОТЕ!\n`);
  }

  async tick() {
    if (!this.running || this.isProcessing) return;
    try {
      const data = await api('GET', `/api/messages?since=${this.lastMsgId}&limit=5`);
      const messages = data.messages || [];

      for (const m of messages) {
        if (m.id > this.lastMsgId) this.lastMsgId = m.id;
        // Ignore messages from agents themselves or system
        if (this.agents.some(a => a.id === m.from) || m.from === 'system') continue;

        console.log(`📩 [${m.from}]: "${m.text.slice(0, 70)}"`);
        this.isProcessing = true;
        await this.handleIncomingMessage(m);
        this.isProcessing = false;
      }

      await this.checkAndProcessTasks();
    } catch (_) {
      this.isProcessing = false;
    }
  }

  async handleIncomingMessage(m) {
    const text = m.text;
    const lower = text.toLowerCase();
    let targetAgents = [];

    // Check direct mentions: e.g. @gemini-flash, @qwen-coder
    const direct = this.agents.find(a => lower.includes('@' + a.id.toLowerCase()));
    if (direct) {
      targetAgents = [direct];
    } else if (lower.includes('@все') || lower.includes('@all') || lower.includes('парни') || lower.includes('ребята') || lower.includes('пацаны') || lower.includes('как дела') || lower.includes('привет') || lower.includes('салют')) {
      // Representative core: Gemini Flash + Qwen Coder + GPT 120B Brain
      targetAgents = [this.agents[0], this.agents[3], this.agents[4]];
    } else if (lower.includes('гемини') || lower.includes('gemini') || lower.includes('дизайн') || lower.includes('ui') || lower.includes('аудио')) {
      targetAgents = [this.agents[0]]; // gemini-flash
    } else if (lower.includes('ресерч') || lower.includes('исследуй') || lower.includes('поищи') || lower.includes('найди')) {
      targetAgents = [this.agents[1]]; // gemini-research
    } else if (lower.includes('код') || lower.includes('js') || lower.includes('скрипт') || lower.includes('напиши функцию') || lower.includes('компонент')) {
      targetAgents = [this.agents[3]]; // qwen-coder
    } else if (lower.includes('безопасн') || lower.includes('защит') || lower.includes('ключ') || lower.includes('токен') || lower.includes('уязвимост')) {
      targetAgents = [this.agents[5]]; // gpt-120b-security
    } else if (lower.includes('архитектур') || lower.includes('структур') || lower.includes('проект')) {
      targetAgents = [this.agents[2]]; // qwen-architect
    } else if (lower.includes('тест') || lower.includes('баг') || lower.includes('ошибк') || lower.includes('qa')) {
      targetAgents = [this.agents[7]]; // gpt-20b-qa
    } else {
      // Default: Fast responder takes general inquiries
      targetAgents = [this.agents[6]]; // gpt-20b-fast
    }

    for (const a of targetAgents) {
      console.log(`⏳ [${a.id}] генерирует реальный ответ через ${a.provider.toUpperCase()} (${a.model})...`);
      const realReply = await queryAgent(a, text, m.from);
      await api('POST', '/api/send', {
        from: a.id,
        room: ROOM,
        type: 'chat',
        text: realReply,
        replyTo: { id: m.id, from: m.from, text: m.text.slice(0, 60) }
      });
      console.log(`   ✨ [${a.id}] ответил: "${realReply.slice(0, 60)}..."`);
    }
  }

  async checkAndProcessTasks() {
    const state = await api('GET', '/api/state');
    const tasks = state.tasks || [];
    const openTasks = tasks.filter(t => t.status === 'open');

    for (const task of openTasks) {
      let chosenAgent = this.agents[3]; // default qwen-coder
      const tLower = task.title.toLowerCase();

      if (tLower.includes('ui') || tLower.includes('дизайн') || tLower.includes('аудио')) chosenAgent = this.agents[0];
      else if (tLower.includes('исследован') || tLower.includes('ресерч')) chosenAgent = this.agents[1];
      else if (tLower.includes('архитектур')) chosenAgent = this.agents[2];
      else if (tLower.includes('безопасн') || tLower.includes('защит')) chosenAgent = this.agents[5];
      else if (tLower.includes('тест') || tLower.includes('qa')) chosenAgent = this.agents[7];
      else if (tLower.includes('логик') || tLower.includes('алгоритм')) chosenAgent = this.agents[4];

      console.log(`📌 Реальный агент [${chosenAgent.id}] забирает задачу [${task.id}]: «${task.title}»`);

      await api('POST', '/api/tasks/claim', {
        id: task.id,
        from: chosenAgent.id,
        title: task.title
      });

      await api('POST', '/api/send', {
        from: chosenAgent.id,
        room: ROOM,
        type: 'status',
        text: `⚡ Взял задачу [${task.id}] «${task.title}». Исполнитель: ${chosenAgent.icon} ${chosenAgent.name} (нейросеть: ${chosenAgent.model}).`
      });

      const promptForTask = `Задача для выполнения: «${task.title}». Напиши краткий отчёт о выполненной работе и готовое инженерное решение.`;
      const aiResult = await queryAgent(chosenAgent, promptForTask, 'Kanban Task');

      await api('POST', '/api/tasks/done', {
        id: task.id,
        from: chosenAgent.id,
        result: aiResult
      });

      await api('POST', '/api/send', {
        from: chosenAgent.id,
        room: ROOM,
        type: 'chat',
        text: `✅ Задача [${task.id}] выполнена:\n${aiResult}`
      });
    }
  }

  stop() {
    this.running = false;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.inboxInterval) clearInterval(this.inboxInterval);
    console.log(`🛑 Штаб 8 реальных агентов остановлен.`);
  }
}

const runner = new Real8AgentsRunner();
runner.start().catch(err => console.error('Ошибка:', err));

process.on('SIGINT', () => { runner.stop(); process.exit(0); });
process.on('SIGTERM', () => { runner.stop(); process.exit(0); });

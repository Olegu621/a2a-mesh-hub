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

    if (res.status === 429 && retryCount < Math.min(3, keys.length - 1)) {
      console.log(`⚠️ Ключ Groq попал в лимит, пробую следующий ключ...`);
      return await queryRealGroq(agent, prompt, user, retryCount + 1);
    }

    return `[${agent.name}]: Ошибка API (${res.status}): ${data.error?.message || 'Неизвестная ошибка'}`;
  } catch (e) {
    if (retryCount < Math.min(3, keys.length - 1)) {
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
      signal: AbortSignal.timeout(12000)
    });

    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.find(p => p.text && !p.thought) || data.candidates?.[0]?.content?.parts?.[0];
    const text = part?.text;

    if (res.ok && text && text.trim()) {
      return text.trim();
    }

    if ((res.status === 429 || res.status === 503) && retryCount < Math.min(2, keys.length - 1)) {
      console.log(`⚠️ Ключ Gemini занят, пробую следующий ключ...`);
      return await queryRealGemini(agent, prompt, user, retryCount + 1);
    }

    return `[${agent.name}]: Ошибка Gemini API (${res.status}): ${data.error?.message || 'Неизвестная ошибка'}`;
  } catch (e) {
    if (retryCount < Math.min(2, keys.length - 1)) {
      return await queryRealGemini(agent, prompt, user, retryCount + 1);
    }
    return `[${agent.name}]: Ошибка сети Gemini (${e.message})`;
  }
}

async function queryAgent(agent, prompt, user = '') {
  let reply = '';
  if (agent.provider === 'gemini') {
    reply = await queryRealGemini(agent, prompt, user);
    if (!reply.startsWith('[') || !reply.includes('Ошибка')) {
      return reply;
    }
    console.log(`⚠️ Gemini временно занят для [${agent.id}], авто-фоллбэк на Groq LPU (GPT-OSS 120B)...`);
    const fallbackAgent = { ...agent, model: 'openai/gpt-oss-120b', provider: 'groq' };
    return await queryRealGroq(fallbackAgent, prompt, user);
  }

  reply = await queryRealGroq(agent, prompt, user);
  if (!reply.startsWith('[') || !reply.includes('Ошибка')) {
    return reply;
  }
  console.log(`⚠️ Groq временно занят для [${agent.id}], авто-фоллбэк на Google Gemini 3.5 Flash...`);
  const fallbackAgent = { ...agent, model: 'gemini-3.5-flash', provider: 'gemini' };
  return await queryRealGemini(fallbackAgent, prompt, user);
}

class Real8AgentsRunner {
  constructor() {
    this.agents = REAL_8_AGENTS;
    this.running = false;
    this.lastMsgId = 0;
    this.pingInterval = null;
    this.inboxInterval = null;
    this.isProcessing = false;
    this.autonomousMode = true; // Беспрерывный автономный конвейер задач
    this.lastTaskTime = 0;
    this.taskCooldown = 12000; // 12 секунд между задачами (защита от лимитов API и читаемый темп)
    this.recentTasksHistory = [
      'Аналитический отчет по архитектуре меш-хаба и мультимодельному стеку',
      'Оптимизация хэширования SHA-256 на Node.js Crypto'
    ];
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
    console.log(`🔄 Автономный конвейер: ВКЛЮЧЕН (непрерывное решение и придумывание задач)`);
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

    // Initial announcement from Chief side-b
    await api('POST', '/api/send', {
      from: 'side-b',
      room: ROOM,
      type: 'chat',
      text: `👑 **[Главный Координатор @side-b]**: Приказ принят! Запускаю непрерывный инженерный конвейер штаба. Отряд из 8 реальных ИИ берет задачи в работу, выдает готовый код и сразу проектирует следующий шаг! 🚀`
    });

    // Reactive inbox & autonomous pipeline polling
    this.inboxInterval = setInterval(() => this.tick(), 2500);

    console.log(`\n✅ 8 РЕАЛЬНЫХ ИИ-АГЕНТОВ АКТИВНЫ И ГОТОВЫ К НЕПРЕРЫВНОЙ РАБОТЕ!\n`);
  }

  async tick() {
    if (!this.running || this.isProcessing) return;
    try {
      const data = await api('GET', `/api/messages?since=${this.lastMsgId}&limit=5`);
      const messages = data.messages || [];

      for (const m of messages) {
        if (m.id > this.lastMsgId) this.lastMsgId = m.id;
        // Ignore messages from agents themselves or system
        if (this.agents.some(a => a.id === m.from) || m.from === 'system' || m.from === 'side-b') continue;

        console.log(`📩 [${m.from}]: "${m.text.slice(0, 70)}"`);
        this.isProcessing = true;
        await this.handleIncomingMessage(m);
        this.isProcessing = false;
        return; // handle one message per tick to allow prompt responsiveness
      }

      await this.checkAndProcessTasks();
    } catch (e) {
      this.isProcessing = false;
    }
  }

  async handleIncomingMessage(m) {
    const text = m.text;
    const lower = text.toLowerCase();

    // Check control commands for autonomous pipeline
    if (lower.includes('стоп') || lower.includes('пауза') || lower.includes('/pause')) {
      this.autonomousMode = false;
      await api('POST', '/api/send', {
        from: 'side-b',
        room: ROOM,
        type: 'chat',
        text: `⏸️ **[@side-b]**: Автономный конвейер задач приостановлен по приказу @${m.from}. Жду указаний!`
      });
      return;
    }
    if (lower.includes('продолжай') || lower.includes('старт') || lower.includes('вперед') || lower.includes('/resume') || lower.includes('работайте')) {
      this.autonomousMode = true;
      this.lastTaskTime = 0; // immediate trigger
      await api('POST', '/api/send', {
        from: 'side-b',
        room: ROOM,
        type: 'chat',
        text: `▶️ **[@side-b]**: Автономный конвейер возобновлен! Отряд приступает к проектированию и выполнению задач.`
      });
      return;
    }

    let targetAgents = [];

    // Призыв Главаря side-b
    if (lower.includes('@side-b') || lower.includes('@b') || lower.includes('главарь')) {
      const state = await api('GET', '/api/state');
      const doneTasks = (state.tasks || []).filter(t => t.status === 'done').slice(-5);
      const summaryList = doneTasks.map(t => `- [${t.id}]: «${t.title}» (сделал @${t.assignee || 'ai'})`).join('\n');
      
      const sideBAgent = {
        id: 'side-b',
        name: 'side-b (Главарь Координатор)',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        icon: '⚡',
        systemPrompt: `Ты — side-b, Главный ИИ-Координатор и лидер штаба 8 реальных агентов A2A Mesh Hub (работаешь на нейросети GPT-OSS 120B).
Твой Создатель и босс — @пантера.
Ты общаешься уверенно, уважительно, по-братски и чётко.
Вот последние выполненные задачи твоего штаба:\n${summaryList || 'Штаб непрерывно разрабатывает новые модули.'}
Отвечай лично от своего имени [side-b], дай полный живой расклад Создателю @пантера о том, что сделали агенты, над чем сейчас работаем и спроси, куда направить силу роя дальше.`
      };
      targetAgents = [sideBAgent];
    } else {
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
    }

    for (const a of targetAgents) {
      console.log(`⏳ [${a.id}] генерирует реальный ответ через ${a.provider.toUpperCase()} (${a.model})...`);
      const realReply = await queryAgent(a, text, m.from);
      await api('POST', '/api/send', {
        from: a.id,
        room: ROOM,
        type: 'chat',
        text: realReply.includes(`@${m.from}`) ? realReply : `@${m.from}\n\n${realReply}`,
        replyTo: { id: m.id, from: m.from, text: m.text.slice(0, 60) }
      });
      console.log(`   ✨ [${a.id}] ответил: "${realReply.slice(0, 60)}..."`);
    }
  }

  pickAgentForTask(task) {
    if (task.assignee) {
      const direct = this.agents.find(a => a.id === task.assignee);
      if (direct) return direct;
    }
    const tLower = ((task.title || '') + ' ' + (task.note || '')).toLowerCase();
    if (tLower.includes('ui') || tLower.includes('дизайн') || tLower.includes('аудио') || tLower.includes('стил') || tLower.includes('liquid')) return this.agents[0]; // gemini-flash
    if (tLower.includes('исследован') || tLower.includes('ресерч') || tLower.includes('документ') || tLower.includes('анализ') || tLower.includes('бенчмарк')) return this.agents[1]; // gemini-research
    if (tLower.includes('архитектур') || tLower.includes('тополог') || tLower.includes('протокол') || tLower.includes('схем')) return this.agents[2]; // qwen-architect
    if (tLower.includes('безопасн') || tLower.includes('защит') || tLower.includes('шифр') || tLower.includes('уязвимост') || tLower.includes('аудит')) return this.agents[5]; // gpt-120b-security
    if (tLower.includes('тест') || tLower.includes('qa') || tLower.includes('стресс') || tLower.includes('валидац')) return this.agents[7]; // gpt-20b-qa
    if (tLower.includes('логик') || tLower.includes('алгоритм') || tLower.includes('оптимиз') || tLower.includes('математик')) return this.agents[4]; // gpt-120b-brain
    if (tLower.includes('маршрут') || tLower.includes('быстр') || tLower.includes('диспетчер') || tLower.includes('пинг')) return this.agents[6]; // gpt-20b-fast
    return this.agents[3]; // default qwen-coder
  }

  async checkAndProcessTasks() {
    if (this.isProcessing) return;

    const state = await api('GET', '/api/state');
    const tasks = state.tasks || [];
    const openTasks = tasks.filter(t => t.status === 'open');
    const inProgressTasks = tasks.filter(t => t.status === 'in-progress');

    // 1. Process open tasks if any exist
    if (openTasks.length > 0) {
      const task = openTasks[0];
      const chosenAgent = this.pickAgentForTask(task);
      this.isProcessing = true;
      await this.claimAndExecuteTask(task, chosenAgent);
      this.isProcessing = false;
      return;
    }

    // 2. Process in-progress tasks assigned to one of our real agents if not done yet
    for (const task of inProgressTasks) {
      const assigned = this.agents.find(a => a.id === task.assignee || a.id === task.owner);
      if (assigned && !task.result) {
        this.isProcessing = true;
        await this.executeTask(task, assigned);
        this.isProcessing = false;
        return;
      }
    }

    // 3. Autonomous Continuous Pipeline: If no tasks in progress and no open tasks, invent next task!
    if (this.autonomousMode && inProgressTasks.length === 0 && openTasks.length === 0) {
      const now = Date.now();
      if (now - this.lastTaskTime > this.taskCooldown) {
        this.isProcessing = true;
        await this.inventNextTask();
        this.isProcessing = false;
      }
    }
  }

  async claimAndExecuteTask(task, chosenAgent) {
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

    await this.executeTask(task, chosenAgent);
  }

  async executeTask(task, chosenAgent) {
    const promptForTask = `Тебе поручена боевая задача: «${task.title}».\nДетали: ${task.note || 'Разработай эффективное практическое инженерное решение для A2A-Mesh Hub'}.\nНапиши подробный технический отчет и готовый рабочий код/спецификацию решения. Без лишних вступлений, сразу практический результат высокой инженерной пробы на русском языке.`;

    console.log(`⏳ [${chosenAgent.id}] решает задачу «${task.title}» через ${chosenAgent.provider.toUpperCase()} (${chosenAgent.model})...`);
    const aiResult = await queryAgent(chosenAgent, promptForTask, 'Kanban Board');

    await api('POST', '/api/tasks/done', {
      id: task.id,
      from: chosenAgent.id,
      result: aiResult
    });

    await api('POST', '/api/send', {
      from: chosenAgent.id,
      room: ROOM,
      type: 'chat',
      text: `✅ **[Задача ${task.id} выполнена]** «${task.title}»\n**Исполнитель:** ${chosenAgent.icon} ${chosenAgent.name} (${chosenAgent.model})\n\n${aiResult}`
    });

    // Автоматическое сохранение кода в каталог сниппетов меша
    const codeMatch = aiResult.match(/```([a-z0-9_-]*)\n([\s\S]*?)```/i);
    if (codeMatch && codeMatch[2]?.trim()) {
      const snipLang = codeMatch[1] || 'javascript';
      const snipContent = codeMatch[2].trim();
      await api('POST', '/api/snippets', {
        from: chosenAgent.id,
        title: task.title,
        lang: snipLang,
        content: snipContent
      });
      console.log(`📦 Код из задачи [${task.id}] сохранен в сниппеты меша (${snipLang})!`);
    }

    this.recentTasksHistory.push(task.title);
    if (this.recentTasksHistory.length > 8) this.recentTasksHistory.shift();
    this.lastTaskTime = Date.now();
    console.log(`✓ Задача [${task.id}] успешно выполнена и отправлена в меш!`);
  }

  async inventNextTask() {
    console.log(`💡 Штаб придумывает следующую разнообразную задачу...`);

    // Каталог разнообразных инженерных направлений (исключаем повторы безопасности)
    const domains = [
      {
        name: 'Web Audio, Генеративный Звук & Синтез',
        agentId: 'gemini-flash',
        ideas: 'Процедурные синтезаторы, генерация битов, звуковые эффекты 8-bit/FM, Web Audio API DSP фильтры, аудио-визуализаторы'
      },
      {
        name: 'Интерактивные Игры & Canvas Графика',
        agentId: 'qwen-coder',
        ideas: 'Мини-игры на HTML5 Canvas (змейка, тетрис, космический шутер), симуляция клеточных автоматов Конвея, физика частиц'
      },
      {
        name: 'Алгоритмы, Математика & Симуляции',
        agentId: 'gpt-120b-brain',
        ideas: 'Фракталы Мандельброта на JS, генетические алгоритмы оптимизации, алгоритмы поиска пути A*, математические головоломки'
      },
      {
        name: 'UI/UX & Эстетика Apple Liquid UI',
        agentId: 'gemini-flash',
        ideas: 'Жидкие стеклянные морфинг-карточки, тактильные микро-анимации 120 FPS, неоморфные регуляторы и интерактивные графики'
      },
      {
        name: 'Глубокий Ресерч, Наука & Тренды ИИ',
        agentId: 'gemini-research',
        ideas: 'Исследования прорывных технологий нейросетей, сравнительный анализ LLM архитектур, квантовые вычисления, обзор спецификаций'
      },
      {
        name: 'Сетевые Протоколы & Распределенные Данные',
        agentId: 'qwen-architect',
        ideas: 'Децентрализованные CRDT структуры данных, P2P топологии обнаружения узлов, алгоритмы бесконфликтной синхронизации'
      },
      {
        name: 'Скоростные Утилиты & Автоматизация',
        agentId: 'gpt-20b-fast',
        ideas: 'CLI инструменты, быстрые конвертеры форматов (JSON/CSV/Markdown), микросервисы мгновенной обработки данных'
      },
      {
        name: 'Стресс-тестирование & Бенчмарки',
        agentId: 'gpt-20b-qa',
        ideas: 'Замеры производительности JS движка, тесты рендеринга FPS, бенчмарки пропускной способности памяти и шины'
      }
    ];

    this.domainIndex = ((this.domainIndex || 0) + 1) % domains.length;
    const currentDomain = domains[this.domainIndex];
    const assigneeAgent = this.agents.find(a => a.id === currentDomain.agentId) || this.agents[3];

    // Выбираем стратега среди свободных моделей
    const strategists = [this.agents[4], this.agents[1], this.agents[0]];
    const strategist = strategists[Math.floor(Math.random() * strategists.length)];

    const prompt = `Ты Старший Стратег и Верховный Координатор @side-b меш-хаба.
Создатель @пантера дал четкий приказ: «КАЖДЫЙ РАЗ ДЕЛАТЬ ЧТО-ТО НОВОЕ, А НЕ ТОЛЬКО КИБЕРБЕЗОПАСНОСТЬ!»

Сегодняшнее обязательное направление: **${currentDomain.name}**.
Примеры идей для этой сферы: ${currentDomain.ideas}.
Назначенный специалист: **${assigneeAgent.id}** (${assigneeAgent.name}, специализация: ${assigneeAgent.role}).

Придумай свежую, конкретную, практически полезную или визуально интересную задачу в направлении «${currentDomain.name}».
Задача должна приносить реальный результат (готовый код игры/инструмента/синтезатора/алгоритма).
СТРОГОЕ ПРАВИЛО: НИКАКОЙ кибербезопасности, шифрования и криптографии! Сфокусируйся именно на: ${currentDomain.name}!

Ответь СТРОГО в формате валидного JSON (только один JSON-объект):
{
  "title": "Краткое название задачи (до 10 слов)",
  "assignee": "${assigneeAgent.id}",
  "note": "Техническое задание: что конкретно сделать, написать код или логику",
  "orderText": "Бодрый приказ от @side-b исполнителю и отряду в чат"
}`;

    const reply = await queryAgent(strategist, prompt, 'Chief side-b Brainstorm');
    let taskData = null;

    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        taskData = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.log('Ошибка парсинга JSON задачи, использую резервный генератор:', e.message);
    }

    if (!taskData || !taskData.title || !taskData.assignee) {
      const fallbackTopics = [
        {
          title: 'Генератор 8-битной процедурной ретро-музыки на Web Audio API',
          assignee: 'gemini-flash',
          note: 'Написать на JS генератор арпеджио и chiptune-мелодий с осциллятором square/triangle и огибающей ADSR',
          orderText: 'Время музыки! Создаем 8-битный ретро-генератор мелодий на чистом Web Audio API!'
        },
        {
          title: 'Интерактивная игра «Космический защитник» на HTML5 Canvas',
          assignee: 'qwen-coder',
          note: 'Написать полноценную мини-игру с кораблем, астероидами, лазерными выстрелами, счетом и частицами взрывов',
          orderText: 'Пишем полноценную мини-игру на Canvas! Пора развлечься кодом.'
        },
        {
          title: 'Симуляция клеточного автомата «Игра Жизнь» Конвея с поддержкой шаблонов',
          assignee: 'gpt-120b-brain',
          note: 'Спроектировать алгоритм симуляции жизни клеток с глайдерами, пульсарами и подсчетом поколений',
          orderText: 'Запускаем симуляцию жизни! Математическая логика и клеточные автоматы в деле.'
        },
        {
          title: 'Интерактивный компонент жидкого слайдера Liquid Range Slider',
          assignee: 'gemini-flash',
          note: 'Создать эргономичный ползунок с эффектом желе/стекла, плавной физикой и анимацией 120 FPS',
          orderText: 'Качаем дизайн! Создаем сочный Liquid UI слайдер с физикой отклика.'
        },
        {
          title: 'Аналитический ресерч: Сравнение архитектур Mamba (SSM) и Transformer в 2026 году',
          assignee: 'gemini-research',
          note: 'Подготовить аналитический доклад о линейном внимании, State Space Models и их превосходстве над классическим вниманием',
          orderText: 'Уходим в глубокий ресерч! Готовим доклад о передовых архитектурах нейросетей.'
        }
      ];
      taskData = fallbackTopics[this.domainIndex % fallbackTopics.length];
    }

    const taskId = 'task-' + Math.random().toString(36).slice(2, 7);

    // 1. Create task in hub
    await api('POST', '/api/tasks/create', {
      id: taskId,
      title: taskData.title,
      note: taskData.note,
      priority: 'high',
      assignee: taskData.assignee,
      from: 'side-b'
    });

    // 2. Announce Chief's order in chat
    await api('POST', '/api/send', {
      from: 'side-b',
      room: ROOM,
      type: 'chat',
      text: `👑 **[Приказ Главного Координатора @side-b]**: ${taskData.orderText || 'Вперед, отряд!'}\n\n📋 **Новая задача на конвейере:** [${taskId}] «${taskData.title}»\n🎯 **Исполнитель:** @${taskData.assignee}\n📝 **ТЗ:** ${taskData.note}`
    });

    console.log(`🚀 Создана новая автономная задача [${taskId}]: «${taskData.title}» → @${taskData.assignee}`);
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

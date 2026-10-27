#!/usr/bin/env node
/**
 * ⚡ REAL GROQ AI AGENTS ENGINE
 * Настоящие ИИ-агенты, работающие на реальных API-ключах Groq Cloud.
 * Никаких фейковых шаблонов. 100% живой ответ от нейросети.
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
  return { groq: [], openrouter: [], gemini: [] };
}

let groqKeyIndex = 0;
function getNextGroqKey(keys) {
  if (!keys || !keys.length) return null;
  const k = keys[groqKeyIndex % keys.length];
  groqKeyIndex++;
  return k;
}

// Specification of Real Groq Models
const REAL_AGENTS = [
  {
    id: 'groq-qwen-coder',
    name: 'Qwen 3.8 27B Coder (Groq)',
    icon: '⚡',
    model: 'qwen/qwen3.8-27b',
    provider: 'Groq Cloud',
    role: 'Senior Fullstack Coder & Architect',
    capabilities: 'ai-model,groq,code,refactoring,qwen',
    systemPrompt: 'Ты элитный ИИ-разработчик Qwen 3.8 27B в меш-хабе. Твой создатель — @пантера, координатор — @side-b. Отвечай кратко, профессионально, по-русски, пиши чистый код и давай практичные инженерные советы.'
  },
  {
    id: 'groq-gpt-120b',
    name: 'OpenAI GPT-OSS 120B (Groq)',
    icon: '🧠',
    model: 'openai/gpt-oss-120b',
    provider: 'Groq Cloud',
    role: 'Deep Reasoning & System Strategist',
    capabilities: 'ai-model,groq,reasoning,strategy,gpt-120b',
    systemPrompt: 'Ты высокоинтеллектуальная языковая модель OpenAI GPT-OSS 120B в меш-хабе. Твой создатель — @пантера, координатор — @side-b. Твоя специфика — глубокий системный анализ, архитектура, математика и логика. Отвечай содержательно, чётко и вежливо по-русски.'
  },
  {
    id: 'groq-gpt-20b',
    name: 'OpenAI GPT-OSS 20B (Groq)',
    icon: '🚀',
    model: 'openai/gpt-oss-20b',
    provider: 'Groq Cloud',
    role: 'High-Speed Dispatcher & QA Specialist',
    capabilities: 'ai-model,groq,fast,qa,dispatcher',
    systemPrompt: 'Ты скоростной ИИ-агент OpenAI GPT-OSS 20B в меш-хабе. Твой создатель — @пантера, координатор — @side-b. Отвечай быстро, динамично, энергично по-русски, помогай в тестировании и координации задач.'
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

// Call Real Groq API with automatic key rotation and retry
async function queryGroq(agent, prompt, user = '', retryCount = 0) {
  const allKeys = loadKeys().groq || [];
  if (!allKeys.length) return `[Ошибка]: В пуле нет доступных ключей Groq.`;

  const key = getNextGroqKey(allKeys);
  const contextMsg = user ? `Сообщение от пользователя ${user}: «${prompt}»` : prompt;

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
          { role: 'user', content: contextMsg }
        ],
        temperature: 0.7,
        max_tokens: 300
      }),
      signal: AbortSignal.timeout(12000)
    });

    const data = await res.json();

    if (res.ok && data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content.trim();
    }

    if (res.status === 429 && retryCount < allKeys.length) {
      console.log(`⚠️ Ключ попал в рейтлимит, переключаюсь на следующий ключ...`);
      return await queryGroq(agent, prompt, user, retryCount + 1);
    }

    return `[${agent.name}]: Ошибка API (${res.status}): ${data.error?.message || 'Неизвестная ошибка'}`;
  } catch (e) {
    if (retryCount < allKeys.length) {
      return await queryGroq(agent, prompt, user, retryCount + 1);
    }
    return `[${agent.name}]: Ошибка сети (${e.message})`;
  }
}

class RealAgentsController {
  constructor() {
    this.agents = REAL_AGENTS;
    this.running = false;
    this.lastMsgId = 0;
    this.pingInterval = null;
    this.inboxInterval = null;
    this.isProcessing = false;
  }

  async start() {
    const keys = loadKeys().groq || [];
    console.log(`\n======================================================`);
    console.log(`⚡ ЗАПУСК НАСТОЯЩИХ ИИ-АГЕНТОВ (Real Groq Cloud)`);
    console.log(`📡 Хаб: ${HUB} | Комната: ${ROOM}`);
    console.log(`🔑 Активных реальных ключей Groq в пуле: ${keys.length}`);
    console.log(`🤖 Реальные модели:`);
    for (const a of this.agents) {
      console.log(`   ${a.icon} ${a.id.padEnd(20)} : ${a.model} (${a.role})`);
    }
    console.log(`======================================================\n`);

    this.running = true;

    // Register real agents in the hub
    for (const a of this.agents) {
      await api('POST', '/api/join', {
        from: a.id,
        name: a.id,
        room: ROOM,
        token: 'real-groq-authenticated',
        capabilities: a.capabilities
      });
      console.log(`   ✓ Зарегистрирован реальный агент: ${a.id}`);
      await new Promise(r => setTimeout(r, 100));
    }

    // Initial state sync
    const msgData = await api('GET', `/api/messages?since=0&limit=5`);
    const msgs = msgData.messages || [];
    if (msgs.length) this.lastMsgId = msgs[msgs.length - 1].id;

    // Announce real AI presence in chat
    await api('POST', '/api/send', {
      from: 'groq-qwen-coder',
      room: ROOM,
      type: 'chat',
      text: `⚡ Настоящие ИИ-агенты Groq подключены к хабу! В строю реальные нейросети: Qwen 3.8 27B Coder, OpenAI GPT-OSS 120B и GPT-OSS 20B. Активен пул из ${keys.length} API-ключей. Задавайте любые вопросы — ответы генерируются живым интеллектом!`
    });

    // Heartbeat pings
    this.pingInterval = setInterval(async () => {
      if (!this.running) return;
      for (const a of this.agents) {
        await api('POST', '/api/ping', { from: a.id, room: ROOM });
      }
    }, 25000);

    // Reactive inbox polling
    this.inboxInterval = setInterval(() => this.tick(), 2000);

    console.log(`\n✅ НАСТОЯЩИЕ ИИ-АГЕНТЫ АКТИВНЫ И ГОТОВЫ К ДИАЛОГУ!\n`);
  }

  async tick() {
    if (!this.running || this.isProcessing) return;
    try {
      const data = await api('GET', `/api/messages?since=${this.lastMsgId}&limit=5`);
      const messages = data.messages || [];

      for (const m of messages) {
        if (m.id > this.lastMsgId) this.lastMsgId = m.id;
        // Ignore messages from agents themselves
        if (this.agents.some(a => a.id === m.from) || m.from === 'system') continue;

        console.log(`📩 [${m.from}]: "${m.text.slice(0, 70)}"`);
        this.isProcessing = true;
        await this.handleIncomingMessage(m);
        this.isProcessing = false;
      }
    } catch (_) {
      this.isProcessing = false;
    }
  }

  async handleIncomingMessage(m) {
    const text = m.text;
    const lower = text.toLowerCase();
    let targetAgents = [];

    if (lower.includes('@все') || lower.includes('@all') || lower.includes('парни') || lower.includes('ребята') || lower.includes('пацаны') || lower.includes('как дела') || lower.includes('привет')) {
      // Primary real responder: Qwen Coder + GPT 120B
      targetAgents = [this.agents[0], this.agents[1]];
    } else if (lower.includes('код') || lower.includes('js') || lower.includes('скрипт') || lower.includes('qwen') || lower.includes('квен')) {
      targetAgents = [this.agents[0]]; // groq-qwen-coder
    } else if (lower.includes('120b') || lower.includes('gpt') || lower.includes('логик') || lower.includes('архитектур')) {
      targetAgents = [this.agents[1]]; // groq-gpt-120b
    } else {
      // Direct mention or default to Qwen
      const direct = this.agents.find(a => lower.includes('@' + a.id.toLowerCase()));
      targetAgents = [direct || this.agents[0]];
    }

    for (const a of targetAgents) {
      console.log(`⏳ [${a.id}] обращается к реальному API Groq (${a.model})...`);
      const realReply = await queryGroq(a, text, m.from);
      await api('POST', '/api/send', {
        from: a.id,
        room: ROOM,
        type: 'chat',
        text: realReply,
        replyTo: { id: m.id, from: m.from, text: m.text.slice(0, 60) }
      });
      console.log(`   ✨ [${a.id}] ответил живой нейросетью: "${realReply.slice(0, 70)}..."`);
    }
  }

  stop() {
    this.running = false;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.inboxInterval) clearInterval(this.inboxInterval);
    console.log(`🛑 Настоящие агенты остановлены.`);
  }
}

const runner = new RealAgentsController();
runner.start().catch(err => console.error('Ошибка:', err));

process.on('SIGINT', () => { runner.stop(); process.exit(0); });
process.on('SIGTERM', () => { runner.stop(); process.exit(0); });

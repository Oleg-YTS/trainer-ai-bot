import express, { Request, Response } from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manual .env file loader for Sandbox Preview
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const cleanLine = line.trim();
      if (cleanLine && !cleanLine.startsWith('#') && cleanLine.includes('=')) {
        const parts = cleanLine.split('=');
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim();
        // Remove surrounding quotes if present
        val = val.replace(/^['"]|['"]$/g, '');
        if (key && val) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (err) {
  console.error('Failed to load local .env file:', err);
}

// Function to remove emojis to enforce strict Zero-Emoji Policy for AI and system text
function stripEmojis(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim();
}

// Data Models
export interface Category {
  id: string;
  name: string;
  parent_id?: string | null;
  description?: string;
}

export interface Trainer {
  id: number;
  telegram_user_id?: number;
  name: string;
}

export interface ClientProfile {
  name?: string;
  telegram_username?: string;
  gender?: string; // 'male' | 'female'
  age?: number;
  height?: number;
  weight?: number;
  goal?: string;
  activity_level?: string;
  training_frequency?: string;
  diet_preferences?: string;
  restrictions?: string;
  notes?: string;
  intent_analytics?: Record<string, number>;
  active_topic?: string;
  is_vip?: boolean;
  is_admin?: boolean;
}

export interface Client {
  id: number;
  trainer_id: number;
  telegram_user_id: number;
  telegram_username?: string;
  name: string;
  profile: ClientProfile;
  is_vip: boolean; // True for personal training clients
  is_admin?: boolean; // True for administrators/trainers
  created_at: string;
}

export interface KnowledgeItem {
  id: number;
  trainer_id: number;
  category_id: string;
  title: string;
  content: string;
  status: 'approved' | 'draft';
  author_is_trainer: boolean;
  created_at: string;
}

export interface ContentGap {
  id: number;
  question: string;
  category_id: string;
  frequency: number;
  priority: 'high' | 'medium' | 'low';
  sample_llm_answer: string;
  created_at: string;
}

export interface Escalation {
  id: number;
  client_id: number;
  client_name: string;
  reason: string;
  question: string;
  status: 'open' | 'resolved';
  trainer_answer?: string;
  created_at: string;
}

export interface Message {
  id: number;
  client_id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  created_at: string;
  kb_matched?: boolean;
  match_score?: number;
}

// Database with Pre-populated Seed Data
class Database {
  categories: Category[] = [
    { id: 'training', name: 'Тренировочный процесс', parent_id: null, description: 'Силовой тренинг, техника и периодизация' },
    { id: 'nutrition', name: 'Питание и диетология', parent_id: null, description: 'Расчет макросов, рационы и нутрицевтика' },
    { id: 'recovery', name: 'Восстановление и сон', parent_id: null, description: 'Регенерация, биохимия сна и снятие крепатуры' },
    { id: 'weight_loss', name: 'Снижение жировой массы', parent_id: null, description: 'Грамотный дефицит, сохранение мышц и контроль аппетита' },
    { id: 'muscle_gain', name: 'Набор мышечной массы', parent_id: null, description: 'Гипертрофия мышц, профицит и прогрессия нагрузок' },
    { id: 'other', name: 'Общие вопросы методики', parent_id: null, description: 'Методические рекомендации и ответы тренера' },
    { id: 'supplements', name: 'Спортивные добавки', parent_id: 'nutrition', description: 'Креатин, протеин, витамины и адаптогены' },
    { id: 'warmup', name: 'Разминка и техника', parent_id: 'training', description: 'Суставная разминка и профилактика травм' }
  ];

  trainers: Trainer[] = [
    { id: 1, name: 'Денис (Главный тренер)', telegram_user_id: 435297513 }
  ];

  clients: Client[] = [
    {
      id: 1,
      trainer_id: 1,
      telegram_user_id: 435297513,
      telegram_username: 'denis_trainer',
      name: 'Денис (Тренер)',
      is_vip: true,
      is_admin: true,
      profile: {
        name: 'Денис',
        telegram_username: 'denis_trainer',
        gender: 'male',
        goal: 'Главный тренер и наставник',
        activity_level: 'Высокая',
        intent_analytics: { muscle_gain: 10, training: 10, nutrition: 8, recovery: 8 },
        active_topic: 'training'
      },
      created_at: new Date(Date.now() - 30 * 86400000).toISOString()
    },
    {
      id: 2,
      trainer_id: 1,
      telegram_user_id: 747600306,
      telegram_username: 'oleg_admin',
      name: 'Олег (Администратор)',
      is_vip: true,
      is_admin: true,
      profile: {
        name: 'Олег',
        telegram_username: 'oleg_admin',
        gender: 'male',
        goal: 'Администрирование и развитие системы',
        activity_level: 'Умеренная',
        intent_analytics: { training: 8, nutrition: 6, recovery: 5 },
        active_topic: 'training'
      },
      created_at: new Date(Date.now() - 25 * 86400000).toISOString()
    },
    {
      id: 3,
      trainer_id: 1,
      telegram_user_id: 20001,
      telegram_username: 'ivan_sport',
      name: 'Иван',
      is_vip: false,
      is_admin: false,
      profile: {
        name: 'Иван',
        telegram_username: 'ivan_sport',
        gender: 'male',
        age: 28,
        height: 180,
        weight: 82,
        goal: 'Набор мышечной массы',
        activity_level: 'Умеренная',
        training_frequency: '3 раза в неделю',
        diet_preferences: 'Сбалансированная, высокий белок',
        restrictions: 'Легкий дискомфорт в коленях при глубоких приседаниях',
        intent_analytics: { muscle_gain: 8, training: 6, nutrition: 4, recovery: 2 },
        active_topic: 'muscle_gain'
      },
      created_at: new Date(Date.now() - 7 * 86400000).toISOString()
    },
    {
      id: 4,
      trainer_id: 1,
      telegram_user_id: 20002,
      telegram_username: 'elena_fitness',
      name: 'Елена',
      is_vip: true,
      is_admin: false,
      profile: {
        name: 'Елена',
        telegram_username: 'elena_fitness',
        gender: 'female',
        age: 31,
        height: 165,
        weight: 62,
        goal: 'Снижение жировой массы и тонус',
        training_frequency: '4 раза в неделю',
        intent_analytics: { weight_loss: 10, nutrition: 7, recovery: 3 },
        active_topic: 'weight_loss'
      },
      created_at: new Date(Date.now() - 5 * 86400000).toISOString()
    },
    {
      id: 3,
      trainer_id: 1,
      telegram_user_id: 20003,
      telegram_username: 'alex_power',
      name: 'Алексей',
      is_vip: true,
      profile: {
        name: 'Алексей',
        telegram_username: 'alex_power',
        gender: 'male',
        age: 34,
        height: 175,
        weight: 78,
        goal: 'Силовые показатели и гипертрофия',
        intent_analytics: { training: 9, muscle_gain: 6, recovery: 5 },
        active_topic: 'training'
      },
      created_at: new Date(Date.now() - 4 * 86400000).toISOString()
    },
    {
      id: 4,
      trainer_id: 1,
      telegram_user_id: 20004,
      telegram_username: 'olga_balance',
      name: 'Ольга',
      is_vip: false,
      profile: {
        name: 'Ольга',
        telegram_username: 'olga_balance',
        gender: 'female',
        age: 26,
        height: 168,
        weight: 58,
        goal: 'Рацион питания и энергия',
        intent_analytics: { nutrition: 8, weight_loss: 5, general: 3 },
        active_topic: 'nutrition'
      },
      created_at: new Date(Date.now() - 2 * 86400000).toISOString()
    }
  ];

  knowledge: KnowledgeItem[] = [
    {
      id: 1,
      trainer_id: 1,
      category_id: 'nutrition',
      title: 'Норма белка для набора массы',
      content: 'При целенаправленном наборе мышечной массы суточная норма белка составляет 1.8–2.2 г на 1 кг массы тела. Источники: куриная грудка, индейка, яйца, творог, нежирная говядина, рыба и протеиновый изолят.',
      status: 'approved',
      author_is_trainer: true,
      created_at: new Date(Date.now() - 10 * 86400000).toISOString()
    },
    {
      id: 2,
      trainer_id: 1,
      category_id: 'training',
      title: 'Прогрессия нагрузок и разминка',
      content: 'Перед каждой силовой тренировкой обязательна суставная разминка 5-7 минут и 1-2 разминочных подхода с легким весом. Увеличение рабочих весов должно быть постепенным (не более +2.5-5% в неделю при сохранении правильной техники).',
      status: 'approved',
      author_is_trainer: true,
      created_at: new Date(Date.now() - 9 * 86400000).toISOString()
    },
    {
      id: 3,
      trainer_id: 1,
      category_id: 'recovery',
      title: 'Восстановление и сон',
      content: 'Сон 7-8 часов необходим для синтеза гормона роста и полноценной регенерации мышц. При сильной крепатуре рекомендуется легкая кардио-прогулка, контрастный душ и полноценный гидратационный режим (2.5-3 л воды в день).',
      status: 'approved',
      author_is_trainer: true,
      created_at: new Date(Date.now() - 8 * 86400000).toISOString()
    },
    {
      id: 4,
      trainer_id: 1,
      category_id: 'supplements',
      title: 'Правила приема креатина моногидрата',
      content: 'Принимайте 3-5 грамм креатина моногидрата ежедневно в одно и то же время, запивая достаточным количеством воды или сока. Фаза загрузки не является обязательной.',
      status: 'approved',
      author_is_trainer: true,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString()
    }
  ];

  contentGaps: ContentGap[] = [
    {
      id: 1,
      question: 'Какой перерыв делать между подходами на гипертрофию?',
      category_id: 'hypertrophy',
      frequency: 8,
      priority: 'high',
      sample_llm_answer: 'Для мышечной гипертрофии оптимальный отдых между рабочими подходами составляет от 1.5 до 3 минут.',
      created_at: new Date(Date.now() - 1 * 86400000).toISOString()
    }
  ];

  escalations: Escalation[] = [
    {
      id: 1,
      client_id: 1,
      client_name: 'Иван',
      reason: 'Боль / Дискомфорт при упражнении',
      question: 'Появилась острая боль в правом колене во время выпадов. Что делать?',
      status: 'open',
      created_at: new Date(Date.now() - 1 * 86400000).toISOString()
    }
  ];

  messages: Message[] = [
    {
      id: 1,
      client_id: 1,
      role: 'assistant',
      text: 'Здравствуйте, Иван! Я ассистент-библиотекарь тренера. Готов ответить на вопросы по методике и базе знаний.',
      created_at: new Date(Date.now() - 6 * 86400000).toISOString()
    }
  ];

  nextClientId = 3;
  nextKnowledgeId = 5;
  nextGapId = 2;
  nextEscalationId = 2;
  nextMessageId = 5;
}

const db = new Database();

// ============================================================================
// LLM Provider Service Abstraction (Zero-Emoji, Multi-Provider Support)
// Conforms strictly to Rule #9: Keep the LLM provider behind an abstraction
// ============================================================================
export interface LLMConfig {
  provider: 'ai_tunnel' | 'gemini' | 'openai' | 'auto';
  aitunnelApiKey?: string;
  aitunnelBaseUrl: string;
  aitunnelModel: string;
  geminiApiKey?: string;
  geminiModel: string;
  openaiApiKey?: string;
  openaiBaseUrl: string;
  openaiModel: string;
}

function isValidGeminiApiKey(key?: string): boolean {
  if (!key) return false;
  const k = key.trim();
  // Allow AI Studio sandbox demo keys (starting with AQ.) or standard keys
  return k.length > 10;
}

function isValidApiKey(key?: string): boolean {
  if (!key) return false;
  const k = key.trim();
  return k.length > 5;
}

function cleanApiKey(key?: string): string | undefined {
  if (!key) return undefined;
  return key.trim().replace(/^['"]|['"]$/g, '').trim();
}

export class LLMProviderService {
  private config: LLMConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  public loadConfig(): LLMConfig {
    const rawProvider = (process.env.AI_PROVIDER || 'auto').toLowerCase().trim();
    return {
      provider: (rawProvider as any) || 'auto',
      aitunnelApiKey: cleanApiKey(process.env.AITUNNEL_API_KEY || process.env.AI_TUNNEL_API_KEY),
      aitunnelBaseUrl: (process.env.AITUNNEL_BASE_URL || process.env.AI_TUNNEL_BASE_URL || 'https://api.aitunnel.ru/v1/').replace(/\/+$/, ''),
      aitunnelModel: process.env.AITUNNEL_MODEL || process.env.AI_TUNNEL_MODEL || 'gpt-6-luna-pro',
      geminiApiKey: cleanApiKey(process.env.GEMINI_API_KEY),
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      openaiApiKey: cleanApiKey(process.env.OPENAI_API_KEY),
      openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    };
  }

  public updateRuntimeConfig(updates: Partial<LLMConfig>) {
    this.config = { ...this.config, ...updates };
  }

  public getEffectiveProvider(): { provider: string; model: string; isReady: boolean; reason?: string } {
    const p = this.config.provider;
    const hasAitunnel = isValidApiKey(this.config.aitunnelApiKey);
    const hasGemini = isValidGeminiApiKey(this.config.geminiApiKey);
    const hasOpenai = isValidApiKey(this.config.openaiApiKey);

    // 1. Explicit provider requested and has valid key
    if (p === 'ai_tunnel' && hasAitunnel) {
      return {
        provider: 'ai_tunnel',
        model: this.config.aitunnelModel,
        isReady: true,
        reason: 'AITunnel API key configured'
      };
    }

    if (p === 'gemini' && hasGemini) {
      return {
        provider: 'gemini',
        model: this.config.geminiModel,
        isReady: true,
        reason: 'Google Gemini API key configured'
      };
    }

    if (p === 'openai' && hasOpenai) {
      return {
        provider: 'openai',
        model: this.config.openaiModel,
        isReady: true,
        reason: 'OpenAI API key configured'
      };
    }

    // 2. Auto mode or Fallback chain if primary key is not set
    if (hasAitunnel) {
      return {
        provider: 'ai_tunnel',
        model: this.config.aitunnelModel,
        isReady: true,
        reason: 'AITunnel активен'
      };
    }

    if (hasGemini) {
      return {
        provider: 'gemini',
        model: this.config.geminiModel,
        isReady: true,
        reason: p === 'ai_tunnel'
          ? 'AITUNNEL_API_KEY не задан, активен резервный Google Gemini (gemini-3.8-flash)'
          : 'Google Gemini активен'
      };
    }

    if (hasOpenai) {
      return {
        provider: 'openai',
        model: this.config.openaiModel,
        isReady: true,
        reason: p === 'ai_tunnel'
          ? 'AITUNNEL_API_KEY не задан, активен резервный OpenAI'
          : 'OpenAI активен'
      };
    }

    return {
      provider: p || 'none',
      model: 'none',
      isReady: false,
      reason: 'Ни один валидный API-ключ не настроен в окружении (AITUNNEL_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY)'
    };
  }

  public getStatus() {
    const effective = this.getEffectiveProvider();
    return {
      configured_provider: this.config.provider,
      effective_provider: effective.provider,
      effective_model: effective.model,
      is_ready: effective.isReady,
      status_message: effective.reason,
      providers: {
        ai_tunnel: {
          has_key: isValidApiKey(this.config.aitunnelApiKey),
          base_url: this.config.aitunnelBaseUrl,
          model: this.config.aitunnelModel
        },
        gemini: {
          has_key: isValidGeminiApiKey(this.config.geminiApiKey),
          model: this.config.geminiModel,
          key_prefix: this.config.geminiApiKey ? this.config.geminiApiKey.slice(0, 10) : 'none',
          key_length: this.config.geminiApiKey ? this.config.geminiApiKey.length : 0
        },
        openai: {
          has_key: isValidApiKey(this.config.openaiApiKey),
          base_url: this.config.openaiBaseUrl,
          model: this.config.openaiModel
        }
      }
    };
  }

  public async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const effective = this.getEffectiveProvider();
    if (!effective.isReady) {
      throw new Error(`LLM provider [${effective.provider}] is not ready: ${effective.reason}`);
    }

    if (effective.provider === 'ai_tunnel') {
      return this.callOpenAICompatible(
        this.config.aitunnelBaseUrl,
        this.config.aitunnelApiKey!,
        this.config.aitunnelModel,
        systemPrompt,
        userPrompt
      );
    }

    if (effective.provider === 'openai') {
      return this.callOpenAICompatible(
        this.config.openaiBaseUrl,
        this.config.openaiApiKey!,
        this.config.openaiModel,
        systemPrompt,
        userPrompt
      );
    }

    if (effective.provider === 'gemini') {
      if (this.config.geminiApiKey!.startsWith('AQ.')) {
        // AI Studio Sandbox Demo Key requires v1beta REST endpoint
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.geminiModel}:generateContent?key=${this.config.geminiApiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: `${systemPrompt}\n\nClient Question: ${userPrompt}` }] }
            ]
          })
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Gemini v1beta HTTP ${res.status}: ${errText}`);
        }
        const data: any = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      const genAI = new GoogleGenAI({ apiKey: this.config.geminiApiKey! });
      const response = await genAI.models.generateContent({
        model: this.config.geminiModel,
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nClient Question: ${userPrompt}` }] }
        ]
      });
      return response.text || '';
    }

    throw new Error(`Unsupported provider: ${effective.provider}`);
  }

  private async callOpenAICompatible(
    baseUrl: string,
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBase}/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3
      })
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} from ${url}: ${errBody.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string') {
      throw new Error(`Unexpected response structure from ${url}`);
    }
    return answer;
  }
}

export const llmService = new LLMProviderService();

// Calculate Similarity Score between Question and Knowledge Item
function calculateMatchScore(question: string, item: KnowledgeItem): number {
  const qWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const targetText = `${item.title} ${item.content}`.toLowerCase();

  if (qWords.length === 0) return 0;

  let matchCount = 0;
  for (const word of qWords) {
    if (targetText.includes(word)) {
      matchCount++;
    }
  }

  const score = Math.round((matchCount / qWords.length) * 100);
  return Math.min(score, 100);
}

// Category detection helper for Intent Analytics
function detectTopicCategory(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('жир') || t.includes('похуде') || t.includes('дефицит') || t.includes('сушк') || t.includes('сброс') || t.includes('снижени')) {
    return 'weight_loss';
  }
  if (t.includes('масс') || t.includes('мышц') || t.includes('гипертроф') || t.includes('профицит') || t.includes('рост')) {
    return 'muscle_gain';
  }
  if (t.includes('питан') || t.includes('калори') || t.includes('бжу') || t.includes('белок') || t.includes('углевод') || t.includes('диета') || t.includes('рацион') || t.includes('нутриент')) {
    return 'nutrition';
  }
  if (t.includes('сон') || t.includes('восстановл') || t.includes('отдых') || t.includes('стресс') || t.includes('пульс')) {
    return 'recovery';
  }
  if (t.includes('трениров') || t.includes('упражнен') || t.includes('подход') || t.includes('повторен') || t.includes('жим') || t.includes('присед') || t.includes('тяг') || t.includes('программ')) {
    return 'training';
  }
  return 'general';
}

// AI Engine conforming strictly to Zero Emoji Policy & 70% Score Threshold Rule
async function processClientQuery(
  question: string,
  clientProfile: ClientProfile,
  approvedKnowledge: KnowledgeItem[]
): Promise<{
  answer: string;
  matched_kb?: KnowledgeItem;
  match_score: number;
  needs_trainer: boolean;
  escalation_reason?: string;
}> {
  // Medical & Injury Keyword Check
  const lowerQ = question.toLowerCase();

  const topicDiscoveryKeywords = [
    'поговорим',
    'о чем',
    'о чём',
    'какие темы',
    'темы',
    'какие разделы',
    'разделы',
    'список тем',
    'список разделов',
    'по каким вопросам',
    'по каким темам',
    'какие категории',
    'база знаний темы',
    'что ты умеешь',
    'что умеешь',
    'чем можешь помочь',
    'чем помочь',
    'специализация'
  ];

  if (topicDiscoveryKeywords.some(kw => lowerQ.includes(kw))) {
    const canonicalTopicsAnswer =
      'Я могу проконсультировать вас по следующим 6 разделам методики:\n\n' +
      '1. Тренировочный процесс — техника выполнения упражнений, составление программ и прогрессия нагрузок.\n' +
      '2. Питание и диетология — расчет калорийности, баланс БЖУ, составление рациона и нутриенты.\n' +
      '3. Восстановление и сон — гигиена сна, регенерация мышц и снятие напряжения после нагрузок.\n' +
      '4. Снижение жировой массы — грамотный дефицит калорий, сохранение мышц при худении и контроль аппетита.\n' +
      '5. Набор мышечной массы — профицит питания, гипертрофия мышц и рост силовых показателей.\n' +
      '6. Общие вопросы методики — методические указания и персональные рекомендации вашего тренера.\n\n' +
      'Задайте любой интересующий вас вопрос по одной из этих тем.';

    return {
      answer: stripEmojis(canonicalTopicsAnswer),
      match_score: 100,
      needs_trainer: false
    };
  }

  const medicalKeywords = ['боль', 'болит', 'травма', 'сустав', 'связка', 'врач', 'лекарство', 'укол', 'диагноз', 'острая боль'];
  if (medicalKeywords.some(k => lowerQ.includes(k))) {
    return {
      answer: stripEmojis('Ваш запрос касается здоровья или боли. Ассистент не выдает медицинских диагнозов. Запрос отправлен тренеру для личного анализа.'),
      match_score: 0,
      needs_trainer: true,
      escalation_reason: 'Медицинский запрос / Болевые симптомы'
    };
  }

  // 1. Check for Best Match in Approved KB
  let bestMatch: KnowledgeItem | undefined;
  let highestScore = 0;

  for (const item of approvedKnowledge) {
    const score = calculateMatchScore(question, item);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  }

  // RULE: If match_score >= 70%, mandatory priority to Trainer KB article!
  if (highestScore >= 70 && bestMatch) {
    const prefix = clientProfile.name ? `${clientProfile.name}, по методике тренера (${bestMatch.title}):\n` : `По методике тренера (${bestMatch.title}):\n`;
    return {
      answer: stripEmojis(`${prefix}${bestMatch.content}`),
      matched_kb: bestMatch,
      match_score: highestScore,
      needs_trainer: false
    };
  }

  // 2. If Score < 70%, LLM Synthesizes Answer with Virtual Profile Context
  const intentSummary = (clientProfile as any).intent_analytics
    ? Object.entries((clientProfile as any).intent_analytics).map(([cat, count]) => `${cat}: ${count}`).join(', ')
    : 'Пока нет данных';

  const analytics = (clientProfile as any).intent_analytics || {};
  const totalInquiries = Object.values(analytics).reduce((sum: number, count: any) => sum + Number(count || 0), 0);

  let engagementInstruction = "";
  if (totalInquiries > 10) {
    engagementInstruction = `Client has HIGH engagement (total requests: ${totalInquiries}). At the end of your concise answer, add a brief, premium call-to-action offering 'Персональное ведение тренером (VIP)' with direct supervisor support. Make it organic and premium.`;
  } else if (totalInquiries >= 4) {
    engagementInstruction = `Client has MEDIUM engagement (total requests: ${totalInquiries}). At the end of your concise answer, add a gentle reminder that for customized schedules and nutrition, they can submit a request for 'Персональное ведение' in their Profile tab.`;
  } else {
    engagementInstruction = `Client has INITIAL engagement (total requests: ${totalInquiries}). Keep the answer extremely helpful and brief. Do not push sales heavily, but mention they can ask about individual coaching if needed.`;
  }

  const systemPrompt = `SYSTEM RULES (STRICT ZERO EMOJI POLICY):
1. You are an expert AI fitness librarian proxying the human trainer. Answer ONLY within nutrition, training, recovery, and supplements.
2. ABSOLUTELY NO EMOJIS OR SMILIES IN YOUR RESPONSE. Use clean typography and concise bullet points.
3. Keep response professional, neutral, factual, and clear.
4. WEB RETRIEVAL RULE: There is NO direct matching article in the database. You MUST act as if retrieving the answer from your expert web/network knowledge and provide a short, 2-3 sentence highly precise and concise answer based on trainer methodology.
5. CLIENT VIRTUAL PROFILE & CONTEXT:
   - Client Name: ${clientProfile.name || 'Клиент'}
   - Primary Goal: ${clientProfile.goal || 'Общая фитнес-подготовка'}
   - Active Focus Topic: ${(clientProfile as any).active_topic || 'Общий контекст'}
   - Historical Interests / Intent Analytics: ${intentSummary}
   - Restrictions / Notes: ${clientProfile.restrictions || 'Ограничений не указано'}
6. ENGAGEMENT CRM CTA RULE:
   - ${engagementInstruction}
7. Tailor response specifically to this client's profile, focus topic, and goals. Never invent facts, medical conclusions, or personal approvals.`;

  try {
    const rawAnswer = await llmService.generate(systemPrompt, question);
    const cleanAnswer = stripEmojis(rawAnswer);

    if (cleanAnswer && cleanAnswer.trim().length > 0) {
      return {
        answer: cleanAnswer,
        match_score: highestScore,
        needs_trainer: false
      };
    }
  } catch (e: any) {
    // Graceful handling without raw JSON error spam
    const errText = typeof e?.message === 'string' ? e.message : String(e);
    if (!errText.includes('API key') && !errText.includes('not ready')) {
      console.log(`[LLM Status]: Query processing using knowledge fallback (${highestScore}%)`);
    }
  }

  // 3. Fallback if no LLM answer generated or provider not configured
  return {
    answer: stripEmojis(`В базе знаний пока нет прямой статьи с точным соответствием (текущее соответствие: ${highestScore}%). Запрос зафиксирован для включения тренером в программу.`),
    match_score: highestScore,
    needs_trainer: false
  };
}

// Setup Express App
const app = express();
app.use(cors());
app.use(express.json());

// Proxy layer to Python Telegram Bot backend (PostgreSQL) when target URL is configured in environment
const TARGET_BOT_URL = (
  process.env.VITE_API_BASE_URL ||
  process.env.API_BASE_URL ||
  process.env.BOT_URL ||
  process.env.BOT_API_URL ||
  process.env.PYTHON_BACKEND_URL ||
  process.env.RENDER_BOT_URL ||
  ''
).trim().replace(/\/+$/, '');

if (TARGET_BOT_URL) {
  console.log(`[Proxy] Python Bot upstream target configured: ${TARGET_BOT_URL}`);
  console.log(`[Proxy] All /api/* traffic will be routed directly to the Python PostgreSQL backend.`);

  app.use('/api', async (req: Request, res: Response, next) => {
    const targetUrl = `${TARGET_BOT_URL}${req.originalUrl}`;

    try {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey !== 'host' && lowerKey !== 'content-length' && typeof value === 'string') {
          headers[key] = value;
        }
      }
      if (!headers['content-type'] && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        headers['content-type'] = 'application/json';
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const upstreamRes = await fetch(targetUrl, fetchOptions);

      res.status(upstreamRes.status);
      upstreamRes.headers.forEach((val, key) => {
        const lowerKey = key.toLowerCase();
        if (lowerKey !== 'transfer-encoding' && lowerKey !== 'content-encoding' && lowerKey !== 'content-length') {
          res.setHeader(key, val);
        }
      });

      const buffer = await upstreamRes.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error(`[Proxy Error] Failed to proxy ${req.method} ${req.originalUrl} -> ${targetUrl}:`, err);
      // Fallback to local routes if upstream fails
      next();
    }
  });
}

// Health Check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// LLM Diagnostics and Status API
app.get('/api/llm/status', (_req: Request, res: Response) => {
  res.json(llmService.getStatus());
});

app.post('/api/llm/test', async (req: Request, res: Response) => {
  const { prompt } = req.body;
  const testPrompt = prompt || 'Кратко объясни роль гидратации при силовых тренировках (1-2 предложения).';
  const systemPrompt = `SYSTEM RULES: Strict Zero Emoji Policy. Professional, concise, science-backed fitness assistant.`;

  try {
    const startMs = Date.now();
    const rawAnswer = await llmService.generate(systemPrompt, testPrompt);
    const cleanAnswer = stripEmojis(rawAnswer);
    const elapsedMs = Date.now() - startMs;

    res.json({
      success: true,
      provider: llmService.getEffectiveProvider().provider,
      model: llmService.getEffectiveProvider().model,
      prompt: testPrompt,
      answer: cleanAnswer,
      latency_ms: elapsedMs,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      provider: llmService.getEffectiveProvider().provider,
      model: llmService.getEffectiveProvider().model,
      error: err?.message || String(err),
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/llm/config', (req: Request, res: Response) => {
  const { provider, aitunnelApiKey, aitunnelBaseUrl, aitunnelModel, geminiApiKey, geminiModel, openaiApiKey, openaiModel } = req.body;
  
  const updates: any = {};
  if (provider) updates.provider = provider;
  if (aitunnelApiKey !== undefined) updates.aitunnelApiKey = aitunnelApiKey;
  if (aitunnelBaseUrl) updates.aitunnelBaseUrl = aitunnelBaseUrl;
  if (aitunnelModel) updates.aitunnelModel = aitunnelModel;
  if (geminiApiKey !== undefined) updates.geminiApiKey = geminiApiKey;
  if (geminiModel) updates.geminiModel = geminiModel;
  if (openaiApiKey !== undefined) updates.openaiApiKey = openaiApiKey;
  if (openaiModel) updates.openaiModel = openaiModel;

  llmService.updateRuntimeConfig(updates);
  res.json({
    success: true,
    status: llmService.getStatus()
  });
});

// Stats
app.get('/api/stats', (_req: Request, res: Response) => {
  res.json({
    totalClients: db.clients.length,
    activeKnowledgeItems: db.knowledge.filter(k => k.status === 'approved').length,
    draftKnowledgeItems: db.knowledge.filter(k => k.status === 'draft').length,
    openContentGaps: db.contentGaps.length,
    openEscalations: db.escalations.filter(e => e.status === 'open').length,
    totalMessages: db.messages.length
  });
});

// Categories API
app.get('/api/categories', (_req: Request, res: Response) => {
  res.json(db.categories);
});

app.post('/api/categories', (req: Request, res: Response) => {
  const { name, parent_id, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
  const newCat: Category = {
    id,
    name: stripEmojis(name),
    parent_id: parent_id || null,
    description: description ? stripEmojis(description) : undefined
  };
  db.categories.push(newCat);
  res.status(201).json(newCat);
});

// Content Gaps API (For Trainer Admin Analysis)
app.get('/api/content-gaps', (_req: Request, res: Response) => {
  res.json(db.contentGaps);
});

app.post('/api/content-gaps/:id/approve', (req: Request, res: Response) => {
  const gap = db.contentGaps.find(g => g.id === Number(req.params.id));
  if (!gap) return res.status(404).json({ error: 'Content gap item not found' });

  const { title, content, category_id } = req.body;

  // Add as approved Knowledge Item
  const newItem: KnowledgeItem = {
    id: db.nextKnowledgeId++,
    trainer_id: 1,
    category_id: category_id || gap.category_id,
    title: stripEmojis(title || gap.question),
    content: stripEmojis(content || gap.sample_llm_answer),
    status: 'approved',
    author_is_trainer: true,
    created_at: new Date().toISOString()
  };
  db.knowledge.push(newItem);

  // Remove from backlog
  db.contentGaps = db.contentGaps.filter(g => g.id !== gap.id);

  res.status(201).json(newItem);
});

// Knowledge Base API
app.get('/api/knowledge', (req: Request, res: Response) => {
  const { category_id, status } = req.query;
  let items = [...db.knowledge];
  if (category_id) items = items.filter(k => k.category_id === category_id);
  if (status) items = items.filter(k => k.status === status);
  res.json(items);
});

app.post('/api/knowledge', (req: Request, res: Response) => {
  const { category_id, title, content, status } = req.body;
  if (!category_id || !title || !content) {
    return res.status(400).json({ error: 'category_id, title, and content are required' });
  }

  const newItem: KnowledgeItem = {
    id: db.nextKnowledgeId++,
    trainer_id: 1,
    category_id,
    title: stripEmojis(title),
    content: stripEmojis(content),
    status: status === 'approved' ? 'approved' : 'draft',
    author_is_trainer: true,
    created_at: new Date().toISOString()
  };
  db.knowledge.push(newItem);
  res.status(201).json(newItem);
});

app.put('/api/knowledge/:id', (req: Request, res: Response) => {
  const item = db.knowledge.find(k => k.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Knowledge item not found' });

  const { category_id, title, content, status } = req.body;
  if (category_id) item.category_id = category_id;
  if (title) item.title = stripEmojis(title);
  if (content) item.content = stripEmojis(content);
  if (status) item.status = status;
  res.json(item);
});

app.delete('/api/knowledge/:id', (req: Request, res: Response) => {
  db.knowledge = db.knowledge.filter(k => k.id !== Number(req.params.id));
  res.json({ success: true });
});

// Clients API
app.get('/api/clients', (_req: Request, res: Response) => {
  res.json(db.clients);
});

app.get('/api/clients/:id', (req: Request, res: Response) => {
  const client = db.clients.find(c => c.id === Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const clientMessages = db.messages.filter(m => m.client_id === client.id);
  const clientEscalations = db.escalations.filter(e => e.client_id === client.id);
  res.json({ ...client, messages: clientMessages, escalations: clientEscalations });
});

// Resolve Client by Telegram User ID Endpoint
app.all('/api/client/resolve', (req: Request, res: Response) => {
  const tg_id = Number(req.body?.telegram_user_id || req.query?.telegram_user_id);
  const name = req.body?.name || req.query?.name;

  const adminIds = [
    '747600306',
    '435297513',
    ...(process.env.TELEGRAM_ADMIN_CHAT_ID || '').split(','),
    ...(process.env.ADMIN_TELEGRAM_IDS || '').split(','),
    ...(process.env.ADMIN_IDS || '').split(','),
    ...(process.env.ADMIN_ID || '').split(','),
    ...(process.env.TRAINER_TELEGRAM_ID || '').split(',')
  ].map(s => s.trim()).filter(Boolean);

  if (!tg_id) {
    // Default fallback for guest / browser sandbox without Telegram
    const defaultClient = db.clients.find(c => !c.is_admin) || db.clients[2] || db.clients[0];
    return res.json({
      ok: true,
      id: defaultClient.id,
      client_id: defaultClient.id,
      telegram_user_id: defaultClient.telegram_user_id,
      name: defaultClient.name,
      is_admin: false,
      is_vip: defaultClient.is_vip || false,
      profile: defaultClient.profile
    });
  }

  const isAdmin = adminIds.includes(String(tg_id));
  let client = db.clients.find(c => c.telegram_user_id === tg_id);

  if (!client) {
    const displayName = name ? String(name) : `User ${tg_id}`;
    client = {
      id: db.nextClientId++,
      trainer_id: 1,
      telegram_user_id: tg_id,
      name: displayName,
      is_vip: isAdmin,
      is_admin: isAdmin,
      profile: {
        name: displayName,
        goal: 'Общая физическая подготовка'
      },
      created_at: new Date().toISOString()
    };
    db.clients.push(client);
  } else {
    client.is_admin = isAdmin;
    if (isAdmin) {
      client.is_vip = true;
    }
    if (name && client.name !== name) {
      client.name = String(name);
    }
  }

  res.json({
    ok: true,
    id: client.id,
    client_id: client.id,
    telegram_user_id: client.telegram_user_id,
    name: client.name,
    is_admin: client.is_admin,
    is_vip: client.is_vip,
    profile: client.profile
  });
});

// Escalations API
app.get('/api/escalations', (_req: Request, res: Response) => {
  res.json(db.escalations);
});

app.put('/api/escalations/:id/resolve', (req: Request, res: Response) => {
  const escalation = db.escalations.find(e => e.id === Number(req.params.id));
  if (!escalation) return res.status(404).json({ error: 'Escalation not found' });

  const { trainer_answer, save_to_kb, kb_category_id } = req.body;
  escalation.status = 'resolved';
  escalation.trainer_answer = stripEmojis(trainer_answer || 'Ответ подготовлен тренером.');

  if (save_to_kb && trainer_answer) {
    db.knowledge.push({
      id: db.nextKnowledgeId++,
      trainer_id: 1,
      category_id: kb_category_id || 'training',
      title: stripEmojis(`Решение по запросу: ${escalation.question.slice(0, 35)}...`),
      content: stripEmojis(trainer_answer),
      status: 'approved',
      author_is_trainer: true,
      created_at: new Date().toISOString()
    });
  }

  res.json(escalation);
});

// Update Client Profile Endpoint
app.post('/api/client/profile', (req: Request, res: Response) => {
  const { client_id, name, age, height, weight, goal, restrictions, is_admin } = req.body;
  const client = db.clients.find(c => c.id === Number(client_id || 1));
  if (!client) return res.status(404).json({ error: 'Client not found' });

  if (name) {
    client.name = stripEmojis(name);
    client.profile.name = stripEmojis(name);
  }
  if (age !== undefined) client.profile.age = Number(age);
  if (height !== undefined) client.profile.height = Number(height);
  if (weight !== undefined) client.profile.weight = Number(weight);
  if (goal) client.profile.goal = stripEmojis(goal);
  if (restrictions !== undefined) client.profile.restrictions = stripEmojis(restrictions);
  
  if (is_admin !== undefined) {
    client.is_admin = !!is_admin;
    if (client.is_admin) {
      client.is_vip = true; // Admins are always VIP by default
    }
  }

  res.json({ success: true, client });
});

// VIP Upgrade Endpoint
app.post('/api/client/vip/upgrade', (req: Request, res: Response) => {
  const { client_id } = req.body;
  const client = db.clients.find(c => c.id === Number(client_id || 1));
  if (!client) return res.status(404).json({ error: 'Client not found' });

  client.is_vip = true;
  if (client.profile) client.profile.is_vip = true;
  res.json({ success: true, is_vip: client.is_vip, message: 'VIP-статус успешно активирован!' });
});

// VIP / Status Toggle Endpoint
app.post(['/api/client/vip/toggle', '/api/client/status/update'], (req: Request, res: Response) => {
  const { client_id, is_vip, is_admin, role } = req.body;
  const client = db.clients.find(c => c.id === Number(client_id || 1));
  if (!client) return res.status(404).json({ error: 'Client not found' });

  if (role) {
    if (role === 'admin') {
      client.is_admin = true;
      client.is_vip = true;
    } else if (role === 'vip') {
      client.is_admin = false;
      client.is_vip = true;
    } else {
      client.is_admin = false;
      client.is_vip = false;
    }
  } else {
    if (is_admin !== undefined) {
      client.is_admin = !!is_admin;
      if (client.is_admin) client.is_vip = true;
    }
    if (is_vip !== undefined) {
      client.is_vip = !!is_vip;
    }
  }

  if (client.profile) {
    client.profile.is_vip = client.is_vip;
    client.profile.is_admin = client.is_admin;
  }

  res.json({
    ok: true,
    success: true,
    client_id: client.id,
    is_vip: client.is_vip,
    is_admin: client.is_admin,
    client
  });
});

// Interactive Chat API
app.post('/api/chat', async (req: Request, res: Response) => {
  const { client_id, message_text, category_id } = req.body;
  if (!message_text) return res.status(400).json({ error: 'Message text is required' });

  let client = db.clients.find(c => c.id === Number(client_id)) || db.clients[0];

  // Rate Limiting: 5 user messages per 1 hour for non-VIP clients
  if (!client.is_vip) {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const recentMessages = db.messages.filter(m => 
      m.client_id === client.id && 
      m.role === 'user' && 
      m.created_at >= oneHourAgo
    );
    if (recentMessages.length >= 5) {
      const limitExceededText = "Превышен лимит бесплатных запросов (5 запросов в час). Перейдите в раздел Профиль и активируйте VIP-доступ без ограничений!";
      
      const assistantMsg: Message = {
        id: db.nextMessageId++,
        client_id: client.id,
        role: 'assistant',
        text: limitExceededText,
        created_at: new Date().toISOString(),
        kb_matched: false,
        match_score: 0
      };
      db.messages.push(assistantMsg);

      return res.json({
        text: limitExceededText,
        assistant_message: assistantMsg,
        limit_exceeded: true
      });
    }
  }

  const cleanUserText = stripEmojis(message_text);

  // Track Intent Analytics & Virtual Profile Active Topic
  const detectedCat = category_id || detectTopicCategory(cleanUserText);
  if (!client.profile.intent_analytics) {
    client.profile.intent_analytics = {};
  }
  client.profile.intent_analytics[detectedCat] = (client.profile.intent_analytics[detectedCat] || 0) + 1;
  client.profile.active_topic = detectedCat;

  // Record user message
  const userMsg: Message = {
    id: db.nextMessageId++,
    client_id: client.id,
    role: 'user',
    text: cleanUserText,
    created_at: new Date().toISOString()
  };
  db.messages.push(userMsg);

  // Filter approved KB items
  let approvedKB = db.knowledge.filter(k => k.status === 'approved');
  if (category_id) {
    approvedKB = approvedKB.filter(k => k.category_id === category_id);
  }

  // Process Query
  const result = await processClientQuery(cleanUserText, client.profile, approvedKB);

  // If score < 70%, register Content Gap for trainer analysis!
  if (result.match_score < 70 && !result.needs_trainer) {
    const existingGap = db.contentGaps.find(g => g.question.toLowerCase() === cleanUserText.toLowerCase());
    if (existingGap) {
      existingGap.frequency += 1;
      if (existingGap.frequency > 5) existingGap.priority = 'high';
    } else {
      db.contentGaps.push({
        id: db.nextGapId++,
        question: cleanUserText,
        category_id: detectedCat,
        frequency: 1,
        priority: 'medium',
        sample_llm_answer: result.answer,
        created_at: new Date().toISOString()
      });
    }
  }

  // If escalation needed
  let escalationItem: Escalation | null = null;
  if (result.needs_trainer) {
    escalationItem = {
      id: db.nextEscalationId++,
      client_id: client.id,
      client_name: client.name,
      reason: result.escalation_reason || 'Запрос подлежит проверке тренером',
      question: cleanUserText,
      status: 'open',
      created_at: new Date().toISOString()
    };
    db.escalations.push(escalationItem);
  }

  const asstMsg: Message = {
    id: db.nextMessageId++,
    client_id: client.id,
    role: 'assistant',
    text: result.answer,
    created_at: new Date().toISOString(),
    kb_matched: !!result.matched_kb,
    match_score: result.match_score
  };
  db.messages.push(asstMsg);

  res.json({
    text: result.answer,
    assistant_message: asstMsg,
    user_message: userMsg,
    matched_kb: result.matched_kb,
    match_score: result.match_score,
    needs_trainer: result.needs_trainer,
    active_topic: detectedCat,
    client_profile: client.profile
  });
});

// Admin Subscription Analytics & Weekly Intent Digest API
app.get('/api/analytics/summary', (_req: Request, res: Response) => {
  const vipClients = db.clients.filter(c => c.is_vip);
  const basicClients = db.clients.filter(c => !c.is_vip);

  const calcCategoryBreakdown = (clientsList: Client[]) => {
    const counts: Record<string, number> = {
      training: 0,
      nutrition: 0,
      recovery: 0,
      weight_loss: 0,
      muscle_gain: 0,
      general: 0
    };
    clientsList.forEach(c => {
      const analytics = c.profile.intent_analytics || {};
      Object.entries(analytics).forEach(([cat, val]) => {
        counts[cat] = (counts[cat] || 0) + Number(val);
      });
    });
    return counts;
  };

  const vipBreakdown = calcCategoryBreakdown(vipClients);
  const basicBreakdown = calcCategoryBreakdown(basicClients);

  // Weekly Intent Digest (Ranked topics in last 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const weeklyMessages = db.messages.filter(m => new Date(m.created_at) >= sevenDaysAgo && m.role === 'user');

  const weeklyCategoryCounts: Record<string, { total: number; vip: number; basic: number }> = {
    training: { total: 0, vip: 0, basic: 0 },
    nutrition: { total: 0, vip: 0, basic: 0 },
    recovery: { total: 0, vip: 0, basic: 0 },
    weight_loss: { total: 0, vip: 0, basic: 0 },
    muscle_gain: { total: 0, vip: 0, basic: 0 },
    general: { total: 0, vip: 0, basic: 0 }
  };

  weeklyMessages.forEach(m => {
    const client = db.clients.find(c => c.id === m.client_id);
    const cat = detectTopicCategory(m.text);
    if (!weeklyCategoryCounts[cat]) {
      weeklyCategoryCounts[cat] = { total: 0, vip: 0, basic: 0 };
    }
    weeklyCategoryCounts[cat].total += 1;
    if (client?.is_vip) {
      weeklyCategoryCounts[cat].vip += 1;
    } else {
      weeklyCategoryCounts[cat].basic += 1;
    }
  });

  const categoryLabels: Record<string, string> = {
    training: 'Тренировочный процесс',
    nutrition: 'Питание и диетология',
    recovery: 'Восстановление и сон',
    weight_loss: 'Снижение жировой массы',
    muscle_gain: 'Набор мышечной массы',
    general: 'Общие вопросы методики'
  };

  const weeklyDigest = Object.entries(weeklyCategoryCounts)
    .map(([cat, stats]) => ({
      category_id: cat,
      category_name: categoryLabels[cat] || cat,
      total_requests: stats.total,
      vip_requests: stats.vip,
      basic_requests: stats.basic
    }))
    .sort((a, b) => b.total_requests - a.total_requests);

  res.json({
    summary: {
      total_clients: db.clients.length,
      vip_clients_count: vipClients.length,
      basic_clients_count: basicClients.length,
      total_messages_recorded: db.messages.length
    },
    vip_stats: {
      client_count: vipClients.length,
      category_breakdown: vipBreakdown
    },
    basic_stats: {
      client_count: basicClients.length,
      category_breakdown: basicBreakdown
    },
    weekly_intent_digest: weeklyDigest,
    content_gaps: db.contentGaps
  });
});

function ensureDistZip(): string | null {
  const publicDir = path.resolve(__dirname, 'public');
  const distDir = path.resolve(__dirname, 'dist');
  const zipPath = path.resolve(publicDir, 'dist.zip');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // If dist doesn't exist, try building
  if (!fs.existsSync(distDir) || fs.readdirSync(distDir).length === 0) {
    try {
      execSync('npm run build', { cwd: __dirname, stdio: 'ignore' });
    } catch (e) {
      console.error('Build failed while creating dist.zip:', e);
    }
  }

  try {
    execSync('python3 -c "import shutil; shutil.make_archive(\'public/dist\', \'zip\', \'dist\')"', { cwd: __dirname });
    if (fs.existsSync(distDir) && fs.existsSync(zipPath)) {
      try {
        fs.copyFileSync(zipPath, path.resolve(distDir, 'dist.zip'));
      } catch (_) {}
    }
    return zipPath;
  } catch (err) {
    console.error('Failed to generate dist.zip:', err);
    return null;
  }
}

function ensureProjectZip(): string | null {
  const publicDir = path.resolve(__dirname, 'public');
  const distDir = path.resolve(__dirname, 'dist');
  const zipPath = path.resolve(publicDir, 'project-full.zip');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  try {
    execSync(`python3 -c "import zipfile, os; z = zipfile.ZipFile('public/project-full.zip', 'w', zipfile.ZIP_DEFLATED); [z.write(os.path.join(root, f), os.path.relpath(os.path.join(root, f), '.')) for root, dirs, files in os.walk('.') if not dirs.reverse() and [dirs.remove(d) for d in list(dirs) if d in ('node_modules', '.git', '.vite')] for f in files if not f.endswith('.zip')]; z.close()"`, { cwd: __dirname });
    if (fs.existsSync(distDir) && fs.existsSync(zipPath)) {
      try {
        fs.copyFileSync(zipPath, path.resolve(distDir, 'project-full.zip'));
      } catch (_) {}
    }
    return zipPath;
  } catch (err) {
    console.error('Failed to generate project-full.zip:', err);
    return null;
  }
}

// Download dist archive endpoint
app.get(['/dist.zip', '/download/dist', '/api/dist.zip'], (_req: Request, res: Response) => {
  const zipPath = ensureDistZip();
  if (zipPath && fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="dist.zip"');
    return res.sendFile(zipPath);
  }
  return res.status(500).send('Ошибка формирования dist.zip');
});

// Download full project source endpoint
app.get(['/project.zip', '/project-full.zip', '/download/project'], (_req: Request, res: Response) => {
  const zipPath = ensureProjectZip();
  if (zipPath && fs.existsSync(zipPath)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="project-full.zip"');
    return res.sendFile(zipPath);
  }
  return res.status(500).send('Ошибка формирования project-full.zip');
});

// Server Launcher with Vite Integration
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'custom'
    });

    // Serve web app manifest with correct standard Content-Type
    app.get('/manifest.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/manifest+json');
      res.sendFile(path.resolve(__dirname, 'public', 'manifest.json'));
    });

    // Serve SVG icons and handle favicon
    app.get(['/icon.svg', '/favicon.svg'], (_req, res) => {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.sendFile(path.resolve(__dirname, 'public', 'icon.svg'));
    });

    app.get('/favicon.ico', (_req, res) => {
      res.status(204).end();
    });

    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await import('fs').then(fs => fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8'));
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Trainer AI Bot ver 1.0.0] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

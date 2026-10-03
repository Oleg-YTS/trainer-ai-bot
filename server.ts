import express, { Request, Response } from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execSync } from 'child_process';
import pg from 'pg';

const { Pool } = pg;

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
          if (key === 'AITUNNEL_BASE_URL') {
            val = val.replace('iatunnel.ru', 'aitunnel.ru');
          }
          process.env[key] = val;
        }
      }
    }
  }
} catch (err) {
  console.error('Failed to load local .env file:', err);
}

// Function to safely save/update key-value pairs in the local .env file
export function saveToEnvFile(updates: Record<string, string>) {
  try {
    const envPath = path.join(__dirname, '.env');
    let envLines: string[] = [];
    if (fs.existsSync(envPath)) {
      envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    }

    const keyIndexMap = new Map<string, number>();
    envLines.forEach((line, idx) => {
      const clean = line.trim();
      if (clean && !clean.startsWith('#') && clean.includes('=')) {
        const key = clean.split('=')[0].trim();
        keyIndexMap.set(key, idx);
      }
    });

    for (const [key, rawVal] of Object.entries(updates)) {
      if (!key || rawVal === undefined || rawVal === null) continue;
      const cleanValue = String(rawVal).trim();
      process.env[key] = cleanValue;
      const lineStr = `${key}="${cleanValue}"`;
      if (keyIndexMap.has(key)) {
        envLines[keyIndexMap.get(key)!] = lineStr;
      } else {
        envLines.push(lineStr);
      }
    }

    fs.writeFileSync(envPath, envLines.join('\n'), 'utf8');

    // Reset PostgreSQL pool instance if DATABASE_URL was updated
    if (updates.DATABASE_URL !== undefined) {
      if (pgPoolInstance) {
        pgPoolInstance.end().catch(() => {});
        pgPoolInstance = null;
      }
    }
  } catch (err) {
    console.error('Failed to save to .env file:', err);
  }
}

function maskSecretValue(val: string | undefined): { configured: boolean; masked: string } {
  if (!val || !val.trim()) {
    return { configured: false, masked: 'Не настроен' };
  }
  const clean = val.trim();
  if (clean.length <= 8) {
    return { configured: true, masked: '••••' + clean.slice(-2) };
  }
  return { configured: true, masked: clean.slice(0, 4) + '••••' + clean.slice(-4) };
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
  role?: string;
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
  role?: string;
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

// PostgreSQL Database Connection & Service
let pgPoolInstance: pg.Pool | null = null;

function getPgPool(): pg.Pool | null {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.trim()) return null;
  const cleanUrl = dbUrl.trim().replace(/^postgres:\/\//, 'postgresql://');
  
  // Validate basic URL host format to prevent EAI_AGAIN on invalid placeholders
  try {
    const parsed = new URL(cleanUrl);
    if (!parsed.hostname || parsed.hostname === 'base' || parsed.hostname === 'host' || parsed.hostname === 'localhost_placeholder' || parsed.hostname.length < 3) {
      return null;
    }
    // Prevent authentication attempts with dummy placeholder credentials
    if (
      (parsed.username === 'user' && parsed.password === 'password') ||
      cleanUrl.includes('//user:password@') ||
      cleanUrl.includes('//username:password@')
    ) {
      return null;
    }
  } catch {
    return null;
  }
  if (!pgPoolInstance) {
    const requiresSsl = cleanUrl.includes('render.com') || cleanUrl.includes('dpg-') || (!cleanUrl.includes('localhost') && !cleanUrl.includes('127.0.0.1'));
    pgPoolInstance = new Pool({
      connectionString: cleanUrl,
      ssl: requiresSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000
    });
    
    pgPoolInstance.on('error', (err) => {
      console.warn('[PostgreSQL Pool Warning]:', err.message);
      if (err.message.includes('EAI_AGAIN') || err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED') || err.message.includes('password authentication failed') || err.message.includes('connection refused')) {
        if (pgPoolInstance) {
          pgPoolInstance.end().catch(() => {});
          pgPoolInstance = null;
        }
      }
    });
  }
  return pgPoolInstance;
}

export const pgService = {
  async checkConnectionDetails(): Promise<{ connected: boolean; error?: string }> {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || !dbUrl.trim()) {
      return { connected: false, error: 'DATABASE_URL не настроен в .env файле сервера.' };
    }
    const cleanUrl = dbUrl.trim().replace(/^postgres:\/\//, 'postgresql://');
    if (cleanUrl.includes('//user:password@') || cleanUrl.includes('//username:password@')) {
      return {
        connected: false,
        error: 'В DATABASE_URL указаны шаблонные реквизиты (user:password). Замените их на реальные логин и пароль вашей БД на Render.'
      };
    }
    const pool = getPgPool();
    if (!pool) {
      return { connected: false, error: 'Не удалось инициализировать пул подключений к PostgreSQL.' };
    }
    try {
      const res = await pool.query('SELECT 1');
      if (res.rowCount && res.rowCount > 0) {
        return { connected: true };
      }
      return { connected: false, error: 'База данных не ответила на запрос' };
    } catch (err: any) {
      const isLocalHost = cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1');
      if (isLocalHost && (err.message.includes('ECONNREFUSED') || err.message.includes('connection refused'))) {
        console.log('[PostgreSQL Connection]: Local PostgreSQL is not running. Using local in-memory fallbacks.');
      } else {
        console.warn('[PostgreSQL Connection Check Failed]:', err.message);
      }
      if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND') || err.message.includes('connection refused') || err.message.includes('ETIMEDOUT')) {
        if (pgPoolInstance) {
          pgPoolInstance.end().catch(() => {});
          pgPoolInstance = null;
        }
      }
      return { connected: false, error: err.message || String(err) };
    }
  },

  async isConnected(): Promise<boolean> {
    const details = await this.checkConnectionDetails();
    return details.connected;
  },

  async getClients(): Promise<Client[] | null> {
    const pool = getPgPool();
    if (!pool) return null;
    try {
      const res = await pool.query(`
        SELECT c.id, c.trainer_id, c.telegram_user_id, c.name, c.profile_json, c.created_at,
               COUNT(m.id)::int as messages_count
        FROM clients c
        LEFT JOIN messages m ON m.client_id = c.id
        GROUP BY c.id, c.trainer_id, c.telegram_user_id, c.name, c.profile_json, c.created_at
        ORDER BY c.created_at DESC
      `);
      
      return res.rows.map(row => {
        let p: any = {};
        try { p = row.profile_json ? JSON.parse(row.profile_json) : {}; } catch {}
        
        const tgId = Number(row.telegram_user_id);
        const isAdmin = Boolean(p.is_admin || tgId === 747600306 || tgId === 435297513);
        const isVip = Boolean(p.is_vip || isAdmin);
        const name = row.name || p.name || `Пользователь #${tgId || row.id}`;

        return {
          id: Number(row.id),
          trainer_id: Number(row.trainer_id || 1),
          telegram_user_id: tgId,
          telegram_username: p.telegram_username || p.username || '',
          name: name,
          is_vip: isVip,
          is_admin: isAdmin,
          profile: {
            ...p,
            name: name,
            is_vip: isVip,
            is_admin: isAdmin
          },
          created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
        };
      });
    } catch (err: any) {
      console.warn('[pgService.getClients fallback]:', err.message);
      return null;
    }
  },

  async getClientById(idOrTgId: number): Promise<{ client: Client; messages: Message[] } | null> {
    const pool = getPgPool();
    if (!pool) return null;
    try {
      const isInternalId = Number(idOrTgId) < 1000000;
      const clientRes = await pool.query(
        isInternalId
          ? 'SELECT id, trainer_id, telegram_user_id, name, profile_json, created_at FROM clients WHERE id = $1 LIMIT 1'
          : 'SELECT id, trainer_id, telegram_user_id, name, profile_json, created_at FROM clients WHERE telegram_user_id = $1 LIMIT 1',
        [idOrTgId]
      );
      if (clientRes.rows.length === 0) return null;
      
      const row = clientRes.rows[0];
      let p: any = {};
      try { p = row.profile_json ? JSON.parse(row.profile_json) : {}; } catch {}

      const tgId = Number(row.telegram_user_id);
      const isAdmin = Boolean(p.is_admin || tgId === 747600306 || tgId === 435297513);
      const isVip = Boolean(p.is_vip || isAdmin);
      const name = row.name || p.name || `Пользователь #${tgId || row.id}`;

      const client: Client = {
        id: Number(row.id),
        trainer_id: Number(row.trainer_id || 1),
        telegram_user_id: tgId,
        telegram_username: p.telegram_username || p.username || '',
        name: name,
        is_vip: isVip,
        is_admin: isAdmin,
        profile: {
          ...p,
          name: name,
          is_vip: isVip,
          is_admin: isAdmin
        },
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
      };

      const msgRes = await pool.query(
        'SELECT id, client_id, role, text, created_at FROM messages WHERE client_id = $1 ORDER BY created_at ASC',
        [client.id]
      );

      const messages: Message[] = msgRes.rows.map(m => ({
        id: Number(m.id),
        client_id: Number(m.client_id),
        role: m.role as any,
        text: m.text,
        created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString()
      }));

      return { client, messages };
    } catch (err: any) {
      console.warn('[pgService.getClientById fallback]:', err.message);
      return null;
    }
  },

  async upsertClientProfile(data: {
    client_id?: number;
    telegram_user_id?: number;
    name?: string;
    profile?: any;
    is_vip?: boolean;
    is_admin?: boolean;
  }): Promise<Client | null> {
    const pool = getPgPool();
    if (!pool) return null;
    try {
      const numClientId = data.client_id !== undefined ? Number(data.client_id) : undefined;
      const numTgId = data.telegram_user_id !== undefined ? Number(data.telegram_user_id) : undefined;

      let existing: any = { rows: [] };
      if (numTgId !== undefined) {
        existing = await pool.query(
          'SELECT id, trainer_id, telegram_user_id, name, profile_json FROM clients WHERE telegram_user_id = $1 LIMIT 1',
          [numTgId]
        );
      }
      if (existing.rows.length === 0 && numClientId !== undefined) {
        existing = await pool.query(
          'SELECT id, trainer_id, telegram_user_id, name, profile_json FROM clients WHERE id = $1 LIMIT 1',
          [numClientId]
        );
      }

      let currentP: any = {};
      let currentName = data.name || (numTgId ? `Пользователь #${numTgId}` : 'Пользователь');
      let trainerId = 1;
      let effectiveTgId = numTgId || (numClientId && numClientId > 1000000 ? numClientId : 200000000 + (numClientId || 1));

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        currentName = data.name || row.name || currentName;
        trainerId = Number(row.trainer_id || 1);
        effectiveTgId = Number(row.telegram_user_id) || effectiveTgId;
        try { currentP = row.profile_json ? JSON.parse(row.profile_json) : {}; } catch {}
      }

      const mergedP = {
        ...currentP,
        ...(data.profile || {}),
        name: currentName,
        is_vip: data.is_vip !== undefined ? data.is_vip : currentP.is_vip,
        is_admin: data.is_admin !== undefined ? data.is_admin : currentP.is_admin
      };

      const profileJsonStr = JSON.stringify(mergedP);

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        await pool.query(
          'UPDATE clients SET name = $1, profile_json = $2 WHERE id = $3',
          [currentName, profileJsonStr, row.id]
        );
        const updated = await this.getClientById(Number(row.id));
        return updated ? updated.client : null;
      } else {
        const insertRes = await pool.query(
          'INSERT INTO clients (trainer_id, telegram_user_id, name, profile_json) VALUES ($1, $2, $3, $4) RETURNING id',
          [trainerId, effectiveTgId, currentName, profileJsonStr]
        );
        const newId = insertRes.rows[0]?.id;
        const created = await this.getClientById(Number(newId));
        return created ? created.client : null;
      }
    } catch (err: any) {
      console.warn('[pgService.upsertClientProfile fallback]:', err.message);
      return null;
    }
  },

  async resetAndSeedDatabase(): Promise<{ success: boolean; message: string; clients: Client[] }> {
    const seedList: Client[] = [
      {
        id: 1,
        trainer_id: 1,
        telegram_user_id: 435297513,
        telegram_username: 'denis_trainer',
        name: 'Денис (Главный тренер)',
        is_vip: true,
        is_admin: true,
        profile: {
          name: 'Денис',
          gender: 'male',
          role: 'admin',
          is_admin: true,
          is_vip: true,
          goal: 'Главный тренер и методист',
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
          gender: 'male',
          role: 'admin',
          is_admin: true,
          is_vip: true,
          goal: 'Управление и развитие системы',
          activity_level: 'Умеренная',
          intent_analytics: { training: 8, nutrition: 6, recovery: 5 },
          active_topic: 'training'
        },
        created_at: new Date(Date.now() - 25 * 86400000).toISOString()
      },
      {
        id: 3,
        trainer_id: 1,
        telegram_user_id: 200000001,
        telegram_username: 'alex_power',
        name: 'Алексей',
        is_vip: true,
        is_admin: false,
        profile: {
          name: 'Алексей',
          telegram_username: 'alex_power',
          gender: 'male',
          role: 'vip',
          is_vip: true,
          is_admin: false,
          age: 32,
          height: 182,
          weight: 85,
          goal: 'Набор мышечной массы',
          activity_level: 'Высокая',
          training_frequency: '4 раза в неделю',
          diet_preferences: 'Сбалансированная, высокий белок',
          intent_analytics: { muscle_gain: 8, training: 6, recovery: 3 },
          active_topic: 'muscle_gain'
        },
        created_at: new Date(Date.now() - 7 * 86400000).toISOString()
      },
      {
        id: 4,
        trainer_id: 1,
        telegram_user_id: 200000002,
        telegram_username: 'elena_fitness',
        name: 'Елена',
        is_vip: false,
        is_admin: false,
        profile: {
          name: 'Елена',
          telegram_username: 'elena_fitness',
          gender: 'female',
          role: 'subscriber',
          is_vip: false,
          is_admin: false,
          age: 27,
          height: 168,
          weight: 58,
          goal: 'Снижение жировой массы и тонус',
          activity_level: 'Умеренная',
          training_frequency: '3 раза в неделю',
          diet_preferences: 'Сбалансированное питание',
          intent_analytics: { weight_loss: 9, nutrition: 6, recovery: 2 },
          active_topic: 'weight_loss'
        },
        created_at: new Date(Date.now() - 3 * 86400000).toISOString()
      }
    ];

    db.clients = JSON.parse(JSON.stringify(seedList));

    const pool = getPgPool();
    if (pool) {
      try {
        await pool.query('DELETE FROM escalations');
        await pool.query('DELETE FROM messages');
        await pool.query('DELETE FROM clients');
        for (const c of seedList) {
          await pool.query(
            'INSERT INTO clients (id, trainer_id, telegram_user_id, name, profile_json, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [c.id, c.trainer_id, c.telegram_user_id, c.name, JSON.stringify(c.profile), c.created_at]
          );
        }
        await pool.query("SELECT setval(pg_get_serial_sequence('clients', 'id'), 4, true)").catch(() => {});
      } catch (err: any) {
        console.error('[resetAndSeedDatabase PG Error]:', err.message);
      }
    }

    return {
      success: true,
      message: 'База данных успешно очищена: удалены все дубликаты и создано 4 эталонных профиля (Денис, Олег, Алексей, Елена)',
      clients: seedList
    };
  },

  async getEscalations(): Promise<Escalation[] | null> {
    const pool = getPgPool();
    if (!pool) return null;
    try {
      const res = await pool.query(`
        SELECT e.id, e.client_id, e.reason, e.question, e.status, e.created_at,
               c.name as client_name, c.telegram_user_id
        FROM escalations e
        LEFT JOIN clients c ON e.client_id = c.id
        ORDER BY e.created_at DESC
      `);

      return res.rows.map(r => ({
        id: Number(r.id),
        client_id: Number(r.client_id),
        client_name: r.client_name || `Клиент #${r.client_id}`,
        reason: r.reason || 'Эскалация вопроса',
        question: r.question,
        status: (r.status === 'resolved' ? 'resolved' : 'open') as any,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
      }));
    } catch (err: any) {
      console.warn('[pgService.getEscalations fallback]:', err.message);
      return null;
    }
  },

  async resolveEscalation(id: number, answerText: string, saveToKb: boolean): Promise<boolean> {
    const pool = getPgPool();
    if (!pool) return false;
    try {
      const res = await pool.query(
        'SELECT id, client_id, question FROM escalations WHERE id = $1',
        [id]
      );
      if (res.rows.length === 0) return false;

      const esc = res.rows[0];
      await pool.query('UPDATE escalations SET status = $1 WHERE id = $2', ['resolved', id]);

      if (saveToKb && esc.question && answerText) {
        await pool.query(
          'INSERT INTO knowledge_items (trainer_id, category, title, content, status) VALUES ($1, $2, $3, $4, $5)',
          [1, 'other', esc.question.slice(0, 150), answerText, 'approved']
        );
      }
      return true;
    } catch (err: any) {
      console.warn('[pgService.resolveEscalation fallback]:', err.message);
      return false;
    }
  },

  async getKnowledge(): Promise<KnowledgeItem[] | null> {
    const pool = getPgPool();
    if (!pool) return null;
    try {
      const res = await pool.query(
        'SELECT id, trainer_id, category, title, content, status, created_at FROM knowledge_items ORDER BY id DESC'
      );
      return res.rows.map(r => ({
        id: Number(r.id),
        trainer_id: Number(r.trainer_id || 1),
        category_id: r.category || 'other',
        title: r.title,
        content: r.content,
        status: (r.status === 'approved' ? 'approved' : 'draft') as any,
        author_is_trainer: true,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
      }));
    } catch (err: any) {
      console.warn('[pgService.getKnowledge fallback]:', err.message);
      return null;
    }
  },

  async createKnowledge(data: { category_id: string; title: string; content: string; status: string }): Promise<KnowledgeItem | null> {
    const pool = getPgPool();
    if (!pool) return null;
    try {
      const res = await pool.query(
        'INSERT INTO knowledge_items (trainer_id, category, title, content, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at',
        [1, data.category_id || 'other', data.title, data.content, data.status === 'approved' ? 'approved' : 'draft']
      );
      const row = res.rows[0];
      return {
        id: Number(row.id),
        trainer_id: 1,
        category_id: data.category_id || 'other',
        title: data.title,
        content: data.content,
        status: data.status === 'approved' ? 'approved' : 'draft',
        author_is_trainer: true,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
      };
    } catch (err: any) {
      console.warn('[pgService.createKnowledge fallback]:', err.message);
      return null;
    }
  },

  async saveMessage(clientId: number, role: 'user' | 'assistant', text: string): Promise<boolean> {
    const pool = getPgPool();
    if (!pool) return false;
    try {
      await pool.query(
        'INSERT INTO messages (client_id, role, text) VALUES ($1, $2, $3)',
        [clientId, role, text]
      );
      return true;
    } catch (err: any) {
      console.warn('[pgService.saveMessage fallback]:', err.message);
      return false;
    }
  }
};

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
      name: 'Денис (Главный тренер)',
      is_vip: true,
      is_admin: true,
      profile: {
        name: 'Денис',
        telegram_username: 'denis_trainer',
        gender: 'male',
        role: 'admin',
        is_admin: true,
        is_vip: true,
        goal: 'Главный тренер и методист',
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
        role: 'admin',
        is_admin: true,
        is_vip: true,
        goal: 'Управление и развитие системы',
        activity_level: 'Умеренная',
        intent_analytics: { training: 8, nutrition: 6, recovery: 5 },
        active_topic: 'training'
      },
      created_at: new Date(Date.now() - 25 * 86400000).toISOString()
    },
    {
      id: 3,
      trainer_id: 1,
      telegram_user_id: 200000001,
      telegram_username: 'alex_power',
      name: 'Алексей',
      is_vip: true,
      is_admin: false,
      profile: {
        name: 'Алексей',
        telegram_username: 'alex_power',
        gender: 'male',
        role: 'vip',
        is_vip: true,
        is_admin: false,
        age: 32,
        height: 182,
        weight: 85,
        goal: 'Набор мышечной массы',
        activity_level: 'Высокая',
        training_frequency: '4 раза в неделю',
        diet_preferences: 'Сбалансированная, высокий белок',
        intent_analytics: { muscle_gain: 8, training: 6, recovery: 3 },
        active_topic: 'muscle_gain'
      },
      created_at: new Date(Date.now() - 7 * 86400000).toISOString()
    },
    {
      id: 4,
      trainer_id: 1,
      telegram_user_id: 200000002,
      telegram_username: 'elena_fitness',
      name: 'Елена',
      is_vip: false,
      is_admin: false,
      profile: {
        name: 'Елена',
        telegram_username: 'elena_fitness',
        gender: 'female',
        role: 'subscriber',
        is_vip: false,
        is_admin: false,
        age: 27,
        height: 168,
        weight: 58,
        goal: 'Снижение жировой массы и тонус',
        activity_level: 'Умеренная',
        training_frequency: '3 раза в неделю',
        diet_preferences: 'Сбалансированное питание',
        intent_analytics: { weight_loss: 9, nutrition: 6, recovery: 2 },
        active_topic: 'weight_loss'
      },
      created_at: new Date(Date.now() - 3 * 86400000).toISOString()
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

  nextClientId = 7;
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
  provider: 'ai_tunnel';
  aitunnelApiKey?: string;
  aitunnelBaseUrl: string;
  aitunnelModel: string;
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
    return {
      provider: 'ai_tunnel',
      aitunnelApiKey: cleanApiKey(process.env.AITUNNEL_API_KEY || process.env.AI_TUNNEL_API_KEY),
      aitunnelBaseUrl: (process.env.AITUNNEL_BASE_URL || process.env.AI_TUNNEL_BASE_URL || 'https://api.aitunnel.ru/v1').replace('iatunnel.ru', 'aitunnel.ru').replace(/\/+$/, ''),
      aitunnelModel: process.env.AITUNNEL_MODEL || process.env.AI_TUNNEL_MODEL || 'gpt-6-luna-pro'
    };
  }

  public updateRuntimeConfig(updates: Partial<LLMConfig>) {
    this.config = { ...this.config, ...updates };
  }

  public getEffectiveProvider(): { provider: 'ai_tunnel'; model: string; isReady: boolean; reason?: string } {
    const hasKey = isValidApiKey(this.config.aitunnelApiKey);
    if (hasKey) {
      return {
        provider: 'ai_tunnel',
        model: this.config.aitunnelModel,
        isReady: true,
        reason: `AI Tunnel активен (Модель: ${this.config.aitunnelModel})`
      };
    }

    return {
      provider: 'ai_tunnel',
      model: this.config.aitunnelModel,
      isReady: false,
      reason: 'AITUNNEL_API_KEY не обнаружен в переменных окружения. Укажите ключ в настройках или в .env'
    };
  }

  public getStatus() {
    const effective = this.getEffectiveProvider();
    return {
      configured_provider: 'ai_tunnel',
      effective_provider: 'AI Tunnel',
      effective_model: this.config.aitunnelModel,
      base_url: this.config.aitunnelBaseUrl,
      is_ready: effective.isReady,
      status_message: effective.reason,
      has_key: isValidApiKey(this.config.aitunnelApiKey),
      model: this.config.aitunnelModel
    };
  }

  public async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const effective = this.getEffectiveProvider();
    if (!effective.isReady) {
      throw new Error(`AI Tunnel не готов: ${effective.reason}`);
    }

    return this.callOpenAICompatible(
      this.config.aitunnelBaseUrl,
      this.config.aitunnelApiKey!,
      this.config.aitunnelModel,
      systemPrompt,
      userPrompt
    );
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

    let res: globalThis.Response;
    try {
      res = await fetch(url, {
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
    } catch (fetchErr: any) {
      throw new Error(`Не удалось связаться с сервером AI Tunnel (${url}). Проверьте AITUNNEL_API_KEY в .env или доступность сети. Причина: ${fetchErr?.message || String(fetchErr)}`);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} от AI Tunnel (${url}): ${errBody.slice(0, 300)}`);
    }

    const data: any = await res.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string') {
      throw new Error(`Некорректный ответ от AI Tunnel (${url}): ${JSON.stringify(data)}`);
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

// Zero-Cache Middleware for fresh WebApp sessions
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Proxy layer to Python Telegram Bot backend (PostgreSQL) when target URL is configured in environment
const TARGET_BOT_URL = (() => {
  const urls = [
    process.env.BOT_URL,
    process.env.BOT_API_URL,
    process.env.PYTHON_BACKEND_URL,
    process.env.RENDER_BOT_URL,
    process.env.API_BASE_URL,
    process.env.VITE_API_BASE_URL
  ];
  for (const url of urls) {
    if (url && url.trim()) {
      const trimmed = url.trim().replace(/\/+$/, '');
      if (!trimmed.includes('onrender.com') && !trimmed.includes('trainer-ai-bot')) {
        return trimmed;
      }
    }
  }
  return 'http://127.0.0.1:8000';
})();

// Health Check (Moved to startServer)

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
  const { provider, aitunnelApiKey, aitunnelBaseUrl, aitunnelModel } = req.body;
  
  const updates: any = {};
  const envUpdates: Record<string, string> = {};

  if (provider) updates.provider = provider;
  if (aitunnelApiKey !== undefined && aitunnelApiKey !== '') {
    updates.aitunnelApiKey = aitunnelApiKey;
    envUpdates.AITUNNEL_API_KEY = aitunnelApiKey;
    envUpdates.AI_TUNNEL_API_KEY = aitunnelApiKey;
    process.env.AITUNNEL_API_KEY = aitunnelApiKey;
  }
  if (aitunnelBaseUrl) {
    updates.aitunnelBaseUrl = aitunnelBaseUrl;
    envUpdates.AITUNNEL_BASE_URL = aitunnelBaseUrl;
    process.env.AITUNNEL_BASE_URL = aitunnelBaseUrl;
  }
  if (aitunnelModel) {
    updates.aitunnelModel = aitunnelModel;
    envUpdates.AITUNNEL_MODEL = aitunnelModel;
    process.env.AITUNNEL_MODEL = aitunnelModel;
  }

  if (Object.keys(envUpdates).length > 0) {
    saveToEnvFile(envUpdates);
  }

  llmService.updateRuntimeConfig(updates);
  res.json({
    success: true,
    message: 'Модель и конфигурация AI Tunnel сохранены в .env!',
    status: llmService.getStatus()
  });
});

// Environment Secrets Management API (With PostgreSQL Status)
app.get('/api/secrets', async (_req: Request, res: Response) => {
  const dbCheck = await pgService.checkConnectionDetails();
  res.json({
    github_token: maskSecretValue(process.env.GITHUB_TOKEN || process.env.GITHUB_API_KEY),
    aitunnel_api_key: maskSecretValue(process.env.AITUNNEL_API_KEY || process.env.AI_TUNNEL_API_KEY),
    database_url: maskSecretValue(process.env.DATABASE_URL),
    database_connected: dbCheck.connected,
    database_error: dbCheck.error,
    aitunnel_base_url: process.env.AITUNNEL_BASE_URL || 'https://api.aitunnel.ru/v1',
    aitunnel_model: process.env.AITUNNEL_MODEL || 'gpt-6-luna-pro'
  });
});

app.post('/api/secrets', async (req: Request, res: Response) => {
  const {
    GITHUB_TOKEN,
    AITUNNEL_API_KEY,
    AITUNNEL_BASE_URL,
    AITUNNEL_MODEL,
    DATABASE_URL
  } = req.body;

  const toSave: Record<string, string> = {};
  if (GITHUB_TOKEN !== undefined && GITHUB_TOKEN !== '') {
    toSave.GITHUB_TOKEN = GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = GITHUB_TOKEN;
  }
  if (AITUNNEL_API_KEY !== undefined && AITUNNEL_API_KEY !== '') {
    toSave.AITUNNEL_API_KEY = AITUNNEL_API_KEY;
    toSave.AI_TUNNEL_API_KEY = AITUNNEL_API_KEY;
    process.env.AITUNNEL_API_KEY = AITUNNEL_API_KEY;
  }
  if (AITUNNEL_BASE_URL !== undefined && AITUNNEL_BASE_URL !== '') {
    toSave.AITUNNEL_BASE_URL = AITUNNEL_BASE_URL;
    process.env.AITUNNEL_BASE_URL = AITUNNEL_BASE_URL;
  }
  if (AITUNNEL_MODEL !== undefined && AITUNNEL_MODEL !== '') {
    toSave.AITUNNEL_MODEL = AITUNNEL_MODEL;
    process.env.AITUNNEL_MODEL = AITUNNEL_MODEL;
  }
  if (DATABASE_URL !== undefined && DATABASE_URL !== '') {
    toSave.DATABASE_URL = DATABASE_URL;
    process.env.DATABASE_URL = DATABASE_URL;
  }

  saveToEnvFile(toSave);
  llmService.loadConfig();

  const dbCheck = await pgService.checkConnectionDetails();

  res.json({
    success: true,
    message: dbCheck.connected
      ? 'Ключи и параметры БД успешно сохранены, подключение к PostgreSQL установлено!'
      : `Ключи сохранены в .env, но БД не подключена${dbCheck.error ? `: ${dbCheck.error}` : ''}`,
    secrets: {
      github_token: maskSecretValue(process.env.GITHUB_TOKEN || process.env.GITHUB_API_KEY),
      aitunnel_api_key: maskSecretValue(process.env.AITUNNEL_API_KEY || process.env.AI_TUNNEL_API_KEY),
      database_url: maskSecretValue(process.env.DATABASE_URL),
      database_connected: dbCheck.connected,
      database_error: dbCheck.error,
      aitunnel_base_url: process.env.AITUNNEL_BASE_URL || 'https://api.aitunnel.ru/v1',
      aitunnel_model: process.env.AITUNNEL_MODEL || 'gpt-6-luna-pro'
    }
  });
});

// Raw .env editor endpoint for mobile devices
app.get('/api/env-raw', (_req: Request, res: Response) => {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      return res.json({ content: fs.readFileSync(envPath, 'utf8') });
    }
    const examplePath = path.join(__dirname, '.env.example');
    if (fs.existsSync(examplePath)) {
      return res.json({ content: fs.readFileSync(examplePath, 'utf8') });
    }
    res.json({ content: '' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/env-raw', (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Expected content as string' });
    }
    const envPath = path.join(__dirname, '.env');
    fs.writeFileSync(envPath, content, 'utf8');

    // Parse and apply to process.env
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const parts = trimmed.split('=');
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        if (key) {
          process.env[key] = val;
        }
      }
    });

    if (pgPoolInstance) {
      pgPoolInstance.end().catch(() => {});
      pgPoolInstance = null;
    }

    llmService.loadConfig();

    res.json({ success: true, message: 'Файл .env успешно сохранен на сервере!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stats (Live PostgreSQL or In-Memory Fallback)
app.get('/api/stats', async (_req: Request, res: Response) => {
  const pgClients = await pgService.getClients();
  const pgKnowledge = await pgService.getKnowledge();
  const pgEscalations = await pgService.getEscalations();

  if (pgClients) {
    const activeKb = pgKnowledge ? pgKnowledge.filter(k => k.status === 'approved').length : db.knowledge.filter(k => k.status === 'approved').length;
    const draftKb = pgKnowledge ? pgKnowledge.filter(k => k.status === 'draft').length : db.knowledge.filter(k => k.status === 'draft').length;
    const openEsc = pgEscalations ? pgEscalations.filter(e => e.status === 'open').length : db.escalations.filter(e => e.status === 'open').length;

    return res.json({
      totalClients: pgClients.length,
      activeKnowledgeItems: activeKb,
      draftKnowledgeItems: draftKb,
      openContentGaps: db.contentGaps.length,
      openEscalations: openEsc,
      totalMessages: pgClients.reduce((sum, c) => sum + ((c as any).messages_count || 0), 0),
      db_connected: true
    });
  }

  res.json({
    totalClients: db.clients.length,
    activeKnowledgeItems: db.knowledge.filter(k => k.status === 'approved').length,
    draftKnowledgeItems: db.knowledge.filter(k => k.status === 'draft').length,
    openContentGaps: db.contentGaps.length,
    openEscalations: db.escalations.filter(e => e.status === 'open').length,
    totalMessages: db.messages.length,
    db_connected: false
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
app.get('/api/knowledge', async (req: Request, res: Response) => {
  const { category_id, status } = req.query;
  const pgKb = await pgService.getKnowledge();
  let items = pgKb || [...db.knowledge];
  if (category_id) items = items.filter(k => k.category_id === category_id);
  if (status) items = items.filter(k => k.status === status);
  res.json(items);
});

app.post('/api/knowledge', async (req: Request, res: Response) => {
  const { category_id, title, content, status } = req.body;
  if (!category_id || !title || !content) {
    return res.status(400).json({ error: 'category_id, title, and content are required' });
  }

  const createdPg = await pgService.createKnowledge({
    category_id,
    title: stripEmojis(title),
    content: stripEmojis(content),
    status: status === 'approved' ? 'approved' : 'draft'
  });

  const newItem: KnowledgeItem = createdPg || {
    id: db.nextKnowledgeId++,
    trainer_id: 1,
    category_id,
    title: stripEmojis(title),
    content: stripEmojis(content),
    status: status === 'approved' ? 'approved' : 'draft',
    author_is_trainer: true,
    created_at: new Date().toISOString()
  };
  if (!createdPg) db.knowledge.push(newItem);
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

function deduplicateClients(list: Client[]): Client[] {
  const seenIds = new Set<number>();
  const seenTg = new Set<number>();
  const result: Client[] = [];

  for (const c of list) {
    if (!c || !c.id) continue;
    if (seenIds.has(c.id)) continue;
    if (c.telegram_user_id && seenTg.has(c.telegram_user_id)) continue;
    seenIds.add(c.id);
    if (c.telegram_user_id) seenTg.add(c.telegram_user_id);
    result.push(c);
  }
  return result;
}

// Clients API (Live PostgreSQL Integration with Deduplication)
app.get('/api/clients', async (_req: Request, res: Response) => {
  const pgClients = await pgService.getClients();
  if (pgClients && Array.isArray(pgClients)) {
    return res.json(deduplicateClients(pgClients));
  }
  res.json([]);
});

app.get('/api/clients/:id', async (req: Request, res: Response) => {
  const targetId = Number(req.params.id);
  const pgData = await pgService.getClientById(targetId);
  if (pgData) {
    return res.json({ ...pgData.client, messages: pgData.messages, escalations: [] });
  }

  const client = db.clients.find(c => c.id === targetId || c.telegram_user_id === targetId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const clientMessages = db.messages.filter(m => m.client_id === client.id);
  const clientEscalations = db.escalations.filter(e => e.client_id === client.id);
  res.json({ ...client, messages: clientMessages, escalations: clientEscalations });
});

// Resolve Client by Telegram User ID or Device ID Endpoint
app.all('/api/client/resolve', async (req: Request, res: Response) => {
  const bodyTgId = req.body?.telegram_user_id ? Number(req.body.telegram_user_id) : undefined;
  const queryTgId = req.query?.telegram_user_id ? Number(req.query.telegram_user_id) : undefined;
  const rawDeviceId = req.body?.device_id || req.query?.device_id;
  const name = req.body?.name || req.query?.name;

  let tg_id = bodyTgId || queryTgId;

  if (!tg_id) {
    return res.status(400).json({
      error: 'Идентификация отклонена: Отсутствует telegram_user_id. Пожалуйста, откройте сервис через Telegram.'
    });
  }

  const adminIds = [
    '747600306',
    '435297513',
    ...(process.env.TELEGRAM_ADMIN_CHAT_ID || '').split(','),
    ...(process.env.ADMIN_TELEGRAM_IDS || '').split(','),
    ...(process.env.ADMIN_IDS || '').split(','),
    ...(process.env.ADMIN_ID || '').split(','),
    ...(process.env.TRAINER_TELEGRAM_ID || '').split(',')
  ].map(s => s.trim()).filter(Boolean);

  const isAdmin = adminIds.includes(String(tg_id));
  const displayName = name ? String(name) : (isAdmin ? 'Администратор' : `Пользователь ${tg_id}`);

  // DEALS: Unlimited VIP status for everyone by default
  const effectiveIsAdmin = isAdmin;
  const effectiveIsVip = true;

  // Check if client already exists in PostgreSQL
  let existingClient = await pgService.getClientById(tg_id);
  
  const isProfileComplete = (prof: any) => {
    return Boolean(prof && prof.name && (prof.gender === 'male' || prof.gender === 'female'));
  };

  const isComplete = existingClient ? isProfileComplete(existingClient.client.profile) : false;

  if (!existingClient || (!isComplete && !isAdmin)) {
    // If they are an administrator, we can auto-register them
    if (isAdmin) {
      const initialName = displayName;
      const defaultProf = { 
          name: initialName, 
          is_admin: true, 
          is_vip: true,
          gender: 'male',
          goal: 'Общая физическая подготовка'
      };
      
      const pool = getPgPool();
      if (pool) {
          try {
              await pool.query(
                  'INSERT INTO clients (trainer_id, telegram_user_id, name, profile_json) VALUES ($1, $2, $3, $4) ON CONFLICT (telegram_user_id) DO NOTHING',
                  [1, tg_id, initialName, JSON.stringify(defaultProf)]
              );
              existingClient = await pgService.getClientById(tg_id);
          } catch (err: any) {
              console.error('[Admin Auto-Register Error]:', err.message || err);
          }
      }
    } else {
      // For a regular new/incomplete user, DO NOT auto-register, return registered: false
      return res.json({
          ok: true,
          registered: false,
          telegram_user_id: tg_id,
          name: displayName
      });
    }
  }

  if (existingClient) {
    const isHardcodedAdmin = isAdmin;
    const finalAdmin = Boolean(existingClient.client.is_admin || isHardcodedAdmin);
    // Respect the real VIP and role status of the user!
    const isVip = Boolean(existingClient.client.is_vip || existingClient.client.profile?.is_vip || finalAdmin);
    const role = existingClient.client.profile?.role || (finalAdmin ? 'admin' : (isVip ? 'vip' : 'subscriber'));

    return res.json({
        ok: true,
        registered: true,
        id: existingClient.client.id,
        telegram_user_id: tg_id,
        name: existingClient.client.name,
        is_admin: finalAdmin,
        is_vip: isVip,
        profile: { 
          ...existingClient.client.profile, 
          is_admin: finalAdmin,
          is_vip: isVip,
          role: role
        }
    });
  }

  // Fallback
  return res.json({
    ok: true,
    registered: true,
    id: tg_id,
    telegram_user_id: tg_id,
    name: displayName,
    is_admin: effectiveIsAdmin,
    is_vip: true
  });
});

// Admin Reset & Clean Database Endpoint
app.post(['/api/admin/clean-database', '/api/admin/reset-clients'], async (_req: Request, res: Response) => {
  try {
    const result = await pgService.resetAndSeedDatabase();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset database' });
  }
});

// Escalations API (Live PostgreSQL Integration)
app.get('/api/escalations', async (_req: Request, res: Response) => {
  const pgEsc = await pgService.getEscalations();
  if (pgEsc) {
    return res.json(pgEsc);
  }
  res.json(db.escalations);
});

app.put('/api/escalations/:id/resolve', async (req: Request, res: Response) => {
  const escId = Number(req.params.id);
  const { trainer_answer, save_to_kb } = req.body;

  const success = await pgService.resolveEscalation(escId, trainer_answer || '', Boolean(save_to_kb));

  const escalation = db.escalations.find(e => e.id === escId);
  if (escalation) {
    escalation.status = 'resolved';
    escalation.trainer_answer = stripEmojis(trainer_answer || 'Ответ подготовлен тренером.');
  }

  res.json({ success: true, resolved_in_db: success });
});

// Get Client Profile Endpoint
app.get(['/api/client/profile', '/api/client/:id/profile'], async (req: Request, res: Response) => {
  const queryTgId = req.query.telegram_user_id ? Number(req.query.telegram_user_id) : undefined;
  const paramId = req.params.id ? Number(req.params.id) : undefined;
  const queryClientId = req.query.client_id ? Number(req.query.client_id) : undefined;

  const targetId = queryTgId || paramId || queryClientId;

  if (targetId) {
    const pgData = await pgService.getClientById(targetId);
    if (pgData) {
      return res.json({
        client_id: pgData.client.id,
        telegram_user_id: pgData.client.telegram_user_id,
        name: pgData.client.name,
        profile: pgData.client.profile || {},
        is_vip: Boolean(pgData.client.is_vip),
        is_admin: Boolean(pgData.client.is_admin)
      });
    }
  }

  const client = db.clients.find(c => (targetId && (c.id === targetId || c.telegram_user_id === targetId))) || db.clients[0];
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  res.json({
    client_id: client.id,
    telegram_user_id: client.telegram_user_id,
    name: client.name || client.profile?.name || 'Пользователь',
    profile: client.profile || {},
    is_vip: Boolean(client.is_vip),
    is_admin: Boolean(client.is_admin)
  });
});

// Update Client Profile Endpoint
app.post('/api/client/profile', async (req: Request, res: Response) => {
  const { client_id, name, age, height, weight, goal, activity_level, training_frequency, restrictions, diet_preferences, is_admin, telegram_user_id } = req.body;
  const numClientId = client_id ? Number(client_id) : undefined;
  const numTgId = telegram_user_id ? Number(telegram_user_id) : undefined;

  const updatedPg = await pgService.upsertClientProfile({
    client_id: numClientId,
    telegram_user_id: numTgId,
    name,
    is_admin: is_admin !== undefined ? !!is_admin : undefined,
    profile: {
      age: age ? Number(age) : undefined,
      height: height ? Number(height) : undefined,
      weight: weight ? Number(weight) : undefined,
      goal: goal ? stripEmojis(goal) : undefined,
      activity_level: activity_level ? stripEmojis(activity_level) : undefined,
      training_frequency: training_frequency ? stripEmojis(training_frequency) : undefined,
      restrictions: restrictions !== undefined ? stripEmojis(restrictions) : undefined,
      diet_preferences: diet_preferences !== undefined ? stripEmojis(diet_preferences) : undefined
    }
  });

  const targetTgOrId = numTgId || numClientId;
  const client = db.clients.find(c => targetTgOrId && (c.id === targetTgOrId || c.telegram_user_id === targetTgOrId));
  if (client) {
    if (!client.profile) client.profile = { name: client.name, goal: 'Общая физическая подготовка' };
    if (name) { client.name = stripEmojis(name); client.profile.name = stripEmojis(name); }
    if (age !== undefined && age !== '') client.profile.age = Number(age);
    if (height !== undefined && height !== '') client.profile.height = Number(height);
    if (weight !== undefined && weight !== '') client.profile.weight = Number(weight);
    if (goal) client.profile.goal = stripEmojis(goal);
    if (activity_level) client.profile.activity_level = stripEmojis(activity_level);
    if (training_frequency) client.profile.training_frequency = stripEmojis(training_frequency);
    if (restrictions !== undefined) client.profile.restrictions = stripEmojis(restrictions);
    if (diet_preferences !== undefined) client.profile.diet_preferences = stripEmojis(diet_preferences);
  }

  res.json({ success: true, client: updatedPg || client });
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
app.post(['/api/client/vip/toggle', '/api/client/status/update'], async (req: Request, res: Response) => {
  const { client_id, telegram_user_id, is_vip, is_admin, role } = req.body;
  const numClientId = client_id !== undefined ? Number(client_id) : undefined;
  const numTgId = telegram_user_id !== undefined ? Number(telegram_user_id) : undefined;

  const targetIsAdmin = role === 'admin' ? true : (is_admin !== undefined ? !!is_admin : undefined);
  const targetIsVip = role === 'admin' || role === 'vip' ? true : (role === 'subscriber' ? false : (is_vip !== undefined ? !!is_vip : undefined));

  let client = db.clients.find(c => (numClientId !== undefined && c.id === numClientId) || (numTgId !== undefined && c.telegram_user_id === numTgId));
  if (!client && numClientId !== undefined) {
    client = db.clients.find(c => c.id === numClientId);
  }

  const effectiveTgId = client?.telegram_user_id || numTgId || (numClientId && numClientId > 1000 ? numClientId : 1);

  const updatedPg = await pgService.upsertClientProfile({
    telegram_user_id: effectiveTgId,
    is_admin: targetIsAdmin,
    is_vip: targetIsVip
  });

  if (client) {
    if (targetIsAdmin !== undefined) client.is_admin = targetIsAdmin;
    if (targetIsVip !== undefined) client.is_vip = targetIsVip;
    if (client.profile) {
      client.profile.is_admin = client.is_admin;
      client.profile.is_vip = client.is_vip;
    }
  }

  res.json({
    ok: true,
    success: true,
    client_id: client?.id || numClientId || effectiveTgId,
    is_vip: client?.is_vip ?? targetIsVip ?? false,
    is_admin: client?.is_admin ?? targetIsAdmin ?? false,
    client: updatedPg || client
  });
});

// VIP Request by Client Endpoint
app.post('/api/client/vip/request', (req: Request, res: Response) => {
  const { client_id, note, profile } = req.body;
  const clientId = Number(client_id || 1);
  const client = db.clients.find(c => c.id === clientId);
  const clientName = client?.name || (profile?.name ? String(profile.name) : `Клиент #${clientId}`);

  if (profile && client) {
    client.profile = { ...client.profile, ...profile };
    if (profile.name) client.name = profile.name;
  }

  db.escalations.push({
    id: db.nextEscalationId++,
    client_id: clientId,
    client_name: clientName,
    reason: 'Заявка на VIP (Ведение)',
    question: note || `Запрос на персональное ведение (VIP) от ${clientName}`,
    status: 'open',
    created_at: new Date().toISOString()
  });

  res.json({
    ok: true,
    message: 'Заявка на персональное ведение успешно отправлена тренеру'
  });
});

// Clear Client Messages Endpoint
app.post(['/api/client/:id/messages/clear', '/api/client/messages/clear', '/api/chat/clear'], (req: Request, res: Response) => {
  const clientId = Number(req.params.id || req.body.client_id || 1);
  db.messages = db.messages.filter(m => m.client_id !== clientId);
  res.json({ ok: true, message: 'История сообщений успешно очищена' });
});

// Helper function to send Telegram notifications to all trainers
async function sendTelegramAlertToTrainers(text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.log('[Telegram Alert] TELEGRAM_BOT_TOKEN is not configured. Alert text:', text);
    return;
  }

  const trainers = [
    '747600306',
    '435297513',
    ...(process.env.TELEGRAM_ADMIN_CHAT_ID || '').split(','),
    ...(process.env.ADMIN_TELEGRAM_IDS || '').split(','),
    ...(process.env.ADMIN_IDS || '').split(','),
    ...(process.env.ADMIN_ID || '').split(','),
    ...(process.env.TRAINER_TELEGRAM_ID || '').split(',')
  ].map(s => s.trim()).filter(Boolean);

  // De-duplicate trainer IDs
  const uniqueTrainers = Array.from(new Set(trainers));

  for (const trainerId of uniqueTrainers) {
    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: trainerId,
          text: text,
          parse_mode: 'HTML'
        })
      });
      if (!res.ok) {
        console.warn(`[Telegram Alert] Failed to send alert to trainer ${trainerId}: ${res.statusText}`);
      }
    } catch (err) {
      console.error(`[Telegram Alert] Error sending alert to trainer ${trainerId}:`, err);
    }
  }
}

// Rate Limiting settings endpoints
app.get('/api/trainer/settings', (req: Request, res: Response) => {
  const hourlyLimit = parseInt(process.env.HOURLY_RATE_LIMIT || '5', 10);
  const subscriberPrice = parseInt(process.env.SUBSCRIBER_PRICE || '490', 10);
  const vipPrice = parseInt(process.env.VIP_PRICE || '4990', 10);
  res.json({
    ok: true,
    hourly_rate_limit: 1000000,
    subscriber_price: isNaN(subscriberPrice) ? 490 : subscriberPrice,
    vip_price: isNaN(vipPrice) ? 4990 : vipPrice
  });
});

app.post('/api/trainer/settings', (req: Request, res: Response) => {
  const { hourly_rate_limit, subscriber_price, vip_price } = req.body;
  const updates: Record<string, string> = {};

  if (hourly_rate_limit !== undefined) {
    const numLimit = parseInt(String(hourly_rate_limit), 10);
    if (!isNaN(numLimit) && numLimit >= 0) {
      updates.HOURLY_RATE_LIMIT = String(numLimit);
    }
  }

  if (subscriber_price !== undefined) {
    const sPrice = parseInt(String(subscriber_price), 10);
    if (!isNaN(sPrice) && sPrice >= 0) {
      updates.SUBSCRIBER_PRICE = String(sPrice);
    }
  }

  if (vip_price !== undefined) {
    const vPrice = parseInt(String(vip_price), 10);
    if (!isNaN(vPrice) && vPrice >= 0) {
      updates.VIP_PRICE = String(vPrice);
    }
  }

  if (Object.keys(updates).length > 0) {
    saveToEnvFile(updates);
    return res.json({
      ok: true,
      success: true,
      hourly_rate_limit: updates.HOURLY_RATE_LIMIT ? parseInt(updates.HOURLY_RATE_LIMIT, 10) : undefined,
      subscriber_price: updates.SUBSCRIBER_PRICE ? parseInt(updates.SUBSCRIBER_PRICE, 10) : undefined,
      vip_price: updates.VIP_PRICE ? parseInt(updates.VIP_PRICE, 10) : undefined,
      message: 'Настройки успешно сохранены!'
    });
  }
  res.status(400).json({ error: 'Некорректное значение лимита' });
});

// Interactive Chat API
app.post('/api/chat', async (req: Request, res: Response) => {
  const { client_id, message_text, category_id } = req.body;
  if (!message_text) return res.status(400).json({ error: 'Message text is required' });

  let client = db.clients.find(c => c.id === Number(client_id)) || db.clients[0];

  // Dynamic Rate Limiting for non-VIP, non-Admin, and non-Subscriber clients
  const hourlyLimit = parseInt(process.env.HOURLY_RATE_LIMIT || '5', 10);
  if (!client.is_vip && !client.is_admin && client.profile?.role !== 'subscriber' && hourlyLimit > 0) {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const recentMessages = db.messages.filter(m => 
      m.client_id === client.id && 
      m.role === 'user' && 
      m.created_at >= oneHourAgo
    );
    if (recentMessages.length >= hourlyLimit) {
      const limitExceededText = `Превышен лимит бесплатных запросов (${hourlyLimit} запросов в час). Перейдите в раздел Профиль и активируйте подписку или VIP-доступ без ограничений!`;
      
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

    // Send Telegram alert to trainers about client confusion / escalation
    const clientUsername = client.telegram_username || client.profile?.telegram_username ? `@${client.telegram_username || client.profile?.telegram_username}` : 'нет username';
    const alertText = 
      `⚠️ <b>Сигнал о замешательстве подопечного!</b>\n\n` +
      `👤 <b>Подопечный</b>: ${client.name} (${clientUsername})\n` +
      `❓ <b>Вопрос</b>: <i>«${cleanUserText}»</i>\n` +
      `🚨 <b>Причина</b>: ${result.escalation_reason || 'Сложный вопрос / запутался'}\n\n` +
      `💡 <i>Рекомендация: предложить персональное ведение тренером (VIP).</i>`;

    sendTelegramAlertToTrainers(alertText);
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
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.APP_ENV === 'production' || 
                       process.env.RENDER === 'true';

  console.log(`[Server] Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`[Server] Working directory: ${__dirname}`);

  // Allow Telegram in-app WebApp iframe embedding across all Telegram web/mobile clients
  app.use((_req: Request, res: Response, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://telegram.org;");
    next();
  });

  if (isProduction) {
    app.use((req, res, next) => {
      if (!req.url.startsWith('/assets')) {
        console.log(`[Request] ${req.method} ${req.url}`);
      }
      next();
    });
  }

  // Health Check (Fastest response)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', environment: isProduction ? 'production' : 'development' });
  });

  // Local-only API paths handled by Node.js
  const localOnlyPaths = [
    '/api/admin',
    '/api/secrets',
    '/api/env-raw',
    '/api/llm/status',
    '/api/llm/test',
    '/api/llm/config',
    '/api/stats',
    '/api/client/status/update',
    '/api/client/vip/toggle',
    '/api/trainer/settings',
    '/api/knowledge',
    '/api/categories',
    '/api/content-gaps',
    '/api/clients',
    '/api/escalations',
    '/api/client/profile',
    '/api/chat/clear'
  ];

  // Static Assets Priority (Only in Production)
  if (isProduction) {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      console.log(`[Server] Serving static files from: ${distPath}`);
      app.use(express.static(distPath, {
        maxAge: '1d',
        index: false
      }));
    } else {
      console.warn(`[Server Warning] Static dist folder NOT found at: ${distPath}`);
    }
  }

  // Proxy layer (Only for non-local /api paths)
  if (TARGET_BOT_URL) {
    app.use('/api', async (req: Request, res: Response, next) => {
      if (localOnlyPaths.some(p => req.originalUrl.startsWith(p))) {
        return next();
      }

      const targetUrl = `${TARGET_BOT_URL}${req.originalUrl}`;
      console.log(`[Proxy] Routing ${req.method} ${req.originalUrl} -> ${targetUrl}`);
      try {
        const forbiddenHeaders = ['host', 'content-length', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'accept-encoding'];
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          const lowerKey = key.toLowerCase();
          if (!forbiddenHeaders.includes(lowerKey) && typeof value === 'string') {
            headers[key] = value;
          }
        }

        const fetchOptions: RequestInit = {
          method: req.method,
          headers,
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
          fetchOptions.body = JSON.stringify(req.body);
        }

        const upstreamRes = await fetch(targetUrl, fetchOptions);
        if (upstreamRes.status === 404 || upstreamRes.status === 405) {
          if (req.originalUrl.startsWith('/api')) {
            return res.status(upstreamRes.status).json({ error: `API route returned ${upstreamRes.status}` });
          }
          return next();
        }

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
        console.error(`[Proxy Error] ${req.method} ${req.originalUrl} -> ${targetUrl}:`, err.message);
        if (req.originalUrl.startsWith('/api')) {
          return res.status(502).json({ error: 'Upstream API server is offline or restarting' });
        }
        next();
      }
    });

    app.use('/telegram', async (req: Request, res: Response, next) => {
      const targetUrl = `${TARGET_BOT_URL}${req.originalUrl}`;
      console.log(`[Proxy] Routing Webhook ${req.method} ${req.originalUrl} -> ${targetUrl}`);
      try {
        const forbiddenHeaders = ['host', 'content-length', 'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'accept-encoding'];
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          const lowerKey = key.toLowerCase();
          if (!forbiddenHeaders.includes(lowerKey) && typeof value === 'string') {
            headers[key] = value;
          }
        }

        const fetchOptions: RequestInit = {
          method: req.method,
          headers,
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
          fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
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
        console.error(`[Telegram Webhook Proxy Error] ${req.method} ${req.originalUrl} -> ${targetUrl}:`, err.message);
        res.status(502).json({ error: 'Upstream Telegram Bot backend is offline or restarting' });
      }
    });
  }

  let useViteDev = false;
  if (!isProduction) {
    try {
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
      useViteDev = true;
    } catch (_err) {
      console.warn('[Server] Vite module not found or failed to load, falling back to static dist bundle serving.');
    }
  }

  if (!useViteDev) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // Don't serve index.html for missing /api routes
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const indexPath = path.resolve(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Not Found: Frontend bundle missing. Please build the app first.');
      }
    });
  }

  // Pre-check database connection on startup to determine pgIsDown state instantly
  pgService.checkConnectionDetails().catch(() => {});

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Trainer AI Bot ver 1.0.0] Listening on http://0.0.0.0:${PORT}`);

    // Spawn Python Telegram Bot process alongside Express server if Python is available
    if (process.env.TELEGRAM_BOT_TOKEN || process.env.NODE_ENV === 'production') {
      import('child_process').then(({ spawn }) => {
        console.log('[Trainer AI Bot] Launching Python Telegram Bot process (python -m app.main)...');
        const pyBot = spawn('python3', ['-m', 'app.main'], {
          stdio: 'inherit',
          env: { ...process.env, PORT: '8000' }
        });
        pyBot.on('error', (err) => {
          console.warn('[Python Bot Launcher Notice]:', err.message);
        });
      }).catch((err) => {
        console.warn('[Python Bot Launcher Warning]: Could not launch Python process:', err);
      });
    }
  });
}

startServer();

import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, ShieldAlert, CheckCircle2, ChevronRight, Folder, FolderTree, BookOpen, RefreshCw, Zap, UserCheck } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  parent_id?: string | null;
  description?: string;
}

interface Client {
  id: number;
  name: string;
  is_vip: boolean;
  profile: any;
}

interface Message {
  id: number;
  client_id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  created_at: string;
  kb_matched?: boolean;
  match_score?: number;
}

export const TelegramSimulator: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClientId, setActiveClientId] = useState<number>(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const [resClients, resCats] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/categories')
      ]);
      const dataClients = await resClients.json();
      const dataCats = await resCats.json();
      if (Array.isArray(dataClients)) setClients(dataClients);
      if (Array.isArray(dataCats)) setCategories(dataCats);
    } catch (err) {
      console.error('Fetch data error:', err);
    }
  };

  const fetchClientMessages = async (clientId: number) => {
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      const data = await res.json();
      if (data && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error('Fetch client messages error:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeClientId) {
      fetchClientMessages(activeClientId);
    }
  }, [activeClientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const activeClient = clients.find(c => c.id === activeClientId) || clients[0];

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || loading) return;

    setInputText('');
    setLoading(true);

    const tempUserMsg: Message = {
      id: Date.now(),
      client_id: activeClientId,
      role: 'user',
      text,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeClientId,
          message_text: text,
          category_id: selectedCatId
        })
      });
      const data = await res.json();
      if (data.assistant_message) {
        setMessages(prev => [
          ...prev.filter(m => m.id !== tempUserMsg.id),
          data.user_message,
          data.assistant_message
        ]);
      }
    } catch (err) {
      console.error('Chat API error:', err);
    } finally {
      setLoading(false);
    }
  };

  const topLevelCategories = categories.filter(c => !c.parent_id);
  const subCategories = selectedCatId ? categories.filter(c => c.parent_id === selectedCatId) : [];

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] bg-slate-950 rounded-xl border border-slate-800 shadow-2xl overflow-hidden">
      {/* Telegram Mini App Header */}
      <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
              AI-Библиотекарь Тренера
              <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full font-normal">
                ver 1.0.0 TMA
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" />
              {activeClient?.is_vip ? 'Персональное ведение (VIP)' : 'Подписчик канала'}
            </div>
          </div>
        </div>

        {/* Client Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:inline">Симуляция:</span>
          <select
            value={activeClientId}
            onChange={e => setActiveClientId(Number(e.target.value))}
            className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
          >
            {clients.map((c, idx) => (
              <option key={`sim-client-${c.id}-${idx}`} value={c.id}>
                {c.name} ({c.is_vip ? 'VIP' : 'Подписчик'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dynamic Category Navigation Tree */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-3 py-2 overflow-x-auto flex items-center gap-2 shrink-0">
        <button
          onClick={() => setSelectedCatId(null)}
          className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1 shrink-0 transition ${
            selectedCatId === null
              ? 'bg-indigo-600 text-white border-indigo-500'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" /> Все темы
        </button>

        {topLevelCategories.map((cat, idx) => (
          <button
            key={`sim-topcat-${cat.id}-${idx}`}
            onClick={() => setSelectedCatId(cat.id)}
            className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1 shrink-0 transition ${
              selectedCatId === cat.id
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Folder className="w-3.5 h-3.5" /> {cat.name}
          </button>
        ))}
      </div>

      {/* Subcategory Filter (If Selected) */}
      {subCategories.length > 0 && (
        <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto text-xs text-slate-400">
          <span className="shrink-0 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Подкатегории:</span>
          {subCategories.map((sub, idx) => (
            <button
              key={`sim-subcat-${sub.id}-${idx}`}
              onClick={() => handleSendMessage(`Расскажи подробно про ${sub.name}`)}
              className="bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-slate-800 px-2 py-0.5 rounded text-[11px] shrink-0 transition flex items-center gap-1"
            >
              <BookOpen className="w-3 h-3 text-indigo-400" /> {sub.name}
            </button>
          ))}
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div key={`sim-msg-${msg.id || idx}-${idx}`} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0 mt-1">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-md text-sm whitespace-pre-wrap ${
                isUser
                  ? 'bg-indigo-600 text-white rounded-tr-none'
                  : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none'
              }`}>
                {msg.text}

                {/* Match Score Indicator (No Emojis) */}
                {!isUser && msg.match_score !== undefined && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center gap-2 text-[11px]">
                    {msg.match_score >= 70 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/30 font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Статья из БЗ (Соответствие: {msg.match_score}%)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-indigo-300 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800/30 font-medium">
                        <BookOpen className="w-3 h-3" /> Ответ сформирован по принципам (Зафиксировано в план статей)
                      </span>
                    )}
                  </div>
                )}

                <div className={`text-[10px] mt-1 text-right ${isUser ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {isUser && (
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold shrink-0 mt-1">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-xs bg-slate-900 px-3 py-2 rounded-xl w-fit border border-slate-800 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            AI-Библиотекарь ищет статьи с высоким соответствием...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Action Trigger Bar */}
      <div className="bg-slate-900/90 border-t border-slate-800 p-2 overflow-x-auto flex gap-2 shrink-0">
        <button
          onClick={() => handleSendMessage('Какие правила приема креатина моногидрата?')}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 shrink-0 transition flex items-center gap-1.5"
        >
          <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Тест совпадения &gt;= 70% (Креатин)
        </button>
        <button
          onClick={() => handleSendMessage('Сколько отдыхать между тяжелыми подходами для роста ног?')}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 shrink-0 transition flex items-center gap-1.5"
        >
          <FolderTree className="w-3.5 h-3.5 text-indigo-400" /> Тест совпадения &lt; 70% (Аналитика статей)
        </button>
        <button
          onClick={() => handleSendMessage('Здравствуйте, я бы хотел заказать личное ведение со сдачами отчетов.')}
          className="bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 text-xs px-3 py-1.5 rounded-lg border border-indigo-800/50 shrink-0 transition flex items-center gap-1.5"
        >
          <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Заявка на персональное ведение
        </button>
      </div>

      {/* Input Bar */}
      <div className="bg-slate-900 p-3 border-t border-slate-800 flex gap-2 items-center">
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
          placeholder="Напишите вопрос библиотекарю..."
          className="flex-1 bg-slate-950 text-slate-100 text-sm rounded-xl px-4 py-2.5 border border-slate-800 focus:outline-none focus:border-indigo-500 transition placeholder:text-slate-500"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition shadow-lg shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

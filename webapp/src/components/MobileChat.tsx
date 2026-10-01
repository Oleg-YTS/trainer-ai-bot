import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, CheckCircle2, BookOpen, AlertCircle, RefreshCw, Zap, Dumbbell, Salad, Moon, Flame, TrendingUp, HelpCircle } from 'lucide-react';
import { apiFetch } from '../api';

interface Message {
  id: number;
  client_id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  created_at: string;
  kb_matched?: boolean;
  match_score?: number;
}

interface MobileChatProps {
  isDark: boolean;
  initialQuery?: string;
  onClearInitialQuery?: () => void;
  clientId?: number;
}

export const MobileChat: React.FC<MobileChatProps> = ({
  isDark,
  initialQuery,
  onClearInitialQuery,
  clientId = 1
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const DEFAULT_WELCOME: Message = {
    id: 1,
    client_id: clientId,
    role: 'assistant',
    text: 'Здравствуйте! Я ассистент-библиотекарь тренера. Задайте вопрос по методике тренировок, расчету питания или восстановлению.',
    created_at: new Date().toISOString()
  };

  const fetchHistory = async () => {
    try {
      const res = await apiFetch(`/api/clients/${clientId}`);
      const data = await res.json();
      if (data && Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(data.messages);
      } else {
        setMessages([DEFAULT_WELCOME]);
      }
    } catch (err) {
      console.warn('Failed to load message history:', err);
      setMessages([DEFAULT_WELCOME]);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [clientId]);

  useEffect(() => {
    if (initialQuery) {
      handleSendMessage(initialQuery);
      if (onClearInitialQuery) onClearInitialQuery();
    }
  }, [initialQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || loading) return;

    setInputText('');
    setLoading(true);

    const tempUserMsg: Message = {
      id: Date.now(),
      client_id: clientId,
      role: 'user',
      text,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          message_text: text,
          message: text
        })
      });
      const data = await res.json();
      if (data.assistant_message) {
        setMessages(prev => [
          ...prev.filter(m => m.id !== tempUserMsg.id),
          data.user_message || tempUserMsg,
          data.assistant_message
        ]);
      } else if (data.text) {
        setMessages(prev => [
          ...prev.filter(m => m.id !== tempUserMsg.id),
          tempUserMsg,
          {
            id: Date.now() + 1,
            client_id: clientId,
            role: 'assistant',
            text: data.text,
            created_at: new Date().toISOString()
          }
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          client_id: clientId,
          role: 'assistant',
          text: 'Связь с сервером временно недоступна. Пожалуйста, повторите вопрос или задайте его в Telegram-боте.',
          created_at: new Date().toISOString()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      if (!dateStr) return '';
      let normalized = dateStr;
      if (!normalized.endsWith('Z') && !normalized.includes('+')) {
        normalized += 'Z';
      }
      const d = new Date(normalized);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 pb-4">
        {messages.map(msg => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className={`flex items-end gap-2 max-w-[88%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isUser && (
                  <img
                    src="/assets/images/trainer_mascot_avatar_icon_1790802380770.jpg"
                    alt="Маскот / Аватар Ассистента"
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover shrink-0 border border-[#2B4A3D] mb-0.5 shadow-sm"
                  />
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-xs whitespace-pre-wrap leading-relaxed shadow-sm ${
                    isUser
                      ? isDark
                        ? 'bg-[#24352D] text-[#E8ECE9] rounded-br-none'
                        : 'bg-[#2B4A3D] text-white rounded-br-none'
                      : isDark
                        ? 'bg-[#121B17] border border-[#1F2E27] text-[#E8ECE9] rounded-bl-none'
                        : 'bg-white border border-[#D8E0DB] text-[#141F1A] rounded-bl-none'
                  }`}
                >
                  {msg.text}

                  {/* Match indicator without pills */}
                  {!isUser && msg.match_score !== undefined && (
                    <div className={`mt-2 pt-2 border-t flex items-center gap-1.5 text-[10px] ${
                      isDark ? 'border-[#18231E]' : 'border-[#F0F4F1]'
                    }`}>
                      {msg.match_score >= 70 ? (
                        <span className="flex items-center gap-1 text-[#7DA295]">
                          <CheckCircle2 className="w-3 h-3" />
                          Статья из БЗ тренера · Соответствие {msg.match_score}%
                        </span>
                      ) : (
                        <span className={`flex items-center gap-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'}`}>
                          <BookOpen className="w-3 h-3" />
                          Сформировано по принципам · Зафиксировано для статьи
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <span className={`text-[9px] mt-1 px-1 opacity-50 ${isUser ? 'text-right' : 'text-left'}`}>
                {formatTime(msg.created_at)}
              </span>
            </div>
          );
        })}

        {loading && (
          <div className={`flex items-center gap-2 text-xs py-2 px-3 rounded-xl border w-fit animate-pulse ${
            isDark ? 'bg-[#121B17] border-[#1F2E27] text-[#8E9E96]' : 'bg-white border-[#D8E0DB] text-[#53665C]'
          }`}>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>AI Библиотекарь анализирует запрос...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Interactive Topic Quick Chips (SVG icons only, Zero Emoji) */}
      <div className="pt-2 pb-1 overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0">
        {[
          { id: 'training', label: 'Тренировки', icon: Dumbbell, query: 'Расскажи подробнее про раздел: Тренировочный процесс' },
          { id: 'nutrition', label: 'Питание', icon: Salad, query: 'Расскажи подробнее про раздел: Питание и диетология' },
          { id: 'recovery', label: 'Восстановление', icon: Moon, query: 'Расскажи подробнее про раздел: Восстановление и сон' },
          { id: 'weight_loss', label: 'Снижение веса', icon: Flame, query: 'Расскажи подробнее про раздел: Снижение жировой массы' },
          { id: 'muscle_gain', label: 'Набор массы', icon: TrendingUp, query: 'Расскажи подробнее про раздел: Набор мышечной массы' },
          { id: 'general', label: 'Методика', icon: HelpCircle, query: 'Расскажи подробнее про раздел: Общие вопросы методики' }
        ].map(chip => {
          const IconComp = chip.icon;
          return (
            <button
              key={chip.id}
              onClick={() => handleSendMessage(chip.query)}
              disabled={loading}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition shrink-0 active:scale-95 ${
                isDark
                  ? 'bg-[#121B17] border border-[#1F2E27] text-[#C2D1C9] hover:border-[#5B8A78] hover:text-[#E8ECE9]'
                  : 'bg-white border border-[#D8E0DB] text-[#2B4A3D] hover:border-[#2B4A3D]'
              }`}
            >
              <IconComp className="w-3 h-3 opacity-80 shrink-0" />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Seamless Floating Input Capsule (NO border-t) */}
      <div className="pt-2 shrink-0">
        <div className={`flex items-center gap-2 rounded-full p-1 pl-4 transition shadow-sm ${
          isDark
            ? 'bg-[#121B17] border border-[#1F2E27] focus-within:border-[#5B8A78]'
            : 'bg-white border border-[#D8E0DB] focus-within:border-[#2B4A3D]'
        }`}>
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            onFocus={(e) => {
              const target = e.currentTarget;
              setTimeout(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }, 250);
            }}
            placeholder="Спросите у библиотекаря..."
            className={`flex-1 text-[16px] sm:text-xs bg-transparent outline-none py-2 ${
              isDark ? 'text-[#E8ECE9] placeholder-[#5E7068]' : 'text-[#141F1A] placeholder-[#8E9E96]'
            }`}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || loading}
            className={`p-2.5 rounded-full transition disabled:opacity-30 disabled:cursor-not-allowed ${
              isDark
                ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

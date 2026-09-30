import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, CheckCircle2, BookOpen, AlertCircle, RefreshCw, Zap } from 'lucide-react';
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
}

export const MobileChat: React.FC<MobileChatProps> = ({
  isDark,
  initialQuery,
  onClearInitialQuery
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchHistory = async () => {
    try {
      const res = await apiFetch('/api/clients/1');
      const data = await res.json();
      if (data && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

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
      client_id: 1,
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
          client_id: 1,
          message_text: text
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Quick Prompts Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 shrink-0 no-scrollbar text-[11px]">
        <button
          onClick={() => handleSendMessage('Какие правила приема креатина моногидрата?')}
          className={`px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition shrink-0 ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27] text-[#8E9E96] hover:text-[#E8ECE9]'
              : 'bg-white border-[#D8E0DB] text-[#53665C] hover:text-[#141F1A]'
          }`}
        >
          Креатин (соответствие &gt;=70%)
        </button>
        <button
          onClick={() => handleSendMessage('Сколько отдыхать между тяжелыми подходами?')}
          className={`px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition shrink-0 ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27] text-[#8E9E96] hover:text-[#E8ECE9]'
              : 'bg-white border-[#D8E0DB] text-[#53665C] hover:text-[#141F1A]'
          }`}
        >
          Отдых (аналитика &lt;70%)
        </button>
        <button
          onClick={() => handleSendMessage('Появилась боль в колене при выпадах')}
          className={`px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition shrink-0 ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27] text-[#8E9E96] hover:text-[#E8ECE9]'
              : 'bg-white border-[#D8E0DB] text-[#53665C] hover:text-[#141F1A]'
          }`}
        >
          Боль в колене (эскалация)
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 pb-4">
        {messages.map(msg => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs whitespace-pre-wrap leading-relaxed shadow-sm ${
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

      {/* Input Field */}
      <div className={`pt-2 border-t shrink-0 ${
        isDark ? 'border-[#1F2E27]' : 'border-[#D8E0DB]'
      }`}>
        <div className={`flex items-center gap-2 rounded-xl border p-1 pl-3.5 transition ${
          isDark
            ? 'bg-[#121B17] border-[#1F2E27] focus-within:border-[#5B8A78]'
            : 'bg-white border-[#D8E0DB] focus-within:border-[#2B4A3D]'
        }`}>
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            placeholder="Спросите у библиотекаря..."
            className={`flex-1 text-xs bg-transparent outline-none py-2 ${
              isDark ? 'text-[#E8ECE9] placeholder-[#5E7068]' : 'text-[#141F1A] placeholder-[#8E9E96]'
            }`}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || loading}
            className={`p-2 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed ${
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

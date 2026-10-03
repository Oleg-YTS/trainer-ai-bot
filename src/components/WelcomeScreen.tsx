import React from 'react';
import { Bot, ArrowRight, Sparkles, ShieldCheck, Zap } from 'lucide-react';

interface WelcomeScreenProps {
  isDark: boolean;
  onDisableSimulation?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ isDark, onDisableSimulation }) => {
  const handleGoToBot = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      // Direct link to the bot with start parameter to trigger onboarding
      tg.openTelegramLink('https://t.me/den4uk_ai_bot?start=reg');
      tg.close();
    } else {
      window.open('https://t.me/den4uk_ai_bot', '_blank');
    }
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 text-center ${
      isDark ? 'bg-[#0A100D] text-[#E8EDEA]' : 'bg-[#F4F6F4] text-[#1A2421]'
    }`}>
      {/* Background Glow */}
      <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 blur-[120px] rounded-full opacity-20 pointer-events-none ${
        isDark ? 'bg-indigo-500' : 'bg-indigo-400'
      }`} />

      <div className="relative z-10 max-w-sm w-full flex flex-col items-center">
        {/* Animated Icon Container */}
        <div className={`w-24 h-24 rounded-[32px] flex items-center justify-center mb-8 shadow-2xl transform hover:scale-105 transition-transform duration-500 ${
          isDark ? 'bg-indigo-600' : 'bg-indigo-500'
        }`}>
          <Bot className="w-12 h-12 text-white" />
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg animate-bounce">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-4 tracking-tight">
          Привет!
        </h1>
        
        <p className={`text-lg mb-8 leading-relaxed ${
          isDark ? 'text-[#8E9E96]' : 'text-[#5C6E64]'
        }`}>
          Чтобы начать работу с <span className="font-semibold text-indigo-500">AI-Библиотекарем</span>, 
          нужно пройти короткую регистрацию в Telegram боте.
        </p>

        {/* Feature List */}
        <div className="space-y-4 mb-10 w-full">
          {[
            { icon: <Zap className="w-5 h-5 text-amber-400" />, text: 'Всего 2 простых шага' },
            { icon: <ShieldCheck className="w-5 h-5 text-emerald-500" />, text: 'Безопасно и приватно' },
            { icon: <Bot className="w-5 h-5 text-indigo-400" />, text: 'Мгновенный доступ к базе' }
          ].map((item, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl border ${
              isDark ? 'bg-[#121B17] border-[#1C2621]' : 'bg-white border-[#E2E8E4]'
            }`}>
              {item.icon}
              <span className="text-sm font-medium">{item.text}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleGoToBot}
          className={`group w-full py-4 px-6 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 ${
            isDark 
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20' 
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
          }`}
        >
          Начать регистрацию
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        {onDisableSimulation && (
          <button
            onClick={onDisableSimulation}
            className={`mt-4 w-full py-2.5 px-6 rounded-xl font-semibold text-xs border transition-all active:scale-95 ${
              isDark 
                ? 'bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/25' 
                : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
            }`}
          >
            ❌ Выйти из режима симуляции (Dev)
          </button>
        )}

        <p className={`mt-6 text-xs uppercase tracking-widest font-bold opacity-40 ${
          isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'
        }`}>
          ver 2.0.0 TMA
        </p>
      </div>
    </div>
  );
};

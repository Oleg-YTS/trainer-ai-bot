import React, { useState, useEffect } from 'react';
import { User, Check, Sparkles } from 'lucide-react';
import { apiFetch } from '../api';

interface OnboardingModalProps {
  isOpen: boolean;
  clientId: number;
  initialName?: string;
  isDark: boolean;
  onComplete: (updatedName: string, gender: string) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  clientId,
  initialName = '',
  isDark,
  onComplete
}) => {
  const [name, setName] = useState<string>(initialName);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (initialName && initialName !== 'Пользователь' && initialName !== 'Загрузка...') {
      setName(initialName);
    }
  }, [initialName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Пожалуйста, укажите ваше имя');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await apiFetch('/api/client/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId || 1,
          name: name.trim(),
          gender: gender,
        })
      });

      if (response.ok) {
        try {
          localStorage.setItem(`trainer_onboarding_done_${clientId || 1}`, 'true');
        } catch {}
        onComplete(name.trim(), gender);
      } else {
        setError('Не удалось сохранить данные. Попробуйте еще раз.');
      }
    } catch (err) {
      console.error('Onboarding save error:', err);
      setError('Ошибка соединения. Попробуйте снова.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div
        className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl transition-all border ${
          isDark
            ? 'bg-[#182620] border-[#2B4A3D] text-[#E8ECE9]'
            : 'bg-white border-[#D0DCD5] text-[#141F1A]'
        }`}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${
              isDark ? 'bg-[#2B4A3D]/50 text-[#7DA295]' : 'bg-[#EAF2ED] text-[#2B4A3D]'
            }`}
          >
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Добро пожаловать!</h2>
          <p
            className={`text-xs mt-1 leading-relaxed ${
              isDark ? 'text-[#8A9E94]' : 'text-[#5C7065]'
            }`}
          >
            Укажите ваше имя и пол, чтобы тренер сформировал первичный профиль и настроил программу.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className={`block text-xs font-medium mb-1 text-left ${
                isDark ? 'text-[#A0B2A8]' : 'text-[#4A5E53]'
              }`}
            >
              Ваше имя
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Иван"
                className={`w-full px-3 py-2.5 pl-9 rounded-xl text-sm transition outline-none border ${
                  isDark
                    ? 'bg-[#121B17] border-[#2B4A3D] text-white focus:border-[#7DA295]'
                    : 'bg-[#F4F7F5] border-[#D0DCD5] text-[#141F1A] focus:border-[#2B4A3D]'
                }`}
                required
              />
              <User className="w-4 h-4 absolute left-3 top-3 opacity-40" />
            </div>
          </div>

          <div>
            <label
              className={`block text-xs font-medium mb-1.5 text-left ${
                isDark ? 'text-[#A0B2A8]' : 'text-[#4A5E53]'
              }`}
            >
              Укажите пол
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  gender === 'male'
                    ? isDark
                      ? 'bg-[#2B4A3D]/60 border-[#7DA295] text-white'
                      : 'bg-[#2B4A3D] border-[#2B4A3D] text-white'
                    : isDark
                    ? 'bg-[#121B17] border-[#2B4A3D]/40 text-[#8A9E94] hover:border-[#2B4A3D]'
                    : 'bg-[#F4F7F5] border-[#D0DCD5] text-[#5C7065] hover:border-[#2B4A3D]/40'
                }`}
              >
                <span className="text-lg">♂</span>
                <span className="text-xs font-medium">Мужской</span>
              </button>

              <button
                type="button"
                onClick={() => setGender('female')}
                className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                  gender === 'female'
                    ? isDark
                      ? 'bg-[#2B4A3D]/60 border-[#7DA295] text-white'
                      : 'bg-[#2B4A3D] border-[#2B4A3D] text-white'
                    : isDark
                    ? 'bg-[#121B17] border-[#2B4A3D]/40 text-[#8A9E94] hover:border-[#2B4A3D]'
                    : 'bg-[#F4F7F5] border-[#D0DCD5] text-[#5C7065] hover:border-[#2B4A3D]/40'
                }`}
              >
                <span className="text-lg">♀</span>
                <span className="text-xs font-medium">Женский</span>
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-400 text-center font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 shadow-lg ${
              isDark
                ? 'bg-[#7DA295] hover:bg-[#8FB4A7] text-[#121B17]'
                : 'bg-[#2B4A3D] hover:bg-[#385E4E] text-white'
            } disabled:opacity-50`}
          >
            {isSubmitting ? (
              <span>Сохранение...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Начать работу</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

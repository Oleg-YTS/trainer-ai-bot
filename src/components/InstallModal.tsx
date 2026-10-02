import React from 'react';
import { X, Share, PlusSquare, Smartphone, Check, ArrowRight } from 'lucide-react';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

export const InstallModal: React.FC<InstallModalProps> = ({ isOpen, onClose, isDark }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md rounded-t-2xl sm:rounded-2xl border p-5 shadow-2xl transition-all ${
          isDark
            ? 'bg-[#121B17] border-[#1F2E27] text-[#E8ECE9]'
            : 'bg-white border-[#D8E0DB] text-[#141F1A]'
        }`}
        style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between pb-3 border-b border-inherit">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#5B8A78]" />
            <h3 className="font-semibold text-sm">Добавить на экран смартфона</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-inherit opacity-60 hover:opacity-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          <p className={`leading-relaxed ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
            Запуск с экрана телефона открывает AI Библиотекаря в полноэкранном режиме без адресной строки браузера и с быстрым доступом к базе знаний.
          </p>

          {/* iOS Safari Instruction */}
          <div className={`p-3.5 rounded-xl border ${
            isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F6F4] border-[#D8E0DB]'
          }`}>
            <div className="font-semibold text-xs mb-2 flex items-center gap-1.5">
              <span>Для iPhone и iPad (Safari)</span>
            </div>
            <ol className={`space-y-2 text-[11px] list-decimal list-inside ${
              isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'
            }`}>
              <li className="flex items-start gap-1.5">
                <span className="font-medium text-inherit">1.</span>
                <span>Нажмите иконку <strong className="text-inherit">«Поделиться»</strong> (квадрат со стрелкой вверх) в нижней панели Safari.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-medium text-inherit">2.</span>
                <span>Прокрутите меню вниз и выберите <strong className="text-inherit">«На экран «Домой»»</strong>.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-medium text-inherit">3.</span>
                <span>В правом верхнем углу нажмите <strong className="text-inherit">«Добавить»</strong>.</span>
              </li>
            </ol>
          </div>

          {/* Android Chrome / Telegram Instruction */}
          <div className={`p-3.5 rounded-xl border ${
            isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F6F4] border-[#D8E0DB]'
          }`}>
            <div className="font-semibold text-xs mb-2 flex items-center gap-1.5">
              <span>Для Android (Chrome / Telegram)</span>
            </div>
            <ol className={`space-y-2 text-[11px] list-decimal list-inside ${
              isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'
            }`}>
              <li className="flex items-start gap-1.5">
                <span className="font-medium text-inherit">1.</span>
                <span>Нажмите меню браузера <strong className="text-inherit">«три точки»</strong> в верхнем правом углу.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-medium text-inherit">2.</span>
                <span>Выберите пункт <strong className="text-inherit">«Установить приложение»</strong> или <strong className="text-inherit">«Добавить на гл. экран»</strong>.</span>
              </li>
            </ol>
          </div>

          <button
            onClick={onClose}
            className={`w-full py-2.5 rounded-xl font-medium text-xs transition ${
              isDark
                ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
            }`}
          >
            Понятно, закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

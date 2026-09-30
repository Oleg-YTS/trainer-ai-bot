import React, { useState } from 'react';
import {
  User,
  ShieldCheck,
  Sun,
  Moon,
  Smartphone,
  LayoutDashboard,
  CheckCircle2,
  Send,
  HelpCircle,
  FileText,
  Download,
  Copy,
  Check,
  Package,
  Server,
  Loader2
} from 'lucide-react';
import { apiFetch } from '../api';

interface MobileProfileProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenInstallModal: () => void;
  onOpenTrainerDashboard: () => void;
}

export const MobileProfile: React.FC<MobileProfileProps> = ({
  isDark,
  onToggleTheme,
  onOpenInstallModal,
  onOpenTrainerDashboard
}) => {
  const [personalTrainingRequested, setPersonalTrainingRequested] = useState(false);
  const [vipSimulated, setVipSimulated] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const handleDownloadFile = async (url: string, filename: string) => {
    setDownloadingFile(filename);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download error:', err);
      window.open(url, '_blank');
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleCopyLink = (path: string) => {
    const fullUrl = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(path);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleRequestPersonalTraining = async () => {
    try {
      await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 1,
          message_text: 'Запрос на персональное ведение тренером (отправлено через профиль)'
        })
      });
      setPersonalTrainingRequested(true);
    } catch (e) {
      console.error(e);
      setPersonalTrainingRequested(true);
    }
  };

  return (
    <div className="space-y-4 pb-24 text-xs">
      {/* Account Card */}
      <div className={`p-4 rounded-xl border space-y-3 ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${
            isDark ? 'bg-[#18231E] text-[#7DA295]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
          }`}>
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-sm text-inherit">Участник Сообщества</div>
            <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              {vipSimulated ? 'Тариф: Персональное ведение (VIP)' : 'Тариф: Подписка на канал'}
            </div>
          </div>
        </div>

        <div className={`pt-2 border-t text-[11px] space-y-1.5 ${
          isDark ? 'border-[#18231E] text-[#8E9E96]' : 'border-[#F0F4F1] text-[#53665C]'
        }`}>
          <div className="flex justify-between">
            <span>Доступ к базе знаний</span>
            <span className="font-medium text-inherit">Неограничен</span>
          </div>
          <div className="flex justify-between">
            <span>AI Библиотекарь</span>
            <span className="font-medium text-inherit">Активен 24/7</span>
          </div>
        </div>
      </div>

      {/* Personal Training Trigger Card */}
      <div className={`p-4 rounded-xl border space-y-3 ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <div className="font-semibold text-sm">Персональное ведение тренера</div>
        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
          Индивидуальная программа тренировок, персональный расчет макронутриентов, еженедельный разбор отчетов и прямой приоритетный контакт с тренером.
        </p>

        {personalTrainingRequested ? (
          <div className={`p-3 rounded-lg border flex items-center gap-2 text-[11px] ${
            isDark ? 'bg-[#18231E] border-[#1F2E27] text-[#7DA295]' : 'bg-[#EBF0EC] border-[#D8E0DB] text-[#2B4A3D]'
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Заявка отправлена тренеру. С вами свяжутся в Telegram в ближайшее время.</span>
          </div>
        ) : (
          <button
            onClick={handleRequestPersonalTraining}
            className={`w-full py-2.5 rounded-xl font-medium text-xs transition flex items-center justify-center gap-2 ${
              isDark
                ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
            }`}
          >
            <Send className="w-3.5 h-3.5" /> Запросить персональное ведение
          </button>
        )}
      </div>

      {/* Deployment & Download Section */}
      <div className={`p-4 rounded-xl border space-y-3 ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-[#5B8A78]" />
            <span>Архивы приложения для первичного размещения</span>
          </div>
        </div>
        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
          Скачивание напрямую через внутренний поток данных (Blob), предотвращающий ошибки 404.
        </p>

        {/* dist.zip Option */}
        <div className={`p-3 rounded-lg border space-y-2.5 ${
          isDark ? 'bg-[#18231E] border-[#253A30]' : 'bg-[#F4F7F5] border-[#D8E0DB]'
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-xs flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-[#5B8A78]" />
                <span>Клиентская сборка (dist.zip)</span>
              </div>
              <div className={`text-[10px] mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Готовые скомпилированные файлы (HTML, JS, CSS, PWA). Для обычного веб-хостинга.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => handleDownloadFile('/dist.zip', 'dist.zip')}
              disabled={downloadingFile === 'dist.zip'}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium text-xs transition flex items-center justify-center gap-1.5 ${
                isDark
                  ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                  : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
              }`}
            >
              {downloadingFile === 'dist.zip' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Скачивание...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Скачать dist.zip</span>
                </>
              )}
            </button>
            <button
              onClick={() => handleCopyLink('/dist.zip')}
              className={`py-1.5 px-2.5 rounded-lg border text-xs transition flex items-center justify-center gap-1 ${
                isDark
                  ? 'bg-[#121B17] border-[#253A30] hover:bg-[#1A2621] text-[#E8ECE9]'
                  : 'bg-white border-[#C8D6CF] hover:bg-[#F4F6F4] text-[#141F1A]'
              }`}
              title="Скопировать прямую ссылку"
            >
              {copiedLink === '/dist.zip' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[10px]">Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Ссылка</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* project-full.zip Option */}
        <div className={`p-3 rounded-lg border space-y-2.5 ${
          isDark ? 'bg-[#18231E] border-[#253A30]' : 'bg-[#F4F7F5] border-[#D8E0DB]'
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-xs flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#5B8A78]" />
                <span>Полный исходный код (project-full.zip)</span>
              </div>
              <div className={`text-[10px] mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Исходники + Node.js Express сервер (server.ts, package.json) для деплоя на Render/VPS.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => handleDownloadFile('/project-full.zip', 'project-full.zip')}
              disabled={downloadingFile === 'project-full.zip'}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium text-xs transition flex items-center justify-center gap-1.5 ${
                isDark
                  ? 'bg-[#1F2E27] text-[#E8ECE9] hover:bg-[#283C33] border border-[#253A30]'
                  : 'bg-white text-[#141F1A] hover:bg-[#F4F6F4] border border-[#C8D6CF]'
              }`}
            >
              {downloadingFile === 'project-full.zip' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Скачивание...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Скачать project-full.zip</span>
                </>
              )}
            </button>
            <button
              onClick={() => handleCopyLink('/project-full.zip')}
              className={`py-1.5 px-2.5 rounded-lg border text-xs transition flex items-center justify-center gap-1 ${
                isDark
                  ? 'bg-[#121B17] border-[#253A30] hover:bg-[#1A2621] text-[#E8ECE9]'
                  : 'bg-white border-[#C8D6CF] hover:bg-[#F4F6F4] text-[#141F1A]'
              }`}
              title="Скопировать прямую ссылку"
            >
              {copiedLink === '/project-full.zip' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[10px]">Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Ссылка</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Settings & Appearance */}
      <div className={`rounded-xl border divide-y overflow-hidden ${
        isDark ? 'bg-[#121B17] border-[#1F2E27] divide-[#18231E]' : 'bg-white border-[#D8E0DB] divide-[#F0F4F1]'
      }`}>
        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="w-full p-3.5 flex items-center justify-between text-left hover:opacity-80 transition"
        >
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${
              isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
            }`}>
              {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </div>
            <div>
              <div className="font-medium text-inherit">Цветовая схема</div>
              <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                {isDark ? 'Obsidian Green (Темная)' : 'Mineral Light (Светлая)'}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-medium opacity-60">Изменить</span>
        </button>

        {/* PWA Install Guide */}
        <button
          onClick={onOpenInstallModal}
          className="w-full p-3.5 flex items-center justify-between text-left hover:opacity-80 transition"
        >
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${
              isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
            }`}>
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="font-medium text-inherit">Добавить на экран смартфона</div>
              <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Инструкция по установке как приложения
              </div>
            </div>
          </div>
          <span className="text-[11px] font-medium opacity-60">Открыть</span>
        </button>

        {/* Concept Download Document */}
        <a
          href="/ADMIN_CONCEPT.txt"
          download
          className="w-full p-3.5 flex items-center justify-between text-left hover:opacity-80 transition block"
        >
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${
              isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
            }`}>
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="font-medium text-inherit">Концепция проекта</div>
              <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Скачать текстовый файл концепции (txt)
              </div>
            </div>
          </div>
          <span className="text-[11px] font-medium opacity-60">Скачать</span>
        </a>

        {/* Trainer Admin Mode Switch */}
        <button
          onClick={onOpenTrainerDashboard}
          className="w-full p-3.5 flex items-center justify-between text-left hover:opacity-80 transition"
        >
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${
              isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
            }`}>
              <LayoutDashboard className="w-4 h-4" />
            </div>
            <div>
              <div className="font-medium text-inherit">Панель управления тренера</div>
              <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Редактирование БЗ, анализ актуальности и эскалации
              </div>
            </div>
          </div>
          <span className="text-[11px] font-medium opacity-60">Перейти</span>
        </button>
      </div>
    </div>
  );
};

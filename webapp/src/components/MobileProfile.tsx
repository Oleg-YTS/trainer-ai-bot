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
  FileText,
  Download,
  Copy,
  Check,
  Package,
  Server,
  Loader2,
  Sparkles,
  FolderArchive
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
    <div className="space-y-6 pb-28 text-xs">
      {/* Top Header & Theme Switcher */}
      <div className={`p-4 rounded-xl border flex items-center justify-between ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
            isDark ? 'bg-[#18231E] text-[#7DA295]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
          }`}>
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-sm text-inherit">Участник Сообщества</div>
            <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Доступ к базе знаний активен
            </div>
          </div>
        </div>

        <button
          onClick={onToggleTheme}
          className={`p-2 rounded-xl border transition flex items-center gap-1.5 ${
            isDark ? 'bg-[#18231E] border-[#22352B] text-[#7DA295]' : 'bg-[#F4F7F5] border-[#E0E8E3] text-[#2B4A3D]'
          }`}
          title="Сменить тему"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* ========================================== */}
      {/* SECTION 1: ДЛЯ ПОЛЬЗОВАТЕЛЕЙ (For Users)  */}
      {/* ========================================== */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <User className="w-4 h-4 text-[#7DA295]" />
          <h2 className="font-semibold text-sm uppercase tracking-wider text-inherit">
            Для пользователей
          </h2>
        </div>

        <div className={`rounded-xl border divide-y overflow-hidden ${
          isDark ? 'bg-[#121B17] border-[#1F2E27] divide-[#18231E]' : 'bg-white border-[#D8E0DB] divide-[#F0F4F1]'
        }`}>
          {/* 1. Персональное ведение */}
          <div className="p-4 space-y-3">
            <div className="font-semibold text-sm">Персональное ведение</div>
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Индивидуальная программа тренировок, расчет макронутриентов, разбор отчетов и прямой приоритетный контакт с тренером.
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

          {/* 2. Добавить на экран */}
          <button
            onClick={onOpenInstallModal}
            className="w-full p-4 flex items-center justify-between text-left hover:opacity-80 transition"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}>
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium text-inherit">Добавить на экран</div>
                <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Установить как приложение на смартфон (PWA)
                </div>
              </div>
            </div>
            <span className="text-[11px] font-medium opacity-60">Открыть</span>
          </button>
        </div>
      </div>

      {/* ========================================== */}
      {/* SECTION 2: ДЛЯ АДМИНА (For Admin / Trainer)*/}
      {/* ========================================== */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2 px-1">
          <ShieldCheck className="w-4 h-4 text-[#7DA295]" />
          <h2 className="font-semibold text-sm uppercase tracking-wider text-inherit">
            Для админа
          </h2>
        </div>

        <div className={`rounded-xl border divide-y overflow-hidden ${
          isDark ? 'bg-[#121B17] border-[#1F2E27] divide-[#18231E]' : 'bg-white border-[#D8E0DB] divide-[#F0F4F1]'
        }`}>
          {/* 1. Панель управления */}
          <button
            onClick={onOpenTrainerDashboard}
            className="w-full p-4 flex items-center justify-between text-left hover:opacity-80 transition"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}>
                <LayoutDashboard className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium text-inherit">Панель управления</div>
                <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Редактирование БЗ, утверждение статей и эскалации
                </div>
              </div>
            </div>
            <span className="text-[11px] font-medium opacity-60">Перейти</span>
          </button>

          {/* 2. Добавить на экран */}
          <button
            onClick={onOpenInstallModal}
            className="w-full p-4 flex items-center justify-between text-left hover:opacity-80 transition"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}>
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <div className="font-medium text-inherit">Добавить на экран</div>
                <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Быстрый ярлык админа для рабочего стола
                </div>
              </div>
            </div>
            <span className="text-[11px] font-medium opacity-60">Открыть</span>
          </button>

          {/* 3. Концепция & Хранилище Знаний */}
          <div className="p-4 space-y-2">
            <div className="font-medium text-inherit flex items-center justify-between">
              <span>Концепция & Архитектура Хранилища</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-[#18231E] text-[#8E9E96]' : 'bg-[#EBF0EC] text-[#53665C]'}`}>
                TXT Документы
              </span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Детальные спецификации правил, работы с форматами Word/PDF/TXT, классификации и нарезки:
            </p>
            <div className="grid grid-cols-1 gap-2 pt-1">
              <a
                href="/KNOWLEDGE_STORAGE_CONCEPT.txt"
                download
                className={`p-2.5 rounded-lg border flex items-center justify-between transition ${
                  isDark ? 'bg-[#18231E] border-[#22352B] hover:bg-[#22352B]' : 'bg-[#F4F7F5] border-[#E0E8E3] hover:bg-[#EBF0EC]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#7DA295]" />
                  <div>
                    <div className="font-medium text-xs">Концепция Хранилища и Форматов</div>
                    <div className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Логика файлов .docx, .pdf, .txt, OCR и правил БЗ</div>
                  </div>
                </div>
                <Download className="w-3.5 h-3.5 opacity-70" />
              </a>

              <a
                href="/ADMIN_CONCEPT.txt"
                download
                className={`p-2.5 rounded-lg border flex items-center justify-between transition ${
                  isDark ? 'bg-[#18231E] border-[#22352B] hover:bg-[#22352B]' : 'bg-[#F4F7F5] border-[#E0E8E3] hover:bg-[#EBF0EC]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#7DA295]" />
                  <div>
                    <div className="font-medium text-xs">Общая Концепция & AI-Библиотекарь</div>
                    <div className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Правила проекта, 70% порог и анти-эмодзи гайд</div>
                  </div>
                </div>
                <Download className="w-3.5 h-3.5 opacity-70" />
              </a>

              <a
                href="/AUTO_DEPLOY_INSTRUCTIONS.txt"
                download
                className={`p-2.5 rounded-lg border flex items-center justify-between transition ${
                  isDark ? 'bg-[#18231E] border-[#22352B] hover:bg-[#22352B]' : 'bg-[#F4F7F5] border-[#E0E8E3] hover:bg-[#EBF0EC]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#7DA295]" />
                  <div>
                    <div className="font-medium text-xs">Инструкция по Авто-Деплою (CI/CD)</div>
                    <div className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Пошаговая настройка GitHub Actions и VPS</div>
                  </div>
                </div>
                <Download className="w-3.5 h-3.5 opacity-70" />
              </a>

              <a
                href="/RENDER_DEPLOY_GUIDE.txt"
                download
                className={`p-2.5 rounded-lg border flex items-center justify-between transition ${
                  isDark ? 'bg-[#18231E] border-[#22352B] hover:bg-[#22352B]' : 'bg-[#F4F7F5] border-[#E0E8E3] hover:bg-[#EBF0EC]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#7DA295]" />
                  <div>
                    <div className="font-medium text-xs">Деплой и Авто-обновление на Render.com</div>
                    <div className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Инструкция деплоя в 1 клик на Render.com</div>
                  </div>
                </div>
                <Download className="w-3.5 h-3.5 opacity-70" />
              </a>
            </div>
          </div>
        </div>

        {/* 4. Блок исходников (Source Files & Visual Branding Assets) */}
        <div className={`p-4 rounded-xl border space-y-4 ${
          isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
        }`}>
          <div className="flex items-center justify-between border-b pb-3 border-inherit">
            <div className="font-semibold text-sm flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-[#7DA295]" />
              <span>Блок исходников</span>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-[#18231E] text-[#8E9E96]' : 'bg-[#EBF0EC] text-[#53665C]'}`}>
              Архивы и графика
            </span>
          </div>

          {/* 4a. Client Build (dist.zip) */}
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
                  Готовые скомпилированные файлы (HTML, JS, CSS, PWA).
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

          {/* 4b. Full Project Source Code (project-full.zip) */}
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
                  Исходники + Node.js Express сервер (server.ts, package.json).
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

          {/* 4c. Graphics & Branding Assets */}
          <div className="space-y-3 pt-2 border-t border-inherit">
            <div className="font-medium text-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#7DA295]" />
              <span>Графические исходники и брендинг</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {/* Mascot Avatar Image */}
              <div className={`p-2.5 rounded-lg border flex items-center gap-3 ${isDark ? 'bg-[#18231E] border-[#22352B]' : 'bg-[#F4F7F5] border-[#E0E8E3]'}`}>
                <img
                  src="/assets/images/trainer_mascot_avatar_icon_1790802380770.jpg"
                  alt="Mascot Avatar Icon"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-lg object-cover shrink-0 border border-[#2B4A3D]"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs text-inherit">Маскот / Аватарка</div>
                  <div className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Формат 1:1 (JPG)</div>
                  <button
                    onClick={() => handleDownloadFile('/assets/images/trainer_mascot_avatar_icon_1790802380770.jpg', 'trainer_mascot_avatar.jpg')}
                    className={`mt-1.5 px-2 py-0.5 rounded text-[10px] font-medium transition flex items-center gap-1 ${
                      isDark ? 'bg-[#22352B] text-[#7DA295] hover:bg-[#2C4538]' : 'bg-[#E2EAE5] text-[#2B4A3D] hover:bg-[#D5E1DA]'
                    }`}
                  >
                    <Download className="w-2.5 h-2.5" /> Скачать
                  </button>
                </div>
              </div>

              {/* Library Banner Image */}
              <div className={`p-2.5 rounded-lg border space-y-2 ${isDark ? 'bg-[#18231E] border-[#22352B]' : 'bg-[#F4F7F5] border-[#E0E8E3]'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-xs text-inherit">Баннер Библиотеки</div>
                    <div className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Формат 16:9 (JPG)</div>
                  </div>
                  <button
                    onClick={() => handleDownloadFile('/assets/images/modern_premium_library_banner_1790801962361.jpg', 'modern_premium_library_banner.jpg')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition flex items-center gap-1 shrink-0 ${
                      isDark ? 'bg-[#22352B] text-[#7DA295] hover:bg-[#2C4538]' : 'bg-[#E2EAE5] text-[#2B4A3D] hover:bg-[#D5E1DA]'
                    }`}
                  >
                    <Download className="w-2.5 h-2.5" /> Скачать
                  </button>
                </div>
                <img
                  src="/assets/images/modern_premium_library_banner_1790801962361.jpg"
                  alt="Library Banner"
                  referrerPolicy="no-referrer"
                  className="w-full h-20 rounded-md object-cover border border-[#2B4A3D]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileProfile;

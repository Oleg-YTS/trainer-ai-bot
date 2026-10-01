import React, { useState, useEffect } from 'react';
import { MobileKnowledgeCatalog } from './components/MobileKnowledgeCatalog';
import { MobileChat } from './components/MobileChat';
import { MobileProfile } from './components/MobileProfile';
import { TrainerDashboard } from './components/TrainerDashboard';
import { InstallModal } from './components/InstallModal';
import { FolderTree, Bot, User, Sun, Moon } from 'lucide-react';
import { apiFetch } from './api';

interface CurrentUser {
  id: number;
  telegram_user_id: number | null;
  name: string;
  is_admin: boolean;
  is_vip: boolean;
}

export const App: React.FC = () => {
  // Theme state: dark (Obsidian Green) or light (Mineral Light)
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('trainer_theme');
    return saved ? saved === 'dark' : true;
  });

  // Active navigation tab: 'catalog' (База), 'chat' (Библиотекарь), 'profile' (Профиль), or 'trainer' (Панель тренера)
  const [activeTab, setActiveTab] = useState<'catalog' | 'chat' | 'profile' | 'trainer'>('chat');
  const [chatInitialQuery, setChatInitialQuery] = useState<string>('');
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  // Authenticated Telegram Client identity
  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    id: 1,
    telegram_user_id: null,
    name: 'Пользователь',
    is_admin: false,
    is_vip: false
  });

  const resolveCurrentUser = async () => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }
      const tgUser = tg?.initDataUnsafe?.user;
      const tgId = tgUser?.id;
      const tgName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') || tgUser?.username || '';
      const tgUsername = tgUser?.username || '';

      const res = await apiFetch('/api/client/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_user_id: tgId || undefined,
          name: tgName || undefined,
          username: tgUsername || undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setCurrentUser({
            id: data.id,
            telegram_user_id: data.telegram_user_id || tgId || null,
            name: data.name || tgName || 'Пользователь',
            is_admin: !!data.is_admin,
            is_vip: !!data.is_vip
          });
        }
      }
    } catch (err) {
      console.warn('Failed to resolve current user identity:', err);
    }
  };

  useEffect(() => {
    resolveCurrentUser();
  }, []);

  useEffect(() => {
    localStorage.setItem('trainer_theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const toggleTheme = () => setIsDark(prev => !prev);

  return (
    <div
      className={`h-[100dvh] w-full flex flex-col overflow-hidden relative ${
        isDark ? 'theme-obsidian' : 'theme-mineral'
      }`}
      style={{
        touchAction: 'pan-y',
        overscrollBehaviorX: 'none'
      }}
    >
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Minimalist Header (Strictly NO banners, NO pill badges, Seamless) */}
        <header
          className={`shrink-0 px-4 py-3 flex items-center justify-between transition-colors z-20 ${
            isDark
              ? 'bg-[#121B17]/95 text-[#E8ECE9]'
              : 'bg-white/95 text-[#141F1A]'
          }`}
          style={{ paddingTop: 'calc(0.75rem + var(--safe-top, 0px))' }}
        >
          {/* Left: App Title */}
          <div className="flex items-center gap-2">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
              isDark ? 'text-[#7DA295]' : 'text-[#2B4A3D]'
            }`}>
              <Bot className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-inherit">
              AI Библиотекарь
            </span>
          </div>

          {/* Right: Version and subtle theme toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              aria-label="Переключить тему"
              className="p-1 rounded-md text-inherit opacity-60 hover:opacity-100 transition"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <span
              className={`text-xs font-mono select-none ${
                isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'
              }`}
            >
              ver 1.0.0
            </span>
          </div>
        </header>

        {/* Scrollable Viewport / Content Screen */}
        <main
          className="flex-1 overflow-y-auto px-4 pt-3.5 pb-28 overscroll-y-contain relative focus:outline-none"
          id="main-scroll-container"
        >
          {activeTab === 'catalog' && (
            <MobileKnowledgeCatalog
              isDark={isDark}
              onAskQuestion={(query) => {
                setChatInitialQuery(query);
                setActiveTab('chat');
              }}
            />
          )}

          {activeTab === 'chat' && (
            <div className="h-full flex flex-col pb-4">
              <MobileChat
                isDark={isDark}
                initialQuery={chatInitialQuery}
                onClearInitialQuery={() => setChatInitialQuery('')}
                clientId={currentUser.id}
              />
            </div>
          )}

          {activeTab === 'profile' && (
            <MobileProfile
              isDark={isDark}
              onToggleTheme={toggleTheme}
              onOpenInstallModal={() => setShowInstallModal(true)}
              onOpenTrainerDashboard={() => {
                if (currentUser.is_admin) {
                  setActiveTab('trainer');
                }
              }}
              clientId={currentUser.id}
              isAdmin={currentUser.is_admin}
              isVip={currentUser.is_vip}
              onRefreshUser={resolveCurrentUser}
            />
          )}

          {activeTab === 'trainer' && (
            <div className="pb-24">
              {currentUser.is_admin ? (
                <TrainerDashboard
                  isDark={isDark}
                  onBackToClient={() => setActiveTab('profile')}
                />
              ) : (
                <div className="p-6 text-center space-y-3">
                  <p className="text-sm font-semibold">Доступ ограничен</p>
                  <p className={`text-xs ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Панель управления доступна только тренеру-администратору.
                  </p>
                  <button
                    onClick={() => setActiveTab('profile')}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#5B8A78] text-[#0A100D]"
                  >
                    Вернуться в профиль
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Floating 3-Section Navigation Bar (Liquid Glass Capsule) */}
        {activeTab !== 'trainer' && (
          <div
            className="fixed bottom-3 left-0 right-0 max-w-[310px] mx-auto z-40 px-2 pointer-events-none"
            style={{ paddingBottom: 'calc(0.25rem + var(--safe-bottom, 0px))' }}
          >
            {/* Floating Pure Glass Capsule Navigation Container */}
            <nav
              className={`relative pointer-events-auto rounded-full h-14 px-3 flex items-center transition-all ${
                isDark ? 'glass-nav-dark text-[#E8ECE9]' : 'glass-nav-light text-[#141F1A]'
              }`}
            >
              <div className="grid grid-cols-3 items-center w-full">
                {/* 1. База (Left) */}
                <button
                  onClick={() => setActiveTab('catalog')}
                  className={`flex flex-col items-center justify-center transition active:scale-95 ${
                    activeTab === 'catalog'
                      ? isDark
                        ? 'text-[#7DA295] font-semibold'
                        : 'text-[#2B4A3D] font-semibold'
                      : isDark
                        ? 'text-[#8E9E96] hover:text-[#E8ECE9]'
                        : 'text-[#7E9187] hover:text-[#141F1A]'
                  }`}
                >
                  <FolderTree className="w-4 h-4 mb-0.5" />
                  <span className="text-[10px]">База</span>
                </button>

                {/* 2. Библиотекарь (Center - Elevated above center line & slightly larger) */}
                <button
                  onClick={() => setActiveTab('chat')}
                  className="flex flex-col items-center justify-center -translate-y-3 transition group relative"
                >
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center shadow-xl border transition-transform group-active:scale-95 ${
                      activeTab === 'chat'
                        ? isDark
                          ? 'bg-[#5B8A78] text-[#0A100D] border-[#7DA295]/50 ring-2 ring-[#5B8A78]/30'
                          : 'bg-[#2B4A3D] text-white border-[#3C6150]/50 ring-2 ring-[#2B4A3D]/20'
                        : isDark
                          ? 'bg-[#18231E] text-[#8E9E96] border-[#22352B]'
                          : 'bg-white text-[#53665C] border-[#D8E0DB]'
                    }`}
                  >
                    <Bot className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 font-medium ${
                      activeTab === 'chat'
                        ? isDark
                          ? 'text-[#7DA295] font-semibold'
                          : 'text-[#2B4A3D] font-semibold'
                        : isDark
                          ? 'text-[#8E9E96]'
                          : 'text-[#7E9187]'
                    }`}
                  >
                    Библиотекарь
                  </span>
                </button>

                {/* 3. Профиль (Right) */}
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`flex flex-col items-center justify-center transition active:scale-95 ${
                    activeTab === 'profile'
                      ? isDark
                        ? 'text-[#7DA295] font-semibold'
                        : 'text-[#2B4A3D] font-semibold'
                      : isDark
                        ? 'text-[#8E9E96] hover:text-[#E8ECE9]'
                        : 'text-[#7E9187] hover:text-[#141F1A]'
                  }`}
                >
                  <User className="w-4 h-4 mb-0.5" />
                  <span className="text-[10px]">Профиль</span>
                </button>
              </div>
            </nav>
          </div>
        )}

        {/* PWA Install Instructions Modal */}
        <InstallModal
          isOpen={showInstallModal}
          onClose={() => setShowInstallModal(false)}
          isDark={isDark}
        />
      </div>
    </div>
  );
};

export default App;

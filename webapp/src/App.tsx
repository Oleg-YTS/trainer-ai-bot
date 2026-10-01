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

  // Authenticated Telegram / Web Client identity
  const [isResolving, setIsResolving] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    id: 0,
    telegram_user_id: null,
    name: 'Загрузка...',
    is_admin: false,
    is_vip: false
  });

  // Get or create unique browser device_id for web sessions
  const getOrCreateDeviceId = (): string => {
    try {
      let deviceId = localStorage.getItem('trainer_device_id');
      if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        localStorage.setItem('trainer_device_id', deviceId);
      }
      return deviceId;
    } catch {
      return 'device_' + Date.now();
    }
  };

  const resolveCurrentUser = async () => {
    setIsResolving(true);
    const timeoutTimer = setTimeout(() => {
      setIsResolving(false);
    }, 4000);

    try {
      // Clear legacy storage keys
      try {
        localStorage.removeItem('trainer_is_admin');
        localStorage.removeItem('trainer_telegram_id');
      } catch {}

      const deviceId = getOrCreateDeviceId();

      // Retry loop waiting for window.Telegram.WebApp if opening from direct link
      let tg = (window as any).Telegram?.WebApp;
      if (!tg?.initDataUnsafe?.user) {
        for (let attempt = 0; attempt < 5; attempt++) {
          tg = (window as any).Telegram?.WebApp;
          if (tg?.initDataUnsafe?.user) break;
          await new Promise(res => setTimeout(res, 100));
        }
      }

      if (tg) {
        try {
          tg.ready();
          tg.expand();
        } catch {}
      }

      // 1. Direct Telegram WebApp user object
      let tgUser = tg?.initDataUnsafe?.user;
      let tgId: number | undefined = tgUser?.id ? Number(tgUser.id) : undefined;
      let tgName: string = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') || tgUser?.username || '';
      let tgUsername: string = tgUser?.username || '';

      // Check start_param for direct links t.me/bot/app?startapp=...
      const startParam = tg?.initDataUnsafe?.start_param;
      if (startParam && startParam.startsWith('user_') && !tgId) {
        const parsedId = Number(startParam.replace('user_', ''));
        if (parsedId) tgId = parsedId;
      }

      // 2. Parse Telegram initData query string
      if (!tgId && tg?.initData) {
        try {
          const params = new URLSearchParams(tg.initData);
          const rawUser = params.get('user');
          if (rawUser) {
            const parsed = JSON.parse(rawUser);
            tgUser = parsed;
            tgId = Number(parsed.id);
            tgName = [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') || parsed.username || '';
            tgUsername = parsed.username || '';
          }
        } catch {}
      }

      // 3. Telegram WebApp location hash (#tgWebAppData=...)
      if (!tgId && typeof window !== 'undefined' && window.location.hash) {
        try {
          const hashStr = window.location.hash.replace(/^#/, '');
          const hashParams = new URLSearchParams(hashStr);
          const tgData = hashParams.get('tgWebAppData');
          if (tgData) {
            const dataParams = new URLSearchParams(tgData);
            const userJson = dataParams.get('user');
            if (userJson) {
              const parsed = JSON.parse(userJson);
              tgId = Number(parsed.id);
              tgName = [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') || parsed.username || '';
              tgUsername = parsed.username || '';
            }
          }
        } catch {}
      }

      // 4. URL query parameters (?tg_id=... or ?telegram_user_id=...)
      if (!tgId && typeof window !== 'undefined' && window.location.search) {
        try {
          const searchParams = new URLSearchParams(window.location.search);
          const rawId = searchParams.get('tg_id') || searchParams.get('user_id') || searchParams.get('telegram_user_id');
          if (rawId && Number(rawId)) {
            tgId = Number(rawId);
          }
          if (searchParams.get('name')) {
            tgName = searchParams.get('name') || '';
          }
          if (searchParams.get('username')) {
            tgUsername = searchParams.get('username') || '';
          }
        } catch {}
      }

      // 5. Local Device Fallback for Telegram ID
      if (!tgId) {
        try {
          const savedTgId = localStorage.getItem('trainer_user_tg_id');
          if (savedTgId && Number(savedTgId)) {
            tgId = Number(savedTgId);
          }
          const savedName = localStorage.getItem('trainer_user_tg_name');
          if (savedName && !tgName) {
            tgName = savedName;
          }
        } catch {}
      }

      if (tgId) {
        try {
          localStorage.setItem('trainer_user_tg_id', String(tgId));
          if (tgName) localStorage.setItem('trainer_user_tg_name', tgName);
        } catch {}
      }

      const res = await apiFetch('/api/client/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_user_id: tgId || undefined,
          device_id: deviceId,
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
            name: data.name || tgName || (data.is_admin ? 'Администратор' : 'Пользователь'),
            is_admin: Boolean(data.is_admin),
            is_vip: Boolean(data.is_vip)
          });
        }
      }
    } catch (err) {
      console.warn('Failed to resolve current user identity:', err);
    } finally {
      clearTimeout(timeoutTimer);
      setIsResolving(false);
    }
  };

  useEffect(() => {
    resolveCurrentUser();
  }, []);

  useEffect(() => {
    localStorage.setItem('trainer_theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const setUserRole = async (role: 'admin' | 'vip' | 'subscriber') => {
    if (!currentUser.id) return;
    try {
      const res = await apiFetch('/api/client/status/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: currentUser.id,
          role
        })
      });
      if (res.ok) {
        const isAdminVal = role === 'admin';
        const isVipVal = role === 'admin' || role === 'vip';
        setCurrentUser(prev => ({
          ...prev,
          is_admin: isAdminVal,
          is_vip: isVipVal
        }));
        if (role === 'admin') {
          setActiveTab('trainer');
        }
      }
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  };

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

          {/* Right: Sandbox role toggle, theme & version */}
          <div className="flex items-center gap-2">
            {currentUser.is_admin ? (
              <button
                onClick={() => setActiveTab('trainer')}
                className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 transition flex items-center gap-1"
                title="Перейти в панель тренера"
              >
                ★ Панель
              </button>
            ) : (
              <button
                onClick={() => setUserRole('admin')}
                className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition"
                title="Включить режим тренера для тестирования"
              >
                + Права админа
              </button>
            )}

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
                isResolving={isResolving}
              />
            </div>
          )}

          {activeTab === 'profile' && (
            <MobileProfile
              isDark={isDark}
              onToggleTheme={toggleTheme}
              onOpenInstallModal={() => setShowInstallModal(true)}
              onOpenTrainerDashboard={() => setActiveTab('trainer')}
              clientId={currentUser.id}
              isAdmin={currentUser.is_admin}
              isVip={currentUser.is_vip}
              onRefreshUser={resolveCurrentUser}
              onSetUserRole={setUserRole}
              onUpdateAdminState={(adminState) => {
                setCurrentUser(prev => ({
                  ...prev,
                  is_admin: adminState,
                  is_vip: adminState ? true : prev.is_vip
                }));
              }}
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
                <div className={`m-4 p-6 rounded-2xl border text-center space-y-3 ${
                  isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
                }`}>
                  <p className="text-sm font-semibold">Доступ ограничен</p>
                  <p className={`text-xs ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Панель управления доступна только тренеру-администратору.
                  </p>
                  <button
                    onClick={() => setActiveTab('chat')}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#5B8A78] text-[#0A100D]"
                  >
                    Вернуться в чат
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

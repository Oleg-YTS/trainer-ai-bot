import React, { useState, useEffect } from 'react';
import { MobileKnowledgeCatalog } from './components/MobileKnowledgeCatalog';
import { MobileChat } from './components/MobileChat';
import { MobileProfile } from './components/MobileProfile';
import { TrainerDashboard } from './components/TrainerDashboard';
import { WelcomeScreen } from './components/WelcomeScreen';
import { InstallModal } from './components/InstallModal';
import { FolderTree, Bot, User, Sun, Moon } from 'lucide-react';
import { apiFetch } from './api';

interface CurrentUser {
  id: number;
  telegram_user_id: number | null;
  name: string;
  is_admin: boolean;
  is_vip: boolean;
  is_registered?: boolean;
  role?: string;
}

const safeGetStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

const safeRemoveStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {}
};

export const App: React.FC = () => {
  // Theme state: dark (Obsidian Green) or light (Mineral Light)
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = safeGetStorage('trainer_theme');
    return saved ? saved === 'dark' : true;
  });

  const isSandbox = typeof window !== 'undefined' && (
    window.location.hostname.includes('ais-') || 
    window.location.hostname.includes('localhost') || 
    window.location.hostname.includes('127.0.0.1')
  );

  const [simulateNewUser, setSimulateNewUser] = useState<boolean>(() => {
    return safeGetStorage('trainer_simulate_new_user') === 'true';
  });

  // Active navigation tab: 'catalog' (База), 'chat' (Библиотекарь), 'profile' (Профиль), or 'trainer' (Панель тренера)
  const [activeTab, setActiveTab] = useState<'catalog' | 'chat' | 'profile' | 'trainer'>('chat');
  const [chatInitialQuery, setChatInitialQuery] = useState<string>('');
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  // Authenticated Telegram / Web Client identity
  const [isResolving, setIsResolving] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    id: 1,
    telegram_user_id: null,
    name: 'Пользователь',
    is_admin: false,
    is_vip: false,
    is_registered: true // Default to true to prevent flickering before resolution
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
          const rawInit = typeof tg.initData === 'string' ? tg.initData : String(tg.initData);
          const params = new URLSearchParams(rawInit);
          let rawUser = params.get('user');
          if (rawUser) {
            try { rawUser = decodeURIComponent(rawUser); } catch {}
            const parsed = typeof rawUser === 'string' ? JSON.parse(rawUser) : rawUser;
            if (parsed && parsed.id) {
              tgUser = parsed;
              tgId = Number(parsed.id);
              tgName = [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') || parsed.username || '';
              tgUsername = parsed.username || '';
            }
          }
        } catch {}
      }

      // 3. Telegram WebApp location hash (#tgWebAppData=...)
      if (!tgId && typeof window !== 'undefined' && window.location.hash) {
        try {
          let hashStr = window.location.hash.replace(/^#/, '');
          try { hashStr = decodeURIComponent(hashStr); } catch {}
          const hashParams = new URLSearchParams(hashStr);
          let tgData = hashParams.get('tgWebAppData') || hashParams.get('tgData') || hashStr;
          if (tgData) {
            try { tgData = decodeURIComponent(tgData); } catch {}
            const dataParams = new URLSearchParams(tgData);
            let userJson = dataParams.get('user');
            if (userJson) {
              try { userJson = decodeURIComponent(userJson); } catch {}
              const parsed = typeof userJson === 'string' ? JSON.parse(userJson) : userJson;
              if (parsed && parsed.id) {
                tgId = Number(parsed.id);
                tgName = [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') || parsed.username || '';
                tgUsername = parsed.username || '';
              }
            }
          }
        } catch {}
      }

      // 4. URL query parameters (?tg_id=..., ?as=user, ?as=admin)
      if (typeof window !== 'undefined' && window.location.search) {
        try {
          const searchParams = new URLSearchParams(window.location.search);
          const asRole = searchParams.get('as') || searchParams.get('role');
          if (asRole === 'user' || asRole === 'subscriber') {
            tgId = 999000111;
            tgName = 'Тестовый Подопечный';
          } else if (asRole === 'admin') {
            tgId = 747600306;
            tgName = 'Robert (Администратор)';
          } else {
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
          }
        } catch {}
      }

      // 5. Local Device Fallback for Telegram ID (ONLY for Sandbox/Dev environments)
      const isSandbox = typeof window !== 'undefined' && (
        window.location.hostname.includes('ais-') || 
        window.location.hostname.includes('localhost') || 
        window.location.hostname.includes('127.0.0.1')
      );

      if (!tgId && isSandbox) {
        tgId = 747600306; // Default to Admin Robert for Sandbox Preview
        tgName = 'Robert (Администратор)';
        try {
          localStorage.setItem('trainer_user_tg_id', String(tgId));
          localStorage.setItem('trainer_user_tg_name', tgName);
        } catch {}
      }

      if (!tgId) {
        // If we still don't have a TG ID and we are NOT in sandbox, 
        // it means we can't identify the user at all. Show Welcome/Reg screen.
        setCurrentUser(prev => ({ ...prev, is_registered: false }));
        setIsResolving(false);
        return;
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
        
        // If the backend says not registered, we must show the welcome screen
        if (data && data.registered === false) {
          setCurrentUser(prev => ({
            ...prev,
            telegram_user_id: data.telegram_user_id || tgId || null,
            name: data.name || tgName || 'Новый пользователь',
            is_registered: false
          }));
          return;
        }

        if (data && data.id) {
          const isHardcodedAdmin = (tgId === 747600306 || tgId === 435297513);
          const finalAdmin = Boolean(data.is_admin || isHardcodedAdmin);
          const finalVip = Boolean(data.is_vip || isHardcodedAdmin);

          let finalRole = 'user';
          if (finalAdmin) finalRole = 'admin';
          else if (finalVip) finalRole = 'vip';
          else if (data.profile?.role === 'subscriber') finalRole = 'subscriber';

          const savedOverride = localStorage.getItem('trainer_user_role_override');
          const activeRole = savedOverride || finalRole;

          setCurrentUser({
            id: data.id,
            telegram_user_id: data.telegram_user_id || tgId || null,
            name: data.name || tgName || (activeRole === 'admin' ? 'Robert (Администратор)' : 'Пользователь'),
            is_admin: activeRole === 'admin',
            is_vip: activeRole === 'admin' || activeRole === 'vip',
            is_registered: true,
            role: activeRole
          });
        }
      } else {
        // Handle API errors (like 404, 500) by showing the Welcome Screen
        setCurrentUser(prev => ({ ...prev, is_registered: false }));
      }
    } catch (err) {
      console.warn('Failed to resolve current user identity:', err);
      // Fallback to Welcome screen on network/fetch errors
      setCurrentUser(prev => ({ ...prev, is_registered: false }));
    } finally {
      clearTimeout(timeoutTimer);
      setIsResolving(false);
    }
  };

  useEffect(() => {
    // Dynamic Viewport Height (--vh) for zero-jump mobile scaling across all devices
    const updateViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);

    // Telegram WebApp Full Expansion & Native Lock
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        if (typeof tg.disableVerticalSwipes === 'function') {
          tg.disableVerticalSwipes();
        }
        if (typeof tg.setHeaderColor === 'function') {
          tg.setHeaderColor(isDark ? '#121B17' : '#FFFFFF');
        }
        if (typeof tg.setBackgroundColor === 'function') {
          tg.setBackgroundColor(isDark ? '#0A100D' : '#F4F6F4');
        }
      } catch (e) {
        console.debug('Telegram WebApp setup error:', e);
      }
    }

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
    };
  }, [isDark]);

  useEffect(() => {
    resolveCurrentUser();
  }, []);

  useEffect(() => {
    safeSetStorage('trainer_theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const setUserRole = async (role: 'admin' | 'vip' | 'subscriber' | 'user') => {
    const targetId = currentUser.id;
    if (!targetId) return;
    const isAdminVal = role === 'admin';
    const isVipVal = role === 'admin' || role === 'vip';

    // 1. Instant optimistic state update
    setCurrentUser(prev => ({
      ...prev,
      is_admin: isAdminVal,
      is_vip: isVipVal,
      role: role
    }));

    // 2. Save override in localStorage
    try {
      localStorage.setItem('trainer_user_role_override', role);
    } catch {}

    // 3. API synchronization
    try {
      const res = await apiFetch('/api/client/status/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: targetId,
          role,
          is_admin: isAdminVal,
          is_vip: isVipVal
        })
      });

      if (!res.ok) {
        await apiFetch('/api/client/vip/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: targetId,
            role,
            is_admin: isAdminVal,
            is_vip: isVipVal
          })
        });
      }

      if (role === 'admin') {
        setActiveTab('trainer');
      } else if (activeTab === 'trainer') {
        setActiveTab('profile');
      }
    } catch (err) {
      console.error('Failed to update role via API:', err);
    }
  };

  const toggleTheme = () => setIsDark(prev => !prev);

  // If still resolving identity, show a smooth loading state
  if (isResolving) {
    return (
      <div className={`fixed inset-0 flex items-center justify-center ${isDark ? 'bg-[#0A100D]' : 'bg-[#F4F6F4]'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl animate-spin border-4 border-t-indigo-500 ${isDark ? 'border-[#1C2621]' : 'border-[#E2E8E4]'}`} />
          <span className={`text-xs font-medium uppercase tracking-widest ${isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'}`}>
            Идентификация...
          </span>
        </div>
      </div>
    );
  }

  // If user is not registered or we are simulating a new user, show the Welcome/Onboarding bridge
  if (currentUser.is_registered === false || (simulateNewUser && isSandbox)) {
    return (
      <WelcomeScreen 
        isDark={isDark} 
        onDisableSimulation={simulateNewUser ? () => {
          setSimulateNewUser(false);
          try { localStorage.setItem('trainer_simulate_new_user', 'false'); } catch {}
        } : undefined} 
      />
    );
  }

  return (
    <div
      className={`fixed inset-0 h-full w-full flex flex-col overflow-hidden ${
        isDark ? 'theme-obsidian' : 'theme-mineral'
      }`}
      style={{
        height: 'calc(var(--vh, 1vh) * 100)',
        touchAction: 'none',
        overscrollBehavior: 'none'
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
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
              isDark ? 'text-[#7DA295]' : 'text-[#2B4A3D]'
            }`}>
              <Bot className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-inherit">
              AI Библиотекарь
            </span>
          </div>

          {/* Right: Theme toggle & Trainer Panel button if admin */}
          <div className="flex items-center gap-2">
            {currentUser.is_admin && (
              <button
                onClick={() => setActiveTab('trainer')}
                className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 transition flex items-center gap-1"
                title="Перейти в панель тренера"
              >
                ★ Панель
              </button>
            )}

            <button
              onClick={toggleTheme}
              aria-label="Переключить тему"
              className="p-1 rounded-lg text-inherit opacity-60 hover:opacity-100 transition"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <span
              className={`text-xs font-mono select-none ${
                isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'
              }`}
            >
              ver 2.0.0
            </span>
          </div>
        </header>

        {/* Sandbox Role Selector - ONLY in Sandbox Preview / localhost */}
        {(() => {
          const isSandbox = typeof window !== 'undefined' && (
            window.location.hostname.includes('ais-') || 
            window.location.hostname.includes('localhost') || 
            window.location.hostname.includes('127.0.0.1')
          );
          const activeRole = currentUser.role || (currentUser.is_admin ? 'admin' : (currentUser.is_vip ? 'vip' : 'user'));

          if (!isSandbox) return null;

          return (
            <div className={`shrink-0 px-3 py-1 border-b flex flex-wrap items-center justify-between gap-1.5 ${
              isDark ? 'bg-[#18231E]/90 border-[#253A30]' : 'bg-[#EDF2EE]/90 border-[#C8D6CF]'
            }`}>
              <div className="flex items-center gap-1 text-[10px]">
                <span className={`font-semibold uppercase tracking-wider text-[9px] ${isDark ? 'text-[#8E9E96]' : 'text-[#4A5E52]'}`}>
                  Роль:
                </span>
                <div className="flex items-center gap-0.5">
                  {(['user', 'subscriber', 'vip', 'admin'] as const).map(role => {
                    const isSelected = activeRole === role && !simulateNewUser;
                    const labels: Record<string, string> = {
                      user: 'User',
                      subscriber: 'Sub',
                      vip: 'VIP',
                      admin: 'Admin'
                    };
                    return (
                      <button
                        key={role}
                        onClick={() => {
                          setSimulateNewUser(false);
                          try { localStorage.setItem('trainer_simulate_new_user', 'false'); } catch {}
                          setUserRole(role);
                        }}
                        className={`text-[9px] py-0.5 px-1.5 rounded-md font-semibold transition-all ${
                          isSelected
                            ? 'bg-[#5B8A78] text-white shadow-xs'
                            : isDark
                              ? 'bg-[#121B17] text-[#8E9E96] hover:bg-[#1C2C24]'
                              : 'bg-white text-[#4A5E52] hover:bg-[#F4F6F4]'
                        }`}
                      >
                        {labels[role]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Simulation toggle button */}
              <button
                onClick={() => {
                  const nextVal = !simulateNewUser;
                  setSimulateNewUser(nextVal);
                  try { localStorage.setItem('trainer_simulate_new_user', String(nextVal)); } catch {}
                }}
                className={`text-[9px] py-0.5 px-1.5 rounded-md font-medium transition-all ${
                  simulateNewUser
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : isDark
                      ? 'bg-[#121B17] text-[#8E9E96] hover:bg-[#1C2C24]'
                      : 'bg-white text-[#4A5E52] hover:bg-[#F4F6F4]'
                }`}
              >
                🧪 {simulateNewUser ? 'Симуляция: Вкл' : 'Новый юзер'}
              </button>
            </div>
          );
        })()}

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
              telegramUserId={currentUser.telegram_user_id}
              isAdmin={currentUser.is_admin}
              isVip={currentUser.is_vip}
              role={currentUser.role}
              onRefreshUser={resolveCurrentUser}
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
                <div className={`m-4 p-6 rounded-lg border text-center space-y-3 ${
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
              className={`relative pointer-events-auto rounded-lg h-14 px-3 flex items-center transition-all ${
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
                    className={`w-11 h-11 rounded-lg flex items-center justify-center shadow-xl border transition-transform group-active:scale-95 ${
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

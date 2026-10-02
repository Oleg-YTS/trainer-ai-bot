import React, { useState, useEffect } from 'react';
import {
  User,
  ShieldCheck,
  CheckCircle2,
  Crown,
  LayoutDashboard,
  Smartphone,
  Loader2,
  Send,
  Star,
  UserCheck,
  Activity,
  Heart,
  Target,
  Sparkles,
  Info,
  CreditCard,
  Check
} from 'lucide-react';
import { apiFetch } from '../api';
import { getLocalUsers, UserProfile } from '../utils/storage';

interface MobileProfileProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenInstallModal: () => void;
  onOpenTrainerDashboard: () => void;
  clientId?: number;
  telegramUserId?: number | null;
  isAdmin?: boolean;
  isVip?: boolean;
  role?: string;
  onRefreshUser?: () => void;
  onUpdateAdminState?: (adminState: boolean) => void;
}

export const MobileProfile: React.FC<MobileProfileProps> = ({
  isDark,
  onToggleTheme,
  onOpenInstallModal,
  onOpenTrainerDashboard,
  clientId,
  telegramUserId,
  isAdmin: userIsAdmin = false,
  isVip: userIsVip = false,
  role: userRole = 'user',
  onRefreshUser
}) => {
  const [isAdmin, setIsAdmin] = useState(userIsAdmin);
  const [isVip, setIsVip] = useState(userIsVip);

  // Profile Accordion state
  const [isProfileAccordionOpen, setIsProfileAccordionOpen] = useState(false);

  // Profile Form States
  const [formName, setFormName] = useState('');
  const [formAge, setFormAge] = useState('');
  const [formHeight, setFormHeight] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formGoal, setFormGoal] = useState('Набор мышечной массы');
  const [formActivityLevel, setFormActivityLevel] = useState('Умеренная');
  const [formFrequency, setFormFrequency] = useState('3-4 раза в неделю');
  const [formRestrictions, setFormRestrictions] = useState('');
  const [formDietPreferences, setFormDietPreferences] = useState('');
  const [attachVipRequest, setAttachVipRequest] = useState(false);

  // UI state
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [vipRequestSent, setVipRequestSent] = useState(false);
  const [vipRequestLoading, setVipRequestLoading] = useState(false);

  // Payment Simulator States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState<'subscriber' | 'vip'>('subscriber');
  const [paymentStep, setPaymentStep] = useState<'checkout' | 'processing' | 'success'>('checkout');
  const [paymentStatusText, setPaymentStatusText] = useState('');
  const [paymentProgress, setPaymentProgress] = useState(0);

  const startPaymentFlow = (type: 'subscriber' | 'vip') => {
    setPaymentType(type);
    setPaymentStep('checkout');
    setPaymentProgress(0);
    setPaymentStatusText('');
    setShowPaymentModal(true);
  };

  const executePaymentSimulation = async () => {
    setPaymentStep('processing');
    
    const steps = [
      { text: 'Инициализация безопасной транзакции...', progress: 15 },
      { text: 'Проверка платежа банком-эквайером...', progress: 50 },
      { text: 'Зачисление средств и авторизация статуса...', progress: 85 },
      { text: 'Оплата успешно проведена! 🎉', progress: 100 }
    ];

    for (const step of steps) {
      setPaymentStatusText(step.text);
      setPaymentProgress(step.progress);
      await new Promise(res => setTimeout(res, 900));
    }

    // Call local API to upgrade role dynamically!
    try {
      const targetId = clientId || 1;
      const isAdminVal = false;
      const isVipVal = paymentType === 'vip';
      
      const res = await apiFetch('/api/client/status/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: targetId,
          role: paymentType,
          is_admin: isAdminVal,
          is_vip: isVipVal
        })
      });

      if (res.ok) {
        if (paymentType === 'vip') {
          setIsVip(true);
        }
        if (onRefreshUser) {
          onRefreshUser();
        }
      }
    } catch (err) {
      console.error('Failed to sync updated role from payment simulation:', err);
    }

    setPaymentStep('success');
  };

  useEffect(() => {
    setIsAdmin(userIsAdmin);
    setIsVip(userIsVip);
  }, [userIsAdmin, userIsVip]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!clientId) {
        setProfileLoading(false);
        return;
      }
      const targetId = clientId;
      setProfileLoading(true);

      try {
        const url = telegramUserId
          ? `/api/client/profile?telegram_user_id=${encodeURIComponent(telegramUserId)}`
          : `/api/client/profile?client_id=${encodeURIComponent(targetId)}`;
        const response = await apiFetch(url);
        if (response.ok) {
          const text = await response.text();
          if (text && text.trim().startsWith('{')) {
            const res = JSON.parse(text);
            if (res.name) setFormName(res.name);
            if (res.profile && typeof res.profile === 'object') {
              if (res.profile.name) setFormName(res.profile.name);
              if (res.profile.age !== undefined && res.profile.age !== null) setFormAge(String(res.profile.age));
              if (res.profile.height !== undefined && res.profile.height !== null) setFormHeight(String(res.profile.height));
              if (res.profile.weight !== undefined && res.profile.weight !== null) setFormWeight(String(res.profile.weight));
              if (res.profile.goal) setFormGoal(res.profile.goal);
              if (res.profile.activity_level) setFormActivityLevel(res.profile.activity_level);
              if (res.profile.training_frequency) setFormFrequency(res.profile.training_frequency);
              if (res.profile.restrictions) setFormRestrictions(res.profile.restrictions);
              if (res.profile.diet_preferences) setFormDietPreferences(res.profile.diet_preferences);
            }
          }
        }
      } catch (err) {
        console.warn('Notice: Could not load initial profile from server:', err);
      } finally {
        setProfileLoading(false);
      }
    };
    loadProfile();
  }, [clientId]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = clientId;
    if (!targetId) {
      setSaveErrorMsg("Невозможно сохранить профиль: отсутствует Telegram ID.");
      setProfileSaving(false);
      return;
    }
    setProfileSaving(true);
    setSaveSuccess(false);
    setSaveErrorMsg(null);
    try {
      const response = await apiFetch("/api/client/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: targetId,
          telegram_user_id: telegramUserId || undefined,
          name: formName,
          age: formAge ? Number(formAge) : undefined,
          height: formHeight ? Number(formHeight) : undefined,
          weight: formWeight ? Number(formWeight) : undefined,
          goal: formGoal,
          activity_level: formActivityLevel,
          training_frequency: formFrequency,
          restrictions: formRestrictions,
          diet_preferences: formDietPreferences
        })
      });
      if (response.ok) {
        setSaveSuccess(true);
        if (attachVipRequest && !isVip && !vipRequestSent) {
          await handleSendVipRequest();
        }
        setTimeout(() => setSaveSuccess(false), 3500);
        if (onRefreshUser) onRefreshUser();
      } else {
        const errData = await response.json().catch(() => ({}));
        setSaveErrorMsg(errData.detail || `Ошибка сервера (${response.status})`);
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
      setSaveErrorMsg("Не удалось связаться с сервером. Проверьте соединение.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSendVipRequest = async () => {
    if (!clientId || vipRequestLoading) return;
    setVipRequestLoading(true);
    try {
      await apiFetch('/api/client/vip/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          note: `Заявка на VIP ведение от ${formName || 'пользователя'}. Цель: ${formGoal}.`,
          profile: {
            name: formName,
            age: formAge ? Number(formAge) : undefined,
            height: formHeight ? Number(formHeight) : undefined,
            weight: formWeight ? Number(formWeight) : undefined,
            goal: formGoal,
            activity_level: formActivityLevel,
            training_frequency: formFrequency,
            restrictions: formRestrictions,
            diet_preferences: formDietPreferences
          }
        })
      });
      setVipRequestSent(true);
    } catch (err) {
      console.error('Failed to send VIP request:', err);
    } finally {
      setVipRequestLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* ========================================== */}
      {/* SECTION 0: ДЛЯ АДМИНА (Только для тренера) */}
      {/* ========================================== */}
      {userIsAdmin && (
        <div className={`p-4 rounded-lg border ${
          isDark
            ? 'bg-amber-500/10 border-amber-500/30 text-[#E8ECE9]'
            : 'bg-amber-50 border-amber-200 text-[#141F1A]'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                <Star className="w-5 h-5 fill-amber-400/30" />
              </div>
              <div>
                <div className="font-semibold text-xs text-amber-500 uppercase tracking-wider">
                  Режим Администратора (Тренер)
                </div>
                <div className="text-xs font-medium">Кабинет управления БЗ и подопечными</div>
              </div>
            </div>
            <button
              onClick={onOpenTrainerDashboard}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-[#0A100D] text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Панель тренера</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* БЛОК 1: СТАТУС И ЗАПРОС ВЕДЕНИЯ (VIP)     */}
      {/* ========================================== */}
      <div className={`p-4 rounded-lg border transition shadow-sm ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <div className="flex items-center justify-between pb-2 mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#7DA295]" />
            <h2 className="font-semibold text-xs uppercase tracking-wider text-inherit">Уровень доступа</h2>
          </div>

          {userIsAdmin ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Star className="w-3.5 h-3.5 fill-amber-400/30 text-amber-400" />
              Администратор (Тренер)
            </span>
          ) : isVip ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/40 shadow-sm shadow-amber-500/5">
              <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
              VIP (Персональное ведение)
            </span>
          ) : userRole === 'subscriber' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Подписчик (Безлимит)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#18231E] text-[#8E9E96] border border-[#1F2E27]">
              <UserCheck className="w-3.5 h-3.5 text-[#8E9E96]" />
              Бесплатный доступ
            </span>
          )}
        </div>

        {/* Status description & VIP benefits card */}
        {userIsAdmin ? (
          <div className={`p-3 rounded-lg border text-xs leading-relaxed space-y-1 ${
            isDark ? 'bg-[#182820] border-[#253A30] text-[#C2D1C9]' : 'bg-[#EBF0EC] border-[#D8E0DB] text-[#2B4A3D]'
          }`}>
            <div className="font-semibold flex items-center gap-1.5 text-amber-400">
              <Star className="w-4 h-4 fill-amber-400/20" />
              <span>Панель Администратора</span>
            </div>
            <p className="text-[11px] opacity-80">
              Вам доступны все разделы базы знаний, редактирование контента, ответы на сложные вопросы подопечных и управление тарифами.
            </p>
          </div>
        ) : isVip ? (
          <div className={`p-3 rounded-lg border text-xs leading-relaxed space-y-1 ${
            isDark ? 'bg-[#182820] border-[#253A30] text-[#C2D1C9]' : 'bg-[#EBF0EC] border-[#D8E0DB] text-[#2B4A3D]'
          }`}>
            <div className="font-semibold flex items-center gap-1.5 text-[#7DA295]">
              <Crown className="w-4 h-4" />
              <span>Персональное ведение активно</span>
            </div>
            <p className="text-[11px] opacity-80">
              Вам доступен полный индивидуальный трекинг, персональные корректировки тренировок и прямое согласование рациона с тренером.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tariff Option 1: Unlimited Search AI */}
            <div className={`p-3.5 rounded-lg border space-y-2 ${
              isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F7F5] border-[#E2E8E4]'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-xs flex items-center gap-1.5 text-inherit">
                    <Sparkles className="w-4 h-4 text-[#7DA295]" />
                    <span>Подписка на ИИ-Библиотекаря</span>
                  </h4>
                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Снимает почасовые лимиты на вопросы к базе знаний.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold font-mono">490 ₽</span>
                  <span className={`text-[9px] block ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>в месяц</span>
                </div>
              </div>

              {userRole === 'subscriber' ? (
                <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold pt-1">
                  <Check className="w-4 h-4" />
                  <span>Подписка активна (Безлимитный доступ)</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startPaymentFlow('subscriber')}
                  className="w-full py-1.5 px-3 rounded-lg bg-[#5B8A78] hover:bg-[#4A7364] text-[#0A100D] text-[11px] font-bold transition flex items-center justify-center gap-1"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Подписаться за 490 ₽</span>
                </button>
              )}
            </div>

            {/* Tariff Option 2: Personal Coach (VIP) */}
            <div className={`p-3.5 rounded-lg border space-y-2 ${
              isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F7F5] border-[#E2E8E4]'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-xs flex items-center gap-1.5 text-[#7DA295]">
                    <Crown className="w-4 h-4 text-amber-400 fill-amber-400/10" />
                    <span>Персональное VIP-ведение</span>
                  </h4>
                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Чат с тренером, разборы отчетов и индивидуальный план.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold font-mono text-amber-400">4 990 ₽</span>
                  <span className={`text-[9px] block ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>в месяц</span>
                </div>
              </div>

              <div className={`p-2.5 rounded-lg border text-[10px] leading-relaxed space-y-1 ${
                isDark ? 'bg-[#121B17] border-[#1F2E27] text-[#C2D1C9]' : 'bg-white border-[#E2E8E4] text-[#2B4A3D]'
              }`}>
                Полный контроль динамики веса, расчет КБЖУ, еженедельный разбор отчетов и прямой контакт.
              </div>

              <button
                type="button"
                onClick={() => startPaymentFlow('vip')}
                className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-[#0A100D] text-[11px] font-bold transition flex items-center justify-center gap-1"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Оплатить VIP за 4 990 ₽</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* БЛОК 2: АНКЕТА ПОДОПЕЧНОГО (Стандарт БД)    */}
      {/* ========================================== */}
      <div className={`rounded-lg border transition shadow-sm overflow-hidden ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <button
          type="button"
          onClick={() => setIsProfileAccordionOpen(!isProfileAccordionOpen)}
          className="w-full flex items-center justify-between p-4 focus:outline-none cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#7DA295]" />
            <h2 className="font-semibold text-xs uppercase tracking-wider text-inherit text-left">Профиль</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] py-0.5 px-2 rounded-lg font-semibold border ${
              isProfileAccordionOpen
                ? 'bg-[#5B8A78]/25 text-[#5B8A78] border-[#5B8A78]/40'
                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            }`}>
              {isProfileAccordionOpen ? 'Свернуть' : 'Заполнить анкету'}
            </span>
          </div>
        </button>

        {isProfileAccordionOpen && (
          <div className="p-4 pt-1">
            {profileLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 opacity-60">
                <Loader2 className="w-4 h-4 animate-spin text-[#7DA295]" />
                <span className="text-xs">Загрузка параметров анкеты...</span>
              </div>
            ) : (
              <form onSubmit={handleSaveProfile} className="space-y-3.5">
            {/* Имя */}
            <div>
              <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Имя или никнейм
              </label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Как к вам обращаться"
                className={`w-full px-3 py-2 rounded-lg text-xs border outline-none transition ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                    : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                }`}
              />
            </div>

            {/* Возраст / Рост / Вес */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={`block text-[10px] font-medium mb-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Возраст (лет)
                </label>
                <input
                  type="number"
                  value={formAge}
                  onChange={e => setFormAge(e.target.value)}
                  placeholder="28"
                  className={`w-full px-2.5 py-2 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                      : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-medium mb-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Рост (см)
                </label>
                <input
                  type="number"
                  value={formHeight}
                  onChange={e => setFormHeight(e.target.value)}
                  placeholder="178"
                  className={`w-full px-2.5 py-2 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                      : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-medium mb-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Текущий вес (кг)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formWeight}
                  onChange={e => setFormWeight(e.target.value)}
                  placeholder="76.5"
                  className={`w-full px-2.5 py-2 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                      : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                  }`}
                />
              </div>
            </div>

            {/* Главная цель */}
            <div>
              <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Основная цель тренировок
              </label>
              <select
                value={formGoal}
                onChange={e => setFormGoal(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs border outline-none transition ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                    : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                }`}
              >
                <option value="Набор мышечной массы">Набор мышечной массы (Гипертрофия)</option>
                <option value="Снижение жировой массы">Снижение жировой массы (Похудение / Рельеф)</option>
                <option value="Сила и функционал">Развитие силы и выносливости</option>
                <option value="Рекомпозиция">Рекомпозиция (Тонус и сохранение формы)</option>
                <option value="ОФП и здоровье">Общая физическая подготовка и здоровье</option>
              </select>
            </div>

            {/* Активность и частота тренировок */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block text-[10px] font-medium mb-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Уровень активности
                </label>
                <select
                  value={formActivityLevel}
                  onChange={e => setFormActivityLevel(e.target.value)}
                  className={`w-full px-2.5 py-2 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                      : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                  }`}
                >
                  <option value="Низкая (сидячий)">Сидячий образ жизни</option>
                  <option value="Умеренная">Умеренная (10k шагов)</option>
                  <option value="Высокая">Высокая (активная работа)</option>
                </select>
              </div>

              <div>
                <label className={`block text-[10px] font-medium mb-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Частота занятий
                </label>
                <select
                  value={formFrequency}
                  onChange={e => setFormFrequency(e.target.value)}
                  className={`w-full px-2.5 py-2 rounded-lg text-xs border outline-none transition ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                      : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                  }`}
                >
                  <option value="1-2 раза в неделю">1-2 раза в неделю</option>
                  <option value="3-4 раза в неделю">3-4 раза в неделю</option>
                  <option value="5+ раз в неделю">5+ раз в неделю</option>
                </select>
              </div>
            </div>

            {/* Ограничения по здоровью */}
            <div>
              <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Ограничения по здоровью / травмы
              </label>
              <input
                type="text"
                value={formRestrictions}
                onChange={e => setFormRestrictions(e.target.value)}
                placeholder="Например: протрузия L5-S1, боль в коленях при глубоком приседе"
                className={`w-full px-3 py-2 rounded-lg text-xs border outline-none transition ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                    : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                }`}
              />
            </div>

            {/* Пожелания по питанию */}
            <div>
              <label className={`block text-[11px] font-medium mb-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Особенности питания / аллергии
              </label>
              <input
                type="text"
                value={formDietPreferences}
                onChange={e => setFormDietPreferences(e.target.value)}
                placeholder="Например: не ем молочные продукты, аллергия на орехи"
                className={`w-full px-3 py-2 rounded-lg text-xs border outline-none transition ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                    : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                }`}
              />
            </div>

            {/* Чекбокс прикрепления к заявке на VIP */}
            {!isVip && !userIsAdmin && (
              <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition ${
                isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F7F5] border-[#E2E8E4]'
              }`}>
                <input
                  type="checkbox"
                  checked={attachVipRequest}
                  onChange={e => setAttachVipRequest(e.target.checked)}
                  className="mt-0.5 rounded-lg border-[#5B8A78] text-[#5B8A78] focus:ring-0"
                />
                <span className={`text-[11px] leading-tight ${isDark ? 'text-[#C2D1C9]' : 'text-[#2B4A3D]'}`}>
                  Отправить эти данные тренеру вместе с заявкой на персональное ведение (VIP)
                </span>
              </label>
            )}

            {saveErrorMsg && (
              <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                isDark ? "bg-rose-950/40 border-rose-500/40 text-rose-200" : "bg-rose-50 border-rose-300 text-rose-900"
              }`}>
                <Info className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{saveErrorMsg}</span>
              </div>
            )}
            {/* Кнопка сохранения */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={profileSaving}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-[0.99] shadow-sm ${
                  isDark
                    ? 'bg-[#5B8A78] hover:bg-[#7DA295] text-[#0A100D]'
                    : 'bg-[#2B4A3D] hover:bg-[#3C6150] text-white'
                }`}
              >
                {profileSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saveSuccess ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>
                  {profileSaving
                    ? 'Сохранение данных...'
                    : saveSuccess
                      ? 'Анкета успешно сохранена в БД!'
                      : 'Сохранить анкету в БД'}
                </span>
              </button>
            </div>
          </form>
        )}
          </div>
        )}
      </div>

      {/* Быстрое добавление на домашний экран */}
      <div className={`p-3.5 rounded-lg border flex items-center justify-between transition ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg ${
            isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
          }`}>
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <div className="font-medium text-xs text-inherit">Установить как приложение</div>
            <div className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Быстрый доступ с экрана смартфона (PWA)
            </div>
          </div>
        </div>
        <button
          onClick={onOpenInstallModal}
          className="px-3 py-1.5 rounded-lg border text-xs font-medium border-inherit hover:opacity-80 transition"
        >
          Установить
        </button>
      </div>

      {/* PAYMENT MODAL SIMULATOR */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-sm rounded-lg border p-5 shadow-2xl relative ${
            isDark ? 'bg-[#121B17] border-[#1F2E27] text-[#E8ECE9]' : 'bg-white border-[#D8E0DB] text-[#141F1A]'
          }`}>
            <button
              onClick={() => setShowPaymentModal(false)}
              className={`absolute top-3.5 right-3.5 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold transition hover:opacity-80 border ${
                isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F6F4] border-[#C8D6CF]'
              }`}
            >
              ✕
            </button>

            {paymentStep === 'checkout' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2.5 rounded-lg ${paymentType === 'vip' ? 'bg-amber-500/20 text-amber-400' : 'bg-[#5B8A78]/20 text-[#5B8A78]'}`}>
                    {paymentType === 'vip' ? <Crown className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">Оплата заказа №{Math.floor(10000 + Math.random() * 90000)}</h3>
                    <p className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                      Через защищенный платежный шлюз
                    </p>
                  </div>
                </div>

                <div className={`p-3.5 rounded-lg border space-y-1.5 text-xs ${
                  isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F7F5] border-[#E2E8E4]'
                }`}>
                  <div className="flex justify-between font-medium">
                    <span className="opacity-80">Услуга:</span>
                    <span>{paymentType === 'vip' ? 'Персональное VIP-ведение' : 'Подписка на ИИ-Библиотекаря'}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="opacity-80">Период:</span>
                    <span>1 месяц</span>
                  </div>
                  <div className="border-t border-inherit/40 pt-1.5 flex justify-between font-bold text-sm">
                    <span>Сумма к оплате:</span>
                    <span className={paymentType === 'vip' ? 'text-amber-400' : 'text-[#5B8A78]'}>
                      {paymentType === 'vip' ? '4 990 ₽' : '490 ₽'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    onClick={executePaymentSimulation}
                    className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition active:scale-[0.98] ${
                      paymentType === 'vip'
                        ? 'bg-amber-50 hover:bg-amber-600 text-[#0A100D]'
                        : 'bg-[#5B8A78] hover:bg-[#4A7364] text-[#0A100D]'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Оплатить картой РФ (Мир / Visa / СБП)</span>
                  </button>

                  <button
                    onClick={executePaymentSimulation}
                    className={`w-full py-2 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-[0.98] border ${
                      isDark
                        ? 'bg-[#18231E] border-[#253A30] text-[#D0D7D3] hover:bg-[#1F2E27]'
                        : 'bg-[#F4F6F4] border-[#C8D6CF] text-[#2C3B34] hover:bg-[#E2E9E4]'
                    }`}
                  >
                    <span>🌟 Оплатить Telegram Stars</span>
                  </button>
                </div>
              </div>
            )}

            {paymentStep === 'processing' && (
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                <Loader2 className={`w-10 h-10 animate-spin ${paymentType === 'vip' ? 'text-amber-400' : 'text-[#5B8A78]'}`} />
                <div>
                  <h4 className="font-bold text-sm">Платеж обрабатывается...</h4>
                  <p className={`text-xs mt-1 h-4 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    {paymentStatusText}
                  </p>
                </div>
                {/* Progress bar */}
                <div className={`w-full h-1.5 rounded-lg overflow-hidden ${isDark ? 'bg-[#18231E]' : 'bg-[#EBF0EC]'}`}>
                  <div
                    className={`h-full transition-all duration-300 ${paymentType === 'vip' ? 'bg-amber-500' : 'bg-[#5B8A78]'}`}
                    style={{ width: `${paymentProgress}%` }}
                  />
                </div>
              </div>
            )}

            {paymentStep === 'success' && (
              <div className="py-4 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-12 h-12 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Оплата прошла успешно!</h4>
                  <p className={`text-xs mt-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Ваш уровень доступа повышен до <b>{paymentType === 'vip' ? 'VIP' : 'Подписчик'}</b>. Все новые функции и безлимит уже активны!
                  </p>
                </div>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="w-full py-2 px-4 rounded-lg bg-emerald-500 text-[#0A100D] font-bold text-xs transition active:scale-[0.98]"
                >
                  Отлично, вернуться
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

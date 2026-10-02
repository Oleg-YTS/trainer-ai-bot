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
  Info
} from 'lucide-react';
import { apiFetch } from '../api';
import { getLocalUsers, UserProfile } from '../utils/storage';

interface MobileProfileProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenInstallModal: () => void;
  onOpenTrainerDashboard: () => void;
  clientId?: number;
  isAdmin?: boolean;
  isVip?: boolean;
  onRefreshUser?: () => void;
  onUpdateAdminState?: (adminState: boolean) => void;
  onSetUserRole?: (role: 'admin' | 'vip' | 'subscriber') => Promise<void>;
}

export const MobileProfile: React.FC<MobileProfileProps> = ({
  isDark,
  onToggleTheme,
  onOpenInstallModal,
  onOpenTrainerDashboard,
  clientId,
  isAdmin: userIsAdmin = false,
  isVip: userIsVip = false,
  onRefreshUser,
  onSetUserRole
}) => {
  const [isAdmin, setIsAdmin] = useState(userIsAdmin);
  const [isVip, setIsVip] = useState(userIsVip);

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

  useEffect(() => {
    setIsAdmin(userIsAdmin);
    setIsVip(userIsVip);
  }, [userIsAdmin, userIsVip]);

  useEffect(() => {
    const loadProfile = async () => {
      const targetId = clientId || 1;
      setProfileLoading(true);
      // Instant local load fallback
      try {
        const localUsers = getLocalUsers();
        const found = localUsers.find((u: UserProfile) => u.id === targetId || u.telegram_user_id === targetId);
        if (found) {
          if (found.name) setFormName(found.name);
          const p = found.profile || {};
          if (p.name) setFormName(p.name);
          if (p.age !== undefined && p.age !== null) setFormAge(String(p.age));
          if (p.height !== undefined && p.height !== null) setFormHeight(String(p.height));
          if (p.weight !== undefined && p.weight !== null) setFormWeight(String(p.weight));
          if (p.goal) setFormGoal(p.goal);
          if (p.activity_level) setFormActivityLevel(p.activity_level);
          if (p.training_frequency) setFormFrequency(p.training_frequency);
          if (p.restrictions) setFormRestrictions(p.restrictions);
          if (p.diet_preferences) setFormDietPreferences(p.diet_preferences);
        }
      } catch {}

      try {
        const response = await apiFetch(`/api/client/profile?client_id=${encodeURIComponent(targetId)}`);
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
    const targetId = clientId || 1;
    setProfileSaving(true);
    setSaveSuccess(false);
    setSaveErrorMsg(null);
    try {
      const response = await apiFetch("/api/client/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: targetId,
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
        <div className={`p-4 rounded-2xl border ${
          isDark
            ? 'bg-amber-500/10 border-amber-500/30 text-[#E8ECE9]'
            : 'bg-amber-50 border-amber-200 text-[#141F1A]'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
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
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-[#0A100D] text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
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
      <div className={`p-4 rounded-2xl border transition shadow-sm ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <div className="flex items-center justify-between border-b pb-3 border-inherit mb-3">
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
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#182820] text-[#7DA295] border border-[#253A30]">
              <Crown className="w-3.5 h-3.5 text-[#7DA295]" />
              VIP (Персональное ведение)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#18231E] text-[#8E9E96] border border-[#1F2E27]">
              <UserCheck className="w-3.5 h-3.5 text-[#8E9E96]" />
              Подписчик канала
            </span>
          )}
        </div>

        {/* Status description & VIP benefits card */}
        {isVip || userIsAdmin ? (
          <div className={`p-3 rounded-xl border text-xs leading-relaxed space-y-1 ${
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
          <div className="space-y-3">
            <div className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-2 ${
              isDark ? 'bg-[#18231E] border-[#1F2E27] text-[#C2D1C9]' : 'bg-[#F4F7F5] border-[#E2E8E4] text-[#2B4A3D]'
            }`}>
              <div className="font-semibold flex items-center gap-1.5 text-[#7DA295]">
                <Sparkles className="w-4 h-4" />
                <span>Что дает персональное ведение (VIP)?</span>
              </div>
              <ul className="space-y-1.5 text-[11px] opacity-90 pl-1">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#7DA295] shrink-0 mt-0.5" />
                  <span>Индивидуальный план тренировок под ваши цели и оборудование</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#7DA295] shrink-0 mt-0.5" />
                  <span>Персональный расчет КБЖУ и контроль динамики веса</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#7DA295] shrink-0 mt-0.5" />
                  <span>Еженедельный разбор отчетов и прямой контакт с тренером</span>
                </li>
              </ul>
            </div>

            {vipRequestSent ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Заявка отправлена тренеру. Тренер свяжется с вами для уточнения деталей.</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSendVipRequest}
                disabled={vipRequestLoading}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-[0.99] shadow-sm ${
                  isDark
                    ? 'bg-[#5B8A78] hover:bg-[#7DA295] text-[#0A100D]'
                    : 'bg-[#2B4A3D] hover:bg-[#3C6150] text-white'
                }`}
              >
                {vipRequestLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Crown className="w-4 h-4" />
                )}
                <span>Запросить персональное ведение</span>
              </button>
            )}
          </div>
        )}

        {/* DEV ROLE SWITCHER (Для тестирования прав) */}
        <div className="mt-4 pt-3 border-t border-inherit">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7DA295] mb-2 flex items-center justify-between">
            <span>Переключатель прав (Sandbox)</span>
            <span className="text-[10px] opacity-70 font-normal">ID: {clientId || '—'}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={async () => {
                setIsAdmin(false);
                setIsVip(false);
                if (onSetUserRole) await onSetUserRole('subscriber');
              }}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium border transition ${
                !userIsAdmin && !isVip
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-semibold'
                  : isDark ? 'bg-[#18231E] border-[#1F2E27] text-[#8E9E96]' : 'bg-[#F0F4F1] border-[#D8E0DB] text-[#53665C]'
              }`}
            >
              Пользователь
            </button>
            <button
              type="button"
              onClick={async () => {
                setIsAdmin(false);
                setIsVip(true);
                if (onSetUserRole) await onSetUserRole('vip');
              }}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium border transition ${
                !userIsAdmin && isVip
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-semibold'
                  : isDark ? 'bg-[#18231E] border-[#1F2E27] text-[#8E9E96]' : 'bg-[#F0F4F1] border-[#D8E0DB] text-[#53665C]'
              }`}
            >
              VIP
            </button>
            <button
              type="button"
              onClick={async () => {
                setIsAdmin(true);
                setIsVip(true);
                if (onSetUserRole) await onSetUserRole('admin');
              }}
              className={`py-1.5 px-2 rounded-xl text-xs font-medium border transition ${
                userIsAdmin
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 font-semibold'
                  : isDark ? 'bg-[#18231E] border-[#1F2E27] text-[#8E9E96]' : 'bg-[#F0F4F1] border-[#D8E0DB] text-[#53665C]'
              }`}
            >
              ★ Админ
            </button>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* БЛОК 2: АНКЕТА ПОДОПЕЧНОГО (Стандарт БД)    */}
      {/* ========================================== */}
      <div className={`p-4 rounded-2xl border transition shadow-sm ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <div className="flex items-center justify-between border-b pb-3 border-inherit mb-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#7DA295]" />
            <h2 className="font-semibold text-xs uppercase tracking-wider text-inherit">Анкета подопечного</h2>
          </div>
          <span className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
            Стандарт базы тренера
          </span>
        </div>

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
                className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition ${
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
                  className={`w-full px-2.5 py-2 rounded-xl text-xs border outline-none transition ${
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
                  className={`w-full px-2.5 py-2 rounded-xl text-xs border outline-none transition ${
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
                  className={`w-full px-2.5 py-2 rounded-xl text-xs border outline-none transition ${
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
                className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition ${
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
                  className={`w-full px-2.5 py-2 rounded-xl text-xs border outline-none transition ${
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
                  className={`w-full px-2.5 py-2 rounded-xl text-xs border outline-none transition ${
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
                className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition ${
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
                className={`w-full px-3 py-2 rounded-xl text-xs border outline-none transition ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27] focus:border-[#5B8A78] text-[#E8ECE9]'
                    : 'bg-[#F4F7F5] border-[#D8E0DB] focus:border-[#2B4A3D] text-[#141F1A]'
                }`}
              />
            </div>

            {/* Чекбокс прикрепления к заявке на VIP */}
            {!isVip && !userIsAdmin && (
              <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F7F5] border-[#E2E8E4]'
              }`}>
                <input
                  type="checkbox"
                  checked={attachVipRequest}
                  onChange={e => setAttachVipRequest(e.target.checked)}
                  className="mt-0.5 rounded border-[#5B8A78] text-[#5B8A78] focus:ring-0"
                />
                <span className={`text-[11px] leading-tight ${isDark ? 'text-[#C2D1C9]' : 'text-[#2B4A3D]'}`}>
                  Отправить эти данные тренеру вместе с заявкой на персональное ведение (VIP)
                </span>
              </label>
            )}

            {saveErrorMsg && (
              <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
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
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-[0.99] shadow-sm ${
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

      {/* Быстрое добавление на домашний экран */}
      <div className={`p-3.5 rounded-2xl border flex items-center justify-between transition ${
        isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${
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
    </div>
  );
};

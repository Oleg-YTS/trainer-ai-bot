import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  ShieldAlert,
  Users,
  Plus,
  CheckCircle2,
  Clock,
  Edit2,
  Trash2,
  Send,
  FileText,
  AlertTriangle,
  FolderTree,
  Folder,
  BarChart3,
  Check,
  Filter,
  PlusCircle,
  HelpCircle,
  ArrowLeft,
  Settings,
  Package,
  Download,
  Copy,
  Server,
  Database,
  Loader2,
  ExternalLink,
  Star,
  Crown,
  UserCheck,
  RefreshCw,
  MessageSquare,
  Search,
  User,
  Activity,
  X,
  ChevronRight
} from 'lucide-react';
import { apiFetch } from '../api';
import { getLocalUsers } from '../utils/storage';

interface Category {
  id: string;
  name: string;
  parent_id?: string | null;
  description?: string;
}

interface KnowledgeItem {
  id: number;
  trainer_id: number;
  category_id: string;
  title: string;
  content: string;
  status: 'approved' | 'draft';
  author_is_trainer: boolean;
  created_at: string;
}

interface ContentGap {
  id: number;
  question: string;
  category_id: string;
  frequency: number;
  priority: 'high' | 'medium' | 'low';
  sample_llm_answer: string;
  created_at: string;
}

interface Escalation {
  id: number;
  client_id: number;
  client_name: string;
  reason: string;
  question: string;
  status: 'open' | 'resolved';
  trainer_answer?: string;
  created_at: string;
}

interface Client {
  id: number;
  name: string;
  telegram_user_id?: number | null;
  telegram_username?: string;
  is_vip: boolean;
  is_admin?: boolean;
  profile: any;
  created_at: string;
  messages_count?: number;
}

interface TrainerDashboardProps {
  isDark?: boolean;
  onBackToClient?: () => void;
}

export const TrainerDashboard: React.FC<TrainerDashboardProps> = ({ isDark = true, onBackToClient }) => {
  const [activeTab, setActiveTab] = useState<'kb' | 'categories' | 'gaps' | 'escalations' | 'clients' | 'analytics' | 'deploy' | 'llm'>('kb');
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Analytics & Intent Digest State
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState<boolean>(false);

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const res = await apiFetch('/api/analytics/summary');
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // LLM Status and Diagnostics State
  const [llmStatus, setLlmStatus] = useState<any>(null);
  const [loadingLlmStatus, setLoadingLlmStatus] = useState(false);
  const [testPrompt, setTestPrompt] = useState('Каковы ключевые правила гидратации во время силовой тренировки?');
  const [testingLlm, setTestingLlm] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [copiedError, setCopiedError] = useState(false);

  // Runtime LLM Config State
  const [selectedModel, setSelectedModel] = useState('gpt-6-luna-pro');
  const [customModel, setCustomModel] = useState('');
  const [inputApiKey, setInputApiKey] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);

  // Environment Secrets State (GitHub, AI Tunnel & PostgreSQL)
  const [secretsStatus, setSecretsStatus] = useState<any>(null);
  const [secretsForm, setSecretsForm] = useState({
    GITHUB_TOKEN: '',
    AITUNNEL_API_KEY: '',
    DATABASE_URL: ''
  });
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [secretsSuccess, setSecretsSuccess] = useState(false);

  const handleSaveRuntimeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccess(false);
    try {
      const activeModel = selectedModel === 'custom' ? (customModel.trim() || 'gpt-6-luna-pro') : selectedModel;
      const payload: any = {
        provider: 'ai_tunnel',
        aitunnelModel: activeModel
      };
      if (inputApiKey.trim()) {
        payload.aitunnelApiKey = inputApiKey.trim();
      }
      const res = await apiFetch('/api/llm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setLlmStatus(data.status);
        setConfigSuccess(true);
        setInputApiKey('');
        setTimeout(() => setConfigSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingConfig(false);
    }
  };

  const fetchLlmStatus = async () => {
    setLoadingLlmStatus(true);
    try {
      const res = await apiFetch('/api/llm/status');
      if (res.ok) {
        const data = await res.json();
        setLlmStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch LLM status:', e);
    } finally {
      setLoadingLlmStatus(false);
    }
  };

  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [dbCheckMessage, setDbCheckMessage] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const fetchSecrets = async (showFeedback = false) => {
    if (showFeedback) {
      setIsCheckingDb(true);
      setDbCheckMessage(null);
    }
    try {
      const res = await apiFetch('/api/secrets');
      if (res.ok) {
        const data = await res.json();
        setSecretsStatus(data);
        if (showFeedback) {
          if (data.database_connected) {
            setDbCheckMessage({
              type: 'success',
              text: 'Соединение с базой данных PostgreSQL успешно проверено и активно!'
            });
          } else {
            setDbCheckMessage({
              type: 'warning',
              text: data.database_error || 'DATABASE_URL не настроен в файле .env на сервере.'
            });
          }
        }
      } else if (showFeedback) {
        setDbCheckMessage({
          type: 'error',
          text: 'Не удалось получить статус подключения от сервера.'
        });
      }
    } catch (e) {
      console.error('Failed to fetch secrets:', e);
      if (showFeedback) {
        setDbCheckMessage({
          type: 'error',
          text: 'Сетевая ошибка при проверке подключения к базе данных.'
        });
      }
    } finally {
      if (showFeedback) {
        setIsCheckingDb(false);
      }
    }
  };

  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [envContent, setEnvContent] = useState('');
  const [savingEnv, setSavingEnv] = useState(false);
  const [envSavedMessage, setEnvSavedMessage] = useState<string | null>(null);

  const fetchEnvRaw = async () => {
    try {
      const res = await apiFetch('/api/env-raw');
      if (res.ok) {
        const data = await res.json();
        setEnvContent(data.content || '');
      }
    } catch (e) {
      console.error('Failed to load .env raw:', e);
    }
  };

  const handleSaveEnvRaw = async () => {
    setSavingEnv(true);
    setEnvSavedMessage(null);
    try {
      const res = await apiFetch('/api/env-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: envContent })
      });
      const data = await res.json();
      if (res.ok) {
        setEnvSavedMessage('Файл .env успешно сохранен и применен на сервере!');
        setTimeout(() => setEnvSavedMessage(null), 4000);
        await fetchSecrets(false);
      } else {
        setEnvSavedMessage(data.error || 'Ошибка при сохранении .env');
      }
    } catch (e: any) {
      setEnvSavedMessage('Сетевая ошибка при сохранении: ' + e.message);
    } finally {
      setSavingEnv(false);
    }
  };

  const handleSaveSecrets = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSecrets(true);
    setSecretsSuccess(false);
    try {
      const res = await apiFetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secretsForm)
      });
      if (res.ok) {
        const data = await res.json();
        setSecretsStatus(data.secrets);
        setSecretsForm({
          GITHUB_TOKEN: '',
          AITUNNEL_API_KEY: '',
          DATABASE_URL: ''
        });
        setSecretsSuccess(true);
        setTimeout(() => setSecretsSuccess(false), 4000);
        fetchLlmStatus();
      }
    } catch (err) {
      console.error('Failed to save secrets:', err);
    } finally {
      setSavingSecrets(false);
    }
  };

  const handleTestLlmGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPrompt.trim()) return;
    setTestingLlm(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: testPrompt })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, error: err?.message || 'Сетевая ошибка' });
    } finally {
      setTestingLlm(false);
    }
  };

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
  const [stats, setStats] = useState({
    totalClients: 0,
    activeKnowledgeItems: 0,
    draftKnowledgeItems: 0,
    openContentGaps: 0,
    openEscalations: 0,
    totalMessages: 0
  });

  // Data State
  const [categories, setCategories] = useState<Category[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [contentGaps, setContentGaps] = useState<ContentGap[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Category Filter
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Client Dossier & Chat modal state
  const [selectedClientDossier, setSelectedClientDossier] = useState<Client | null>(null);
  const [clientMessages, setClientMessages] = useState<any[]>([]);
  const [loadingClientMessages, setLoadingClientMessages] = useState<boolean>(false);
  const [clientSearchQuery, setClientSearchQuery] = useState<string>('');
  const [clientFilterStatus, setClientFilterStatus] = useState<'all' | 'vip' | 'subscriber' | 'admin'>('all');
  const [tgActionToast, setTgActionToast] = useState<{ message: string; sub?: string } | null>(null);

  // KB Add/Edit Modal
  const [showKbModal, setShowKbModal] = useState(false);
  const [editingKb, setEditingKb] = useState<KnowledgeItem | null>(null);
  const [kbTitle, setKbTitle] = useState('');
  const [kbCategoryId, setKbCategoryId] = useState('');
  const [kbContent, setKbContent] = useState('');
  const [kbStatus, setKbStatus] = useState<'approved' | 'draft'>('approved');

  // Category Add Modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatParentId, setNewCatParentId] = useState<string>('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Escalation handling
  const [selectedEscalation, setSelectedEscalation] = useState<Escalation | null>(null);
  const [trainerAnswerText, setTrainerAnswerText] = useState('');
  const [saveAnswerToKb, setSaveAnswerToKb] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await apiFetch('/api/stats');
      setStats(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchCategories = async () => {
    try {
      const res = await apiFetch('/api/categories');
      const data = await res.json();
      if (Array.isArray(data)) {
        setCategories(data);
        if (data.length > 0 && !kbCategoryId) setKbCategoryId(data[0].id);
      }
    } catch (e) { console.error(e); }
  };

  const fetchKnowledge = async () => {
    try {
      const res = await apiFetch('/api/knowledge');
      const data = await res.json();
      setKnowledge(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setKnowledge([]);
    }
  };

  const fetchContentGaps = async () => {
    try {
      const res = await apiFetch('/api/content-gaps');
      const data = await res.json();
      setContentGaps(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setContentGaps([]);
    }
  };

  const fetchEscalations = async () => {
    try {
      const res = await apiFetch('/api/escalations');
      const data = await res.json();
      setEscalations(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setEscalations([]);
    }
  };

  const [isResettingDb, setIsResettingDb] = useState(false);

  const fetchClients = async () => {
    try {
      const res = await apiFetch('/api/clients');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setClients(data);
        return;
      }
    } catch (e) {
      console.error(e);
    }
    const local = getLocalUsers();
    setClients(local.map(u => ({
      ...u,
      trainer_id: 1,
      created_at: u.created_at || new Date().toISOString()
    })) as any);
  };

  const [resetDbSuccess, setResetDbSuccess] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const executeResetDatabase = async () => {
    setIsResettingDb(true);
    setResetDbSuccess(false);
    setConfirmingReset(false);
    try {
      const res = await apiFetch('/api/admin/clean-database', { method: 'POST' });
      const data = await res.json();
      if (data.success && Array.isArray(data.clients)) {
        setClients(data.clients);
        setResetDbSuccess(true);
        setTimeout(() => setResetDbSuccess(false), 4000);
        setTgActionToast({
          message: 'База данных успешно очищена!',
          sub: 'Создано 4 эталонных профиля без дубликатов.'
        });
      } else {
        await fetchClients();
      }
    } catch (err) {
      console.error('Failed to reset database:', err);
    } finally {
      setIsResettingDb(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'clients') {
      fetchClients();
    }
  }, [activeTab]);

  const handleSetClientRole = async (clientId: number, role: 'admin' | 'vip' | 'subscriber') => {
    const client = clients.find(c => c.id === clientId);
    const tgUserId = client?.telegram_user_id || clientId;

    // Optimistic UI update
    setClients(prev => prev.map(c => {
      if (c.id !== clientId) return c;
      return {
        ...c,
        is_admin: role === 'admin',
        is_vip: role === 'admin' || role === 'vip'
      };
    }));

    try {
      const res = await apiFetch('/api/client/status/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          telegram_user_id: tgUserId,
          role,
          is_admin: role === 'admin',
          is_vip: role === 'admin' || role === 'vip'
        })
      });
      if (!res.ok) {
        await apiFetch('/api/client/vip/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            telegram_user_id: tgUserId,
            role,
            is_vip: role === 'admin' || role === 'vip',
            is_admin: role === 'admin'
          })
        });
      }
      fetchClients();
      fetchStats();
    } catch (err) {
      console.error('Failed to update client status:', err);
      fetchClients();
    }
  };

  const handleToggleClientVip = async (clientId: number, currentVipStatus: boolean) => {
    await handleSetClientRole(clientId, currentVipStatus ? 'subscriber' : 'vip');
  };

  const handleOpenClientDossier = async (client: Client) => {
    setSelectedClientDossier(client);
    setLoadingClientMessages(true);
    setClientMessages([]);
    try {
      const res = await apiFetch(`/api/clients/${client.id}`);
      if (res.ok) {
        const data = await res.json();
        setClientMessages(data.messages || []);
      } else {
        const res2 = await apiFetch(`/api/client/messages?client_id=${client.id}`);
        if (res2.ok) {
          const msgs = await res2.json();
          setClientMessages(msgs || []);
        }
      }
    } catch (e) {
      console.error('Failed to load client messages:', e);
    } finally {
      setLoadingClientMessages(false);
    }
  };

  const handleOpenTelegramChat = (telegramUserId?: number | null, username?: string) => {
    const cleanUser = username?.replace(/^@/, '').trim();
    if (cleanUser) {
      const url = `https://t.me/${cleanUser}`;
      try {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(`@${cleanUser}`);
        }
      } catch (e) {}

      const tgApp = (window as any).Telegram?.WebApp;
      if (tgApp?.openTelegramLink) {
        tgApp.openTelegramLink(url);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setTgActionToast({
        message: `Открываем диалог с @${cleanUser}`,
        sub: `Ссылка https://t.me/${cleanUser} открыта в новой вкладке (логин скопирован)`
      });
      setTimeout(() => setTgActionToast(null), 4000);
      return;
    }

    if (telegramUserId) {
      const tgUrl = `tg://user?id=${telegramUserId}`;
      const webUrl = `https://t.me/${telegramUserId}`;
      try {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(tgUrl);
        }
      } catch (e) {}

      const tgApp = (window as any).Telegram?.WebApp;
      if (tgApp?.openTelegramLink) {
        tgApp.openTelegramLink(tgUrl);
      } else {
        const link = document.createElement('a');
        link.href = tgUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setTgActionToast({
        message: `Диалог в Telegram: ID #${telegramUserId}`,
        sub: `В браузере прямая ссылка скопирована: ${tgUrl}`
      });
      setTimeout(() => setTgActionToast(null), 4000);
      return;
    }

    setTgActionToast({
      message: `Telegram ID не указан`,
      sub: `У данного пользователя нет привязанного Telegram-аккаунта`
    });
    setTimeout(() => setTgActionToast(null), 3000);
  };

  useEffect(() => {
    fetchStats();
    fetchCategories();
    fetchKnowledge();
    fetchContentGaps();
    fetchEscalations();
    fetchClients();
    fetchLlmStatus();
    fetchSecrets();
  }, []);

  const handleCreateOrUpdateKb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbTitle.trim() || !kbContent.trim()) return;

    try {
      if (editingKb) {
        await apiFetch(`/api/knowledge/${editingKb.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: kbTitle,
            category_id: kbCategoryId,
            category: kbCategoryId,
            content: kbContent,
            status: kbStatus
          })
        });
      } else {
        await apiFetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: kbTitle,
            category_id: kbCategoryId,
            category: kbCategoryId,
            content: kbContent,
            status: kbStatus
          })
        });
      }
      setShowKbModal(false);
      setEditingKb(null);
      setKbTitle('');
      setKbContent('');
      fetchKnowledge();
      fetchStats();
    } catch (e) { console.error(e); }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName,
          parent_id: newCatParentId || null,
          description: newCatDesc
        })
      });
      setShowCatModal(false);
      setNewCatName('');
      setNewCatDesc('');
      fetchCategories();
    } catch (e) { console.error(e); }
  };

  const handleApproveContentGap = async (gap: ContentGap) => {
    try {
      await apiFetch(`/api/content-gaps/${gap.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: gap.question,
          content: gap.sample_llm_answer,
          category_id: gap.category_id
        })
      });
      fetchContentGaps();
      fetchKnowledge();
      fetchStats();
    } catch (e) { console.error(e); }
  };

  const handleResolveEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEscalation || !trainerAnswerText.trim()) return;

    try {
      await apiFetch(`/api/escalations/${selectedEscalation.id}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainer_answer: trainerAnswerText,
          save_to_kb: saveAnswerToKb
        })
      });
      setSelectedEscalation(null);
      setTrainerAnswerText('');
      fetchEscalations();
      fetchKnowledge();
      fetchStats();
    } catch (e) { console.error(e); }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('ru-RU');
    } catch {
      return '';
    }
  };

  const filteredKnowledge = knowledge.filter(k => {
    if (selectedCatFilter !== 'all' && k.category_id !== selectedCatFilter) return false;
    if (selectedStatusFilter !== 'all' && k.status !== selectedStatusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Sticky Accent Header Bar with Distinct Trainer Space Recognition */}
      <div
        className={`sticky top-0 z-30 p-3.5 rounded-xl border flex items-center justify-between transition-colors shadow-md backdrop-blur-md ${
          isDark
            ? 'bg-[#15231D]/95 border-[#253A30] text-[#E8ECE9]'
            : 'bg-[#E3ECE7]/95 border-[#C8D6CF] text-[#141F1A]'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
              isDark ? 'bg-[#5B8A78] text-[#0A100D]' : 'bg-[#2B4A3D] text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="font-semibold text-xs leading-none text-inherit">
              Кабинет Тренера
            </div>
            <div
              className={`text-[10px] mt-0.5 ${
                isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'
              }`}
            >
              Режим верификации и управления БЗ
            </div>
          </div>
        </div>

        {onBackToClient && (
          <button
            onClick={onBackToClient}
            className={`flex items-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg border transition shadow-sm ${
              isDark
                ? 'bg-[#18231E] hover:bg-[#1F2E27] text-[#E8ECE9] border-[#253A30]'
                : 'bg-white hover:bg-[#F4F6F4] text-[#141F1A] border-[#C8D6CF]'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>В клиент</span>
          </button>
        )}
      </div>

      {/* Interactive 8-Card Navigation Hub (Touch-friendly 2x4 / 4x2 Grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* 1. База Знаний */}
        <button
          type="button"
          onClick={() => setActiveTab('kb')}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer select-none active:scale-[0.98] ${
            activeTab === 'kb'
              ? isDark
                ? 'bg-[#182B22] border-[#5B8A78] shadow-sm ring-1 ring-[#5B8A78]/40'
                : 'bg-[#EBF3EF] border-[#2B4A3D] shadow-sm ring-1 ring-[#2B4A3D]/20'
              : isDark
                ? 'bg-[#121B17] border-[#1F2E27] hover:border-[#2E4237] hover:bg-[#16221D]'
                : 'bg-white border-[#D8E0DB] hover:border-[#B5C4BC] hover:bg-[#F9FAF9]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div
              className={`p-1.5 rounded-lg ${
                activeTab === 'kb'
                  ? isDark
                    ? 'bg-[#253A30] text-[#7DA295]'
                    : 'bg-[#D2E2D8] text-[#2B4A3D]'
                  : isDark
                    ? 'bg-[#18231E] text-[#7DA295]'
                    : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            {activeTab === 'kb' && (
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            )}
          </div>
          <div className="mt-2.5">
            <div className={`font-semibold text-xs leading-tight ${isDark ? 'text-[#E8ECE9]' : 'text-[#141F1A]'}`}>
              База Знаний
            </div>
            <div className={`text-[10px] mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              {knowledge.length} {knowledge.length === 1 ? 'статья' : knowledge.length > 4 ? 'статей' : 'статьи'}
            </div>
          </div>
        </button>

        {/* 2. Дерево Категорий */}
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer select-none active:scale-[0.98] ${
            activeTab === 'categories'
              ? isDark
                ? 'bg-[#182B22] border-[#5B8A78] shadow-sm ring-1 ring-[#5B8A78]/40'
                : 'bg-[#EBF3EF] border-[#2B4A3D] shadow-sm ring-1 ring-[#2B4A3D]/20'
              : isDark
                ? 'bg-[#121B17] border-[#1F2E27] hover:border-[#2E4237] hover:bg-[#16221D]'
                : 'bg-white border-[#D8E0DB] hover:border-[#B5C4BC] hover:bg-[#F9FAF9]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div
              className={`p-1.5 rounded-lg ${
                activeTab === 'categories'
                  ? isDark
                    ? 'bg-[#253A30] text-[#5B8A78]'
                    : 'bg-[#D2E2D8] text-[#2B4A3D]'
                  : isDark
                    ? 'bg-[#18231E] text-[#5B8A78]'
                    : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}
            >
              <FolderTree className="w-4 h-4" />
            </div>
            {activeTab === 'categories' && (
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            )}
          </div>
          <div className="mt-2.5">
            <div className={`font-semibold text-xs leading-tight ${isDark ? 'text-[#E8ECE9]' : 'text-[#141F1A]'}`}>
              Категории
            </div>
            <div className={`text-[10px] mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              {categories.length} {categories.length === 1 ? 'раздел' : categories.length > 4 ? 'разделов' : 'раздела'}
            </div>
          </div>
        </button>

        {/* 3. Анализ актуальности (<70%) */}
        <button
          type="button"
          onClick={() => setActiveTab('gaps')}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer select-none active:scale-[0.98] ${
            activeTab === 'gaps'
              ? isDark
                ? 'bg-[#182B22] border-[#5B8A78] shadow-sm ring-1 ring-[#5B8A78]/40'
                : 'bg-[#EBF3EF] border-[#2B4A3D] shadow-sm ring-1 ring-[#2B4A3D]/20'
              : isDark
                ? 'bg-[#121B17] border-[#1F2E27] hover:border-[#2E4237] hover:bg-[#16221D]'
                : 'bg-white border-[#D8E0DB] hover:border-[#B5C4BC] hover:bg-[#F9FAF9]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div
              className={`p-1.5 rounded-lg ${
                activeTab === 'gaps'
                  ? isDark
                    ? 'bg-[#2E2413] text-[#D4A359]'
                    : 'bg-[#FFF0D4] text-[#9E6E24]'
                  : isDark
                    ? 'bg-[#2E2413] text-[#D4A359]'
                    : 'bg-[#FFF6E5] text-[#9E6E24]'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            {contentGaps.length > 0 ? (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                isDark
                  ? 'bg-[#2E2413] text-[#D4A359] border-[#47361C]'
                  : 'bg-[#FFF6E5] text-[#9E6E24] border-[#F0D5A8]'
              }`}>
                {contentGaps.length}
              </span>
            ) : activeTab === 'gaps' ? (
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            ) : null}
          </div>
          <div className="mt-2.5">
            <div className={`font-semibold text-xs leading-tight ${isDark ? 'text-[#E8ECE9]' : 'text-[#141F1A]'}`}>
              Актуальность
            </div>
            <div className={`text-[10px] mt-0.5 ${
              contentGaps.length > 0
                ? isDark ? 'text-[#D4A359]' : 'text-[#9E6E24]'
                : isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'
            }`}>
              {contentGaps.length} {contentGaps.length === 1 ? 'тема <70%' : 'тем <70%'}
            </div>
          </div>
        </button>

        {/* 4. Эскалации тренеру */}
        <button
          type="button"
          onClick={() => setActiveTab('escalations')}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer select-none active:scale-[0.98] ${
            activeTab === 'escalations'
              ? isDark
                ? 'bg-[#182B22] border-[#5B8A78] shadow-sm ring-1 ring-[#5B8A78]/40'
                : 'bg-[#EBF3EF] border-[#2B4A3D] shadow-sm ring-1 ring-[#2B4A3D]/20'
              : isDark
                ? 'bg-[#121B17] border-[#1F2E27] hover:border-[#2E4237] hover:bg-[#16221D]'
                : 'bg-white border-[#D8E0DB] hover:border-[#B5C4BC] hover:bg-[#F9FAF9]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div
              className={`p-1.5 rounded-lg ${
                activeTab === 'escalations'
                  ? isDark
                    ? 'bg-[#31181C] text-[#E06D79]'
                    : 'bg-[#FFDEE3] text-[#B83244]'
                  : isDark
                    ? 'bg-[#31181C] text-[#E06D79]'
                    : 'bg-[#FFEBEF] text-[#B83244]'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
            </div>
            {escalations.filter(e => e.status === 'open').length > 0 ? (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                isDark
                  ? 'bg-[#31181C] text-[#E06D79] border-[#442227]'
                  : 'bg-[#FFEBEF] text-[#B83244] border-[#F2C2CB]'
              }`}>
                {escalations.filter(e => e.status === 'open').length}
              </span>
            ) : activeTab === 'escalations' ? (
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            ) : null}
          </div>
          <div className="mt-2.5">
            <div className={`font-semibold text-xs leading-tight ${isDark ? 'text-[#E8ECE9]' : 'text-[#141F1A]'}`}>
              Эскалации
            </div>
            <div className={`text-[10px] mt-0.5 ${
              escalations.filter(e => e.status === 'open').length > 0
                ? isDark ? 'text-[#E06D79]' : 'text-[#B83244]'
                : isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'
            }`}>
              {escalations.filter(e => e.status === 'open').length > 0
                ? `${escalations.filter(e => e.status === 'open').length} требуют ответа`
                : 'Все решены'}
            </div>
          </div>
        </button>

        {/* 5. Клиенты и роли */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('clients');
            fetchClients();
          }}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer select-none active:scale-[0.98] ${
            activeTab === 'clients'
              ? isDark
                ? 'bg-[#182B22] border-[#5B8A78] shadow-sm ring-1 ring-[#5B8A78]/40'
                : 'bg-[#EBF3EF] border-[#2B4A3D] shadow-sm ring-1 ring-[#2B4A3D]/20'
              : isDark
                ? 'bg-[#121B17] border-[#1F2E27] hover:border-[#2E4237] hover:bg-[#16221D]'
                : 'bg-white border-[#D8E0DB] hover:border-[#B5C4BC] hover:bg-[#F9FAF9]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div
              className={`p-1.5 rounded-lg ${
                activeTab === 'clients'
                  ? isDark
                    ? 'bg-[#253A30] text-[#7DA295]'
                    : 'bg-[#D2E2D8] text-[#2B4A3D]'
                  : isDark
                    ? 'bg-[#18231E] text-[#7DA295]'
                    : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}
            >
              <Users className="w-4 h-4" />
            </div>
            {activeTab === 'clients' && (
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            )}
          </div>
          <div className="mt-2.5">
            <div className={`font-semibold text-xs leading-tight ${isDark ? 'text-[#E8ECE9]' : 'text-[#141F1A]'}`}>
              Клиенты и роли
            </div>
            <div className={`text-[10px] mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              {clients.length} {clients.length === 1 ? 'подопечный' : clients.length > 4 ? 'подопечных' : 'подопечных'}
            </div>
          </div>
        </button>

        {/* 6. Интенты & Аналитика */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('analytics');
            fetchAnalytics();
          }}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer select-none active:scale-[0.98] ${
            activeTab === 'analytics'
              ? isDark
                ? 'bg-[#182B22] border-[#5B8A78] shadow-sm ring-1 ring-[#5B8A78]/40'
                : 'bg-[#EBF3EF] border-[#2B4A3D] shadow-sm ring-1 ring-[#2B4A3D]/20'
              : isDark
                ? 'bg-[#121B17] border-[#1F2E27] hover:border-[#2E4237] hover:bg-[#16221D]'
                : 'bg-white border-[#D8E0DB] hover:border-[#B5C4BC] hover:bg-[#F9FAF9]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div
              className={`p-1.5 rounded-lg ${
                activeTab === 'analytics'
                  ? isDark
                    ? 'bg-[#253A30] text-[#7DA295]'
                    : 'bg-[#D2E2D8] text-[#2B4A3D]'
                  : isDark
                    ? 'bg-[#18231E] text-[#7DA295]'
                    : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
            </div>
            {activeTab === 'analytics' && (
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            )}
          </div>
          <div className="mt-2.5">
            <div className={`font-semibold text-xs leading-tight ${isDark ? 'text-[#E8ECE9]' : 'text-[#141F1A]'}`}>
              Аналитика
            </div>
            <div className={`text-[10px] mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Интенты и темы
            </div>
          </div>
        </button>

        {/* 7. Скачать архивы */}
        <button
          type="button"
          onClick={() => setActiveTab('deploy')}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer select-none active:scale-[0.98] ${
            activeTab === 'deploy'
              ? isDark
                ? 'bg-[#182B22] border-[#5B8A78] shadow-sm ring-1 ring-[#5B8A78]/40'
                : 'bg-[#EBF3EF] border-[#2B4A3D] shadow-sm ring-1 ring-[#2B4A3D]/20'
              : isDark
                ? 'bg-[#121B17] border-[#1F2E27] hover:border-[#2E4237] hover:bg-[#16221D]'
                : 'bg-white border-[#D8E0DB] hover:border-[#B5C4BC] hover:bg-[#F9FAF9]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div
              className={`p-1.5 rounded-lg ${
                activeTab === 'deploy'
                  ? isDark
                    ? 'bg-[#253A30] text-[#7DA295]'
                    : 'bg-[#D2E2D8] text-[#2B4A3D]'
                  : isDark
                    ? 'bg-[#18231E] text-[#7DA295]'
                    : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}
            >
              <Package className="w-4 h-4" />
            </div>
            {activeTab === 'deploy' && (
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            )}
          </div>
          <div className="mt-2.5">
            <div className={`font-semibold text-xs leading-tight ${isDark ? 'text-[#E8ECE9]' : 'text-[#141F1A]'}`}>
              Скачать архивы
            </div>
            <div className={`text-[10px] mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Экспорт и бэкапы
            </div>
          </div>
        </button>

        {/* 8. Настройки LLM & БД */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('llm');
            fetchLlmStatus();
            fetchSecrets();
          }}
          className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer select-none active:scale-[0.98] ${
            activeTab === 'llm'
              ? isDark
                ? 'bg-[#182B22] border-[#5B8A78] shadow-sm ring-1 ring-[#5B8A78]/40'
                : 'bg-[#EBF3EF] border-[#2B4A3D] shadow-sm ring-1 ring-[#2B4A3D]/20'
              : isDark
                ? 'bg-[#121B17] border-[#1F2E27] hover:border-[#2E4237] hover:bg-[#16221D]'
                : 'bg-white border-[#D8E0DB] hover:border-[#B5C4BC] hover:bg-[#F9FAF9]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div
              className={`p-1.5 rounded-lg ${
                activeTab === 'llm'
                  ? isDark
                    ? 'bg-[#253A30] text-[#7DA295]'
                    : 'bg-[#D2E2D8] text-[#2B4A3D]'
                  : isDark
                    ? 'bg-[#18231E] text-[#7DA295]'
                    : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}
            >
              <Database className="w-4 h-4" />
            </div>
            <span
              className={`w-2 h-2 rounded-full ${
                secretsStatus?.database_connected ? 'bg-[#22C55E]' : 'bg-[#E06D79]'
              }`}
            />
          </div>
          <div className="mt-2.5">
            <div className={`font-semibold text-xs leading-tight ${isDark ? 'text-[#E8ECE9]' : 'text-[#141F1A]'}`}>
              Подключения & БД
            </div>
            <div className={`text-[10px] mt-0.5 ${
              secretsStatus?.database_connected
                ? 'text-[#22C55E]'
                : isDark ? 'text-[#E06D79]' : 'text-[#B83244]'
            }`}>
              {secretsStatus?.database_connected ? 'PostgreSQL онлайн' : 'Проверить БД'}
            </div>
          </div>
        </button>
      </div>

      {/* Active Section Context Bar */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
          isDark
            ? 'bg-[#15231D] border-[#1F2E27] text-[#8E9E96]'
            : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#53665C]'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-inherit">Активный раздел:</span>
          <span className={`font-semibold ${isDark ? 'text-[#E8ECE9]' : 'text-[#141F1A]'}`}>
            {activeTab === 'kb' && 'База Знаний'}
            {activeTab === 'categories' && 'Дерево Категорий'}
            {activeTab === 'gaps' && 'Анализ актуальности (<70%)'}
            {activeTab === 'escalations' && 'Эскалации тренеру'}
            {activeTab === 'clients' && 'База подписчиков и клиентов'}
            {activeTab === 'analytics' && 'Аналитика и интенты'}
            {activeTab === 'deploy' && 'Скачать архивы и экспорт'}
            {activeTab === 'llm' && 'Настройки подключений, LLM и БД'}
          </span>
        </div>
      </div>

      {/* TAB 1: KNOWLEDGE BASE */}
      {activeTab === 'kb' && (
        <div className="space-y-3.5">
          <div
            className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-3.5 rounded-xl border ${
              isDark
                ? 'bg-[#121B17] border-[#1F2E27]'
                : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1 ${
                  isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'
                }`}
              >
                <Filter className="w-3 h-3" /> Фильтры:
              </span>
              <select
                value={selectedCatFilter}
                onChange={e => setSelectedCatFilter(e.target.value)}
                className={`text-xs rounded-lg px-2.5 py-1.5 border outline-none ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9]'
                    : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A]'
                }`}
              >
                <option value="all">Все категории</option>
                {categories.map((c, idx) => (
                  <option key={`cat-opt-${c.id}-${idx}`} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select
                value={selectedStatusFilter}
                onChange={e => setSelectedStatusFilter(e.target.value)}
                className={`text-xs rounded-lg px-2.5 py-1.5 border outline-none ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9]'
                    : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A]'
                }`}
              >
                <option value="all">Все статусы</option>
                <option value="approved">Утвержденные (Active)</option>
                <option value="draft">Черновики (Draft)</option>
              </select>
            </div>

            <button
              onClick={() => {
                setEditingKb(null);
                setKbTitle('');
                setKbContent('');
                setKbStatus('approved');
                setShowKbModal(true);
              }}
              className={`w-full sm:w-auto text-xs font-medium px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm ${
                isDark
                  ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                  : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" /> Добавить статью
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredKnowledge.map((item, idx) => {
              const catName = categories.find(c => c.id === item.category_id)?.name || item.category_id;
              return (
                <div
                  key={`kb-${item.id}-${idx}`}
                  className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between transition-colors ${
                    isDark
                      ? 'bg-[#121B17] border-[#1F2E27]'
                      : 'bg-white border-[#D8E0DB]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          isDark
                            ? 'bg-[#18231E] text-[#7DA295] border-[#1F2E27]'
                            : 'bg-[#EBF0EC] text-[#2B4A3D] border-[#D8E0DB]'
                        }`}
                      >
                        {catName}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          item.status === 'approved'
                            ? isDark
                              ? 'bg-[#182820] text-[#7DA295] border-[#253A30]'
                              : 'bg-[#EBF0EC] text-[#2B4A3D] border-[#D8E0DB]'
                            : isDark
                              ? 'bg-[#2E2413] text-[#D4A359] border-[#3D3019]'
                              : 'bg-[#FFF6E5] text-[#9E6E24] border-[#F0DCBA]'
                        }`}
                      >
                        {item.status === 'approved' ? 'Утверждено' : 'Черновик'}
                      </span>
                    </div>

                    <h3 className="font-semibold text-sm mb-1.5 text-inherit leading-snug">{item.title}</h3>
                    <p
                      className={`text-xs whitespace-pre-wrap leading-relaxed ${
                        isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'
                      }`}
                    >
                      {item.content}
                    </p>
                  </div>

                  <div
                    className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[11px] ${
                      isDark ? 'border-[#18231E] text-[#8E9E96]' : 'border-[#F0F4F1] text-[#7E9187]'
                    }`}
                  >
                    <span>{formatDate(item.created_at)}</span>
                    <button
                      onClick={() => {
                        setEditingKb(item);
                        setKbTitle(item.title);
                        setKbCategoryId(item.category_id);
                        setKbContent(item.content);
                        setKbStatus(item.status);
                        setShowKbModal(true);
                      }}
                      className="p-1 text-inherit hover:opacity-100 opacity-60 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORIES TREE MANAGER */}
      {activeTab === 'categories' && (
        <div
          className={`border rounded-xl p-4 sm:p-5 space-y-4 ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27]'
              : 'bg-white border-[#D8E0DB]'
          }`}
        >
          <div
            className={`flex justify-between items-center border-b pb-3 ${
              isDark ? 'border-[#1F2E27]' : 'border-[#D8E0DB]'
            }`}
          >
            <div>
              <h3 className="font-semibold text-sm text-inherit">Иерархическое Дерево Категорий</h3>
              <p className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Управляйте структурой тем и подтем базы знаний.
              </p>
            </div>
            <button
              onClick={() => setShowCatModal(true)}
              className={`text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition ${
                isDark
                  ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                  : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" /> Добавить
            </button>
          </div>

          <div className="space-y-3">
            {categories.filter(c => !c.parent_id).map((parent, pIdx) => {
              const children = categories.filter(c => c.parent_id === parent.id);
              return (
                <div
                  key={`parent-cat-${parent.id}-${pIdx}`}
                  className={`border rounded-xl p-3.5 ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB]'
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 font-semibold text-xs mb-1 ${
                      isDark ? 'text-[#7DA295]' : 'text-[#2B4A3D]'
                    }`}
                  >
                    <Folder className="w-4 h-4" /> {parent.name}
                  </div>
                  <p className={`text-[11px] mb-2.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    {parent.description || 'Корневая категория'}
                  </p>

                  {children.length > 0 && (
                    <div
                      className={`pl-4 border-l space-y-2 ${
                        isDark ? 'border-[#253A30]' : 'border-[#D8E0DB]'
                      }`}
                    >
                      {children.map((child, cIdx) => (
                        <div
                          key={`child-cat-${child.id}-${cIdx}`}
                          className={`border rounded-lg p-2.5 text-xs flex items-center gap-2 ${
                            isDark
                              ? 'bg-[#121B17] border-[#1F2E27] text-[#E8ECE9]'
                              : 'bg-white border-[#D8E0DB] text-[#141F1A]'
                          }`}
                        >
                          <FolderTree className="w-3.5 h-3.5 opacity-60" />
                          <span className="font-medium">{child.name}</span>
                          <span className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'}`}>
                            — {child.description || 'Подкатегория'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: CONTENT GAPS ANALYTICS */}
      {activeTab === 'gaps' && (
        <div
          className={`border rounded-xl p-4 sm:p-5 space-y-4 ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27]'
              : 'bg-white border-[#D8E0DB]'
          }`}
        >
          <div
            className={`border-b pb-3 ${
              isDark ? 'border-[#1F2E27]' : 'border-[#D8E0DB]'
            }`}
          >
            <h3 className="font-semibold text-sm text-inherit">Анализ актуальности (&lt;70%)</h3>
            <p className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Вопросы подписчиков с низким соответствием. Превратите вопрос в утвержденную статью в 1 клик.
            </p>
          </div>

          <div className="space-y-3">
            {contentGaps.map((gap, gIdx) => (
              <div
                key={`gap-${gap.id}-${gIdx}`}
                className={`border rounded-xl p-3.5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27]'
                    : 'bg-[#F4F6F4] border-[#D8E0DB]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                        gap.priority === 'high'
                          ? isDark
                            ? 'bg-[#31181C] text-[#E06D79] border-[#442227]'
                            : 'bg-[#FFEBEF] text-[#B83244] border-[#F2C2CB]'
                          : isDark
                            ? 'bg-[#15231D] text-[#7DA295] border-[#253A30]'
                            : 'bg-[#EBF0EC] text-[#2B4A3D] border-[#D8E0DB]'
                      }`}
                    >
                      Приоритет: {gap.priority}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border ${
                        isDark
                          ? 'bg-[#121B17] border-[#1F2E27] text-[#8E9E96]'
                          : 'bg-white border-[#D8E0DB] text-[#53665C]'
                      }`}
                    >
                      Спросили раз: {gap.frequency}
                    </span>
                  </div>
                  <h4 className="font-semibold text-xs text-inherit">"{gap.question}"</h4>
                  <p className={`text-[11px] line-clamp-2 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Образец ответа: {gap.sample_llm_answer}
                  </p>
                </div>

                <button
                  onClick={() => handleApproveContentGap(gap)}
                  className={`text-xs font-medium px-3.5 py-2 rounded-xl shrink-0 transition flex items-center gap-1.5 shadow-sm ${
                    isDark
                      ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                      : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" /> В базу знаний
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: ESCALATIONS */}
      {activeTab === 'escalations' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-2">
            <h3 className={`text-[11px] font-semibold uppercase tracking-wider ${
              isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'
            }`}>
              Очередь эскалаций ({escalations.length})
            </h3>
            {escalations.map((e, eIdx) => (
              <div
                key={`esc-${e.id}-${eIdx}`}
                onClick={() => { setSelectedEscalation(e); setTrainerAnswerText(e.trainer_answer || ''); }}
                className={`p-3 rounded-xl border cursor-pointer transition ${
                  selectedEscalation?.id === e.id
                    ? isDark
                      ? 'bg-[#182820] border-[#5B8A78]'
                      : 'bg-[#EBF0EC] border-[#2B4A3D]'
                    : isDark
                      ? 'bg-[#121B17] border-[#1F2E27]'
                      : 'bg-white border-[#D8E0DB]'
                }`}
              >
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>{e.client_name}</span>
                  <span className={e.status === 'open' ? 'text-[#D4A359]' : 'text-[#7DA295]'}>
                    {e.status}
                  </span>
                </div>
                <p className={`text-[11px] line-clamp-2 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  {e.question}
                </p>
              </div>
            ))}
          </div>

          <div className="md:col-span-2">
            {selectedEscalation ? (
              <div
                className={`border rounded-xl p-4 sm:p-5 space-y-3.5 ${
                  isDark
                    ? 'bg-[#121B17] border-[#1F2E27]'
                    : 'bg-white border-[#D8E0DB]'
                }`}
              >
                <h3 className="font-semibold text-sm text-inherit">
                  Запрос: {selectedEscalation.client_name}
                </h3>
                <div
                  className={`p-3 rounded-xl border text-xs leading-relaxed ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A]'
                  }`}
                >
                  "{selectedEscalation.question}"
                </div>

                <form onSubmit={handleResolveEscalation} className="space-y-3">
                  <textarea
                    rows={4}
                    value={trainerAnswerText}
                    onChange={e => setTrainerAnswerText(e.target.value)}
                    placeholder="Напишите ответ тренера клиенту..."
                    className={`w-full border rounded-xl p-3 text-xs outline-none ${
                      isDark
                        ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                        : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                    }`}
                    required
                  />
                  <button
                    type="submit"
                    className={`w-full font-medium py-2.5 rounded-xl text-xs transition shadow-sm ${
                      isDark
                        ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                        : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
                    }`}
                  >
                    Отправить ответ клиенту
                  </button>
                </form>
              </div>
            ) : (
              <div
                className={`border rounded-xl p-10 text-center text-xs ${
                  isDark
                    ? 'bg-[#121B17] border-[#1F2E27] text-[#8E9E96]'
                    : 'bg-white border-[#D8E0DB] text-[#7E9187]'
                }`}
              >
                Выберите запрос из очереди для ответа.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: CLIENTS */}
      {activeTab === 'clients' && (
        <div
          className={`border rounded-xl p-4 sm:p-5 space-y-4 ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27]'
              : 'bg-white border-[#D8E0DB]'
          }`}
        >
          {/* Header & Title */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-inherit">
            <div>
              <h3 className="font-semibold text-sm text-inherit">Инфо-пульт: База подписчиков и клиентов</h3>
              <p className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Досье подопечных, история вопросов к ИИ-библиотекарю и быстрый переход в диалог Telegram
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={fetchClients}
                className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 shadow-sm cursor-pointer select-none ${
                  isDark
                    ? 'bg-[#18231E] border-[#2A3E34] text-[#E8ECE9] hover:bg-[#203028]'
                    : 'bg-white border-[#D8E0DB] text-[#141F1A] hover:bg-[#F4F6F4]'
                }`}
                title="Обновить список клиентов из базы данных"
              >
                <RefreshCw className="w-3 h-3 text-[#22C55E]" />
                <span>Обновить из БД</span>
              </button>
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                isDark ? 'bg-[#18231E] border-[#1F2E27] text-[#7DA295]' : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#2B4A3D]'
              }`}>
                Всего в базе: {clients.length}
              </span>
            </div>
          </div>

          {/* Telegram Action Toast Feedback */}
          {tgActionToast && (
            <div className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 animate-in fade-in slide-in-from-top-1 ${
              isDark ? 'bg-sky-950/40 border-sky-500/40 text-sky-200' : 'bg-sky-50 border-sky-300 text-sky-900'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                  <Send className="w-4 h-4" />
                </div>
                <div className="text-xs">
                  <span className="font-bold block text-sky-300">{tgActionToast.message}</span>
                  {tgActionToast.sub && <span className="text-[11px] opacity-80">{tgActionToast.sub}</span>}
                </div>
              </div>
              <button
                onClick={() => setTgActionToast(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-sky-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9E96]" />
              <input
                type="text"
                placeholder="Поиск по имени или Telegram ID..."
                value={clientSearchQuery}
                onChange={(e) => setClientSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border outline-none transition ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27] text-white focus:border-[#7DA295]'
                    : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#121B17] focus:border-[#2B4A3D]'
                }`}
              />
              {clientSearchQuery && (
                <button
                  onClick={() => setClientSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8E9E96] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Badges */}
            <div className="flex items-center gap-1.5 text-[11px] overflow-x-auto no-scrollbar">
              <button
                onClick={() => setClientFilterStatus('all')}
                className={`px-2.5 py-1 rounded-lg border font-medium transition shrink-0 ${
                  clientFilterStatus === 'all'
                    ? isDark ? 'bg-[#5B8A78] text-[#0A100D] border-[#5B8A78]' : 'bg-[#2B4A3D] text-white border-[#2B4A3D]'
                    : isDark ? 'border-[#1F2E27] text-[#8E9E96]' : 'border-[#D8E0DB] text-[#53665C]'
                }`}
              >
                Все ({clients.length})
              </button>
              <button
                onClick={() => setClientFilterStatus('vip')}
                className={`px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1 transition shrink-0 ${
                  clientFilterStatus === 'vip'
                    ? isDark ? 'bg-[#182820] text-[#7DA295] border-[#7DA295]' : 'bg-[#EBF0EC] text-[#2B4A3D] border-[#2B4A3D]'
                    : isDark ? 'border-[#1F2E27] text-[#8E9E96]' : 'border-[#D8E0DB] text-[#53665C]'
                }`}
              >
                <Crown className="w-3 h-3 text-[#7DA295]" />
                <span>VIP ({clients.filter(c => c.is_vip && !c.is_admin).length})</span>
              </button>
              <button
                onClick={() => setClientFilterStatus('subscriber')}
                className={`px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1 transition shrink-0 ${
                  clientFilterStatus === 'subscriber'
                    ? isDark ? 'bg-[#18231E] text-white border-[#5B8A78]' : 'bg-[#F4F7F5] text-[#121B17] border-[#2B4A3D]'
                    : isDark ? 'border-[#1F2E27] text-[#8E9E96]' : 'border-[#D8E0DB] text-[#53665C]'
                }`}
              >
                <UserCheck className="w-3 h-3" />
                <span>Подписчики ({clients.filter(c => !c.is_vip && !c.is_admin).length})</span>
              </button>
              <button
                onClick={() => setClientFilterStatus('admin')}
                className={`px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1 transition shrink-0 ${
                  clientFilterStatus === 'admin'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : isDark ? 'border-[#1F2E27] text-[#8E9E96]' : 'border-[#D8E0DB] text-[#53665C]'
                }`}
              >
                <Star className="w-3 h-3 fill-amber-400/20" />
                <span>Админы ({clients.filter(c => c.is_admin).length})</span>
              </button>
            </div>
          </div>

          {/* Client Cards Grid */}
          {clients.filter(c => {
            if (clientSearchQuery.trim()) {
              const q = clientSearchQuery.toLowerCase().trim();
              const matchesName = c.name?.toLowerCase().includes(q);
              const matchesTg = String(c.telegram_user_id || '').includes(q);
              const matchesId = String(c.id).includes(q);
              if (!matchesName && !matchesTg && !matchesId) return false;
            }
            if (clientFilterStatus === 'vip') return c.is_vip && !c.is_admin;
            if (clientFilterStatus === 'subscriber') return !c.is_vip && !c.is_admin;
            if (clientFilterStatus === 'admin') return !!c.is_admin;
            return true;
          }).length === 0 ? (
            <div className={`p-8 text-center rounded-xl border text-xs ${
              isDark ? 'border-[#1F2E27] text-[#8E9E96]' : 'border-[#D8E0DB] text-[#53665C]'
            }`}>
              Пользователи по заданным критериям не найдены.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {clients
                .filter(c => {
                  if (clientSearchQuery.trim()) {
                    const q = clientSearchQuery.toLowerCase().trim();
                    const matchesName = c.name?.toLowerCase().includes(q);
                    const matchesTg = String(c.telegram_user_id || '').includes(q);
                    const matchesId = String(c.id).includes(q);
                    if (!matchesName && !matchesTg && !matchesId) return false;
                  }
                  if (clientFilterStatus === 'vip') return c.is_vip && !c.is_admin;
                  if (clientFilterStatus === 'subscriber') return !c.is_vip && !c.is_admin;
                  if (clientFilterStatus === 'admin') return !!c.is_admin;
                  return true;
                })
                .map((c, cIdx) => (
                  <div
                    key={`client-${c.id}-${c.telegram_user_id || cIdx}-${cIdx}`}
                    className={`border rounded-xl p-3.5 space-y-2.5 text-xs transition relative ${
                      isDark
                        ? 'bg-[#18231E] border-[#1F2E27]'
                        : 'bg-[#F4F6F4] border-[#D8E0DB]'
                    }`}
                  >
                    {/* Header: Name & Role Badge with SVG */}
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-semibold text-sm text-inherit truncate">{c.name}</span>
                      {c.is_admin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                          <Star className="w-3 h-3 fill-amber-400/30 text-amber-400" />
                          Администратор
                        </span>
                      ) : c.is_vip ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${
                            isDark
                              ? 'bg-[#182820] text-[#7DA295] border-[#253A30]'
                              : 'bg-[#EBF0EC] text-[#2B4A3D] border-[#D8E0DB]'
                          }`}
                        >
                          <Crown className="w-3 h-3 text-[#7DA295]" />
                          VIP (Ведение)
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 ${
                            isDark
                              ? 'bg-[#121B17] text-[#8E9E96] border-[#1F2E27]'
                              : 'bg-white text-[#7E9187] border-[#D8E0DB]'
                          }`}
                        >
                          <UserCheck className="w-3 h-3 text-[#8E9E96]" />
                          Подписчик
                        </span>
                      )}
                    </div>

                    {/* ID line: Database ID, Telegram ID & Username */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[#8E9E96]">
                      <span className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-black/20">ID: #{c.id}</span>
                      <span>•</span>
                      <span>TG ID: {c.telegram_user_id || 'Не привязан'}</span>
                      {(c.telegram_username || c.profile?.telegram_username) && (
                        <>
                          <span>•</span>
                          <span className="text-sky-400 font-medium">@{c.telegram_username || c.profile?.telegram_username}</span>
                        </>
                      )}
                      {c.messages_count !== undefined && (
                        <>
                          <span>•</span>
                          <span>Вопросов: {c.messages_count}</span>
                        </>
                      )}
                    </div>

                    {/* Brief Profile Params */}
                    <div className="space-y-1">
                      <p className={isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}>
                        Цель: <span className="text-inherit font-medium">{c.profile?.goal || 'Не указана'}</span>
                      </p>
                      {c.profile?.restrictions && (
                        <p className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Травмы/Ограничения: {c.profile.restrictions}</span>
                        </p>
                      )}
                      {c.profile?.active_topic && (
                        <p className={`text-[10px] ${isDark ? 'text-[#7DA295]' : 'text-[#2B4A3D]'}`}>
                          Активный фокус: {c.profile.active_topic}
                        </p>
                      )}
                    </div>

                    {/* Quick Action Buttons: Dossier & Telegram */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-dashed border-inherit">
                      <button
                        type="button"
                        onClick={() => handleOpenClientDossier(c)}
                        className={`py-1.5 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                          isDark
                            ? 'bg-[#121B17] hover:bg-[#1E2B24] border-[#1F2E27] text-[#7DA295]'
                            : 'bg-white hover:bg-[#EAF0EB] border-[#D8E0DB] text-[#2B4A3D]'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Досье & Чат</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenTelegramChat(c.telegram_user_id, c.telegram_username || c.profile?.telegram_username)}
                        className="py-1.5 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30 text-sky-400"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>В Telegram</span>
                      </button>
                    </div>

                    {/* Role Management Buttons */}
                    <div className="pt-2 border-t border-dashed border-inherit space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-medium ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                          Сменить статус:
                        </span>
                        <button
                          onClick={() => handleToggleClientVip(c.id, !!c.is_vip)}
                          className={`py-0.5 px-2 rounded border text-[10px] font-semibold transition ${
                            c.is_vip
                              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                              : isDark
                                ? 'bg-[#5B8A78]/10 border-[#5B8A78]/20 text-[#7DA295] hover:bg-[#5B8A78]/20'
                                : 'bg-[#2B4A3D]/10 border-[#2B4A3D]/20 text-[#2B4A3D] hover:bg-[#2B4A3D]/20'
                          }`}
                        >
                          {c.is_vip ? 'Отменить VIP' : 'Активировать VIP'}
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => handleSetClientRole(c.id, 'subscriber')}
                          className={`py-1 px-1.5 rounded-lg border text-[10px] font-semibold flex items-center justify-center gap-1 transition ${
                            !c.is_vip && !c.is_admin
                              ? isDark
                                ? 'bg-[#18231E] border-[#5B8A78] text-[#7DA295]'
                                : 'bg-[#F4F7F5] border-[#2B4A3D] text-[#2B4A3D]'
                              : isDark
                                ? 'bg-transparent border-[#1F2E27] text-[#8E9E96] hover:bg-[#18231E]'
                                : 'bg-transparent border-[#E0E8E3] text-[#7E9187] hover:bg-[#F4F7F5]'
                          }`}
                        >
                          <UserCheck className="w-2.5 h-2.5" />
                          <span>Подписчик</span>
                        </button>

                        <button
                          onClick={() => handleSetClientRole(c.id, 'vip')}
                          className={`py-1 px-1.5 rounded-lg border text-[10px] font-semibold flex items-center justify-center gap-1 transition ${
                            c.is_vip && !c.is_admin
                              ? isDark
                                ? 'bg-[#182820] border-[#7DA295] text-[#7DA295]'
                                : 'bg-[#EBF0EC] border-[#2B4A3D] text-[#2B4A3D]'
                              : isDark
                                ? 'bg-transparent border-[#1F2E27] text-[#8E9E96] hover:bg-[#18231E]'
                                : 'bg-transparent border-[#E0E8E3] text-[#7E9187] hover:bg-[#F4F7F5]'
                          }`}
                        >
                          <Crown className="w-2.5 h-2.5" />
                          <span>VIP</span>
                        </button>

                        <button
                          onClick={() => handleSetClientRole(c.id, 'admin')}
                          className={`py-1 px-1.5 rounded-lg border text-[10px] font-semibold flex items-center justify-center gap-1 transition ${
                            c.is_admin
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                              : isDark
                                ? 'bg-transparent border-[#1F2E27] text-[#8E9E96] hover:bg-[#18231E]'
                                : 'bg-transparent border-[#E0E8E3] text-[#7E9187] hover:bg-[#F4F7F5]'
                          }`}
                        >
                          <Star className="w-2.5 h-2.5 fill-amber-400/20" />
                          <span>Админ</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* CLIENT DOSSIER & CHAT MODAL */}
          {selectedClientDossier && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
              <div
                className={`w-full max-w-xl max-h-[90vh] rounded-2xl border flex flex-col shadow-2xl overflow-hidden ${
                  isDark ? 'bg-[#121B17] border-[#1F2E27] text-white' : 'bg-white border-[#D8E0DB] text-[#0A100D]'
                }`}
              >
                {/* Modal Header */}
                <div className="p-4 border-b border-inherit flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl border ${
                      isDark ? 'bg-[#18231E] border-[#253A30] text-[#7DA295]' : 'bg-[#EBF0EC] border-[#D8E0DB] text-[#2B4A3D]'
                    }`}>
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-inherit">{selectedClientDossier.name}</h3>
                        {selectedClientDossier.is_admin ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <Star className="w-3 h-3 fill-amber-400/30 text-amber-400" />
                            Администратор
                          </span>
                        ) : selectedClientDossier.is_vip ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#182820] text-[#7DA295] border border-[#253A30]">
                            <Crown className="w-3 h-3 text-[#7DA295]" />
                            VIP
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-black/10 dark:bg-black/20 text-[#8E9E96] border border-inherit">
                            <UserCheck className="w-3 h-3 text-[#8E9E96]" />
                            Подписчик
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-[#8E9E96]">
                        ID: #{selectedClientDossier.id} • Telegram ID: {selectedClientDossier.telegram_user_id || 'Не привязан'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedClientDossier(null)}
                    className="p-1.5 rounded-lg border border-inherit text-[#8E9E96] hover:text-inherit transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="p-4 overflow-y-auto space-y-4 text-xs">
                  {/* Physical Parameters Card */}
                  <div className={`p-3.5 rounded-xl border space-y-2.5 ${
                    isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F6F4] border-[#D8E0DB]'
                  }`}>
                    <div className="flex items-center gap-1.5 font-semibold text-xs border-b border-inherit pb-1.5">
                      <Activity className="w-3.5 h-3.5 text-[#7DA295]" />
                      <span>Параметры и цель подопечного</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div className="p-2 rounded-lg bg-black/10 dark:bg-black/20 border border-inherit">
                        <span className="text-[#8E9E96] block text-[10px]">Вес</span>
                        <span className="font-bold text-sm text-inherit">
                          {selectedClientDossier.profile?.weight ? `${selectedClientDossier.profile.weight} кг` : '—'}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-black/10 dark:bg-black/20 border border-inherit">
                        <span className="text-[#8E9E96] block text-[10px]">Рост</span>
                        <span className="font-bold text-sm text-inherit">
                          {selectedClientDossier.profile?.height ? `${selectedClientDossier.profile.height} см` : '—'}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-black/10 dark:bg-black/20 border border-inherit">
                        <span className="text-[#8E9E96] block text-[10px]">Возраст</span>
                        <span className="font-bold text-sm text-inherit">
                          {selectedClientDossier.profile?.age ? `${selectedClientDossier.profile.age} лет` : '—'}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-black/10 dark:bg-black/20 border border-inherit">
                        <span className="text-[#8E9E96] block text-[10px]">Пол</span>
                        <span className="font-bold text-sm text-inherit">
                          {selectedClientDossier.profile?.gender === 'female' ? 'Женский' : 'Мужской'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <p>
                        <span className="text-[#8E9E96]">Цель: </span>
                        <span className="font-semibold text-inherit">{selectedClientDossier.profile?.goal || 'Не указана'}</span>
                      </p>

                      {selectedClientDossier.profile?.restrictions && (
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block text-[11px]">Ограничения по здоровью / Травмы:</span>
                            <span className="text-xs">{selectedClientDossier.profile.restrictions}</span>
                          </div>
                        </div>
                      )}

                      {selectedClientDossier.profile?.diet_preferences && (
                        <p>
                          <span className="text-[#8E9E96]">Рацион и диета: </span>
                          <span className="text-inherit">{selectedClientDossier.profile.diet_preferences}</span>
                        </p>
                      )}

                      {selectedClientDossier.profile?.training_frequency && (
                        <p>
                          <span className="text-[#8E9E96]">Частота тренировок: </span>
                          <span className="text-inherit">{selectedClientDossier.profile.training_frequency}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* AI Conversation History Log */}
                  <div className={`p-3.5 rounded-xl border space-y-2.5 ${
                    isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F6F4] border-[#D8E0DB]'
                  }`}>
                    <div className="flex items-center justify-between border-b border-inherit pb-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-xs">
                        <MessageSquare className="w-3.5 h-3.5 text-[#7DA295]" />
                        <span>История вопросов к ИИ-библиотекарю</span>
                      </div>
                      <span className="text-[10px] text-[#8E9E96]">
                        {clientMessages.length} сообщ.
                      </span>
                    </div>

                    {loadingClientMessages ? (
                      <div className="py-8 flex flex-col items-center justify-center gap-2 text-[#8E9E96]">
                        <Loader2 className="w-5 h-5 animate-spin text-[#7DA295]" />
                        <span>Загрузка истории диалога...</span>
                      </div>
                    ) : clientMessages.length === 0 ? (
                      <div className="py-6 text-center text-[#8E9E96] text-xs">
                        Клиент пока не задавал вопросов боту в чате.
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                        {clientMessages.map((m: any, idx: number) => (
                          <div
                            key={`dash-msg-${m.id || idx}-${idx}`}
                            className={`p-2.5 rounded-xl text-xs space-y-1 ${
                              m.role === 'user'
                                ? isDark
                                  ? 'bg-[#121B17] border border-[#1F2E27] ml-4'
                                  : 'bg-white border border-[#D8E0DB] ml-4'
                                : isDark
                                  ? 'bg-[#192721] border border-[#253A30] mr-4'
                                  : 'bg-[#EBF0EC] border border-[#D8E0DB] mr-4'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px]">
                              <span className={`font-semibold flex items-center gap-1 ${
                                m.role === 'user' ? 'text-inherit' : 'text-[#7DA295]'
                              }`}>
                                {m.role === 'user' ? (
                                  <>
                                    <User className="w-3 h-3 text-[#8E9E96]" />
                                    <span>Вопрос клиента</span>
                                  </>
                                ) : (
                                  <>
                                    <BookOpen className="w-3 h-3 text-[#7DA295]" />
                                    <span>Ответ ИИ-библиотекаря</span>
                                  </>
                                )}
                              </span>
                              {m.created_at && (
                                <span className="text-[#8E9E96] font-mono">
                                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <p className="leading-relaxed whitespace-pre-wrap text-inherit">
                              {m.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer with Primary Telegram Button */}
                <div className="p-4 border-t border-inherit flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                  <div className="text-[11px] text-[#8E9E96] text-center sm:text-left">
                    Откройте чат, чтобы записать голосовое или кружочек подопечному
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenTelegramChat(selectedClientDossier.telegram_user_id, selectedClientDossier.telegram_username || selectedClientDossier.profile?.telegram_username)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs bg-sky-500 hover:bg-sky-400 text-white shadow-md shadow-sky-500/20 flex items-center justify-center gap-2 transition"
                  >
                    <Send className="w-4 h-4" />
                    <span>Открыть диалог в Telegram</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: SUBSCRIPTION ANALYTICS & WEEKLY INTENT DIGEST */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {/* Header Card */}
          <div
            className={`p-4 rounded-xl border space-y-2 ${
              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className={`w-5 h-5 ${isDark ? 'text-[#7DA295]' : 'text-[#2B4A3D]'}`} />
                <h3 className="font-semibold text-sm text-inherit">Аналитика подписок & Еженедельный дайджест интентов</h3>
              </div>
              <button
                onClick={fetchAnalytics}
                disabled={loadingAnalytics}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27] text-[#7DA295] hover:bg-[#202E28]'
                    : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#2B4A3D] hover:bg-[#EAF0EB]'
                }`}
              >
                {loadingAnalytics ? 'Обновление...' : 'Обновить данные'}
              </button>
            </div>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Сравнительный анализ активности платных (VIP) и бесплатных (базовых) участников, а также рейтинг востребованных тем за последние 7 дней.
            </p>
          </div>

          {/* VIP vs Basic Segment Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* VIP Card */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                  isDark
                    ? 'bg-[#182820] text-[#7DA295] border-[#253A30]'
                    : 'bg-[#EBF0EC] text-[#2B4A3D] border-[#D8E0DB]'
                }`}>
                  VIP / Платная подписка
                </span>
                <span className="text-xs font-bold text-inherit">
                  {analyticsData?.summary?.vip_clients_count || 2} клиентов
                </span>
              </div>
              <div className="space-y-2 pt-1">
                <p className={`text-[11px] font-medium ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Распределение интересов (Интенты):
                </p>
                {analyticsData?.vip_stats?.category_breakdown ? (
                  Object.entries(analyticsData.vip_stats.category_breakdown as Record<string, number>).map(([cat, count], idx) => (
                    <div key={`vip-cat-${cat}-${idx}`} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-inherit capitalize">{cat}</span>
                        <span className="font-semibold">{count} запр.</span>
                      </div>
                      <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-[#18231E]' : 'bg-[#EBF0EC]'}`}>
                        <div
                          className={`h-full rounded-full ${isDark ? 'bg-[#5B8A78]' : 'bg-[#2B4A3D]'}`}
                          style={{ width: `${Math.min(100, (Number(count) / 12) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted">Загрузка данных...</p>
                )}
              </div>
            </div>

            {/* Basic Card */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                  isDark
                    ? 'bg-[#121B17] text-[#8E9E96] border-[#1F2E27]'
                    : 'bg-white text-[#7E9187] border-[#D8E0DB]'
                }`}>
                  Базовые / Бесплатный канал
                </span>
                <span className="text-xs font-bold text-inherit">
                  {analyticsData?.summary?.basic_clients_count || 2} участников
                </span>
              </div>
              <div className="space-y-2 pt-1">
                <p className={`text-[11px] font-medium ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Распределение интересов (Интенты):
                </p>
                {analyticsData?.basic_stats?.category_breakdown ? (
                  Object.entries(analyticsData.basic_stats.category_breakdown as Record<string, number>).map(([cat, count], idx) => (
                    <div key={`basic-cat-${cat}-${idx}`} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-inherit capitalize">{cat}</span>
                        <span className="font-semibold">{count} запр.</span>
                      </div>
                      <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-[#18231E]' : 'bg-[#EBF0EC]'}`}>
                        <div
                          className={`h-full rounded-full ${isDark ? 'bg-[#8E9E96]' : 'bg-[#53665C]'}`}
                          style={{ width: `${Math.min(100, (Number(count) / 12) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted">Загрузка данных...</p>
                )}
              </div>
            </div>
          </div>

          {/* Weekly Intent Digest Ranked Table */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-xs text-inherit">Рейтинг интентов за 7 дней (Weekly Digest)</h4>
              <span className={`text-[10px] font-mono ${isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'}`}>
                По частоте запросов
              </span>
            </div>

            <div className="space-y-2">
              {analyticsData?.weekly_intent_digest?.map((item: any, idx: number) => (
                <div
                  key={`digest-${item.category_id || idx}-${idx}`}
                  className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                    isDark ? 'bg-[#18231E] border-[#1F2E27]' : 'bg-[#F4F6F4] border-[#D8E0DB]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      idx === 0
                        ? 'bg-[#5B8A78] text-[#0A100D]'
                        : isDark
                          ? 'bg-[#121B17] text-[#8E9E96]'
                          : 'bg-white text-[#53665C]'
                    }`}>
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="font-semibold text-inherit">{item.category_name}</span>
                      <p className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'}`}>
                        Всего вопросов: {item.total_requests}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-[#7DA295] font-semibold">VIP: {item.vip_requests}</span>
                    <span className={isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}>Базовые: {item.basic_requests}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: DEPLOYMENT & ARCHIVES */}
      {activeTab === 'deploy' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Package className={`w-5 h-5 ${isDark ? 'text-[#7DA295]' : 'text-[#2B4A3D]'}`} />
              <h3 className="font-semibold text-sm text-inherit">Размещение приложения и скачивание архивов</h3>
            </div>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Архивы генерируются и отдаются через бинарный поток данных (Blob API), гарантируя 100% сохранность и предотвращая ошибки 404.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Archive 1: Client dist */}
            <div
              className={`p-4 rounded-xl border space-y-3.5 flex flex-col justify-between ${
                isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium text-xs">
                  <Package className="w-4 h-4 text-[#5B8A78]" />
                  <span>Сборка статики (dist.zip)</span>
                </div>
                <p className={`text-[11px] leading-normal ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Содержит скомпилированные клиентские файлы (index.html, JS/CSS бандлы, PWA манифест). Идеально для быстрой публикации на хостинге (FTP, cPanel, Nginx/Apache).
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-dashed border-opacity-30">
                <button
                  onClick={() => handleDownloadFile('/dist.zip', 'dist.zip')}
                  disabled={downloadingFile === 'dist.zip'}
                  className={`w-full py-2 px-3 rounded-xl font-medium text-xs transition flex items-center justify-center gap-2 ${
                    isDark
                      ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                      : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
                  }`}
                >
                  {downloadingFile === 'dist.zip' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Формирование архива...</span>
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
                  className={`w-full py-1.5 px-3 rounded-xl border text-xs transition flex items-center justify-center gap-1.5 ${
                    isDark
                      ? 'bg-[#18231E] border-[#253A30] text-[#E8ECE9] hover:bg-[#1F2E27]'
                      : 'bg-[#F4F6F4] border-[#C8D6CF] text-[#141F1A] hover:bg-[#EBF0EC]'
                  }`}
                >
                  {copiedLink === '/dist.zip' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Ссылка скопирована!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Скопировать ссылку на dist.zip</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Archive 2: Full Project */}
            <div
              className={`p-4 rounded-xl border space-y-3.5 flex flex-col justify-between ${
                isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium text-xs">
                  <Server className="w-4 h-4 text-[#5B8A78]" />
                  <span>Полный проект с сервером (project-full.zip)</span>
                </div>
                <p className={`text-[11px] leading-normal ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Полный исходный код с Node.js Express сервером (server.ts, package.json). Готов к деплою на облачные сервисы (Render.com, VPS, Docker).
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-dashed border-opacity-30">
                <button
                  onClick={() => handleDownloadFile('/project-full.zip', 'project-full.zip')}
                  disabled={downloadingFile === 'project-full.zip'}
                  className={`w-full py-2 px-3 rounded-xl font-medium text-xs transition flex items-center justify-center gap-2 ${
                    isDark
                      ? 'bg-[#1F2E27] text-[#E8ECE9] border border-[#253A30] hover:bg-[#283C33]'
                      : 'bg-white text-[#141F1A] border border-[#C8D6CF] hover:bg-[#F4F6F4]'
                  }`}
                >
                  {downloadingFile === 'project-full.zip' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Формирование архива...</span>
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
                  className={`w-full py-1.5 px-3 rounded-xl border text-xs transition flex items-center justify-center gap-1.5 ${
                    isDark
                      ? 'bg-[#18231E] border-[#253A30] text-[#E8ECE9] hover:bg-[#1F2E27]'
                      : 'bg-[#F4F6F4] border-[#C8D6CF] text-[#141F1A] hover:bg-[#EBF0EC]'
                  }`}
                >
                  {copiedLink === '/project-full.zip' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Ссылка скопирована!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Скопировать ссылку на project-full.zip</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: LLM PROVIDER & DIAGNOSTICS */}
      {activeTab === 'llm' && (
        <div className="space-y-4">
          {/* Header Card */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between sm:items-center gap-3 ${
              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2 text-inherit">
                <Server className="w-4 h-4 text-[#5B8A78]" />
                <span>AI Tunnel — Единый ИИ-Провайдер</span>
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Бот работает через единый шлюз AI Tunnel (api.aitunnel.ru). Выберите рабочую модель нейросети и проверьте генерацию.
              </p>
            </div>

            <button
              onClick={fetchLlmStatus}
              disabled={loadingLlmStatus}
              className={`text-xs py-1.5 px-3 rounded-lg border font-medium flex items-center gap-1.5 transition self-start sm:self-auto ${
                isDark
                  ? 'bg-[#18231E] border-[#253A30] text-[#E8ECE9] hover:bg-[#1F2E27]'
                  : 'bg-[#F4F6F4] border-[#C8D6CF] text-[#141F1A] hover:bg-[#EBF0EC]'
              }`}
            >
              <Loader2 className={`w-3.5 h-3.5 ${loadingLlmStatus ? 'animate-spin' : ''}`} />
              <span>Обновить статус</span>
            </button>
          </div>

          {/* Status Alert Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              llmStatus?.is_ready
                ? isDark
                  ? 'bg-[#15271F] border-[#254637] text-[#A3E0C1]'
                  : 'bg-[#EDF7F2] border-[#B7DEC8] text-[#1B5738]'
                : isDark
                  ? 'bg-[#2E2413] border-[#4D3A1B] text-[#E8BF74]'
                  : 'bg-[#FFF8E6] border-[#F0D597] text-[#8C6212]'
            }`}
          >
            <div className="mt-0.5">
              {llmStatus?.is_ready ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              )}
            </div>
            <div className="text-xs space-y-1">
              <div className="font-semibold">
                {llmStatus?.is_ready ? 'AI Tunnel подключен и готов к работе' : 'Внимание: AITUNNEL_API_KEY не обнаружен'}
              </div>
              <div className="opacity-90 leading-relaxed">
                Шлюз: <code className="font-mono text-[11px]">https://api.aitunnel.ru/v1/</code> | Активная модель:{' '}
                <span className="font-mono font-bold text-[#5B8A78] dark:text-[#7DA295]">
                  {llmStatus?.effective_model || 'gpt-6-luna-pro'}
                </span>
                {llmStatus?.status_message && (
                  <span className="block mt-0.5 opacity-80 text-[11px] font-sans">
                    {llmStatus.status_message}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Environment Secrets & API Keys Form */}
          <div
            className={`p-4 rounded-xl border space-y-3.5 ${
              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-2.5 border-inherit">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#5B8A78]" />
                <h4 className="font-semibold text-xs text-inherit">Настройка ключей GitHub, AI Tunnel и Базы Данных PostgreSQL (.env)</h4>
              </div>
              {secretsSuccess && (
                <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ключи сохранены в .env!
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] mb-3">
              <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-[#18231E] border-[#253A30]' : 'bg-[#F4F6F4] border-[#E1E8E4]'}`}>
                <span className="font-medium block text-[#5B8A78]">GitHub API Token:</span>
                <code className="text-[11px] font-mono">{secretsStatus?.github_token?.masked || 'Не настроен'}</code>
              </div>
              <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-[#18231E] border-[#253A30]' : 'bg-[#F4F6F4] border-[#E1E8E4]'}`}>
                <span className="font-medium block text-[#5B8A78]">AITunnel API Key:</span>
                <code className="text-[11px] font-mono">{secretsStatus?.aitunnel_api_key?.masked || 'Не настроен'}</code>
              </div>
              <div
                onClick={() => !isCheckingDb && fetchSecrets(true)}
                role="button"
                tabIndex={0}
                className={`p-2.5 rounded-lg border transition cursor-pointer select-none ${
                  isDark
                    ? 'bg-[#18231E] border-[#253A30] hover:border-[#5B8A78] hover:bg-[#1E2E26]'
                    : 'bg-[#F4F6F4] border-[#E1E8E4] hover:border-[#2B4A3D] hover:bg-[#EDF2EE]'
                }`}
                title="Нажмите в любое место этой карточки для проверки подключения к БД"
              >
                <div className="flex items-center justify-between pointer-events-none">
                  <span className="font-medium text-[#5B8A78]">PostgreSQL БД:</span>
                  <div className="flex items-center gap-1.5">
                    {isCheckingDb ? (
                      <span className="text-[10px] text-[#5B8A78] font-medium flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Проверка...
                      </span>
                    ) : secretsStatus?.database_connected ? (
                      <span className="text-[10px] text-emerald-500 font-bold flex items-center gap-0.5">● Подключено</span>
                    ) : (
                      <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                        ○ Не активна
                        <RefreshCw className="w-2.5 h-2.5 opacity-70" />
                      </span>
                    )}
                  </div>
                </div>
                <code className="text-[11px] font-mono block mt-0.5 pointer-events-none">{secretsStatus?.database_url?.masked || 'Не настроен'}</code>
              </div>
            </div>

            {secretsStatus?.database_error && !secretsStatus?.database_connected && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs space-y-1 mb-3">
                <div className="font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>Статус подключения к PostgreSQL:</span>
                </div>
                <div className="font-mono text-[11px] opacity-90 pl-5">{secretsStatus.database_error}</div>
              </div>
            )}

            <div className="pt-1 flex flex-col sm:flex-row items-center gap-2">
              <button
                type="button"
                onClick={() => fetchSecrets(true)}
                disabled={isCheckingDb}
                className={`w-full sm:w-auto py-2.5 px-5 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-2 shadow-sm cursor-pointer select-none active:scale-[0.99] ${
                  isDark
                    ? 'bg-[#18231E] border-[#253A30] text-[#E8ECE9] hover:border-[#5B8A78] hover:bg-[#1E2E26]'
                    : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] hover:border-[#2B4A3D] hover:bg-[#EBEFEA]'
                } ${isCheckingDb ? 'opacity-70 cursor-wait' : ''}`}
              >
                {isCheckingDb ? (
                  <div className="flex items-center gap-2 pointer-events-none">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#5B8A78]" />
                    <span className="font-medium text-[#5B8A78] dark:text-[#7DA295]">Проверка подключения к PostgreSQL...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pointer-events-none">
                    <RefreshCw className="w-3.5 h-3.5 text-[#5B8A78]" />
                    <span>Проверить статус подключения к БД из .env</span>
                  </div>
                )}
              </button>
            </div>

            {dbCheckMessage && (
              <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2.5 mt-2 animate-in fade-in slide-in-from-top-1 ${
                dbCheckMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : dbCheckMessage.type === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                <div className="flex items-center gap-2">
                  {dbCheckMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span>{dbCheckMessage.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDbCheckMessage(null)}
                  className="p-1 rounded hover:bg-white/10 opacity-70 hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Mobile-Friendly Raw .env Editor */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-2.5 border-inherit">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#5B8A78]" />
                <div>
                  <h4 className="font-semibold text-xs text-inherit">Редактор файла .env (для мобильных устройств)</h4>
                  <p className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Прямое редактирование переменных окружения на сервере без необходимости в дереве файлов
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!showEnvEditor) fetchEnvRaw();
                  setShowEnvEditor(!showEnvEditor);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'bg-[#18231E] border-[#253A30] text-[#7DA295] hover:text-[#E8ECE9]'
                    : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#2B4A3D] hover:text-[#141F1A]'
                }`}
              >
                <span>{showEnvEditor ? 'Свернуть' : 'Открыть редактор .env'}</span>
              </button>
            </div>

            {showEnvEditor && (
              <div className="space-y-3 pt-1 animate-in fade-in">
                <p className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Отредактируйте параметры ниже и нажмите <strong>«Сохранить .env на сервере»</strong>:
                </p>
                <textarea
                  value={envContent}
                  onChange={e => setEnvContent(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  className={`w-full font-mono text-xs p-3 rounded-xl border outline-none transition ${
                    isDark
                      ? 'bg-[#0D1411] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-white border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                  placeholder="Вставьте содержимое .env файла..."
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEnvRaw}
                      disabled={savingEnv}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer ${
                        savingEnv
                          ? 'bg-[#5B8A78]/50 cursor-wait'
                          : 'bg-[#2B4A3D] hover:bg-[#3D6B58]'
                      }`}
                    >
                      {savingEnv ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Сохранение...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Сохранить .env на сервере</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(envContent);
                        setEnvSavedMessage('Текст .env скопирован в буфер обмена!');
                        setTimeout(() => setEnvSavedMessage(null), 3000);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 cursor-pointer ${
                        isDark
                          ? 'bg-[#18231E] border-[#253A30] text-[#E8ECE9] hover:border-[#5B8A78]'
                          : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] hover:border-[#2B4A3D]'
                      }`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Скопировать</span>
                    </button>
                  </div>
                  {envSavedMessage && (
                    <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 animate-in fade-in">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      {envSavedMessage}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* AI Tunnel Configuration Form */}
          <div
            className={`p-4 rounded-xl border space-y-3.5 ${
              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-2.5 border-inherit">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#5B8A78]" />
                <h4 className="font-semibold text-xs text-inherit">Выбор модели и ключ AI Tunnel</h4>
              </div>
              {configSuccess && (
                <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Модель успешно сохранена!
                </span>
              )}
            </div>

            <form onSubmit={handleSaveRuntimeConfig} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Model Selector */}
                <div>
                  <label className={`block mb-1 text-[11px] font-medium ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Модель нейросети (AI Tunnel)
                  </label>
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className={`w-full border rounded-xl p-2.5 outline-none transition ${
                      isDark
                        ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                        : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                    }`}
                  >
                    <option value="gpt-6-luna-pro">gpt-6-luna-pro (По умолчанию — быстрый и точный)</option>
                    <option value="gpt-4o-mini">gpt-4o-mini (OpenAI GPT-4o Mini)</option>
                    <option value="gpt-4o">gpt-4o (OpenAI GPT-4o)</option>
                    <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet (Claude 3.5 Sonnet)</option>
                    <option value="deepseek-chat">deepseek-chat (DeepSeek V3)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (Google Gemini 1.5 Pro)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash (Google Gemini 2.0 Flash)</option>
                    <option value="custom">Другая модель (ввести вручную...)</option>
                  </select>
                </div>

                {/* API Key (Optional update) */}
                <div>
                  <label className={`block mb-1 text-[11px] font-medium ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    AITUNNEL_API_KEY (необязательно, если задан в .env)
                  </label>
                  <input
                    type="password"
                    placeholder="Вставьте новый ключ для обновления..."
                    value={inputApiKey}
                    onChange={e => setInputApiKey(e.target.value)}
                    className={`w-full border rounded-xl p-2.5 outline-none transition ${
                      isDark
                        ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                        : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                    }`}
                  />
                </div>
              </div>

              {/* Custom Model Input if selected */}
              {selectedModel === 'custom' && (
                <div>
                  <label className={`block mb-1 text-[11px] font-medium ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Название модели в AI Tunnel:
                  </label>
                  <input
                    type="text"
                    placeholder="Например: claude-3-opus, llama-3.3-70b-instruct..."
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    className={`w-full border rounded-xl p-2.5 outline-none transition ${
                      isDark
                        ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                        : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                    }`}
                  />
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className={`w-full sm:w-auto py-2.5 px-5 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 shadow-sm ${
                    isDark
                      ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                      : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
                  } ${savingConfig ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {savingConfig ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Применение настроек...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Сохранить модель AI Tunnel</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Interactive Test Console */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#5B8A78]" />
              <h4 className="font-semibold text-xs text-inherit">Тестирование ответа ассистента в реальном времени</h4>
            </div>

            <form onSubmit={handleTestLlmGeneration} className="space-y-3">
              <div>
                <label className={`block mb-1 text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Тестовый вопрос клиента:
                </label>
                <textarea
                  rows={2}
                  value={testPrompt}
                  onChange={e => setTestPrompt(e.target.value)}
                  className={`w-full border rounded-xl p-2.5 text-xs outline-none ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                  placeholder="Введите вопрос для проверки LLM..."
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={testingLlm || !testPrompt.trim()}
                  className={`py-2 px-4 rounded-xl text-xs font-medium transition flex items-center gap-2 shadow-sm ${
                    isDark
                      ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                      : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
                  } ${testingLlm ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {testingLlm ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Генерация ответа через {llmStatus?.effective_provider}...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Отправить тестовый запрос</span>
                    </>
                  )}
                </button>

                <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Правило: Нулевой уровень эмодзи, научная строгость
                </div>
              </div>
            </form>

            {/* Test Result View */}
            {testResult && (
              <div
                className={`mt-3 p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
                  testResult.success
                    ? isDark
                      ? 'bg-[#15231D] border-[#253A30] text-[#E8ECE9]'
                      : 'bg-[#F2F8F4] border-[#C8DFD2] text-[#141F1A]'
                    : isDark
                      ? 'bg-[#31181C] border-[#5A232B] text-[#FFA8B3]'
                      : 'bg-[#FFF0F2] border-[#F8C1C8] text-[#931D2D]'
                }`}
              >
                <div className="flex items-center justify-between font-medium text-[11px]">
                  <span>
                    {testResult.success ? 'Ответ сгенерирован успешно' : 'Ошибка при обращении к провайдеру'}
                  </span>
                  {testResult.latency_ms && (
                    <span className="opacity-75 font-mono text-[10px]">
                      Время ответа: {testResult.latency_ms} мс | Модель: {testResult.model}
                    </span>
                  )}
                </div>

                {testResult.success ? (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-black/15 font-sans leading-relaxed whitespace-pre-wrap text-xs">
                      {testResult.answer}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const textToCopy = testResult.answer || testResult.error || JSON.stringify(testResult, null, 2);
                          navigator.clipboard.writeText(textToCopy);
                          setCopiedError(true);
                          setTimeout(() => setCopiedError(false), 2000);
                        }}
                        className={`text-[11px] py-1 px-2.5 rounded-lg border font-medium flex items-center gap-1.5 transition ${
                          isDark
                            ? 'bg-[#18231E] border-[#253A30] text-[#E8ECE9] hover:bg-[#1F2E27]'
                            : 'bg-white border-[#C8D6CF] text-[#141F1A] hover:bg-[#EBF0EC]'
                        }`}
                      >
                        {copiedError ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedError ? 'Скопировано!' : 'Скопировать ответ'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-black/20 font-mono text-[11px] leading-relaxed break-all select-all">
                      {testResult.error || 'Неизвестная ошибка выполнения запроса'}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] opacity-70">Нажмите на кнопку справа для копирования полного текста ошибки</span>
                      <button
                        type="button"
                        onClick={() => {
                          const textToCopy = testResult.error || testResult.answer || JSON.stringify(testResult, null, 2);
                          navigator.clipboard.writeText(textToCopy);
                          setCopiedError(true);
                          setTimeout(() => setCopiedError(false), 2000);
                        }}
                        className={`text-[11px] py-1 px-2.5 rounded-lg border font-medium flex items-center gap-1.5 transition shrink-0 ${
                          isDark
                            ? 'bg-[#2A1518] border-[#5A232B] text-[#FFA8B3] hover:bg-[#3A1D21]'
                            : 'bg-white border-[#F8C1C8] text-[#931D2D] hover:bg-[#FFF0F2]'
                        }`}
                      >
                        {copiedError ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedError ? 'Скопировано в буфер!' : 'Скопировать ошибку'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Render Configuration Guide */}
          <div
            className={`p-3.5 rounded-xl border space-y-2 text-xs ${
              isDark ? 'bg-[#18231E]/50 border-[#253A30]' : 'bg-[#F4F6F4] border-[#D8E0DB]'
            }`}
          >
            <div className="font-semibold text-inherit flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-[#5B8A78]" />
              <span>Как задать ключи на Render.com:</span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
              Перейдите в панель сервиса на <b>dashboard.render.com</b> → вкладка <b>Environment</b> → добавьте:
            </p>
            <ul className={`list-disc list-inside space-y-1 font-mono text-[11px] pl-1 ${isDark ? 'text-[#A5B8AE]' : 'text-[#30483C]'}`}>
              <li><code>AI_PROVIDER</code> = <code>ai_tunnel</code> (или <code>gemini</code>, <code>openai</code>)</li>
              <li><code>AITUNNEL_API_KEY</code> = <code>ваш_ключ_от_aitunnel</code></li>
              <li><code>AITUNNEL_BASE_URL</code> = <code>https://api.aitunnel.ru/v1/</code></li>
              <li><code>AITUNNEL_MODEL</code> = <code>gpt-6-luna-pro</code></li>
            </ul>
          </div>
        </div>
      )}

      {/* MODAL: ADD KNOWLEDGE */}
      {showKbModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            className={`border rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl ${
              isDark
                ? 'bg-[#121B17] border-[#1F2E27] text-[#E8ECE9]'
                : 'bg-white border-[#D8E0DB] text-[#141F1A]'
            }`}
          >
            <h3 className="font-semibold text-sm text-inherit">Добавить статью в БЗ</h3>
            <form onSubmit={handleCreateOrUpdateKb} className="space-y-3 text-xs">
              <div>
                <label className={`block mb-1 text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Название статьи
                </label>
                <input
                  type="text"
                  value={kbTitle}
                  onChange={e => setKbTitle(e.target.value)}
                  className={`w-full border rounded-xl p-2.5 outline-none ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                  required
                />
              </div>

              <div>
                <label className={`block mb-1 text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Категория / Подкатегория
                </label>
                <select
                  value={kbCategoryId}
                  onChange={e => setKbCategoryId(e.target.value)}
                  className={`w-full border rounded-xl p-2.5 outline-none ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                >
                  {categories.map((c, idx) => (
                    <option key={`cat-mod1-${c.id}-${idx}`} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block mb-1 text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Содержание
                </label>
                <textarea
                  rows={4}
                  value={kbContent}
                  onChange={e => setKbContent(e.target.value)}
                  className={`w-full border rounded-xl p-2.5 outline-none ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                  required
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowKbModal(false)}
                  className={`flex-1 py-2 rounded-xl border transition ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#8E9E96]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#7E9187]'
                  }`}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2 rounded-xl font-medium transition ${
                    isDark
                      ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                      : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
                  }`}
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CATEGORY */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            className={`border rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl ${
              isDark
                ? 'bg-[#121B17] border-[#1F2E27] text-[#E8ECE9]'
                : 'bg-white border-[#D8E0DB] text-[#141F1A]'
            }`}
          >
            <h3 className="font-semibold text-sm text-inherit">Новая категория</h3>
            <form onSubmit={handleCreateCategory} className="space-y-3 text-xs">
              <div>
                <label className={`block mb-1 text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Название
                </label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  className={`w-full border rounded-xl p-2.5 outline-none ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                  required
                />
              </div>

              <div>
                <label className={`block mb-1 text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Родительская категория (если подкатегория)
                </label>
                <select
                  value={newCatParentId}
                  onChange={e => setNewCatParentId(e.target.value)}
                  className={`w-full border rounded-xl p-2.5 outline-none ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                >
                  <option value="">Корневая категория</option>
                  {categories.filter(c => !c.parent_id).map((c, idx) => (
                    <option key={`cat-mod2-${c.id}-${idx}`} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block mb-1 text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Описание (опционально)
                </label>
                <input
                  type="text"
                  value={newCatDesc}
                  onChange={e => setNewCatDesc(e.target.value)}
                  className={`w-full border rounded-xl p-2.5 outline-none ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCatModal(false)}
                  className={`flex-1 py-2 rounded-xl border transition ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#8E9E96]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#7E9187]'
                  }`}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2 rounded-xl font-medium transition ${
                    isDark
                      ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                      : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
                  }`}
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

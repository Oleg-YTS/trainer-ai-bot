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
  Loader2,
  ExternalLink
} from 'lucide-react';
import { apiFetch } from '../api';

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
  is_vip: boolean;
  profile: any;
  created_at: string;
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

  // Runtime LLM Config State
  const [selectedProvider, setSelectedProvider] = useState<'ai_tunnel' | 'gemini' | 'openai'>('ai_tunnel');
  const [inputApiKey, setInputApiKey] = useState('');
  const [inputModel, setInputModel] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);

  const handleSaveRuntimeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccess(false);
    try {
      const payload: any = { provider: selectedProvider };
      if (selectedProvider === 'ai_tunnel') {
        if (inputApiKey) payload.aitunnelApiKey = inputApiKey;
        if (inputModel) payload.aitunnelModel = inputModel;
      } else if (selectedProvider === 'gemini') {
        if (inputApiKey) payload.geminiApiKey = inputApiKey;
        if (inputModel) payload.geminiModel = inputModel;
      } else if (selectedProvider === 'openai') {
        if (inputApiKey) payload.openaiApiKey = inputApiKey;
        if (inputModel) payload.openaiModel = inputModel;
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

  const fetchClients = async () => {
    try {
      const res = await apiFetch('/api/clients');
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setClients([]);
    }
  };

  const handleToggleClientVip = async (clientId: number, currentVipStatus: boolean) => {
    try {
      const res = await apiFetch('/api/client/vip/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          is_vip: !currentVipStatus
        })
      });
      if (res.ok) {
        fetchClients();
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to toggle client VIP status:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchCategories();
    fetchKnowledge();
    fetchContentGaps();
    fetchEscalations();
    fetchClients();
    fetchLlmStatus();
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
      {/* Accent Header Bar with Distinct Trainer Space Recognition */}
      <div
        className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors shadow-sm ${
          isDark
            ? 'bg-[#15231D] border-[#253A30] text-[#E8ECE9]'
            : 'bg-[#E3ECE7] border-[#C8D6CF] text-[#141F1A]'
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

      {/* Metrics Row (Unified with Dark/Light Palette) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div
          className={`p-3 rounded-xl border shadow-sm transition-colors ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27]'
              : 'bg-white border-[#D8E0DB]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                isDark ? 'bg-[#18231E] text-[#7DA295]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            <span className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Статьи</span>
          </div>
          <div className="text-lg font-bold text-inherit mt-1">{stats.activeKnowledgeItems}</div>
        </div>

        <div
          className={`p-3 rounded-xl border shadow-sm transition-colors ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27]'
              : 'bg-white border-[#D8E0DB]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                isDark ? 'bg-[#2E2413] text-[#D4A359]' : 'bg-[#FFF6E5] text-[#9E6E24]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
            </div>
            <span className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Тем &lt;70%</span>
          </div>
          <div
            className={`text-lg font-bold mt-1 ${
              isDark ? 'text-[#D4A359]' : 'text-[#9E6E24]'
            }`}
          >
            {stats.openContentGaps}
          </div>
        </div>

        <div
          className={`p-3 rounded-xl border shadow-sm transition-colors ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27]'
              : 'bg-white border-[#D8E0DB]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                isDark ? 'bg-[#31181C] text-[#E06D79]' : 'bg-[#FFEBEF] text-[#B83244]'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Проверка</span>
          </div>
          <div
            className={`text-lg font-bold mt-1 ${
              isDark ? 'text-[#E06D79]' : 'text-[#B83244]'
            }`}
          >
            {stats.openEscalations}
          </div>
        </div>

        <div
          className={`p-3 rounded-xl border shadow-sm transition-colors ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27]'
              : 'bg-white border-[#D8E0DB]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}
            >
              <FolderTree className="w-4 h-4" />
            </div>
            <span className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Категории</span>
          </div>
          <div className="text-lg font-bold text-inherit mt-1">{categories.length}</div>
        </div>

        <div
          className={`p-3 rounded-xl border shadow-sm transition-colors ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27]'
              : 'bg-white border-[#D8E0DB]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                isDark ? 'bg-[#18231E] text-[#7DA295]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
              }`}
            >
              <Users className="w-4 h-4" />
            </div>
            <span className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>Клиенты</span>
          </div>
          <div className="text-lg font-bold text-inherit mt-1">{stats.totalClients}</div>
        </div>
      </div>

      {/* Tabs with Theme Indicator */}
      <div
        className={`flex border-b gap-1 overflow-x-auto no-scrollbar ${
          isDark ? 'border-[#1F2E27]' : 'border-[#D8E0DB]'
        }`}
      >
        <button
          onClick={() => setActiveTab('kb')}
          className={`pb-2.5 px-3 font-medium text-xs flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'kb'
              ? isDark
                ? 'border-[#5B8A78] text-[#7DA295]'
                : 'border-[#2B4A3D] text-[#2B4A3D]'
              : isDark
                ? 'border-transparent text-[#8E9E96] hover:text-[#E8ECE9]'
                : 'border-transparent text-[#7E9187] hover:text-[#141F1A]'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" /> База Знаний ({knowledge.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`pb-2.5 px-3 font-medium text-xs flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'categories'
              ? isDark
                ? 'border-[#5B8A78] text-[#7DA295]'
                : 'border-[#2B4A3D] text-[#2B4A3D]'
              : isDark
                ? 'border-transparent text-[#8E9E96] hover:text-[#E8ECE9]'
                : 'border-transparent text-[#7E9187] hover:text-[#141F1A]'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" /> Дерево Категорий ({categories.length})
        </button>
        <button
          onClick={() => setActiveTab('gaps')}
          className={`pb-2.5 px-3 font-medium text-xs flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'gaps'
              ? isDark
                ? 'border-[#5B8A78] text-[#7DA295]'
                : 'border-[#2B4A3D] text-[#2B4A3D]'
              : isDark
                ? 'border-transparent text-[#8E9E96] hover:text-[#E8ECE9]'
                : 'border-transparent text-[#7E9187] hover:text-[#141F1A]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Актуальность ({contentGaps.length})
        </button>
        <button
          onClick={() => setActiveTab('escalations')}
          className={`pb-2.5 px-3 font-medium text-xs flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'escalations'
              ? isDark
                ? 'border-[#5B8A78] text-[#7DA295]'
                : 'border-[#2B4A3D] text-[#2B4A3D]'
              : isDark
                ? 'border-transparent text-[#8E9E96] hover:text-[#E8ECE9]'
                : 'border-transparent text-[#7E9187] hover:text-[#141F1A]'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" /> Эскалации ({escalations.filter(e => e.status === 'open').length})
        </button>
        <button
          onClick={() => setActiveTab('clients')}
          className={`pb-2.5 px-3 font-medium text-xs flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'clients'
              ? isDark
                ? 'border-[#5B8A78] text-[#7DA295]'
                : 'border-[#2B4A3D] text-[#2B4A3D]'
              : isDark
                ? 'border-transparent text-[#8E9E96] hover:text-[#E8ECE9]'
                : 'border-transparent text-[#7E9187] hover:text-[#141F1A]'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Клиенты ({clients.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('analytics');
            fetchAnalytics();
          }}
          className={`pb-2.5 px-3 font-medium text-xs flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'analytics'
              ? isDark
                ? 'border-[#5B8A78] text-[#7DA295]'
                : 'border-[#2B4A3D] text-[#2B4A3D]'
              : isDark
                ? 'border-transparent text-[#8E9E96] hover:text-[#E8ECE9]'
                : 'border-transparent text-[#7E9187] hover:text-[#141F1A]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Аналитика & Интенты
        </button>
        <button
          onClick={() => setActiveTab('deploy')}
          className={`pb-2.5 px-3 font-medium text-xs flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'deploy'
              ? isDark
                ? 'border-[#5B8A78] text-[#7DA295]'
                : 'border-[#2B4A3D] text-[#2B4A3D]'
              : isDark
                ? 'border-transparent text-[#8E9E96] hover:text-[#E8ECE9]'
                : 'border-transparent text-[#7E9187] hover:text-[#141F1A]'
          }`}
        >
          <Package className="w-3.5 h-3.5" /> Скачать архивы
        </button>
        <button
          onClick={() => {
            setActiveTab('llm');
            fetchLlmStatus();
          }}
          className={`pb-2.5 px-3 font-medium text-xs flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
            activeTab === 'llm'
              ? isDark
                ? 'border-[#5B8A78] text-[#7DA295]'
                : 'border-[#2B4A3D] text-[#2B4A3D]'
              : isDark
                ? 'border-transparent text-[#8E9E96] hover:text-[#E8ECE9]'
                : 'border-transparent text-[#7E9187] hover:text-[#141F1A]'
          }`}
        >
          <Server className="w-3.5 h-3.5" /> Настройки LLM
        </button>
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
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
            {filteredKnowledge.map(item => {
              const catName = categories.find(c => c.id === item.category_id)?.name || item.category_id;
              return (
                <div
                  key={item.id}
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
            {categories.filter(c => !c.parent_id).map(parent => {
              const children = categories.filter(c => c.parent_id === parent.id);
              return (
                <div
                  key={parent.id}
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
                      {children.map(child => (
                        <div
                          key={child.id}
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
            {contentGaps.map(gap => (
              <div
                key={gap.id}
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
            {escalations.map(e => (
              <div
                key={e.id}
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
          className={`border rounded-xl p-4 sm:p-5 space-y-3.5 ${
            isDark
              ? 'bg-[#121B17] border-[#1F2E27]'
              : 'bg-white border-[#D8E0DB]'
          }`}
        >
          <h3 className="font-semibold text-sm text-inherit">База подписчиков и клиентов</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clients.map(c => (
              <div
                key={c.id}
                className={`border rounded-xl p-3.5 space-y-1.5 text-xs ${
                  isDark
                    ? 'bg-[#18231E] border-[#1F2E27]'
                    : 'bg-[#F4F6F4] border-[#D8E0DB]'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm text-inherit">{c.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      c.is_vip
                        ? isDark
                          ? 'bg-[#182820] text-[#7DA295] border-[#253A30]'
                          : 'bg-[#EBF0EC] text-[#2B4A3D] border-[#D8E0DB]'
                        : isDark
                          ? 'bg-[#121B17] text-[#8E9E96] border-[#1F2E27]'
                          : 'bg-white text-[#7E9187] border-[#D8E0DB]'
                    }`}
                  >
                    {c.is_vip ? 'VIP (Ведение)' : 'Подписчик канала'}
                  </span>
                </div>
                <p className={isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}>
                  Цель: {c.profile?.goal || 'Не указана'}
                </p>
                {c.profile?.active_topic && (
                  <p className={`text-[10px] ${isDark ? 'text-[#7DA295]' : 'text-[#2B4A3D]'}`}>
                    Активный фокус: {c.profile.active_topic}
                  </p>
                )}

                <div className="pt-1.5 border-t border-dashed border-inherit flex items-center justify-between">
                  <span className={`text-[10px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                    Изменить статус доступа:
                  </span>
                  <button
                    onClick={() => handleToggleClientVip(c.id, !!c.is_vip)}
                    className={`py-1 px-2.5 rounded-lg border text-[10px] font-semibold transition ${
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
              </div>
            ))}
          </div>
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
                  Object.entries(analyticsData.vip_stats.category_breakdown as Record<string, number>).map(([cat, count]) => (
                    <div key={cat} className="space-y-1">
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
                  Object.entries(analyticsData.basic_stats.category_breakdown as Record<string, number>).map(([cat, count]) => (
                    <div key={cat} className="space-y-1">
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
                  key={item.category_id}
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
                <span>Диагностика и Настройки LLM Провайдера</span>
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                Управление моделью искусственного интеллекта, ключами доступа и проверка ответа ассистента
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
                {llmStatus?.is_ready ? 'LLM Провайдер активен и готов к генерации' : 'Внимание: API-ключ не настроен'}
              </div>
              <div className="opacity-90 leading-relaxed">
                Активный провайдер:{' '}
                <span className="font-mono font-bold">{llmStatus?.effective_provider || 'не определен'}</span> | Модель:{' '}
                <span className="font-mono font-bold">{llmStatus?.effective_model || 'none'}</span>
                {llmStatus?.status_message && (
                  <span className="block mt-0.5 opacity-80 text-[11px] font-sans">
                    Статус: {llmStatus.status_message}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Providers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* AITunnel Card */}
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 ${
                isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-inherit">AITunnel (Россия/РФ)</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    llmStatus?.providers?.ai_tunnel?.has_key
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {llmStatus?.providers?.ai_tunnel?.has_key ? 'Ключ задан' : 'Ключ отсутствует'}
                </span>
              </div>
              <div className={`text-[11px] space-y-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                <div>URL: <code className="text-[10px] font-mono">{llmStatus?.providers?.ai_tunnel?.base_url || 'https://api.aitunnel.ru/v1/'}</code></div>
                <div>Модель: <span className="font-medium text-inherit">{llmStatus?.providers?.ai_tunnel?.model || 'gpt-6-luna-pro'}</span></div>
                <div className="text-[10px] opacity-75">Переменная: <code>AITUNNEL_API_KEY</code></div>
              </div>
            </div>

            {/* Google Gemini Card */}
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 ${
                isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-inherit">Google Gemini</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    llmStatus?.providers?.gemini?.has_key
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {llmStatus?.providers?.gemini?.has_key ? 'Ключ задан' : 'Ключ отсутствует'}
                </span>
              </div>
              <div className={`text-[11px] space-y-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                <div>SDK: <code className="text-[10px] font-mono">@google/genai</code></div>
                <div>Модель: <span className="font-medium text-inherit">{llmStatus?.providers?.gemini?.model || 'gemini-3.8-flash'}</span></div>
                <div className="text-[10px] opacity-75">Переменная: <code>GEMINI_API_KEY</code></div>
              </div>
            </div>

            {/* OpenAI Direct Card */}
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 ${
                isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-inherit">OpenAI Direct</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    llmStatus?.providers?.openai?.has_key
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {llmStatus?.providers?.openai?.has_key ? 'Ключ задан' : 'Ключ отсутствует'}
                </span>
              </div>
              <div className={`text-[11px] space-y-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                <div>URL: <code className="text-[10px] font-mono">{llmStatus?.providers?.openai?.base_url || 'https://api.openai.com/v1'}</code></div>
                <div>Модель: <span className="font-medium text-inherit">{llmStatus?.providers?.openai?.model || 'gpt-4o-mini'}</span></div>
                <div className="text-[10px] opacity-75">Переменная: <code>OPENAI_API_KEY</code></div>
              </div>
            </div>
          </div>

          {/* Quick Key Input / Switch Form */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#5B8A78]" />
                <h4 className="font-semibold text-xs text-inherit">Быстрое подключение ключа в текущей сессии</h4>
              </div>
              {configSuccess && (
                <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Настройки применены!
                </span>
              )}
            </div>

            <form onSubmit={handleSaveRuntimeConfig} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className={`block mb-1 text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  Провайдер
                </label>
                <select
                  value={selectedProvider}
                  onChange={e => setSelectedProvider(e.target.value as any)}
                  className={`w-full border rounded-xl p-2.5 outline-none ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                >
                  <option value="ai_tunnel">AITunnel (Россия/РФ)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI Direct</option>
                </select>
              </div>

              <div>
                <label className={`block mb-1 text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  API-ключ
                </label>
                <input
                  type="password"
                  placeholder="Вставьте API-ключ..."
                  value={inputApiKey}
                  onChange={e => setInputApiKey(e.target.value)}
                  className={`w-full border rounded-xl p-2.5 outline-none ${
                    isDark
                      ? 'bg-[#18231E] border-[#1F2E27] text-[#E8ECE9] focus:border-[#5B8A78]'
                      : 'bg-[#F4F6F4] border-[#D8E0DB] text-[#141F1A] focus:border-[#2B4A3D]'
                  }`}
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={savingConfig || !inputApiKey.trim()}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-sm ${
                    isDark
                      ? 'bg-[#5B8A78] text-[#0A100D] hover:bg-[#7DA295]'
                      : 'bg-[#2B4A3D] text-white hover:bg-[#3C6150]'
                  } ${savingConfig || !inputApiKey.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {savingConfig ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Применение...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Применить ключ</span>
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
                  <div className="p-2.5 rounded-lg bg-black/15 font-sans leading-relaxed whitespace-pre-wrap text-xs">
                    {testResult.answer}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-black/20 font-mono text-[11px] leading-relaxed break-all">
                    {testResult.error}
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
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
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
                  {categories.filter(c => !c.parent_id).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
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

import React, { useState, useEffect } from 'react';
import { Search, FolderTree, Folder, BookOpen, ChevronRight, ChevronDown, MessageSquare } from 'lucide-react';
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

interface MobileKnowledgeCatalogProps {
  isDark: boolean;
  onAskQuestion: (query: string) => void;
}

export const MobileKnowledgeCatalog: React.FC<MobileKnowledgeCatalogProps> = ({
  isDark,
  onAskQuestion
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);

  const DEFAULT_CATEGORIES: Category[] = [
    { id: 'training', name: 'Тренировочный процесс', description: 'Силовой тренинг, техника упражнений и периодизация' },
    { id: 'nutrition', name: 'Питание и диетология', description: 'Баланс БЖУ, калорийность рациона и спортивное питание' },
    { id: 'recovery', name: 'Восстановление и сон', description: 'Гигиена сна, регенерация и снятие мышечного напряжения' },
    { id: 'weight_loss', name: 'Снижение жировой массы', description: 'Грамотный дефицит, сохранение мышц и контроль аппетита' },
    { id: 'muscle_gain', name: 'Набор мышечной массы', description: 'Гипертрофия мышц, профицит и прогрессия весов' },
    { id: 'other', name: 'Общие вопросы методики', description: 'Рекомендации тренера и методические указания' },
  ];

  useEffect(() => {
    Promise.all([
      apiFetch('/api/categories').then(r => r.json()).catch(() => null),
      apiFetch('/api/knowledge').then(r => r.json()).catch(() => null)
    ]).then(([cats, kb]) => {
      if (Array.isArray(cats) && cats.length > 0) {
        setCategories(cats);
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
      if (Array.isArray(kb)) {
        setKnowledge(kb.filter(k => k.status === 'approved' || k.status === 'published'));
      }
    }).catch(err => {
      console.warn('Failed to load categories or knowledge, using defaults:', err);
      setCategories(DEFAULT_CATEGORIES);
    });
  }, []);

  const topCategories = categories.filter(c => !c.parent_id);

  const getSubcategories = (parentId: string) => categories.filter(c => c.parent_id === parentId);

  const getCategoryArticles = (catId: string) => {
    const subIds = categories.filter(c => c.parent_id === catId).map(c => c.id);
    const allCatIds = [catId, ...subIds];
    return knowledge.filter(k => allCatIds.includes(k.category_id || (k as any).category));
  };

  const toggleCategory = (catId: string) => {
    setExpandedCatId(prev => (prev === catId ? null : catId));
  };

  const filteredArticles = searchQuery.trim()
    ? knowledge.filter(k =>
        k.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        k.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('ru-RU');
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Search Input */}
      <div className={`relative rounded-xl border transition ${
        isDark
          ? 'bg-[#121B17] border-[#1F2E27] focus-within:border-[#5B8A78]'
          : 'bg-white border-[#D8E0DB] focus-within:border-[#2B4A3D]'
      }`}>
        <Search className={`w-4 h-4 absolute left-3.5 top-3 ${
          isDark ? 'text-[#8E9E96]' : 'text-[#7E9187]'
        }`} />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Поиск по статьям и методике..."
          className={`w-full pl-10 pr-4 py-2.5 text-xs rounded-xl bg-transparent outline-none ${
            isDark
              ? 'text-[#E8ECE9] placeholder-[#5E7068]'
              : 'text-[#141F1A] placeholder-[#8E9E96]'
          }`}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-2.5 text-xs text-inherit opacity-50 hover:opacity-100"
          >
            Очистить
          </button>
        )}
      </div>

      {/* Search Results Mode */}
      {filteredArticles !== null ? (
        <div className="space-y-3">
          <div className="text-[11px] font-medium opacity-60">
            Найдено материалов: {filteredArticles.length}
          </div>
          {filteredArticles.length === 0 ? (
            <div className={`p-6 rounded-xl border text-center text-xs ${
              isDark ? 'bg-[#121B17] border-[#1F2E27] text-[#8E9E96]' : 'bg-white border-[#D8E0DB] text-[#53665C]'
            }`}>
              В базе пока нет статьи по этому запросу. Спросите у AI Библиотекаря в чате — ответ будет зафиксирован для включения тренером.
            </div>
          ) : (
            filteredArticles.map((item, idx) => (
              <div
                key={`cat-art-${item.id}-${idx}`}
                className={`p-4 rounded-xl border transition space-y-2 ${
                  isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] opacity-70">
                  <span>Статья тренера</span>
                  <span>{formatDate(item.created_at)}</span>
                </div>
                <h4 className="font-semibold text-sm leading-snug">{item.title}</h4>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                  {item.content}
                </p>
                <button
                  onClick={() => onAskQuestion(`Уточни по статье: ${item.title}`)}
                  className={`pt-2 text-[11px] font-medium flex items-center gap-1 transition ${
                    isDark ? 'text-[#7DA295] hover:text-[#E8ECE9]' : 'text-[#2B4A3D] hover:text-[#141F1A]'
                  }`}
                >
                  <MessageSquare className="w-3 h-3" /> Задать вопрос библиотекарю
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Hierarchical Categories Directory */
        <div className="space-y-2.5">
          <div className="text-[11px] font-medium tracking-wide uppercase opacity-50 px-1">
            Разделы знаний тренера
          </div>

          {topCategories.map((cat, cIdx) => {
            const isExpanded = expandedCatId === cat.id;
            const articles = getCategoryArticles(cat.id);
            const subs = getSubcategories(cat.id);

            return (
              <div
                key={`topcat-${cat.id}-${cIdx}`}
                className={`rounded-xl border transition overflow-hidden ${
                  isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
                }`}
              >
                {/* Category Header Row */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full p-3.5 flex items-center justify-between text-left transition hover:opacity-90"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${
                      isDark ? 'bg-[#18231E] text-[#5B8A78]' : 'bg-[#EBF0EC] text-[#2B4A3D]'
                    }`}>
                      <Folder className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-xs text-inherit">{cat.name}</div>
                      <div className={`text-[11px] ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                        {articles.length} {articles.length === 1 ? 'статья' : 'статей'} {subs.length > 0 && `· ${subs.length} подраздела`}
                      </div>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 opacity-50" />
                  ) : (
                    <ChevronRight className="w-4 h-4 opacity-50" />
                  )}
                </button>

                {/* Subcategories & Articles Drawer */}
                {isExpanded && (
                  <div className={`px-3.5 pb-3.5 pt-1 border-t space-y-3 ${
                    isDark ? 'border-[#18231E] bg-[#0E1512]' : 'border-[#F0F4F1] bg-[#F9FBFA]'
                  }`}>
                    {cat.description && (
                      <p className={`text-[11px] pt-1 ${isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'}`}>
                        {cat.description}
                      </p>
                    )}

                    {/* Subcategories tags */}
                    {subs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {subs.map((s, sIdx) => (
                          <span
                            key={`subcat-${s.id}-${sIdx}`}
                            className={`text-[10px] px-2 py-1 rounded-md border ${
                              isDark
                                ? 'bg-[#121B17] border-[#1F2E27] text-[#8E9E96]'
                                : 'bg-white border-[#D8E0DB] text-[#53665C]'
                            }`}
                          >
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Category Articles */}
                    <div className="space-y-2 pt-1">
                      {articles.length === 0 ? (
                        <div className={`p-3 rounded-lg border text-center text-[11px] leading-relaxed ${
                          isDark ? 'bg-[#121B17] border-[#1F2E27] text-[#8E9E96]' : 'bg-white border-[#D8E0DB] text-[#53665C]'
                        }`}>
                          В этом разделе пока нет утвержденных статей тренера. Задайте вопрос в чате — ответ будет подготовлен с участием тренера.
                        </div>
                      ) : (
                        articles.map((art, aIdx) => (
                          <div
                            key={`art-${art.id}-${aIdx}`}
                            className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                              isDark ? 'bg-[#121B17] border-[#1F2E27]' : 'bg-white border-[#D8E0DB]'
                            }`}
                          >
                            <div className="font-medium text-xs text-inherit">{art.title}</div>
                            <p className={`text-[11px] leading-relaxed line-clamp-3 ${
                              isDark ? 'text-[#8E9E96]' : 'text-[#53665C]'
                            }`}>
                              {art.content}
                            </p>
                            <button
                              onClick={() => onAskQuestion(`Расскажи подробнее по теме: ${art.title}`)}
                              className={`pt-1 text-[10px] font-medium flex items-center gap-1 transition ${
                                isDark ? 'text-[#7DA295]' : 'text-[#2B4A3D]'
                              }`}
                            >
                              <MessageSquare className="w-3 h-3" /> Спросить библиотекаря
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

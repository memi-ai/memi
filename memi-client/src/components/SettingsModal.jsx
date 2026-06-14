import { useEffect, useRef, useState } from "react";
import {
  X,
  Sun,
  Moon,
  SunMoon,
  Type,
  Globe,
  Cpu,
  Server,
  Puzzle,
  Database,
  Trash2,
  BrainCircuit,
  CreditCard,
  Keyboard,
  Search,
  Plus,
  MoreHorizontal,
  Copy,
  Link2,
} from "lucide-react";
import { THEME_STYLES, FONT_SIZE_OPTIONS, FONT_FAMILY_OPTIONS } from "../defaults.js";
import ConfigPanel from "./ConfigPanel.jsx";
import { getUsageStats, resetUsage } from "../utils/usageTracker.js";

// ─── 胶囊按钮组 ──────────────────────────────────────
function ButtonGroup({ options, value, onChange, className = "" }) {
  return (
    <div className={"inline-flex rounded-lg border border-gray-200 overflow-hidden " + className}>
      {options.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            className={
              "px-4 py-1.5 text-sm transition-colors " +
              (isActive
                ? "theme-bg text-white font-medium"
                : "bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50")
            }
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── 技能管理组件 ────────────────────────────────────
function SkillsPage({ m, lang, skills, onSkillsChange, navLabel }) {
  const [editingSkill, setEditingSkill] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [form, setForm] = useState(null);
  const [importMode, setImportMode] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  const isFormOpen = showEditor && form !== null;

  function genId() {
    return crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function handleDelete(id) {
    const skill = skills.find((s) => s.id === id);
    const name = lang === "en" ? skill?.nameEn || skill?.name : skill?.name;
    if (!window.confirm((m.skills.deleteConfirm || "").replace("{name}", name || ""))) return;
    onSkillsChange(skills.filter((s) => s.id !== id));
  }

  function handleSave(skillData) {
    if (skillData.id && skills.find((s) => s.id === skillData.id)) {
      onSkillsChange(skills.map((s) => (s.id === skillData.id ? skillData : s)));
    } else {
      onSkillsChange([...skills, { ...skillData, id: genId(), builtin: false }]);
    }
    setShowEditor(false);
    setEditingSkill(null);
    setForm(null);
  }

  function openEditor(skill) {
    setImportMode(false);
    setImportUrl("");
    const defaults = {
      name: "", nameEn: "", description: "", descriptionEn: "",
      type: "llm", promptTemplate: "",
    };
    setEditingSkill(skill || null);
    setForm(skill ? { ...skill } : defaults);
    setShowEditor(true);
  }

  async function doImport() {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const r = await fetch("/api/skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);

      const skill = { ...d.skill, builtin: false, enabled: true };
      onSkillsChange([...skills, { ...skill, id: genId() }]);
      setImportUrl("");
      setImportMode(false);
      setShowEditor(false);
    } catch (e) {
      alert("导入失败: " + e.message);
    } finally {
      setImporting(false);
    }
  }

  function closeEditor() {
    setShowEditor(false);
    setEditingSkill(null);
    setForm(null);
  }

  // ── 状态统计 ──
  const totalCount = skills.length;
  const enabledCount = skills.filter((s) => s.enabled !== false).length;
  const disabledCount = skills.filter((s) => s.enabled === false).length;

  // ── 筛选逻辑 ──
  const filtered = skills.filter((s) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const sn = (s.name || "").toLowerCase();
      const sen = (s.nameEn || "").toLowerCase();
      const sd = (s.description || "").toLowerCase();
      if (!sn.includes(q) && !sen.includes(q) && !sd.includes(q)) return false;
    }
    if (activeTab === "all") return true;
    if (activeTab === "enabled") return s.enabled !== false;
    if (activeTab === "disabled") return s.enabled === false;
    return true;
  });

  // ── 编辑器模式 ──
  if (isFormOpen) {
    const isNew = !editingSkill?.id;
    // 新建时的导入模式
    if (isNew && importMode) {
      return (
        <div className="space-y-5 max-w-xl">
          <div className="flex items-center gap-3">
            <button className="text-gray-400 hover:text-gray-600 p-1" type="button" onClick={closeEditor}><X size={16} strokeWidth={1.5} /></button>
            <h3 className="text-sm font-semibold text-gray-800">{m.skills.add} · {lang === "en" ? "Import" : "导入"}</h3>
          </div>
          <div>
            <label className="block text-sm mb-1"><span className="text-gray-700 font-medium">GitHub URL</span></label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-gray-400"
              placeholder="https://github.com/user/repo/blob/main/skill.json"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doImport(); }}
            />
            <p className="mt-1 text-xs text-gray-400">{lang === "en" ? "Supports GitHub blob/raw/gist URLs, JSON & Markdown" : "支持 GitHub blob/raw/gist 链接，JSON 和 Markdown 格式"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="theme-bg rounded-lg px-5 py-2 text-sm text-white font-medium disabled:opacity-50" onClick={doImport} disabled={importing || !importUrl.trim()}>
              {importing ? (lang === "en" ? "Importing..." : "导入中...") : (lang === "en" ? "Import" : "导入")}
            </button>
            <button className="rounded-lg border border-gray-200 px-5 py-2 text-sm text-gray-500" onClick={() => setImportMode(false)}>
              {lang === "en" ? "Manual Entry" : "手动填写"}
            </button>
            <button className="rounded-lg border border-gray-200 px-5 py-2 text-sm text-gray-500" onClick={closeEditor}>{m.skills.cancel || "取消"}</button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 max-w-xl">
        <div className="flex items-center gap-3 mb-2">
          <button className="text-gray-400 hover:text-gray-600 p-1" type="button" onClick={closeEditor}>
            <X size={16} strokeWidth={1.5} />
          </button>
          <h3 className="text-sm font-semibold text-gray-800">
            {isNew ? m.skills.add : m.skills.edit}
          </h3>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-sm mb-1"><span className="text-gray-700 font-medium">{m.skills.name}</span></label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-gray-400 transition-colors" placeholder="例如：故事生成器" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm mb-1"><span className="text-gray-700 font-medium">{m.skills.type}</span></label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="llm">{m.skills.typeLlm}</option>
              <option value="image">{m.skills.typeImage}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1"><span className="text-gray-700 font-medium">{m.skills.description}</span></label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-gray-400 transition-colors" placeholder="描述这个技能的作用" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm mb-1"><span className="text-gray-700 font-medium">{m.skills.promptTemplate}</span></label>
            <textarea className="w-full min-h-[120px] rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-gray-400 transition-colors font-mono leading-relaxed" placeholder='Translate to English: {input}' value={form.promptTemplate} onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })} />
            <p className="mt-1.5 text-xs text-gray-400">{m.skills.promptTemplateDesc}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button className="theme-bg rounded-lg px-6 py-2 text-sm text-white font-medium hover:opacity-90 transition-opacity" type="button" onClick={() => handleSave(form)}>
            {m.skills.save || "保存"}
          </button>
          <button className="rounded-lg border border-gray-200 px-6 py-2 text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors" type="button" onClick={closeEditor}>
            {m.skills.cancel || "取消"}
          </button>
        </div>
      </div>
    );
  }

  // ── 主列表视图 ──
  const tabLabel = (t) => {
    if (t === "all") return `${navLabel || m.nav.skills} (${totalCount})`;
    if (t === "enabled") return `${lang === "en" ? "Enabled" : "正在使用"} (${enabledCount})`;
    if (t === "disabled") return `${lang === "en" ? "Disabled" : "未使用"} (${disabledCount})`;
    return t;
  };

  return (
    <div className="space-y-5">
      {/* 工具栏 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" strokeWidth={1.5} />
          <input className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-300 focus:border-gray-300 focus:bg-white transition-colors"
            placeholder={m.skills.searchPlaceholder || "搜索技能"} value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <button className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors" type="button" onClick={(e) => { e.stopPropagation(); openEditor(null); }}>
          <Plus size={15} strokeWidth={2} />
          <span>{m.skills.add || "添加技能"}</span>
        </button>
        <button className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-500 hover:border-gray-300 hover:bg-gray-50 transition-colors" type="button" onClick={(e) => { e.stopPropagation(); setImportMode(true); setImportUrl(""); setEditingSkill(null); setForm({ name: "", type: "llm" }); setShowEditor(true); }}>
          <Search size={14} strokeWidth={1.5} />
          <span>{lang === "en" ? "Import" : "导入"}</span>
        </button>
      </div>

      {/* 状态标签栏 */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {["all", "enabled", "disabled"].map((t) => (
          <button key={t}
            className={"px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap " + (activeTab === t ? "bg-gray-800 text-white font-medium" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
            onClick={() => setActiveTab(t)}>
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {/* 卡片网格 */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-10 text-center">
          <Puzzle size={36} className="mx-auto mb-3 text-gray-200" strokeWidth={1} />
          <p className="text-sm text-gray-400">{searchQuery ? (m.skills.searchEmpty || "无匹配技能") : (m.skills.empty || "暂无技能")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((skill) => {
            const sName = lang === "en" ? skill.nameEn || skill.name : skill.name;
            const sDesc = lang === "en" ? skill.descriptionEn || skill.description : skill.description;
            const sType = skill.type === "image" ? m.skills.typeImage : m.skills.typeLlm;
            const isBuiltin = skill.builtin;
            const enabled = skill.enabled !== false;
            return (
              <div key={skill.id}
                className="group rounded-xl border border-gray-100 bg-white p-4 hover:shadow-sm hover:border-gray-200 transition-all cursor-pointer"
                onClick={() => openEditor(skill)}>
                {/* 头部 */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 flex items-center justify-center shrink-0 text-lg">🧩</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-800 truncate">{sName}</span>
                      <button type="button" role="switch" aria-checked={enabled}
                        className={"relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors " + (enabled ? "theme-bg" : "bg-gray-200")}
                        onClick={(e) => { e.stopPropagation(); onSkillsChange(skills.map((s) => s.id === skill.id ? { ...s, enabled: !enabled } : s)); }}>
                        <span className={"inline-block h-3 w-3 transform rounded-full bg-white transition-transform " + (enabled ? "translate-x-[14px]" : "translate-x-[2px]")} />
                      </button>
                    </div>
                  </div>
                </div>
                {/* 描述 */}
                {sDesc && <p className="mt-3 text-xs text-gray-400 leading-relaxed line-clamp-2">{sDesc}</p>}
                {/* 底部 */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{sType}</span>
                    {isBuiltin && <span className="rounded-md bg-gray-50 px-2 py-0.5 text-[11px] text-gray-400">{m.skills.builtin}</span>}
                  </div>
                  <button className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" type="button"
                    onClick={(e) => { e.stopPropagation(); if (!isBuiltin && window.confirm((m.skills.deleteConfirm || "").replace("{name}", sName))) onSkillsChange(skills.filter((s) => s.id !== skill.id)); }}
                    title={m.skills.delete}>
                    <MoreHorizontal size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 账单组件 ────────────────────────────────────────
function BillingPage({ m, lang }) {
  const [stats, setStats] = useState(getUsageStats);
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = stats.daily?.[today] || {};
  const totalRequests = (stats.llmCalls || 0) + (stats.imageGenerations || 0) + (stats.visionReviews || 0);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">{m.billing.title}</h3>
        <p className="text-xs text-gray-400 mb-4">{m.billing.desc}</p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{m.billing.totalRequests}</p>
            <p className="text-2xl font-semibold text-gray-800">{totalRequests}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{m.billing.tokensUsed}</p>
            <p className="text-2xl font-semibold text-gray-800">{stats.llmCalls || 0}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">{m.billing.imagesGenerated}</p>
            <p className="text-2xl font-semibold text-gray-800">{stats.imageGenerations || 0}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">{lang === "en" ? "Today" : "今日"}</p>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div><span className="text-gray-400">{m.billing.totalRequests}：</span>
              <span className="font-semibold text-gray-800">{(todayStats.llmCalls || 0) + (todayStats.imageGenerations || 0) + (todayStats.visionReviews || 0)}</span></div>
            <div><span className="text-gray-400">LLM：</span>
              <span className="font-semibold text-gray-800">{todayStats.llmCalls || 0}</span></div>
            <div><span className="text-gray-400">{m.billing.imagesGenerated}：</span>
              <span className="font-semibold text-gray-800">{todayStats.imageGenerations || 0}</span></div>
          </div>
        </div>

        <button className="mt-4 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors" type="button"
          onClick={() => { if (window.confirm(lang === "en" ? "Reset usage stats?" : "重置使用统计？")) { resetUsage(); setStats(getUsageStats()); } }}>
          <Trash2 size={14} strokeWidth={1.5} className="inline mr-1.5" />
          {lang === "en" ? "Reset Stats" : "重置统计"}
        </button>
      </section>
    </div>
  );
}

// ─── 设置弹窗 ─────────────────────────────────────────
function SettingsModal({
  copy,
  config,
  onConfigChange,
  language,
  onLanguageChange,
  themeStyle,
  onThemeStyleChange,
  themeMode,
  onThemeModeChange,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
  skills,
  onSkillsChange,
  onClose,
}) {
  const [navTab, setNavTab] = useState("general");
  const modalRef = useRef(null);
  const lang = language === "en" ? "en" : "zh";
  const m = copy.modal;

  useEffect(() => {
    // 弹窗打开时自动聚焦，使 Escape 键可工作
    modalRef.current?.focus();
  }, []);

  // ─── 通用页面 ──────────────────────────────────────
  function GeneralPage() {
    return (
      <div className="space-y-8">
        {/* 主题切换 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{m.general.theme}</h3>
          <p className="text-xs text-gray-400 mb-4">{m.general.themeDesc}</p>
          <div className="flex gap-3">
            {["light", "dark"].map((mode) => {
              const Icon = mode === "light" ? Sun : Moon;
              const isActive = themeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  className={
                    "flex items-center gap-2 rounded-xl border-2 px-5 py-3 text-sm transition-all " +
                    (isActive
                      ? "theme-border bg-gray-50 text-gray-900 font-medium"
                      : "border-gray-100 bg-white text-gray-400 hover:border-gray-200")
                  }
                  onClick={() => onThemeModeChange(mode)}
                >
                  <Icon size={18} strokeWidth={1.5} />
                  {mode === "light" ? m.general.light : m.general.dark}
                </button>
              );
            })}
          </div>
        </section>

        {/* 主题风格卡片 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{m.general.themeStyle}</h3>
          <p className="text-xs text-gray-400 mb-4">{m.general.themeStyleDesc}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {THEME_STYLES.map((style) => {
              const isActive = themeStyle === style.id;
              const label = lang === "en" ? style.labelEn : style.label;
              const desc = lang === "en" ? style.descEn : style.desc;
              return (
                <button
                  key={style.id}
                  type="button"
                  className={
                    "rounded-xl border-2 p-4 text-left transition-all " +
                    (isActive
                      ? "theme-border bg-gray-50 shadow-sm"
                      : "border-gray-100 bg-white hover:border-gray-200")
                  }
                  onClick={() => onThemeStyleChange(style.id)}
                >
                  <div
                    className="h-10 w-full rounded-lg mb-3"
                    style={{ backgroundColor: style.color }}
                  />
                  <div className="text-sm font-medium text-gray-800">{label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 字体大小 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{m.general.fontSize}</h3>
          <p className="text-xs text-gray-400 mb-4">{m.general.fontSizeDesc}</p>
          <ButtonGroup
            options={FONT_SIZE_OPTIONS.map((o) => ({
              ...o,
              label: lang === "en" ? o.labelEn : o.label,
            }))}
            value={fontSize}
            onChange={onFontSizeChange}
          />
        </section>

        {/* 字体 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{m.general.fontFamily}</h3>
          <p className="text-xs text-gray-400 mb-4">{m.general.fontFamilyDesc}</p>
          <ButtonGroup
            options={FONT_FAMILY_OPTIONS.map((o) => ({
              ...o,
              label: lang === "en" ? o.labelEn : o.label,
            }))}
            value={fontFamily}
            onChange={onFontFamilyChange}
          />
        </section>

        {/* 语言 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{m.general.language}</h3>
          <p className="text-xs text-gray-400 mb-4">{m.general.languageDesc}</p>
          <ButtonGroup
            options={[
              { id: "zh", label: "中文" },
              { id: "en", label: "English" },
            ]}
            value={language}
            onChange={onLanguageChange}
          />
        </section>
      </div>
    );
  }

  // ─── 模型页面 ──────────────────────────────────────
  function ModelsPage() {
    return (
      <div className="space-y-8">
        <section>
          {/* Agent 模式切换 */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{lang === "en" ? "Agent Mode" : "运行模式"}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {config.agentMode === "agent"
                  ? (lang === "en" ? "AI Agent with tools (search, calculator, skills, image gen). Only API1 required." : "AI Agent：支持联网搜索、计算器、技能调用、生图等工具")
                  : (lang === "en" ? "Image generation + vision review pipeline" : "生图模式：翻译 → 生图 → 视觉审核流水线")}
              </p>
            </div>
            <button
              type="button" role="switch"
              aria-checked={config.agentMode === "agent"}
              className={"relative inline-flex h-5 w-9 items-center rounded-full transition-colors " + (config.agentMode === "agent" ? "theme-bg" : "bg-gray-200")}
              onClick={() => onConfigChange({ ...config, agentMode: config.agentMode === "agent" ? "image" : "agent" })}
            >
              <span className={"inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform " + (config.agentMode === "agent" ? "translate-x-[18px]" : "translate-x-[3px]")} />
            </button>
          </div>

          <h3 className="text-sm font-semibold text-gray-800 mb-3">{m.models.api}</h3>
          <ConfigPanel
            config={config}
            copy={copy}
            onChange={onConfigChange}
            onlyGroups={config.agentMode === "agent" ? ["api1"] : null}
            defaultOpen
          />
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">{m.models.generation}</h3>
          <div className="grid gap-5">
            {/* Max Retry */}
            <div>
              <label className="flex items-center justify-between text-sm">
                <span className="text-gray-700 font-medium">{copy.settings.maxRetry}</span>
                <input
                  type="number" min={0} max={30}
                  value={config.maxRetry}
                  onChange={(e) => onConfigChange({ ...config, maxRetry: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
                  className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 text-center outline-none focus:border-gray-900"
                />
              </label>
              <p className="mt-1 text-xs text-gray-400">{copy.settings.maxRetryDesc}</p>
            </div>
            {/* Token Limit */}
            <div>
              <label className="flex items-center justify-between text-sm">
                <span className="text-gray-700 font-medium">{copy.settings.maxTokens}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={2048}
                    value={config.maxTokens}
                    onChange={(e) => onConfigChange({ ...config, maxTokens: Math.max(0, Math.min(2048, Number(e.target.value) || 0)) })}
                    className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 text-center outline-none focus:border-gray-900"
                  />
                  <span className="text-xs text-gray-400 w-12">
                    {config.maxTokens === 0 ? copy.settings.unlimited : ""}
                  </span>
                </div>
              </label>
              <p className="mt-1 text-xs text-gray-400">{copy.settings.maxTokensDesc}</p>
            </div>
            {/* Require Confirmation */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-700 font-medium">{copy.settings.requireConfirmation}</span>
                <p className="text-xs text-gray-400">{copy.settings.requireConfirmationDesc}</p>
              </div>
              <button
                type="button" role="switch" aria-checked={config.requireConfirmation}
                className={
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " +
                  (config.requireConfirmation ? "theme-bg" : "bg-gray-200")
                }
                onClick={() => onConfigChange({ ...config, requireConfirmation: !config.requireConfirmation })}
              >
                <span
                  className={
                    "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform " +
                    (config.requireConfirmation ? "translate-x-[18px]" : "translate-x-[3px]")
                  }
                />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">{m.models.pipeline}</h3>
          <div className="grid gap-5">
            {/* Temperature */}
            <div>
              <label className="flex items-center justify-between text-sm">
                <span className="text-gray-700 font-medium">{copy.settings.temperature}</span>
                <input
                  type="number" min={0} max={2} step={0.1}
                  value={config.temperature}
                  onChange={(e) => onConfigChange({ ...config, temperature: Math.min(2, Math.max(0, parseFloat(e.target.value) || 0.7)) })}
                  className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 text-center outline-none focus:border-gray-900"
                />
              </label>
              <p className="mt-1 text-xs text-gray-400">{copy.settings.temperatureDesc}</p>
            </div>
            {/* Vision Review */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-700 font-medium">{copy.settings.enableVisionReview}</span>
                <p className="text-xs text-gray-400">{copy.settings.enableVisionReviewDesc}</p>
              </div>
              <button
                type="button" role="switch" aria-checked={config.enableVisionReview !== false}
                className={
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors " +
                  (config.enableVisionReview !== false ? "theme-bg" : "bg-gray-200")
                }
                onClick={() => onConfigChange({ ...config, enableVisionReview: !config.enableVisionReview })}
              >
                <span
                  className={
                    "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform " +
                    (config.enableVisionReview !== false ? "translate-x-[18px]" : "translate-x-[3px]")
                  }
                />
              </button>
            </div>
            {/* Default Aspect Ratio & Style */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="text-gray-700 font-medium mb-1 block">{copy.settings.defaultAspectRatio}</span>
                <select
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
                  value={config.defaultAspectRatio}
                  onChange={(e) => onConfigChange({ ...config, defaultAspectRatio: e.target.value })}
                >
                  {["1:1", "16:9", "9:16", "4:3"].map((r) => (<option key={r} value={r}>{r}</option>))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-700 font-medium mb-1 block">{copy.settings.defaultStyle}</span>
                <select
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
                  value={config.defaultStyle}
                  onChange={(e) => onConfigChange({ ...config, defaultStyle: e.target.value })}
                >
                  {["None", "Realistic", "Anime", "3D", "Cyberpunk", "Oil Painting", "Watercolor", "Pixel Art", "Cinematic", "Sketch"].map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </label>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ─── 数据页面 ──────────────────────────────────────
  function DataPage() {
    const [todayImages, setTodayImages] = useState(() => {
      try {
        const saved = localStorage.getItem("memi-generation-history");
        if (!saved) return 0;
        const history = JSON.parse(saved);
        if (!Array.isArray(history)) return 0;
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        return history.filter((item) => {
          const t = new Date(item.createdAt).getTime();
          return t >= startOfDay && t < startOfDay + 86400000;
        }).length;
      } catch { return 0; }
    });

    const IMAGES_PER_PERCENT = 5;
    const raw = todayImages / IMAGES_PER_PERCENT;
    const percent = Math.min(Math.round(raw * 10) / 10, 100);

    return (
      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">{m.data.usage}</h3>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-500">{copy.settings.usageDesc.replace("{count}", todayImages)}</span>
            <span className="text-gray-400 text-xs">{percent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full theme-bg transition-all duration-500" style={{ width: percent + "%" }} />
          </div>
          <p className="mt-1 text-xs text-gray-300">1% = {IMAGES_PER_PERCENT} {copy.settings.imagesToday}</p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">{m.data.maxHistory}</h3>
          <label className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{copy.settings.maxHistoryItems}</span>
            <input
              type="number" min={1} max={200}
              value={config.maxHistoryItems}
              onChange={(e) => onConfigChange({ ...config, maxHistoryItems: Math.max(1, Math.min(200, Number(e.target.value) || 24)) })}
              className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 text-center outline-none focus:border-gray-900"
            />
          </label>
          <p className="mt-1 text-xs text-gray-400">{copy.settings.maxHistoryItemsDesc}</p>
        </section>

        <section>
          <button
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-gray-500 hover:text-gray-800 transition-colors"
            type="button"
            onClick={() => {
              if (window.confirm(copy.gallery.confirmClear || "确定要清空所有历史记录吗？")) {
                localStorage.removeItem("memi-generation-history");
                window.dispatchEvent(new Event("memi-history-cleared"));
                setTodayImages(0);
              }
            }}
          >
            <Trash2 size={14} strokeWidth={1.5} />
            {m.data.clear}
          </button>
        </section>
      </div>
    );
  }

  // ─── 记忆页面 ──────────────────────────────────────
  function MemoryPage() {
    return (
      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{m.memory.title}</h3>
          <p className="text-xs text-gray-400 mb-4">{m.memory.desc}</p>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-8 text-center">
            <BrainCircuit size={36} className="mx-auto mb-3 text-gray-200" strokeWidth={1} />
            <p className="text-sm text-gray-400">{m.memory.empty}</p>
          </div>
        </section>
      </div>
    );
  }

  // ─── 快捷键页面 ────────────────────────────────────
  function ShortcutsPage() {
    const shortcuts = m.shortcuts.list || [];
    return (
      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{m.shortcuts.title}</h3>
          <p className="text-xs text-gray-400 mb-4">{m.shortcuts.desc}</p>
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {shortcuts.map((item, i) => (
              <div
                key={i}
                className={"flex items-center justify-between px-5 py-3 text-sm " + (i < shortcuts.length - 1 ? "border-b border-gray-50" : "")}
              >
                <span className="text-gray-600">{item.action}</span>
                <kbd className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-mono text-gray-500 shadow-sm">
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // ─── 连接应用页面 ────────────────────────────────
  function ConnectionsPage({ m, lang }) {
    const [connections, setConnections] = useState([]);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState("");
    const [newChannel, setNewChannel] = useState("webhook");
    const [copiedField, setCopiedField] = useState("");
    const [openclawLog, setOpenclawLog] = useState("");
    const [openclawQr, setOpenclawQr] = useState("");
    const [openclawDone, setOpenclawDone] = useState(false);
    const [feishuAppId, setFeishuAppId] = useState("");
    const [feishuAppSecret, setFeishuAppSecret] = useState("");

    // 从服务端加载连接列表
    async function refresh() {
      try {
        const r = await fetch("/api/gateway/connections");
        const d = await r.json();
        if (d.success) setConnections(d.connections || []);
      } catch { /* 离线时从 localStorage 读取 */ }
    }

    function loadLocal() {
      try { return JSON.parse(localStorage.getItem("memi-connections") || "[]"); } catch { return []; }
    }

    function saveLocal(conns) {
      localStorage.setItem("memi-connections", JSON.stringify(conns));
      setConnections(conns);
    }

    useEffect(() => { refresh(); }, []);

    async function addConnection() {
      if (!newName.trim()) return;
      try {
        const r = await fetch("/api/gateway/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim(), channel: newChannel }),
        });
        const d = await r.json();
        if (d.success) {
          saveLocal([...connections, d.connection]);

          // 飞书渠道：启动长连接
          if (newChannel === "feishu") {
            setNewName(""); setShowAdd(false);
            await fetch("/api/gateway/feishu/connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ appId: feishuAppId, appSecret: feishuAppSecret }),
            });
            setFeishuAppId(""); setFeishuAppSecret("");
            return;
          }

          // OpenClaw 渠道：自动启动微信连接
          if (newChannel === "openclaw") {
            setShowAdd(false);
            setOpenclawLog("");
            setOpenclawQr("");
            setOpenclawDone(false);
            startOpenClaw();
            return;
          }
        }
      } catch {
        const id = "conn_" + Date.now().toString(36);
        const apiKey = "memi_" + Math.random().toString(36).slice(2, 16);
        const conn = {
          id, name: newName.trim(), type: newChannel, apiKey,
          webhookUrl: `http://localhost:3001/api/gateway/webhook`,
          createdAt: new Date().toISOString(),
        };
        saveLocal([...loadLocal(), conn]);
      }
      setNewName("");
      setShowAdd(false);
    }

    async function startOpenClaw() {
      try {
        const r = await fetch("/api/gateway/openclaw/start", { method: "POST" });
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                setOpenclawLog((prev) => prev + "\n" + (data.message || data.text || ""));
                if (data.type === "qr") {
                  setOpenclawQr(data.text || "");
                }
                if (data.type === "done" || data.type === "error" || data.type === "timeout") {
                  setOpenclawDone(true);
                }
              } catch {}
            }
          }
        }
      } catch (e) {
        setOpenclawLog((prev) => prev + "\n连接失败: " + e.message);
        setOpenclawDone(true);
      }
    }

    function deleteConnection(id) {
      const conn = connections.find((c) => c.id === id);
      const name = conn?.name || "";
      if (!window.confirm((m.mcp.deleteConfirm || "").replace("{name}", name))) return;
      fetch(`/api/gateway/connections/${id}`, { method: "DELETE" }).catch(() => {});
      saveLocal(connections.filter((c) => c.id !== id));
    }

    function copyToClip(text, field) {
      navigator.clipboard.writeText(text).catch(() => {});
      setCopiedField(field);
      setTimeout(() => setCopiedField(""), 2000);
    }

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{m.mcp.title}</h3>
          <button
            className="theme-bg rounded-lg px-3 py-1.5 text-sm text-white"
            type="button"
            onClick={() => setShowAdd(true)}
          >
            + {m.mcp.add}
          </button>
        </div>

        {showAdd && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm outline-none"
                placeholder={m.mcp.namePlaceholder || "输入连接名称"}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addConnection(); if (e.key === "Escape") setShowAdd(false); }}
              />
              <select
                className="rounded-md border border-gray-200 px-3 py-2 text-sm outline-none bg-white"
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
              >
                <option value="feishu">飞书</option>
                <option value="openclaw">微信 (OpenClaw)</option>
                <option value="webhook">Webhook</option>
                <option value="qq">QQ 桥接</option>
              </select>
            </div>
            {newChannel === "feishu" && (
              <>
                <input className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none" placeholder="App ID (cli_xxx)" value={feishuAppId} onChange={(e) => setFeishuAppId(e.target.value)} />
                <input className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none" placeholder="App Secret" type="password" value={feishuAppSecret} onChange={(e) => setFeishuAppSecret(e.target.value)} />
                <p className="text-xs text-gray-400">登录 <a href="https://open.feishu.cn" target="_blank" className="underline">open.feishu.cn</a> 创建自建应用 → 开通机器人能力 → 获取凭证</p>
              </>
            )}
            <div className="flex items-center gap-2">
              <button className="theme-bg rounded-md px-4 py-2 text-sm text-white" onClick={addConnection}>
                {m.skills?.save || "保存"}
              </button>
              <button className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-500" onClick={() => { setShowAdd(false); setFeishuAppId(""); setFeishuAppSecret(""); }}>
                {m.skills?.cancel || "取消"}
              </button>
            </div>
          </div>
        )}

        {/* OpenClaw 连接状态 */}
        {(openclawLog || openclawQr) && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700 mb-2">
              {openclawDone ? (openclawQr ? "✅ 连接完成" : "⚠️ 连接结束") : "🔄 正在连接微信..."}
            </p>
            <pre className="text-xs text-green-600 whitespace-pre-wrap max-h-48 overflow-y-auto bg-green-100 rounded p-3">
              {openclawLog}
            </pre>
            {openclawQr && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-green-200">
                <p className="text-xs font-medium text-green-800 mb-2">📱 请在微信中扫描下面的二维码：</p>
                <pre className="text-xs text-green-700 whitespace-pre font-mono overflow-x-auto">{openclawQr}</pre>
              </div>
            )}
            {openclawDone && (
              <button className="mt-3 text-xs text-green-600 underline" onClick={() => { setOpenclawLog(""); setOpenclawQr(""); setOpenclawDone(false); }}>
                {lang === "en" ? "Dismiss" : "关闭"}
              </button>
            )}
          </div>
        )}

        {connections.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-10 text-center">
            <Link2 size={36} className="mx-auto mb-3 text-gray-200" strokeWidth={1} />
            <p className="text-sm text-gray-400">{m.mcp.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => (
              <div key={conn.id} className="rounded-xl border border-gray-100 bg-white p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{conn.name}</span>
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{conn.type}</span>
                  </div>
                  <button
                    className="text-gray-300 hover:text-red-400 transition-colors"
                    onClick={() => deleteConnection(conn.id)}
                    title={m.skills?.delete || "删除"}
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  {/* OpenClaw 微信接入 */}
                  {conn.type === "openclaw" ? (
                    <div className="rounded-md bg-green-50 border border-green-100 p-3">
                      <p className="text-xs text-green-700 font-medium mb-2">💬 {lang === "en" ? "WeChat Connection" : "微信连接"}</p>
                      <p className="text-xs text-green-600 mb-1">1. 终端运行（会生成微信登录二维码）：</p>
                      <code className="block text-xs text-green-700 bg-green-100 rounded px-2 py-1 mb-2 break-all">npx -y @tencent-weixin/openclaw-weixin-cli@latest install</code>
                      <p className="text-xs text-green-600 mb-1">2. 微信扫终端里出现的二维码授权</p>
                      <p className="text-xs text-green-600 mb-1">3. 配置 OpenClaw 使用下面的 API 地址：</p>
                      <code className="block text-xs text-green-700 bg-green-100 rounded px-2 py-1 break-all">http://localhost:3001/api/v1</code>
                    </div>
                  ) : (
                    /* Webhook 聊天入口 */
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-20">{m.mcp.webhookUrl}</span>
                      <code className="flex-1 truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">{conn.webhookUrl}</code>
                      <button className="text-gray-300 hover:text-gray-500" onClick={() => copyToClip(conn.webhookUrl, conn.id + "_url")}>
                        {copiedField === conn.id + "_url" ? <span className="text-xs text-green-500">{m.mcp.copied}</span> : <Copy size={14} strokeWidth={1.5} />}
                      </button>
                    </div>
                  )}

                  {/* API 地址（所有渠道通用） */}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-20">API Base URL</span>
                    <code className="flex-1 truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">http://localhost:3001/api/v1</code>
                    <button
                      className="text-gray-300 hover:text-gray-500"
                      onClick={() => copyToClip("http://localhost:3001/api/v1", conn.id + "_api")}
                    >
                      {copiedField === conn.id + "_api" ? <span className="text-xs text-green-500">{m.mcp.copied}</span> : <Copy size={14} strokeWidth={1.5} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-20">{m.mcp.apiKey}</span>
                    <code className="flex-1 truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">{conn.apiKey}</code>
                    <button
                      className="text-gray-300 hover:text-gray-500"
                      onClick={() => copyToClip(conn.apiKey, conn.id + "_key")}
                    >
                      {copiedField === conn.id + "_key" ? <span className="text-xs text-green-500">{m.mcp.copied}</span> : <Copy size={14} strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* 说明 */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mt-4">
              <p className="text-xs text-gray-400">
                {lang === "en"
                  ? "Memi provides an OpenAI-compatible API at /api/v1. Any OpenAI-compatible client (OpenClaw, custom bot, etc.) can use this as the LLM backend."
                  : "Memi 提供 OpenAI 兼容的 /api/v1 接口。任何兼容 OpenAI 的客户端都可将其作为 LLM 后端使用。"}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── 占位页面 ──────────────────────────────────────
  function PlaceholderPage({ title, message }) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-300">
        <p className="text-sm">{message}</p>
      </div>
    );
  }

  // ─── 导航配置 ──────────────────────────────────────
  const navItems = [
    { id: "general", icon: SunMoon, label: m.nav.general },
    { id: "models", icon: Cpu, label: m.nav.models },
    { id: "memory", icon: BrainCircuit, label: m.nav.memory },
    { id: "billing", icon: CreditCard, label: m.nav.billing },
    { id: "shortcuts", icon: Keyboard, label: m.nav.shortcuts },
    { id: "mcp", icon: Server, label: m.nav.mcp },
    { id: "skills", icon: Puzzle, label: m.nav.skills },
    { id: "data", icon: Database, label: m.nav.data },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      tabIndex={-1}
      ref={modalRef}
    >
      <div className="flex w-full max-w-4xl h-[80vh] mx-4 rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
        {/* ─── 左侧导航 ──────────────────────────────── */}
        <nav className="w-52 shrink-0 bg-gray-50 p-4 flex flex-col gap-1 border-r border-gray-100">
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-sm font-semibold text-gray-700">{m.title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-300 hover:text-gray-500 transition-colors"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = navTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors " +
                  (isActive
                    ? "theme-bg text-white font-medium"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")
                }
                onClick={() => setNavTab(item.id)}
              >
                <Icon size={16} strokeWidth={1.5} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* ─── 右侧内容 ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {navTab === "general" && <GeneralPage />}
          {navTab === "models" && <ModelsPage />}
          {navTab === "memory" && <MemoryPage />}
        {navTab === "billing" && <BillingPage m={m} lang={lang} />}
        {navTab === "shortcuts" && <ShortcutsPage />}
        {navTab === "mcp" && <ConnectionsPage m={m} lang={lang} />}
        {navTab === "skills" && (
          <SkillsPage
            m={m}
            lang={lang}
            skills={skills}
            onSkillsChange={onSkillsChange}
            navLabel={m.nav.skills}
          />
        )}
        {navTab === "data" && <DataPage />}
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;

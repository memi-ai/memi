import { useEffect, useMemo, useState } from "react";
import {
  Images,
  MessageCircle,
  Plus,
  Settings,
  Trash2,
  X,
  MessageSquare,
} from "lucide-react";
import ChatPage from "./pages/ChatPage.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import { DEFAULT_CONFIG, DEFAULT_SKILLS, THEME_STYLES } from "./defaults.js";
import { COPY } from "./i18n.js";

const NAV_ITEMS = [
  { id: "chat", icon: MessageCircle },
  { id: "gallery", icon: Images },
  { id: "settings", icon: Settings },
];

function genId() {
  return crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function loadLocalValue(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function loadConfig() {
  try {
    const saved = localStorage.getItem("memi-api-config");
    const cfg = saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    if (cfg.maxRetry == null) cfg.maxRetry = DEFAULT_CONFIG.maxRetry;
    if (cfg.requireConfirmation == null) cfg.requireConfirmation = DEFAULT_CONFIG.requireConfirmation;
    if (cfg.maxTokens == null) cfg.maxTokens = DEFAULT_CONFIG.maxTokens;
    return cfg;
  } catch { return { ...DEFAULT_CONFIG }; }
}

function migrateLegacyChat() {
  const legacy = localStorage.getItem("memi-chat-history");
  if (!legacy) return [];
  try {
    const msgs = JSON.parse(legacy);
    localStorage.removeItem("memi-chat-history");
    if (!Array.isArray(msgs) || msgs.length === 0) return [];
    return [{
      id: genId(),
      title: msgs[0]?.content ? (msgs[0].content.slice(0, 28) + (msgs[0].content.length > 28 ? "…" : "")) : "新对话",
      messages: msgs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
  } catch { return []; }
}

function loadConversations() {
  try {
    const saved = localStorage.getItem("memi-conversations");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return migrateLegacyChat();
}

function loadActiveId(convs) {
  try {
    const saved = localStorage.getItem("memi-active-conversation");
    if (saved && convs.some((c) => c.id === saved)) return saved;
  } catch {}
  return convs[0]?.id || null;
}

function persistConversations(convs) {
  try { localStorage.setItem("memi-conversations", JSON.stringify(convs)); } catch (e) { console.warn("Failed to persist conversations", e); }
}

function persistActiveId(id) {
  try { localStorage.setItem("memi-active-conversation", id); } catch {}
}

function loadSkills() {
  try {
    const saved = localStorage.getItem("memi-skills");
    if (saved) return JSON.parse(saved);
  } catch {}
  // 首次使用写入内置技能
  localStorage.setItem("memi-skills", JSON.stringify(DEFAULT_SKILLS));
  return DEFAULT_SKILLS;
}

function App() {
  const [activePage, setActivePage] = useState("chat");
  const [language, setLanguage] = useState(() => loadLocalValue("memi-language", "zh"));
  const [themeStyle, setThemeStyle] = useState(() => loadLocalValue("memi-theme-style", "sandstone"));
  const [themeMode, setThemeMode] = useState(() => loadLocalValue("memi-theme-mode", "light"));
  const [config, setConfig] = useState(loadConfig);
  const [conversations, setConversations] = useState(loadConversations);
  const [activeConvId, setActiveConvId] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => loadLocalValue("memi-onboarded", "") === "");
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [skills, setSkills] = useState(loadSkills);

  const copy = COPY[language] || COPY.zh;
  const theme = useMemo(() => THEME_STYLES.find((s) => s.id === themeStyle) || THEME_STYLES[0], [themeStyle]);

  useEffect(() => { localStorage.setItem("memi-api-config", JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem("memi-language", language); }, [language]);
  useEffect(() => { localStorage.setItem("memi-theme-style", themeStyle); }, [themeStyle]);
  useEffect(() => { localStorage.setItem("memi-theme-mode", themeMode); }, [themeMode]);
  useEffect(() => { localStorage.setItem("memi-skills", JSON.stringify(skills)); }, [skills]);

  // 监听 Agent 在 ChatPage 中创建/导入的技能
  useEffect(() => {
    function handler() { setSkills(loadSkills()); }
    window.addEventListener("memi-skills-changed", handler);
    return () => window.removeEventListener("memi-skills-changed", handler);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--theme-color", theme.color);
    document.documentElement.style.setProperty("--theme-hover", theme.hover);
    document.documentElement.dataset.theme = themeMode;
  }, [theme, themeMode]);
  useEffect(() => {
    if (!activeConvId && conversations.length > 0) {
      const id = loadActiveId(conversations);
      setActiveConvId(id);
      if (id) persistActiveId(id);
    }
  }, [conversations]);
  useEffect(() => { if (activeConvId) persistActiveId(activeConvId); }, [activeConvId]);

  function handleConfigChange(newConfig) { setConfig(newConfig); }

  function updateConv(convId, updater) {
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === convId ? updater(c) : c));
      persistConversations(next);
      return next;
    });
  }

  function newChat() {
    const conv = { id: genId(), title: "新对话", messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setConversations((prev) => { const next = [conv, ...prev]; persistConversations(next); return next; });
    setActiveConvId(conv.id);
  }

  function createConv(text) {
    const conv = { id: genId(), title: text.length > 28 ? text.slice(0, 28) + "…" : text, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setConversations((prev) => { const next = [conv, ...prev]; persistConversations(next); return next; });
    setActiveConvId(conv.id);
    persistActiveId(conv.id);
    return conv.id;
  }

  function switchConversation(id) { setActiveConvId(id); }

  function deleteConversation(id, e) {
    e.stopPropagation();
    const remaining = conversations.filter((c) => c.id !== id);
    if (remaining.length === 0) { setConversations([]); persistConversations([]); setActiveConvId(null); return; }
    setConversations(remaining);
    persistConversations(remaining);
    if (id === activeConvId) {
      const nextId = remaining[0]?.id || null;
      setActiveConvId(nextId);
      if (nextId) persistActiveId(nextId);
    }
  }

  function dismissOnboarding() {
    setShowOnboarding(false);
    setOnboardingStep(0);
    try { localStorage.setItem("memi-onboarded", "1"); } catch {}
  }

  function nextOnboardingStep() {
    const steps = copy.onboarding.multiSteps;
    if (onboardingStep < steps.length - 1) {
      setOnboardingStep((s) => s + 1);
    }
  }

  function prevOnboardingStep() {
    if (onboardingStep > 0) {
      setOnboardingStep((s) => s - 1);
    }
  }

  function goToSettings() {
    dismissOnboarding();
    setShowSettings(true);
  }

  return (
    <div className="h-screen bg-white text-gray-900 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col h-full border-r border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-gray-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg theme-bg">
            <MessageCircle size={16} className="text-white" />
          </div>
          <span className="font-semibold text-sm">memi</span>
        </div>

        <div className="px-3 pt-3 pb-2">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            type="button"
            onClick={newChat}
          >
            <Plus size={16} strokeWidth={1.5} />
            <span>{copy.chat.newChat}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-gray-300 text-center pt-8">{copy.chat.placeholder}</p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={"group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors " + (conv.id === activeConvId ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:bg-white hover:text-gray-700")}
              onClick={() => switchConversation(conv.id)}
            >
              <MessageSquare size={14} strokeWidth={1.5} className="flex-shrink-0 text-gray-300" />
              <span className="truncate flex-1">{conv.title}</span>
              <button
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 transition-all"
                onClick={(e) => deleteConversation(conv.id, e)}
                type="button"
                title={copy.chat.deleteChat}
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>

        <nav className="flex-shrink-0 border-t border-gray-100 px-3 py-3 flex items-center justify-around">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id || (item.id === "chat" && activePage === "chat");
            return (
              <button
                key={item.id}
                className={"flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition " + (isActive ? "theme-bg text-white" : "text-gray-400 hover:text-gray-600")}
                type="button"
                onClick={() => item.id === "settings" ? setShowSettings(true) : setActivePage(item.id)}
              >
                <Icon size={16} strokeWidth={1.5} />
                <span>{copy.nav[item.id]}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {activePage === "chat" && (
          <ChatPage
            copy={copy}
            config={config}
            skills={skills}
            onConfigChange={handleConfigChange}
            conversations={conversations}
            activeConvId={activeConvId}
            updateConv={updateConv}
            createConv={createConv}
          />
        )}
        {activePage === "studio" && null}
        {activePage === "gallery" && (
          <GalleryPage copy={copy} onNavigate={setActivePage} />
        )}
        {activePage === "settings" && null}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          copy={copy}
          config={config}
          onConfigChange={handleConfigChange}
          language={language}
          onLanguageChange={setLanguage}
          themeStyle={themeStyle}
          onThemeStyleChange={setThemeStyle}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          fontSize={"medium"}
          onFontSizeChange={() => {}}
          fontFamily={"sans"}
          onFontFamilyChange={() => {}}
          skills={skills}
          onSkillsChange={setSkills}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Onboarding multi-step dialog */}
      {showOnboarding && (() => {
        const steps = copy.onboarding.multiSteps;
        const step = steps[onboardingStep];
        const isFirst = onboardingStep === 0;
        const isLast = onboardingStep === steps.length - 1;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="w-full max-w-md mx-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg theme-bg">
                    <MessageCircle size={16} className="text-white" />
                  </div>
                  <span className="font-semibold">memi</span>
                </div>
                <button type="button" onClick={dismissOnboarding} className="text-gray-300 hover:text-gray-500 transition-colors">
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>

              {/* Progress bar */}
              <div className="flex gap-1 mb-5">
                {steps.map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= onboardingStep ? "theme-bg" : "bg-gray-100"}`} />
                ))}
              </div>

              {/* Step content */}
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full theme-bg text-white text-sm font-semibold">
                  {onboardingStep + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-gray-900 mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.body}</p>
                  {/* Inline API config for step 1 */}
                  {onboardingStep === 1 && (
                    <div className="mt-4 space-y-3 max-h-56 overflow-y-auto">
                      {["api1", "api2", "api3"].map((group) => (
                        <div key={group} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700">{copy.config.labels[group]}</span>
                            <span className="text-xs text-gray-400">{config[group].model || "—"}</span>
                          </div>
                          {["baseUrl", "apiKey", "model"].map((field) => (
                            <label key={field} className="flex items-center gap-2 text-xs text-gray-500 mb-1.5 last:mb-0">
                              <span className="w-14 shrink-0">{field}</span>
                              <input
                                className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-gray-400 transition-colors"
                                value={config[group][field]}
                                type={field === "apiKey" ? "password" : "text"}
                                onChange={(e) => handleConfigChange({
                                  ...config,
                                  [group]: { ...config[group], [field]: e.target.value },
                                })}
                              />
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between">
                <div>
                  {!isFirst && (
                    <button
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                      type="button"
                      onClick={prevOnboardingStep}
                    >
                      {copy.onboarding.prev}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isLast ? (
                    <>
                      <button
                        className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                        type="button"
                        onClick={dismissOnboarding}
                      >
                        {copy.onboarding.skip}
                      </button>
                      <button
                        className="rounded-lg theme-bg text-white px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                        type="button"
                        onClick={nextOnboardingStep}
                      >
                        {copy.onboarding.next}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                        type="button"
                        onClick={dismissOnboarding}
                      >
                        {copy.onboarding.start}
                      </button>
                      <button
                        className="rounded-lg theme-bg text-white px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                        type="button"
                        onClick={goToSettings}
                      >
                        {copy.onboarding.settings}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default App;

import { useEffect, useMemo, useState } from "react";
import ConfigPanel from "../components/ConfigPanel.jsx";
import { THEME_OPTIONS } from "../defaults.js";
import { LANGUAGE_OPTIONS } from "../i18n.js";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3"];
const STYLES = ["None", "Realistic", "Anime", "3D", "Cyberpunk", "Oil Painting", "Watercolor", "Pixel Art", "Cinematic", "Sketch"];
const MAX_TOKENS_LIMIT = 2048;
const TEMP_MIN = 0;
const TEMP_MAX = 2;
const TEMP_STEP = 0.1;
const IMAGES_PER_PERCENT = 5;

function calcPercent(count) {
  const raw = count / IMAGES_PER_PERCENT;
  return Math.min(Math.round(raw * 10) / 10, 100);
}

function countTodayImages() {
  try {
    const saved = localStorage.getItem("memi-generation-history");
    if (!saved) return 0;
    const history = JSON.parse(saved);
    if (!Array.isArray(history)) return 0;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + 86400000;
    return history.filter((item) => {
      const t = new Date(item.createdAt).getTime();
      return t >= startOfDay && t < endOfDay;
    }).length;
  } catch {
    return 0;
  }
}

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className={"relative inline-flex h-5 w-9 items-center rounded-full transition-colors " + (value ? "bg-gray-800" : "bg-gray-200")}
      onClick={() => onChange(!value)}
    >
      <span className={"inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform " + (value ? "translate-x-[18px]" : "translate-x-[3px]")} />
    </button>
  );
}

function SettingsPage({
  copy,
  config,
  onConfigChange,
  language,
  onLanguageChange,
  themeId,
  onThemeChange,
}) {
  const [todayImages, setTodayImages] = useState(countTodayImages);
  const percent = calcPercent(todayImages);

  useEffect(() => {
    function handler() { setTodayImages(countTodayImages()); }
    window.addEventListener("memi-history-cleared", handler);
    return () => window.removeEventListener("memi-history-cleared", handler);
  }, []);

  function updateConfig(key, value) {
    onConfigChange({ ...config, [key]: value });
  }

  return (
    <section className="space-y-5 max-w-2xl">
      {/* Appearance */}
      <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">
          {copy.settings.appearance}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-600">
            <span className="mb-1 block">{copy.common.language}</span>
            <select
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
              value={language}
              onChange={(event) => onLanguageChange(event.target.value)}
            >
              {LANGUAGE_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="mb-2 text-sm text-gray-600">{copy.common.theme}</p>
            <div className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map((item) => (
                <button
                  className={"rounded-md border px-3 py-2 text-sm " + (themeId === item.id ? "border-gray-950 bg-gray-50" : "border-gray-300 bg-white")}
                  key={item.id}
                  type="button"
                  onClick={() => onThemeChange(item.id)}
                >
                  <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: item.color }} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* API Configuration */}
      <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">
          {copy.settings.apiTitle}
        </h2>
        <ConfigPanel config={config} copy={copy} onChange={onConfigChange} defaultOpen />
      </section>

      {/* Image Defaults */}
      <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">
          {copy.settings.generationDefaults}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-600">
            <span className="mb-1 block">{copy.settings.defaultAspectRatio}</span>
            <select
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
              value={config.defaultAspectRatio}
              onChange={(e) => updateConfig("defaultAspectRatio", e.target.value)}
            >
              {ASPECT_RATIOS.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
          </label>
          <label className="block text-sm text-gray-600">
            <span className="mb-1 block">{copy.settings.defaultStyle}</span>
            <select
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
              value={config.defaultStyle}
              onChange={(e) => updateConfig("defaultStyle", e.target.value)}
            >
              {STYLES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </label>
        </div>
      </section>

      {/* Generation Settings */}
      <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">
          {copy.settings.generation}
        </h2>
        <div className="space-y-5">
          {/* Max Retry */}
          <div>
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-700 font-medium">{copy.settings.maxRetry}</span>
              <input
                type="number"
                min={0}
                max={30}
                value={config.maxRetry}
                onChange={(e) => updateConfig("maxRetry", Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
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
                  type="number"
                  min={0}
                  max={MAX_TOKENS_LIMIT}
                  value={config.maxTokens}
                  onChange={(e) => updateConfig("maxTokens", Math.max(0, Math.min(MAX_TOKENS_LIMIT, Number(e.target.value) || 0)))}
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
            <Toggle value={config.requireConfirmation} onChange={(v) => updateConfig("requireConfirmation", v)} />
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">
          {copy.settings.pipeline}
        </h2>
        <div className="space-y-5">
          {/* Temperature */}
          <div>
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-700 font-medium">{copy.settings.temperature}</span>
              <input
                type="number"
                min={TEMP_MIN}
                max={TEMP_MAX}
                step={TEMP_STEP}
                value={config.temperature}
                onChange={(e) => updateConfig("temperature", Math.min(TEMP_MAX, Math.max(TEMP_MIN, parseFloat(e.target.value) || 0.7)))}
                className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 text-center outline-none focus:border-gray-900"
              />
            </label>
            <p className="mt-1 text-xs text-gray-400">{copy.settings.temperatureDesc}</p>
          </div>

          {/* Vision Review Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-700 font-medium">{copy.settings.enableVisionReview}</span>
              <p className="text-xs text-gray-400">{copy.settings.enableVisionReviewDesc}</p>
            </div>
            <Toggle value={config.enableVisionReview !== false} onChange={(v) => updateConfig("enableVisionReview", v)} />
          </div>
        </div>
      </section>

      {/* Usage & Data Management */}
      <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-4">
          {copy.settings.dataManagement}
        </h2>
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-gray-500">{copy.settings.usageDesc.replace("{count}", todayImages)}</span>
              <span className="text-gray-400 text-xs">{percent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full theme-bg transition-all duration-500"
                style={{ width: percent + "%" }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-300">1% = {IMAGES_PER_PERCENT} {copy.settings.imagesToday}</p>
          </div>

          {/* Max History Items */}
          <div>
            <label className="flex items-center justify-between text-sm">
              <span className="text-gray-700 font-medium">{copy.settings.maxHistoryItems}</span>
              <input
                type="number"
                min={1}
                max={200}
                value={config.maxHistoryItems}
                onChange={(e) => updateConfig("maxHistoryItems", Math.max(1, Math.min(200, Number(e.target.value) || 24)))}
                className="w-20 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 text-center outline-none focus:border-gray-900"
              />
            </label>
            <p className="mt-1 text-xs text-gray-400">{copy.settings.maxHistoryItemsDesc}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-gray-700 transition-colors"
              type="button"
              onClick={() => {
                if (window.confirm(copy.gallery.confirmClear || "确定要清空所有历史记录吗？")) {
                  localStorage.removeItem("memi-generation-history");
                  window.dispatchEvent(new Event("memi-history-cleared"));
                  setTodayImages(0);
                }
              }}
            >
              {copy.gallery.clear}
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}

export default SettingsPage;

import { useState } from "react";
import ConfigPanel from "../components/ConfigPanel.jsx";
import OnboardingPanel from "../components/OnboardingPanel.jsx";
import PromptInput from "../components/PromptInput.jsx";
import ResultPanel from "../components/ResultPanel.jsx";

function saveHistoryItem(item) {
  try {
    const saved = localStorage.getItem("memi-generation-history");
    const history = saved ? JSON.parse(saved) : [];
    const nextHistory = [item, ...history].slice(0, 24);
    localStorage.setItem("memi-generation-history", JSON.stringify(nextHistory));
  } catch (error) {
    console.warn("历史记录保存失败");
  }
}

function loadOnboardingVisible() {
  try {
    return localStorage.getItem("memi-onboarding-hidden") !== "true";
  } catch (error) {
    return true;
  }
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      response.ok
        ? "后端返回了空响应，请检查 memi-server 是否正常完成生图流程"
        : `后端请求失败：HTTP ${response.status}`
    );
  }

  try {
    const data = JSON.parse(text);

    if (!response.ok) {
      throw new Error(data.error || `后端请求失败：HTTP ${response.status}`);
    }

    return data;
  } catch (parseError) {
    if (parseError.message.startsWith("后端请求失败")) {
      throw parseError;
    }

    throw new Error(
      `后端返回的不是 JSON：${text.slice(0, 180)}${
        text.length > 180 ? "..." : ""
      }`
    );
  }
}

function ImagePage({ copy, onNavigate, config, onConfigChange }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(loadOnboardingVisible);

  async function requestImagePipeline(form) {
    // 通过 Vite 代理转发到后端，避免前端直接处理跨域
    const response = await fetch("/api/pipeline/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify({
        ...config,
        ...form,
      }),
    });

    return readJsonResponse(response);
  }

  function buildResult(data, form) {
    return {
      ...data,
      originalPrompt: form.prompt,
      aspectRatio: form.aspectRatio,
      style: form.style,
    };
  }

  async function handleGenerate(form) {
    setIsLoading(true);
    setIsRetrying(false);
    setError("");
    setResult(null);

    try {
      let data = await requestImagePipeline(form);

      // 生图接口偶发失败时，前端自动重试一次完整流水线
      if (!data.success && data.error?.startsWith("生图:")) {
        setIsRetrying(true);
        data = await requestImagePipeline(form);
      }

      if (!data.success) {
        setError(data.error || copy.errors.generationFailed);
        setResult(buildResult(data, form));
        return;
      }

      const nextResult = buildResult(data, form);

      saveHistoryItem({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        prompt: form.prompt,
        aspectRatio: form.aspectRatio,
        style: form.style,
        ...nextResult,
      });
      setResult(nextResult);
    } catch (requestError) {
      setError(requestError.message || copy.errors.requestFailed);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }

  function hideOnboarding() {
    setShowOnboarding(false);
    localStorage.setItem("memi-onboarding-hidden", "true");
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 2xl:grid-cols-[360px_minmax(0,1fr)_340px]">
        <aside className="space-y-4">
          {showOnboarding ? (
            <OnboardingPanel
              copy={copy}
              onStart={hideOnboarding}
              onSettings={() => onNavigate("settings")}
              onHide={hideOnboarding}
            />
          ) : (
            <button
              className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-700 hover:border-gray-900"
              type="button"
              onClick={() => setShowOnboarding(true)}
            >
              {copy.onboarding.showAgain}
            </button>
          )}

          <ConfigPanel
            config={config}
            copy={copy}
            onChange={onConfigChange}
            compact
          />
        </aside>

        <div className="space-y-5">
          <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium theme-text">
              {copy.studio.eyebrow}
            </p>
            <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">
              {copy.studio.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
              {copy.studio.body}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {copy.studio.cards.map((item, index) => (
                <div
                  className="rounded-md border border-gray-200 bg-white p-3"
                  key={item}
                >
                  <div className="text-xs font-semibold text-gray-500">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-900">
                    {item}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <PromptInput
            copy={copy}
            onGenerate={handleGenerate}
            isLoading={isLoading}
          />

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {copy.studio.checklistTitle}
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  {copy.studio.checklistBody}
                </p>
              </div>
              <button
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:border-gray-900"
                type="button"
                onClick={() => onNavigate("settings")}
              >
                {copy.common.openSettings}
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              {copy.studio.checklist.map((item) => (
                <div className="rounded-md bg-gray-50 px-3 py-2" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {isLoading && (
            <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-gray-900">
                {isRetrying
                  ? copy.studio.retryingTitle
                  : copy.studio.loadingTitle}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full w-2/3 rounded-full theme-progress" />
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                {copy.studio.loadingBody}
              </p>
            </div>
          )}
        </aside>
      </section>

      {result?.success && (
        <ResultPanel copy={copy} onRegenerate={handleGenerate} result={result} />
      )}
    </div>
  );
}

export default ImagePage;

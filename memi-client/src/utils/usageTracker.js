// ─── API 用量统计 ─────────────────────────────────────
// 持久化到 localStorage，记录各类型 API 调用次数

const STORAGE_KEY = "memi-usage";

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { llmCalls: 0, imageGenerations: 0, visionReviews: 0, daily: {} };
}

function save(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

export function recordUsage(type) {
  const data = load();
  const today = new Date().toISOString().slice(0, 10);

  if (type === "llm") data.llmCalls = (data.llmCalls || 0) + 1;
  else if (type === "image") data.imageGenerations = (data.imageGenerations || 0) + 1;
  else if (type === "vision") data.visionReviews = (data.visionReviews || 0) + 1;

  // 按日统计
  if (!data.daily) data.daily = {};
  if (!data.daily[today]) data.daily[today] = { llmCalls: 0, imageGenerations: 0, visionReviews: 0 };
  if (type === "llm") data.daily[today].llmCalls++;
  else if (type === "image") data.daily[today].imageGenerations++;
  else if (type === "vision") data.daily[today].visionReviews++;

  save(data);
}

export function getUsageStats() {
  return load();
}

export function resetUsage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

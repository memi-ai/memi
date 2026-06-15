export const DEFAULT_CONFIG = {
  api1: {
    baseUrl: "",
    apiKey: "",
    model: "",
  },
  api2: {
    baseUrl: "https://enter.pollinations.ai",
    apiKey: "",
    model: "pollinations",
  },
  api3: {
    baseUrl: "",
    apiKey: "",
    model: "",
  },
  maxRetry: 2,
  requireConfirmation: false,
  maxTokens: 0,
  // ─── 图片默认值 ───
  defaultAspectRatio: "1:1",
  defaultStyle: "None",
  // ─── 管道控制 ───
  temperature: 0.7,
  enableVisionReview: true,
  // ─── 数据管理 ───
  maxHistoryItems: 24,
  agentMode: "image",  // "agent" = 纯对话, "image" = 生图模式
};

// ─── 界面主题 ──────────────────────────────────────────
export const THEME_STYLES = [
  { id: "graphite", label: "石墨", labelEn: "Graphite", desc: "深色", descEn: "Dark", mode: "dark", color: "#374151", hover: "#1f2937" },
  { id: "sandstone", label: "砂岩", labelEn: "Sandstone", desc: "浅色", descEn: "Light", mode: "light", color: "#d97706", hover: "#b45309" },
  { id: "porcelain", label: "瓷白", labelEn: "Porcelain", desc: "浅色", descEn: "Light", mode: "light", color: "#2563eb", hover: "#1d4ed8" },
  { id: "midnight", label: "午夜", labelEn: "Midnight", desc: "深色", descEn: "Dark", mode: "dark", color: "#4f46e5", hover: "#3730a3" },
];

export const DEFAULT_UI = {
  themeStyle: "sandstone",
  themeMode: "light",
  fontSize: "medium",
  fontFamily: "sans",
};

export const FONT_SIZE_OPTIONS = [
  { id: "small", label: "小", labelEn: "Small" },
  { id: "medium", label: "中", labelEn: "Medium" },
  { id: "large", label: "大", labelEn: "Large" },
];

export const FONT_FAMILY_OPTIONS = [
  { id: "sans", label: "无衬线", labelEn: "Sans-serif" },
  { id: "system", label: "系统", labelEn: "System" },
  { id: "serif", label: "衬线", labelEn: "Serif" },
];

// ─── 内置技能 ────────────────────────────────────────
export const DEFAULT_SKILLS = [
  {
    id: "skill-enhance",
    name: "提示词增强",
    nameEn: "Enhance Prompt",
    description: "为你的提示词补充光线、构图和氛围细节",
    descriptionEn: "Add lighting, composition & mood details to your prompt",
    type: "llm",
    promptTemplate: "You are a professional prompt engineer for AI image generation. Enhance the following prompt with rich details about lighting, composition, color palette, mood, and camera angles. Keep it concise but vivid. Original prompt: {input}",
    builtin: true,
  },
  {
    id: "skill-summarize",
    name: "对话总结",
    nameEn: "Summarize",
    description: "总结当前对话的要点",
    descriptionEn: "Summarize the key points of the conversation",
    type: "llm",
    promptTemplate: "Summarize the key points from the following conversation concisely:\n{input}",
    builtin: true,
  },
  {
    id: "skill-translate-en",
    name: "译成英文",
    nameEn: "Translate to English",
    description: "将中文翻译成英文",
    descriptionEn: "Translate Chinese text to English",
    type: "llm",
    promptTemplate: "Translate the following Chinese text to English. Output ONLY the translation, no explanations:\n{input}",
    builtin: true,
  },
  {
    id: "skill-translate-zh",
    name: "译成中文",
    nameEn: "Translate to Chinese",
    description: "将英文翻译成中文",
    descriptionEn: "Translate English text to Chinese",
    type: "llm",
    promptTemplate: "Translate the following English text to Chinese. Output ONLY the translation, no explanations:\n{input}",
    builtin: true,
  },
  {
    id: "skill-cyberpunk",
    name: "赛博朋克风格",
    nameEn: "Cyberpunk Style",
    description: "为画面添加赛博朋克视觉风格",
    descriptionEn: "Apply a cyberpunk visual style to the scene",
    type: "image",
    promptTemplate: "{input}, cyberpunk style, neon lights, rain, futuristic city, vibrant colors, high contrast",
    builtin: true,
  },
  {
    id: "skill-watercolor",
    name: "水彩风格",
    nameEn: "Watercolor Style",
    description: "为画面添加水彩画风格",
    descriptionEn: "Apply a soft watercolor painting style",
    type: "image",
    promptTemplate: "{input}, watercolor painting, soft colors, paper texture, artistic, loose brushstrokes",
    builtin: true,
  },
];

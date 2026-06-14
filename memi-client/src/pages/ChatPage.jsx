import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle, RefreshCw, Send, Trash2, X, ImageIcon } from "lucide-react";
import { recordUsage } from "../utils/usageTracker.js";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3"];
const STYLES = ["None", "Realistic", "Anime", "3D", "Cyberpunk", "Oil Painting", "Watercolor", "Pixel Art", "Cinematic", "Sketch"];

function genId() {
  return crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function saveGalleryItem(item, maxItems) {
  try {
    const saved = localStorage.getItem("memi-generation-history");
    const history = saved ? JSON.parse(saved) : [];
    const limit = maxItems > 0 ? maxItems : 24;
    const nextHistory = [item, ...history].slice(0, limit);
    localStorage.setItem("memi-generation-history", JSON.stringify(nextHistory));
  } catch (e) {
    console.warn("Gallery history save failed", e);
  }
}

function getImageSrc(imageUrl) {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("data:")) return imageUrl;
  if (imageUrl.startsWith("http")) {
    return "/api/proxy-image?url=" + encodeURIComponent(imageUrl);
  }
  return imageUrl;
}

function deriveTitle(msgs) {
  for (const m of msgs) {
    if (m.role === "user" && m.content) {
      const t = m.content.length > 28 ? m.content.slice(0, 28) + "…" : m.content;
      return t;
    }
  }
  return "新对话";
}

function ChatPage({ copy, conversations, activeConvId, config, skills = [], onConfigChange, updateConv, createConv }) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [aspectRatio, setAspectRatio] = useState(config.defaultAspectRatio || "1:1");
  const [style, setStyle] = useState(config.defaultStyle || "None");
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState("");
  const [showCommandHelp, setShowCommandHelp] = useState(false);
  const messagesEndRef = useRef(null);

  const activeConv = conversations.find((c) => c.id === activeConvId) || null;
  const messages = activeConv?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Ctrl+K / Cmd+K 打开命令面板
  useEffect(() => {
    function handler(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandHelp((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function clearCurrentChat() {
    if (!activeConvId) return;
    updateConv(activeConvId, (c) => ({ ...c, messages: [], updatedAt: new Date().toISOString() }));
    setInput("");
    setError("");
    setAspectRatio("1:1");
    setStyle("None");
    setPendingConfirm(null);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    // 斜杠命令拦截
    if (text.startsWith("/")) {
      setShowCommandHelp(false);
      const handled = executeCommand(text);
      if (handled) { setInput(""); return; }
    }

    // Agent 模式：使用工具调用 Agent
    if (config.agentMode === "agent") {
      setInput("");
      setIsLoading(true);
      setError("");

      let targetId = activeConvId;
      if (!targetId) targetId = createConv(text);

      const userMessage = { role: "user", content: text };
      updateConv(targetId, (c) => ({
        ...c, messages: [...c.messages, userMessage],
        title: c.messages.length === 0 ? deriveTitle([userMessage]) : c.title,
        updatedAt: new Date().toISOString(),
      }));

      const currentMsgs = conversations.find((c) => c.id === targetId)?.messages || [];
      const sendMsgs = [...currentMsgs, userMessage];

      try {
        recordUsage("llm");
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
          body: JSON.stringify({
            api1: config.api1,
            api2: config.api2,
            messages: sendMsgs.map((m) => ({ role: m.role, content: m.content })),
            maxTokens: config.maxTokens,
            skills,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "请求失败");

        // 插入工具调用中间消息
        if (data.toolCalls && data.toolCalls.length > 0) {
          for (const tc of data.toolCalls) {
            const icon = tc.tool === "create_skill" ? "🆕" : tc.tool === "import_skill_from_url" ? "📥" : "🔧";
            const desc = tc.tool === "create_skill" ? `创建技能: ${tc.args?.name || ""}` :
                        tc.tool === "import_skill_from_url" ? "从链接导入技能" : tc.tool;
            const toolMsg = {
              role: "assistant", type: "tool",
              content: `${icon} ${desc}`,
              toolCall: tc,
            };
            updateConv(targetId, (c) => ({ ...c, messages: [...c.messages, toolMsg], updatedAt: new Date().toISOString() }));
          }
        }

        // 自动保存 Agent 创建/导入的技能
        if (data.newSkills && data.newSkills.length > 0) {
          try {
            const saved = localStorage.getItem("memi-skills");
            const existing = saved ? JSON.parse(saved) : [];
            const updated = [...existing, ...data.newSkills.map((s) => ({
              ...s,
              id: crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2),
              builtin: false,
            }))];
            localStorage.setItem("memi-skills", JSON.stringify(updated));
            window.dispatchEvent(new Event("memi-skills-changed"));
          } catch {}
        }

        const agentMsg = { role: "assistant", type: "chat", content: data.response };
        updateConv(targetId, (c) => ({ ...c, messages: [...c.messages, agentMsg], updatedAt: new Date().toISOString() }));
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    let targetId = activeConvId;
    if (!targetId) targetId = createConv(text);

    setInput("");
    setError("");

    const userMessage = { role: "user", content: text };
    const originalMsgCount = conversations.find((c) => c.id === targetId)?.messages?.length || 0;
    updateConv(targetId, (c) => ({
      ...c,
      messages: [...c.messages, userMessage],
      title: c.messages.length === 0 ? deriveTitle([userMessage]) : c.title,
      updatedAt: new Date().toISOString(),
    }));

    const currentMsgs = conversations.find((c) => c.id === targetId)?.messages || [];
    const sendMsgs = [...currentMsgs, userMessage].map((m) => ({
      role: m.role,
      type: m.type,
      content: m.type === "image" ? (m.finalPrompt || "image") : m.content,
    }));

    if (config.requireConfirmation) {
      setIsLoading(true);
      try {
        const polishRes = await fetch("/api/pipeline/chat-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
          body: JSON.stringify({
            api1: config.api1, api2: config.api2, api3: config.api3,
            messages: sendMsgs, aspectRatio, style,
            maxRetry: config.maxRetry, maxTokens: config.maxTokens,
            polishOnly: true,
          }),
        });
        const polishData = await polishRes.json();
        if (polishData.type === "polish") {
          setPendingConfirm({
            polishedPrompt: polishData.polishedPrompt,
            editablePrompt: polishData.polishedPrompt,
            targetId, userMessage, text, sendMsgs,
            originalMsgCount,
          });
          setIsLoading(false);
          return;
        }
      } catch { setIsLoading(false); }
      // polish 失败时直接走完整 pipeline
    }

    await executeFullPipeline(targetId, userMessage, text, sendMsgs, null, originalMsgCount);
  }

  async function confirmGeneration(editedPrompt) {
    if (!pendingConfirm) return;
    const { targetId, userMessage, text, sendMsgs, originalMsgCount } = pendingConfirm;
    setPendingConfirm(null);
    await executeFullPipeline(targetId, userMessage, text, sendMsgs, editedPrompt, originalMsgCount);
  }

  function cancelConfirmation() {
    if (!pendingConfirm) return;
    const { targetId, originalMsgCount } = pendingConfirm;
    updateConv(targetId, (c) => {
      // 恢复至发消息前的消息条数，避免用户在此期间发送了其他消息时删错
      const messages = c.messages.slice(0, originalMsgCount);
      return { ...c, messages, updatedAt: new Date().toISOString() };
    });
    setPendingConfirm(null);
    setError("");
  }

  async function executeFullPipeline(targetId, userMessage, text, sendMsgs, overridePrompt, originalMsgCount) {
    setIsLoading(true);
    setError("");
    try {
      recordUsage("image");
      const response = await fetch("/api/pipeline/chat-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
        body: JSON.stringify({
          api1: config.api1, api2: config.api2, api3: config.api3,
          messages: sendMsgs, aspectRatio, style,
          maxRetry: config.maxRetry, maxTokens: config.maxTokens, temperature: config.temperature,
          skipReview: config.enableVisionReview === false,
          ...(overridePrompt ? { overridePrompt } : {}),
        }),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "请求失败");

      if (data.type === "image") {
        if (config.requireConfirmation) {
          setPendingConfirm({ step: "image", data, targetId, userMessage, text, sendMsgs, overridePrompt, aspectRatio, style, originalMsgCount });
          return;
        }
        addImageToConversation(targetId, text, data, overridePrompt);
      } else {
        const chatMessage = { role: "assistant", type: "chat", content: data.response };
        updateConv(targetId, (c) => ({ ...c, messages: [...c.messages, chatMessage], updatedAt: new Date().toISOString() }));
      }
    } catch (err) {
      setError(err.message);
      updateConv(targetId, (c) => ({ ...c, messages: c.messages.filter((m) => m !== userMessage), updatedAt: new Date().toISOString() }));
    } finally { setIsLoading(false); }
  }

  function addImageToConversation(targetId, text, data, overridePrompt) {
    const imageMessage = {
      role: "assistant", type: "image",
      imageUrl: data.imageUrl, finalPrompt: data.finalPrompt,
      score: data.score, totalTime: data.totalTime,
      history: data.history || [],
      content: data.response || ("✨ " + (data.finalPrompt || text)),
    };
    updateConv(targetId, (c) => ({ ...c, messages: [...c.messages, imageMessage], updatedAt: new Date().toISOString() }));
    saveGalleryItem({ id: genId(), createdAt: new Date().toISOString(), prompt: overridePrompt || text, aspectRatio, style, ...data }, config.maxHistoryItems);
  }

  async function retryGeneration() {
    if (!pendingConfirm || pendingConfirm.step !== "image") return;
    const { targetId, userMessage, text, sendMsgs, originalMsgCount } = pendingConfirm;
    setPendingConfirm(null);
    setIsLoading(true);
    try {
      const polishRes = await fetch("/api/pipeline/chat-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
        body: JSON.stringify({
          api1: config.api1, api2: config.api2, api3: config.api3,
          messages: sendMsgs, aspectRatio, style,
          maxRetry: config.maxRetry, maxTokens: config.maxTokens, temperature: config.temperature,
          skipReview: config.enableVisionReview === false,
          polishOnly: true,
        }),
      });
      const polishData = await polishRes.json();
      if (polishData.type === "polish") {
        setPendingConfirm({
          polishedPrompt: polishData.polishedPrompt,
          editablePrompt: polishData.polishedPrompt,
          targetId, userMessage, text, sendMsgs,
          originalMsgCount,
        });
        setIsLoading(false);
        return;
      }
    } catch { setIsLoading(false); }
    await executeFullPipeline(targetId, null, text, sendMsgs, null, originalMsgCount);
  }

  function acceptImage() {
    if (!pendingConfirm || pendingConfirm.step !== "image") return;
    const { targetId, text, data, overridePrompt } = pendingConfirm;
    setPendingConfirm(null);
    addImageToConversation(targetId, text, data, overridePrompt);
  }

  function handleKeyDown(e) {
    // 输入 / 时显示命令帮助
    if (e.target.value === "/" && e.key === "/") {
      setShowCommandHelp(true);
    }
    if (e.key === "Escape") {
      setShowCommandHelp(false);
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendMessage(); }
  }

  // ─── 斜杠命令系统 ────────────────────────────────
  const commands = (copy.commands?.items || []).map((item) => ({
    cmd: item.cmd,
    desc: item.desc,
  }));

  function executeCommand(text) {
    const parts = text.slice(1).trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1).join(" ");
    const lang = copy.commands?.title === "Slash Commands" ? "en" : "zh";

    switch (cmd) {
      case "help":
        setShowCommandHelp(true);
        return true;

      case "clear":
        clearCurrentChat();
        return true;

      case "draw":
        if (!args) { setError(copy.commands?.notFound?.replace("{cmd}", text) || ""); return true; }
        // 强制走图生图流程：把消息发出去，但标记为 image intent
        forceImageSend(args);
        return true;

      case "chat":
        if (!args) { setError(copy.commands?.notFound?.replace("{cmd}", text) || ""); return true; }
        forceChatSend(args);
        return true;

      case "import_skill":
      case "import":
        if (!args) { setError("/import_skill <GitHub URL>"); return true; }
        importSkillFromCmd(args);
        return true;

      case "skill": {
        if (parts[1] === "list") {
          // 在聊天中显示技能列表
          const skillNames = skills.map((s) => {
            const sn = lang === "en" ? s.nameEn || s.name : s.name;
            return `  - ${sn} (${s.type})`;
          }).join("\n");
          const msg = copy.commands?.help + ":\n" + skillNames;
          addSystemMessage(msg);
          return true;
        }
        if (parts[1] === "run" && parts[2]) {
          const skillName = parts.slice(2).join(" ");
          const skill = skills.find(
            (s) => (s.name || "").toLowerCase() === skillName.toLowerCase() ||
                   (s.nameEn || "").toLowerCase() === skillName.toLowerCase()
          );
          if (!skill) {
            setError(copy.commands?.notFound?.replace("{cmd}", text) || `技能 "${skillName}" 未找到`);
            return true;
          }
          executeSkill(skill);
          return true;
        }
        setError(copy.commands?.notFound?.replace("{cmd}", text) || "");
        return true;
      }

      default:
        setError(copy.commands?.notFound?.replace("{cmd}", cmd ? `/${cmd}` : text) || "");
        return true;
    }
  }

  function forceImageSend(text) {
    // 通过 executeFullPipeline 但强制图片模式
    const targetId = activeConvId || createConv(text);
    if (!targetId) return;
    const userMessage = { role: "user", content: text };
    updateConv(targetId, (c) => ({
      ...c,
      messages: [...c.messages, userMessage],
      title: c.messages.length === 0 ? deriveTitle([userMessage]) : c.title,
      updatedAt: new Date().toISOString(),
    }));
    const currentMsgs = conversations.find((c) => c.id === targetId)?.messages || [];
    const sendMsgs = [...currentMsgs, userMessage].map((m) => ({
      role: m.role, type: m.type,
      content: m.type === "image" ? (m.finalPrompt || "image") : m.content,
    }));
    const originalMsgCount = currentMsgs.length;
    executeFullPipeline(targetId, userMessage, text, sendMsgs, null, originalMsgCount);
  }

  function forceChatSend(text) {
    const targetId = activeConvId || createConv(text);
    if (!targetId) return;
    setIsLoading(true);
    setError("");
    const userMessage = { role: "user", content: text };
    updateConv(targetId, (c) => ({
      ...c,
      messages: [...c.messages, userMessage],
      title: c.messages.length === 0 ? deriveTitle([userMessage]) : c.title,
      updatedAt: new Date().toISOString(),
    }));
    const currentMsgs = conversations.find((c) => c.id === targetId)?.messages || [];
    const sendMsgs = [...currentMsgs, userMessage].map((m) => ({
      role: m.role, type: m.type,
      content: m.type === "image" ? (m.finalPrompt || "image") : m.content,
    }));
    recordUsage("llm");
    fetch("/api/pipeline/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
      body: JSON.stringify({ api1: config.api1, messages: sendMsgs, maxTokens: config.maxTokens }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const chatMessage = { role: "assistant", type: "chat", content: data.response };
          updateConv(targetId, (c) => ({ ...c, messages: [...c.messages, chatMessage], updatedAt: new Date().toISOString() }));
        } else {
          setError(data.error || "请求失败");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }

  function executeSkill(skill) {
    const lang = copy.commands?.title === "Slash Commands" ? "en" : "zh";
    const sName = lang === "en" ? skill.nameEn || skill.name : skill.name;

    if (skill.type === "llm") {
      // LLM 技能：显示输入提示框
      const userInput = prompt(`Skill: ${sName}\n${copy.prompt?.placeholder || "Enter text:"}`);
      if (!userInput) return;
      const filledPrompt = (skill.promptTemplate || "").replace(/{input}/g, userInput);

      if (!activeConvId) createConv(userInput);
      const targetId = activeConvId || Object.keys(conversations)[0];
      if (!targetId) return;

      setIsLoading(true);
      setError("");
      const userMsg = { role: "user", content: `✨ ${sName}: ${userInput}` };
      updateConv(targetId, (c) => ({
        ...c, messages: [...c.messages, userMsg],
        title: c.messages.length === 0 ? deriveTitle([userMsg]) : c.title,
        updatedAt: new Date().toISOString(),
      }));

      recordUsage("llm");
      fetch("/api/pipeline/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
        body: JSON.stringify({ api1: config.api1, messages: [{ role: "user", content: filledPrompt }], maxTokens: config.maxTokens }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            const resultMsg = { role: "assistant", type: "chat", content: data.response };
            updateConv(targetId, (c) => ({ ...c, messages: [...c.messages, resultMsg], updatedAt: new Date().toISOString() }));
          } else {
            setError(data.error || "技能执行失败");
          }
        })
        .catch((err) => setError(err.message))
        .finally(() => setIsLoading(false));
    } else if (skill.type === "image") {
      // 图片技能：提示输入描述
      const userInput = prompt(`Skill: ${sName}\n${copy.prompt?.placeholder || "Describe the scene:"}`);
      if (!userInput) return;
      const filledPrompt = (skill.promptTemplate || "").replace(/{input}/g, userInput);

      if (!activeConvId) createConv(userInput);
      const targetId = activeConvId || Object.keys(conversations)[0];
      if (!targetId) return;

      const userMsg = { role: "user", content: `🎨 ${sName}: ${userInput}` };
      updateConv(targetId, (c) => ({
        ...c, messages: [...c.messages, userMsg],
        title: c.messages.length === 0 ? deriveTitle([userMsg]) : c.title,
        updatedAt: new Date().toISOString(),
      }));

      const currentMsgs = conversations.find((c) => c.id === targetId)?.messages || [];
      const sendMsgs = [...currentMsgs, userMsg].map((m) => ({
        role: m.role, type: m.type,
        content: m.type === "image" ? (m.finalPrompt || "image") : m.content,
      }));
      const originalMsgCount = currentMsgs.length;
      executeFullPipeline(targetId, userMsg, filledPrompt, sendMsgs, null, originalMsgCount);
    }
  }

  async function importSkillFromCmd(url) {
    setIsLoading(true);
    setError("");
    try {
      const r = await fetch("/api/skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);

      // 保存到 localStorage
      const saved = localStorage.getItem("memi-skills");
      const existing = saved ? JSON.parse(saved) : [];
      const newSkill = {
        ...d.skill,
        id: crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2),
        builtin: false,
        enabled: true,
      };
      localStorage.setItem("memi-skills", JSON.stringify([...existing, newSkill]));
      window.dispatchEvent(new Event("memi-skills-changed"));

      addSystemMessage(`✅ 已导入技能: **${d.skill.name}** (${d.skill.type})`);
    } catch (e) {
      setError("导入失败: " + e.message);
    } finally {
      setIsLoading(false);
    }
  }

  function addSystemMessage(content) {
    if (!activeConvId) return;
    const sysMsg = { role: "assistant", type: "chat", content };
    updateConv(activeConvId, (c) => ({ ...c, messages: [...c.messages, sysMsg], updatedAt: new Date().toISOString() }));
  }

  function handleImgError(e) {
    e.target.style.display = "none";
    // 寻找同级的 fallback 容器（image-icon div）
    const fallback = e.target.parentElement?.querySelector(".image-fallback");
    if (fallback) fallback.style.display = "flex";
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-6 border-b border-gray-100 shrink-0">
        <h1 className="text-sm font-medium text-gray-700 truncate">
          {activeConv ? activeConv.title : copy.nav.chat}
        </h1>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            type="button"
            onClick={clearCurrentChat}
            title={copy.chat.deleteChat}
            disabled={!activeConv || messages.length === 0}
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !isLoading && (
            <div className="flex h-full min-h-[300px] items-center justify-center">
              <div className="text-center max-w-sm">
                <MessageCircle size={40} className="mx-auto mb-4 text-gray-200" strokeWidth={1} />
                <p className="text-sm text-gray-400 mb-1">{copy.chat.placeholder}</p>
                <p className="text-xs text-gray-300">{copy.chat.hint}</p>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={"flex " + (msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={"max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed " + (msg.role === "user" ? "bg-gray-800 text-white" : "bg-gray-50 text-gray-800")}>
                {msg.type === "image" && msg.imageUrl ? (
                  <div>
                    {msg.content && <p className="mb-2 text-sm">{msg.content}</p>}
                    <div className="relative">
                      <img
                        src={getImageSrc(msg.imageUrl)}
                        alt={msg.finalPrompt || "image"}
                        className="max-w-full rounded-xl cursor-pointer hover:opacity-95 transition"
                        style={{ maxHeight: "400px" }}
                        onClick={() => setLightboxUrl(getImageSrc(msg.imageUrl))}
                        onError={handleImgError}
                      />
                      <div className="hidden image-fallback items-center justify-center h-48 bg-gray-100 rounded-xl text-gray-300 text-sm">
                        <ImageIcon size={24} strokeWidth={1} />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      {msg.score != null && (
                        <span className="bg-white/80 px-2 py-1 rounded-md font-medium text-gray-500">{copy.result.score + ": " + msg.score}</span>
                      )}
                      {msg.totalTime != null && <span>{(msg.totalTime / 1000).toFixed(1) + "s"}</span>}
                    </div>
                    {msg.finalPrompt && (
                      <p className="mt-1.5 text-xs text-gray-400 italic truncate">{msg.finalPrompt}</p>
                    )}
                  </div>
                ) : msg.type === "tool" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{msg.content}</span>
                    {msg.toolCall && (
                      <span className="text-xs text-gray-400 italic">
                        {(() => { try { const a = typeof msg.toolCall.args === "string" ? JSON.parse(msg.toolCall.args) : msg.toolCall.args; return Object.values(a || {}).join(", ").slice(0, 40); } catch { return String(msg.toolCall.args || "").slice(0, 40); } })()}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-300" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-300" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-300" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-3xl w-full px-4 mb-2">
          <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 border border-red-100">{error}</div>
        </div>
      )}

      {/* 命令帮助浮层 */}
      {showCommandHelp && (
        <div className="mx-auto max-w-3xl w-full px-4 mb-2">
          <div className="rounded-xl border border-gray-100 bg-white shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">{copy.commands?.help || "Commands"}</h4>
              <button
                type="button"
                className="text-gray-300 hover:text-gray-500"
                onClick={() => setShowCommandHelp(false)}
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">{copy.commands?.helpDesc || ""}</p>
            <div className="space-y-1.5">
              {(copy.commands?.items || []).map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <code className="rounded-md bg-gray-50 px-2 py-1 text-xs font-mono text-gray-600 min-w-[140px]">
                    {item.cmd}
                  </code>
                  <span className="text-gray-500">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 模式切换 */}
      <div className="mx-auto max-w-3xl w-full px-4 pt-2">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            type="button"
            className={"px-4 py-1.5 text-xs transition-colors " + (config.agentMode !== "agent" ? "theme-bg text-white font-medium" : "bg-white text-gray-400 hover:text-gray-600")}
            onClick={() => onConfigChange?.({ ...config, agentMode: "image" })}
          >
            🎨 生图
          </button>
          <button
            type="button"
            className={"px-4 py-1.5 text-xs transition-colors " + (config.agentMode === "agent" ? "theme-bg text-white font-medium" : "bg-white text-gray-400 hover:text-gray-600")}
            onClick={() => onConfigChange?.({ ...config, agentMode: "agent" })}
          >
            🤖 Agent
          </button>
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-gray-100 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <select
              className="text-xs text-gray-400 bg-transparent outline-none"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
            >
              {ASPECT_RATIOS.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
            <span className="text-gray-200">|</span>
            <select
              className="text-xs text-gray-400 bg-transparent outline-none"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {STYLES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <span className="flex-1" />
            <span className="text-xs text-gray-300">{copy.chat.autoDetect}</span>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-xl border border-gray-200 bg-white focus-within:border-gray-400 transition-colors">
              <textarea
                className="min-h-[44px] max-h-32 w-full resize-none rounded-xl px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-300"
                placeholder={copy.chat.inputPlaceholder}
                value={input}
                onChange={(e) => {
                  const val = e.target.value;
                  setInput(val);
                  if (val === "/") setShowCommandHelp(true);
                  if (val && !val.startsWith("/")) setShowCommandHelp(false);
                }}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={1}
              />
            </div>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
            >
              <Send size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Polish confirmation dialog */}
      {pendingConfirm && pendingConfirm.step !== "image" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-full max-w-lg mx-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">{copy.settings.requireConfirmation}</h3>
              <button type="button" onClick={cancelConfirmation} className="text-gray-300 hover:text-gray-500 transition-colors">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <textarea
              className="w-full min-h-[120px] resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none focus:border-gray-400 transition-colors"
              value={pendingConfirm.editablePrompt}
              onChange={(e) => setPendingConfirm((prev) => prev ? { ...prev, editablePrompt: e.target.value } : null)}
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                type="button"
                onClick={cancelConfirmation}
              >{copy.common.cancel || "Cancel"}</button>
              <button
                className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
                type="button"
                onClick={() => confirmGeneration(pendingConfirm.editablePrompt)}
              >
                <Check size={14} strokeWidth={1.5} />
                {copy.common.confirm || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image confirmation dialog */}
      {pendingConfirm && pendingConfirm.step === "image" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-full max-w-lg mx-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{copy.settings.requireConfirmation}</h3>
            {pendingConfirm.data.imageUrl && (
              <div className="relative">
                <img
                  src={getImageSrc(pendingConfirm.data.imageUrl)}
                  alt={pendingConfirm.data.finalPrompt || "Generated"}
                  className="max-w-full rounded-xl cursor-pointer hover:opacity-95 transition"
                  style={{ maxHeight: "300px" }}
                  onClick={() => setLightboxUrl(getImageSrc(pendingConfirm.data.imageUrl))}
                  onError={handleImgError}
                />
                <div className="hidden image-fallback items-center justify-center h-48 bg-gray-100 rounded-xl text-gray-300 text-sm">
                  <ImageIcon size={24} strokeWidth={1} />
                </div>
              </div>
            )}
            {pendingConfirm.data.finalPrompt && (
              <p className="mt-2 text-xs text-gray-400 italic truncate">{pendingConfirm.data.finalPrompt}</p>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                type="button"
                onClick={acceptImage}
              >
                <Check size={14} strokeWidth={1.5} />
                {copy.common.confirm || "Accept"}
              </button>
              <button
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                type="button"
                onClick={retryGeneration}
                disabled={isLoading}
              >
                <RefreshCw size={14} strokeWidth={1.5} className={isLoading ? "animate-spin" : ""} />
                {"Retry"}
              </button>
              <button
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                type="button"
                onClick={cancelConfirmation}
              >{copy.common.cancel || "Cancel"}</button>
            </div>
          </div>
        </div>
      )}
      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setLightboxUrl("")}
          onKeyDown={(e) => { if (e.key === "Escape") setLightboxUrl(""); }}
        >
          <img
            src={lightboxUrl}
            alt="full size"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            type="button"
            onClick={() => setLightboxUrl("")}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}

export default ChatPage;

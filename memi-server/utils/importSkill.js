// ─── 从 GitHub URL 导入技能 ─────────────────────────
const axios = require("axios");

async function importSkillFromUrl(url) {
  if (!url || typeof url !== "string") throw new Error("请提供 URL");
  const trimmed = url.trim();
  if (!trimmed.startsWith("http")) throw new Error("无效的 URL");

  // 转换为 raw URL
  let rawUrl = trimmed;
  const blobMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)/);
  if (blobMatch) {
    rawUrl = `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
  }
  const gistMatch = trimmed.match(/gist\.github\.com\/([^/]+)\/([a-f0-9]+)/);
  if (gistMatch) {
    rawUrl = `https://gist.githubusercontent.com/${gistMatch[1]}/${gistMatch[2]}/raw`;
  }

  const response = await axios.get(rawUrl, {
    headers: { "User-Agent": "MemiAgent/1.0" },
    timeout: 20000,
    responseType: "text",
  });
  const content = String(response.data || "");

  // 尝试 JSON 解析
  try {
    const json = JSON.parse(content);
    if (json.name && json.promptTemplate) {
      return {
        name: json.name,
        nameEn: json.nameEn || json.name,
        type: json.type || "llm",
        description: json.description || "",
        descriptionEn: json.descriptionEn || json.description || "",
        promptTemplate: json.promptTemplate || "",
      };
    }
  } catch {}

  // 尝试 Markdown 解析
  const lines = content.split("\n");
  const meta = {};
  const bodyLines = [];
  let inBody = false;
  let nameFromTitle = "";

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("# ") && !inBody) { nameFromTitle = t.slice(2).trim(); continue; }
    if (t.startsWith("## ") && !inBody) { meta.description = t.slice(3).trim(); continue; }
    const kv = t.match(/^(\w+):\s*(.+)/);
    if (kv && !inBody) { meta[kv[1]] = kv[2].trim(); continue; }
    if (t === "---") { inBody = !inBody; continue; }
    if (inBody || (!kv && t)) bodyLines.push(line);
  }

  const body = bodyLines.join("\n").trim();
  if (meta.promptTemplate || body) {
    return {
      name: meta.name || nameFromTitle || "Imported Skill",
      nameEn: meta.nameEn || meta.name || nameFromTitle || "Imported Skill",
      type: meta.type || "llm",
      description: meta.description || "",
      descriptionEn: meta.descriptionEn || meta.description || "",
      promptTemplate: meta.promptTemplate || body,
    };
  }

  throw new Error("无法解析技能定义。请确保文件包含 JSON 或 Markdown 格式");
}

module.exports = { importSkillFromUrl };

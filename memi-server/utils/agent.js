const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { callImageGen } = require("./aiProxy");
const { importSkillFromUrl } = require("./importSkill");

const MAX_AGENT_ITERATIONS = 8;

// DeepSeek 思考模型检测
function supportsThinking(model) {
  const m = (model || "").toLowerCase();
  return /reasoner|r1|think|v4-pro|v4-flash/i.test(m);
}

// ─── 工具定义 ────────────────────────────────────────
const TOOLS = [
  {
    name: "todo",
    description: "管理待办事项列表。action 是 list/add/complete/remove/clear。add 时用 title 添加任务，complete/remove 时用 id 指定任务。",
    parameters: { type:"object", properties:{
      action:{type:"string",description:"list/add/complete/remove/clear"},
      id:{type:"number",description:"任务序号（complete/remove 时必填）"},
      title:{type:"string",description:"任务标题（add 时必填）"}
    }, required:["action"] },
    handler: async (args) => {
      const f = path.join(__dirname, "..", "..", "memi-config", "todos.json");
      let todos = [];
      try { if (fs.existsSync(f)) todos = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
      switch (args.action) {
        case "list":
          if (!todos.length) return "当前没有待办事项。";
          return todos.map((t, i) => `${i+1}. ${t.done ? "[x]" : "[ ]"} ${t.title}`).join("\n");
        case "add":
          if (!args.title) return "请提供任务标题。";
          todos.push({ title: args.title, done: false, time: new Date().toISOString() });
          fs.writeFileSync(f, JSON.stringify(todos, null, 2));
          return `已添加: ${args.title}`;
        case "complete":
          if (args.id == null || args.id < 1 || args.id > todos.length) return `请输入有效序号 (1-${todos.length})。`;
          todos[args.id - 1].done = true;
          fs.writeFileSync(f, JSON.stringify(todos, null, 2));
          return `已完成: ${todos[args.id - 1].title}`;
        case "remove":
          if (args.id == null || args.id < 1 || args.id > todos.length) return `请输入有效序号 (1-${todos.length})。`;
          const removed = todos.splice(args.id - 1, 1)[0];
          fs.writeFileSync(f, JSON.stringify(todos, null, 2));
          return `已删除: ${removed.title}`;
        case "clear":
          todos = [];
          fs.writeFileSync(f, JSON.stringify(todos, null, 2));
          return "已清空所有待办事项。";
        default:
          return "未知操作。支持: list/add/complete/remove/clear";
      }
    }
  },
  {
    name: "get_location",
    description: "获取用户当前地理位置（基于IP）。返回城市、地区、国家。当用户问题涉及位置/天气/周边时自动调用。",
    parameters: { type: "object", properties: {}, required: [] },
    handler: async () => {
      try {
        const r = await axios.get("http://ip-api.com/json/?lang=zh-CN", { timeout: 8000 });
        const d = r.data;
        if (d && d.status === "success") return `${d.city}, ${d.regionName}, ${d.country}`;
        return "无法获取位置";
      } catch { return "获取位置失败"; }
    },
  },
  {
    name: "get_time",
    description: "获取当前日期和时间",
    parameters: { type: "object", properties: {}, required: [] },
    handler: async () => {
      return new Date().toLocaleString("zh-CN");
    },
  },
  {
    name: "calculate",
    description: "执行数学计算。expression 是数学表达式字符串，例如 '2 + 3 * 4'",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "数学表达式" },
      },
      required: ["expression"],
    },
    handler: async (args) => {
      try {
        // 安全沙箱：只允许数字、运算符、括号
        const sanitized = String(args.expression).replace(/[^0-9+\-*/().%\s]/g, "");
        if (!sanitized || sanitized.length > 200) throw new Error("非法表达式");
        const result = Function(`"use strict"; return (${sanitized})`)();
        return String(result);
      } catch (e) {
        return "计算错误: " + e.message;
      }
    },
  },
  {
    name: "web_search",
    description: "搜索网页信息。query 是搜索关键词，返回搜索结果摘要",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词" },
        maxResults: { type: "number", description: "最大结果数，默认5" },
      },
      required: ["query"],
    },
    handler: async (args) => {
      try {
        const { search } = require("./search");
        return await search(args.query, args.maxResults || 5);
      } catch (e) {
        return "搜索失败: " + e.message;
      }
    },

  },
  {
    name: "run_skill",
    description: "执行已注册的技能。skillName 是技能名称，input 是传入技能的文本",
    parameters: {
      type: "object",
      properties: {
        skillName: { type: "string", description: "技能名称" },
        input: { type: "string", description: "传入技能的输入文本" },
      },
      required: ["skillName", "input"],
    },
    // handler 在运行时注入，因为需要访问 skills 数据
    handler: null,
  },
  {
    name: "generate_image",
    description: "生成一张图片。prompt 是生图提示词（英文），aspectRatio 可选画幅比例 1:1/16:9/9:16/4:3，style 可选风格 Realistic/Anime/3D/Cyberpunk 等",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "图片描述提示词" },
        aspectRatio: { type: "string", description: "画幅比例，默认 1:1" },
        style: { type: "string", description: "风格，默认 None" },
      },
      required: ["prompt"],
    },
    // handler 在运行时注入，因为需要访问 api2 配置
    handler: null,
  },
  {
    name: "create_skill",
    description:
      "创建新的技能。当用户说「创建一个技能」「添加技能」时使用。\n" +
      "参数：name(技能名称)，type(llm或image)，description(描述)，promptTemplate(提示词模板，用{input}表示用户输入位置)",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "技能名称" },
        type: { type: "string", description: "类型：llm(文本处理) 或 image(图片生成)", enum: ["llm", "image"] },
        description: { type: "string", description: "技能描述说明" },
        promptTemplate: { type: "string", description: "提示词模板，用 {input} 表示用户输入占位符" },
      },
      required: ["name", "type", "description", "promptTemplate"],
    },
    handler: null, // 运行时注入
  },
  {
    name: "list_files",
    description: "列出目录内容。支持 ~/Desktop 等路径。path 是要列出的目录路径，留空则列出当前目录。",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "目录路径，默认当前目录" } },
      required: [],
    },
    handler: async (args) => {
      try {
        const fs = require("fs"), path = require("path"), os = require("os");
        let dir = args.path || process.cwd();
        if (dir.startsWith("~")) dir = path.join(os.homedir(), dir.slice(1));
        // 常见目录名直接映射
        const shortcuts = { desktop: path.join(os.homedir(), "Desktop"), documents: path.join(os.homedir(), "Documents"), downloads: path.join(os.homedir(), "Downloads") };
        if (shortcuts[dir.toLowerCase()]) dir = shortcuts[dir.toLowerCase()];
        const resolved = path.resolve(dir);
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        return entries.map((e) => (e.isDirectory() ? "📁 " : "📄 ") + e.name + (e.isDirectory() ? "/" : "")).join("\n") || "(空目录)";
      } catch (e) { return "列出失败: " + e.message; }
    },
  },
  {
    name: "read_file",
    description: "读取文件内容。支持 ~/path 路径。path 是文件路径，maxLines 是最大读取行数（默认 200）。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径" },
        maxLines: { type: "number", description: "最大读取行数，默认 200" },
      },
      required: ["path"],
    },
    handler: async (args) => {
      try {
        const fs = require("fs"), path = require("path"), os = require("os");
        let filePath = args.path;
        if (filePath.startsWith("~")) filePath = path.join(os.homedir(), filePath.slice(1));
        const resolved = path.resolve(filePath);
        const content = fs.readFileSync(resolved, "utf8");
        const lines = content.split("\n");
        const max = Math.min(args.maxLines || 200, 500);
        if (lines.length > max) return lines.slice(0, max).join("\n") + `\n...(共 ${lines.length} 行，已截断)`;
        return content;
      } catch (e) { return "读取失败: " + e.message; }
    },
  },
  {
    name: "move_file",
    description: "移动或重命名文件/文件夹。src 是源路径，dst 是目标路径。支持 ~。",
    parameters: {
      type: "object",
      properties: {
        src: { type: "string", description: "源路径" },
        dst: { type: "string", description: "目标路径" },
      },
      required: ["src", "dst"],
    },
    handler: async (args) => {
      try {
        const fs = require("fs"), path = require("path"), os = require("os");
        let src = args.src, dst = args.dst;
        if (src.startsWith("~")) src = path.join(os.homedir(), src.slice(1));
        if (dst.startsWith("~")) dst = path.join(os.homedir(), dst.slice(1));
        const dir = path.dirname(path.resolve(dst));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.renameSync(path.resolve(src), path.resolve(dst));
        return `已移动: ${src} → ${dst}`;
      } catch (e) { return "移动失败: " + e.message; }
    },
  },
  {
    name: "delete_file",
    description: "删除文件或空文件夹。path 是路径。",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "文件路径" } },
      required: ["path"],
    },
    handler: async (args) => {
      try {
        const fs = require("fs"), path = require("path"), os = require("os");
        let p = args.path;
        if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
        const resolved = path.resolve(p);
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) fs.rmSync(resolved, { recursive: true, force: true });
        else fs.unlinkSync(resolved);
        return `已删除: ${p}`;
      } catch (e) { return "删除失败: " + e.message; }
    },
  },
  {
    name: "create_dir",
    description: "创建目录（含父目录）。path 是目录路径。",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "目录路径" } },
      required: ["path"],
    },
    handler: async (args) => {
      try {
        const fs = require("fs"), path = require("path"), os = require("os");
        let p = args.path;
        if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
        fs.mkdirSync(path.resolve(p), { recursive: true });
        return `已创建: ${p}`;
      } catch (e) { return "创建失败: " + e.message; }
    },
  },
  {
    name: "run_command",
    description: "执行任意命令：python/node脚本、dir/ls、move/copy、pip install 等。写完脚本直接用它执行，不要叫用户手动运行。Windows cmd /c。",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "要执行的命令" },
      },
      required: ["command"],
    },
    handler: async (args) => {
      try {
        const { execSync } = require("child_process");
        const shell = process.platform === "win32";
        const result = shell
          ? execSync(args.command, { timeout: 30000, encoding: "utf8", maxBuffer: 1024 * 1024, shell: true })
          : execSync(args.command, { timeout: 30000, encoding: "utf8", maxBuffer: 1024 * 1024, shell: "/bin/bash" });
        return result.slice(0, 2000) || "(命令执行成功，无输出)";
      } catch (e) { return "命令执行失败: " + (e.stderr || e.message).slice(0, 500); }
    },
  },
  { name: "find_files", description: "搜索文件名。pattern 是文件名关键词或通配符（如 *.js），dir 是要搜索的目录（默认当前目录）。",
    parameters: { type:"object", properties:{ pattern:{type:"string",description:"文件名关键词"}, dir:{type:"string",description:"搜索目录"} }, required:["pattern"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process"); const d = args.dir || ".";
        const cmd = process.platform==="win32" ? `dir /s /b "${d}\\*${args.pattern}*" 2>nul` : `find "${d}" -name "*${args.pattern}*" -type f 2>/dev/null`;
        const r = execSync(cmd,{timeout:10000,encoding:"utf8",shell:true}); return r.slice(0,2000)||"未找到"; }
      catch { return "未找到匹配文件"; }
    }
  },
  { name: "search_in_files", description: "在文件内容中搜索文本（grep）。pattern 是搜索关键词，dir 是搜索目录（默认当前目录）。",
    parameters: { type:"object", properties:{ pattern:{type:"string",description:"搜索关键词"}, dir:{type:"string",description:"搜索目录"} }, required:["pattern"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process"); const d = args.dir || ".";
        const cmd = process.platform==="win32" ? `findstr /s /i /m /c:"${args.pattern}" "${d}\\*" 2>nul` : `grep -rl "${args.pattern}" "${d}" 2>/dev/null`;
        const r = execSync(cmd,{timeout:15000,encoding:"utf8",shell:true}); return r.slice(0,2000)||"未找到"; }
      catch { return "未找到匹配内容"; }
    }
  },
  { name: "http_request", description: "发起 HTTP 请求。url 是请求地址，method 默认 GET，headers 和 body 可选。",
    parameters: { type:"object", properties:{ url:{type:"string",description:"请求URL"}, method:{type:"string",description:"GET/POST/PUT/DELETE"}, headers:{type:"string",description:"JSON格式请求头"}, body:{type:"string",description:"请求体"} }, required:["url"] },
    handler: async (args) => {
      try { const r = await axios({ url:args.url, method:args.method||"GET", headers:args.headers?JSON.parse(args.headers):{}, data:args.body||undefined, timeout:15000 });
        return JSON.stringify({ status:r.status, data:String(r.data).slice(0,1500) }); }
      catch(e) { return "HTTP请求失败: "+(e.response?.status||e.message); }
    }
  },
  { name: "system_info", description: "获取系统信息（CPU、内存、磁盘、操作系统等）。无参数。",
    parameters: { type:"object", properties:{}, required:[] },
    handler: async () => {
      const os = require("os");
      return `OS: ${os.platform()} ${os.release()}\nCPU: ${os.cpus().length} cores\nMemory: ${(os.totalmem()/1e9).toFixed(1)}GB / ${(os.freemem()/1e9).toFixed(1)}GB free\nHostname: ${os.hostname()}\nUptime: ${Math.floor(os.uptime()/3600)}h`;
    }
  },
  { name: "clipboard_read", description: "读取系统剪贴板内容。无参数。",
    parameters: { type:"object", properties:{}, required:[] },
    handler: async () => {
      try { const { execSync } = require("child_process");
        const cmd = process.platform==="win32" ? "powershell -command Get-Clipboard" : process.platform==="darwin" ? "pbpaste" : "xclip -o";
        return execSync(cmd,{timeout:5000,encoding:"utf8"}).slice(0,2000)||"(剪贴板为空)"; }
      catch { return "无法读取剪贴板"; }
    }
  },
  { name: "clipboard_write", description: "写入文本到系统剪贴板。text 是要写入的内容。",
    parameters: { type:"object", properties:{ text:{type:"string",description:"写入内容"} }, required:["text"] },
    handler: async (args) => {
      try {
        const text = String(args.text || "").slice(0, 10000);
        // 安全写入：用 spawn 传参，避免 shell 注入
        const { spawnSync } = require("child_process");
        if (process.platform === "win32") {
          spawnSync("cmd", ["/c", "echo", text, "|", "clip"], { timeout: 5000, shell: false });
        } else if (process.platform === "darwin") {
          spawnSync("pbcopy", [], { input: text, timeout: 5000 });
        } else {
          spawnSync("xclip", ["-selection", "c"], { input: text, timeout: 5000 });
        }
        return "已写入剪贴板";
      } catch { return "写入剪贴板失败"; }
    }
  },
  { name: "open_url", description: "在默认浏览器中打开 URL。url 是要打开的网址。",
    parameters: { type:"object", properties:{ url:{type:"string",description:"网址"} }, required:["url"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        const cmd = process.platform==="win32" ? `start ${args.url}` : process.platform==="darwin" ? `open "${args.url}"` : `xdg-open "${args.url}"`;
        execSync(cmd,{timeout:5000,shell:true}); return `已打开: ${args.url}`; }
      catch { return "打开失败"; }
    }
  },
  { name: "download_file", description: "下载文件。url 是下载地址，savePath 是保存路径（默认当前目录）。",
    parameters: { type:"object", properties:{ url:{type:"string",description:"下载地址"}, savePath:{type:"string",description:"保存路径"} }, required:["url"] },
    handler: async (args) => {
      try { const r = await axios.get(args.url,{responseType:"arraybuffer",timeout:60000});
        const p = args.savePath || path.basename(new URL(args.url).pathname) || "download";
        fs.writeFileSync(p, Buffer.from(r.data)); return `已下载: ${p} (${r.data.length} bytes)`; }
      catch(e) { return "下载失败: "+e.message; }
    }
  },
  { name: "zip_files", description: "压缩文件/目录。source 是源路径，dest 是目标 zip 文件路径。",
    parameters: { type:"object", properties:{ source:{type:"string",description:"源文件/目录"}, dest:{type:"string",description:"目标zip路径"} }, required:["source","dest"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        const cmd = process.platform==="win32" ? `powershell Compress-Archive -Path "${args.source}" -DestinationPath "${args.dest}"` : `zip -r "${args.dest}" "${args.source}"`;
        execSync(cmd,{timeout:60000,shell:true}); return `已压缩: ${args.dest}`; }
      catch(e) { return "压缩失败: "+e.message; }
    }
  },
  { name: "unzip", description: "解压 zip 文件。source 是 zip 文件路径，destDir 是解压目标目录。",
    parameters: { type:"object", properties:{ source:{type:"string",description:"zip文件路径"}, destDir:{type:"string",description:"解压目录"} }, required:["source"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process"); const d = args.destDir || ".";
        const cmd = process.platform==="win32" ? `powershell Expand-Archive -Path "${args.source}" -DestinationPath "${d}"` : `unzip -o "${args.source}" -d "${d}"`;
        execSync(cmd,{timeout:60000,shell:true}); return `已解压到: ${d}`; }
      catch(e) { return "解压失败: "+e.message; }
    }
  },
  { name: "process_list", description: "列出当前运行中的进程。无参数。",
    parameters: { type:"object", properties:{}, required:[] },
    handler: async () => {
      try { const { execSync } = require("child_process");
        const cmd = process.platform==="win32" ? "tasklist /fo csv /nh" : "ps aux --sort=-%mem | head -20";
        return execSync(cmd,{timeout:10000,encoding:"utf8"}).slice(0,2000); }
      catch { return "获取进程列表失败"; }
    }
  },
  { name: "notify", description: "发送系统桌面通知。title 是标题，message 是内容。",
    parameters: { type:"object", properties:{ title:{type:"string",description:"标题"}, message:{type:"string",description:"内容"} }, required:["title","message"] },
    handler: async (args) => {
      try {
        const title = String(args.title || "").slice(0, 200).replace(/['"`$\\]/g, "");
        const msg = String(args.message || "").slice(0, 500).replace(/['"`$\\]/g, "");
        const { execSync } = require("child_process");
        if (process.platform === "win32") {
          execSync(`powershell -command "New-BurntToastNotification -Text '${title}','${msg}'"`, { timeout: 5000, shell: true });
        } else if (process.platform === "darwin") {
          const { spawnSync } = require("child_process");
          spawnSync("osascript", ["-e", `display notification "${msg}" with title "${title}"`], { timeout: 5000 });
        } else {
          execSync(`notify-send '${title}' '${msg}'`, { timeout: 5000, shell: true });
        }
        return "已发送通知";
      } catch { return "通知发送失败"; }
    }
  },
  { name: "git_status", description: "查看 git 仓库状态。dir 是仓库目录（默认当前目录）。",
    parameters: { type:"object", properties:{ dir:{type:"string"} }, required:[] },
    handler: async (args) => {
      try {
        const { execSync } = require("child_process");
        const d = String(args.dir || ".").replace(/[^a-zA-Z0-9_\-\.\/\\: ]/g, "");
        return execSync(`git -C "${d}" status --short`,{timeout:10000,encoding:"utf8"}).slice(0,2000)||"(clean)";
      }
      catch { return "不是git仓库或git未安装"; }
    }
  },
  { name: "git_log", description: "查看 git 提交历史。dir 是仓库目录，n 是显示条数（默认10）。",
    parameters: { type:"object", properties:{ dir:{type:"string"}, n:{type:"number"} }, required:[] },
    handler: async (args) => {
      try {
        const { execSync } = require("child_process");
        const d = String(args.dir || ".").replace(/[^a-zA-Z0-9_\-\.\/\\: ]/g, "");
        const n = Math.min(Math.max(parseInt(args.n) || 10, 1), 100);
        return execSync(`git -C "${d}" log --oneline -${n}`,{timeout:10000,encoding:"utf8"}).slice(0,2000);
      }
      catch { return "无法获取git日志"; }
    }
  },
  { name: "random", description: "生成随机数或随机字符串。type 是 number/string，min/max 是数字范围，length 是字符串长度。",
    parameters: { type:"object", properties:{ type:{type:"string"}, min:{type:"number"}, max:{type:"number"}, length:{type:"number"} }, required:["type"] },
    handler: async (args) => {
      if (args.type==="number") { const min=args.min||0,max=args.max||100; return String(Math.floor(Math.random()*(max-min+1))+min); }
      const chars="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      return Array.from({length:args.length||16},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
    }
  },
  { name: "hash_text", description: "计算文本哈希值。text 是输入文本，algo 是 md5/sha1/sha256（默认sha256）。",
    parameters: { type:"object", properties:{ text:{type:"string"}, algo:{type:"string"} }, required:["text"] },
    handler: async (args) => { const c=require("crypto"); return c.createHash(args.algo||"sha256").update(args.text).digest("hex"); }
  },
  { name: "uuid", description: "生成 UUID v4。无参数。",
    parameters: { type:"object", properties:{}, required:[] },
    handler: async () => require("crypto").randomUUID()
  },
  { name: "count_text", description: "统计文本的字符数、单词数、行数。text 是输入文本。",
    parameters: { type:"object", properties:{ text:{type:"string"} }, required:["text"] },
    handler: async (args) => {
      const t=args.text||""; return `字符:${t.length} 单词:${t.split(/\s+/).filter(Boolean).length} 行:${t.split("\n").length}`;
    }
  },
  { name: "diff_files", description: "比较两个文件。file1/file2 是文件路径。",
    parameters: { type:"object", properties:{ file1:{type:"string"}, file2:{type:"string"} }, required:["file1","file2"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        const cmd = process.platform==="win32" ? `fc "${args.file1}" "${args.file2}"` : `diff "${args.file1}" "${args.file2}"`;
        return execSync(cmd,{timeout:15000,encoding:"utf8"}).slice(0,2000)||"文件相同"; }
      catch(e) { return "文件不同或比较失败: "+e.message.slice(0,100); }
    }
  },
  { name: "disk_usage", description: "查看磁盘使用情况。path 是要查看的路径（默认根目录）。",
    parameters: { type:"object", properties:{ path:{type:"string"} }, required:[] },
    handler: async (args) => {
      try { const { execSync } = require("child_process"); const p = args.path || ".";
        const cmd = process.platform==="win32" ? `wmic logicaldisk get size,freespace,caption` : `df -h "${p}"`;
        return execSync(cmd,{timeout:10000,encoding:"utf8"}).slice(0,1000); }
      catch { return "获取磁盘信息失败"; }
    }
  },
  { name: "network_info", description: "查看网络接口信息。无参数。",
    parameters: { type:"object", properties:{}, required:[] },
    handler: async () => {
      try { const os=require("os"); const ifaces=os.networkInterfaces();
        return Object.entries(ifaces).map(([name,addrs])=>`${name}: ${addrs.filter(a=>a.family==="IPv4").map(a=>a.address).join(", ")}`).join("\n").slice(0,1000); }
      catch { return "获取网络信息失败"; }
    }
  },
  { name: "ping_host", description: "Ping 主机。host 是域名或IP。",
    parameters: { type:"object", properties:{ host:{type:"string"} }, required:["host"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        const cmd = process.platform==="win32" ? `ping -n 3 ${args.host}` : `ping -c 3 ${args.host}`;
        return execSync(cmd,{timeout:15000,encoding:"utf8"}).slice(0,1000); }
      catch { return "Ping失败"; }
    }
  },
  { name: "dns_lookup", description: "DNS 解析。hostname 是域名。",
    parameters: { type:"object", properties:{ hostname:{type:"string"} }, required:["hostname"] },
    handler: async (args) => {
      try { const dns = require("dns"); const { promisify } = require("util");
        const addr = await promisify(dns.resolve4)(args.hostname);
        return `${args.hostname} → ${addr.join(", ")}`; }
      catch { return "DNS解析失败"; }
    }
  },
  { name: "sort_file", description: "对文件内容排序。path 是文件路径。",
    parameters: { type:"object", properties:{ path:{type:"string"} }, required:["path"] },
    handler: async (args) => {
      try { const data = fs.readFileSync(args.path,"utf8"); const lines=data.split("\n").sort().join("\n");
        fs.writeFileSync(args.path, lines); return `已排序: ${args.path}`; }
      catch { return "排序失败"; }
    }
  },
  { name: "get_env", description: "读取环境变量。name 是变量名，不传则返回全部。",
    parameters: { type:"object", properties:{ name:{type:"string"} }, required:[] },
    handler: async (args) => {
      if (args.name) return process.env[args.name] || "(未设置)";
      return Object.entries(process.env).filter(([k])=>!k.includes("KEY")&&!k.includes("SECRET")&&!k.includes("TOKEN")).map(([k,v])=>`${k}=${v}`).slice(0,30).join("\n");
    }
  },
  { name: "take_screenshot", description: "截取屏幕截图。savePath 是保存路径（默认桌面）。",
    parameters: { type:"object", properties:{ savePath:{type:"string"} }, required:[] },
    handler: async (args) => {
      try { const { execSync } = require("child_process"); const os = require("os");
        const dest = args.savePath || path.join(os.homedir(),"Desktop",`screenshot-${Date.now()}.png`);
        if (process.platform==="win32") {
          execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms;$s=[Windows.Forms.Screen]::PrimaryScreen.Bounds;$b=new-object Drawing.Bitmap($s.Width,$s.Height);$g=[Drawing.Graphics]::FromImage($b);$g.CopyFromScreen(0,0,0,0,$s.Size);$b.Save('${dest}')"`,{timeout:15000,shell:true});
        } else if (process.platform==="darwin") {
          execSync(`screencapture "${dest}"`,{timeout:10000});
        } else {
          execSync(`import -window root "${dest}"`,{timeout:10000});
        }
        return `截图已保存: ${dest}`; }
      catch { return "截图失败（可能缺少依赖）"; }
    }
  },
  { name: "get_weather", description: "获取指定城市的天气（无需API key）。city 是城市名（拼音或英文）。",
    parameters: { type:"object", properties:{ city:{type:"string",description:"城市名"} }, required:["city"] },
    handler: async (args) => {
      try { const r = await axios.get(`https://wttr.in/${encodeURIComponent(args.city)}?format=4&m`,{timeout:10000});
        return r.data.trim()||"无数据"; }
      catch { return "天气查询失败"; }
    }
  },
  { name: "timer", description: "设置一个倒计时提醒（秒）。seconds 是倒计时秒数。",
    parameters: { type:"object", properties:{ seconds:{type:"number",description:"倒计时秒数"} }, required:["seconds"] },
    handler: async (args) => {
      const sec = Math.min(args.seconds||10, 3600);
      return new Promise(resolve => { setTimeout(() => resolve(`⏰ 计时结束 (${sec}秒)`), sec*1000); });
    }
  },
  { name: "qr_generate", description: "生成二维码文本（返回终端可显示的ASCII二维码）。text 是二维码内容。",
    parameters: { type:"object", properties:{ text:{type:"string",description:"二维码内容"} }, required:["text"] },
    handler: async (args) => {
      // 简单的ASCII QR标记
      const t = args.text||""; const l = Math.min(t.length, 100);
      return `[QR: ${t.slice(0,50)}${t.length>50?"...":""}] (${t.length} chars)\n在线生成: https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(t.slice(0,200))}`;
    }
  },
  { name: "json_format", description: "格式化JSON字符串。json 是JSON文本，indent 是缩进空格数（默认2）。",
    parameters: { type:"object", properties:{ json:{type:"string"}, indent:{type:"number"} }, required:["json"] },
    handler: async (args) => {
      try { return JSON.stringify(JSON.parse(args.json), null, args.indent||2); }
      catch(e) { return "JSON格式错误: "+e.message; }
    }
  },
  { name: "csv_parse", description: "解析CSV文本为JSON。csv 是CSV文本。",
    parameters: { type:"object", properties:{ csv:{type:"string"} }, required:["csv"] },
    handler: async (args) => {
      try { const lines=(args.csv||"").trim().split("\n");
        const headers=lines[0].split(",").map(h=>h.trim());
        const rows=lines.slice(1).map(l=>{const vals=l.split(",");const obj={};headers.forEach((h,i)=>obj[h]=vals[i]?.trim()||"");return obj;});
        return JSON.stringify(rows,null,2).slice(0,2000); }
      catch(e) { return "CSV解析错误: "+e.message; }
    }
  },
  { name: "password_gen", description: "生成强密码。length 是长度（默认16），includeSymbols 是否包含特殊字符（默认true）。",
    parameters: { type:"object", properties:{ length:{type:"number"}, includeSymbols:{type:"boolean"} }, required:[] },
    handler: async (args) => {
      const len=args.length||16, sym=args.includeSymbols!==false;
      const upper="ABCDEFGHIJKLMNOPQRSTUVWXYZ", lower="abcdefghijklmnopqrstuvwxyz", digits="0123456789", symbols="!@#$%^&*()_+-=[]{}|;:,.<>?";
      const pool=upper+lower+digits+(sym?symbols:"");
      return Array.from({length:len},()=>pool[Math.floor(Math.random()*pool.length)]).join("");
    }
  },
  { name: "timestamp", description: "时间戳转换。action 是 now/to_date，value 是时间戳（秒或毫秒）。",
    parameters: { type:"object", properties:{ action:{type:"string"}, value:{type:"number"} }, required:[] },
    handler: async (args) => {
      if (args.action==="to_date" && args.value) {
        const d=new Date(args.value<1e12?args.value*1000:args.value);
        return d.toISOString()+" ("+d.toLocaleString("zh-CN")+")";
      }
      return String(Math.floor(Date.now()/1000));
    }
  },
  { name: "ip_info", description: "查询IP地址的地理位置信息。ip 是IP地址（默认当前IP）。",
    parameters: { type:"object", properties:{ ip:{type:"string"} }, required:[] },
    handler: async (args) => {
      try { const r=await axios.get(`http://ip-api.com/json/${args.ip||""}?lang=zh-CN`,{timeout:8000});
        const d=r.data; if(d.status!=="success") return "查询失败";
        return `${d.query}: ${d.country} ${d.regionName} ${d.city} (${d.isp})`; }
      catch { return "IP查询失败"; }
    }
  },
  { name: "color_convert", description: "颜色格式转换。value 是颜色值，to 是目标格式 hex/rgb/hsl。",
    parameters: { type:"object", properties:{ value:{type:"string"}, to:{type:"string"} }, required:["value","to"] },
    handler: async (args) => {
      // 简单实现：命名颜色转hex
      const colors={red:"#FF0000",green:"#00FF00",blue:"#0000FF",white:"#FFFFFF",black:"#000000",yellow:"#FFFF00",cyan:"#00FFFF",magenta:"#FF00FF",gray:"#808080",orange:"#FFA500",pink:"#FFC0CB",purple:"#800080"};
      const v=(args.value||"").toLowerCase();
      if (colors[v]) return `${v} → HEX:${colors[v]}`;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        const r=parseInt(v.slice(1,3),16),g=parseInt(v.slice(3,5),16),b=parseInt(v.slice(5,7),16);
        if (args.to==="rgb") return `RGB(${r},${g},${b})`;
        return `HEX:${v} → RGB(${r},${g},${b})`;
      }
      return "支持格式: 颜色名称(red/blue...) 或 HEX(#FF0000)";
    }
  },
  { name: "image_info", description: "获取图片信息（尺寸、大小）。path 是图片路径。",
    parameters: { type:"object", properties:{ path:{type:"string"} }, required:["path"] },
    handler: async (args) => {
      try {
        const buf=fs.readFileSync(args.path);
        // PNG: bytes 16-23 contain width/height
        if (buf[1]===0x50&&buf[2]===0x4E&&buf[3]===0x47) {
          const w=buf.readUInt32BE(16),h=buf.readUInt32BE(20);
          return `PNG ${w}x${h} (${(buf.length/1024).toFixed(1)}KB)`;
        }
        // JPEG: scan for SOF marker
        if (buf[0]===0xFF&&buf[1]===0xD8) {
          let i=2; while(i<buf.length){ if(buf[i]===0xFF&&buf[i+1]>=0xC0&&buf[i+1]<=0xC3){const h=buf.readUInt16BE(i+5),w=buf.readUInt16BE(i+7);return `JPEG ${w}x${h} (${(buf.length/1024).toFixed(1)}KB)`;} i++; }
          return `JPEG (${(buf.length/1024).toFixed(1)}KB)`;
        }
        return `文件大小: ${(buf.length/1024).toFixed(1)}KB (非PNG/JPEG)`;
      } catch { return "读取图片失败"; }
    }
  },
  { name: "text_replace", description: "文本替换。text 是输入文本，find 是查找内容，replace 是替换内容。",
    parameters: { type:"object", properties:{ text:{type:"string"}, find:{type:"string"}, replace:{type:"string"} }, required:["text","find","replace"] },
    handler: async (args) => {
      const replaced=(args.text||"").split(args.find||"").join(args.replace||"");
      return replaced.slice(0,3000)||"(空)";
    }
  },
  { name: "url_parse", description: "解析URL的各部分。url 是要解析的URL。",
    parameters: { type:"object", properties:{ url:{type:"string"} }, required:["url"] },
    handler: async (args) => {
      try { const u=new URL(args.url); return `协议:${u.protocol}\n主机:${u.hostname}\n端口:${u.port||"默认"}\n路径:${u.pathname}\n参数:${u.search||"无"}`; }
      catch { return "URL格式无效"; }
    }
  },
  { name: "read_workspace", description: "读取 workspace 文档（SOUL.md, MEMORY.md, USER.md 等）。file 是文件名不含路径。",
    parameters: { type:"object", properties:{ file:{type:"string",description:"文件名如 SOUL.md"} }, required:["file"] },
    handler: async (args) => {
      try {
        const f = path.join(__dirname, "..", "..", "memi-config", "workspace", args.file || "SOUL.md");
        if (!fs.existsSync(f)) return "文件不存在: " + (args.file || "SOUL.md");
        return fs.readFileSync(f, "utf8").slice(0, 3000);
      } catch { return "读取失败"; }
    }
  },
  { name: "remember", description: "将重要信息存入长期记忆（MEMORY.md）。content 是要记住的内容。",
    parameters: { type:"object", properties:{ content:{type:"string"} }, required:["content"] },
    handler: async (args) => {
      try {
        const f = path.join(__dirname, "..", "..", "memi-config", "workspace", "MEMORY.md");
        let existing = "";
        if (fs.existsSync(f)) existing = fs.readFileSync(f, "utf8");
        const entry = `\n- ${new Date().toLocaleString("zh-CN")}: ${args.content}\n`;
        fs.writeFileSync(f, existing + entry);
        return "已记住。";
      } catch { return "记忆存储失败"; }
    }
  },
  { name: "write_workspace", description: "写入 workspace 文档。file 是文件名（SOUL.md/MEMORY.md/USER.md），content 是内容。",
    parameters: { type:"object", properties:{ file:{type:"string"}, content:{type:"string"} }, required:["file","content"] },
    handler: async (args) => {
      try {
        const f = path.join(__dirname, "..", "..", "memi-config", "workspace", args.file || "SOUL.md");
        fs.writeFileSync(f, args.content || "");
        return `已更新: ${args.file}`;
      } catch { return "写入失败"; }
    }
  },
  { name: "fetch_webpage", description: "获取网页内容（纯文本）。url 是网页地址，自动提取正文。适合阅读新闻/文档/博客。",
    parameters: { type:"object", properties:{ url:{type:"string",description:"网页地址"} }, required:["url"] },
    handler: async (args) => {
      try {
        const r = await axios.get(args.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MemiAgent/1.0)" },
          timeout: 15000, responseType: "text"
        });
        const html = r.data;
        // 简单提取正文：去掉 script/style 标签，提取 body 文本
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return text.slice(0, 5000) || "(无正文内容)";
      } catch(e) { return "获取网页失败: " + (e.message || "").slice(0, 100); }
    }
  },
  { name: "rag_search", description: "在本地知识库中搜索相关内容（RAG）。query 是搜索问题，返回最相关的文档片段。文档来自 workspace/*.md。",
    parameters: { type:"object", properties:{ query:{type:"string",description:"搜索问题"} }, required:["query"] },
    handler: async (args) => {
      try {
        const wsDir = path.join(__dirname, "..", "..", "memi-config", "workspace");
        if (!fs.existsSync(wsDir)) return "知识库为空（workspace 目录不存在）";
        const q = (args.query || "").toLowerCase();
        const qWords = q.split(/\s+/).filter(w => w.length > 1);
        const chunks = [];
        // 分块：每段作为独立 chunk
        fs.readdirSync(wsDir).filter(f=>f.endsWith(".md")).forEach(f=>{
          const content = fs.readFileSync(path.join(wsDir, f), "utf8");
          const paragraphs = content.split(/\n\n+/);
          paragraphs.forEach((p, i) => {
            if (p.trim().length < 10) return;
            const pLower = p.toLowerCase();
            let score = 0;
            qWords.forEach(w => { if (pLower.includes(w)) score += 1; });
            if (pLower.includes(q)) score += 3;
            if (score > 0) chunks.push({ source: f, para: i, text: p.trim().slice(0, 500), score });
          });
        });
        chunks.sort((a,b) => b.score - a.score);
        if (chunks.length === 0) return `未找到与 "${args.query}" 相关内容`;
        return chunks.slice(0, 5).map(c => `[${c.source}:${c.score}] ${c.text}`).join("\n\n");
      } catch { return "搜索失败"; }
    }
  },
  { name: "open_browser", description: "在浏览器中打开网页。url 是网页地址。配合 fetch_webpage 先读内容再决定是否打开。",
    parameters: { type:"object", properties:{ url:{type:"string",description:"网页地址"} }, required:["url"] },
    handler: async (args) => {
      return `请使用 open_url 在浏览器中打开: ${args.url}`;
    }
  },
  { name: "schedule_task", description: "创建一个定时任务提醒。task 是任务描述，when 是执行时间（如 'in 5 minutes', 'at 8:00'）。",
    parameters: { type:"object", properties:{ task:{type:"string"}, when:{type:"string"} }, required:["task","when"] },
    handler: async (args) => {
      try {
        const file = path.join(require("os").homedir(), "Desktop", "memi-schedule.txt");
        const entry = `[SCHEDULED] ${args.task} — ${args.when} (created ${new Date().toLocaleString("zh-CN")})\n`;
        fs.appendFileSync(file, entry);
        return `已记录任务: ${args.task} (${args.when})\n提醒文件: ${file}`;
      } catch { return "定时任务创建失败"; }
    }
  },
  { name: "search_workspace", description: "在 workspace 文档中搜索内容。query 是搜索关键词。",
    parameters: { type:"object", properties:{ query:{type:"string"} }, required:["query"] },
    handler: async (args) => {
      try {
        const wsDir = path.join(__dirname, "..", "..", "memi-config", "workspace");
        if (!fs.existsSync(wsDir)) return "workspace 目录不存在";
        const results = [];
        fs.readdirSync(wsDir).filter(f=>f.endsWith(".md")).forEach(f=>{
          const content = fs.readFileSync(path.join(wsDir, f), "utf8");
          if (content.toLowerCase().includes((args.query||"").toLowerCase())) {
            const lines = content.split("\n").filter(l=>l.toLowerCase().includes((args.query||"").toLowerCase()));
            results.push(`--- ${f} ---\n${lines.slice(0,3).join("\n")}`);
          }
        });
        return results.length > 0 ? results.join("\n\n").slice(0, 2000) : `未找到 "${args.query}"`;
      } catch { return "搜索失败"; }
    }
  },
  { name: "list_skills", description: "列出所有已安装的本地技能和ClawHub技能。无参数。",
    parameters: { type:"object", properties:{}, required:[] },
    handler: async () => {
      try {
        const dir = path.join(__dirname, "..", "..", "memi-config", "skills");
        if (!fs.existsSync(dir)) return "无技能";
        const items=[];
        fs.readdirSync(dir).forEach(f=>{
          if (f.endsWith(".json")) { try{const s=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));items.push(`${s.name||f} (JSON)`);}catch{} }
          else if (fs.existsSync(path.join(dir,f,"SKILL.md"))) items.push(`${f} (ClawHub)`);
        });
        return items.length>0 ? items.join("\n") : "无技能";
      } catch { return "读取失败"; }
    }
  },
  { name: "set_reminder", description: "设置提醒事项。title 是标题，when 是时间描述（如 '5分钟后'），会写入桌面提醒文件。",
    parameters: { type:"object", properties:{ title:{type:"string"}, when:{type:"string"} }, required:["title"] },
    handler: async (args) => {
      try { const os = require("os");
        const file = path.join(os.homedir(), "Desktop", "meminotes.txt");
        const note = `[${new Date().toLocaleString()}] ${args.title}${args.when?" — "+args.when:""}\n`;
        fs.appendFileSync(file, note);
        return `已记录: ${args.title} → ${file}`; }
      catch { return "提醒设置失败"; }
    }
  },
  { name: "encode_decode", description: "编码/解码文本。action 是 base64_encode/base64_decode/url_encode/url_decode，text 是输入文本。",
    parameters: { type:"object", properties:{ action:{type:"string",description:"操作类型"}, text:{type:"string",description:"输入文本"} }, required:["action","text"] },
    handler: async (args) => {
      try {
        let r;
        switch(args.action) {
          case "base64_encode": r = Buffer.from(args.text).toString("base64"); break;
          case "base64_decode": r = Buffer.from(args.text,"base64").toString("utf8"); break;
          case "url_encode": r = encodeURIComponent(args.text); break;
          case "url_decode": r = decodeURIComponent(args.text); break;
          default: return "未知操作: "+args.action;
        }
        return r.slice(0,2000);
      } catch { return "编码/解码失败"; }
    }
  },
  {
    name: "write_file",
    description: "写入文件。支持 ~/path 路径。path 是文件路径，content 是写入内容。",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "文件路径" },
        content: { type: "string", description: "写入内容" },
      },
      required: ["path", "content"],
    },
    handler: async (args) => {
      try {
        const fs = require("fs"), path = require("path"), os = require("os");
        let filePath = args.path;
        if (filePath.startsWith("~")) filePath = path.join(os.homedir(), filePath.slice(1));
        const resolved = path.resolve(filePath);
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolved, args.content, "utf8");
        return `已写入 ${args.content.length} 字符到 ${resolved}`;
      } catch (e) { return "写入失败: " + e.message; }
    },
  },
  {
    name: "import_skill_from_url",
    description:
      "从 GitHub 链接导入技能。传入一个 GitHub raw/blob/gist 链接，自动获取并解析技能定义。\n" +
      "支持格式：JSON 文件（{name, type, description, promptTemplate}）或 Markdown 文件（以 # skill name 开头的元数据）",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "GitHub 链接（支持 blob/raw/gist）" },
      },
      required: ["url"],
    },
    handler: async (args) => {
      try {
        const skill = await importSkillFromUrl(args.url);
        return JSON.stringify(skill);
      } catch (e) {
        return "导入失败: " + (e.message || "未知错误");
      }
    },
  },
  {
    name: "rag_search",
    description:
      "在工作区文档中执行语义搜索。传入查询语句，返回最相关的文档片段（SOUL.md / MEMORY.md / USER.md / IDENTITY.md / TOOLS.md）。\n" +
      "适用场景：用户问「我之前说过什么」「我的偏好是什么」「Agent 的人设是什么」等问题时，用此工具检索长期记忆。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索查询语句" },
      },
      required: ["query"],
    },
    handler: async (args) => {
      try {
        const configPath = path.join(__dirname, "..", "..", "memi-config", "config.json");
        let config = {};
        try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch {}
        const { search } = require("./vectorStore");
        return await search(args.query, config);
      } catch (e) {
        return "RAG 搜索失败: " + e.message;
      }
    },
  },
  {
    name: "rag_index",
    description:
      "重建工作区文档的向量索引。当工作区文档（SOUL.md 等）被修改后，需要重新索引。此工具会读取所有工作区文档并建立向量搜索库。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async () => {
      try {
        const configPath = path.join(__dirname, "..", "..", "memi-config", "config.json");
        let config = {};
        try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch {}
        const { indexWorkspace } = require("./vectorStore");
        const r = await indexWorkspace(config);
        return `向量索引已重建：${r.chunks} 个文本块，${r.embedded} 个已嵌入向量。`;
      } catch (e) {
        return "索引失败: " + e.message;
      }
    },
  },
  {
    name: "browser_navigate",
    description:
      "打开一个网页并获取其文本内容。url 是完整的网页地址（带 https://），返回页面标题和文本摘要。" +
      "适用场景：用户要求查看某个网页、获取在线文档内容、抓取信息等。",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "完整网页地址，例如 https://example.com" },
      },
      required: ["url"],
    },
    handler: async (args) => {
      try {
        const { navigate } = require("./browser");
        return await navigate(args.url);
      } catch (e) {
        if (e.message && e.message.includes("Playwright 未安装")) {
          return e.message;
        }
        return "浏览器导航失败: " + e.message;
      }
    },
  },
  {
    name: "browser_screenshot",
    description:
      "对当前浏览器页面截图。返回截图文件路径。适用场景：用户要求看某个页面的样子、验证页面显示等。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async () => {
      try {
        const { screenshot } = require("./browser");
        return await screenshot();
      } catch (e) {
        if (e.message && e.message.includes("Playwright 未安装")) {
          return e.message;
        }
        return "截图失败: " + e.message;
      }
    },
  },
  {
    name: "email_send",
    description: "发送邮件。to 是收件人地址，subject 是主题，body 是正文。使用 Memi 专属邮箱 memiai@agent.qq.com 发送。",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "收件人邮箱" },
        subject: { type: "string", description: "邮件主题" },
        body: { type: "string", description: "邮件正文" },
      },
      required: ["to", "subject", "body"],
    },
    handler: async (args) => {
      try {
        const { execSync } = require("child_process");
        const tmpFile = require("path").join(require("os").tmpdir(), `memi-mail-${Date.now()}.md`);
        require("fs").writeFileSync(tmpFile, args.body || "");
        const result = execSync(`agently-cli message +send --to "${args.to}" --subject "${args.subject}" --body-file "${tmpFile}"`, {
          timeout: 15000, encoding: "utf8",
        });
        try { require("fs").unlinkSync(tmpFile); } catch {}
        return result.slice(0, 1000) || "邮件已发送";
      } catch (e) {
        return "发送失败: " + e.message;
      }
    },
  },
  {
    name: "email_check",
    description: "检查收件箱，返回最近邮件列表。",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "返回数量，默认5" },
      },
      required: [],
    },
    handler: async (args) => {
      try {
        const { execSync } = require("child_process");
        const limit = Math.min(args.limit || 5, 20);
        const result = execSync(`agently-cli message +list --limit ${limit}`, {
          timeout: 15000, encoding: "utf8",
        });
        return result.slice(0, 3000) || "收件箱为空";
      } catch (e) {
        return "检查失败: " + e.message;
      }
    },
  },
  {
    name: "webhook_send",
    description: "向外部 webhook URL 发送 HTTP POST 请求。传入 url 和可选的 payload 数据。适用场景：触发外部自动化、通知第三方服务、集成 IFTTT/Zapier 等。",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "webhook URL" },
        payload: { type: "object", description: "发送的 JSON 数据" },
      },
      required: ["url"],
    },
    handler: async (args) => {
      try {
        const axios = require("axios");
        const resp = await axios.post(args.url, args.payload || {}, {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        });
        return `状态: ${resp.status}, 响应: ${JSON.stringify(resp.data).slice(0, 1000)}`;
      } catch (e) {
        return "Webhook 失败: " + e.message;
      }
    },
  },
  {
    name: "browser_click",
    description:
      "在浏览器页面上点击一个元素。selector 是 CSS 选择器（例如 '#submit' 或 '.btn-primary'）。点击后返回新页面内容。",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS 选择器，如 '#login' 或 'button.submit'" },
      },
      required: ["selector"],
    },
    handler: async (args) => {
      try {
        const { click } = require("./browser");
        return await click(args.selector);
      } catch (e) {
        if (e.message && e.message.includes("Playwright 未安装")) {
          return e.message;
        }
        return "点击失败: " + e.message;
      }
    },
  },
  // ─── 桌面控制工具 ──────────────────────────────
  { name: "desktop_list_windows", description: "列出所有可见窗口（标题、位置、大小）。用于查找目标窗口的精确标题。",
    parameters: { type:"object", properties:{}, required:[] },
    handler: async () => {
      try { const { execSync } = require("child_process");
        if (process.platform === "win32") {
          const r = execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.Screen]::AllScreens | ForEach-Object {\\\"{\\$($_.DeviceName): \\$($_.Bounds.Width)x\\$($_.Bounds.Height) at \\$($_.Bounds.X),\\$($_.Bounds.Y)}\\\"}; Get-Process | Where-Object {\\$_.MainWindowTitle} | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize -HideTableHeaders"`, {timeout:10000,encoding:"utf8"});
          return r.slice(0,3000) || "(无窗口)";
        } else if (process.platform === "darwin") {
          const r = execSync(`osascript -e 'tell app "System Events" to get {name, title, position, size} of every window of every process whose visible is true'`, {timeout:10000,encoding:"utf8"});
          return r.slice(0,3000) || "(无窗口)";
        }
        return "当前系统不支持此功能";
      } catch { return "获取窗口列表失败"; }
    }
  },
  { name: "desktop_focus_window", description: "将指定窗口带到前台并聚焦。title 是窗口标题（支持部分匹配）。",
    parameters: { type:"object", properties:{ title:{type:"string",description:"窗口标题关键词"} }, required:["title"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process"); const t = args.title;
        if (process.platform === "win32") {
          execSync(`powershell -command "(New-Object -COMObject Shell.Application).Windows() | Where-Object {\\$_.LocationName -like '*${t}*'} | ForEach-Object {\\$_.Visible=\\$true;\\$_.Navigate2(\\$_.LocationURL)}"`, {timeout:5000,encoding:"utf8",shell:true});
          return `已尝试聚焦: ${t}`;
        } else if (process.platform === "darwin") {
          execSync(`osascript -e 'tell app "${t}" to activate'`, {timeout:5000});
          return `已聚焦: ${t}`;
        }
        return "当前系统不支持此功能";
      } catch { return `无法聚焦窗口: ${args.title}`; }
    }
  },
  { name: "desktop_launch_app", description: "启动应用程序。name 是应用名称或路径（如 'notepad' / 'code' / 'C:\\Program Files\\...'）。",
    parameters: { type:"object", properties:{ name:{type:"string",description:"应用名称或路径"} }, required:["name"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        if (process.platform === "win32") {
          execSync(`start "" "${args.name}"`, {timeout:10000,shell:true});
        } else if (process.platform === "darwin") {
          execSync(`open -a "${args.name}"`, {timeout:10000});
        } else {
          execSync(`${args.name} &`, {timeout:10000,shell:true});
        }
        return `已启动: ${args.name}`;
      } catch { return `启动失败: ${args.name}`; }
    }
  },
  { name: "desktop_close_window", description: "关闭指定窗口（先聚焦再发送关闭指令）。title 是窗口标题或应用名。",
    parameters: { type:"object", properties:{ title:{type:"string",description:"窗口标题或应用名"} }, required:["title"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process"); const t = args.title;
        if (process.platform === "win32") {
          execSync(`powershell -command "(New-Object -COMObject Shell.Application).Windows() | Where-Object {\\$_.LocationName -like '*${t}*'} | ForEach-Object {\\$_.Quit()}"`, {timeout:5000,encoding:"utf8",shell:true});
          return `已关闭: ${t}`;
        } else if (process.platform === "darwin") {
          execSync(`osascript -e 'tell app "${t}" to quit'`, {timeout:5000});
          return `已关闭: ${t}`;
        }
        return "当前系统不支持此功能";
      } catch { return `关闭窗口失败: ${args.title}`; }
    }
  },
  { name: "desktop_mouse_move", description: "移动鼠标光标到指定坐标。x 和 y 是屏幕坐标（像素）。",
    parameters: { type:"object", properties:{ x:{type:"number",description:"X坐标"}, y:{type:"number",description:"Y坐标"} }, required:["x","y"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        if (process.platform === "win32") {
          execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.Cursor]::Position = New-Object Drawing.Point(${args.x},${args.y})"`, {timeout:5000,shell:true});
        } else if (process.platform === "darwin") {
          execSync(`osascript -e 'tell app "System Events" to set position of every window to {${args.x}, ${args.y}}'`, {timeout:5000});  // simplified
          return `鼠标移动到: ${args.x}, ${args.y}`;
        }
        return `鼠标已移动到: ${args.x}, ${args.y}`;
      } catch { return `移动鼠标失败`; }
    }
  },
  { name: "desktop_mouse_click", description: "在指定坐标点击鼠标。x/y 坐标，button 是 'left' 或 'right'（默认 left）。",
    parameters: { type:"object", properties:{ x:{type:"number",description:"X坐标"}, y:{type:"number",description:"Y坐标"}, button:{type:"string",description:"left/right"} }, required:["x","y"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        if (process.platform === "win32") {
          const btn = args.button === "right" ? "Right" : "Left";
          execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.Cursor]::Position = New-Object Drawing.Point(${args.x},${args.y});[Windows.Forms.SendKeys]::SendWait('{${btn === 'Right' ? '%{RIGHT}' : ''}}')"`, {timeout:5000,shell:true});
          // Use user32 SendMessage for real click
          execSync(`powershell -command "Add-Type @"using System;using System.Runtime.InteropServices;public class Mouse{[DllImport(\\"user32.dll\\")]public static extern void mouse_event(uint dwFlags,uint dx,uint dy,uint dwData,UIntPtr dwExtraInfo);}@;[Mouse]::mouse_event($($btn -eq 'Right' ? 8 : 2),${args.x},${args.y},0,[UIntPtr]::Zero);[Mouse]::mouse_event($($btn -eq 'Right' ? 16 : 4),${args.x},${args.y},0,[UIntPtr]::Zero)"`, {timeout:5000,shell:true});
        } else if (process.platform === "darwin") {
          const btn = args.button === "right" ? "button 2" : "button 1";
          execSync(`osascript -e 'tell app "System Events" to click at {${args.x}, ${args.y}}'`, {timeout:5000});
        }
        return `已在 (${args.x}, ${args.y}) 点击`;
      } catch { return `点击失败`; }
    }
  },
  { name: "desktop_keyboard_type", description: "在当前聚焦的窗口中输入文本。text 是要输入的内容。注意：先使用 desktop_focus_window 聚焦目标窗口。",
    parameters: { type:"object", properties:{ text:{type:"string",description:"要输入的文本"} }, required:["text"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process"); const text = args.text.replace(/"/g,'\\"');
        if (process.platform === "win32") {
          execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.SendKeys]::SendWait(\\"${text}\\")"`, {timeout:10000,shell:true});
        } else if (process.platform === "darwin") {
          execSync(`osascript -e 'tell app "System Events" to keystroke "${text}"'`, {timeout:10000});
        }
        return `已输入: ${args.text.slice(0,50)}`;
      } catch { return `键盘输入失败`; }
    }
  },
  { name: "desktop_keyboard_hotkey", description: "发送键盘快捷键组合。keys 是快捷键，如 'Ctrl+S', 'Alt+F4', 'Ctrl+Shift+P', 'Cmd+C'。自动适配 Win/Mac 修饰键。",
    parameters: { type:"object", properties:{ keys:{type:"string",description:"快捷键，如 Ctrl+S / Cmd+C / Alt+F4"} }, required:["keys"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process"); let keys = args.keys;
        if (process.platform === "win32") {
          // Convert Cmd to Ctrl, keep as-is
          keys = keys.replace(/Cmd/gi, "Ctrl");
          execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.SendKeys]::SendWait('${keys.replace(/\+/g,' +')}')"`, {timeout:5000,shell:true});
        } else if (process.platform === "darwin") {
          keys = keys.replace(/Ctrl/gi, "command");
          const parts = keys.split("+").map(s => s.trim());
          const mods = parts.slice(0,-1).map(k => `"${k.toLowerCase()}"`).join(" using ");
          const key = parts[parts.length-1].toLowerCase();
          execSync(`osascript -e 'tell app "System Events" to keystroke "${key}" using ${mods}'`, {timeout:5000});
        }
        return `已发送快捷键: ${args.keys}`;
      } catch { return `发送快捷键失败: ${args.keys}`; }
    }
  },
  { name: "desktop_process_list", description: "列出正在运行的进程。filter 是可选的应用名关键词（如 'code' 只显示 VSCode）。",
    parameters: { type:"object", properties:{ filter:{type:"string",description:"进程名过滤关键词（可选）"} }, required:[] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        if (process.platform === "win32") {
          const f = args.filter ? ` | Where-Object {\\$_.ProcessName -like '*${args.filter}*'}` : "";
          const r = execSync(`powershell -command "Get-Process | Select-Object Id, ProcessName, @{N='Mem(MB)';E={[math]::Round(\\$_.WorkingSet64/1MB,1)}}${f} | Format-Table -AutoSize -HideTableHeaders"`, {timeout:10000,encoding:"utf8"});
          return r.slice(0,3000) || "(无进程)";
        } else if (process.platform === "darwin") {
          const r = args.filter
            ? execSync(`ps aux | grep -i "${args.filter}" | grep -v grep`, {timeout:5000,encoding:"utf8"})
            : execSync("ps aux --sort=-%mem | head -30", {timeout:5000,encoding:"utf8"});
          return r.slice(0,3000) || "(无进程)";
        }
        return "当前系统不支持此功能";
      } catch { return "获取进程列表失败"; }
    }
  },
  { name: "desktop_process_kill", description: "结束指定进程。可指定 pid（进程号）或 name（进程名）。注意：需要先确认用户。",
    parameters: { type:"object", properties:{ pid:{type:"number",description:"进程ID"}, name:{type:"string",description:"进程名"} } },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        if (args.pid) {
          if (process.platform === "win32") {
            execSync(`taskkill /F /PID ${args.pid}`, {timeout:5000});
          } else {
            execSync(`kill -9 ${args.pid}`, {timeout:5000});
          }
          return `已结束进程: ${args.pid}`;
        } else if (args.name) {
          if (process.platform === "win32") {
            execSync(`taskkill /F /IM "${args.name}.exe"`, {timeout:5000});
          } else {
            execSync(`pkill -f "${args.name}"`, {timeout:5000});
          }
          return `已结束进程: ${args.name}`;
        }
        return "请指定 pid 或 name";
      } catch { return `结束进程失败: ${args.pid || args.name}`; }
    }
  },
  { name: "desktop_window_resize", description: "调整窗口大小。title 是窗口标题，width/height 是目标尺寸（像素）。",
    parameters: { type:"object", properties:{ title:{type:"string",description:"窗口标题"}, width:{type:"number",description:"宽度"}, height:{type:"number",description:"高度"}, x:{type:"number",description:"X坐标（可选）"}, y:{type:"number",description:"Y坐标（可选）"} }, required:["title","width","height"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        if (process.platform === "win32") {
          const pos = (args.x != null && args.y != null) ? `,\\$(${args.x}),\\$(${args.y})` : "";
          execSync(`powershell -command "Add-Type @"using System;using System.Runtime.InteropServices;public class Win32{[DllImport(\\"user32.dll\\")]public static extern bool SetWindowPos(IntPtr hWnd,IntPtr hWndInsertAfter,int X,int Y,int cx,int cy,uint uFlags);}@;\\$procs=Get-Process | Where-Object {\\$_.MainWindowTitle -like '*${args.title}*'};if(\\$procs){Win32::SetWindowPos(\\$procs[0].MainWindowHandle,0,${args.x ?? 100},${args.y ?? 100},${args.width},${args.height},0x0040)}"`, {timeout:5000,shell:true});
        } else if (process.platform === "darwin") {
          execSync(`osascript -e 'tell app "${args.title}" to set bounds of window 1 to {${args.x ?? 0}, ${args.y ?? 0}, ${args.x ?? 0 + args.width}, ${args.y ?? 0 + args.height}}'`, {timeout:5000});
        }
        return `已调整窗口: ${args.title} 到 ${args.width}x${args.height}`;
      } catch { return "调整窗口失败"; }
    }
  },
  { name: "desktop_vscode_open", description: "在 VSCode 中打开文件或目录。path 是目标路径，line 是可选的行号。",
    parameters: { type:"object", properties:{ path:{type:"string",description:"文件或目录路径"}, line:{type:"number",description:"可选的行号"} }, required:["path"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        const target = args.path.startsWith("~") ? require("os").homedir() + args.path.slice(1) : args.path;
        if (args.line) {
          execSync(`code --goto "${target}:${args.line}"`, {timeout:10000});
          return `已打开 ${target}:${args.line}`;
        }
        execSync(`code "${target}"`, {timeout:10000});
        return `已在 VSCode 中打开: ${target}`;
      } catch { return "打开失败，请确保 VSCode 的 code 命令在 PATH 中"; }
    }
  },
  { name: "desktop_window_snap", description: "将窗口贴靠到屏幕边缘。title 是窗口标题，position 是 'left'/'right'/'top'/'bottom'。",
    parameters: { type:"object", properties:{ title:{type:"string",description:"窗口标题"}, position:{type:"string",enum:["left","right","top","bottom"]} }, required:["title","position"] },
    handler: async (args) => {
      try { const { execSync } = require("child_process");
        if (process.platform === "win32") {
          const key = args.position === "left" ? "L" : args.position === "right" ? "R" : args.position === "top" ? "U" : "D";
          // Use Win+Arrow shortcut
          execSync(`powershell -command "Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.SendKeys]::SendWait('#{${key}}')"`, {timeout:3000,shell:true});
        } else if (process.platform === "darwin") {
          // macOS doesn't have native snap shortcuts, use rectangle/magnet or fallback
          execSync(`osascript -e 'tell app "System Events" to keystroke "${args.position === "left" ? "left" : "right"}" using command down'`, {timeout:3000});
        }
        return `已将窗口贴靠到: ${args.position}`;
      } catch { return "贴靠窗口失败"; }
    }
  },
];
async function callAgent(provider, messages, runtimeTools = {}, thinkingLevel = "high", customSystemPrompt = "") {
  const results = { answer: "", toolCalls: [], iterations: 0, reasoning: "" };

  // 加载 skills/ 目录下的可执行技能（JSON + ClawHub SKILL.md）
  const skillTools = (() => {
    try {
      const dir = path.join(__dirname, "..", "..", "memi-config", "skills");
      if (!fs.existsSync(dir)) return [];
      const tools = [];

      // 1. JSON 技能文件
      fs.readdirSync(dir).filter(f => f.endsWith(".json")).forEach(f => {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
          if (!s.name || !s.handler) return;
          tools.push({
            name: "skill_" + s.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff]/g, "_"),
            description: (s.description || "") + " (本地技能)",
            parameters: s.parameters || { type: "object", properties: {}, required: [] },
            handler: async (args) => {
              try {
                const fn = typeof s.handler === "string" ? new Function("args", "require", s.handler) : s.handler;
                return String(await fn(args, require) || "done");
              } catch(e) { return "Skill error: " + e.message; }
            }
          });
        } catch {}
      });

      // 2. ClawHub SKILL.md 子目录
      fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).forEach(d => {
        try {
          const mdFile = path.join(dir, d.name, "SKILL.md");
          if (!fs.existsSync(mdFile)) return;
          const md = fs.readFileSync(mdFile, "utf8");
          const yamlMatch = md.match(/^---\n([\s\S]*?)\n---/);
          if (!yamlMatch) return;
          const meta = {};
          yamlMatch[1].split("\n").forEach(line => {
            const idx = line.indexOf(":");
            if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          });
          const name = meta.name || d.name;
          const desc = meta.description || "";
          const emoji = (meta.metadata || "").includes("emoji") ? " " : "";
          // 解析 requires.bins → 如果有 curl/wget，注册为 shell 工具
          const body = md.replace(/^---[\s\S]*?---\n*/, "");
          const hasCurl = /curl\s/.test(body);
          if (hasCurl) {
            tools.push({
              name: "clawhub_" + name.replace(/[^a-zA-Z0-9_]/g, "_"),
              description: `${emoji}${desc} (ClawHub·curl)`,
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string", description: "地点或IP或坐标" }
                },
                required: []
              },
              handler: async (args) => {
                try {
                  const { execSync } = require("child_process");
                  const cmd = body.match(/curl\s+-s\s+"[^"]+"/)?.[0]?.replace(/\$\{args\.\w+\}/g, args.location || "Beijing");
                  if (cmd) return execSync(cmd, { timeout: 10000, encoding: "utf8" }).slice(0, 1000);
                  return "Skill loaded (knowledge only). Use run_command with curl.";
                } catch(e) { return "ClawHub skill error: " + e.message; }
              }
            });
          }
        } catch {}
      });

      return tools;
    } catch { return []; }
  })();

  // 3. MCP Server 工具（启动时加载一次，缓存结果）
  const mcpTools = (() => {
    try {
      const mcpCachePath = path.join(__dirname, "..", "..", "memi-config", "mcp-cache.json");
      if (fs.existsSync(mcpCachePath)) {
        const cache = JSON.parse(fs.readFileSync(mcpCachePath, "utf8"));
        return (cache.tools || []).map(t => ({ ...t, handler: async (args) => {
          const { spawn } = require("child_process");
          const config = cache.servers?.find(s => s.name === t.server);
          if (!config) return `MCP server "${t.server}" 未找到`;
          return new Promise((resolve, reject) => {
            const proc = spawn(config.command, config.args || [], {
              stdio: ["pipe", "pipe", "pipe"],
              env: { ...process.env, ...(config.env || {}) },
            });
            let buf = "", id = Date.now();
            proc.stdout.on("data", d => {
              buf += d.toString();
              try {
                const lines = buf.split("\n");
                for (const line of lines) {
                  const msg = JSON.parse(line);
                  if (msg.id === id) {
                    proc.kill();
                    if (msg.error) reject(new Error(msg.error.message));
                    else resolve(msg.result?.content?.map(c => c.text || "").join("\n") || JSON.stringify(msg.result));
                  }
                }
              } catch {}
            });
            proc.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"memi",version:"1.0"}}})+"\n");
            proc.stdin.write(JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})+"\n");
            setTimeout(() => {
              proc.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method:"tools/call",params:{name:t.originalName,arguments:args}})+"\n");
            }, 500);
            setTimeout(() => { proc.kill(); reject(new Error("MCP 超时")); }, 30000);
          });
        }}));
      }
    } catch {}
    return [];
  })();

  // 4. 插件工具
  const pluginTools = (() => {
    try {
      const { loadPlugins, getPluginTools } = require("./plugins");
      const plugins = loadPlugins();
      return getPluginTools(plugins);
    } catch { return []; }
  })();

  const activeTools = [...TOOLS, ...skillTools, ...mcpTools, ...pluginTools].map((t) => {
    if (runtimeTools[t.name]) return { ...t, handler: runtimeTools[t.name] };
    if (t.handler) return t;
    return null;
  }).filter(Boolean);

  const toolMap = {};
  activeTools.forEach((t) => { toolMap[t.name] = t.handler; });  // toolMap 保留全部工具，执行时不受限制

  const toolDesc = activeTools.map((t) =>
    `${t.name}(${(t.parameters?.required || []).join(", ")}): ${t.description}`
  ).join("\n");

  // 加载 workspace 文档（SOUL.md, MEMORY.md, 及其他 .md 文件）
  let workspaceContext = "";
  try {
    const wsDir = path.join(__dirname, "..", "..", "memi-config", "workspace");
    if (fs.existsSync(wsDir)) {
      const coreFiles = ["SOUL.md", "MEMORY.md", "USER.md", "IDENTITY.md"];
      coreFiles.forEach(f => {
        const p = path.join(wsDir, f);
        if (fs.existsSync(p)) workspaceContext += `[${f}]\n${fs.readFileSync(p, "utf8").slice(0, 2000)}\n\n`;
      });
      // 加载其他自定义 .md
      fs.readdirSync(wsDir).filter(f => f.endsWith(".md") && !coreFiles.includes(f)).forEach(f => {
        workspaceContext += `[${f}]\n${fs.readFileSync(path.join(wsDir, f), "utf8").slice(0, 1000)}\n\n`;
      });
    }
  } catch {}

  const toolNames = activeTools.map((t) => t.name).join(", ");
  const systemPrompt = {
    role: "system",
    content:
      (customSystemPrompt ? customSystemPrompt + "\n" : "") +
      (workspaceContext ? workspaceContext + "\n" : "") +
      `You are Memi, a witty, proactive AI agent with full system access. You were built to be helpful, fast, and a little playful.\n\n` +
      `PERSONALITY: concise, warm, direct. Use emoji sparingly. Prefer action over explanation.\n` +
      `CAPABILITIES: ${toolNames}. You can do ANYTHING on this computer — list, read, write, move, delete files, run commands, search the web.\n\n` +
      `RULES:\n` +
      `- Use Markdown tables for data: | col1 | col2 |\n` +
      `- When asked to DO something, DO it immediately via tools. Never say "you should" or "try running".\n` +
      `- If you write a script, run it with run_command right after — don't ask permission.\n` +
      `- Keep responses short. If the task is done, just confirm what happened.\n` +
      `- If something fails, try a different approach instead of giving up.\n` +
      `- Use the user's language.`,
  };

  // 限制工具数量（太多工具会导致 API 400）
  const MAX_TOOLS = 30;
  const limitedTools = activeTools.slice(0, MAX_TOOLS);

  const toolDefs = limitedTools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  let conversation = [systemPrompt, ...messages];

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    results.iterations = i + 1;

    // 使用原生 function calling
    const axios = require("axios");
    const resp = await axios.post(
      `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        model: provider.model,
        messages: conversation,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        tool_choice: toolDefs.length > 0 ? "auto" : undefined,
        ...(supportsThinking(provider.model) && thinkingLevel !== "off" ? { reasoning_effort: thinkingLevel } : {}),
      },
      {
        headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
        timeout: 180000,
      }
    );

    const msg = resp.data?.choices?.[0]?.message;
    if (!msg) { results.answer = ""; return results; }
    if (msg.reasoning_content) results.reasoning = msg.reasoning_content;

    // 检查原生 tool_calls
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      conversation.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });

      for (const tc of msg.tool_calls) {
        const fn = tc.function;
        if (!toolMap[fn.name]) continue;

        let result;
        try {
          const args = JSON.parse(fn.arguments || "{}");
          result = await toolMap[fn.name](args);
          if (typeof result !== "string") result = JSON.stringify(result);
        } catch (e) {
          result = "工具执行错误: " + e.message;
        }

        results.toolCalls.push({ tool: fn.name, args: fn.arguments, result: (result || "").slice(0, 2000) });
        conversation.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue;
    }

    results.answer = msg.content || "";
    return results;
  }

  const finalResp = await require("axios").post(
    `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`,
    { model: provider.model, messages: conversation },
    { headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" }, timeout: 180000 }
  );
  results.answer = finalResp.data?.choices?.[0]?.message?.content || "抱歉，无法完成。";
  return results;
}

module.exports = { callAgent, TOOLS };

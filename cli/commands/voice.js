const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { A, _, log, ok, fail, DIR } = require("..");

module.exports = {
  name: "voice",
  description: "Voice chat mode",
  usage: "memi voice",
  category: "core",
  run: async () => {
    log(A.b + "\n  🎤 语音对话模式\n" + A.r);
    log(A.g + "  点击麦克风按钮开始说话，说完自动转文字并发送\n" + A.r);
    log(A.g + "  输入 /voice exit 退出\n" + A.r);

    let voiceMode = true;
    const tempDir = path.join(DIR, "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    while (voiceMode) {
      const audioFile = path.join(tempDir, `voice_${Date.now()}.wav`);
      log("\n" + A.yk + "  🎤 正在录音... (按 Enter 停止)" + A.r);

      if (process.platform === "win32") {
        execSync(`powershell -Command "$ws=New-Object System.Media.SoundPlayer;$ws.Stop();" 2>$null`, { stdio: "ignore", timeout: 2000 });
      }

      if (process.platform === "win32") {
        log(A.rk + "  Windows 录音请使用 Dashboard 的 🎤 按钮\n" + A.r);
        log(A.g + "  (CLI 语音模式需要 sox/arecord/PowerShell 音频模块)\n" + A.r);
        break;
      } else if (process.platform === "darwin") {
        execSync(`sox -d -r 16000 -c 1 -b 16 "${audioFile}" silence 1 0.1 3% 1 3.0 3% 2>&1`, { timeout: 15000, stdio: "pipe" });
      } else {
        execSync(`arecord -f cd -t wav -d 10 "${audioFile}" 2>/dev/null`, { timeout: 15000, stdio: "pipe" });
      }

      if (fs.existsSync(audioFile)) {
        const audioBuf = fs.readFileSync(audioFile);
        const audioBase64 = audioBuf.toString("base64");
        try {
          const resp = await fetch("http://localhost:3001/api/voice/transcribe", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: audioBase64 }),
          });
          const data = await resp.json();
          if (data.success && data.text) {
            log(A.g + "  📝 " + data.text + A.r);
            const axios = require("axios");
            const resp2 = await axios.post("http://localhost:3001/api/v1/chat/completions", {
              model: "memi-agent", messages: [{ role: "user", content: data.text }], stream: true, thinking: "high",
            }, { responseType: "stream", timeout: 120000 });
            let fullResp = "";
            resp2.data.on("data", chunk => {
              const lines = chunk.toString().split("\n");
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                if (line.slice(6).trim() === "[DONE]") continue;
                try { const d = JSON.parse(line.slice(6)); const t = d.choices?.[0]?.delta?.content || ""; if (t) { process.stdout.write(t); fullResp += t; } } catch {}
              }
            });
            await new Promise(resolve => resp2.data.on("end", resolve));
            process.stdout.write("\n");

            if (fullResp) {
              try {
                const ttsResp = await fetch("http://localhost:3001/api/voice/speak", {
                  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: fullResp.slice(0, 500) }),
                });
                const ttsData = await ttsResp.json();
                if (ttsData.success && ttsData.audio) {
                  const mp3File = path.join(tempDir, `speak_${Date.now()}.mp3`);
                  fs.writeFileSync(mp3File, Buffer.from(ttsData.audio, "base64"));
                  if (process.platform === "win32") {
                    execSync(`powershell -c "(New-Object Media.SoundPlayer '${mp3File}').PlaySync();"`, { stdio: "ignore", timeout: 30000 });
                  } else {
                    execSync(`ffplay -nodisp -autoexit "${mp3File}" 2>/dev/null`, { stdio: "ignore", timeout: 30000 });
                  }
                }
              } catch {}
            }
          } else { log(A.rk + "  转写失败: " + (data.error || "未知") + A.r); }
        } catch (e) { log(A.rk + "  转写失败: " + e.message + A.r); }
        try { fs.unlinkSync(audioFile); } catch {}
      }

      log(A.g + "\n  继续录音? (Enter/yes 继续, 其他退出): " + A.r);
      const answer = await new Promise(resolve => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question("", ans => { rl.close(); resolve((ans || "").trim().toLowerCase()); }); });
      if (answer && answer !== "yes" && answer !== "y" && answer !== "") voiceMode = false;
    }
    log(A.g + "  已退出语音模式\n" + A.r);
  },
};

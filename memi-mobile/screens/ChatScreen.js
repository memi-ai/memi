import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, SafeAreaView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, ScrollView, Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";

const STORAGE_KEY = "memi-config-v2";

export default function ChatScreen() {
  // ─── 状态 ──────────────────────────────────────────
  const [serverUrl, setServerUrl] = useState("http://localhost:3001");
  const [backupUrl, setBackupUrl] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionName, setSessionName] = useState("mobile");
  const [sessions, setSessions] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(null);
  const flatListRef = useRef(null);
  const reconnectTimer = useRef(null);

  // ─── 初始化 ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        if (cfg.serverUrl) setServerUrl(cfg.serverUrl);
        if (cfg.backupUrl) setBackupUrl(cfg.backupUrl || "");
        if (cfg.sessionName) setSessionName(cfg.sessionName);
      }
      checkConnection();
      loadSessions();
    })();
    return () => clearInterval(reconnectTimer.current);
  }, []);

  useEffect(() => {
    (async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ serverUrl, backupUrl, sessionName }));
    })();
  }, [serverUrl, backupUrl, sessionName]);

  // ─── 连接检测 ──────────────────────────────────────
  const checkConnection = async () => {
    try {
      const resp = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(3000) });
      setConnected(resp.ok);
      if (!resp.ok && backupUrl) {
        const r2 = await fetch(`${backupUrl}/health`, { signal: AbortSignal.timeout(3000) });
        if (r2.ok) { setServerUrl(backupUrl); setConnected(true); }
      }
    } catch {
      if (backupUrl) {
        try {
          const r2 = await fetch(`${backupUrl}/health`, { signal: AbortSignal.timeout(3000) });
          if (r2.ok) { setServerUrl(backupUrl); setConnected(true); return; }
        } catch {}
      }
      setConnected(false);
    }
  };

  // ─── 加载会话列表 ──────────────────────────────────
  const loadSessions = async () => {
    try {
      const resp = await fetch(`${serverUrl}/api/sessions`);
      const data = await resp.json();
      setSessions(data.sessions || []);
    } catch {}
  };

  // ─── 新建会话 ──────────────────────────────────────
  const newSession = () => {
    const name = "mobile-" + Date.now().toString(36);
    setSessionName(name);
    setMessages([]);
    setShowSessions(false);
  };

  // ─── 加载会话 ──────────────────────────────────────
  const loadSession = async (name) => {
    try {
      const resp = await fetch(`${serverUrl}/api/sessions/${name}`);
      const data = await resp.json();
      const msgs = (data.messages || []).map((m, i) => ({
        _id: `${name}-${i}`,
        text: m.content || "",
        createdAt: new Date(),
        user: { _id: m.role === "user" ? 1 : 2, name: m.role === "user" ? "You" : "Memi" },
      }));
      setMessages(msgs);
      setSessionName(name);
      setShowSessions(false);
    } catch {}
  };

  // ─── 发送消息 ──────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    const userMsg = { _id: Date.now().toString(), text, createdAt: new Date(), user: { _id: 1, name: "You" } };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);

    const aiId = (Date.now() + 1).toString();
    const aiMsg = { _id: aiId, text: "", createdAt: new Date(), user: { _id: 2, name: "Memi" } };
    setMessages(prev => [...prev, aiMsg]);

    try {
      const apiMessages = newMsgs.map(m => ({
        role: m.user._id === 1 ? "user" : "assistant",
        content: String(m.text || ""),
      }));

      const resp = await fetch(`${serverUrl}/api/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "memi-agent", messages: apiMessages, stream: true, thinking: "high" }),
      });

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let full = "", buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          if (line.slice(6).trim() === "[DONE]") continue;
          try {
            const d = JSON.parse(line.slice(6));
            const t = d.choices?.[0]?.delta?.content || "";
            if (t) {
              full += t;
              setMessages(prev => prev.map(m => m._id === aiId ? { ...m, text: full } : m));
            }
          } catch {}
        }
      }

      // 保存会话
      const finalMsgs = [...newMsgs, { ...aiMsg, text: full }];
      try {
        await fetch(`${serverUrl}/api/sessions/${sessionName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: finalMsgs.map(m => ({ role: m.user._id === 1 ? "user" : "assistant", content: m.text })) }),
        });
      } catch {}
    } catch (e) {
      setMessages(prev => prev.map(m => m._id === aiId ? { ...m, text: "❌ 连接失败: " + e.message } : m));
    }
    setLoading(false);
    loadSessions();
  }, [input, loading, messages, serverUrl, sessionName]);

  // ─── 语音输入 ──────────────────────────────────────
  const startVoice = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") { Alert.alert("需要麦克风权限"); return; }

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
    } catch (e) {
      Alert.alert("录音失败", e.message);
    }
  };

  const stopVoice = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) return;
      setLoading(true);

      // 读取音频文件并转 base64
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(",")[1];
        try {
          const r = await fetch(`${serverUrl}/api/voice/transcribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: base64 }),
          });
          const d = await r.json();
          if (d.success && d.text) {
            setInput(d.text);
            // 自动发送
            setTimeout(() => {
              setInput(prev => { sendMessageWithText(prev); return ""; });
            }, 500);
          } else {
            Alert.alert("语音识别失败", d.error || "请检查服务器 Whisper 配置");
          }
        } catch (e) {
          Alert.alert("语音识别失败", e.message);
        }
        setLoading(false);
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      Alert.alert("录音处理失败", e.message);
      setLoading(false);
    }
  };

  const sendMessageWithText = (text) => {
    if (text.trim()) {
      setInput(text);
      // Trigger send after state update
    }
  };

  // ─── TTS ───────────────────────────────────────────
  const speakText = (text) => {
    Speech.speak(text.slice(0, 500), { language: "zh-CN", rate: 0.9 });
  };

  // ─── 渲染 ──────────────────────────────────────────
  const renderMessage = ({ item }) => {
    const isUser = item.user._id === 1;
    return (
      <TouchableOpacity
        style={[styles.msgBubble, isUser ? styles.msgUser : styles.msgBot]}
        onLongPress={() => !isUser && speakText(item.text)}
        activeOpacity={0.8}
      >
        <Text style={styles.msgName}>{item.user.name}</Text>
        <Text style={isUser ? styles.msgTextUser : styles.msgText}>
          {item.text || (loading ? "..." : "")}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setShowSessions(true)}>
          <Text style={styles.headerBtn}>📂</Text>
        </TouchableOpacity>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={styles.title}>🦞 Memi</Text>
          <View style={[styles.statusDot, { backgroundColor: connected ? "#22c55e" : "#ef4444" }]} />
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)}>
          <Text style={styles.headerBtn}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item._id}
        style={styles.msgList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>👋 你好！我是 Memi</Text>
            <Text style={styles.emptySub}>随时随地问任何问题</Text>
          </View>
        }
      />

      {/* Input Bar */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={[styles.voiceBtn, recording && styles.voiceBtnActive]}
            onPress={recording ? stopVoice : startVoice}
            disabled={loading}
          >
            <Text style={{ fontSize: 20 }}>{recording ? "⏺" : "🎤"}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="发送消息..."
            multiline
            editable={!loading}
            onSubmitEditing={() => {}}
          />
          <TouchableOpacity style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]} onPress={sendMessage} disabled={!input.trim() || loading}>
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Sessions Modal */}
      <Modal visible={showSessions} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>会话列表</Text>
              <TouchableOpacity onPress={() => setShowSessions(false)}>
                <Text style={{ fontSize: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.newSessionBtn} onPress={newSession}>
              <Text style={styles.newSessionText}>＋ 新对话</Text>
            </TouchableOpacity>
            <ScrollView style={{ maxHeight: 400 }}>
              {sessions.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sessionItem, s === sessionName && styles.sessionActive]}
                  onPress={() => loadSession(s)}
                >
                  <Text style={styles.sessionName}>{s === sessionName ? "● " : ""}{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>设置</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={{ fontSize: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>主服务器</Text>
            <TextInput style={styles.input} value={serverUrl} onChangeText={setServerUrl} placeholder="http://你的IP:3001" autoCapitalize="none" />

            <Text style={styles.label}>备用服务器（可选）</Text>
            <TextInput style={styles.input} value={backupUrl} onChangeText={setBackupUrl} placeholder="https://你的域名" autoCapitalize="none" />

            <Text style={styles.help}>
              提示：{"\n"}
              • 局域网: memi expose lan{"\n"}
              • 公网: ngrok http 3001, 把 URL 填到上面{"\n"}
              • 长按消息可朗读
            </Text>

            <TouchableOpacity style={styles.button} onPress={() => { checkConnection(); setShowSettings(false); }}>
              <Text style={styles.buttonText}>保存并连接</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── 样式 ──────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 12, paddingTop: Platform.OS === "android" ? 40 : 12,
    backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#e5e7eb",
  },
  headerBtn: { fontSize: 22, padding: 4 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  msgList: { flex: 1, padding: 12 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 120 },
  emptyText: { fontSize: 20, fontWeight: "600", color: "#9ca3af" },
  emptySub: { fontSize: 14, color: "#d1d5db", marginTop: 8 },
  msgBubble: { padding: 12, borderRadius: 16, marginBottom: 8, maxWidth: "80%" },
  msgUser: { alignSelf: "flex-end", backgroundColor: "#111827" },
  msgBot: { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb" },
  msgName: { fontSize: 10, fontWeight: "600", marginBottom: 4, color: "#9ca3af" },
  msgText: { fontSize: 15, color: "#1a1a1a", lineHeight: 22 },
  msgTextUser: { fontSize: 15, color: "#fff", lineHeight: 22 },
  inputBar: {
    flexDirection: "row", padding: 10, backgroundColor: "#fff",
    borderTopWidth: 1, borderColor: "#e5e7eb", alignItems: "flex-end",
  },
  voiceBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center", marginRight: 8 },
  voiceBtnActive: { backgroundColor: "#ef4444" },
  textInput: {
    flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100,
    backgroundColor: "#f9fafb",
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#111827", justifyContent: "center", alignItems: "center", marginLeft: 8 },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "600" },
  newSessionBtn: { padding: 12, borderRadius: 10, backgroundColor: "#f3f4f6", marginBottom: 12 },
  newSessionText: { fontSize: 15, color: "#111827", textAlign: "center", fontWeight: "500" },
  sessionItem: { padding: 12, borderRadius: 8, marginBottom: 4 },
  sessionActive: { backgroundColor: "#f0f0f0" },
  sessionName: { fontSize: 14, color: "#374151" },
  // Settings
  label: { fontSize: 13, color: "#6b7280", marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10, fontSize: 14, backgroundColor: "#f9fafb" },
  help: { fontSize: 12, color: "#9ca3af", marginTop: 12, lineHeight: 18 },
  button: { backgroundColor: "#111827", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});

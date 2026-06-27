import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, SafeAreaView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, ScrollView, Alert, StatusBar, Animated, Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "memi-config-v3";
const DISCOVERY_URL = "https://raw.githubusercontent.com/memi-ai/memi/main/memi-mobile/server.txt";

export default function ChatScreen() {
  // ─── 状态 ──────────────────────────────────────────
  const [serverUrl, setServerUrl] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionName] = useState("mobile");
  const [showSettings, setShowSettings] = useState(false);
  const [connected, setConnected] = useState(false);
  const [discovering, setDiscovering] = useState(true);
  const [tempUrl, setTempUrl] = useState("");
  const flatListRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ─── 打字动画 ──────────────────────────────────────
  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else { pulseAnim.setValue(1); }
  }, [loading]);

  // ─── 自动发现服务器 ────────────────────────────────
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        setTempUrl(cfg.serverUrl || "");
      }
      await discoverServer();
    })();
  }, []);

  const discoverServer = async () => {
    setDiscovering(true);
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    let urls = [];
    if (saved) {
      const cfg = JSON.parse(saved);
      if (cfg.serverUrl) urls.push(cfg.serverUrl);
    }

    // 从 GitHub 读取最新 ngrok URL
    try {
      const resp = await fetch(DISCOVERY_URL, { signal: AbortSignal.timeout(5000) });
      const url = (await resp.text()).trim();
      if (url.startsWith("http") && !urls.includes(url)) urls.push(url);
    } catch {}

    // LAN 扫描常用 IP
    for (let i = 100; i <= 105; i++) {
      urls.push(`http://192.168.1.${i}:3001`);
    }

    // 逐个尝试
    for (const url of urls) {
      try {
        const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
        if (resp.ok) {
          setServerUrl(url);
          setConnected(true);
          setDiscovering(false);
          return;
        }
      } catch {}
    }
    setDiscovering(false);
  };

  // ─── 发送消息 ──────────────────────────────────────
  const sendMessage = useCallback(async (textOverride) => {
    const text = (textOverride || input).trim();
    if (!text || loading || !serverUrl) return;
    setInput("");
    setLoading(true);

    const now = new Date();
    const userMsg = { _id: Date.now().toString(), text, createdAt: now, user: { _id: 1, name: "You", avatar: null } };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);

    const aiId = (Date.now() + 1).toString();
    const aiMsg = { _id: aiId, text: "", createdAt: new Date(), user: { _id: 2, name: "Memi", avatar: null }, isBot: true };
    setMessages(prev => [...prev, aiMsg]);

    try {
      const apiMessages = newMsgs.map(m => ({
        role: m.user._id === 1 ? "user" : "assistant",
        content: String(m.text || ""),
      }));

      const resp = await fetch(`${serverUrl}/api/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "memi-agent", messages: apiMessages, stream: true }),
      });

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "", buf = "";

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
              fullText += t;
              setMessages(prev => prev.map(m => m._id === aiId ? { ...m, text: fullText } : m));
            }
          } catch {}
        }
      }
    } catch (e) {
      setMessages(prev => prev.map(m => m._id === aiId ? { ...m, text: "连接失败" } : m));
      setConnected(false);
    }
    setLoading(false);
  }, [input, loading, messages, serverUrl]);

  // ─── 保存设置 ──────────────────────────────────────
  const saveSettings = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ serverUrl: tempUrl }));
    setServerUrl(tempUrl);
    setShowSettings(false);
    checkConnection(tempUrl);
  };

  const checkConnection = async (url) => {
    try {
      const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
      setConnected(resp.ok);
    } catch { setConnected(false); }
  };

  // ─── 渲染消息 ──────────────────────────────────────
  const renderMessage = ({ item }) => {
    const isUser = item.user._id === 1;
    const time = new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return (
      <View style={[styles.msgRow, isUser && styles.msgRowRight]}>
        {/* Avatar */}
        <View style={[styles.avatar, isUser ? styles.avatarUser : styles.avatarBot]}>
          <Text style={styles.avatarText}>{isUser ? "👤" : "🦞"}</Text>
        </View>
        {/* Bubble */}
        <View style={styles.msgCol}>
          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
            {item.text ? (
              <Text style={isUser ? styles.msgTextUser : styles.msgText} selectable>
                {formatText(item.text)}
              </Text>
            ) : (
              <Animated.View style={{ flexDirection: "row", gap: 4, opacity: pulseAnim }}>
                <View style={[styles.dot, { backgroundColor: "#9ca3af" }]} />
                <View style={[styles.dot, { backgroundColor: "#b0b7c3" }]} />
                <View style={[styles.dot, { backgroundColor: "#c4cad4" }]} />
              </Animated.View>
            )}
          </View>
          <Text style={[styles.time, isUser && styles.timeRight]}>{time}</Text>
        </View>
      </View>
    );
  };

  // ─── 简单文本格式化 ────────────────────────────────
  const formatText = (text) => {
    // 代码块
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```")) {
        const code = part.replace(/```\w*\n?/g, "").replace(/```$/g, "");
        return (
          <Text key={i} style={styles.codeBlock}>{code}</Text>
        );
      }
      // 粗体
      const boldParts = part.split(/(\*\*.*?\*\*)/g);
      return boldParts.map((bp, j) => {
        if (bp.startsWith("**") && bp.endsWith("**")) {
          return <Text key={`${i}-${j}`} style={{ fontWeight: "700" }}>{bp.slice(2, -2)}</Text>;
        }
        return <Text key={`${i}-${j}`}>{bp}</Text>;
      });
    });
  };

  // ─── 主界面 ────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoCircle}>
            <Text style={{ fontSize: 18 }}>🦞</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Memi</Text>
            <Text style={styles.headerSub}>AI Assistant</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, { backgroundColor: connected ? "#22c55e" : discovering ? "#f59e0b" : "#ef4444" }]} />
          <TouchableOpacity onPress={() => { setTempUrl(serverUrl); setShowSettings(true); }}>
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Discovering overlay */}
      {discovering && (
        <View style={styles.discovering}>
          <ActivityIndicator color="#6366f1" />
          <Text style={styles.discoveringText}>正在连接服务器...</Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item._id}
        style={styles.msgList}
        contentContainerStyle={{ paddingBottom: 16 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          !discovering && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🦞</Text>
              <Text style={styles.emptyTitle}>Memi</Text>
              <Text style={styles.emptySub}>How can I help you today?</Text>
              <View style={styles.suggestions}>
                {["写一首诗", "解释量子计算", "推荐一部电影", "帮我写代码"].map((s, i) => (
                  <TouchableOpacity key={i} style={styles.suggestionChip} onPress={() => sendMessage(s)}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )
        }
      />

      {/* Input Bar */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <View style={styles.inputBar}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Message Memi..."
              placeholderTextColor="#9ca3af"
              multiline
              editable={!loading && !discovering}
              onSubmitEditing={() => sendMessage()}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={{ fontSize: 24 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Server URL</Text>
            <TextInput
              style={styles.input}
              value={tempUrl}
              onChangeText={setTempUrl}
              placeholder="https://your-server.com"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.help}>
              Tip: Run "ngrok http 3001" on your PC{'\n'}
              Or "memi expose lan" for local network
            </Text>
            <TouchableOpacity style={styles.button} onPress={saveSettings}>
              <Text style={styles.buttonText}>Save & Connect</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonOutline} onPress={discoverServer}>
              <Text style={styles.buttonOutlineText}>🔍 Auto-discover Server</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── 样式 ──────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  // Header
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 12, paddingTop: Platform.OS === "android" ? 40 : 8,
    backgroundColor: "#fff", borderBottomWidth: 0.5, borderColor: "#e5e7eb",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  headerSub: { fontSize: 11, color: "#9ca3af" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  // Discovering
  discovering: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 10, backgroundColor: "#fef3c7", gap: 8 },
  discoveringText: { fontSize: 13, color: "#92400e" },
  // Messages
  msgList: { flex: 1, paddingHorizontal: 12 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 28, fontWeight: "700", color: "#111827" },
  emptySub: { fontSize: 16, color: "#9ca3af", marginTop: 4, marginBottom: 24 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, paddingHorizontal: 20 },
  suggestionChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  suggestionText: { fontSize: 13, color: "#374151" },
  // Message bubbles
  msgRow: { flexDirection: "row", marginBottom: 16, paddingRight: 50 },
  msgRowRight: { flexDirection: "row-reverse", paddingRight: 0, paddingLeft: 50 },
  msgCol: { flex: 1 },
  avatar: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center", marginRight: 8, marginLeft: 0 },
  avatarRight: { marginRight: 0, marginLeft: 8 },
  avatarUser: { backgroundColor: "#6366f1" },
  avatarBot: { backgroundColor: "#111827" },
  avatarText: { fontSize: 16 },
  bubble: { padding: 12, borderRadius: 18, maxWidth: "100%" },
  bubbleUser: { backgroundColor: "#111827", borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: "#f3f4f6", borderBottomLeftRadius: 4 },
  msgText: { fontSize: 15, color: "#1a1a1a", lineHeight: 22 },
  msgTextUser: { fontSize: 15, color: "#fff", lineHeight: 22 },
  time: { fontSize: 10, color: "#9ca3af", marginTop: 4, marginLeft: 4 },
  timeRight: { textAlign: "right", marginRight: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  codeBlock: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13, color: "#374151", backgroundColor: "#e5e7eb", padding: 8, borderRadius: 8 },
  // Input
  inputBar: {
    flexDirection: "row", padding: 10, paddingBottom: Platform.OS === "ios" ? 24 : 10,
    backgroundColor: "#fff", borderTopWidth: 0.5, borderColor: "#e5e7eb", alignItems: "flex-end",
  },
  inputWrapper: { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 24, borderWidth: 1, borderColor: "#e5e7eb" },
  textInput: { paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120, color: "#111827" },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#111827", justifyContent: "center", alignItems: "center", marginLeft: 8, marginBottom: 2 },
  sendBtnDisabled: { opacity: 0.3 },
  sendIcon: { color: "#fff", fontSize: 18, fontWeight: "600" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, fontSize: 14, backgroundColor: "#f9fafb", color: "#111827" },
  help: { fontSize: 12, color: "#9ca3af", marginTop: 10, lineHeight: 18 },
  button: { backgroundColor: "#111827", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 20 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  buttonOutline: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 10 },
  buttonOutlineText: { fontSize: 14, color: "#374151", fontWeight: "500" },
});

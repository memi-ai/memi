import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, SafeAreaView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "memi-chat-config";

export default function ChatScreen() {
  const [serverUrl, setServerUrl] = useState("http://192.168.1.100:3001");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("mobile");
  const [configOpen, setConfigOpen] = useState(false);
  const flatListRef = useRef(null);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved);
        setServerUrl(cfg.serverUrl || serverUrl);
        setSessionId(cfg.sessionId || "mobile");
      }
    })();
  }, []);

  const saveConfig = async (url, sid) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ serverUrl: url, sessionId: sid }));
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    const userMsg = { _id: Date.now().toString(), text, createdAt: new Date(), user: { _id: 1, name: "You" } };
    setMessages(prev => [...prev, userMsg]);

    const aiMsg = { _id: (Date.now() + 1).toString(), text: "", createdAt: new Date(), user: { _id: 2, name: "Memi" } };
    setMessages(prev => [...prev, aiMsg]);

    try {
      const resp = await fetch(`${serverUrl}/api/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "memi-agent",
          messages: [...messages, { role: "user", content: text }].map(m => ({
            role: m.user._id === 1 ? "user" : "assistant",
            content: typeof m.text === "string" ? m.text : "",
          })),
          stream: true,
        }),
      });

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buf = "";

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
              setMessages(prev => prev.map(m => m._id === aiMsg._id ? { ...m, text: full } : m));
            }
          } catch {}
        }
      }
    } catch (e) {
      setMessages(prev => prev.map(m => m._id === aiMsg._id ? { ...m, text: "连接失败: " + e.message } : m));
    }
    setLoading(false);
  }, [input, loading, messages, serverUrl]);

  const renderMessage = ({ item }) => (
    <View style={[styles.msgBubble, item.user._id === 1 ? styles.msgUser : styles.msgBot]}>
      <Text style={styles.msgName}>{item.user.name}</Text>
      <Text style={item.user._id === 1 ? styles.msgTextUser : styles.msgText}>{item.text || (loading && item._id === (Date.now() + 1).toString() ? "..." : "")}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🦞 Memi</Text>
        <TouchableOpacity onPress={() => setConfigOpen(!configOpen)}>
          <Text style={styles.configBtn}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {configOpen && (
        <View style={styles.configPanel}>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.x.x:3001"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.button}
            onPress={() => { saveConfig(serverUrl, sessionId); setConfigOpen(false); }}
          >
            <Text style={styles.buttonText}>保存并连接</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item._id}
        style={styles.msgList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="发送消息..."
            multiline
            editable={!loading}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={loading || !input.trim()}>
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#e5e7eb" },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  configBtn: { fontSize: 22, padding: 4 },
  configPanel: { padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#e5e7eb" },
  label: { fontSize: 13, color: "#6b7280", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: "#f9fafb" },
  button: { backgroundColor: "#111827", borderRadius: 10, padding: 12, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  msgList: { flex: 1, padding: 12 },
  msgBubble: { padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: "85%" },
  msgUser: { alignSelf: "flex-end", backgroundColor: "#111827" },
  msgBot: { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb" },
  msgName: { fontSize: 11, fontWeight: "600", marginBottom: 4, color: "#9ca3af" },
  msgText: { fontSize: 15, color: "#1a1a1a", lineHeight: 22 },
  msgTextUser: { fontSize: 15, color: "#fff", lineHeight: 22 },
  inputBar: { flexDirection: "row", padding: 12, backgroundColor: "#fff", borderTopWidth: 1, borderColor: "#e5e7eb", alignItems: "flex-end" },
  textInput: { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, backgroundColor: "#f9fafb" },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#111827", justifyContent: "center", alignItems: "center", marginLeft: 8 },
  sendBtnText: { color: "#fff", fontSize: 18, fontWeight: "600" },
});

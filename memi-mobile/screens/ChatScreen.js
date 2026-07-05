import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, Modal, StyleSheet, SafeAreaView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, borderRadius, fontSize, spacing, shadows } from '../src/theme'
import { healthCheck, streamChat } from '../src/api/client'
import ConnectionBar from '../src/components/ConnectionBar'
import TypingIndicator from '../src/components/TypingIndicator'
import SuggestionChips from '../src/components/SuggestionChips'

const STORAGE_KEY = 'memi-config-v4'

function formatTime() {
  const d = new Date()
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  const [serverUrl, setServerUrl] = useState('')
  const [tempUrl, setTempUrl] = useState('')
  const [status, setStatus] = useState('disconnected')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const flatListRef = useRef(null)
  const streamingText = useRef('')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY)
      if (saved) {
        const cfg = JSON.parse(saved)
        setServerUrl(cfg.serverUrl || '')
        setTempUrl(cfg.serverUrl || '')
        if (cfg.serverUrl) {
          setStatus('discovering')
          const ok = await healthCheck(cfg.serverUrl)
          setStatus(ok ? 'connected' : 'disconnected')
        }
      }
    } catch {}
  }

  const saveConfig = async (url) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ serverUrl: url }))
    } catch {}
  }

  const connectServer = async (url) => {
    setStatus('discovering')
    setTempUrl(url)
    const ok = await healthCheck(url)
    if (ok) {
      setServerUrl(url)
      setStatus('connected')
      saveConfig(url)
      setShowSettings(false)
    } else {
      setStatus('disconnected')
    }
  }

  const sendMessage = useCallback(async (text) => {
    const content = text.trim()
    if (!content || !serverUrl || streaming) return

    setShowSuggestions(false)
    const userMsg = { role: 'user', content, time: formatTime() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    streamingText.current = ''

    const aiMsg = { role: 'assistant', content: '', time: formatTime() }
    setMessages(prev => [...prev, aiMsg])

    await streamChat(
      serverUrl,
      [...messages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content }],
      (token) => {
        streamingText.current += token
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: streamingText.current }
          return updated
        })
      },
      () => {
        setMessages(prev => {
          const updated = [...prev]
          if (updated[updated.length - 1]?.content === '') {
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: '请求失败，请检查服务器连接' }
          }
          return updated
        })
      }
    )

    setStreaming(false)
  }, [serverUrl, streaming, messages])

  const renderMessage = ({ item, index }) => {
    const isUser = item.role === 'user'
    const isLastAi = !isUser && index === messages.length - 1 && streaming && !item.content

    if (isLastAi) {
      return null // rendered as TypingIndicator
    }

    if (!item.content && !isUser) return null

    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAi]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>M</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
          <Text style={[styles.msgText, isUser && styles.msgTextUser]}>
            {item.content}
          </Text>
          <View style={[styles.timeRow, isUser && styles.timeRowUser]}>
            {!isUser && (
              <TouchableOpacity style={styles.copyBtn}>
                <Text style={styles.copyIcon}>📋</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.time, isUser ? styles.timeUser : styles.timeAi]}>
              {item.time}
            </Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top ? insets.top - 4 : spacing.lg }]}>
          <Text style={styles.headerTitle}>Memi</Text>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.headerBtn}>
            <Text style={styles.headerIcon}>⚙</Text>
          </TouchableOpacity>
        </View>

        <ConnectionBar status={status} serverUrl={serverUrl} onSettings={() => setShowSettings(true)} />

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(_, i) => String(i)}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.listEmpty,
          ]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            showSuggestions ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🦞</Text>
                <Text style={styles.emptyTitle}>有什么我可以帮你的？</Text>
                <SuggestionChips onSelect={sendMessage} />
              </View>
            ) : null
          }
          ListFooterComponent={
            streaming && messages[messages.length - 1]?.content === '' ? (
              <View style={styles.footerRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>M</Text>
                </View>
                <TypingIndicator />
              </View>
            ) : null
          }
        />

        {/* Input */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="发消息..."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={4000}
              editable={!streaming}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
                  sendMessage(input)
                }
              }}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              disabled={!input.trim() || streaming}
              onPress={() => sendMessage(input)}
            >
              <Text style={[styles.sendIcon, !input.trim() && styles.sendIconDisabled]}>
                ↑
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { marginTop: insets.top + 40 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>服务器设置</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>服务器地址</Text>
            <TextInput
              style={styles.modalInput}
              value={tempUrl}
              onChangeText={setTempUrl}
              placeholder="http://192.168.1.100:3001"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.modalHint}>
              电脑端运行 memi expose lan 后填入显示的地址{'\n'}
              或使用 ngrok 暴露到公网
            </Text>

            <TouchableOpacity
              style={[styles.modalBtn, !tempUrl && styles.modalBtnDisabled]}
              disabled={!tempUrl}
              onPress={() => connectServer(tempUrl)}
            >
              <Text style={styles.modalBtnText}>连接</Text>
            </TouchableOpacity>

            {status === 'discovering' && (
              <Text style={styles.modalStatus}>正在连接...</Text>
            )}
            {status === 'disconnected' && serverUrl && (
              <Text style={[styles.modalStatus, { color: colors.danger }]}>
                连接失败
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSize.title,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerBtn: {
    position: 'absolute',
    right: spacing.lg,
    padding: spacing.xs,
  },
  headerIcon: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  listEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.heading,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: spacing.xxl,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAi: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  avatarText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: colors.userBubble,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  bubbleAi: {
    backgroundColor: colors.aiBubble,
    borderTopLeftRadius: 4,
    borderTopRightRadius: borderRadius.xl,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  msgText: {
    fontSize: fontSize.body,
    lineHeight: 22,
    color: colors.aiText,
  },
  msgTextUser: {
    color: colors.userText,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: spacing.sm,
  },
  timeRowUser: {
    justifyContent: 'flex-end',
  },
  time: {
    fontSize: fontSize.caption,
  },
  timeAi: {
    color: colors.textTertiary,
  },
  timeUser: {
    color: 'rgba(255,255,255,0.5)',
  },
  copyBtn: {
    padding: 2,
  },
  copyIcon: {
    fontSize: 12,
  },
  footerRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  inputContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.bg,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.bgTertiary,
  },
  sendIcon: {
    fontSize: 18,
    color: colors.white,
    fontWeight: '700',
  },
  sendIconDisabled: {
    color: colors.textTertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  modalTitle: {
    fontSize: fontSize.title,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    fontSize: 22,
    color: colors.textSecondary,
    padding: spacing.xs,
  },
  modalLabel: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.bgSecondary,
  },
  modalHint: {
    fontSize: fontSize.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  modalBtn: {
    backgroundColor: colors.black,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  modalBtnDisabled: {
    backgroundColor: colors.bgTertiary,
  },
  modalBtnText: {
    color: colors.white,
    fontSize: fontSize.bodyLarge,
    fontWeight: '600',
  },
  modalStatus: {
    textAlign: 'center',
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: fontSize.caption,
  },
})

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, Modal, StyleSheet, SafeAreaView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'memi-config-v5'
const colors = { bg:'#fff',bg2:'#f4f4f5',bg3:'#e4e4e7',text:'#171717',dim:'#737373',dim2:'#a3a3a3',border:'#e5e5e5',white:'#fff',black:'#171717',danger:'#ef4444',success:'#22c55e' }

function formatTime() {
  const d = new Date()
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

async function healthCheck(url) {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })
    const d = await r.json()
    return d?.status === 'ok'
  } catch { return false }
}

async function streamChat(url, messages, onToken, onError) {
  try {
    const r = await fetch(`${url}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json','ngrok-skip-browser-warning':'1' },
      body: JSON.stringify({ model:'memi-agent', messages: messages.map(m=>({role:m.role,content:m.content})), stream:true }),
    })
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream:true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const p = JSON.parse(data)
          const delta = p.choices?.[0]?.delta?.content
          if (delta) onToken(delta)
        } catch {}
      }
    }
  } catch (e) { onError?.(e) }
}

export default function App() {
  const insets = useSafeAreaInsets()
  const [serverUrl, setServerUrl] = useState('')
  const [tempUrl, setTempUrl] = useState('')
  const [status, setStatus] = useState('disconnected')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const flatListRef = useRef(null)
  const streamingText = useRef('')

  useEffect(() => { loadConfig() }, [])

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

  const connectServer = async (url) => {
    setStatus('discovering')
    setTempUrl(url)
    const ok = await healthCheck(url)
    if (ok) {
      setServerUrl(url)
      setStatus('connected')
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ serverUrl: url }))
      setShowSettings(false)
    } else {
      setStatus('disconnected')
    }
  }

  const sendMessage = useCallback(async (text) => {
    const content = text.trim()
    if (!content || !serverUrl || streaming) return
    const userMsg = { role:'user', content, time:formatTime() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setStreaming(true)
    streamingText.current = ''
    const aiMsg = { role:'assistant', content:'', time:formatTime() }
    setMessages(prev => [...prev, aiMsg])
    await streamChat(
      serverUrl,
      [...messages.map(m=>({role:m.role,content:m.content})),{role:'user',content}],
      (token) => {
        streamingText.current += token
        setMessages(prev => {
          const u = [...prev]
          u[u.length-1] = { ...u[u.length-1], content:streamingText.current }
          return u
        })
      },
      () => {
        setMessages(prev => {
          const u = [...prev]
          u[u.length-1] = { ...u[u.length-1], content:'请求失败' }
          return u
        })
      }
    )
    setStreaming(false)
  }, [serverUrl, streaming, messages])

  const renderMessage = ({ item, index }) => {
    const isUser = item.role === 'user'
    if (!item.content && !isUser) return null
    return (
      <View style={{ flexDirection:'row', marginBottom:16, paddingHorizontal:16, justifyContent: isUser ? 'flex-end' : 'flex-start', gap:8 }}>
        {!isUser && <View style={{ width:30,height:30,borderRadius:15,backgroundColor:colors.black,alignItems:'center',justifyContent:'center' }}><Text style={{color:colors.white,fontSize:12,fontWeight:'600'}}>M</Text></View>}
        <View style={{
          maxWidth:'78%', paddingHorizontal:16, paddingVertical:10,
          backgroundColor: isUser ? colors.black : colors.bg2,
          borderTopLeftRadius: isUser ? 18 : 4,
          borderTopRightRadius: isUser ? 4 : 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 18,
        }}>
          <Text style={{ fontSize:15, lineHeight:22, color: isUser ? colors.white : colors.text }}>{item.content}</Text>
          <Text style={{ fontSize:12, marginTop:4, color: isUser ? 'rgba(255,255,255,0.5)' : colors.dim2 }}>{item.time}</Text>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={{flex:1,backgroundColor:colors.bg}}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:colors.border }}>
          <Text style={{ fontSize:18, fontWeight:'600', color:colors.text, letterSpacing:-0.3 }}>Memi</Text>
          <TouchableOpacity onPress={()=>setShowSettings(true)} style={{position:'absolute',right:16,padding:4}}>
            <Text style={{fontSize:20,color:colors.dim}}>⚙</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:8, borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:colors.border, gap:8 }}>
          <View style={{width:8,height:8,borderRadius:4,backgroundColor:status==='connected'?colors.success:status==='discovering'?'#f59e0b':colors.danger}} />
          <Text style={{fontSize:12,color:status==='disconnected'?colors.danger:colors.dim,flex:1}} numberOfLines={1}>
            {status==='connected'?'已连接':status==='discovering'?'正在连接...':'未连接 — 点击设置'}
          </Text>
        </View>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(_,i)=>String(i)}
          style={{flex:1}}
          contentContainerStyle={{paddingTop:16,paddingBottom:8}}
          onContentSizeChange={()=>flatListRef.current?.scrollToEnd({animated:true})}
          ListEmptyComponent={
            <View style={{alignItems:'center',paddingTop:80}}>
              <Text style={{fontSize:48,marginBottom:12}}>🦞</Text>
              <Text style={{fontSize:22,fontWeight:'600',color:colors.text,letterSpacing:-0.5,marginBottom:24}}>有什么我可以帮你的？</Text>
              {['写一首诗','帮我写脚本','打开计算器','截个屏'].map((t,i)=>(
                <TouchableOpacity key={i} style={{borderWidth:1,borderColor:colors.border,borderRadius:999,paddingHorizontal:16,paddingVertical:8,margin:4}} onPress={()=>sendMessage(t)}>
                  <Text style={{fontSize:15,color:colors.text}}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          }
        />
        <View style={{ borderTopWidth:StyleSheet.hairlineWidth, borderTopColor:colors.border, backgroundColor:colors.bg, paddingHorizontal:16, paddingTop:8, paddingBottom: Math.max(insets.bottom,8) }}>
          <View style={{ flexDirection:'row', alignItems:'flex-end', gap:8 }}>
            <TextInput
              style={{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:14,paddingHorizontal:16,paddingVertical:10,fontSize:15,color:colors.text,maxHeight:120,lineHeight:20}}
              value={input}
              onChangeText={setInput}
              placeholder="发消息..."
              placeholderTextColor={colors.dim2}
              multiline
              editable={!streaming}
            />
            <TouchableOpacity
              style={{width:38,height:38,borderRadius:19,backgroundColor:input.trim()?colors.black:colors.bg3,alignItems:'center',justifyContent:'center'}}
              disabled={!input.trim()||streaming}
              onPress={()=>sendMessage(input)}
            >
              <Text style={{fontSize:18,color:input.trim()?colors.white:colors.dim2,fontWeight:'700'}}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)'}}>
          <View style={{flex:1,backgroundColor:colors.bg,borderTopLeftRadius:24,borderTopRightRadius:24,paddingHorizontal:24,paddingTop:20,marginTop:insets.top+40}}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
              <Text style={{fontSize:18,fontWeight:'600',color:colors.text}}>服务器设置</Text>
              <TouchableOpacity onPress={()=>setShowSettings(false)}><Text style={{fontSize:22,color:colors.dim,padding:4}}>✕</Text></TouchableOpacity>
            </View>
            <Text style={{fontSize:12,color:colors.dim,marginBottom:8,textTransform:'uppercase',letterSpacing:0.5}}>服务器地址</Text>
            <TextInput
              style={{borderWidth:1,borderColor:colors.border,borderRadius:10,paddingHorizontal:16,paddingVertical:12,fontSize:15,color:colors.text,backgroundColor:colors.bg2}}
              value={tempUrl}
              onChangeText={setTempUrl}
              placeholder="http://192.168.x.x:3001"
              placeholderTextColor={colors.dim2}
              autoCapitalize="none"
            />
            <Text style={{fontSize:12,color:colors.dim2,marginTop:8,lineHeight:18}}>
              电脑端运行 memi expose lan{'\n'}或使用 ngrok 暴露到公网
            </Text>
            <TouchableOpacity
              style={{backgroundColor:colors.black,borderRadius:10,paddingVertical:14,alignItems:'center',marginTop:24}}
              disabled={!tempUrl}
              onPress={()=>connectServer(tempUrl)}
            >
              <Text style={{color:colors.white,fontSize:16,fontWeight:'600'}}>连接</Text>
            </TouchableOpacity>
            {status==='disconnected'&&serverUrl&&<Text style={{textAlign:'center',marginTop:12,color:colors.danger,fontSize:12}}>连接失败</Text>}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

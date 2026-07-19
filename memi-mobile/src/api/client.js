const NGROK_HEADER = { 'ngrok-skip-browser-warning': '1' }

export async function apiFetch(url, options = {}) {
  const headers = { ...NGROK_HEADER, ...options.headers }
  const res = await fetch(url, { ...options, headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

export async function healthCheck(serverUrl) {
  try {
    const res = await apiFetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    return data?.status === 'ok'
  } catch {
    return false
  }
}

export async function streamChat(serverUrl, messages, onToken, onError) {
  try {
    const res = await apiFetch(`${serverUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: '',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    })

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) onToken(delta)
        } catch {}
      }
    }
  } catch (e) {
    onError?.(e)
  }
}

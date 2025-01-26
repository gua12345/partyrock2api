// main.ts
import { Hono } from 'https://deno.land/x/hono@v3.4.1/mod.ts'
import { cors } from 'https://deno.land/x/hono@v3.4.1/middleware.ts'

// ----------------------------------
// 1) SSE 辅助函数 streamSSE 的实现
// ----------------------------------
/**
 * streamSSE(c, callback) 
 *
 * 用来在 Hono 中处理 Server-Sent Events 的流式输出。
 * - `c` 是路由处理器中传入的上下文（Context）
 * - `callback` 是一个异步函数，拿到 `stream` 对象后，可以多次调用 `stream.writeSSE({ data, event, id })`
 *   来发送 SSE 消息（行首加上 "data:", "event:", "id:", 结尾多一个空行）。
 * - 最后 callback 结束时，会自动关闭可读流，客户端收到断流。
 */
type SSEWriter = {
  writeSSE: (msg: { data: string; event?: string; id?: string }) => Promise<void>
}

async function streamSSE(
  c: any, // Hono 的 Context 类型，如果需要更严格可自行改成 c: Context
  callback: (stream: SSEWriter) => Promise<void>
) {
  const textEncoder = new TextEncoder()

  // 创建一个可读流，用于往里 enqueue SSE 文本
  const body = new ReadableStream({
    async start(controller) {
      const writer: SSEWriter = {
        // 向客户端推送一条 SSE 数据
        async writeSSE({ data, event, id }) {
          // 组装 SSE 消息。SSE 协议中，"data:" 行必需，"event:" 和 "id:" 可选
          let sseMessage = ''
          if (id)    sseMessage += `id: ${id}\n`
          if (event) sseMessage += `event: ${event}\n`
          sseMessage += `data: ${data}\n\n`

          // 写入流
          controller.enqueue(textEncoder.encode(sseMessage))
        },
      }

      // 让调用方往 SSE 流里写数据
      await callback(writer)

      // 写完后关闭流
      controller.close()
    }
  })

  // 返回一个新的响应，指定 content-type 为 text/event-stream
  return c.newResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}


// ----------------------------------
// 2) 业务相关类型和函数
// ----------------------------------

// 类型定义
interface OpenAIMessage {
  role: string
  content: string
}

interface OpenAIRequest {
  messages: OpenAIMessage[]
  model?: string
  stream?: boolean
}

interface PartyRockMessage {
  role: string
  content: { text: string }[]
}

interface PartyRockRequest {
  messages: PartyRockMessage[]
  modelName: string
  context: {
    type: string
    appId: string
  }
  options: {
    temperature: number
  }
  apiVersion: number
}

// 模型映射表
const MODELS: Record<string, string> = {
  'claude-3-5-haiku':  'bedrock-anthropic.claude-3-5-haiku',
  'claude-3-5-sonnet': 'bedrock-anthropic.claude-3-5-sonnet-v2-0',
  'nova-lite-v1-0':    'bedrock-amazon.nova-lite-v1-0',
  'nova-pro-v1-0':     'bedrock-amazon.nova-pro-v1-0',
  'llama3-1-7b':       'bedrock-meta.llama3-1-8b-instruct-v1',
  'llama3-1-70b':      'bedrock-meta.llama3-1-70b-instruct-v1',
  'mistral-small':     'bedrock-mistral.mistral-small-2402-v1-0',
  'mistral-large':     'bedrock-mistral.mistral-large-2407-v1-0'
}


// ----------------------------------
// 3) Base64 Key 解析
// ----------------------------------
/**
 * 接收形如 "appId|||csrfToken|||cookie" 的字符串的 Base64 编码。
 * 解码后 split('|||') 得到 3 段，再返回 [appId, cookie, csrfToken]。
 */
function validateBase64Key(encodedKey: string): [string | null, string | null, string | null] {
  try {
    const decoded = atob(encodedKey) // Deno 环境自带 atob
    // decoded 应是 "appId|||csrfToken|||cookie"
    const parts = decoded.split('|||', 3)
    if (parts.length !== 3) {
      return [null, null, null]
    }
    // 这里与原先代码对应: [appId, cookie, csrfToken]
    return [parts[0], parts[2], parts[1]]
  } catch {
    return [null, null, null]
  }
}


// ----------------------------------
// 4) 生成 PartyRock 的请求体
// ----------------------------------
function createPartyRockRequest(openaiReq: OpenAIRequest, appId: string): PartyRockRequest {
  return {
    messages: openaiReq.messages.map(msg => ({
      role: msg.role,
      content: [{ text: msg.content }]
    })),
    modelName: MODELS[openaiReq.model || 'claude-3-5-haiku'],
    context: { type: 'chat-widget', appId },
    options: { temperature: 0 },
    apiVersion: 3
  }
}


// ----------------------------------
// 5) Hono 应用
// ----------------------------------
const app = new Hono()

// 使用 CORS 中间件
app.use('/*', cors())

// 测试用 GET 路由
app.get('/', (c) => {
  return c.json({ 
    status: 'PartyRock API Service Running', 
    port: 8803 
  })
})


// 主要的 POST 路由
app.post('/v1/chat/completions', async (c) => {
  try {
    // 读取 Header: Authorization: Bearer <base64Key>
    const authorization = c.req.header('Authorization') || ''
    const token = authorization.replace('Bearer ', '')

    // 解码 + 拆分
    const [appId, cookie, csrfToken] = validateBase64Key(token)

    console.log(`App ID: ${appId}`)
    console.log(`Cookie length: ${cookie ? cookie.length : 'None'}`)
    console.log(`CSRF Token: ${csrfToken}`)

    // 如果没正确解析出三段
    if (!appId || !cookie || !csrfToken) {
      return c.text(
        'Invalid Base64 or key format. Expecting "appId|||csrfToken|||cookie".', 
        401
      )
    }

    // 拿到请求体
    const body = await c.req.json<OpenAIRequest>()

    // 组装 fetch PartyRock 时需要的请求头
    const headers = {
      'accept': 'text/event-stream',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'anti-csrftoken-a2z': csrfToken,
      'content-type': 'application/json',
      'origin': 'https://partyrock.aws',
      'referer': `https://partyrock.aws/u/chatyt/${appId}`,
      'cookie': cookie,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    // 请求 PartyRock
    const response = await fetch('https://partyrock.aws/stream/getCompletion', {
      method: 'POST',
      headers,
      body: JSON.stringify(createPartyRockRequest(body, appId))
    })

    // PartyRock 不成功
    if (!response.ok) {
      const errorMsg = await response.text()
      return c.text(`PartyRock API error: ${errorMsg}`, response.status)
    }

    // 如果不需要流式输出，就把服务器返回的 SSE 内容读取完后合并成一次性响应
    if (!body.stream) {
      let fullContent = ''
      const reader = response.body?.getReader()
      if (!reader) {
        return c.text('No response body from PartyRock API.', 500)
      }

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'text') {
                fullContent += data.text
              }
            } catch {
              continue
            }
          }
        }
      }

      return c.json({
        id: crypto.randomUUID(),
        object: 'chat.completion',
        created: Date.now(),
        model: body.model || 'claude-3-5-haiku',
        choices: [{
          message: { role: 'assistant', content: fullContent },
          finish_reason: 'stop',
          index: 0
        }]
      })
    }

    // -------------------------
    // 需要流式输出 (SSE)
    // -------------------------
    return streamSSE(c, async (stream) => {
      const reader = response.body?.getReader()
      if (!reader) {
        await stream.writeSSE({ data: 'No response body from PartyRock API.' })
        return
      }

      const decoder = new TextDecoder()

      try {
        // 循环读取 PartyRock 返回的 SSE 数据
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.type === 'text') {
                  // 构造 OpenAI 兼容的 SSE chunk
                  const chunkResp = {
                    id: crypto.randomUUID(),
                    object: 'chat.completion.chunk',
                    created: Date.now(),
                    model: body.model || 'claude-3-5-haiku',
                    choices: [{
                      delta: { content: data.text },
                      index: 0,
                      finish_reason: null
                    }]
                  }
                  // 写到 SSE 流
                  await stream.writeSSE({
                    data: JSON.stringify(chunkResp)
                  })
                }
              } catch {
                continue
              }
            }
          }
        }

        // 最后写一次空的数据表示结束
        await stream.writeSSE({
          data: JSON.stringify({
            choices: [{
              delta: { content: '' },
              index: 0,
              finish_reason: 'stop'
            }]
          })
        })
        await stream.writeSSE({ data: '[DONE]' })

      } catch (e) {
        console.error('Error in SSE stream:', e)
      }
    })

  } catch (e) {
    console.error(`Error: ${e}`)
    return c.text(`Internal server error: ${e}`, 500)
  }
})

// 启动 Deno 服务
Deno.serve({ port: 8803 }, app.fetch)
console.log('Server running on http://localhost:8803')

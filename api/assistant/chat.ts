import Anthropic from '@anthropic-ai/sdk'
import { createHmac } from 'crypto'
import { TOOLS, executeToolCall } from '../../lib/assistant-tools'

const COOKIE_NAME = 'sg_assistant_session'
const MAX_TOOL_ITERATIONS = 10

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), v.join('=')]
    })
  )
}

function verifyToken(token: string, secret: string): boolean {
  const lastDot = token.lastIndexOf('.')
  if (lastDot === -1) return false
  const payload = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  return sig === expected
}

const SYSTEM_PROMPT = `You are a content update assistant for Shana Gates Real Estate — helping Shana make changes to her Coachella Valley website.

You have access to tools that let you read and update:
- Community page stats ("At a Glance" facts like median price, population, drive times)
- Community page text (headlines, subheadlines, meta descriptions)
- Community page images (hero section, lifestyle section)
- Homepage text fields

WHAT YOU CAN DO:
- Update any stat or "At a Glance" fact on any community page ("change the median home price in Palm Springs to $750K")
- Update drive times ("change the drive to LA on Palm Desert to 1 hour 45 minutes")
- Update hero stat numbers (Active Listings, Median Price shown in the hero banner)
- Update page headlines and text
- Replace hero images or section images when Shana uploads one
- Update homepage headlines and CTA text
- Read current content to verify what's there

STAT UPDATES — critical rules:
Stats on each page include hero banner numbers (Active Listings, Median Price) and "At a Glance" quick facts (Median Home Price, Population, Drive to LA, etc.).

To update any stat, call update_community_stats with:
- key: the EXACT label text as it appears on the page (e.g. "Median Home Price", "Drive to LA", "Active Listings", "Population")
- value: the new value (e.g. "$750,000", "~1 hr 50 min", "320+", "~47,000")

Examples:
- "Change the median price in Palm Springs to $750K" → key: "Median Home Price", value: "$750,000"
- "Update active listings in Rancho Mirage to 180" → key: "Active Listings", value: "180+"
- "Change the drive to LA on La Quinta to 1 hour 45 minutes" → key: "Drive to LA", value: "~1 hr 45 min"
- "Update the population in Coachella" → key: "Population", value: "[the value]"

HERO STATS (shown in the large banner at top of page):
- "Active Listings" count → key: "Active Listings"
- "Median Price" → key: "Median Price"

WHAT YOU CANNOT DO (decline politely if asked):
- Delete any pages, documents, or content permanently
- Change CSS styles, colors, fonts, or layouts
- Modify navigation structure or YLOPO widget settings
- Edit code or configuration files
- Add or remove entire page sections

IMAGE UPLOADS — follow these rules exactly:
- When Shana attaches an image, it is automatically available in the system. NEVER ask her to upload it again.
- If she hasn't specified which page the image is for, ask her.
- If she hasn't clearly said which section, ask ONE question: "Where should I place this image — the hero background at the top of the page, or somewhere else?"
- Once you know the page and section, call upload_community_image with just slug and role — the image data is injected automatically.
- Image uploads can take up to 30 seconds. Say "Working on it — uploading the image now, this takes about 30 seconds." before calling the tool.
- Once done, confirm exactly what was updated and that it will be live within 60 seconds.

Always confirm exactly what you changed, including the community name and the field. Changes go live on the website within 60 seconds.

Be friendly, efficient, and specific. Shana is not technical — speak in plain English.`

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.ADMIN_SECRET
  if (!secret) return res.status(500).json({ error: 'Not configured' })

  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[COOKIE_NAME]
  if (!token || !verifyToken(token, secret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { messages = [] } = req.body ?? {}

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let conversationMessages: Anthropic.MessageParam[] = messages

  function findLatestImage(): { base64: string; mimeType: string } | null {
    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const msg = conversationMessages[i]
      if (msg.role !== 'user') continue
      const content = Array.isArray(msg.content) ? msg.content : []
      for (const block of content as any[]) {
        if (block.type === 'image' && block.source?.type === 'base64') {
          return { base64: block.source.data, mimeType: block.source.media_type }
        }
      }
    }
    return null
  }

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: conversationMessages,
    })

    conversationMessages = [
      ...conversationMessages,
      { role: 'assistant', content: response.content },
    ]

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      return res.status(200).json({ reply: text, messages: conversationMessages })
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      try {
        const input = { ...(block.input as Record<string, any>) }
        if (block.name === 'upload_community_image' && !input.imageBase64) {
          const img = findLatestImage()
          if (img) {
            input.imageBase64 = img.base64
            input.mimeType = img.mimeType
          } else {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: 'Error: No image found in conversation. Ask Shana to attach the image.',
              is_error: true,
            })
            continue
          }
        }
        const result = await executeToolCall(block.name, input)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          is_error: true,
        })
      }
    }

    conversationMessages = [
      ...conversationMessages,
      { role: 'user', content: toolResults },
    ]
  }

  return res.status(200).json({
    reply: 'I hit the maximum number of steps. Please try a simpler request.',
    messages: conversationMessages,
  })
}

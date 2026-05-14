/**
 * HeyGen API client
 *
 * Generates talking-head avatar videos from a text script.
 * Videos are 9:16 vertical (720×1280) — optimised for YouTube Shorts, TikTok, Instagram Reels.
 *
 * Env vars required:
 *   HEYGEN_API_KEY         — HeyGen API key
 *   HEYGEN_AVATAR_LOOK_ID  — Avatar look ID (specific outfit/appearance variant)
 *   HEYGEN_VOICE_ID        — Voice ID to use for speech synthesis
 */

const BASE_URL = 'https://api.heygen.com'

function getHeaders(): Record<string, string> {
  const key = process.env.HEYGEN_API_KEY
  if (!key) throw new Error('HEYGEN_API_KEY env var is not set')
  return {
    'X-Api-Key': key,
    'Content-Type': 'application/json',
  }
}

export type HeyGenVideoStatus =
  | { status: 'processing' }
  | { status: 'completed'; videoUrl: string; duration?: number }
  | { status: 'failed'; error?: string }

export async function generateHeyGenVideo(script: string): Promise<string> {
  const avatarLookId = process.env.HEYGEN_AVATAR_LOOK_ID
  const voiceId = process.env.HEYGEN_VOICE_ID

  if (!avatarLookId) throw new Error('HEYGEN_AVATAR_LOOK_ID env var is not set')
  if (!voiceId) throw new Error('HEYGEN_VOICE_ID env var is not set')

  const res = await fetch(`${BASE_URL}/v2/video/generate`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: avatarLookId,
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            voice_id: voiceId,
            input_text: script,
            speed: 1.0,
          },
          background: {
            type: 'color',
            value: '#1a1a1a',
          },
        },
      ],
      dimension: {
        width: 720,
        height: 1280,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HeyGen generate failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  const videoId = data?.data?.video_id
  if (!videoId) throw new Error(`HeyGen response missing video_id: ${JSON.stringify(data)}`)
  return String(videoId)
}

export async function getHeyGenVideoStatus(videoId: string): Promise<HeyGenVideoStatus> {
  const res = await fetch(`${BASE_URL}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`HeyGen status check failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  const status = data?.data?.status

  if (status === 'completed') {
    const videoUrl = data?.data?.video_url
    if (!videoUrl) throw new Error('HeyGen completed but no video_url returned')
    return { status: 'completed', videoUrl, duration: data?.data?.duration }
  }

  if (status === 'failed') {
    return { status: 'failed', error: data?.data?.error ?? 'Unknown error' }
  }

  return { status: 'processing' }
}

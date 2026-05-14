/**
 * Blotato API client
 *
 * Base URL: https://backend.blotato.com/v2
 * Auth:     blotato-api-key: {key}
 *
 * Env vars required:
 *   BLOTATO_API_KEY
 *   BLOTATO_FACEBOOK_ACCOUNT_ID
 *   BLOTATO_FACEBOOK_PAGE_ID
 *   BLOTATO_YOUTUBE_ACCOUNT_ID
 *   BLOTATO_TIKTOK_ACCOUNT_ID
 *   BLOTATO_LINKEDIN_ACCOUNT_ID
 *   BLOTATO_X_ACCOUNT_ID
 *   BLOTATO_THREADS_ACCOUNT_ID
 *   BLOTATO_INSTAGRAM_ACCOUNT_ID
 */

const BASE_URL = 'https://backend.blotato.com/v2'

function getHeaders(): Record<string, string> {
  const apiKey = process.env.BLOTATO_API_KEY ?? process.env.BLOTATO_KEY
  if (!apiKey) throw new Error('BLOTATO_API_KEY env var is not set')
  return {
    'blotato-api-key': apiKey,
    'Content-Type': 'application/json',
  }
}

function getFacebookAccountId(): string {
  const id = process.env.BLOTATO_FACEBOOK_ACCOUNT_ID
  if (!id) throw new Error('BLOTATO_FACEBOOK_ACCOUNT_ID env var is not set')
  return id
}
function getPageId(): string {
  const id = process.env.BLOTATO_FACEBOOK_PAGE_ID
  if (!id) throw new Error('BLOTATO_FACEBOOK_PAGE_ID env var is not set')
  return id
}
function getYouTubeAccountId(): string {
  const id = process.env.BLOTATO_YOUTUBE_ACCOUNT_ID
  if (!id) throw new Error('BLOTATO_YOUTUBE_ACCOUNT_ID env var is not set')
  return id
}
function getTikTokAccountId(): string {
  const id = process.env.BLOTATO_TIKTOK_ACCOUNT_ID
  if (!id) throw new Error('BLOTATO_TIKTOK_ACCOUNT_ID env var is not set')
  return id
}
function getLinkedInAccountId(): string {
  const id = process.env.BLOTATO_LINKEDIN_ACCOUNT_ID
  if (!id) throw new Error('BLOTATO_LINKEDIN_ACCOUNT_ID env var is not set')
  return id
}
function getXAccountId(): string {
  const id = process.env.BLOTATO_X_ACCOUNT_ID
  if (!id) throw new Error('BLOTATO_X_ACCOUNT_ID env var is not set')
  return id
}
function getThreadsAccountId(): string {
  const id = process.env.BLOTATO_THREADS_ACCOUNT_ID
  if (!id) throw new Error('BLOTATO_THREADS_ACCOUNT_ID env var is not set')
  return id
}
function getInstagramAccountId(): string {
  const id = process.env.BLOTATO_INSTAGRAM_ACCOUNT_ID
  if (!id) throw new Error('BLOTATO_INSTAGRAM_ACCOUNT_ID env var is not set')
  return id
}

export type BlotatoPublishResult = { postSubmissionId: string }
export type BlotatoPostStatus = {
  status: 'pending' | 'published' | 'failed'
  postUrl?: string
  errorMessage?: string
}

const FB_TEXT_LIMIT      = 2000
const LI_TEXT_LIMIT      = 3000
const X_TEXT_LIMIT       = 257
const IG_TEXT_LIMIT      = 2200
const THREADS_TEXT_LIMIT = 500

function safe(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit - 3) + '...' : text
}

async function blotatoPost(body: object): Promise<BlotatoPublishResult> {
  const res = await fetch(`${BASE_URL}/posts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const raw = await res.text()
    throw new Error(`Blotato publish failed (${res.status}): ${raw}`)
  }
  const data = await res.json()
  if (!data.postSubmissionId) throw new Error(`Blotato response missing postSubmissionId: ${JSON.stringify(data)}`)
  return { postSubmissionId: String(data.postSubmissionId) }
}

export async function publishToFacebook(text: string, imageUrl: string): Promise<BlotatoPublishResult> {
  return blotatoPost({ post: { accountId: getFacebookAccountId(), content: { text: safe(text, FB_TEXT_LIMIT), mediaUrls: [imageUrl], platform: 'facebook' }, target: { targetType: 'facebook', pageId: getPageId() } } })
}

export async function publishToFacebookReel(text: string, videoUrl: string): Promise<BlotatoPublishResult> {
  return blotatoPost({ post: { accountId: getFacebookAccountId(), content: { text: safe(text, FB_TEXT_LIMIT), mediaUrls: [videoUrl], platform: 'facebook' }, target: { targetType: 'facebook', pageId: getPageId() } } })
}

export async function publishToYouTube(title: string, description: string, videoUrl: string, thumbnailUrl?: string): Promise<BlotatoPublishResult> {
  const safeTitle = title.length > 100 ? title.slice(0, 97) + '...' : title
  return blotatoPost({ post: { accountId: getYouTubeAccountId(), content: { text: description, mediaUrls: [videoUrl], platform: 'youtube' }, target: { targetType: 'youtube', title: safeTitle, privacyStatus: 'public', shouldNotifySubscribers: true, ...(thumbnailUrl ? { thumbnailUrl } : {}) } } })
}

export async function publishToTikTok(caption: string, videoUrl: string): Promise<BlotatoPublishResult> {
  return blotatoPost({ post: { accountId: getTikTokAccountId(), content: { text: caption, mediaUrls: [videoUrl], platform: 'tiktok' }, target: { targetType: 'tiktok', privacyLevel: 'PUBLIC_TO_EVERYONE', disabledComments: false, disabledDuet: false, disabledStitch: false, isBrandedContent: false, isYourBrand: false, isAiGenerated: false, coverTimestampMs: 0 } } })
}

export async function publishToLinkedIn(text: string, mediaUrl: string): Promise<BlotatoPublishResult> {
  return blotatoPost({ post: { accountId: getLinkedInAccountId(), content: { text: safe(text, LI_TEXT_LIMIT), mediaUrls: [mediaUrl], platform: 'linkedin' }, target: { targetType: 'linkedin' } } })
}

export async function publishToX(text: string, mediaUrl: string): Promise<BlotatoPublishResult> {
  return blotatoPost({ post: { accountId: getXAccountId(), content: { text: safe(text, X_TEXT_LIMIT), mediaUrls: [mediaUrl], platform: 'twitter' }, target: { targetType: 'twitter' } } })
}

export async function publishToThreads(text: string, mediaUrl: string): Promise<BlotatoPublishResult> {
  return blotatoPost({ post: { accountId: getThreadsAccountId(), content: { text: safe(text, THREADS_TEXT_LIMIT), mediaUrls: [mediaUrl], platform: 'threads' }, target: { targetType: 'threads' } } })
}

export async function publishToInstagram(text: string, mediaUrl: string): Promise<BlotatoPublishResult> {
  return blotatoPost({ post: { accountId: getInstagramAccountId(), content: { text: safe(text, IG_TEXT_LIMIT), mediaUrls: [mediaUrl], platform: 'instagram' }, target: { targetType: 'instagram' } } })
}

export async function publishToInstagramReel(text: string, videoUrl: string): Promise<BlotatoPublishResult> {
  return blotatoPost({ post: { accountId: getInstagramAccountId(), content: { text: safe(text, IG_TEXT_LIMIT), mediaUrls: [videoUrl], platform: 'instagram_reels' }, target: { targetType: 'instagram_reels' } } })
}

export async function getPostStatus(postSubmissionId: string): Promise<BlotatoPostStatus> {
  const res = await fetch(`${BASE_URL}/posts/${postSubmissionId}`, { method: 'GET', headers: getHeaders() })
  if (!res.ok) {
    const raw = await res.text()
    throw new Error(`Blotato status check failed (${res.status}): ${raw}`)
  }
  const data = await res.json()
  return {
    status: data.status ?? 'pending',
    postUrl: data.postUrl ?? data.url ?? undefined,
    errorMessage: data.errorMessage ?? data.error ?? undefined,
  }
}

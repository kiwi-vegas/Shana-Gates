/**
 * lib/blotato-client.ts
 * Blotato API client for Facebook post publishing.
 *
 * PHASE B — wire in after the VA queue (Phase A) is working end-to-end.
 *
 * Setup:
 *   1. Log in to Blotato → connect Shana's Facebook Page
 *   2. Set env vars in Vercel (use printf, not echo, to avoid trailing newline):
 *        printf 'YOUR_KEY'        | npx vercel env add BLOTATO_KEY production
 *        printf 'ACCOUNT_ID'      | npx vercel env add BLOTATO_ACCOUNT_ID production
 *        printf 'PAGE_ID'         | npx vercel env add BLOTATO_FACEBOOK_PAGE_ID production
 *
 *   Find your account/page IDs:
 *     curl https://backend.blotato.com/v2/users/me/accounts \
 *       -H "blotato-api-key: YOUR_BLOTATO_KEY"
 *     # Note the `id` field — that's BLOTATO_ACCOUNT_ID
 *
 *     curl https://backend.blotato.com/v2/users/me/accounts/ACCOUNT_ID/subaccounts \
 *       -H "blotato-api-key: YOUR_BLOTATO_KEY"
 *     # Note the `id` field — that's BLOTATO_FACEBOOK_PAGE_ID
 */

const BASE_URL = 'https://backend.blotato.com/v2'

function getHeaders(): Record<string, string> {
  const apiKey = process.env.BLOTATO_KEY
  if (!apiKey) throw new Error('BLOTATO_KEY env var is not set')
  return {
    'blotato-api-key': apiKey,
    'Content-Type': 'application/json',
  }
}

function getAccountId(): string {
  const id = process.env.BLOTATO_ACCOUNT_ID
  if (!id) throw new Error('BLOTATO_ACCOUNT_ID env var is not set')
  return id
}

function getPageId(): string {
  const id = process.env.BLOTATO_FACEBOOK_PAGE_ID
  if (!id) throw new Error('BLOTATO_FACEBOOK_PAGE_ID env var is not set')
  return id
}

export type BlotatoPublishResult = { postSubmissionId: string }

export type BlotatoPostStatus = {
  status: 'pending' | 'published' | 'failed'
  postUrl?: string
  errorMessage?: string
}

export async function publishToFacebook(
  text: string,
  imageUrl: string
): Promise<BlotatoPublishResult> {
  const accountId = getAccountId()
  const pageId = getPageId()

  const res = await fetch(`${BASE_URL}/posts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      post: {
        accountId,
        content: {
          text,
          mediaUrls: [imageUrl],
          platform: 'facebook',
        },
        target: {
          targetType: 'facebook',
          pageId,
        },
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Blotato publish failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  if (!data.postSubmissionId) {
    throw new Error(`Blotato response missing postSubmissionId: ${JSON.stringify(data)}`)
  }

  return { postSubmissionId: String(data.postSubmissionId) }
}

export async function getPostStatus(
  postSubmissionId: string
): Promise<BlotatoPostStatus> {
  const res = await fetch(`${BASE_URL}/posts/${postSubmissionId}`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Blotato status check failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  return {
    status: data.status ?? 'pending',
    postUrl: data.postUrl ?? data.url ?? undefined,
    errorMessage: data.errorMessage ?? data.error ?? undefined,
  }
}

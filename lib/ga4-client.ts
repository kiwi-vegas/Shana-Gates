export interface GA4ReportRow {
  dimensionValues: { value: string }[]
  metricValues: { value: string }[]
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)

  const headerB64 = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const payloadB64 = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const sigInput = `${headerB64}.${payloadB64}`

  const keyData = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput)
  )
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwt = `${sigInput}.${sigB64}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`GA4 token exchange failed: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

export async function runGA4Report(body: object): Promise<GA4ReportRow[]> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const propId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID
  if (!saJson || !propId) return []

  try {
    const token = await getAccessToken(saJson)
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.rows ?? []
  } catch {
    return []
  }
}

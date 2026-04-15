import { Resend } from 'resend'
import type { ScoredArticle } from './blog-store'
import type { WeeklyTopic } from './blog-store'

const resend = new Resend(process.env.RESEND_API_KEY!)
const FROM = process.env.FROM_EMAIL ?? 'noreply@shanasells.com'
const TO = process.env.OPERATOR_EMAIL!
const SITE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://shanasells.com'
const ADMIN_SECRET = process.env.ADMIN_SECRET!

const CATEGORY_COLORS: Record<string, string> = {
  'market-update': '#2563eb',
  'buying-tips': '#4CAF50',
  'selling-tips': '#0ea5e9',
  'community-spotlight': '#9C27B0',
  'investment': '#FF9800',
  'news': '#607D8B',
  'local-area': '#D97706',
  'market-insight': '#4338CA',
}

const CATEGORY_LABELS: Record<string, string> = {
  'market-update': 'Market Update',
  'buying-tips': 'Buying Tips',
  'selling-tips': 'Selling Tips',
  'community-spotlight': 'Community Spotlight',
  'investment': 'Investment',
  'news': 'News',
  'local-area': 'Local Area',
  'market-insight': 'Market Insight',
}

// ── Daily digest email ────────────────────────────────────────────────────

export async function sendDailyDigest(date: string, articles: ScoredArticle[]): Promise<void> {
  const pickerUrl = `${SITE}/admin/blog-picker/?date=${date}&secret=${ADMIN_SECRET}`

  const articleRows = articles
    .map(
      (a, i) => `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #222;">
          <div style="display:flex; align-items:flex-start; gap: 12px;">
            <div style="min-width:28px; height:28px; background:${CATEGORY_COLORS[a.category] ?? '#607D8B'}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; font-weight:700;">${i + 1}</div>
            <div>
              <div style="margin-bottom:4px;">
                <span style="background:${CATEGORY_COLORS[a.category] ?? '#607D8B'}22; color:${CATEGORY_COLORS[a.category] ?? '#607D8B'}; font-size:11px; padding:2px 8px; border-radius:20px; letter-spacing:0.05em; text-transform:uppercase;">${CATEGORY_LABELS[a.category] ?? a.category}</span>
                <span style="margin-left:8px; color:#888; font-size:12px;">Score: ${a.score}/10</span>
              </div>
              <div style="color:#fff; font-size:15px; font-weight:600; margin-bottom:6px;">${a.title}</div>
              <div style="color:#aaa; font-size:13px; line-height:1.5; margin-bottom:6px;">${a.summary}</div>
              <div style="color:#B8975A; font-size:13px; font-style:italic;">${a.whyItMatters}</div>
              <div style="margin-top:6px;"><a href="${a.url}" style="color:#888; font-size:12px;">${a.source}</a></div>
            </div>
          </div>
        </td>
      </tr>`
    )
    .join('')

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="background:#0a0a0a; font-family: system-ui, -apple-system, sans-serif; margin:0; padding:0;">
  <div style="max-width:600px; margin:0 auto; padding:40px 20px;">

    <div style="text-align:center; margin-bottom:32px;">
      <div style="color:#B8975A; font-size:11px; letter-spacing:3px; text-transform:uppercase; margin-bottom:8px;">Shana Gates · Craft &amp; Bauer</div>
      <h1 style="color:#fff; font-size:22px; font-weight:700; margin:0 0 8px;">Daily Blog Digest</h1>
      <p style="color:#888; font-size:14px; margin:0;">${new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
    </div>

    <div style="background:#141414; border:1px solid #222; border-radius:12px; overflow:hidden; margin-bottom:24px;">
      <div style="padding:20px 24px; border-bottom:1px solid #222;">
        <p style="color:#ccc; font-size:14px; margin:0;">Good morning! Here are today's top ${articles.length} articles for your Coachella Valley blog. Select the ones you'd like to publish.</p>
      </div>
      <table style="width:100%; border-collapse:collapse;">
        ${articleRows}
      </table>
    </div>

    <div style="text-align:center;">
      <a href="${pickerUrl}" style="display:inline-block; background:#B8975A; color:#000; font-size:15px; font-weight:700; padding:16px 40px; border-radius:8px; text-decoration:none;">
        Pick Articles to Publish →
      </a>
      <p style="color:#555; font-size:12px; margin-top:16px;">Link expires after 48 hours. No articles? Check back tomorrow.</p>
    </div>

  </div>
</body>
</html>`

  await resend.emails.send({
    from: FROM,
    to: TO,
    subject: `📰 Blog Digest — ${articles.length} new articles · ${date}`,
    html,
  })
}

// ── Sunday weekly digest email ────────────────────────────────────────────

const WEEKLY_CATEGORY_ORDER = ['local-area', 'market-insight', 'buying-tips', 'community-spotlight', 'investment']
const WEEKLY_CATEGORY_LABELS: Record<string, string> = {
  'local-area': 'Local Area Topic',
  'market-insight': 'Market Insight',
  'buying-tips': 'Buyer/Seller Advice',
  'community-spotlight': 'Community Spotlight',
  'investment': 'Investment',
}

export async function sendWeeklyDigest(topics: WeeklyTopic[]): Promise<void> {
  const pickerUrl = `${SITE}/admin/weekly-picker/?secret=${ADMIN_SECRET}`

  // Group by category
  const grouped: Record<string, WeeklyTopic[]> = {}
  for (const topic of topics) {
    if (!grouped[topic.category]) grouped[topic.category] = []
    grouped[topic.category].push(topic)
  }

  const categorySections = WEEKLY_CATEGORY_ORDER.map((cat) => {
    const items = grouped[cat] ?? []
    if (!items.length) return ''
    const label = WEEKLY_CATEGORY_LABELS[cat] ?? cat
    const color = CATEGORY_COLORS[cat] ?? '#607D8B'

    const topicCards = items
      .map(
        (t) => `
        <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:8px; padding:16px; margin-bottom:10px;">
          <div style="color:#fff; font-size:14px; font-weight:600; margin-bottom:6px;">${t.title}</div>
          <div style="color:#999; font-size:13px; line-height:1.5;">${t.angle}</div>
          <div style="margin-top:8px; color:#666; font-size:12px;">Keywords: ${t.keywords.join(', ')}</div>
        </div>`
      )
      .join('')

    return `
      <div style="margin-bottom:28px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
          <div style="width:3px; height:20px; background:${color}; border-radius:2px;"></div>
          <span style="color:${color}; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; font-weight:600;">${label}</span>
        </div>
        ${topicCards}
      </div>`
  }).join('')

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="background:#0a0a0a; font-family: system-ui, -apple-system, sans-serif; margin:0; padding:0;">
  <div style="max-width:620px; margin:0 auto; padding:40px 20px;">

    <div style="text-align:center; margin-bottom:32px;">
      <div style="color:#B8975A; font-size:11px; letter-spacing:3px; text-transform:uppercase; margin-bottom:8px;">Shana Gates · Craft &amp; Bauer</div>
      <h1 style="color:#fff; font-size:22px; font-weight:700; margin:0 0 8px;">Your Weekly Blog Topics</h1>
      <p style="color:#888; font-size:14px; margin:0;">Pick which posts you'd like to write and publish this week.</p>
    </div>

    <div style="background:#141414; border:1px solid #222; border-radius:12px; padding:28px; margin-bottom:24px;">
      ${categorySections}
    </div>

    <div style="text-align:center;">
      <a href="${pickerUrl}" style="display:inline-block; background:#B8975A; color:#000; font-size:15px; font-weight:700; padding:16px 40px; border-radius:8px; text-decoration:none;">
        Review &amp; Publish Your Weekly Posts →
      </a>
      <p style="color:#555; font-size:12px; margin-top:16px;">Topics expire after 72 hours. Claude will write the full post once you select.</p>
    </div>

  </div>
</body>
</html>`

  await resend.emails.send({
    from: FROM,
    to: TO,
    subject: `✍️ Weekly Blog Topics Ready — ${topics.length} ideas across 5 categories`,
    html,
  })
}

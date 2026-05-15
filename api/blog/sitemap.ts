import { getPublishedPosts } from '../../lib/blog-redis'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const posts = await getPublishedPosts(500)

    const urls = posts.map((post) => {
      const loc = `https://www.shanasells.com/blog/post.html?slug=${encodeURIComponent(post.slug)}`
      const lastmod = post.publishedAt ? post.publishedAt.slice(0, 10) : ''
      return `  <url>
    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
    }).join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

    res.setHeader('Content-Type', 'application/xml')
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).send(xml)
  } catch (err: any) {
    console.error('[blog/sitemap]', err)
    return res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>')
  }
}

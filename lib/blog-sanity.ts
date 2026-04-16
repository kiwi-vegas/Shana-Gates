import { writeClient, readClient } from './sanity'
import type { BlogPostOutput } from './writer'
import type { HeroImageResult } from './blog-images'

// ── Publish a blog post to Sanity ─────────────────────────────────────────

export async function publishBlogPost(
  post: BlogPostOutput,
  heroImage: HeroImageResult
): Promise<{ _id: string; slug: string }> {
  const doc: Record<string, any> = {
    _type: 'blogPost',
    title: post.title,
    slug: { _type: 'slug', current: post.slug },
    publishedAt: new Date().toISOString(),
    category: post.category,
    excerpt: post.excerpt,
    body: post.body,
    pipeline: post.pipeline,
    sourceUrl: post.sourceUrl || '',
    sourceTitle: post.sourceTitle || '',
    ...(post.city ? { city: post.city } : {}),
  }

  // Attach hero image
  if (heroImage.sanityAssetId) {
    doc.heroImage = {
      _type: 'image',
      asset: { _type: 'reference', _ref: heroImage.sanityAssetId },
    }
  } else if (heroImage.externalUrl) {
    doc.heroImageUrl = heroImage.externalUrl
  }

  const result = await writeClient.create(doc)
  return { _id: result._id, slug: post.slug }
}

// ── Fetch published blog posts ────────────────────────────────────────────

export interface BlogPostSummary {
  _id: string
  title: string
  slug: string
  publishedAt: string
  category: string
  excerpt: string
  heroImageUrl: string | null
  pipeline: string
}

export async function getPublishedPosts(limit = 24): Promise<BlogPostSummary[]> {
  const query = `*[_type == "blogPost"] | order(publishedAt desc) [0...${limit}] {
    _id,
    title,
    "slug": slug.current,
    publishedAt,
    category,
    excerpt,
    "heroImageUrl": select(
      defined(heroImage) => heroImage.asset->url,
      heroImageUrl
    ),
    pipeline
  }`
  return readClient.fetch(query)
}

export async function getPostBySlug(slug: string): Promise<Record<string, any> | null> {
  const query = `*[_type == "blogPost" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    publishedAt,
    category,
    excerpt,
    body,
    pipeline,
    city,
    sourceUrl,
    sourceTitle,
    "heroImageUrl": select(
      defined(heroImage) => heroImage.asset->url,
      heroImageUrl
    )
  }`
  return readClient.fetch(query, { slug })
}

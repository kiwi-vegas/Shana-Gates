import Anthropic from '@anthropic-ai/sdk'
import { readClient, writeClient } from './sanity'

// ─── Community registry ───────────────────────────────────────────────────────

const COMMUNITY_PAGES = [
  {
    slug: 'palm-springs',
    name: 'Palm Springs',
    quickFactKeys: ['City Type', 'County', 'Population', 'Median Home Price', 'Architecture', 'Elevation', 'Airport', 'Drive to LA'],
  },
  {
    slug: 'palm-desert',
    name: 'Palm Desert',
    quickFactKeys: ['City Type', 'County', 'Population', 'Median Home Price', 'Known For', 'Elevation', 'Airport', 'Drive to LA'],
  },
  {
    slug: 'rancho-mirage',
    name: 'Rancho Mirage',
    quickFactKeys: ['City Type', 'County', 'Population', 'Median Home Price', 'Known For', 'Elevation', 'Airport', 'Drive to LA'],
  },
  {
    slug: 'indian-wells',
    name: 'Indian Wells',
    quickFactKeys: ['City Type', 'County', 'Population', 'Median Home Price', 'Known For', 'Elevation', 'Airport', 'Drive to LA'],
  },
  {
    slug: 'la-quinta',
    name: 'La Quinta',
    quickFactKeys: ['City Type', 'County', 'Population', 'Median Home Price', 'Known For', 'Golf Courses', 'Airport', 'Drive to LA'],
  },
  {
    slug: 'indio',
    name: 'Indio',
    quickFactKeys: ['City Type', 'County', 'Population', 'Median Home Price', 'Known For', 'Elevation', 'Airport', 'Drive to LA'],
  },
  {
    slug: 'cathedral-city',
    name: 'Cathedral City',
    quickFactKeys: ['City Type', 'County', 'Population', 'Median Home Price', 'Known For', 'Elevation', 'Airport', 'Drive to LA'],
  },
  {
    slug: 'desert-hot-springs',
    name: 'Desert Hot Springs',
    quickFactKeys: ['City Type', 'County', 'Population', 'Median Home Price', 'Known For', 'Elevation', 'Airport', 'Drive to LA'],
  },
  {
    slug: 'coachella',
    name: 'Coachella',
    quickFactKeys: ['City Type', 'County', 'Population', 'Median Home Price', 'Known For', 'Elevation', 'Airport', 'Drive to LA'],
  },
]

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_community_pages',
    description: 'Returns the list of all 9 Coachella Valley community pages on the site with their slugs, names, and editable stat keys.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_community_content',
    description: 'Fetches the current CMS content for a specific community page — headlines, stats, and available fact keys.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Community slug, e.g. palm-springs, rancho-mirage, la-quinta' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'update_community_stats',
    description: 'Updates one or more stats or "At a Glance" facts for a community page. Stats are flexible key/value pairs — the key must match the label text on the page (e.g. "Median Home Price", "Drive to LA", "Active Listings"). Existing keys are updated; new keys are added. Changes go live on the website within 60 seconds.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Community slug' },
        stats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Stat label exactly as it appears on the page, e.g. "Median Home Price", "Drive to LA", "Active Listings"' },
              value: { type: 'string', description: 'New value, e.g. "$750,000", "~1 hr 50 min", "320+"' },
            },
            required: ['key', 'value'],
          },
        },
      },
      required: ['slug', 'stats'],
    },
  },
  {
    name: 'update_community_text',
    description: 'Updates a text field on a community page. Allowed fields: heroHeadline, heroSubheadline, overviewTitle, metaTitle, metaDescription.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        field: {
          type: 'string',
          enum: ['heroHeadline', 'heroSubheadline', 'overviewTitle', 'metaTitle', 'metaDescription'],
        },
        value: { type: 'string' },
      },
      required: ['slug', 'field', 'value'],
    },
  },
  {
    name: 'upload_community_image',
    description: 'Uploads an image and applies it to a community page section. The image is automatically extracted from the conversation — do NOT include imageBase64 or mimeType in your call. Use role="hero" for the hero section at the top, or role="lifestyle" for the lifestyle section.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        role: { type: 'string', description: 'Section to place the image: "hero" or "lifestyle"' },
        imageBase64: { type: 'string', description: 'Leave blank — auto-filled from conversation' },
        mimeType: { type: 'string', description: 'Leave blank — auto-filled from conversation' },
      },
      required: ['slug', 'role'],
    },
  },
  {
    name: 'get_homepage_content',
    description: 'Fetches the current homepage CMS content — hero headline, subheadline, CTA text.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_homepage_field',
    description: 'Updates a text field on the homepage. Allowed fields: heroHeadline, heroSubheadline, ctaHeadline, ctaBody.',
    input_schema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: ['heroHeadline', 'heroSubheadline', 'ctaHeadline', 'ctaBody'],
        },
        value: { type: 'string' },
      },
      required: ['field', 'value'],
    },
  },
]

// ─── Helper: get or create communityPage doc ──────────────────────────────────

async function getOrCreateCommunityDoc(slug: string): Promise<string> {
  const existing = await readClient.fetch<{ _id: string } | null>(
    `*[_type == "communityPage" && slug.current == $slug][0]{ _id }`,
    { slug }
  )
  if (existing?._id) return existing._id

  const community = COMMUNITY_PAGES.find((c) => c.slug === slug)
  const doc = await writeClient.create({
    _type: 'communityPage',
    name: community?.name ?? slug,
    slug: { _type: 'slug', current: slug },
  })
  return doc._id
}

// ─── Tool executor ────────────────────────────────────────────────────────────

export async function executeToolCall(name: string, input: Record<string, any>): Promise<string> {
  switch (name) {
    case 'list_community_pages': {
      return JSON.stringify(COMMUNITY_PAGES)
    }

    case 'get_community_content': {
      const doc = await readClient.fetch(
        `*[_type == "communityPage" && slug.current == $slug][0]{
          name, heroHeadline, heroSubheadline, overviewTitle, metaTitle, metaDescription,
          quickStats[]{ key, value },
          "hasHeroImage": defined(heroImage),
          sectionImages[]{ role }
        }`,
        { slug: input.slug }
      )
      const community = COMMUNITY_PAGES.find((c) => c.slug === input.slug)
      const result = {
        ...(doc ?? { note: `No CMS overrides yet for "${input.slug}". Page currently shows hardcoded defaults.` }),
        editableStatKeys: community?.quickFactKeys ?? [],
        tip: 'Use update_community_stats with key matching exactly the label shown on the page.',
      }
      return JSON.stringify(result, null, 2)
    }

    case 'update_community_stats': {
      const docId = await getOrCreateCommunityDoc(input.slug)
      const current = await readClient.fetch<{ quickStats?: Array<{ key: string; value: string }> }>(
        `*[_id == $id][0]{ quickStats[]{ key, value } }`,
        { id: docId }
      )
      const existing = current?.quickStats ?? []
      const updateMap = new Map((input.stats as Array<{ key: string; value: string }>).map((s) => [s.key.toLowerCase(), s]))
      const merged = existing.map((s) =>
        updateMap.has(s.key.toLowerCase()) ? updateMap.get(s.key.toLowerCase())! : s
      )
      const mergedKeys = new Set(merged.map((s) => s.key.toLowerCase()))
      for (const s of input.stats as Array<{ key: string; value: string }>) {
        if (!mergedKeys.has(s.key.toLowerCase())) merged.push(s)
      }
      await writeClient.patch(docId).set({ quickStats: merged }).commit()
      const changed = (input.stats as Array<{ key: string; value: string }>)
        .map((s) => `${s.key}: ${s.value}`)
        .join(', ')
      return `Updated stats for ${input.slug}: ${changed}. Live within 60 seconds.`
    }

    case 'update_community_text': {
      const ALLOWED = ['heroHeadline', 'heroSubheadline', 'overviewTitle', 'metaTitle', 'metaDescription']
      if (!ALLOWED.includes(input.field)) return `Field "${input.field}" is not editable via this tool.`
      const docId = await getOrCreateCommunityDoc(input.slug)
      await writeClient.patch(docId).set({ [input.field]: input.value }).commit()
      return `Updated ${input.field} for ${input.slug}. Live within 60 seconds.`
    }

    case 'upload_community_image': {
      const buffer = Buffer.from(input.imageBase64, 'base64')
      const ext = input.mimeType.split('/')[1] ?? 'jpg'
      const asset = await writeClient.assets.upload('image', buffer, {
        filename: `${input.slug}-${input.role}-${Date.now()}.${ext}`,
        contentType: input.mimeType,
      })
      const imageRef = { _type: 'image', asset: { _type: 'reference', _ref: asset._id } }
      const docId = await getOrCreateCommunityDoc(input.slug)

      if (input.role === 'hero') {
        await writeClient.patch(docId).set({ heroImage: imageRef }).commit()
        return `Hero image updated for ${input.slug}. Live within 60 seconds.`
      } else {
        const current = await readClient.fetch<{ sectionImages?: Array<{ role: string; image: any }> }>(
          `*[_id == $id][0]{ sectionImages[]{ role, image } }`,
          { id: docId }
        )
        const existingImages = (current?.sectionImages ?? []).filter((s) => s.role !== input.role)
        existingImages.push({ role: input.role, image: imageRef })
        await writeClient.patch(docId).set({ sectionImages: existingImages }).commit()
        return `"${input.role}" section image updated for ${input.slug}. Live within 60 seconds.`
      }
    }

    case 'get_homepage_content': {
      const doc = await readClient.fetch(
        `*[_type == "homepage" && _id == "homepage"][0]{
          heroHeadline, heroSubheadline, ctaHeadline, ctaBody
        }`
      )
      return doc ? JSON.stringify(doc, null, 2) : 'No homepage CMS overrides yet. Page currently shows hardcoded defaults.'
    }

    case 'update_homepage_field': {
      const ALLOWED = ['heroHeadline', 'heroSubheadline', 'ctaHeadline', 'ctaBody']
      if (!ALLOWED.includes(input.field)) return `Field "${input.field}" is not editable.`
      await writeClient
        .patch('homepage')
        .setIfMissing({ _type: 'homepage', _id: 'homepage' })
        .set({ [input.field]: input.value })
        .commit()
      return `Updated homepage ${input.field}. Live within 60 seconds.`
    }

    default:
      return `Unknown tool: ${name}`
  }
}

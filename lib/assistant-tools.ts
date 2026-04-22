import Anthropic from '@anthropic-ai/sdk'
import { getCommunityOverride, setCommunityOverride, uploadImageAsset, type CommunityOverride } from './blog-redis'

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

// ─── Helper: get community override (creates empty object if missing) ─────────

async function getOrInitOverride(slug: string): Promise<CommunityOverride> {
  return (await getCommunityOverride(slug)) ?? {}
}

// ─── Tool executor ────────────────────────────────────────────────────────────

export async function executeToolCall(name: string, input: Record<string, any>): Promise<string> {
  switch (name) {
    case 'list_community_pages': {
      return JSON.stringify(COMMUNITY_PAGES)
    }

    case 'get_community_content': {
      const doc = await getCommunityOverride(input.slug)
      const community = COMMUNITY_PAGES.find((c) => c.slug === input.slug)
      const result = {
        ...(doc ?? { note: `No CMS overrides yet for "${input.slug}". Page currently shows hardcoded defaults.` }),
        editableStatKeys: community?.quickFactKeys ?? [],
        tip: 'Use update_community_stats with key matching exactly the label shown on the page.',
      }
      return JSON.stringify(result, null, 2)
    }

    case 'update_community_stats': {
      const override = await getOrInitOverride(input.slug)
      const existing = override.quickStats ?? []
      const updateMap = new Map((input.stats as Array<{ key: string; value: string }>).map((s) => [s.key.toLowerCase(), s]))
      const merged = existing.map((s) =>
        updateMap.has(s.key.toLowerCase()) ? updateMap.get(s.key.toLowerCase())! : s
      )
      const mergedKeys = new Set(merged.map((s) => s.key.toLowerCase()))
      for (const s of input.stats as Array<{ key: string; value: string }>) {
        if (!mergedKeys.has(s.key.toLowerCase())) merged.push(s)
      }
      await setCommunityOverride(input.slug, { ...override, quickStats: merged })
      const changed = (input.stats as Array<{ key: string; value: string }>)
        .map((s) => `${s.key}: ${s.value}`)
        .join(', ')
      return `Updated stats for ${input.slug}: ${changed}. Live within 60 seconds.`
    }

    case 'update_community_text': {
      const ALLOWED = ['heroHeadline', 'heroSubheadline', 'overviewTitle', 'metaTitle', 'metaDescription']
      if (!ALLOWED.includes(input.field)) return `Field "${input.field}" is not editable via this tool.`
      const override = await getOrInitOverride(input.slug)
      await setCommunityOverride(input.slug, { ...override, [input.field]: input.value })
      return `Updated ${input.field} for ${input.slug}. Live within 60 seconds.`
    }

    case 'upload_community_image': {
      const buffer = Buffer.from(input.imageBase64, 'base64')
      const ext = input.mimeType.split('/')[1] ?? 'jpg'
      const imageUrl = await uploadImageAsset(
        buffer,
        `community-${input.slug}-${input.role}-${Date.now()}.${ext}`,
        input.mimeType
      )
      const imageRef = { asset: { url: imageUrl } }
      const override = await getOrInitOverride(input.slug)

      if (input.role === 'hero') {
        await setCommunityOverride(input.slug, { ...override, heroImage: imageRef })
        return `Hero image updated for ${input.slug}. Live within 60 seconds.`
      } else {
        const existingImages = (override.sectionImages ?? []).filter((s) => s.role !== input.role)
        existingImages.push({ role: input.role, image: imageRef })
        await setCommunityOverride(input.slug, { ...override, sectionImages: existingImages })
        return `"${input.role}" section image updated for ${input.slug}. Live within 60 seconds.`
      }
    }

    case 'get_homepage_content': {
      const doc = await getCommunityOverride('homepage')
      return doc ? JSON.stringify(doc, null, 2) : 'No homepage CMS overrides yet. Page currently shows hardcoded defaults.'
    }

    case 'update_homepage_field': {
      const ALLOWED = ['heroHeadline', 'heroSubheadline', 'ctaHeadline', 'ctaBody']
      if (!ALLOWED.includes(input.field)) return `Field "${input.field}" is not editable.`
      const override = await getOrInitOverride('homepage')
      await setCommunityOverride('homepage', { ...override, [input.field]: input.value })
      return `Updated homepage ${input.field}. Live within 60 seconds.`
    }

    default:
      return `Unknown tool: ${name}`
  }
}

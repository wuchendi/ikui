import type { MetadataRoute } from 'next'
import { blockCategories, getBlocks } from '@/lib/blocks'
import { getBaseUrl } from '@/lib/config'
import { allDocItems } from '@/lib/doc'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = getBaseUrl()

  const [docs, blocks] = await Promise.all([allDocItems(), getBlocks()])
  const lastModified = new Date()

  return [
    {
      url,
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
    ...docs.map((doc) => ({
      url: `${url}/docs/${doc.id}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    {
      url: `${url}/blocks`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...blockCategories.map((category) => ({
      url: `${url}/blocks/${category.slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...blocks.map((block) => ({
      url: `${url}/blocks/view/${block.name}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    {
      url: `${url}/privacy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${url}/terms`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}

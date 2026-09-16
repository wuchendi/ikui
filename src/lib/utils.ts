import type { Metadata } from 'next'
import { getBaseUrl, siteConfig } from '@/lib/config'

export function absoluteUrl(path: string) {
  const base = getBaseUrl()
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

export function buildOgUrl(params?: { title?: string; description?: string }) {
  const url = new URL(absoluteUrl('/og'))
  if (params?.title) url.searchParams.set('title', params.title)
  if (params?.description)
    url.searchParams.set('description', params.description)
  return url.toString()
}

export function constructMetadata({
  title = siteConfig.name,
  description = siteConfig.description,
  image = absoluteUrl('/og'),
  ...props
}: {
  title?: string
  description?: string
  image?: string
} & Partial<Metadata> = {}): Metadata {
  return {
    title,
    description,
    keywords: siteConfig.keywords,
    applicationName: siteConfig.name,
    authors: [{ name: siteConfig.author.name, url: siteConfig.author.url }],
    creator: siteConfig.author.name,
    publisher: siteConfig.author.name,
    category: 'technology',
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-snippet': -1,
        'max-image-preview': 'large',
        'max-video-preview': -1,
      },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: siteConfig.url,
      siteName: siteConfig.name,
      images: [
        {
          url: image,
          width: 1200,
          height: 628,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
      creator: siteConfig.links.author.replace('https://x.com/', '@'),
    },
    metadataBase: new URL(siteConfig.url),
    icons: '/icon.svg',
    ...props,
  }
}

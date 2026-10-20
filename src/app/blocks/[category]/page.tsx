import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BlockViewer } from '@/components/block-viewer'
import { BlocksNav } from '@/components/blocks-nav'
import { SiteFooter } from '@/components/site-footer'
import SiteHeader from '@/components/site-header'
import {
  blockCategories,
  getBlocksByCategory,
  renderBlocks,
} from '@/lib/blocks'
import { getDocSchema } from '@/lib/doc'
import { constructMetadata } from '@/lib/utils'

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return blockCategories.map((c) => ({ category: c.slug }))
}

function findCategory(slug: string) {
  return blockCategories.find((c) => c.slug === slug)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category } = await params
  const meta = findCategory(category)
  if (!meta) return constructMetadata()
  return constructMetadata({
    title: `${meta.label} Blocks`,
    path: `/blocks/${meta.slug}`,
    description: `${meta.label} business compositions built from the ikui primitives. Copy, paste, install.`,
  })
}

export default async function BlockCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  const meta = findCategory(category)
  if (!meta) notFound()

  const docSchema = await getDocSchema()
  const items = await renderBlocks(await getBlocksByCategory(category))

  return (
    <div className="relative flex min-h-dvh flex-col pt-14">
      <SiteHeader docSchema={docSchema} />
      <main className="3xl:max-w-screen-2xl mx-auto flex w-full flex-1 flex-col px-4 py-12 sm:py-16">
        <header className="mb-12 flex flex-col items-center gap-3 text-center md:mb-16">
          <h1 className="text-3xl font-medium tracking-tight md:text-4xl lg:text-5xl">
            {meta.label} Blocks
          </h1>
          <p className="text-muted-foreground max-w-2xl text-base leading-6 md:text-lg">
            {meta.label} business compositions built from the ikui primitives —
            previewed live, with the full source. Copy, paste, or install with
            the CLI.
          </p>
        </header>

        <BlocksNav active={meta.slug} />

        <div className="mt-12 flex flex-col gap-16">
          {items.map((block) => (
            <BlockViewer
              key={block.name}
              name={block.name}
              title={block.title}
              description={block.description}
              highlightedCode={block.highlightedCode}
              iframeHeight={block.iframeHeight}
            />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

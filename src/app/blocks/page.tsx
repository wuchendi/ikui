import Link from 'next/link'
import { BlockViewer } from '@/components/block-viewer'
import { BlocksNav } from '@/components/blocks-nav'
import { SiteFooter } from '@/components/site-footer'
import SiteHeader from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { getBlocks, renderBlocks } from '@/lib/blocks'
import { getDocSchema } from '@/lib/doc'
import { constructMetadata } from '@/lib/utils'

export const metadata = constructMetadata({
  title: 'Blocks',
  path: '/blocks',
  description:
    'Ready-made business compositions built from the ikui primitives. Copy, paste, install.',
})

export default async function BlocksPage() {
  const docSchema = await getDocSchema()
  const items = await renderBlocks(await getBlocks())

  return (
    <div className="relative flex min-h-dvh flex-col pt-14">
      <SiteHeader docSchema={docSchema} />
      <main className="3xl:max-w-screen-2xl mx-auto flex w-full flex-1 flex-col px-4 py-12 sm:py-16">
        <header className="mb-12 flex flex-col items-center gap-3 text-center md:mb-16">
          <h1 className="text-3xl font-medium tracking-tight md:text-4xl lg:text-5xl">
            Blocks
          </h1>
          <p className="text-muted-foreground max-w-2xl text-base leading-6 md:text-lg">
            Ready-made business compositions built from the ikui primitives —
            previewed live, with the full source. Copy, paste, or install with
            the CLI.
          </p>

          <div className="mt-2 flex flex-row gap-3">
            <Button nativeButton={false} render={<Link href="#blocks" />}>
              Browse Blocks
            </Button>
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link href="/docs/components" />}
            >
              View Components
            </Button>
          </div>
        </header>

        <BlocksNav active="all" />

        <div id="blocks" className="mt-12 flex scroll-mt-20 flex-col gap-16">
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

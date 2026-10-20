import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ComponentType } from 'react'
import { getBlock, getBlocks } from '@/lib/blocks'
import { constructMetadata } from '@/lib/utils'

export const dynamic = 'force-static'
export const dynamicParams = false

export async function generateStaticParams() {
  const blocks = await getBlocks()
  return blocks.map((block) => ({ name: block.name }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>
}): Promise<Metadata> {
  const { name } = await params
  const block = await getBlock(name)
  if (!block) return constructMetadata()
  return constructMetadata({
    title: block.title,
    path: `/blocks/view/${name}`,
    description: block.description,
  })
}

export default async function BlockViewPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params

  let Component: ComponentType
  try {
    Component = (await import(`@/registry/ikui/blocks/${name}`)).default
  } catch {
    notFound()
  }

  return (
    <div className="bg-background flex min-h-dvh w-full items-center p-4 md:p-8">
      <Component />
    </div>
  )
}

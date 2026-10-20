import { Features } from '@/components/features'
import { Hero } from '@/components/hero'
import { HomeCta } from '@/components/home-cta'
import { ScrollStatement } from '@/components/scroll-statement'
import { SiteFooter } from '@/components/site-footer'
import SiteHeader from '@/components/site-header'
import { getDocSchema } from '@/lib/doc'
import { constructMetadata } from '@/lib/utils'

export const metadata = constructMetadata({ path: '/' })

const docSchema = await getDocSchema()

export default function Home() {
  return (
    <div className="flex flex-col relative min-h-dvh pt-14">
      <SiteHeader docSchema={docSchema} />
      <Hero />
      <ScrollStatement />
      <Features />
      <HomeCta />
      <SiteFooter />
    </div>
  )
}

'use client'

import { cn } from 'cn'
import { Terminal } from 'lucide-react'
import { useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfig } from '@/hooks/use-config'
import { CopyButton } from '@/registry/ikui/copy-button'

interface CodeBlockCommandProps {
  item: string
  className?: string
  mcp?: boolean
}

export function CodeBlockCommand({
  item,
  className,
  mcp = false,
}: CodeBlockCommandProps) {
  const [config, setConfig] = useConfig()

  const commands = useMemo(() => {
    if (mcp) {
      return {
        pnpm: `pnpm dlx shadcn@latest mcp init`,
        npm: `npx shadcn@latest mcp init`,
        yarn: `yarn dlx shadcn@latest mcp init`,
        bun: `bunx --bun shadcn@latest mcp init`,
      }
    }
    return {
      pnpm: `pnpm dlx shadcn@latest add @ikui/${item}`,
      npm: `npx shadcn@latest add @ikui/${item}`,
      yarn: `yarn dlx shadcn@latest add @ikui/${item}`,
      bun: `bunx --bun shadcn@latest add @ikui/${item}`,
    }
  }, [item, mcp])

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border bg-muted/30',
        className,
      )}
    >
      <Tabs
        value={config.packageManager}
        onValueChange={(value) => {
          setConfig({
            ...config,
            packageManager: value as 'pnpm' | 'npm' | 'yarn' | 'bun',
          })
        }}
        className="gap-0"
      >
        <div className="relative flex items-center gap-2 border-b px-4 py-2.5 bg-background/50">
          <Terminal
            className="size-3.5 text-muted-foreground"
            strokeWidth={2}
          />
          <TabsList className="h-auto bg-transparent p-0" translate="no">
            <TabsTrigger value="pnpm">pnpm</TabsTrigger>
            <TabsTrigger value="npm">npm</TabsTrigger>
            <TabsTrigger value="yarn">yarn</TabsTrigger>
            <TabsTrigger value="bun">bun</TabsTrigger>
          </TabsList>
          <CopyButton
            value={() => commands[config.packageManager]}
            size="sm"
            className="absolute right-2 opacity-70"
          />
        </div>
        <div className="bg-background">
          {Object.entries(commands).map(([key, command]) => (
            <TabsContent key={key} value={key} className="m-0">
              <pre className="px-4 py-3 overflow-x-auto dark:bg-[#0F0F0F] not-prose">
                <code className="font-mono text-sm text-[#032F62] dark:text-[#9ECBFF]">
                  {command}
                </code>
              </pre>
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  )
}

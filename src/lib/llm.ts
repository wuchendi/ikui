import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { basicDoc } from '../basic-doc'
import { getBaseUrl } from './config'
import type { Registry } from './types'

// This module runs at build time from `next.config` (before webpack/module
// resolution is set up), so it must stay self-contained: only relative imports
// and `fs`. It intentionally does NOT import `./doc` or `./registry` — those
// resolve `@/` aliases and dynamically import `registry.json`, neither of which
// works in the config-load context. It reuses the `Registry` *type* from
// `./types` (erased at build) and reads `registry.json` from disk directly.

/** Marketing blurb shared by the `llms.txt` and `llms-full.txt` headers. */
const SITE_DESCRIPTION =
  'ikui is a copy-paste React component library built on Base UI and ' +
  'Tailwind CSS, distributed through a shadcn-style registry. It ships media ' +
  'and timeline primitives (audio waveform and player, video thumbnail ' +
  'strips, a zoom-aware timeline ruler / element / playhead, image compare ' +
  'and crop), general components (data table, tree, cascader, charts, date ' +
  'range picker), and ready-made blocks composed from them (audio and video ' +
  'trimmers, media compressor, image cropper and editor).'

/** Repository link surfaced in the `llms.txt` "Optional" section. */
const GITHUB_URL = 'https://github.com/WuChenDi/ikui'

/**
 * Turn an authored doc.mdx string into clean Markdown for LLMs / "Copy this page".
 *
 * The authored MDX relies on wrapper components (`<DemoCanvas>`, `<InstallationTabs>`,
 * `<PropsTable>`) and empty ```code fences``` whose body is injected from disk by
 * `remark-code-import` at render time. Neither the raw file nor the rendered DOM is a
 * good copy source, so we resolve the `file=` imports and flatten the wrappers here.
 *
 * Reads referenced demo files with `fs`, so both callers (the docs page and the
 * `.md` route) must run at build time — they are statically generated, not Edge.
 *
 * @param content Raw doc.mdx text.
 * @param docDir  Absolute path to the doc's directory (`docs/<id>`).
 */
export async function processMdxForLLMs(
  content: string,
  docDir: string,
): Promise<string> {
  content = stripLeadingImports(content)
  // Drop the install block (and its full registry source) before inlining, so the
  // only file= fences left to inline are the small demo examples.
  content = flattenInstallationTabs(content)
  content = await inlineFileImports(content, docDir)
  content = flattenDemoCanvas(content)
  content = propsTableToMarkdown(content)
  content = content.replaceAll('@/registry/ikui/', '@/components/ikui/')
  return content.replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * The single source of processed Markdown for a doc id.
 *
 * Reads `docs/<id>/doc.mdx` and runs it through {@link processMdxForLLMs}. Both
 * the static `public/docs/<id>.md` generation and the docs page's "Copy this
 * page" action derive from this one function, so the copied text and the served
 * `.md` file can never drift. Uses `fs`, so callers must run at build time
 * (static generation), never on the Edge runtime. Throws if the doc has no
 * `doc.mdx`.
 */
export async function getDocMarkdown(id: string): Promise<string> {
  const docDir = join(process.cwd(), 'docs', id)
  const raw = await readFile(join(docDir, 'doc.mdx'), 'utf-8')
  return processMdxForLLMs(raw, docDir)
}

/**
 * Drop the leading MDX `import … from './demo'` block. These reference the demo
 * components we inline below, so they are noise once the page is flattened.
 */
function stripLeadingImports(content: string): string {
  return content.replace(/^(?:[ \t]*import[^\n]*\n|[ \t]*\n)+/, '')
}

/**
 * Replace ` ```lang file=./x.tsx ``` ` fences with the actual file contents.
 */
async function inlineFileImports(
  content: string,
  docDir: string,
): Promise<string> {
  const fenceRe =
    /[ \t]*```(\w+)[ \t]+file=([^\s`]+)[^\n]*\n([\s\S]*?)[ \t]*```/g
  return replaceAsync(fenceRe, content, async (_match, lang, rel) => {
    try {
      const code = await readFile(resolve(docDir, rel), 'utf-8')
      return `\`\`\`${lang}\n${code.trimEnd()}\n\`\`\``
    } catch {
      return `\`\`\`${lang}\n\`\`\``
    }
  })
}

/**
 * `<DemoCanvas><DemoPreview>…</DemoPreview><DemoCode>```…```</DemoCode></DemoCanvas>`
 * → just the code block. The preview is a React reference with no value to an LLM.
 */
function flattenDemoCanvas(content: string): string {
  return content.replace(
    /<DemoCanvas[^>]*>([\s\S]*?)<\/DemoCanvas>/g,
    (_match, inner) => {
      const code = inner.match(/<DemoCode>([\s\S]*?)<\/DemoCode>/)
      return code ? `${code[1].trim()}\n` : ''
    },
  )
}

/**
 * `<InstallationTabs item="x">```…```</InstallationTabs>` → just the CLI command.
 *
 * The block's body is the full registry component source; like shadcn we never
 * inline that into the Markdown, only point at the install command.
 *
 * The `item` attribute is read via {@link getJsxAttr}, so it tolerates single-
 * or double-quoted values, `{'expr'}` forms, and any attribute ordering. Blocks
 * without a resolvable `item` are left untouched.
 */
function flattenInstallationTabs(content: string): string {
  return content.replace(
    /<InstallationTabs\b([^>]*)>[\s\S]*?<\/InstallationTabs>/g,
    (full: string, attrs: string) => {
      const item = getJsxAttr(attrs, 'item')
      if (!item) {
        return full
      }
      return `\`\`\`bash\nnpx shadcn@latest add @ikui/${item}\n\`\`\`\n`
    },
  )
}

/**
 * Read a JSX attribute value from an opening-tag attribute string. Handles
 * `name="x"`, `name='x'`, and `name={'x'}` / `name={"x"}` regardless of the
 * attribute's position. Returns null when the attribute is absent or its value
 * is not a plain string literal.
 */
function getJsxAttr(attrs: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(["'\`])((?:\\\\.|(?!\\3).)*)\\3\\s*\\})`,
  )
  const m = attrs.match(re)
  if (!m) {
    return null
  }
  return m[1] ?? m[2] ?? m[4] ?? null
}

/**
 * `<PropsTable data={[{ name, type, default, nameDetails, typeDetails }, …]} />`
 * → a Markdown table. Left untouched if the data array cannot be parsed.
 *
 * The `data` expression is located with a brace/bracket/string-aware scanner
 * (see {@link readBalanced}) rather than a non-greedy regex, and each object is
 * parsed by {@link parsePropsData}, so nested braces (`{ a: b }[]`), pipes, and
 * both quote styles survive intact. Table cells are escaped so a `|` inside a
 * type never breaks the Markdown table.
 */
function propsTableToMarkdown(content: string): string {
  const tag = '<PropsTable'
  let result = ''
  let cursor = 0
  for (
    let start = content.indexOf(tag, cursor);
    start !== -1;
    start = content.indexOf(tag, cursor)
  ) {
    result += content.slice(cursor, start)

    // Locate `data={ … }` for this tag, then read the balanced brace group so
    // nested braces inside the array don't confuse the delimiter.
    const dataAt = content.indexOf('data=', start)
    const braceAt = dataAt === -1 ? -1 : content.indexOf('{', dataAt)
    const close = braceAt === -1 ? -1 : readBalanced(content, braceAt, '{', '}')
    const tagEnd = close === -1 ? -1 : content.indexOf('/>', close)
    const rows =
      close === -1 ? null : parsePropsData(content.slice(braceAt + 1, close))

    if (!rows || tagEnd === -1) {
      // Not a shape we can parse — emit the tag verbatim and move past it.
      result += tag
      cursor = start + tag.length
      continue
    }

    result += renderPropsTable(rows)
    cursor = tagEnd + 2
  }
  return result + content.slice(cursor)
}

/** Assemble the Markdown table from parsed prop rows, escaping every cell. */
function renderPropsTable(rows: Array<Record<string, string>>): string {
  const body = rows.map((row) => {
    const name = escapeCell(row.name ?? '')
    const type = escapeCell(row.type ?? '')
    const def = escapeCell(row.default ?? '')
    const desc = escapeCell(row.nameDetails || row.typeDetails || '')
    return `| \`${name}\` | \`${type}\` | ${def ? `\`${def}\`` : '-'} | ${desc || '-'} |`
  })
  return [
    '| Prop | Type | Default | Description |',
    '| ---- | ---- | ------- | ----------- |',
    ...body,
  ].join('\n')
}

/**
 * Escape a value for a single Markdown table cell: `|` would otherwise start a
 * new column (even inside an inline-code span, per GFM), and a newline would
 * break the row.
 */
function escapeCell(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}

/**
 * Return the index of the `}`/`]` that closes the group opened at `openAt`,
 * skipping string literals so braces inside `"…"`, `'…'`, or `` `…` `` don't
 * shift the depth. Returns -1 when unbalanced.
 */
function readBalanced(
  text: string,
  openAt: number,
  open: string,
  closeCh: string,
): number {
  let depth = 0
  let quote: string | null = null
  for (let i = openAt; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') {
        i++
      } else if (c === quote) {
        quote = null
      }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
    } else if (c === open) {
      depth++
    } else if (c === closeCh) {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

/**
 * Parse a `[{ key: "value", … }, …]` object-literal array into plain records.
 * All authored PropsTable values are string literals; this reads them with a
 * quote-aware scanner so single/double/backtick quotes and nested braces are
 * handled. Returns null if the text is not a parseable array of objects.
 */
function parsePropsData(
  arrayText: string,
): Array<Record<string, string>> | null {
  const open = arrayText.indexOf('[')
  if (open === -1) {
    return null
  }
  const objects: Array<Record<string, string>> = []
  let i = open + 1
  while (i < arrayText.length) {
    while (i < arrayText.length && /[\s,]/.test(arrayText[i])) {
      i++
    }
    if (i >= arrayText.length || arrayText[i] === ']') {
      break
    }
    if (arrayText[i] !== '{') {
      return null
    }
    const close = readBalanced(arrayText, i, '{', '}')
    if (close === -1) {
      return null
    }
    const obj = parseObjectBody(arrayText.slice(i + 1, close))
    if (!obj) {
      return null
    }
    objects.push(obj)
    i = close + 1
  }
  return objects.length ? objects : null
}

/** Parse the inside of a `{ key: "value", … }` literal into a key→value record. */
function parseObjectBody(body: string): Record<string, string> | null {
  const obj: Record<string, string> = {}
  let i = 0
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) {
      i++
    }
    if (i >= body.length) {
      break
    }
    // Key: a bare identifier or a quoted string.
    let key: string
    const kq = body[i]
    if (kq === '"' || kq === "'" || kq === '`') {
      const read = readString(body, i)
      if (!read) {
        return null
      }
      key = read.value
      i = read.end
    } else {
      const start = i
      while (i < body.length && /[\w$]/.test(body[i])) {
        i++
      }
      if (i === start) {
        return null
      }
      key = body.slice(start, i)
    }
    while (i < body.length && /\s/.test(body[i])) {
      i++
    }
    if (body[i] !== ':') {
      return null
    }
    i++
    while (i < body.length && /\s/.test(body[i])) {
      i++
    }
    // Value: string literals are captured; any other shape is skipped so the
    // record still parses (unknown keys are ignored downstream anyway).
    const vq = body[i]
    if (vq === '"' || vq === "'" || vq === '`') {
      const read = readString(body, i)
      if (!read) {
        return null
      }
      obj[key] = read.value
      i = read.end
    } else {
      i = skipValue(body, i)
    }
  }
  return obj
}

/**
 * Read the string literal starting at `at` (its opening quote). Returns the
 * unescaped contents and the index just past the closing quote, or null if the
 * string is never closed.
 */
function readString(
  text: string,
  at: number,
): { value: string; end: number } | null {
  const quote = text[at]
  let value = ''
  for (let i = at + 1; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') {
      value += text[i + 1] ?? ''
      i++
    } else if (c === quote) {
      return { value, end: i + 1 }
    } else {
      value += c
    }
  }
  return null
}

/** Skip a non-string value up to the next top-level comma, respecting nesting. */
function skipValue(text: string, at: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = at; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') {
        i++
      } else if (c === quote) {
        quote = null
      }
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
    } else if (c === '{' || c === '[' || c === '(') {
      depth++
    } else if (c === '}' || c === ']' || c === ')') {
      depth--
    } else if (c === ',' && depth === 0) {
      return i
    }
  }
  return text.length
}

async function replaceAsync(
  regex: RegExp,
  str: string,
  fn: (...args: string[]) => Promise<string>,
): Promise<string> {
  const matches = [...str.matchAll(regex)]
  let result = ''
  let last = 0
  for (const match of matches) {
    result += str.slice(last, match.index)
    result += await fn(...match)
    last = match.index + match[0].length
  }
  return result + str.slice(last)
}

/**
 * Build the processed Markdown for every doc and write it to `public/docs/<id>.md`.
 *
 * Runs at build time (from `next.config`), where `fs` is available. Cloudflare
 * Pages then serves these as plain static assets — the `.md` endpoint cannot be a
 * route handler because next-on-pages forces route handlers onto the Edge runtime,
 * which has no filesystem.
 */
export async function generateLlmMarkdownFiles(): Promise<void> {
  const docsDir = join(process.cwd(), 'docs')
  const outDir = join(process.cwd(), 'public', 'docs')
  const entries = await readdir(docsDir, { withFileTypes: true })
  // Start clean so renamed/removed docs don't leave stale .md files behind.
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const markdownById = new Map<string, string>()
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        let markdown: string
        try {
          markdown = await getDocMarkdown(entry.name)
        } catch {
          // Not a documentation page (e.g. PMA plan/task folders); skip it.
          return
        }
        markdownById.set(entry.name, markdown)
        await writeFile(join(outDir, `${entry.name}.md`), markdown, 'utf-8')
      }),
  )

  const registry = await readRegistry()
  const titles = collectDocTitles(registry)
  await writeLlmsFullFile(markdownById, titles)
  await writeLlmsIndexFile(markdownById, registry)
}

/**
 * Concatenate every processed doc into a single `public/llms-full.txt`, the
 * "entire guide in one file" companion to the `llms.txt` index. Sections are
 * ordered basic-doc pages first (Overview section order), then registry
 * components in registry.json order, then any remaining docs alphabetically.
 */
async function writeLlmsFullFile(
  markdownById: Map<string, string>,
  titles: Map<string, string>,
): Promise<void> {
  const ordered = orderDocIds([...markdownById.keys()], titles)

  const header =
    '# ikui\n\n' +
    `> ${SITE_DESCRIPTION}\n\n` +
    'This file contains the full text of every ikui documentation page, ' +
    'concatenated for LLM consumption. For a lighter index with links, see ' +
    '`/llms.txt`.\n'

  const sections = ordered.map((id) => {
    const title = titles.get(id) ?? toTitleCase(id)
    return `# ${title}\n\n${markdownById.get(id)?.trim() ?? ''}\n`
  })

  const content = `${[header, ...sections].join('\n---\n\n')}`
  await writeFile(
    join(process.cwd(), 'public', 'llms-full.txt'),
    content,
    'utf-8',
  )
}

/**
 * Build `public/llms.txt`, the link index that points at the per-page `.md`
 * files and the `llms-full.txt` bundle. Sections, titles, and the base URL are
 * all derived from `basic-doc`, `registry.json`, and the docs actually emitted,
 * so the index never drifts from what was generated. Companion to
 * `writeLlmsFullFile`; runs at build time alongside it.
 */
async function writeLlmsIndexFile(
  markdownById: Map<string, string>,
  registry: Registry | null,
): Promise<void> {
  const base = registry?.homepage ?? getBaseUrl()
  const lines: string[] = ['# ikui', '', `> ${SITE_DESCRIPTION}`, '']
  lines.push(
    `Install any component with the shadcn CLI, e.g. ` +
      `\`pnpx shadcn@latest add ${base}/r/copy-button.json\`. To use the ` +
      `\`@ikui\` namespace, add \`"@ikui": "${base}/r/{name}.json"\` to the ` +
      `\`registries\` field in your \`components.json\`.`,
    '',
  )

  // Overview: the basic-doc sections, limited to pages that were emitted.
  for (const section of basicDoc) {
    const items = section.items.filter((item) => markdownById.has(item.id))
    if (!items.length) {
      continue
    }
    lines.push(`## ${section.title}`, '')
    for (const item of items) {
      lines.push(
        `- [${item.title}](${base}/docs/${item.id}.md): ${item.description}`,
      )
    }
    lines.push('')
  }

  // Components: registry components that have a documentation page, in
  // registry.json order.
  const components = (registry?.items ?? []).filter(
    (item) => item.type === 'registry:component' && markdownById.has(item.name),
  )
  if (components.length) {
    lines.push('## Components', '')
    for (const item of components) {
      lines.push(
        `- [${item.title}](${base}/docs/${item.name}.md): ${item.description ?? ''}`,
      )
    }
    lines.push('')
  }

  // Blocks have no docs page; link their registry item, which carries the
  // description and full source.
  const blocks = (registry?.items ?? []).filter(
    (item) => item.type === 'registry:block',
  )
  if (blocks.length) {
    lines.push('## Blocks', '')
    for (const item of blocks) {
      lines.push(
        `- [${item.title}](${base}/r/${item.name}.json): ${item.description ?? ''}`,
      )
    }
    lines.push('')
  }

  lines.push(
    '## Optional',
    '',
    `- [Registry Index](${base}/r/registry.json): The shadcn registry manifest listing every installable ikui item.`,
    `- [llms-full.txt](${base}/llms-full.txt): The entire ikui documentation concatenated into a single file.`,
    `- [GitHub Repository](${GITHUB_URL}): Source code, issues, and contributions.`,
  )

  const content =
    lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  await writeFile(join(process.cwd(), 'public', 'llms.txt'), content, 'utf-8')
}

/** Read and parse `registry.json` from disk; returns null when it is absent. */
async function readRegistry(): Promise<Registry | null> {
  try {
    const raw = await readFile(join(process.cwd(), 'registry.json'), 'utf-8')
    return JSON.parse(raw) as Registry
  } catch {
    return null
  }
}

/**
 * Map doc id → display title from basic-doc and the registry manifest, the two
 * sources the docs schema is assembled from at runtime.
 */
function collectDocTitles(registry: Registry | null): Map<string, string> {
  const titles = new Map<string, string>()
  for (const section of basicDoc) {
    for (const item of section.items) {
      titles.set(item.id, item.title)
    }
  }
  for (const item of registry?.items ?? []) {
    if (item.type === 'registry:component') {
      titles.set(item.name, item.title)
    }
  }
  return titles
}

/**
 * Order doc ids by basic-doc sequence, then registry component order (captured
 * in `titles` insertion order), then leftovers alphabetically.
 */
function orderDocIds(ids: string[], titles: Map<string, string>): string[] {
  const available = new Set(ids)
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const id of titles.keys()) {
    if (available.has(id) && !seen.has(id)) {
      ordered.push(id)
      seen.add(id)
    }
  }
  for (const id of [...ids].sort()) {
    if (!seen.has(id)) {
      ordered.push(id)
      seen.add(id)
    }
  }
  return ordered
}

function toTitleCase(id: string): string {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

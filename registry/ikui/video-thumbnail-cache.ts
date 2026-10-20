import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny'

const DEFAULT_THUMBNAIL_HEIGHT = 120
const DEFAULT_MAX_CACHED = 500

export interface VideoThumbnailCacheOptions {
  /** Video blob (e.g. from `fetch().then(r => r.blob())` or an `<input type="file">`). */
  source: Blob
  /** Decoded thumbnail height in pixels. Width scales to preserve aspect. Default: 120. */
  thumbnailHeight?: number
  /** Max number of cached thumbnails. When exceeded, oldest 20% are evicted. Default: 500. */
  maxCached?: number
}

export interface VideoThumbnailMetadata {
  /** Duration in seconds. */
  duration: number
  /** Coded width of the video track. */
  width: number
  /** Coded height of the video track. */
  height: number
}

export interface VideoThumbnailLoadParams {
  /** Times to fetch (seconds, video-absolute). Each `id` is echoed back via `onBitmap`. */
  times: { id: string | number; time: number }[]
  /** Called per resolved bitmap as it becomes available. */
  onBitmap: (params: { id: string | number; bitmap: ImageBitmap }) => void
}

function snapTime(t: number): number {
  return Math.round(t * 1000) / 1000
}

function timeKey(t: number): string {
  return t.toFixed(3)
}

function binarySearchNearest(sorted: number[], target: number): number {
  if (sorted.length === 0) return -1
  let lo = 0
  let hi = sorted.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid] < target) lo = mid + 1
    else hi = mid
  }
  if (
    lo > 0 &&
    Math.abs(sorted[lo - 1] - target) < Math.abs(sorted[lo] - target)
  ) {
    return lo - 1
  }
  return lo
}

/**
 * Decodes video frames at requested times via mediabunny, caches them as
 * `ImageBitmap`s, and exposes the trio of methods the thumbnail-strip
 * components consume: sync cache lookup, sync nearest-cache lookup, and an
 * async batch loader.
 *
 * One cache instance wraps one video. Multiple consumers (e.g. several
 * thumbnail strips visualizing different sub-ranges of the same video) can
 * share an instance — calls are serialized internally so the underlying
 * sample sink is never iterated concurrently.
 */
export class VideoThumbnailCache {
  private readonly thumbnailHeight: number
  private readonly maxCached: number
  private readonly blob: Blob

  private thumbnails = new Map<string, ImageBitmap>()
  private posterUrls = new Map<string, string>()
  private posterPending = new Map<string, Promise<string | null>>()
  private sortedTimes: number[] = []
  private sink: VideoSampleSink | null = null
  private metadata: VideoThumbnailMetadata | null = null
  private initPromise: Promise<VideoThumbnailMetadata> | null = null
  private chain: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(options: VideoThumbnailCacheOptions) {
    this.blob = options.source
    this.thumbnailHeight = options.thumbnailHeight ?? DEFAULT_THUMBNAIL_HEIGHT
    this.maxCached = options.maxCached ?? DEFAULT_MAX_CACHED
  }

  /** Fetch + decode by URL. Returns a cache that has already resolved its metadata. */
  static async fromUrl(
    url: string,
    options?: Omit<VideoThumbnailCacheOptions, 'source'> & {
      requestInit?: RequestInit
    },
  ): Promise<VideoThumbnailCache> {
    const res = await fetch(url, {
      mode: 'cors',
      ...(options?.requestInit ?? {}),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    const blob = await res.blob()
    const cache = new VideoThumbnailCache({ source: blob, ...options })
    await cache.initialize()
    return cache
  }

  /** Open the video and resolve metadata. Idempotent. */
  initialize(): Promise<VideoThumbnailMetadata> {
    if (this.metadata) return Promise.resolve(this.metadata)
    if (this.initPromise !== null) return this.initPromise
    this.initPromise = this.doInit()
    return this.initPromise
  }

  private async doInit(): Promise<VideoThumbnailMetadata> {
    const input = new Input({
      source: new BlobSource(this.blob),
      formats: ALL_FORMATS,
    })
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('no video track in source')
    const canDecode = await track.canDecode()
    if (!canDecode) throw new Error('video codec not decodable in browser')
    const duration = await track.computeDuration()
    const width = track.codedWidth ?? 0
    const height = track.codedHeight ?? 0
    this.sink = new VideoSampleSink(track)
    this.metadata = { duration, width, height }
    return this.metadata
  }

  /** Resolved metadata, or `null` if `initialize()` has not yet completed. */
  getMetadata(): VideoThumbnailMetadata | null {
    return this.metadata
  }

  /** Sync lookup. Returns `null` when no exact (millisecond-snapped) match exists. */
  getCachedBitmap(time: number): ImageBitmap | null {
    return this.thumbnails.get(timeKey(snapTime(time))) ?? null
  }

  /** Sync nearest-neighbor lookup over all cached times. */
  getNearestCachedBitmap(time: number): ImageBitmap | null {
    if (this.sortedTimes.length === 0) return null
    const idx = binarySearchNearest(this.sortedTimes, time)
    if (idx === -1) return null
    return this.thumbnails.get(timeKey(this.sortedTimes[idx])) ?? null
  }

  /**
   * Async batch decode. Times are snapped to milliseconds and de-duplicated.
   * Already-cached times are skipped silently. Concurrent calls are queued
   * onto a shared chain so the underlying sink is iterated one batch at a time.
   */
  loadBitmaps(params: VideoThumbnailLoadParams): Promise<void> {
    const next = this.chain.then(async () => {
      if (this.disposed) return
      if (!this.sink) await this.initialize()
      if (!this.sink || this.disposed) return

      const uniqueTimes: number[] = []
      const timeToIds = new Map<number, (string | number)[]>()

      for (const { id, time } of params.times) {
        const snapped = snapTime(time)
        const key = timeKey(snapped)
        if (this.thumbnails.has(key)) continue
        const existing = timeToIds.get(snapped)
        if (existing) {
          existing.push(id)
        } else {
          uniqueTimes.push(snapped)
          timeToIds.set(snapped, [id])
        }
      }

      if (uniqueTimes.length === 0) return

      try {
        const iterator = this.sink.samplesAtTimestamps(uniqueTimes)
        let j = 0
        for await (const sample of iterator) {
          if (this.disposed) {
            sample?.close()
            break
          }
          if (j >= uniqueTimes.length) {
            sample?.close()
            break
          }
          const time = uniqueTimes[j++]
          if (!sample) continue
          try {
            const bitmap = await this.scaleSampleToBitmap(sample)
            if (!bitmap) continue
            this.evictIfNeeded()
            this.thumbnails.set(timeKey(time), bitmap)
            this.addToTimeIndex(time)
            const ids = timeToIds.get(time)
            if (ids) {
              for (const id of ids) params.onBitmap({ id, bitmap })
            }
          } finally {
            sample.close()
          }
        }
      } catch (err) {
        console.warn('VideoThumbnailCache loadBitmaps failed:', err)
      }
    })
    this.chain = next.catch(() => {})
    return next
  }

  /**
   * Decode one frame and return a tiled-poster-ready object URL. Useful as an
   * instant fallback that fills a strip before per-tile frames load. Results are
   * memoized per (snapped) time and concurrent calls are de-duplicated; the
   * cache owns the URLs and revokes them in `dispose()`. Returns `null` when the
   * frame cannot be decoded. Default time: 0.
   */
  getPosterUrl(time = 0): Promise<string | null> {
    const key = timeKey(snapTime(time))
    const existing = this.posterUrls.get(key)
    if (existing) return Promise.resolve(existing)
    const pending = this.posterPending.get(key)
    if (pending !== undefined) return pending
    const next = this.buildPosterUrl(snapTime(time), key)
    this.posterPending.set(key, next)
    return next
  }

  private async buildPosterUrl(
    time: number,
    key: string,
  ): Promise<string | null> {
    try {
      if (this.disposed) return null
      let bitmap = await new Promise<ImageBitmap | null>((resolve) => {
        void this.loadBitmaps({
          times: [{ id: 0, time }],
          onBitmap: ({ bitmap }) => resolve(bitmap),
        }).then(() => resolve(null))
      })
      // loadBitmaps skips already-cached times without firing onBitmap, so fall
      // back to the cached bitmap when the batch resolved nothing.
      if (!bitmap) bitmap = this.getCachedBitmap(time)
      if (!bitmap || this.disposed) return null
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0)
      const blob = await canvas.convertToBlob()
      if (this.disposed) return null
      const url = URL.createObjectURL(blob)
      this.posterUrls.set(key, url)
      return url
    } catch (err) {
      console.warn('VideoThumbnailCache getPosterUrl failed:', err)
      return null
    } finally {
      this.posterPending.delete(key)
    }
  }

  /** Close every cached bitmap, revoke poster URLs, and drop the underlying sink. */
  dispose(): void {
    this.disposed = true
    for (const bitmap of this.thumbnails.values()) bitmap.close()
    this.thumbnails.clear()
    for (const url of this.posterUrls.values()) URL.revokeObjectURL(url)
    this.posterUrls.clear()
    this.posterPending.clear()
    this.sortedTimes = []
    this.sink = null
  }

  private async scaleSampleToBitmap(sample: {
    codedWidth: number
    codedHeight: number
    draw: (
      ctx: OffscreenCanvasRenderingContext2D,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => void
  }): Promise<ImageBitmap | null> {
    const scale = Math.min(1, this.thumbnailHeight / sample.codedHeight)
    const w = Math.round(sample.codedWidth * scale)
    const h = Math.round(sample.codedHeight * scale)
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    sample.draw(ctx, 0, 0, w, h)
    return createImageBitmap(canvas)
  }

  private addToTimeIndex(time: number): void {
    let lo = 0
    let hi = this.sortedTimes.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.sortedTimes[mid] < time) lo = mid + 1
      else hi = mid
    }
    if (this.sortedTimes[lo] !== time) {
      this.sortedTimes.splice(lo, 0, time)
    }
  }

  private evictIfNeeded(): void {
    if (this.thumbnails.size < this.maxCached) return
    const removeCount = Math.floor(this.maxCached * 0.2)
    const keys = Array.from(this.thumbnails.keys()).slice(0, removeCount)
    for (const key of keys) {
      const bitmap = this.thumbnails.get(key)
      if (bitmap) bitmap.close()
      this.thumbnails.delete(key)
      const time = Number.parseFloat(key)
      const idx = this.sortedTimes.indexOf(time)
      if (idx !== -1) this.sortedTimes.splice(idx, 1)
    }
  }
}

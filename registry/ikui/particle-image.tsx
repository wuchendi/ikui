'use client'

import { cn } from 'cn'
import * as React from 'react'

/**
 * Vanilla particle engine that powers the ParticleImage component.
 * Reads an <img> (or its dataset), samples its pixels onto a canvas, and
 * animates the result as interactive particles. Framework-agnostic on purpose.
 */

interface ParticleEngineOptions {
  width?: number
  height?: number
  maxWidth?: number | string
  maxHeight?: number | string
  minWidth?: number | string
  minHeight?: number | string
  gravity?: number
  particleGap?: number
  particleSize?: number
  layerCount?: number
  depth?: number
  rotationDuration?: number
  growDuration?: number
  waitDuration?: number
  shrinkDuration?: number
  shrinkDistance?: number
  threeDimensional?: boolean | string
  lifeCycle?: boolean | string
  layerDistance?: number
  initPosition?:
    | 'random'
    | 'top'
    | 'left'
    | 'bottom'
    | 'right'
    | 'misplaced'
    | 'none'
  initDirection?: 'random' | 'top' | 'left' | 'bottom' | 'right' | 'none'
  fadePosition?:
    | 'explode'
    | 'top'
    | 'left'
    | 'bottom'
    | 'right'
    | 'random'
    | 'none'
  fadeDirection?: 'random' | 'top' | 'left' | 'bottom' | 'right' | 'none'
  noise?: number
  disableInteraction?: boolean
  mouseForce?: number
  clickStrength?: number
  color?: string
  colorArr?: number[]
  image?: HTMLImageElement
  imageId?: string
  imageUrl?: string
  wrapperElement?: HTMLElement
  canvas?: HTMLCanvasElement
  context?:
    | CanvasRenderingContext2D
    | WebGL2RenderingContext
    | WebGLRenderingContext
  renderer?: 'default' | 'webgl'
  addTimestamp?: boolean
  responsiveWidth?: boolean
}

/**
 * Raw option dictionary as it actually arrives at runtime. When the engine is
 * constructed from an `<img>`, every value comes from `element.dataset` and is
 * therefore a string; when constructed from an options object the values are
 * already typed. Hence the loose, string-or-typed shape.
 */
type RawOptions = {
  [K in keyof ParticleEngineOptions]?: ParticleEngineOptions[K] | string
}

type EngineEvent = 'imageLoaded' | 'stopped'
type EngineListener = (payload?: unknown) => void

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  isHidden?: boolean
  isDead?: boolean
}

interface Origin {
  x: number
  y: number
  z: number
  color: number[]
  tick: number
  seed: number
  vertexColors: number[]
}

interface PointerTouch {
  x: number
  y: number
  z: number
  force: number
}

const rotationX = 0
const rotationY = 0

function requestFrame(callback: FrameRequestCallback): void {
  // Resolved lazily so the module can be imported during SSR (no `window`).
  const raf =
    window.requestAnimationFrame ||
    (window as { webkitRequestAnimationFrame?: typeof requestAnimationFrame })
      .webkitRequestAnimationFrame ||
    (window as { mozRequestAnimationFrame?: typeof requestAnimationFrame })
      .mozRequestAnimationFrame ||
    ((cb: FrameRequestCallback) => setTimeout(cb, 10))
  raf(callback)
}

function normalizeColorArr(
  value: number[] | string | undefined,
): number[] | undefined {
  if (!value) return undefined
  // From `element.dataset`, an array is serialized to a comma-separated string.
  const arr = Array.isArray(value)
    ? value
    : String(value).split(',').map(Number)
  return arr.length > 0 && arr.every((n) => !isNaN(n)) ? arr : undefined
}

function resolveDimension(
  raw: number | string | undefined,
  base: number,
): number | undefined {
  if (!raw) return undefined
  if (typeof raw === 'string' && raw.endsWith('%')) {
    return (base * parseFloat(raw)) / 100
  }
  return Number(raw)
}

class ParticleEngine {
  state: 'stopped' | 'running' | 'stopping' = 'stopped'
  touches: PointerTouch[] = []
  canvas?: HTMLCanvasElement
  colorArr?: number[]

  private events: Record<string, EngineListener[]> = {}
  private origins: Origin[] = []
  private particles: Particle[] = []
  private vertices: number[] | false = false

  private _renderer!: 'default' | 'webgl'
  private _draw: () => void = () => {}
  private context!:
    | CanvasRenderingContext2D
    | WebGLRenderingContext
    | WebGL2RenderingContext

  private srcImage!: HTMLImageElement
  private image!: HTMLImageElement
  private imageUrl = ''
  private wrapperElement!: HTMLElement
  private imageWidth = 0
  private imageHeight = 0
  private imageRatio = 1
  private renderSize = 0

  private width = 0
  private height = 0
  private maxWidth?: number
  private maxHeight?: number
  private minWidth?: number
  private minHeight?: number
  private renderWidth = 0
  private renderHeight = 0
  private offsetX = 0
  private offsetY = 0
  private ratio = 1

  private alphaFade = 0.4
  private gravity = 0.08
  private gravityFactor = 1
  private speed = 0
  private particleGap = 3
  private particleSize = 1
  private layerCount = 1
  private layerDistance = 3
  private depth = 1
  private minZ = 0
  private maxZ = 0
  private noise = 10
  private mouseForce = 30
  private clickStrength = 0
  private rotationDuration = 0
  private growDuration = 200
  private waitDuration = 200
  private shrinkDuration = 200
  private shrinkDistance = 50
  private threeDimensional = false
  private lifeCycle = false
  private disableInteraction: unknown
  private responsiveWidth = false
  private resizeObserver?: ResizeObserver
  private destroyed = false

  private initPosition = 'random'
  private initDirection = 'random'
  private fadePosition = 'none'
  private fadeDirection = 'none'

  // WebGL state.
  private program!: WebGLProgram
  private fragmentShaderScript = ''
  private vertexShaderScript = ''
  private vertexBuffer: WebGLBuffer | null = null
  private vertexPosition = 0
  private vertexColor = 0
  private vertexOffset: WebGLUniformLocation | null = null
  private uModelViewMatrix: WebGLUniformLocation | null = null
  private uPerspectiveMatrix: WebGLUniformLocation | null = null
  private uRotationMatrix: WebGLUniformLocation | null = null
  private uPointSize: WebGLUniformLocation | null = null
  private uDepth: WebGLUniformLocation | null = null

  constructor(optionsParam?: RawOptions | HTMLElement) {
    let options: RawOptions = {}
    if (optionsParam) {
      if (optionsParam instanceof HTMLElement) {
        options = JSON.parse(JSON.stringify(optionsParam.dataset))
        if (optionsParam.nodeName === 'IMG') {
          options.image = optionsParam as HTMLImageElement
        } else {
          options.wrapperElement = optionsParam
        }
      } else {
        options = optionsParam
      }
    }
    this.on('imageLoaded', this._onImageLoaded as EngineListener)
    this._initImage(options)
  }

  on(event: EngineEvent, fn: EngineListener) {
    this.events[event] = this.events[event] || []
    this.events[event].push(fn)
  }

  emit(event: EngineEvent, params?: unknown) {
    const listeners = this.events[event]
    if (listeners?.length) {
      for (const cb of listeners) {
        cb.call(this, params)
      }
    }
  }

  get renderer() {
    return this._renderer
  }

  set renderer(value: 'default' | 'webgl') {
    this._renderer = value
    if (value === 'webgl') {
      this._draw = () => this._webglRenderer()
      try {
        this._webglInitContext()
      } catch {
        this.renderer = 'default'
      }
    } else {
      this._draw = () => this._defaultRenderer()
      this._defaultInitContext()
    }
  }

  set color(value: string | undefined) {
    const parsed = this._parseColor(value)
    this.colorArr = parsed
    if (parsed) {
      if (isNaN(parsed[3])) {
        parsed[3] = 255
      }
      if (0 < parsed[3] && parsed[3] <= 1) {
        parsed[3] *= 255
      }
    }
  }

  start(options: Partial<ParticleEngineOptions> = {}) {
    if (this.destroyed) return
    this.initPosition = options.initPosition || this.initPosition
    this.initDirection = options.initDirection || this.initDirection
    if (this.canvas) {
      this.canvas.width = this.width
      this.canvas.height = this.height
      this.canvas.style.display = ''
    }
    this._initOrigins()
    this._initParticles()
    this._webglSetAttributes()
    if (this.state !== 'running') {
      this.state = 'running'
      if (!this.disableInteraction && this.canvas) {
        if (
          'ontouchstart' in window ||
          (window.navigator as { msPointerEnabled?: boolean }).msPointerEnabled
        ) {
          document.body.addEventListener('touchstart', this._touchHandler, {
            passive: false,
          })
          document.body.addEventListener('touchmove', this._touchHandler, {
            passive: false,
          })
          document.body.addEventListener('touchend', this._clearTouches)
          document.body.addEventListener('touchcancel', this._clearTouches)
        } else {
          this.canvas.addEventListener('mousemove', this._mouseHandler)
          this.canvas.addEventListener('mouseout', this._clearTouches)
          this.canvas.addEventListener('click', this._clickHandler)
        }
      }
      this._animate()
    }
  }

  stop(options: Partial<ParticleEngineOptions> = {}) {
    this.fadePosition = options.fadePosition || this.fadePosition
    this.fadeDirection = options.fadeDirection || this.fadeDirection
    this._fade()
    document.body.removeEventListener('touchstart', this._touchHandler)
    document.body.removeEventListener('touchmove', this._touchHandler)
    document.body.removeEventListener('touchend', this._clearTouches)
    document.body.removeEventListener('touchcancel', this._clearTouches)
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this._mouseHandler)
      this.canvas.removeEventListener('mouseout', this._clearTouches)
      this.canvas.removeEventListener('click', this._clickHandler)
    }
  }

  /**
   * Permanently tear the engine down: halt the animation loop, detach every
   * listener, and drop the generated canvas. Safe to call before the source
   * image has loaded — a late load will no longer (re)start the engine.
   */
  destroy() {
    this.destroyed = true
    this.state = 'stopped'
    if (this.image) this.image.onload = null
    this.resizeObserver?.disconnect()
    document.body.removeEventListener('touchstart', this._touchHandler)
    document.body.removeEventListener('touchmove', this._touchHandler)
    document.body.removeEventListener('touchend', this._clearTouches)
    document.body.removeEventListener('touchcancel', this._clearTouches)
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this._mouseHandler)
      this.canvas.removeEventListener('mouseout', this._clearTouches)
      this.canvas.removeEventListener('click', this._clickHandler)
      this.canvas.remove()
    }
  }

  private _animate() {
    if (this.state !== 'stopped') {
      this._calculate()
      this._draw()
      requestFrame(() => this._animate())
    } else {
      this.emit('stopped')
    }
  }

  // Event handlers are stable instance fields (not getters) so the exact same
  // reference is passed to add/removeEventListener and can be detached.
  private _mouseHandler = (e: MouseEvent) => {
    this.touches = [
      {
        x: e.offsetX,
        y: e.offsetY,
        z: 49 + (this.layerCount - 1) * this.layerDistance,
        force: 1,
      },
    ]
  }

  private _clickHandler = (_e: MouseEvent) => {
    const strength = this.clickStrength
    this.origins.forEach((o) => (o.z -= strength))
    setTimeout(() => {
      this.origins.forEach((o) => (o.z += strength))
    }, 100)
  }

  private _touchHandler = (e: TouchEvent) => {
    this.touches = []
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      if (touch.target === this.canvas) {
        this.touches.push({
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
          z: 49 + (this.layerCount - 1) * this.layerDistance,
          force: touch.force || 1,
        })
        e.preventDefault()
      }
    }
  }

  private _clearTouches = (_e: Event) => {
    this.touches = []
  }

  private _onImageLoaded(options: RawOptions) {
    if (this.destroyed) return
    this.imageWidth = this.image.naturalWidth || this.image.width
    this.imageHeight = this.image.naturalHeight || this.image.height
    this.imageRatio = this.imageWidth / this.imageHeight
    this.width = this.width || this.imageWidth
    this.height = this.height || this.imageHeight
    this.renderSize = (this.width + this.height) / 4
    if (this.srcImage) {
      this.srcImage.style.display = 'none'
    }
    this._initSettings(options)
    this._initContext(options)
    this._initResponsive(options)
    this.start()
  }

  private _initImage(options: RawOptions) {
    this.srcImage = options.image as HTMLImageElement
    if (!this.srcImage && typeof options.imageId === 'string') {
      this.srcImage = document.getElementById(
        options.imageId,
      ) as HTMLImageElement
    }
    this.imageUrl = (options.imageUrl as string) || this.srcImage.src
    this.image = document.createElement('img')
    this.wrapperElement = (options.wrapperElement ||
      this.srcImage.parentElement) as HTMLElement
    this.image.onload = () => this.emit('imageLoaded', options)
    this.image.crossOrigin = 'Anonymous'
    if (options.addTimestamp) {
      this.imageUrl += /\?/.test(this.imageUrl)
        ? '&d=' + Date.now()
        : '?d=' + Date.now()
    }
    this.image.src = this.imageUrl
  }

  private _initContext(options: RawOptions) {
    this.canvas = options.canvas as HTMLCanvasElement | undefined
    if (!this.canvas && !this.context && this.wrapperElement) {
      this.canvas = document.createElement('canvas')
      this.wrapperElement.appendChild(this.canvas)
    }
    this.context = options.context as typeof this.context
    this.renderer =
      (options.renderer as 'default' | 'webgl' | undefined) || 'default'
  }

  private _defaultInitContext() {
    this.context =
      this.context || (this.canvas as HTMLCanvasElement).getContext('2d')!
  }

  private _webglInitContext() {
    const canvas = this.canvas as HTMLCanvasElement
    const gl = (this.context ||
      canvas.getContext('webgl2') ||
      canvas.getContext('experimental-webgl')) as WebGL2RenderingContext
    this.context = gl
    this.fragmentShaderScript = `#version 300 es

            precision highp float;

            in vec4 vColor;
            out vec4 fragColor;

            void main(void) {
              fragColor = vColor;
            }
          `

    this.vertexShaderScript = `#version 300 es

            precision highp float;

            in vec3 vertexPosition;
            in vec4 vertexColor;
            uniform vec3 vertexOffset;
            uniform float pointSize;
            uniform float depth;
            vec3 mirror = vec3(1, -1, 1);

            uniform mat4 modelViewMatrix;
            uniform mat4 perspectiveMatrix;
            uniform mat4 rotationMatrix;

            out vec4 vColor;

            void main(void) {
              gl_Position = rotationMatrix * perspectiveMatrix * modelViewMatrix * vec4(mirror * vertexPosition + vertexOffset, 1.0);
              gl_PointSize = pointSize + max((log(vertexPosition.z) - 3.91) * depth, -pointSize + 1.0);
              vColor = vertexColor;
            }
          `
    gl.viewport(0, 0, this.width, this.height)
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vertexShader, this.vertexShaderScript)
    gl.compileShader(vertexShader)
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fragmentShader, this.fragmentShaderScript)
    gl.compileShader(fragmentShader)
    this.program = gl.createProgram()!
    gl.attachShader(this.program, vertexShader)
    gl.attachShader(this.program, fragmentShader)
    gl.linkProgram(this.program)
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL API call, not a React hook
    gl.useProgram(this.program)
    this.vertexPosition = gl.getAttribLocation(this.program, 'vertexPosition')
    gl.enableVertexAttribArray(this.vertexPosition)
    this.vertexColor = gl.getAttribLocation(this.program, 'vertexColor')
    gl.enableVertexAttribArray(this.vertexColor)
    gl.clearColor(0.0, 0.0, 0.0, 0.0)
    gl.enable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    this.vertexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    this.vertexOffset = gl.getUniformLocation(this.program, 'vertexOffset')
    gl.uniform3f(this.vertexOffset, 0, 0, 1000)
    gl.vertexAttribPointer(this.vertexPosition, 3.0, gl.FLOAT, false, 28, 0)
    gl.vertexAttribPointer(this.vertexColor, 4.0, gl.FLOAT, false, 28, 12)
    this.uModelViewMatrix = gl.getUniformLocation(
      this.program,
      'modelViewMatrix',
    )
    this.uPerspectiveMatrix = gl.getUniformLocation(
      this.program,
      'perspectiveMatrix',
    )
    this.uRotationMatrix = gl.getUniformLocation(this.program, 'rotationMatrix')
    this.uPointSize = gl.getUniformLocation(this.program, 'pointSize')
    this.uDepth = gl.getUniformLocation(this.program, 'depth')

    this._webglSetAttributes()
  }

  private _webglSetAttributes() {
    if (this.renderer !== 'webgl' || !this.canvas) return
    const gl = this.context as WebGL2RenderingContext
    const fieldOfView = 1
    const aspectRatio = this.canvas.width / this.canvas.height
    const nearPlane = 10
    const farPlane = 100
    const top = nearPlane * Math.tan((fieldOfView * Math.PI) / 360.0)
    const bottom = -top
    const right = top * aspectRatio
    const left = -right
    const a = (right + left) / (right - left)
    const b = (top + bottom) / (top - bottom)
    const c = (farPlane + nearPlane) / (farPlane - nearPlane)
    const d = (2 * farPlane * nearPlane) / (farPlane - nearPlane)
    const x = (2 * nearPlane) / (right - left)
    const y = (2 * nearPlane) / (top - bottom)

    const perspectiveMatrix = [x, 0, a, 0, 0, y, b, 0, 0, 0, c, d, 0, 0, -1, 0]
    const modelViewMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    gl.viewport(0, 0, this.width, this.height)
    gl.uniformMatrix4fv(
      this.uModelViewMatrix,
      false,
      new Float32Array(modelViewMatrix),
    )
    gl.uniformMatrix4fv(
      this.uPerspectiveMatrix,
      false,
      new Float32Array(perspectiveMatrix),
    )
    gl.uniform1f(this.uPointSize, this.particleSize)
    gl.uniform1f(this.uDepth, this.depth)
    this._updateRotation()
  }

  private _updateRotation() {
    const gl = this.context as WebGL2RenderingContext
    const a = Math.cos(rotationX)
    const b = Math.sin(rotationX)
    const c = Math.cos(rotationY)
    const d = Math.sin(rotationY)
    const rotationMatrix = [c, 0, d, 0, 0, a, -b, 0, -c, b, a, 0, 0, 0, 0, 1]
    gl.uniformMatrix4fv(
      this.uRotationMatrix,
      false,
      new Float32Array(rotationMatrix),
    )
  }

  private _webglRenderer() {
    const gl = this.context as WebGL2RenderingContext
    const vertices = new Float32Array(this.vertices as number[])
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.drawArrays(gl.POINTS, 0, this.particles.length)
    gl.flush()
  }

  private _initSettings(options: RawOptions) {
    this.width = Number(options.width) || this.width
    this.height = Number(options.height) || this.height
    this.maxWidth = resolveDimension(options.maxWidth, this.width)
    this.maxHeight = resolveDimension(options.maxHeight, this.height)
    this.minWidth = resolveDimension(options.minWidth, this.width)
    this.minHeight = resolveDimension(options.minHeight, this.height)
    this.alphaFade = 0.4
    this.gravity = Number(options.gravity) || 0.08
    this.particleGap = Number(options.particleGap) || 3
    this.particleSize = Number(options.particleSize) || 1
    this.layerCount = Number(options.layerCount) || 1
    this.depth = Number(options.depth) || 1
    this.rotationDuration = Number(options.rotationDuration) || 0
    this.growDuration = Number(options.growDuration) || 200
    this.waitDuration = Number(options.waitDuration) || 200
    this.shrinkDuration = Number(options.shrinkDuration) || 200
    this.shrinkDistance = Number(options.shrinkDistance) || 50
    this.threeDimensional =
      options.threeDimensional !== undefined &&
      options.threeDimensional !== 'false'
        ? !!options.threeDimensional
        : false
    this.lifeCycle =
      options.lifeCycle !== undefined && options.lifeCycle !== 'false'
        ? !!options.lifeCycle
        : false
    this.layerDistance = Number(options.layerDistance) || this.particleGap
    this.initPosition = (options.initPosition as string) || 'random'
    this.initDirection = (options.initDirection as string) || 'random'
    this.fadePosition = (options.fadePosition as string) || 'none'
    this.fadeDirection = (options.fadeDirection as string) || 'none'
    this.noise = isNaN(Number(options.noise)) ? 10 : Number(options.noise)
    this.disableInteraction = options.disableInteraction
    this.mouseForce = Number(options.mouseForce) || 30
    this.clickStrength = Number(options.clickStrength) || 0
    this.color = options.color as string | undefined
    this.colorArr = normalizeColorArr(options.colorArr) || this.colorArr
  }

  private _initResponsive(options: RawOptions) {
    this.responsiveWidth = Boolean(
      this.wrapperElement && options.responsiveWidth,
    )
    if (this.responsiveWidth) {
      this.on('stopped', () => {
        this.width = this.wrapperElement.clientWidth
        this.start()
      })
      // Plain elements don't emit 'resize'; observe the box instead.
      this.resizeObserver = new ResizeObserver(() => {
        if (this.width !== this.wrapperElement.clientWidth) {
          this.stop()
        }
      })
      this.resizeObserver.observe(this.wrapperElement)
      this.width = this.wrapperElement.clientWidth
    }
  }

  private _calculate() {
    this.vertices = this.renderer === 'webgl' ? [] : false

    let renderCount = 0
    for (let i = 0; i < this.particles.length; i++) {
      const origin = this.origins[i]
      const particle = this.particles[i]
      let dX = origin.x - particle.x + (Math.random() - 0.5) * this.noise
      let dY = origin.y - particle.y + (Math.random() - 0.5) * this.noise
      let dZ =
        origin.z - particle.z + ((Math.random() - 0.5) * this.noise) / 1000
      let distance = Math.sqrt(dX * dX + dY * dY + dZ * dZ)
      let force = distance * 0.01
      particle.vx += force * (dX / distance) * this.speed
      particle.vy += force * (dY / distance) * this.speed
      particle.vz += force * (dZ / distance) * this.speed
      for (let ti = 0; ti < this.touches.length; ti++) {
        const touch = this.touches[ti]
        dX = particle.x - touch.x
        dY = particle.y - touch.y
        dZ = particle.z - touch.z
        distance = Math.sqrt(dX * dX + dY * dY + dZ * dZ)
        force = (this.mouseForce * touch.force) / distance
        particle.vx += force * (dX / distance) * this.speed
        particle.vy += force * (dY / distance) * this.speed
        particle.vz += force * (dZ / distance) * this.speed
      }
      particle.vx *= this.gravityFactor
      particle.vy *= this.gravityFactor
      particle.vz *= this.gravityFactor
      particle.x += particle.vx
      particle.y += particle.vy
      particle.z += particle.vz
      if (
        0 > particle.x ||
        particle.x >= this.width ||
        0 > particle.y ||
        particle.y >= this.height
      ) {
        particle.isHidden = true
        if (this.state === 'stopping') {
          particle.isDead = true
        }
      } else {
        if (this.state === 'stopping' && !particle.isDead) {
          renderCount++
        }
        particle.isHidden = false
      }
      if (this.vertices) {
        const verts = this.vertices
        let x = particle.x - this.width / 2
        let y = particle.y - this.height / 2
        let z = particle.z
        let a = origin.vertexColors[3]
        if (this.lifeCycle) {
          origin.tick += 1
          if (origin.tick >= 0) {
            if (origin.tick < this.growDuration) {
              a = a * (origin.tick / this.growDuration)
            } else {
              const tick = origin.tick - this.growDuration - this.waitDuration
              if (tick >= 0 && tick <= this.shrinkDuration) {
                distance = Math.sqrt(x * x + y * y + (z - 50) * (z - 50))
                force = tick / this.shrinkDuration
                x += this.shrinkDistance * (x / distance) * force
                y += this.shrinkDistance * (y / distance) * force
                z += this.shrinkDistance * ((z - 50) / distance) * force
                a *= 1 - force
                if (tick === this.shrinkDuration) {
                  origin.tick = 0
                }
              }
            }
          } else {
            a = 0
          }
        }
        verts.push(
          x,
          y,
          z,
          origin.vertexColors[0],
          origin.vertexColors[1],
          origin.vertexColors[2],
          a,
        )
      }
    }
    if (this.state === 'stopping' && renderCount === 0) {
      this.state = 'stopped'
    }
  }

  private _defaultRenderer() {
    const ctx = this.context as CanvasRenderingContext2D
    this.depth = Math.max(
      (this.layerDistance * this.layerCount) / 2,
      this.mouseForce,
    )
    this.minZ = -this.depth
    this.maxZ = this.depth
    const imageData = ctx.createImageData(this.width, this.height)

    for (let i = 0; i < this.origins.length; i++) {
      const origin = this.origins[i]
      const particle = this.particles[i]
      if (!particle.isDead && !particle.isHidden) {
        const x = ~~particle.x
        const y = ~~particle.y
        let a = origin.color[3]
        if (this.alphaFade > 0 && this.layerCount > 1) {
          const z =
            Math.max(Math.min(particle.z, this.maxZ), this.minZ) - this.minZ
          a =
            a * (1 - this.alphaFade) +
            a * this.alphaFade * (z / (this.maxZ - this.minZ))
          a = Math.max(Math.min(~~a, 255), 0)
        }
        const startIndex = (x + y * this.width) * 4
        imageData.data[startIndex + 0] = origin.color[0]
        imageData.data[startIndex + 1] = origin.color[1]
        imageData.data[startIndex + 2] = origin.color[2]
        imageData.data[startIndex + 3] = a
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }

  private _initParticles() {
    this.particles = []
    for (const origin of this.origins) {
      const particle = {} as Particle
      this._initParticlePosition(origin, particle)
      this._initParticleDirection(particle)
      this.particles.push(particle)
    }
  }

  private _initParticlePosition(origin: Origin, particle: Particle) {
    particle.z = 0
    switch (this.initPosition) {
      case 'random': {
        particle.x = Math.random() * this.width
        particle.y = Math.random() * this.height
        break
      }
      case 'top': {
        particle.x = Math.random() * this.width * 3 - this.width
        particle.y = -Math.random() * this.height
        break
      }
      case 'left': {
        particle.x = -Math.random() * this.width
        particle.y = Math.random() * this.height * 3 - this.height
        break
      }
      case 'bottom': {
        particle.x = Math.random() * this.width * 3 - this.width
        particle.y = this.height + Math.random() * this.height
        break
      }
      case 'right': {
        particle.x = this.width + Math.random() * this.width
        particle.y = Math.random() * this.height * 3 - this.height
        break
      }
      case 'misplaced': {
        particle.x =
          origin.x + Math.random() * this.width * 0.3 - this.width * 0.1
        particle.y =
          origin.y + Math.random() * this.height * 0.3 - this.height * 0.1
        break
      }
      default: {
        particle.x = origin.x
        particle.y = origin.y
      }
    }
  }

  private _fade() {
    if (
      this.fadePosition === 'explode' ||
      this.fadePosition === 'top' ||
      this.fadePosition === 'left' ||
      this.fadePosition === 'bottom' ||
      this.fadePosition === 'right'
    ) {
      this.state = 'stopping'
    } else {
      this.state = 'stopped'
    }
    if (this.origins) {
      for (let i = 0; i < this.origins.length; i++) {
        this._fadeOriginPosition(this.origins[i])
        this._fadeOriginDirection(this.particles[i])
      }
    }
  }

  private _fadeOriginPosition(origin: Origin) {
    switch (this.fadePosition) {
      case 'random': {
        origin.x = Math.random() * this.width * 2 - this.width
        origin.y = Math.random() * this.height * 2 - this.height
        if (origin.x > 0) origin.x += this.width
        if (origin.y > 0) origin.y += this.height
        break
      }
      case 'top': {
        origin.x = Math.random() * this.width * 3 - this.width
        origin.y = -Math.random() * this.height
        break
      }
      case 'left': {
        origin.x = -Math.random() * this.width
        origin.y = Math.random() * this.height * 3 - this.height
        break
      }
      case 'bottom': {
        origin.x = Math.random() * this.width * 3 - this.width
        origin.y = this.height + Math.random() * this.height
        break
      }
      case 'right': {
        origin.x = this.width + Math.random() * this.width
        origin.y = Math.random() * this.height * 3 - this.height
        break
      }
      default: {
        // Stay in place
      }
    }
  }

  private _initParticleDirection(particle: Particle) {
    particle.vz = 0
    switch (this.initDirection) {
      case 'random': {
        const angle = Math.random() * Math.PI * 2
        const intensity = Math.random()
        particle.vx = this.width * intensity * Math.sin(angle) * 0.1
        particle.vy = this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      case 'top': {
        const angle = Math.random() * Math.PI - Math.PI / 2
        const intensity = Math.random()
        particle.vx = this.width * intensity * Math.sin(angle) * 0.1
        particle.vy = this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      case 'left': {
        const angle = Math.random() * Math.PI + Math.PI
        const intensity = Math.random()
        particle.vx = this.width * intensity * Math.sin(angle) * 0.1
        particle.vy = this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      case 'bottom': {
        const angle = Math.random() * Math.PI + Math.PI / 2
        const intensity = Math.random()
        particle.vx = this.width * intensity * Math.sin(angle) * 0.1
        particle.vy = this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      case 'right': {
        const angle = Math.random() * Math.PI
        const intensity = Math.random()
        particle.vx = this.width * intensity * Math.sin(angle) * 0.1
        particle.vy = this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      default: {
        particle.vx = 0
        particle.vy = 0
      }
    }
  }

  private _fadeOriginDirection(particle: Particle) {
    switch (this.fadeDirection) {
      case 'random': {
        const angle = Math.random() * Math.PI * 2
        const intensity = Math.random()
        particle.vx += this.width * intensity * Math.sin(angle) * 0.1
        particle.vy += this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      case 'top': {
        const angle = Math.random() * Math.PI - Math.PI / 2
        const intensity = Math.random()
        particle.vx += this.width * intensity * Math.sin(angle) * 0.1
        particle.vy += this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      case 'left': {
        const angle = Math.random() * Math.PI + Math.PI
        const intensity = Math.random()
        particle.vx += this.width * intensity * Math.sin(angle) * 0.1
        particle.vy += this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      case 'bottom': {
        const angle = Math.random() * Math.PI + Math.PI / 2
        const intensity = Math.random()
        particle.vx += this.width * intensity * Math.sin(angle) * 0.1
        particle.vy += this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      case 'right': {
        const angle = Math.random() * Math.PI
        const intensity = Math.random()
        particle.vx += this.width * intensity * Math.sin(angle) * 0.1
        particle.vy += this.height * intensity * Math.cos(angle) * 0.1
        break
      }
      default: {
        particle.vx = 0
        particle.vy = 0
      }
    }
  }

  private _initOrigins() {
    const canvas = document.createElement('canvas')
    if (this.responsiveWidth) {
      this.width = this.wrapperElement.clientWidth
    }
    this.ratio =
      Math.min(this.width, this.maxWidth ?? Number.POSITIVE_INFINITY) /
      Math.min(this.height, this.maxHeight ?? Number.POSITIVE_INFINITY)
    if (this.ratio < this.imageRatio) {
      this.renderWidth = ~~Math.min(
        this.width || Number.POSITIVE_INFINITY,
        this.minWidth || this.imageWidth || Number.POSITIVE_INFINITY,
        this.maxWidth || Number.POSITIVE_INFINITY,
      )
      this.renderHeight = ~~(this.renderWidth / this.imageRatio)
    } else {
      this.renderHeight = ~~Math.min(
        this.height || Number.POSITIVE_INFINITY,
        this.minHeight || this.imageHeight || Number.POSITIVE_INFINITY,
        this.maxHeight || Number.POSITIVE_INFINITY,
      )
      this.renderWidth = ~~(this.renderHeight * this.imageRatio)
    }
    this.offsetX = ~~((this.width - this.renderWidth) / 2)
    this.offsetY = ~~((this.height - this.renderHeight) / 2)
    canvas.width = this.renderWidth
    canvas.height = this.renderHeight
    const context = canvas.getContext('2d')!
    context.drawImage(this.image, 0, 0, this.renderWidth, this.renderHeight)
    const data = context.getImageData(
      0,
      0,
      this.renderWidth,
      this.renderHeight,
    ).data
    this.origins = []
    const duration = this.growDuration + this.waitDuration + this.shrinkDuration
    for (let x = 0; x < this.renderWidth; x += this.particleGap) {
      for (let y = 0; y < this.renderHeight; y += this.particleGap) {
        const index = (x + y * this.renderWidth) * 4
        const a = data[index + 3]
        if (a > 0) {
          const seed = Math.random()
          const tick = -Math.floor(seed * duration)
          if (this.colorArr) {
            const colorArr = this.colorArr
            for (let l = 0; l < this.layerCount; l++) {
              this.origins.push({
                x: this.offsetX + x,
                y: this.offsetY + y,
                z: l * this.layerDistance + 50,
                color: colorArr,
                tick,
                seed,
                vertexColors: colorArr.map((c) => c / 255),
              })
            }
          } else {
            const r = data[index]
            const g = data[index + 1]
            const b = data[index + 2]
            for (let l = 0; l < this.layerCount; l++) {
              this.origins.push({
                x: this.offsetX + x,
                y: this.offsetY + y,
                z: l * this.layerDistance + 50,
                color: [r, g, b, a],
                tick,
                seed,
                vertexColors: [r / 255, g / 255, b / 255, a / 255],
              })
            }
          }
        }
      }
    }
    this.speed = Math.log(this.origins.length) / 10
    this.gravityFactor = 1 - this.gravity * this.speed
  }

  private _parseColor(value: unknown): number[] | undefined {
    if (typeof value !== 'string') {
      return undefined
    }
    const str = value.replace(/\s+/g, '')
    let match: RegExpExecArray | null

    if ((match = /^#([\da-fA-F]{2})([\da-fA-F]{2})([\da-fA-F]{2})/.exec(str))) {
      return [
        parseInt(match[1], 16),
        parseInt(match[2], 16),
        parseInt(match[3], 16),
      ]
    }
    if ((match = /^#([\da-fA-F])([\da-fA-F])([\da-fA-F])/.exec(str))) {
      return [
        parseInt(match[1], 16) * 17,
        parseInt(match[2], 16) * 17,
        parseInt(match[3], 16) * 17,
      ]
    }
    if (
      (match = /^rgba\(([\d]+),([\d]+),([\d]+),([\d]+|[\d]*.[\d]+)\)/.exec(str))
    ) {
      return [+match[1], +match[2], +match[3], +match[4]]
    }
    if ((match = /^rgb\(([\d]+),([\d]+),([\d]+)\)/.exec(str))) {
      return [+match[1], +match[2], +match[3]]
    }
    return undefined
  }
}

interface ParticleImageProps {
  /**
   * URL of the source image to sample into particles.
   */
  imageSrc: string
  /**
   * Extra classes merged onto the (hidden) source `<img>`.
   */
  className?: string
  /**
   * Canvas width in pixels. Defaults to the image's natural width.
   */
  canvasWidth?: string
  /**
   * Canvas height in pixels. Defaults to the image's natural height.
   */
  canvasHeight?: string
  /**
   * Pull-back force toward each particle's origin. Default: `0.08`.
   */
  gravity?: string
  /**
   * Size of each rendered particle. Default: `1`.
   */
  particleSize?: string
  /**
   * Spacing between sampled pixels. Lower = denser. Default: `3`.
   */
  particleGap?: string
  /**
   * Strength of the pointer's repelling force. Default: `30`.
   */
  mouseForce?: string
  /**
   * Render backend. Default: `"default"` (2D canvas).
   */
  renderer?: 'default' | 'webgl'
  /**
   * Solid color override for every particle (hex or rgb/rgba string).
   */
  color?: string
  /**
   * Solid color override as `[r, g, b]` / `[r, g, b, a]`.
   */
  colorArr?: number[]
  /**
   * Where particles spawn from before settling. Default: `"random"`.
   */
  initPosition?:
    | 'random'
    | 'top'
    | 'left'
    | 'bottom'
    | 'right'
    | 'misplaced'
    | 'none'
  /**
   * Initial velocity direction. Default: `"random"`.
   */
  initDirection?: 'random' | 'top' | 'left' | 'bottom' | 'right' | 'none'
  /**
   * Where particles disperse to on stop. Default: `"none"`.
   */
  fadePosition?:
    | 'explode'
    | 'top'
    | 'left'
    | 'bottom'
    | 'right'
    | 'random'
    | 'none'
  /**
   * Velocity direction applied on stop. Default: `"none"`.
   */
  fadeDirection?: 'random' | 'top' | 'left' | 'bottom' | 'right' | 'none'
  /**
   * Random jitter applied to each particle. Default: `10`.
   */
  noise?: number
  /**
   * Re-sample on container resize.
   */
  responsiveWidth?: boolean
}

export function ParticleImage({
  imageSrc,
  className,
  canvasWidth,
  canvasHeight,
  gravity,
  particleSize,
  particleGap,
  mouseForce,
  renderer,
  color,
  colorArr,
  initPosition,
  initDirection,
  fadePosition,
  fadeDirection,
  noise,
  responsiveWidth,
}: ParticleImageProps) {
  const imageParticleRef = React.useRef<HTMLImageElement>(null)

  React.useEffect(() => {
    const element = imageParticleRef.current
    if (!element) return

    // Reconstruct the engine whenever any option changes so the canvas stays
    // in sync with the props. The prior effect only ran on mount.
    const particles = new ParticleEngine({
      image: element,
      imageUrl: imageSrc,
      width: canvasWidth,
      height: canvasHeight,
      gravity,
      particleSize,
      particleGap,
      mouseForce,
      renderer,
      color,
      colorArr,
      initPosition,
      initDirection,
      fadePosition,
      fadeDirection,
      noise,
      responsiveWidth,
    })

    return () => particles.destroy()
  }, [
    imageSrc,
    canvasWidth,
    canvasHeight,
    gravity,
    particleSize,
    particleGap,
    mouseForce,
    renderer,
    color,
    colorArr,
    initPosition,
    initDirection,
    fadePosition,
    fadeDirection,
    noise,
    responsiveWidth,
  ])

  return (
    // biome-ignore lint/performance/noImgElement: the source image is sampled into a canvas, next/image would not work
    <img
      ref={imageParticleRef}
      src={imageSrc}
      alt=""
      className={cn('hidden h-32 w-32', className)}
    />
  )
}

export type { ParticleImageProps }

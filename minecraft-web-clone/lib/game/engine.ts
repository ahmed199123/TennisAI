import * as THREE from 'three'
import { World } from './world'
import { Player, WALK_SPEED } from './player'
import { buildChunkMesh } from './mesher'
import { buildAtlas, type Atlas } from './atlas'
import { raycastVoxel } from './raycast'
import { CHUNK_SIZE, WORLD_HEIGHT } from './worldgen'
import { ID, isSolid, type BlockId } from './blocks'

interface ChunkMeshes {
  opaque?: THREE.Mesh
  transparent?: THREE.Mesh
}

export interface GameCallbacks {
  onFps?: (fps: number) => void
  onPos?: (x: number, y: number, z: number) => void
  onTime?: (t: number) => void
  onLockChange?: (locked: boolean) => void
}

export class Game {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  world: World
  player = new Player()
  atlas: Atlas

  private opaqueMat: THREE.MeshLambertMaterial
  private transparentMat: THREE.MeshLambertMaterial
  private chunkMeshes = new Map<string, ChunkMeshes>()
  private dirty = new Set<string>()
  private buildQueue: string[] = []

  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private ambient: THREE.AmbientLight
  private highlight: THREE.LineSegments

  private keys = new Set<string>()
  private locked = false
  renderDistance = 6
  selectedBlock: BlockId = ID.GRASS

  private clock = new THREE.Clock()
  private worldTime = 6000 // 0..24000 ticks
  private raf = 0
  private fpsAccum = 0
  private fpsFrames = 0

  private container: HTMLElement
  private cb: GameCallbacks

  constructor(container: HTMLElement, cb: GameCallbacks = {}, seed = 1337) {
    this.container = container
    this.cb = cb
    this.world = new World(seed)
    this.atlas = buildAtlas()

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.shadowMap.enabled = false
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    )

    this.scene.fog = new THREE.FogExp2(0x9ec8ff, 0.004)
    this.scene.background = new THREE.Color(0x9ec8ff)

    this.ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(this.ambient)
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6a5a3a, 0.35)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xffffff, 1.0)
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.opaqueMat = new THREE.MeshBasicMaterial({
      map: this.atlas.texture,
      vertexColors: true,
    })
    this.transparentMat = new THREE.MeshBasicMaterial({
      map: this.atlas.texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    })

    // block selection wireframe
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002))
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }),
    )
    this.highlight.visible = false
    this.scene.add(this.highlight)

    this.spawnPlayer()
    this.bindEvents()
  }

  private spawnPlayer() {
    // find ground height at spawn
    let y = WORLD_HEIGHT - 1
    while (y > 0 && !isSolid(this.world.getBlock(8, y, 8))) y--
    this.player.pos.set(8.5, y + 1, 8.5)
  }

  private bindEvents() {
    window.addEventListener('resize', this.onResize)
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown)
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLock)
    document.addEventListener('wheel', this.onWheel, { passive: true })
  }

  requestLock() {
    this.renderer.domElement.requestPointerLock()
  }

  private onPointerLock = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement
    this.cb.onLockChange?.(this.locked)
  }

  private onContextMenu = (e: Event) => {
    e.preventDefault()
  }

  private onResize = () => {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code)
    if (e.code === 'KeyF') this.player.flying = !this.player.flying
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5))
      if (n >= 1 && n <= 9) this.cb && this.setHotbarIndex(n - 1)
    }
  }
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code)

  private hotbarSetter?: (i: number) => void
  setHotbarHandler(fn: (i: number) => void) {
    this.hotbarSetter = fn
  }
  private setHotbarIndex(i: number) {
    this.hotbarSetter?.(i)
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return
    this.wheelDelta += e.deltaY
    if (Math.abs(this.wheelDelta) > 50) {
      const dir = this.wheelDelta > 0 ? 1 : -1
      this.wheelDelta = 0
      this.scrollHotbar?.(dir)
    }
  }
  private wheelDelta = 0
  private scrollHotbar?: (dir: number) => void
  setScrollHandler(fn: (dir: number) => void) {
    this.scrollHotbar = fn
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return
    const sens = 0.0022
    this.player.yaw -= e.movementX * sens
    this.player.pitch -= e.movementY * sens
    const lim = Math.PI / 2 - 0.01
    this.player.pitch = Math.max(-lim, Math.min(lim, this.player.pitch))
  }

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) {
      this.requestLock()
      return
    }
    const hit = this.pick()
    if (!hit) return
    if (e.button === 0) {
      // break
      this.world.setBlock(hit.x, hit.y, hit.z, ID.AIR)
      this.markDirtyAround(hit.x, hit.y, hit.z)
    } else if (e.button === 2) {
      // place at adjacent
      const { nx, ny, nz } = hit
      // don't place inside player
      const px = Math.floor(this.player.pos.x)
      const pz = Math.floor(this.player.pos.z)
      const py = Math.floor(this.player.pos.y)
      const insideX = nx === px
      const insideZ = nz === pz
      const insideY = ny === py || ny === py + 1
      if (insideX && insideZ && insideY) return
      this.world.setBlock(nx, ny, nz, this.selectedBlock)
      this.markDirtyAround(nx, ny, nz)
    }
  }

  private markDirtyAround(x: number, y: number, z: number) {
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const add = (a: number, b: number) => {
      const k = `${a},${b}`
      this.dirty.add(k)
      if (!this.buildQueue.includes(k)) this.buildQueue.unshift(k)
    }
    add(cx, cz)
    if (lx === 0) add(cx - 1, cz)
    if (lx === CHUNK_SIZE - 1) add(cx + 1, cz)
    if (lz === 0) add(cx, cz - 1)
    if (lz === CHUNK_SIZE - 1) add(cx, cz + 1)
  }

  private pick() {
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ'),
    )
    return raycastVoxel(this.world, this.player.eyePosition, dir, 6)
  }

  private chunkKey(cx: number, cz: number) {
    return `${cx},${cz}`
  }

  private updateChunks() {
    const pcx = Math.floor(this.player.pos.x / CHUNK_SIZE)
    const pcz = Math.floor(this.player.pos.z / CHUNK_SIZE)
    const R = this.renderDistance

    const needed = new Set<string>()
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        if (dx * dx + dz * dz > R * R + 1) continue
        const cx = pcx + dx
        const cz = pcz + dz
        const k = this.chunkKey(cx, cz)
        needed.add(k)
        if (!this.chunkMeshes.has(k) && !this.buildQueue.includes(k)) {
          this.buildQueue.push(k)
        }
      }
    }

    // unload far chunks
    for (const [k, m] of this.chunkMeshes) {
      if (!needed.has(k)) {
        if (m.opaque) {
          this.scene.remove(m.opaque)
          m.opaque.geometry.dispose()
        }
        if (m.transparent) {
          this.scene.remove(m.transparent)
          m.transparent.geometry.dispose()
        }
        this.chunkMeshes.delete(k)
      }
    }

    // sort build queue by distance to player
    this.buildQueue.sort((a, b) => {
      const [ax, az] = a.split(',').map(Number)
      const [bx, bz] = b.split(',').map(Number)
      const da = (ax - pcx) ** 2 + (az - pcz) ** 2
      const db = (bx - pcx) ** 2 + (bz - pcz) ** 2
      return da - db
    })

    // build a few per frame
    let budget = 3
    while (budget-- > 0 && this.buildQueue.length) {
      const k = this.buildQueue.shift()!
      const [cx, cz] = k.split(',').map(Number)
      this.buildChunk(cx, cz)
      this.dirty.delete(k)
    }
  }

  private buildChunk(cx: number, cz: number) {
    const k = this.chunkKey(cx, cz)
    const existing = this.chunkMeshes.get(k)
    if (existing) {
      if (existing.opaque) {
        this.scene.remove(existing.opaque)
        existing.opaque.geometry.dispose()
      }
      if (existing.transparent) {
        this.scene.remove(existing.transparent)
        existing.transparent.geometry.dispose()
      }
    }
    const { opaque, transparent } = buildChunkMesh(this.world, cx, cz, this.atlas)
    const meshes: ChunkMeshes = {}
    if (opaque) {
      const m = new THREE.Mesh(opaque, this.opaqueMat)
      this.scene.add(m)
      meshes.opaque = m
    }
    if (transparent) {
      const m = new THREE.Mesh(transparent, this.transparentMat)
      this.scene.add(m)
      meshes.transparent = m
    }
    this.chunkMeshes.set(k, meshes)
  }

  private updateDayNight(dt: number) {
    this.worldTime = (this.worldTime + dt * 20) % 24000
    // tick 0 = sunrise, 6000 = noon (sun at zenith), 12000 = sunset, 18000 = midnight
    const angle = (this.worldTime / 24000) * Math.PI * 2
    const sunY = Math.sin(angle)
    const sunX = Math.cos(angle)
    this.sun.position.set(sunX * 100, sunY * 100, 40)
    this.sun.target.position.set(0, 0, 0)

    // daylight 0..1
    const day = Math.max(0, Math.min(1, sunY * 1.3 + 0.35))
    // MeshBasicMaterial ignores lights, so all shading is baked into vertex
    // colors. We drive day/night by tinting the material color, with a slight
    // warm hue at dusk/dawn and a cool dark tint at night.
    const bright = 0.25 + day * 0.75
    const tint = new THREE.Color(bright, bright * (0.85 + day * 0.15), bright * (0.7 + day * 0.3))
    this.opaqueMat.color.copy(tint)
    this.transparentMat.color.copy(tint)
    this.sun.intensity = 0
    this.ambient.intensity = 0
    this.hemi.intensity = 0

    const dayColor = new THREE.Color(0x9ec8ff)
    const nightColor = new THREE.Color(0x0a0e1a)
    const duskColor = new THREE.Color(0xe8915a)
    let sky: THREE.Color
    if (day > 0.5) sky = nightColor.clone().lerp(dayColor, (day - 0.5) * 2)
    else sky = nightColor.clone().lerp(duskColor, day * 2)
    this.scene.background = sky
    ;(this.scene.fog as THREE.FogExp2).color = sky
    this.cb.onTime?.(this.worldTime)
  }

  private inputState() {
    const k = this.keys
    let forward = 0
    let right = 0
    if (k.has('KeyW')) forward += 1
    if (k.has('KeyS')) forward -= 1
    if (k.has('KeyD')) right += 1
    if (k.has('KeyA')) right -= 1
    return {
      forward,
      right,
      jump: k.has('Space'),
      sneak: k.has('ShiftLeft') || k.has('ShiftRight'),
      sprint: k.has('ControlLeft') || k.has('KeyR'),
      flyUp: k.has('Space'),
    }
  }

  start() {
    this.clock.start()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = this.clock.getDelta()

      if (this.locked) {
        this.player.update(this.world, dt, this.inputState())
      }

      this.updateChunks()
      this.updateDayNight(dt)

      // camera
      const eye = this.player.eyePosition
      this.camera.position.copy(eye)
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ')
      this.sun.position.add(eye).sub(this.sun.target.position)
      this.sun.target.position.copy(eye)

      // highlight selected block
      const hit = this.locked ? this.pick() : null
      if (hit) {
        this.highlight.visible = true
        this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
      } else {
        this.highlight.visible = false
      }

      this.renderer.render(this.scene, this.camera)

      // fps + hud
      this.fpsAccum += dt
      this.fpsFrames++
      if (this.fpsAccum >= 0.5) {
        this.cb.onFps?.(Math.round(this.fpsFrames / this.fpsAccum))
        this.fpsAccum = 0
        this.fpsFrames = 0
        this.cb.onPos?.(this.player.pos.x, this.player.pos.y, this.player.pos.z)
      }
    }
    loop()
  }

  setRenderDistance(r: number) {
    this.renderDistance = r
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLock)
    document.removeEventListener('wheel', this.onWheel)
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown)
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    for (const m of this.chunkMeshes.values()) {
      m.opaque?.geometry.dispose()
      m.transparent?.geometry.dispose()
    }
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}

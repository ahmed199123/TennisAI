'use client'

import { useEffect, useRef, useState } from 'react'
import { Game } from '@/lib/game/engine'
import { BLOCKS, ID, type BlockId } from '@/lib/game/blocks'

const HOTBAR: BlockId[] = [
  ID.GRASS,
  ID.DIRT,
  ID.STONE,
  ID.COBBLE,
  ID.PLANKS,
  ID.WOOD,
  ID.GLASS,
  ID.GLOWSTONE,
  ID.BRICK,
]

function formatTime(ticks: number) {
  // 0 ticks = 6:00, 6000 = noon, 18000 = midnight
  const hours = Math.floor(((ticks / 1000 + 6) % 24))
  const mins = Math.floor(((ticks % 1000) / 1000) * 60)
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

export default function MinecraftGame() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)

  const [started, setStarted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [fps, setFps] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0, z: 0 })
  const [time, setTime] = useState(6000)
  const [hotbarIndex, setHotbarIndex] = useState(0)
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    if (!started || !containerRef.current) return
    const game = new Game(containerRef.current, {
      onFps: setFps,
      onPos: (x, y, z) => setPos({ x, y, z }),
      onTime: setTime,
      onLockChange: setLocked,
    })
    gameRef.current = game
    game.selectedBlock = HOTBAR[0]

    game.setHotbarHandler((i) => {
      setHotbarIndex(i)
      game.selectedBlock = HOTBAR[i]
    })
    game.setScrollHandler((dir) => {
      setHotbarIndex((prev) => {
        const next = (prev + dir + HOTBAR.length) % HOTBAR.length
        game.selectedBlock = HOTBAR[next]
        return next
      })
    })

    game.start()
    game.requestLock()

    const onF3 = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault()
        setShowDebug((s) => !s)
      }
    }
    document.addEventListener('keydown', onF3)

    return () => {
      document.removeEventListener('keydown', onF3)
      game.dispose()
      gameRef.current = null
    }
  }, [started])

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-sky-300 font-mono select-none">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Start menu */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-sky-700 to-emerald-800 px-6 text-center">
          <div className="space-y-3">
            <h1 className="text-balance text-5xl font-bold tracking-tight text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.4)] md:text-7xl">
              VOXELCRAFT
            </h1>
            <p className="text-pretty text-sm text-emerald-100/90 md:text-base">
              An infinite procedurally generated voxel world in your browser
            </p>
          </div>
          <button
            onClick={() => setStarted(true)}
            className="rounded-md border-b-4 border-emerald-900 bg-emerald-500 px-10 py-3 text-lg font-bold text-white shadow-lg transition active:translate-y-1 active:border-b-0 hover:bg-emerald-400"
          >
            Play
          </button>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-1 text-left text-xs text-emerald-100/80 md:text-sm">
            <li>WASD — Move</li>
            <li>Mouse — Look</li>
            <li>Space — Jump</li>
            <li>Left Click — Break</li>
            <li>Right Click — Place</li>
            <li>1-9 / Scroll — Select block</li>
            <li>F — Toggle fly</li>
            <li>Ctrl — Sprint</li>
            <li>F3 — Debug overlay</li>
            <li>Esc — Release mouse</li>
          </ul>
        </div>
      )}

      {/* Click to resume overlay */}
      {started && !locked && (
        <button
          onClick={() => gameRef.current?.requestLock()}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 text-white"
        >
          <div className="rounded-lg bg-black/60 px-8 py-6 text-center">
            <p className="text-2xl font-bold">Paused</p>
            <p className="mt-2 text-sm text-white/70">Click to resume</p>
          </div>
        </button>
      )}

      {/* Crosshair */}
      {started && locked && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="relative h-5 w-5">
            <span className="absolute left-1/2 top-0 h-5 w-0.5 -translate-x-1/2 bg-white/80 mix-blend-difference" />
            <span className="absolute top-1/2 left-0 h-0.5 w-5 -translate-y-1/2 bg-white/80 mix-blend-difference" />
          </div>
        </div>
      )}

      {/* Debug overlay */}
      {started && showDebug && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 p-2 text-xs leading-relaxed text-green-300">
          <div>VOXELCRAFT — debug (F3)</div>
          <div>FPS: {fps}</div>
          <div>
            XYZ: {pos.x.toFixed(1)} / {pos.y.toFixed(1)} / {pos.z.toFixed(1)}
          </div>
          <div>
            Chunk: {Math.floor(pos.x / 16)}, {Math.floor(pos.z / 16)}
          </div>
          <div>Time: {formatTime(time)} ({Math.floor(time)})</div>
        </div>
      )}

      {/* Top-right clock */}
      {started && !showDebug && (
        <div className="pointer-events-none absolute right-3 top-3 z-10 rounded bg-black/40 px-3 py-1 text-sm text-white">
          {fps} FPS · {formatTime(time)}
        </div>
      )}

      {/* Hotbar */}
      {started && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-md bg-black/40 p-1">
          {HOTBAR.map((id, i) => {
            const block = BLOCKS[id]
            return (
              <div
                key={i}
                className={`flex h-12 w-12 flex-col items-center justify-center rounded border-2 ${
                  i === hotbarIndex
                    ? 'border-white bg-white/20'
                    : 'border-white/20 bg-black/20'
                }`}
              >
                <span
                  className="h-7 w-7 rounded-sm border border-black/30"
                  style={{ backgroundColor: block.color }}
                />
                <span className="mt-0.5 text-[9px] text-white/70">{i + 1}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Selected block name */}
      {started && locked && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-10 -translate-x-1/2 text-sm font-semibold text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.6)]">
          {BLOCKS[HOTBAR[hotbarIndex]].name}
        </div>
      )}
    </div>
  )
}

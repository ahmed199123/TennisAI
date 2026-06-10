import * as THREE from 'three'
import { World } from './world'
import { isSolid } from './blocks'
import { WORLD_HEIGHT } from './worldgen'

// Player AABB physics with swept axis-by-axis collision resolution.

const WIDTH = 0.6
const HEIGHT = 1.8
const EYE = 1.62

export const WALK_SPEED = 4.317
export const SPRINT_SPEED = 5.612
export const SNEAK_SPEED = 1.295
const JUMP_VELOCITY = 8.4
const GRAVITY = -28
const FLY_SPEED = 12

export class Player {
  pos = new THREE.Vector3(8, WORLD_HEIGHT, 8) // feet position
  vel = new THREE.Vector3()
  yaw = 0
  pitch = 0
  onGround = false
  flying = false

  private half = WIDTH / 2

  get eyePosition() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z)
  }

  private collides(world: World, x: number, y: number, z: number): boolean {
    const minX = Math.floor(x - this.half)
    const maxX = Math.floor(x + this.half)
    const minY = Math.floor(y)
    const maxY = Math.floor(y + HEIGHT)
    const minZ = Math.floor(z - this.half)
    const maxZ = Math.floor(z + this.half)
    for (let bx = minX; bx <= maxX; bx++)
      for (let by = minY; by <= maxY; by++)
        for (let bz = minZ; bz <= maxZ; bz++)
          if (isSolid(world.getBlock(bx, by, bz))) return true
    return false
  }

  update(
    world: World,
    dt: number,
    input: { forward: number; right: number; jump: boolean; sneak: boolean; sprint: boolean; flyUp: boolean },
  ) {
    dt = Math.min(dt, 0.05)
    const speed = input.sprint ? SPRINT_SPEED : input.sneak ? SNEAK_SPEED : WALK_SPEED

    // desired horizontal direction relative to yaw
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const fx = -sin
    const fz = -cos
    const rx = cos
    const rz = -sin
    let dx = fx * input.forward + rx * input.right
    let dz = fz * input.forward + rz * input.right
    const len = Math.hypot(dx, dz)
    if (len > 0) {
      dx /= len
      dz /= len
    }

    if (this.flying) {
      this.vel.x = dx * FLY_SPEED
      this.vel.z = dz * FLY_SPEED
      this.vel.y = (input.jump ? 1 : 0) * FLY_SPEED - (input.sneak ? FLY_SPEED : 0)
    } else {
      // horizontal accel toward target velocity
      const targetVx = dx * speed
      const targetVz = dz * speed
      const accel = this.onGround ? 0.85 : 0.25
      this.vel.x += (targetVx - this.vel.x) * accel
      this.vel.z += (targetVz - this.vel.z) * accel
      this.vel.y += GRAVITY * dt
      if (input.jump && this.onGround) {
        this.vel.y = JUMP_VELOCITY
        this.onGround = false
      }
    }

    // integrate axis by axis
    const np = this.pos.clone()

    np.x += this.vel.x * dt
    if (this.collides(world, np.x, this.pos.y, this.pos.z)) {
      np.x = this.pos.x
      this.vel.x = 0
    }

    np.z += this.vel.z * dt
    if (this.collides(world, np.x, this.pos.y, np.z)) {
      np.z = this.pos.z
      this.vel.z = 0
    }

    np.y += this.vel.y * dt
    if (this.collides(world, np.x, np.y, np.z)) {
      if (this.vel.y <= 0) this.onGround = true
      np.y = this.pos.y
      this.vel.y = 0
    } else {
      this.onGround = false
    }

    this.pos.copy(np)

    if (this.pos.y < -10) {
      this.pos.set(8, WORLD_HEIGHT, 8)
      this.vel.set(0, 0, 0)
    }
  }
}

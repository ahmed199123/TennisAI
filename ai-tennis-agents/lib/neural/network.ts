/**
 * ============================================================================
 * NEURAL NETWORK ENGINE (from scratch, zero dependencies)
 * ============================================================================
 * A dense feed-forward multi-layer perceptron implemented by hand. It supports
 * arbitrary depth, multiple activation functions, full forward-pass tracing for
 * the debugger, deterministic seeded initialization, cloning, mutation, and
 * crossover so the genetics engine can evolve populations of these networks.
 *
 * No autodiff / backprop is used: these agents learn through neuro-evolution
 * (genetic optimization of weights) plus a runtime opponent-modelling layer.
 * That keeps everything inspectable and lets two arbitrary brains play live.
 * ============================================================================
 */

import type { ActivationName, ForwardTrace, SerializedLayer, SerializedNetwork } from "../types"

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — reproducible brains for debugging.
// ---------------------------------------------------------------------------

export function makeRng(seed: number) {
  let a = seed >>> 0
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Gaussian sample via Box–Muller using a provided uniform rng. */
export function gaussian(rng: () => number, mean = 0, std = 1): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  const mag = Math.sqrt(-2.0 * Math.log(u))
  return mean + std * mag * Math.cos(2.0 * Math.PI * v)
}

// ---------------------------------------------------------------------------
// Activation functions and their string registry.
// ---------------------------------------------------------------------------

export const ACTIVATIONS: Record<ActivationName, (x: number) => number> = {
  relu: (x) => (x > 0 ? x : 0),
  leakyRelu: (x) => (x > 0 ? x : 0.01 * x),
  tanh: (x) => Math.tanh(x),
  sigmoid: (x) => 1 / (1 + Math.exp(-x)),
  linear: (x) => x,
  gelu: (x) => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x))),
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

class Layer {
  inputs: number
  outputs: number
  activation: ActivationName
  /** row-major: weights[o * inputs + i] */
  weights: Float64Array
  biases: Float64Array

  constructor(inputs: number, outputs: number, activation: ActivationName) {
    this.inputs = inputs
    this.outputs = outputs
    this.activation = activation
    this.weights = new Float64Array(inputs * outputs)
    this.biases = new Float64Array(outputs)
  }

  /** He / Xavier style initialization depending on activation. */
  init(rng: () => number) {
    const isRelu = this.activation === "relu" || this.activation === "leakyRelu" || this.activation === "gelu"
    const std = isRelu ? Math.sqrt(2 / this.inputs) : Math.sqrt(1 / this.inputs)
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = gaussian(rng, 0, std)
    }
    for (let o = 0; o < this.outputs; o++) {
      this.biases[o] = 0
    }
  }

  /** Returns { z, a } where z is pre-activation and a is post-activation. */
  forward(input: number[] | Float64Array): { z: number[]; a: number[] } {
    const fn = ACTIVATIONS[this.activation]
    const z = new Array<number>(this.outputs)
    const a = new Array<number>(this.outputs)
    for (let o = 0; o < this.outputs; o++) {
      let sum = this.biases[o]
      const base = o * this.inputs
      for (let i = 0; i < this.inputs; i++) {
        sum += this.weights[base + i] * input[i]
      }
      z[o] = sum
      a[o] = fn(sum)
    }
    return { z, a }
  }

  serialize(): SerializedLayer {
    return {
      inputs: this.inputs,
      outputs: this.outputs,
      activation: this.activation,
      weights: Array.from(this.weights),
      biases: Array.from(this.biases),
    }
  }

  static deserialize(s: SerializedLayer): Layer {
    const layer = new Layer(s.inputs, s.outputs, s.activation)
    layer.weights = Float64Array.from(s.weights)
    layer.biases = Float64Array.from(s.biases)
    return layer
  }
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

export class NeuralNetwork {
  layers: Layer[]
  architecture: number[]
  activations: ActivationName[]

  constructor(architecture: number[], activations: ActivationName[]) {
    this.architecture = architecture
    this.activations = activations
    this.layers = []
    for (let i = 0; i < architecture.length - 1; i++) {
      this.layers.push(new Layer(architecture[i], architecture[i + 1], activations[i]))
    }
  }

  static create(architecture: number[], activations: ActivationName[], seed = Date.now()): NeuralNetwork {
    const net = new NeuralNetwork(architecture, activations)
    const rng = makeRng(seed)
    net.layers.forEach((l) => l.init(rng))
    return net
  }

  /** Standard forward pass returning only the output vector. */
  forward(input: number[]): number[] {
    let signal: number[] = input
    for (const layer of this.layers) {
      signal = layer.forward(signal).a
    }
    return signal
  }

  /** Forward pass that records every intermediate state for the debugger. */
  forwardTrace(input: number[]): { output: number[]; trace: ForwardTrace } {
    const start = performance.now()
    const layerActivations: number[][] = [input.slice()]
    const layerPreActivations: number[][] = []
    let signal: number[] = input
    for (const layer of this.layers) {
      const { z, a } = layer.forward(signal)
      layerPreActivations.push(z)
      layerActivations.push(a)
      signal = a
    }
    const elapsedMs = performance.now() - start
    return {
      output: signal,
      trace: { layerActivations, layerPreActivations, elapsedMs },
    }
  }

  /** Total parameter count (weights + biases). */
  get parameterCount(): number {
    return this.layers.reduce((acc, l) => acc + l.weights.length + l.biases.length, 0)
  }

  /** Flattens all weights + biases into a single gene vector. */
  toGenes(): number[] {
    const genes: number[] = []
    for (const layer of this.layers) {
      for (let i = 0; i < layer.weights.length; i++) genes.push(layer.weights[i])
      for (let i = 0; i < layer.biases.length; i++) genes.push(layer.biases[i])
    }
    return genes
  }

  /** Loads a flat gene vector back into the network in-place. */
  loadGenes(genes: number[]) {
    let idx = 0
    for (const layer of this.layers) {
      for (let i = 0; i < layer.weights.length; i++) layer.weights[i] = genes[idx++]
      for (let i = 0; i < layer.biases.length; i++) layer.biases[i] = genes[idx++]
    }
  }

  clone(): NeuralNetwork {
    const net = new NeuralNetwork(this.architecture.slice(), this.activations.slice())
    net.loadGenes(this.toGenes())
    return net
  }

  serialize(): SerializedNetwork {
    return {
      architecture: this.architecture.slice(),
      activations: this.activations.slice(),
      layers: this.layers.map((l) => l.serialize()),
    }
  }

  static deserialize(s: SerializedNetwork): NeuralNetwork {
    const net = new NeuralNetwork(s.architecture, s.activations)
    net.layers = s.layers.map((l) => Layer.deserialize(l))
    return net
  }
}

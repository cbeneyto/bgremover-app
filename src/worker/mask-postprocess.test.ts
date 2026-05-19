import { describe, expect, it } from "vitest"

import { applyEdgeMode } from "./mask-postprocess"

const arr = (...values: number[]) => new Uint8Array(values)

describe("applyEdgeMode — soft", () => {
  it("returns a copy of the input with identical bytes", () => {
    const input = arr(0, 30, 127, 128, 200, 255)
    const out = applyEdgeMode(input, "soft")
    expect(Array.from(out)).toEqual([0, 30, 127, 128, 200, 255])
  })

  it("does not mutate the input even when caller reuses the buffer", () => {
    const input = arr(10, 20, 30)
    const out = applyEdgeMode(input, "soft")
    out[0] = 99
    expect(input[0]).toBe(10)
  })

  it("returns a different object reference (caller can free the input safely)", () => {
    const input = arr(0, 128, 255)
    const out = applyEdgeMode(input, "soft")
    expect(out).not.toBe(input)
  })
})

describe("applyEdgeMode — crisp", () => {
  it("collapses every byte above 127 to 255 and the rest to 0", () => {
    const input = arr(0, 1, 126, 127, 128, 129, 200, 255)
    const out = applyEdgeMode(input, "crisp")
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 255, 255, 255, 255])
  })

  it("handles all-zero input", () => {
    const out = applyEdgeMode(arr(0, 0, 0), "crisp")
    expect(Array.from(out)).toEqual([0, 0, 0])
  })

  it("handles all-max input", () => {
    const out = applyEdgeMode(arr(255, 255, 255), "crisp")
    expect(Array.from(out)).toEqual([255, 255, 255])
  })

  it("does not mutate the input", () => {
    const input = arr(60, 200)
    applyEdgeMode(input, "crisp")
    expect(Array.from(input)).toEqual([60, 200])
  })
})

describe("applyEdgeMode — balanced", () => {
  // The S-curve at v = 0.5 must be a fixed point — anything else breaks
  // the "midpoint preserved" invariant the renderer's tooltip describes.
  it("keeps the midpoint (127) close to itself", () => {
    const out = applyEdgeMode(arr(127), "balanced")
    // 127/255 ≈ 0.498; 2 * 0.498 * 0.498 ≈ 0.496 → round(126.5) = 127.
    expect(out[0]).toBe(127)
  })

  it("pulls dark mid-greys down (below 64 → below input)", () => {
    // 64/255 ≈ 0.251; 2 * 0.251^2 ≈ 0.126 → ~32. Strictly less than 64.
    const out = applyEdgeMode(arr(64), "balanced")
    expect(out[0]).toBeLessThan(64)
    expect(out[0]).toBeGreaterThan(0)
  })

  it("pulls bright mid-greys up (above 192 → above input)", () => {
    // 192/255 ≈ 0.753; 1 - 2*(0.247)^2 ≈ 0.878 → ~224.
    const out = applyEdgeMode(arr(192), "balanced")
    expect(out[0]).toBeGreaterThan(192)
    expect(out[0]).toBeLessThan(255)
  })

  it("keeps the extremes pinned (0 → 0, 255 → 255)", () => {
    const out = applyEdgeMode(arr(0, 255), "balanced")
    expect(out[0]).toBe(0)
    expect(out[1]).toBe(255)
  })

  it("preserves array length and produces uint8 values", () => {
    const input = arr(0, 32, 64, 96, 127, 128, 160, 192, 224, 255)
    const out = applyEdgeMode(input, "balanced")
    expect(out).toBeInstanceOf(Uint8Array)
    expect(out.length).toBe(input.length)
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })

  it("is monotonic (sorted input stays sorted)", () => {
    const input = arr(0, 32, 64, 96, 128, 160, 192, 224, 255)
    const out = applyEdgeMode(input, "balanced")
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1])
    }
  })
})

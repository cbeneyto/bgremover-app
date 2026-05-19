import { describe, expect, it, vi } from "vitest"

import { createStore } from "./create-store"

describe("createStore", () => {
  it("returns the initial value from get()", () => {
    const s = createStore({ a: 1 })
    expect(s.get()).toEqual({ a: 1 })
  })

  it("set() replaces the value and notifies every subscriber", () => {
    // Critical for the bug we hit: two useSettings() consumers were
    // each holding their own useState, so a write in one didn't
    // reach the other. The store fans writes out to every listener.
    const s = createStore(0)
    const a = vi.fn()
    const b = vi.fn()
    s.subscribe(a)
    s.subscribe(b)
    s.set(7)
    expect(s.get()).toBe(7)
    expect(a).toHaveBeenCalledWith(7)
    expect(b).toHaveBeenCalledWith(7)
  })

  it("update() applies an updater and notifies subscribers", () => {
    const s = createStore({ count: 1 })
    const seen: number[] = []
    s.subscribe((v) => seen.push(v.count))
    s.update((prev) => ({ count: prev.count + 1 }))
    s.update((prev) => ({ count: prev.count + 1 }))
    expect(s.get()).toEqual({ count: 3 })
    expect(seen).toEqual([2, 3])
  })

  it("skips notification when set() is called with the same value (Object.is)", () => {
    const s = createStore(5)
    const fn = vi.fn()
    s.subscribe(fn)
    s.set(5) // same primitive
    expect(fn).not.toHaveBeenCalled()
  })

  it("skips notification when update() returns the same value", () => {
    const obj = { x: 1 }
    const s = createStore(obj)
    const fn = vi.fn()
    s.subscribe(fn)
    s.update((prev) => prev) // returns the same reference
    expect(fn).not.toHaveBeenCalled()
  })

  it("subscribe() returns an unsubscribe function", () => {
    const s = createStore(0)
    const fn = vi.fn()
    const unsub = s.subscribe(fn)
    s.set(1)
    expect(fn).toHaveBeenCalledTimes(1)
    unsub()
    s.set(2)
    expect(fn).toHaveBeenCalledTimes(1) // not called again
  })

  it("calls all subscribers in insertion order", () => {
    const s = createStore(0)
    const order: string[] = []
    s.subscribe(() => order.push("a"))
    s.subscribe(() => order.push("b"))
    s.subscribe(() => order.push("c"))
    s.set(1)
    expect(order).toEqual(["a", "b", "c"])
  })

  it("handles a subscriber that synchronously sets the store again", () => {
    // A listener that re-enters set() could in principle stomp on
    // the listener iteration. Object.is short-circuits identical
    // writes; here we verify the cascaded write doesn't crash.
    const s = createStore(0)
    s.subscribe((v) => {
      if (v === 1) s.set(2)
    })
    s.set(1)
    expect(s.get()).toBe(2)
  })
})

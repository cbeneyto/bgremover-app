import { describe, expect, it } from "vitest"

import { createJsonlBuffer } from "./jsonl"

describe("createJsonlBuffer.feed", () => {
  it("returns a single line for a single newline-terminated chunk", () => {
    const buf = createJsonlBuffer()
    expect(buf.feed('{"type":"ready"}\n')).toEqual(['{"type":"ready"}'])
  })

  it("returns multiple lines for a chunk with several newlines", () => {
    const buf = createJsonlBuffer()
    expect(buf.feed("a\nb\nc\n")).toEqual(["a", "b", "c"])
  })

  it("holds back a partial line until the next newline arrives", () => {
    const buf = createJsonlBuffer()
    expect(buf.feed("partial")).toEqual([])
    expect(buf.feed(" more")).toEqual([])
    expect(buf.feed("\n")).toEqual(["partial more"])
  })

  it("trims surrounding whitespace and \\r so CRLF streams still split cleanly", () => {
    const buf = createJsonlBuffer()
    expect(buf.feed("  hello \r\n  world  \n")).toEqual(["hello", "world"])
  })

  it("skips empty lines (consecutive newlines should not yield blanks)", () => {
    const buf = createJsonlBuffer()
    expect(buf.feed("\n\na\n\nb\n\n")).toEqual(["a", "b"])
  })

  it("survives a chunk boundary inside a JSON object", () => {
    // Mimic what stdout.on('data') hands us when a write straddles
    // the kernel-pipe boundary.
    const buf = createJsonlBuffer()
    expect(buf.feed('{"type":"done","id":"j1",')).toEqual([])
    expect(buf.feed('"outputPath":"/x/y.png","ms":42}\n')).toEqual([
      '{"type":"done","id":"j1","outputPath":"/x/y.png","ms":42}',
    ])
  })

  it("yields lines in order across feeds", () => {
    const buf = createJsonlBuffer()
    const lines = [
      ...buf.feed("one\nt"),
      ...buf.feed("wo\nth"),
      ...buf.feed("ree\n"),
    ]
    expect(lines).toEqual(["one", "two", "three"])
  })
})

describe("createJsonlBuffer.flush", () => {
  it("returns the held-back tail as a final line", () => {
    const buf = createJsonlBuffer()
    buf.feed("partial without newline")
    expect(buf.flush()).toEqual(["partial without newline"])
  })

  it("returns [] when the buffer is empty", () => {
    const buf = createJsonlBuffer()
    expect(buf.flush()).toEqual([])
  })

  it("returns [] when the buffer holds only whitespace", () => {
    const buf = createJsonlBuffer()
    buf.feed("   ")
    expect(buf.flush()).toEqual([])
  })

  it("clears the buffer so subsequent flushes return empty", () => {
    const buf = createJsonlBuffer()
    buf.feed("x")
    buf.flush()
    expect(buf.flush()).toEqual([])
  })
})

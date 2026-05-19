/**
 * Tiny line-framing parser for JSONL streams.
 *
 * The worker writes one JSON object per line on stdout; the main
 * process reads chunks of arbitrary size and has to reassemble them
 * into whole lines. The same buffering need shows up in any test
 * harness that pipes JSONL through.
 *
 * Design notes:
 *  - Stateful by design: hold a single mutable `buffer` per stream
 *    instance and yield as many complete frames as fit in each
 *    `feed()` call.
 *  - Trims surrounding whitespace and skips empty lines so the
 *    caller never has to special-case them.
 *  - Does **not** parse JSON itself — callers usually want to
 *    discriminate on the message type and surface bad lines as
 *    protocol errors, which is easier when they own the parsing.
 */

export interface JsonlBuffer {
  feed(chunk: string): string[]
  /** Returns and clears anything held back after a partial chunk. */
  flush(): string[]
}

export function createJsonlBuffer(): JsonlBuffer {
  let buffer = ""
  return {
    feed(chunk: string): string[] {
      buffer += chunk
      const out: string[] = []
      let nl = buffer.indexOf("\n")
      while (nl >= 0) {
        const raw = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (raw.length > 0) out.push(raw)
        nl = buffer.indexOf("\n")
      }
      return out
    },
    flush(): string[] {
      const tail = buffer.trim()
      buffer = ""
      return tail.length > 0 ? [tail] : []
    },
  }
}

import { describe, expect, it } from "vitest"

import { resolveTheme } from "./theme-resolver"

describe("resolveTheme", () => {
  it("returns 'light' when the user explicitly picked light, no matter the OS", () => {
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("light", false)).toBe("light")
  })

  it("returns 'dark' when the user explicitly picked dark, no matter the OS", () => {
    expect(resolveTheme("dark", true)).toBe("dark")
    expect(resolveTheme("dark", false)).toBe("dark")
  })

  it("follows the OS signal when preference is 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
  })
})

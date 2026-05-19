/**
 * Pure mask post-processing. RMBG-1.4 emits a soft probability map
 * (uint8 0..255 per pixel); each `EdgeMode` here decides how to
 * convert that into the alpha channel of the final PNG.
 *
 * No image library, no sharp — just an in-place transform over a
 * Uint8Array. This is the hot path during compositing (one pass over
 * H × W bytes per image), so we keep it allocation-free where we can.
 */

import type { EdgeMode } from "@shared/protocol"

/**
 * Apply the chosen edge mode to a mask buffer.
 * Returns a **new** array — never mutates the input. The caller can
 * decide whether to drop the original.
 *
 *  - "soft":     identity. Whatever the model produced, byte-for-byte.
 *                Best default for photographic subjects.
 *  - "balanced": smoothstep / S-curve. Pushes mid-greys away from 0.5,
 *                so semi-transparent fringes shrink without losing the
 *                anti-aliased outline entirely.
 *  - "crisp":    binary threshold at 128. Every pixel becomes 0 or 255.
 *                Razor-sharp edges; pairs well with flat backgrounds
 *                (product shots on white).
 *
 * The math is plain `uint8 → float → uint8` with a single multiply
 * per pixel for `balanced` (cheap). `crisp` is a single compare.
 */
export function applyEdgeMode(
  mask: Uint8Array,
  mode: EdgeMode,
): Uint8Array {
  if (mode === "soft") {
    // Caller may rely on getting a copy regardless of mode; cloning
    // keeps the contract uniform and lets the worker free the model
    // tensor right after.
    return new Uint8Array(mask)
  }

  const out = new Uint8Array(mask.length)
  if (mode === "crisp") {
    for (let i = 0; i < mask.length; i++) {
      out[i] = mask[i] > 127 ? 255 : 0
    }
    return out
  }

  // "balanced" — smoothstep S-curve around 0.5.
  //   eased = v < 0.5
  //     ? 2 * v * v
  //     : 1 - 2 * (1 - v) * (1 - v)
  // Visually: 0.25 → 0.125, 0.5 → 0.5, 0.75 → 0.875. Mid-greys are
  // pushed outward, halo around a subject thins, antialiasing kept.
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] / 255
    const eased =
      v < 0.5
        ? 2 * v * v
        : 1 - 2 * (1 - v) * (1 - v)
    out[i] = Math.round(eased * 255)
  }
  return out
}

/**
 * Outcome-focused copy for the settings panel. Each card surfaces
 * a one-line summary + a concrete "use when …" hint so the user
 * picks based on their workflow, not the math.
 */
export interface EdgeModeMeta {
  /** The short label shown in the radio-card title. */
  title: string
  /** Plain-language description of the visual outcome. */
  summary: string
  /** Concrete situations where this mode is the right pick. */
  useWhen: string
  /** True for the mode we treat as the safe default. */
  isDefault?: boolean
}

export const EDGE_MODE_META: Record<EdgeMode, EdgeModeMeta> = {
  soft: {
    title: "Soft",
    summary: "Natural edges. Antialiased fade preserved exactly as the model produces it.",
    useWhen: "Hair, fur, fabric, glass, anything with fine detail.",
    isDefault: true,
  },
  balanced: {
    title: "Balanced",
    summary: "Cleaner edges, less halo around the subject. Antialiasing kept but tightened.",
    useWhen: "Mixed catalogue photos with cluttered backgrounds.",
  },
  crisp: {
    title: "Crisp",
    summary: "Hard cut. Every pixel is fully opaque or fully transparent — no in-between.",
    useWhen: "Products on flat backgrounds, ready to composite on white or another solid.",
  },
}

/**
 * Backwards-compat alias for any code still pulling the old shape.
 * New code should use `EDGE_MODE_META[mode].summary` instead.
 */
export const EDGE_MODE_DESCRIPTIONS: Record<EdgeMode, string> = {
  soft: EDGE_MODE_META.soft.summary,
  balanced: EDGE_MODE_META.balanced.summary,
  crisp: EDGE_MODE_META.crisp.summary,
}

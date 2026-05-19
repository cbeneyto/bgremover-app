import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import "./styles/globals.css"

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("Root element missing")

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * Dismiss the static splash now that React has scheduled its first
 * commit. We wait two animation frames so:
 *   1. Frame 1 — React paints into #root.
 *   2. Frame 2 — DOM has the app content, splash starts fading.
 *
 * The fade-out CSS transition runs 220 ms, then we yank the splash
 * from the DOM so its event handlers / animations don't keep the
 * GPU busy in the background.
 */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById("splash")
    if (!splash) return
    splash.dataset.hide = "1"
    setTimeout(() => splash.remove(), 260)
  })
})

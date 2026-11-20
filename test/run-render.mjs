import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" })
const { window } = dom
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue
  try {
    globalThis[key] = window[key]
  } catch {
    // read-only globals are fine to skip
  }
}
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true })
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 16)
globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle)

const module = await import("./.render/render.mjs")
await module.run()
console.log("headless smoke test passed")

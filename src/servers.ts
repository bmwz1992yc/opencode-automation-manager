import type { ServerOption } from "./types"

/** The fields of a host `ServerRef` this plugin reads. */
export interface ServerRefLike {
  id: string
  name: string
  url: string
  builtin: boolean
  local: boolean
  connected: boolean
  compatible: boolean
  client: ServerOption["client"]
}

/**
 * Reduce a host server ref to the option the manager works with. A host that
 * omits `connected`/`compatible` is treated as usable rather than broken.
 */
export function toServerOption(ref: ServerRefLike): ServerOption {
  return {
    id: ref.id,
    name: ref.name,
    url: ref.url,
    builtin: ref.builtin === true,
    local: ref.local === true,
    connected: ref.connected !== false,
    compatible: ref.compatible !== false,
    client: ref.client ?? null,
  }
}

/**
 * A server the app lists but cannot hand a client for (not authenticated in this
 * window, wrong password). Kept in the picker so the user sees why it is missing
 * instead of wondering where the server went.
 */
export function unconnectedServer(id: string): ServerOption {
  return {
    id,
    name: id,
    url: /^[a-z][a-z0-9+.-]*:\/\//i.test(id) ? id : "",
    builtin: false,
    local: false,
    connected: false,
    compatible: true,
    client: null,
  }
}

/**
 * The server a fresh panel opens on: the app's own, so management always starts
 * locally. Falls back to any local server, then to the first listed one.
 */
export function pickDefaultServer(servers: readonly ServerOption[]): ServerOption | undefined {
  return servers.find((item) => item.builtin) ?? servers.find((item) => item.local) ?? servers[0]
}

/** Whether a server can answer automation calls right now. */
export function isServerReady(server: ServerOption | undefined): boolean {
  return server !== undefined && server.client !== null && server.connected && server.compatible
}

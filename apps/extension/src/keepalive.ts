/** Port name the offscreen document opens to hold the service worker awake. */
export const KEEPALIVE_PORT = "passio-keepalive";

/** Comfortably inside the ~30s idle eviction window, cheap enough to ignore. */
export const KEEPALIVE_INTERVAL_MS = 20_000;

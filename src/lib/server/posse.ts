// W8: o conteúdo real mora em $lib/posse.ts (função pura, sem I/O) —
// portável pro browser (verificarPosseQuadra em $lib/campo-fetchers.ts
// usa a mesma decisão). Shim pra não tocar nos imports server.
export * from '$lib/posse';

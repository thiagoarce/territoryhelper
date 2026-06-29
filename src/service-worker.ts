/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `app-cache-${version}`;
const ASSETS = [...build, ...files];

// Instala: pre-cache do shell (JS/CSS hash + static files)
sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => sw.skipWaiting())
  );
});

// Ativa: limpa caches antigos
sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => sw.clients.claim())
  );
});

// Fetch strategy:
// - GET de build/files: cache-first (são versionados pelo hash)
// - GET de outros (rotas SSR + API): network-first com fallback pro cache
// - POST/PUT/DELETE: nunca cacheia (passa direto)
sw.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Não cacheia chamadas pra Supabase (sempre fresco)
  if (url.hostname.endsWith('supabase.co')) return;
  // Não cacheia tiles do mapa (já são cached pelo browser http cache)
  if (url.hostname.includes('openfreemap.org')) return;

  const isAsset = ASSETS.includes(url.pathname);
  event.respondWith(
    isAsset
      ? cacheFirst(event.request)
      : networkFirst(event.request)
  );
});

async function cacheFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw e;
  }
}

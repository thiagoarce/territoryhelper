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
//   (offline mostra a última página visitada, mesmo que os dados envelheçam)
// - POST/PUT/DELETE: nunca cacheia (passa direto) — a FILA de escrita
//   offline (registrar/marcar carta com sinal ruim) não vive aqui, vive
//   em $lib/offline (IndexedDB) e é acionada pelos próprios call sites
//   (postComFila) + sincronizada no root layout ao reconectar. Manter o
//   SW livre de lógica de negócio evita duplicar a decisão de retry aqui
//   e lá.
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

// iOS/WebKit REJEITA resposta "com redirecionamentos" servida pelo SW em
// NAVEGAÇÃO ("Response served by service worker has redirections") — e o
// app navega por rotas que SEMPRE redirecionam: `/` (start_url do PWA,
// 303 por role) e `/dirigente/*` (301). Isso pega tanto o RELAY ao vivo
// de um fetch que seguiu redirect quanto o REPLAY de uma entrada de cache
// que carregue a flag `redirected`. Defesas (todas as três necessárias):
// 1. Navegação online que redirecionou → devolve um redirect SINTETIZADO
//    pelo próprio SW (isso é permitido) — o browser navega pra URL final,
//    cai de novo aqui e ELA é cacheada sob a chave certa.
// 2. Qualquer resposta servida do cache pra navegação → SEMPRE re-embrulha
//    numa Response nova (redirected garantidamente false, independente do
//    que o Cache API do WebKit preservou da entrada armazenada).
// 3. Antes de cachear, remove a flag (semFlagDeRedirect) — não guarda
//    resposta redirecionada nem pra subresource.
async function respostaLimpa(res: Response): Promise<Response> {
  const body = await res.blob();
  return new Response(body, {
    status: res.status || 200,
    statusText: res.statusText || 'OK',
    headers: new Headers(res.headers)
  });
}

async function semFlagDeRedirect(res: Response): Promise<Response> {
  if (!res.redirected) return res;
  return respostaLimpa(res);
}

async function cacheFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return req.mode === 'navigate' ? respostaLimpa(cached) : cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, await semFlagDeRedirect(res.clone()));
  return res;
}

async function networkFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (req.mode === 'navigate' && res.redirected) {
      // Não cacheia sob a URL original — o browser segue o redirect
      // sintetizado e a URL final é cacheada quando o novo fetch voltar.
      return res.url ? Response.redirect(res.url, 303) : respostaLimpa(res);
    }
    if (res.ok) cache.put(req, await semFlagDeRedirect(res.clone()));
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return req.mode === 'navigate' ? respostaLimpa(cached) : cached;
    if (req.mode === 'navigate') {
      // Abrir o app offline no start_url `/` (que online sempre
      // redireciona e por isso nunca tem entrada própria no cache):
      // manda pra home do campo se ela já foi baixada.
      if (new URL(req.url).pathname === '/') {
        const home = await cache.match('/publicador');
        if (home) return Response.redirect('/publicador', 303);
      }
      // Rota nunca visitada, sem rede: página offline amigável
      // (static/offline.html, pré-cacheada) em vez do erro do Safari.
      const off = await cache.match('/offline.html');
      if (off) return respostaLimpa(off);
    }
    throw e;
  }
}

// PUSH-A: o push chega SEM payload (só um "tickle") — busca a notificação
// mais recente autenticado por cookie de sessão e mostra ela. Evita a
// criptografia aes128gcm que um payload de push exigiria.
sw.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/notificacoes?nao_lidas=1', { credentials: 'include' });
        if (!res.ok) return;
        const { notificacoes } = (await res.json()) as { notificacoes?: { titulo: string; corpo: string | null; url: string | null }[] };
        const maisRecente = notificacoes?.[0];
        if (!maisRecente) return;
        await sw.registration.showNotification(maisRecente.titulo, {
          body: maisRecente.corpo ?? undefined,
          data: { url: maisRecente.url ?? '/' },
          icon: '/icon-192.svg',
          tag: 'territoryhelper-notificacao'
        });
      } catch {
        // Sem sessão (usuário deslogou) ou rede fora — silenciosamente ignora.
      }
    })()
  );
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? '/';
  event.waitUntil(
    (async () => {
      const clientsList = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existente = clientsList.find((c) => 'focus' in c);
      if (existente) {
        await (existente as WindowClient).navigate(url);
        await (existente as WindowClient).focus();
      } else {
        await sw.clients.openWindow(url);
      }
    })()
  );
});

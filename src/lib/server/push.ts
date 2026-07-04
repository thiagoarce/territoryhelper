// PUSH-A — notificações in-app + Web Push. Push é um "tickle" SEM payload:
// o service worker recebe o push vazio e busca o conteúdo em
// GET /api/notificacoes (autenticado por cookie) — evita a criptografia
// aes128gcm do payload (a parte difícil do Web Push). Só resta assinar o
// JWT VAPID (ES256) — feito via WebCrypto porque a lib `web-push` do npm
// não roda em Cloudflare Workers (depende de módulos nativos do Node).
import { supabaseAdmin } from './supabase-admin';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

// dynamic (não static) de propósito: as chaves VAPID são opcionais até o
// usuário configurar (gerar_vapid.mjs + wrangler secret put). `$env/static/*`
// EXIGE a var em tempo de build — faltando, quebra o deploy inteiro (isso
// já aconteceu). Com dynamic, só o Web Push fica desativado (sino in-app
// continua funcionando normal) até as chaves existirem.
const VAPID_SUBJECT = 'mailto:admin@territoryhelper.app';
const PODA_APOS_FALHAS = 5;

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeStr(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

// Chave pública VAPID é o ponto não-comprimido (0x04 || x || y, 65 bytes)
// — mesmo formato que `pushManager.subscribe({applicationServerKey})` usa
// no client. x/y saem de lá pra montar o JWK da privada (WebCrypto exige
// x/y mesmo pra importar só a chave privada).
let chavePrivadaCache: CryptoKey | null = null;
async function importarChavePrivadaVapid(): Promise<CryptoKey> {
  if (chavePrivadaCache) return chavePrivadaCache;
  const ponto = base64UrlDecode(publicEnv.PUBLIC_VAPID_PUBLIC_KEY!);
  const x = ponto.slice(1, 33);
  const y = ponto.slice(33, 65);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    d: privateEnv.VAPID_PRIVATE_KEY,
    ext: true
  };
  chavePrivadaCache = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  return chavePrivadaCache;
}

// JWT VAPID (RFC 8292): header+payload em base64url, assinado ES256. A
// assinatura ECDSA do WebCrypto já sai em r||s "raw" (formato que o JWS
// ES256 espera) — ao contrário do Node, que por padrão assina em DER.
async function assinarJwtVapid(aud: string): Promise<string> {
  const chave = await importarChavePrivadaVapid();
  const header = { typ: 'JWT', alg: 'ES256' };
  const agora = Math.floor(Date.now() / 1000);
  const payload = { aud, exp: agora + 12 * 3600, sub: VAPID_SUBJECT };
  const semAssinatura = `${base64UrlEncodeStr(JSON.stringify(header))}.${base64UrlEncodeStr(JSON.stringify(payload))}`;
  const assinatura = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    chave,
    new TextEncoder().encode(semAssinatura)
  );
  return `${semAssinatura}.${base64UrlEncode(new Uint8Array(assinatura))}`;
}

interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  falhas: number;
}

// Envia o "tickle" (push vazio) pras subscriptions dos publicadores
// alvo. Falha isolada de um endpoint não derruba os outros — poda a
// subscription depois de muitas falhas seguidas (endpoint morto/expirado).
export async function enviarTickle(publicadorIds: string[]): Promise<void> {
  if (publicadorIds.length === 0) return;
  // Chaves VAPID ainda não configuradas (gerar_vapid.mjs + variáveis de
  // ambiente) — sino in-app já fica salvo em `notificacoes`, só o Web
  // Push real fica pendente até configurar.
  if (!privateEnv.VAPID_PRIVATE_KEY || !publicEnv.PUBLIC_VAPID_PUBLIC_KEY) {
    console.warn('[enviarTickle] VAPID não configurado neste ambiente — pulando envio real');
    return;
  }
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, falhas')
    .in('publicador_id', publicadorIds);
  if (!subs || subs.length === 0) {
    console.warn('[enviarTickle] nenhuma push_subscription pra', publicadorIds);
    return;
  }

  await Promise.all(
    (subs as PushSubscriptionRow[]).map(async (sub) => {
      try {
        const aud = new URL(sub.endpoint).origin;
        const jwt = await assinarJwtVapid(aud);
        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `vapid t=${jwt}, k=${publicEnv.PUBLIC_VAPID_PUBLIC_KEY}`,
            TTL: '86400',
            'Content-Length': '0'
          }
        });
        if (res.ok) {
          if (sub.falhas > 0) {
            await supabaseAdmin.from('push_subscriptions').update({ falhas: 0 }).eq('id', sub.id);
          }
        } else if (res.status === 404 || res.status === 410) {
          // Endpoint não existe mais (usuário desinstalou/revogou) — remove direto.
          console.warn('[enviarTickle] endpoint morto (', res.status, ') — removendo subscription', sub.id);
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          const corpo = await res.text().catch(() => '');
          console.error('[enviarTickle] push service respondeu', res.status, corpo.slice(0, 300));
          const falhas = sub.falhas + 1;
          if (falhas >= PODA_APOS_FALHAS) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
          } else {
            await supabaseAdmin.from('push_subscriptions').update({ falhas }).eq('id', sub.id);
          }
        }
      } catch (e) {
        console.error('[enviarTickle] erro de rede/assinatura ao enviar pra', sub.endpoint, e);
        // Conta como falha, mesma poda de acima.
        const falhas = sub.falhas + 1;
        if (falhas >= PODA_APOS_FALHAS) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          await supabaseAdmin.from('push_subscriptions').update({ falhas }).eq('id', sub.id);
        }
      }
    })
  );
}

// Fonte da verdade do sino (in-app) + dispara o tickle de Web Push.
// `supabaseAdmin` bypassa RLS — é o que permite notificar OUTRO
// publicador (a sessão de quem dispara não tem esse direito via RLS).
export async function criarNotificacao(
  publicadorIds: string[],
  opts: { titulo: string; corpo?: string; url?: string }
): Promise<void> {
  const ids = [...new Set(publicadorIds)].filter(Boolean);
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from('notificacoes').insert(
    ids.map((publicador_id) => ({
      publicador_id,
      titulo: opts.titulo,
      corpo: opts.corpo ?? null,
      url: opts.url ?? null
    }))
  );
  if (error) {
    console.error('[criarNotificacao] falhou gravar notificacoes:', error.message);
    return;
  }
  await enviarTickle(ids);
}

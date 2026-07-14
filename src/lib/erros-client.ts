// Telemetria de erros do CLIENT: hoje um erro JS no aparelho do
// publicador some silenciosamente — só aparece se ele reportar de viva
// voz (foi assim que o bug do mapa cinza apareceu nesta sessão). Um
// catch global manda pra `erros_client` (migration 085), visível em
// /admin/dev/erros. Só registra com sessão conhecida (RLS exige
// authenticated) — páginas públicas (/t, /cartas, /convite) não
// reportam, silenciosamente.
import { supabaseBrowser } from '$lib/supabase-browser';

const MAX_POR_SESSAO = 8;
let enviados = 0;
let instalado = false;
const vistos = new Set<string>();

function chave(msg: string, stack?: string | null): string {
  return (msg + '|' + (stack ?? '').slice(0, 200)).slice(0, 300);
}

async function reportar(publicadorId: string, mensagem: string, stack: string | null) {
  const k = chave(mensagem, stack);
  if (vistos.has(k) || enviados >= MAX_POR_SESSAO) return;
  vistos.add(k);
  enviados++;
  try {
    await supabaseBrowser()
      .from('erros_client')
      .insert({
        publicador_id: publicadorId,
        mensagem: mensagem.slice(0, 2000),
        stack: stack?.slice(0, 4000) ?? null,
        url: location.href,
        user_agent: navigator.userAgent
      });
  } catch {
    // telemetria não pode virar outra fonte de erro
  }
}

export function instalarCapturaDeErros(publicadorId: string | null | undefined): void {
  if (!publicadorId || instalado || typeof window === 'undefined') return;
  instalado = true;

  window.addEventListener('error', (ev) => {
    reportar(publicadorId, ev.message || 'Erro desconhecido', ev.error?.stack ?? null);
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack ?? null : null;
    reportar(publicadorId, 'Promise rejeitada: ' + msg, stack);
  });
}

// Lembretes automáticos diários (aprimoramento recomendado): designação
// pessoal vencendo em breve + território sem nenhuma conclusão há muito
// tempo. "Cron preguiçoso" — ver comentário da migration 086 sobre por
// que não é um Cloudflare Cron Trigger de verdade. Chamado do
// hooks.server.ts, sempre via waitUntil (nunca atrasa a resposta).
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { criarNotificacao } from '$lib/server/push';
import { hojeIsoBrasil } from '$lib/utils/data';

const JOB_NOME = 'lembretes_diarios';
const DIAS_ANTES_PRAZO = 7;
const DIAS_TERRITORIO_PARADO = 90;
const DIAS_RENOTIFICAR_TERRITORIO = 30;

// Só dispara a lógica (via rodarLembretesDiarios) se o job ainda não
// rodou HOJE — upsert com `insert...on conflict do nothing` seguido de
// checar se a linha que sobrou é a de hoje evita corrida entre 2
// requests simultâneos ambos tentando disparar.
export async function talvezRodarLembretesDiarios(): Promise<void> {
  try {
    const hoje = hojeIsoBrasil();
    const { data: existente } = await supabaseAdmin
      .from('job_execucoes')
      .select('executado_em')
      .eq('nome', JOB_NOME)
      .maybeSingle();
    if (existente?.executado_em === hoje) return; // já rodou hoje

    // Corrida entre 2 requests simultâneos: ambos podem passar da checagem
    // acima antes de qualquer um upsertar — pior caso é rodar 2x no mesmo
    // dia (jaLembrado/marcarLembrado ainda dedup por lembrete individual,
    // então o efeito prático é só um pouco de trabalho repetido, nunca
    // notificação duplicada de verdade). Não vale complexidade de lock
    // pra um job best-effort como este.
    const { error: errUpsert } = await supabaseAdmin
      .from('job_execucoes')
      .upsert({ nome: JOB_NOME, executado_em: hoje });
    if (errUpsert) return;

    await rodarLembretesDiarios(hoje);
  } catch (e) {
    console.error('[lembretes] falhou:', e);
  }
}

async function rodarLembretesDiarios(hoje: string): Promise<void> {
  await Promise.all([lembrarDesignacoesVencendo(hoje), lembrarTerritoriosParados(hoje)]);
}

async function jaLembrado(tipo: string, chave: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('lembretes_enviados')
    .select('enviado_em')
    .eq('tipo', tipo)
    .eq('chave', chave)
    .maybeSingle();
  if (!data) return false;
  if (tipo === 'territorio_parado') {
    const dias = (Date.now() - Date.parse(data.enviado_em)) / 86400000;
    return dias < DIAS_RENOTIFICAR_TERRITORIO;
  }
  return true; // designacao_prazo: uma vez só, pra sempre
}

async function marcarLembrado(tipo: string, chave: string): Promise<void> {
  await supabaseAdmin.from('lembretes_enviados').upsert({ tipo, chave, enviado_em: new Date().toISOString() });
}

async function lembrarDesignacoesVencendo(hoje: string): Promise<void> {
  const limite = new Date(Date.parse(hoje) + DIAS_ANTES_PRAZO * 86400000).toISOString().substring(0, 10);
  const { data: designacoes, error } = await supabaseAdmin
    .from('designacoes')
    .select('id, publicador_id, prazo')
    .eq('status', 'aberta')
    .not('prazo', 'is', null)
    .gte('prazo', hoje)
    .lte('prazo', limite);
  if (error || !designacoes) return;

  for (const d of designacoes) {
    if (!d.publicador_id) continue;
    const chave = String(d.id);
    if (await jaLembrado('designacao_prazo', chave)) continue;
    await criarNotificacao([d.publicador_id], {
      titulo: 'Designação vencendo',
      corpo: `Sua designação de território vence em ${d.prazo}.`,
      url: '/publicador'
    });
    await marcarLembrado('designacao_prazo', chave);
  }
}

async function lembrarTerritoriosParados(hoje: string): Promise<void> {
  const [territoriosRes, quadrasRes, adminsRes] = await Promise.all([
    supabaseAdmin.from('territorios').select('id, nome'),
    supabaseAdmin.from('quadras').select('id, territorio_id, data_conclusao').eq('ativa', true).not('territorio_id', 'is', null),
    supabaseAdmin.from('profiles').select('id').eq('role', 'admin').eq('ativo', true)
  ]);
  const territorios = territoriosRes.data ?? [];
  const quadras = quadrasRes.data ?? [];
  const adminIds = (adminsRes.data ?? []).map((a) => a.id);
  if (territorios.length === 0 || adminIds.length === 0) return;

  const ultimaPorTerritorio = new Map<string, string | null>();
  const temQuadraPorTerritorio = new Set<string>();
  for (const q of quadras as any[]) {
    if (!q.territorio_id) continue;
    temQuadraPorTerritorio.add(q.territorio_id);
    const atual = ultimaPorTerritorio.get(q.territorio_id);
    if (q.data_conclusao && (!atual || q.data_conclusao > atual)) {
      ultimaPorTerritorio.set(q.territorio_id, q.data_conclusao);
    } else if (!ultimaPorTerritorio.has(q.territorio_id)) {
      ultimaPorTerritorio.set(q.territorio_id, null);
    }
  }

  const limiteIso = new Date(Date.parse(hoje) - DIAS_TERRITORIO_PARADO * 86400000).toISOString().substring(0, 10);
  for (const t of territorios as any[]) {
    if (!temQuadraPorTerritorio.has(t.id)) continue; // território sem quadra ativa — nada a cobrar
    const ultima = ultimaPorTerritorio.get(t.id) ?? null;
    const parado = ultima === null ? false : ultima < limiteIso;
    // "Nunca concluído" não entra aqui de propósito — pode ser território
    // novo, sem nenhuma designação ainda; parado = teve trabalho e parou.
    if (!parado) continue;
    if (await jaLembrado('territorio_parado', t.id)) continue;
    await criarNotificacao(adminIds, {
      titulo: 'Território parado',
      corpo: `${t.nome ?? 'Território ' + t.id} não tem conclusão há mais de ${DIAS_TERRITORIO_PARADO} dias.`,
      url: '/admin'
    });
    await marcarLembrado('territorio_parado', t.id);
  }
}

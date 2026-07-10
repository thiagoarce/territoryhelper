// Revisão v2.0: load UNIVERSAL no BROWSER (ssr=false) — mesma receita da
// rodada W. Essa era a última tela com load pesado no Worker: audit_log
// guarda `antes`/`depois` INTEIROS (pra quadras isso inclui a geometria
// `poly`, enorme) — 100 linhas disso + 1000 linhas pra lista de tabelas +
// a serialização do load estouravam o limite de CPU do Workers free
// (o "500" reportado). Autorização: o +layout.server.ts de /admin
// continua exigindo role admin em toda navegação, e a RLS de audit_log
// decide o que a query devolve.
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { comCache } from '$lib/offline/cache-leitura';

export const ssr = false;

export const load: PageLoad = async ({ parent, url }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');
  const tabela = url.searchParams.get('tabela') || '';

  const r = await comCache(`admin:auditoria:${profile.id}:${tabela}`, () => carregar(tabela));
  return { ...r.valor, filtroTabela: tabela, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

async function carregar(tabela: string) {
  const supabase = supabaseBrowser();

  // SEM antes/depois na lista: são jsonb pesados (quadras carregam a
  // geometria `poly` inteira ×2) — 100 deles = megabytes no celular.
  // A tela busca o detalhe por id só quando a linha é expandida.
  let query = supabase
    .from('audit_log')
    .select('id, tabela, registro_id, acao, autor_id, ts')
    .order('ts', { ascending: false })
    .limit(100);
  if (tabela) query = query.eq('tabela', tabela);

  const [logsRes, profilesRes, tabelasRes] = await Promise.all([
    query,
    supabase.from('profiles').select('id, nome'),
    // Lista única de tabelas presentes (só a coluna, pro filtro)
    supabase.from('audit_log').select('tabela').order('tabela').limit(1000)
  ]);

  // Query crua não lança em falha de rede — sem lançar aqui, o comCache
  // gravaria auditoria vazia por cima do snapshot bom (ver W5).
  if (logsRes.error) throw logsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (tabelasRes.error) throw tabelasRes.error;

  const nomePorId = new Map((profilesRes.data ?? []).map((p) => [p.id, p.nome]));
  const logs = (logsRes.data ?? []).map((l: any) => ({
    ...l,
    autor_nome: l.autor_id ? nomePorId.get(l.autor_id) ?? '?' : '(sistema)'
  }));
  const tabelas = [...new Set((tabelasRes.data ?? []).map((t) => t.tabela))].sort();

  return { logs, tabelas };
}

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const tabela = url.searchParams.get('tabela') || '';
  const limit = 100;

  let query = locals.supabase
    .from('audit_log')
    .select('id, tabela, registro_id, acao, antes, depois, autor_id, ts')
    .order('ts', { ascending: false })
    .limit(limit);
  if (tabela) query = query.eq('tabela', tabela);

  const [logsRes, profilesRes] = await Promise.all([
    query,
    locals.supabase.from('profiles').select('id, nome')
  ]);

  if (logsRes.error) throw logsRes.error;
  const nomePorId = new Map((profilesRes.data ?? []).map((p) => [p.id, p.nome]));

  const logs = (logsRes.data ?? []).map((l: any) => ({
    ...l,
    autor_nome: l.autor_id ? nomePorId.get(l.autor_id) ?? '?' : '(sistema)'
  }));

  // Lista única de tabelas presentes
  const { data: tabelasData } = await locals.supabase
    .from('audit_log')
    .select('tabela')
    .order('tabela')
    .limit(1000);
  const tabelas = [...new Set((tabelasData ?? []).map((t) => t.tabela))].sort();

  return { logs, tabelas, filtroTabela: tabela };
};

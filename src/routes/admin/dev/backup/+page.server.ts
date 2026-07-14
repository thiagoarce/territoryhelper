// W6: backup client-orchestrated. O BROWSER faz o trabalho pesado
// (gera snapshot baixando do /export streaming e sobe direto pro
// Storage via policies da migration 076; parseia o JSON do restore) e
// o Worker só recebe LOTES pequenos de linhas pra upsert — o modelo
// antigo (arquivo inteiro numa action: JSON.parse de MBs + dezenas de
// upserts na MESMA invocação) estourava o limite de CPU do Workers
// free (~10ms POR INVOCAÇÃO, cumulativo) e nunca completava.
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { exigirAdminAction } from '$lib/server/guards';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { TABELAS_BACKUP, RESTORE_PULA, VERSAO_BACKUP } from './_tabelas';

export const load: PageServerLoad = async ({ locals }) => {
  return {
    minhaRole: locals.profile?.role,
    tabelas: TABELAS_BACKUP.map((t) => t.nome),
    puladasNoRestore: [...RESTORE_PULA],
    versaoBackup: VERSAO_BACKUP
  };
};

const nomesValidos = new Map(TABELAS_BACKUP.map((t) => [t.nome, t]));

export const actions: Actions = {
  // Upsert de UM lote (~400 linhas) de UMA tabela — o browser fatia o
  // backup e chama isto N vezes em ordem de FK (TABELAS_BACKUP).
  restaurarLote: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;

    const fd = await request.formData();
    const tabela = String(fd.get('tabela') ?? '').trim();
    const t = nomesValidos.get(tabela);
    if (!t) return fail(400, { erro: `Tabela desconhecida: ${tabela}` });
    if (RESTORE_PULA.has(tabela)) return fail(400, { erro: `${tabela} é pulada no restore (depende do Auth)` });

    let linhas: Record<string, unknown>[];
    try {
      linhas = JSON.parse(String(fd.get('linhas_json') ?? '[]'));
    } catch {
      return fail(400, { erro: 'Lote inválido (JSON malformado)' });
    }
    if (!Array.isArray(linhas)) return fail(400, { erro: 'Lote inválido' });
    if (linhas.length === 0) return { ok: true, upsertadas: 0 };
    if (linhas.length > 500) return fail(400, { erro: 'Lote grande demais (máx 500 linhas)' });

    const { error } = await supabaseAdmin.from(tabela).upsert(linhas, { onConflict: t.pk });
    if (error) return fail(400, { erro: `${tabela}: ${error.message}` });
    return { ok: true, upsertadas: linhas.length };
  },

  // Depois do último lote: realinha as sequences dos ids seriais (upsert
  // com id explícito não avança a sequence — sem isso o próximo INSERT
  // normal colide).
  realinharSequences: async ({ locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;

    const setvals = TABELAS_BACKUP.filter((t) => t.serial)
      .map((t) => `select setval(pg_get_serial_sequence('${t.nome}','id'), coalesce((select max(id) from ${t.nome}), 1));`)
      .join('\n');
    const { error } = await supabaseAdmin.rpc('exec_sql' as any, { query: setvals });
    if (error) return fail(400, { erro: 'Falhou realinhar sequences: ' + error.message });
    return { ok: true };
  },

  // Higiene de dados: notificacoes é append-only e o Postgres free tem
  // 500MB — sem limpeza, cresce pra sempre. Só apaga LIDA e antiga (nunca
  // mexe em não-lida, mesmo velha, pra não sumir um aviso que o
  // publicador ainda não viu). supabaseAdmin porque não há policy de
  // DELETE cross-user em notificacoes (RLS só cobre o dono).
  limparNotificacoesAntigas: async ({ locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;

    const limite = new Date(Date.now() - 90 * 86400000).toISOString();
    const { error, count } = await supabaseAdmin
      .from('notificacoes')
      .delete({ count: 'exact' })
      .not('lida_em', 'is', null)
      .lt('lida_em', limite);
    if (error) return fail(400, { erro: 'Falhou limpar notificações: ' + error.message });
    return { ok: true, removidas: count ?? 0 };
  }
};

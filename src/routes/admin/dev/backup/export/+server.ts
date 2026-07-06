import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { selectAll } from '$lib/server/queries';
import { TABELAS_BACKUP, VERSAO_BACKUP } from '../_tabelas';

// T34/A25: exporta TODAS as tabelas de dados num JSON de backup.
// Download direto (content-disposition) — admin only.
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user || locals.profile?.role !== 'admin') throw error(403, 'Só admin');

  const tabelas: Record<string, unknown[]> = {};
  for (const t of TABELAS_BACKUP) {
    const primeiraPk = t.pk.split(',')[0];
    // supabaseAdmin: várias tabelas são RLS-fechadas pra leitura geral
    const linhas = await selectAll<Record<string, unknown>>(
      supabaseAdmin.from(t.nome).select('*').order(primeiraPk)
    );
    tabelas[t.nome] = linhas;
  }

  const payload = {
    versao: VERSAO_BACKUP,
    gerado_em: new Date().toISOString(),
    app: 'territoryhelper',
    tabelas
  };

  const nome = `territoryhelper-backup-${new Date().toISOString().substring(0, 10)}.json`;
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store'
    }
  });
};

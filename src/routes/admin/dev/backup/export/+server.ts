import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { selectAll } from '$lib/server/queries';
import { TABELAS_BACKUP, VERSAO_BACKUP } from '../_tabelas';

// T34/A25: exporta TODAS as tabelas de dados num JSON de backup.
// Download direto (content-disposition) — admin only.
//
// U5: antes disso, o handler acumulava as 39 tabelas inteiras num objeto
// em memória e só no final fazia UM JSON.stringify gigante — pra uma
// base de tamanho real isso é um bloco síncrono enorme, candidato forte
// a estourar o limite de CPU/tempo do Cloudflare Worker no meio do
// caminho (sintoma reportado: download de 1kb com erro 500 — a
// resposta cortada no meio pela plataforma).
//
// Reescrito como streaming: cada tabela é buscada (await, I/O de rede)
// e serializada (JSON.stringify SÓ dela) separadamente, uma de cada
// vez, com um `await` entre elas. O modelo de CPU do Workers é por
// RAJADA síncrona entre awaits, não cumulativo pro request inteiro —
// quebrar em N rajadas pequenas (uma por tabela) em vez de 1 rajada
// gigante reduz bastante o risco de estourar o limite por rajada.
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user || locals.profile?.role !== 'admin') throw error(403, 'Só admin');

  const encoder = new TextEncoder();
  let idx = 0;

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (idx === 0) {
          const cabecalho = {
            versao: VERSAO_BACKUP,
            gerado_em: new Date().toISOString(),
            app: 'territoryhelper'
          };
          // Abre o objeto e escreve os campos fixos + o início de "tabelas".
          controller.enqueue(encoder.encode(
            JSON.stringify(cabecalho).slice(0, -1) + ',"tabelas":{'
          ));
        }

        if (idx < TABELAS_BACKUP.length) {
          const t = TABELAS_BACKUP[idx];
          const primeiraPk = t.pk.split(',')[0];
          // supabaseAdmin: várias tabelas são RLS-fechadas pra leitura geral
          const linhas = await selectAll<Record<string, unknown>>(
            supabaseAdmin.from(t.nome).select('*').order(primeiraPk)
          );
          const prefixo = idx > 0 ? ',' : '';
          controller.enqueue(encoder.encode(`${prefixo}${JSON.stringify(t.nome)}:${JSON.stringify(linhas)}`));
          idx++;
          return;
        }

        // Fecha "tabelas" e o objeto externo.
        controller.enqueue(encoder.encode('}}'));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    }
  });

  const nome = `territoryhelper-backup-${new Date().toISOString().substring(0, 10)}.json`;
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store'
    }
  });
};

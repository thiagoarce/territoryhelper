import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase-admin';

export const load: PageServerLoad = async ({ locals }) => {
  // Guard extra (layout admin já protege, mas defesa em profundidade)
  if (locals.profile?.role !== 'admin') {
    return { erro: 'Apenas admin' };
  }
  return {};
};

interface ResultadoArquivo {
  nome: string;
  tamanhoKB: number;
  status: 'ok' | 'erro';
  msg: string;
  duracaoMs: number;
}

export const actions: Actions = {
  // Recebe N arquivos .sql, executa via rpc('exec_sql') na ORDEM dos nomes
  // (ordena alfabeticamente — daí prefixar com 01_, 02_, etc).
  default: async ({ request, locals }) => {
    if (locals.profile?.role !== 'admin') {
      return fail(403, { erro: 'Apenas admin' });
    }
    const fd = await request.formData();
    const arquivos = fd.getAll('arquivos') as File[];
    if (!arquivos.length || arquivos.every((a) => a.size === 0)) {
      return fail(400, { erro: 'Selecione ao menos 1 arquivo .sql' });
    }

    // Ordena alfabeticamente pra rodar 01 antes de 02 etc
    arquivos.sort((a, b) => a.name.localeCompare(b.name));

    const resultados: ResultadoArquivo[] = [];
    for (const arquivo of arquivos) {
      if (arquivo.size === 0) continue;
      const inicio = Date.now();
      try {
        const conteudo = await arquivo.text();
        const { error } = await supabaseAdmin.rpc('exec_sql' as any, { query: conteudo });
        if (error) {
          resultados.push({
            nome: arquivo.name,
            tamanhoKB: Math.round(arquivo.size / 1024),
            status: 'erro',
            msg: error.message,
            duracaoMs: Date.now() - inicio
          });
        } else {
          resultados.push({
            nome: arquivo.name,
            tamanhoKB: Math.round(arquivo.size / 1024),
            status: 'ok',
            msg: 'Executado',
            duracaoMs: Date.now() - inicio
          });
        }
      } catch (e: any) {
        resultados.push({
          nome: arquivo.name,
          tamanhoKB: Math.round(arquivo.size / 1024),
          status: 'erro',
          msg: e?.message || String(e),
          duracaoMs: Date.now() - inicio
        });
      }
    }

    const okCount = resultados.filter((r) => r.status === 'ok').length;
    return {
      ok: true,
      msg: `${okCount} de ${resultados.length} executados`,
      resultados
    };
  }
};

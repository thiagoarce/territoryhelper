// Escala de saídas de campo (imprimível). Load universal no browser —
// mesma regra da casa dos outros relatórios: agregação não roda no
// Worker. Puxa arranjos + modalidades + nomes e deixa a expansão de
// ocorrências pro componente (é barata e depende do período escolhido
// na tela, que muda sem recarregar o load).
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { selectAll } from '$lib/queries';
import { comCache } from '$lib/offline/cache-leitura';
import type { ArranjoBase } from '$lib/arranjos';

export const ssr = false;

export interface ArranjoEscala extends ArranjoBase {
  modalidade_id: number;
}

export interface DadosEscala {
  arranjos: ArranjoEscala[];
  modalidades: { id: number; nome: string; cor: string | null }[];
  nomePorPublicador: Record<string, string>;
}

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');
  if (profile.role !== 'admin') throw redirect(303, '/');

  const r = await comCache(`admin:escala-arranjos:${profile.id}`, carregar);
  return { ...r.valor, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

async function carregar(): Promise<DadosEscala> {
  const supabase = supabaseBrowser();
  const [arranjos, modRes, profRes] = await Promise.all([
    // Inclui INATIVOS de propósito: uma escala de mês passado tem saídas
    // já finalizadas (finalizarArranjo zera `ativo`), e sem elas a folha
    // de um período fechado sairia vazia. O filtro por período é quem
    // decide o que entra. (ocorrenciasEntre pula inativo, então a
    // expansão aqui é feita à parte — ver +page.svelte.)
    selectAll<ArranjoEscala>(
      supabase
        .from('arranjos')
        .select(
          'id, modalidade_id, nome, recorrente, dia_semana, data, hora_inicio, hora_fim, local_endereco, dirigente_id, quadras_ids, cartas_locais_ids, tces_ids, arquivo_url, arquivo_nome, notas, ativo, data_inicio, data_fim, interessados'
        )
        .order('id')
    ),
    supabase.from('arranjo_modalidades').select('id, nome, cor').order('ordem').order('nome'),
    supabase.from('profiles').select('id, nome')
  ]);
  // Query crua do supabase-js NÃO lança em erro de rede — sem este check
  // o comCache gravaria a tela vazia por cima do snapshot bom.
  if (modRes.error) throw modRes.error;
  if (profRes.error) throw profRes.error;

  return {
    arranjos,
    modalidades: (modRes.data ?? []) as DadosEscala['modalidades'],
    nomePorPublicador: Object.fromEntries(
      (profRes.data ?? []).map((p: any) => [p.id as string, (p.nome as string) ?? ''])
    )
  };
}

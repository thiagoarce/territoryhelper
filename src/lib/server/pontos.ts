// Escrita dos pontos de referência. Fica no server (regra da casa:
// action pequena = guard + insert) e SEMPRE com `count: 'exact'` — RLS
// que barra a linha não devolve erro, devolve sucesso com 0 linhas
// (a lição do bug de conclusão do dirigente, ver $lib/server/conclusao.ts).
import { validarPonto, type TipoPonto } from '$lib/pontos-referencia';

interface ClienteMinimo {
  from: (t: string) => any;
}

export async function criarPontoReferencia(
  supabase: ClienteMinimo,
  dados: {
    nome: string;
    tipo?: unknown;
    lat: unknown;
    lng: unknown;
    notas?: string | null;
    quadraId?: string | null;
    territorioId?: string | null;
    osmId?: string | null;
    criadoPor: string | null;
  }
): Promise<{ error: string | null }> {
  const v = validarPonto(dados);
  if (!v.ok) return { error: v.erro };

  const linha = {
    nome: v.nome,
    tipo: v.tipo as TipoPonto,
    geo: { type: 'Point', coordinates: [v.lng, v.lat] },
    notas: dados.notas?.trim() || null,
    quadra_id: dados.quadraId || null,
    territorio_id: dados.territorioId || null,
    osm_id: dados.osmId || null,
    criado_por: dados.criadoPor
  };

  const { error, count } = await supabase
    .from('pontos_referencia')
    .insert(linha, { count: 'exact' });
  if (error) {
    // índice único parcial em osm_id: o mesmo POI do OSM já foi salvo
    if (String(error.code) === '23505') return { error: 'Esse ponto já está salvo com outro nome' };
    return { error: error.message };
  }
  if (count === 0) return { error: 'Sem permissão pra salvar ponto (só dirigente ou admin).' };
  return { error: null };
}

export async function excluirPontoReferencia(
  supabase: ClienteMinimo,
  id: number
): Promise<{ error: string | null }> {
  const { error, count } = await supabase
    .from('pontos_referencia')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return { error: error.message };
  if (count === 0) return { error: 'Sem permissão pra excluir esse ponto (só dirigente ou admin).' };
  return { error: null };
}

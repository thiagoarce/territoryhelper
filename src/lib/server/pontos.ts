// Escrita dos pontos de referência. Fica no server (regra da casa:
// action pequena = guard + insert) e SEMPRE com `count: 'exact'` — RLS
// que barra a linha não devolve erro, devolve sucesso com 0 linhas
// (a lição do bug de conclusão do dirigente, ver $lib/server/conclusao.ts).
import { validarPonto, type TipoPonto } from '$lib/pontos-referencia';

interface ClienteMinimo {
  from: (t: string) => any;
}

export interface DadosPonto {
  nome: string;
  tipo?: unknown;
  lat: unknown;
  lng: unknown;
  notas?: string | null;
  endereco?: string | null;
  mapsUrl?: string | null;
  osmId?: string | null;
  criadoPor: string | null;
  /** ids de território — um ponto de encontro pode servir a VÁRIOS */
  territorios?: string[];
  /** 'sugerido' = veio do dirigente e espera validação do admin */
  status?: 'sugerido' | 'validado';
}

export async function criarPontoReferencia(
  supabase: ClienteMinimo,
  dados: DadosPonto
): Promise<{ error: string | null }> {
  const v = validarPonto(dados);
  if (!v.ok) return { error: v.erro };

  const linha = {
    nome: v.nome,
    tipo: v.tipo as TipoPonto,
    geo: { type: 'Point', coordinates: [v.lng, v.lat] },
    notas: dados.notas?.trim() || null,
    endereco: dados.endereco?.trim() || null,
    maps_url: dados.mapsUrl?.trim() || null,
    osm_id: dados.osmId || null,
    status: dados.status ?? 'validado',
    criado_por: dados.criadoPor
  };

  // Precisa do id de volta pra gravar os vínculos de território
  const { data, error } = await supabase
    .from('pontos_referencia')
    .insert(linha)
    .select('id')
    .maybeSingle();
  if (error) {
    // índice único parcial em osm_id: o mesmo POI do OSM já foi salvo
    if (String(error.code) === '23505') return { error: 'Esse ponto já está salvo com outro nome' };
    return { error: error.message };
  }
  // RLS que barra INSERT devolve 0 linhas sem erro — sem o select o
  // "salvou" seria mentira (mesma armadilha do bug de conclusão).
  if (!data?.id) return { error: 'Sem permissão pra salvar ponto.' };

  return vincularTerritorios(supabase, data.id, dados.territorios ?? []);
}

export async function atualizarPontoReferencia(
  supabase: ClienteMinimo,
  id: number,
  dados: DadosPonto,
  territorios: string[]
): Promise<{ error: string | null }> {
  const v = validarPonto(dados);
  if (!v.ok) return { error: v.erro };
  const { error, count } = await supabase
    .from('pontos_referencia')
    .update(
      {
        nome: v.nome,
        tipo: v.tipo as TipoPonto,
        geo: { type: 'Point', coordinates: [v.lng, v.lat] },
        notas: dados.notas?.trim() || null,
        endereco: dados.endereco?.trim() || null,
        maps_url: dados.mapsUrl?.trim() || null
      },
      { count: 'exact' }
    )
    .eq('id', id);
  if (error) return { error: error.message };
  if (count === 0) return { error: 'Sem permissão pra editar esse ponto (só admin).' };
  return vincularTerritorios(supabase, id, territorios);
}

/** Substitui os vínculos de território do ponto (N:N). */
async function vincularTerritorios(
  supabase: ClienteMinimo,
  pontoId: number,
  territorios: string[]
): Promise<{ error: string | null }> {
  const { error: errDel } = await supabase
    .from('ponto_referencia_territorios')
    .delete()
    .eq('ponto_id', pontoId);
  if (errDel) return { error: errDel.message };
  if (territorios.length === 0) return { error: null };
  const { error } = await supabase
    .from('ponto_referencia_territorios')
    .insert(territorios.map((t) => ({ ponto_id: pontoId, territorio_id: t })));
  return { error: error ? error.message : null };
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

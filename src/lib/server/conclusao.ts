// Registra uma conclusão de quadra no histórico append-only
// (quadras_conclusoes) E sincroniza quadras.data_conclusao.
//
// Bug real que isso corrige: só a ação `marcarConcluidas` de /admin
// (Geral) fazia as DUAS coisas — concluirQuadra (dirigente, em
// /publicador/quadra/[id]) e concluirQuadraGrupo (Casa a casa) só
// atualizavam quadras.data_conclusao, nunca inseriam em
// quadras_conclusoes. Como esse é o caminho de conclusão mais comum
// (dirigente marcando em campo, não o admin mexendo em /admin), o
// histórico que o S-13, o dashboard e a campanha leem inteiramente
// dessa tabela ficava sem boa parte das conclusões reais — e de quebra
// perdia `marcado_em` (timestamptz, existe desde a migration 019),
// que já seria a base pra qualquer análise futura de hora do dia.
//
// data_conclusao da quadra sempre vira a MAIOR data do histórico (nunca
// deixa uma conclusão fora de ordem "voltar" a data pra trás) — mesmo
// invariante que a versão admin já mantinha.
export async function registrarConclusaoQuadra(
  supabase: { from: (t: string) => any },
  quadraId: string,
  dataConclusao: string,
  marcadoPor: string | null
): Promise<{ error: string | null }> {
  const { error: errIns } = await supabase
    .from('quadras_conclusoes')
    .insert({ quadra_id: quadraId, data_conclusao: dataConclusao, marcado_por: marcadoPor });
  if (errIns) return { error: errIns.message };

  const { data: max } = await supabase
    .from('quadras_conclusoes')
    .select('data_conclusao')
    .eq('quadra_id', quadraId)
    .order('data_conclusao', { ascending: false })
    .limit(1);
  const maiorData = max?.[0]?.data_conclusao ?? dataConclusao;

  const { error: errUpd } = await supabase
    .from('quadras')
    .update({ data_conclusao: maiorData })
    .eq('id', quadraId);
  return { error: errUpd ? errUpd.message : null };
}

// Desfaz a ÚLTIMA conclusão do histórico (remove a linha mais recente,
// quadras.data_conclusao volta pra penúltima — ou null se não sobrar
// nenhuma). Mesma lógica que /admin (Geral) já usa no "reverter".
export async function desfazerConclusaoQuadra(
  supabase: { from: (t: string) => any },
  quadraId: string
): Promise<{ error: string | null }> {
  const { data: hist } = await supabase
    .from('quadras_conclusoes')
    .select('id, data_conclusao')
    .eq('quadra_id', quadraId)
    .order('data_conclusao', { ascending: false })
    .order('id', { ascending: false });
  if (hist && hist[0]) {
    await supabase.from('quadras_conclusoes').delete().eq('id', hist[0].id);
  }
  const { error } = await supabase
    .from('quadras')
    .update({ data_conclusao: hist?.[1]?.data_conclusao ?? null })
    .eq('id', quadraId);
  return { error: error ? error.message : null };
}

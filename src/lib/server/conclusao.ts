import { friendlyMessage } from '$lib/erros-usuario';
import { ladosDaQuadra, todosLadosFeitos, dataConclusaoCheiaAutomatica } from '$lib/lados';

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
//
// `marcadoEm` (opcional): timestamp ISO explícito pra guardar em
// quadras_conclusoes.marcado_em. É a hora que o servo INFORMOU que o
// trabalho foi feito (ver $lib/utils/data.ts::horaBrasilParaIso) — não
// "quando foi registrado no sistema". Sem isso, o banco usa `now()`
// (default da coluna), que é só a hora do registro — pior proxy, mas
// não quebra nada pra quem ainda não informa hora (ex: modo histórico
// do admin, que marca datas passadas em lote). `hora_informada` (migration
// 087) marca esse caso como HORA REAL — protege contra o backfill de
// estimativa (por dia da semana) rodar de novo e sobrescrever dado real.
export async function registrarConclusaoQuadra(
  supabase: { from: (t: string) => any; rpc?: (name: string, params: Record<string, unknown>) => PromiseLike<any> },
  quadraId: string,
  dataConclusao: string,
  marcadoPor: string | null,
  marcadoEm?: string | null
): Promise<{ error: string | null }> {
  // Instalações criadas pela baseline usam a RPC transacional, que concentra
  // a mesma autorização consumida pela RLS. O fallback mantém a instância
  // original compatível até ela receber uma atualização própria.
  if (supabase.rpc) {
    const { error: rpcError } = await supabase.rpc('registrar_conclusao_quadra', {
      p_quadra_id: quadraId,
      p_data: dataConclusao,
      p_marcado_em: marcadoEm ?? null
    });
    if (!rpcError) return { error: null };
    const missingFunction = rpcError.code === 'PGRST202' || /could not find.*registrar_conclusao_quadra/i.test(rpcError.message ?? '');
    if (!missingFunction) return { error: friendlyMessage(rpcError) };
  }

  const linha: Record<string, unknown> = { quadra_id: quadraId, data_conclusao: dataConclusao, marcado_por: marcadoPor };
  if (marcadoEm) {
    linha.marcado_em = marcadoEm;
    linha.hora_informada = true;
  }
  const { error: errIns } = await supabase.from('quadras_conclusoes').insert(linha);
  if (errIns) return { error: friendlyMessage(errIns) };

  const { data: max } = await supabase
    .from('quadras_conclusoes')
    .select('data_conclusao')
    .eq('quadra_id', quadraId)
    .order('data_conclusao', { ascending: false })
    .limit(1);
  const maiorData = max?.[0]?.data_conclusao ?? dataConclusao;

  // `count: 'exact'` NÃO é detalhe: UPDATE barrado por RLS não devolve
  // erro — a policy filtra a linha pra fora e o PostgREST responde
  // sucesso com 0 linhas afetadas. Foi exatamente assim que "marcar
  // concluída" do dirigente passou meses dando toast verde sem mudar
  // nada no mapa (só a migration 090 deu UPDATE de quadras pro
  // dirigente). Sem permissão OU quadra inexistente = 0 linhas = erro
  // visível, nunca mais silêncio.
  const { error: errUpd, count } = await supabase
    .from('quadras')
    .update({ data_conclusao: maiorData }, { count: 'exact' })
    .eq('id', quadraId);
  if (errUpd) return { error: friendlyMessage(errUpd) };
  if (count === 0) {
    return { error: 'A conclusão foi registrada no histórico, mas a quadra não pôde ser atualizada (permissão ou quadra inexistente).' };
  }
  return { error: null };
}

// ─── Conclusão por LADO (migration 092) ──────────────────────────────
//
// Marcar um lado é PROGRESSO do ciclo atual — não escreve em
// quadras.data_conclusao e não fecha ciclo nenhum, então nenhum dos
// consumidores binários (S-13, dashboard, campanha, cor do mapa, cartão
// S-12, cobertura, lembretes) enxerga diferença. A quadra só fecha
// quando o ÚLTIMO lado é marcado, e aí pelo caminho canônico de sempre
// (registrarConclusaoQuadra).
export async function registrarConclusaoLado(
  supabase: { from: (t: string) => any },
  quadraId: string,
  lado: { chave: string; rotulo: string },
  dataConclusao: string,
  marcadoPor: string | null,
  marcadoEm?: string | null
): Promise<{ error: string | null; quadraConcluida: boolean }> {
  const linha: Record<string, unknown> = {
    quadra_id: quadraId,
    lado_chave: lado.chave,
    lado_rotulo: lado.rotulo,
    data_conclusao: dataConclusao,
    marcado_por: marcadoPor
  };
  if (marcadoEm) {
    linha.marcado_em = marcadoEm;
    linha.hora_informada = true;
  }
  // upsert + ignoreDuplicates: a tela de campo grava por postComFila e
  // o MESMO POST é reenviado quando a rede volta — sem isso, o replay
  // criaria uma segunda linha do mesmo lado no mesmo dia.
  const { error: errIns } = await supabase
    .from('quadra_lados_conclusoes')
    .upsert(linha, { onConflict: 'quadra_id,lado_chave,data_conclusao', ignoreDuplicates: true });
  if (errIns) return { error: errIns.message, quadraConcluida: false };

  // Todos os lados feitos? Precisa dos endereços da quadra (pra saber
  // QUANTOS lados existem) e do histórico de lados.
  const [locaisRes, ladosRes, quadraRes] = await Promise.all([
    supabase.from('locais').select('id, logradouro, marcado_nao_existe').eq('quadra_id', quadraId),
    supabase
      .from('quadra_lados_conclusoes')
      .select('lado_chave, data_conclusao, marcado_em')
      .eq('quadra_id', quadraId),
    supabase.from('quadras').select('data_conclusao').eq('id', quadraId).maybeSingle()
  ]);
  if (locaisRes.error) return { error: locaisRes.error.message, quadraConcluida: false };
  if (ladosRes.error) return { error: ladosRes.error.message, quadraConcluida: false };

  const lados = ladosDaQuadra(
    locaisRes.data ?? [],
    ladosRes.data ?? [],
    quadraRes.data?.data_conclusao ?? null
  );
  if (!todosLadosFeitos(lados)) return { error: null, quadraConcluida: false };

  const dataCheia = dataConclusaoCheiaAutomatica(lados) ?? dataConclusao;
  const { error: errCheia } = await registrarConclusaoQuadra(
    supabase,
    quadraId,
    dataCheia,
    marcadoPor,
    marcadoEm
  );
  // Falha ao FECHAR a quadra não desfaz a marca do lado: o trabalho foi
  // registrado, e a tela avisa que a quadra não pôde ser fechada.
  if (errCheia) return { error: errCheia, quadraConcluida: false };
  return { error: null, quadraConcluida: true };
}

export async function desfazerConclusaoLado(
  supabase: { from: (t: string) => any },
  quadraId: string,
  ladoChave: string
): Promise<{ error: string | null }> {
  const { data: hist } = await supabase
    .from('quadra_lados_conclusoes')
    .select('id')
    .eq('quadra_id', quadraId)
    .eq('lado_chave', ladoChave)
    .order('data_conclusao', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);
  if (!hist?.[0]) return { error: null }; // já não havia marca — nada a fazer
  const { error, count } = await supabase
    .from('quadra_lados_conclusoes')
    .delete({ count: 'exact' })
    .eq('id', hist[0].id);
  if (error) return { error: error.message };
  if (count === 0) return { error: 'Sem permissão pra desfazer (só dirigente ou admin).' };
  return { error: null };
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
    const { error: errDel, count: delCount } = await supabase
      .from('quadras_conclusoes')
      .delete({ count: 'exact' })
      .eq('id', hist[0].id);
    // DELETE barrado por RLS também é silencioso (0 linhas, sem erro) —
    // deixar passar aqui punha quadra e histórico em estados
    // diferentes: a data voltava pra penúltima no mapa e a linha mais
    // recente continuava no histórico, pronta pra "ressuscitar" a data
    // na próxima conclusão (que recalcula pelo MAIOR do histórico).
    if (errDel) return { error: friendlyMessage(errDel) };
    if (delCount === 0) return { error: 'Sem permissão pra desfazer esta conclusão.' };
  }
  const { error, count } = await supabase
    .from('quadras')
    .update({ data_conclusao: hist?.[1]?.data_conclusao ?? null }, { count: 'exact' })
    .eq('id', quadraId);
  if (error) return { error: friendlyMessage(error) };
  if (count === 0) return { error: 'Sem permissão pra alterar esta quadra.' };
  return { error: null };
}

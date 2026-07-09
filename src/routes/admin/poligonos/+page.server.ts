// W4: o LOAD desta rota mora em +page.ts (universal, roda no BROWSER
// com ssr=false) — era o load mais pesado do app (~19k locais_geo via
// selectAll). Este arquivo fica só com as ACTIONS (guards e RPCs
// PostGIS continuam server-side de propósito).
import type { Actions } from './$types';
import { hojeIsoBrasil } from '$lib/utils/data';
import { exigirAdminAction } from '$lib/server/guards';
import { fail } from '@sveltejs/kit';

export const actions: Actions = {
  autoVincular: async ({ locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const { data, error } = await locals.supabase.rpc('auto_vincular_enderecos' as any);
    if (error) return fail(400, { erro: error.message });
    const r = (data as any)?.[0];
    return { ok: true, msg: `${r?.vinculados ?? 0} endereço(s) vinculado(s) automaticamente (${r?.sem_match ?? 0} sem polígono correspondente).` };
  },

  vincularManual: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const localIds = fd.getAll('local_ids').map((v) => Number(v)).filter(Boolean);
    const quadraId = String(fd.get('quadra_id') ?? '');
    if (localIds.length === 0 || !quadraId) return fail(400, { erro: 'local_ids e quadra_id obrigatórios' });
    const { error } = await locals.supabase.from('locais').update({ quadra_id: quadraId }).in('id', localIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${localIds.length} endereço(s) vinculado(s) a ${quadraId}` };
  },

  // Marca/desmarca endereços como "não visitar" — esconde do publicador
  toggleAtivacao: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const localIds = fd.getAll('local_ids').map((v) => Number(v)).filter(Boolean);
    const ativar = fd.get('ativar') === 'true';
    if (localIds.length === 0) return fail(400, { erro: 'Sem endereços' });
    // ativar=true → nao_visitar=false (volta a ser endereço ativo)
    const { error } = await locals.supabase
      .from('locais').update({ nao_visitar: !ativar }).in('id', localIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${localIds.length} endereço(s) ${ativar ? 'ativado(s)' : 'desativado(s)'}` };
  },

  // Remove vínculo (volta pra "sem quadra")
  desvincular: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const localIds = fd.getAll('local_ids').map((v) => Number(v)).filter(Boolean);
    if (localIds.length === 0) return fail(400, { erro: 'Sem endereços' });
    const { error } = await locals.supabase
      .from('locais').update({ quadra_id: null }).in('id', localIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${localIds.length} endereço(s) desvinculado(s)` };
  },

  // Ativa/inativa a quadra. 'concluído' / 'pendente' são derivados de data_conclusao,
  // não setados aqui.
  alterarStatusQuadra: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const ativa = fd.get('ativa') === 'true';
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('quadras').update({ ativa }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${id} → ${ativa ? 'ativa' : 'inativa'}` };
  },

  // ===== Modo Território (CRUD) =====

  // Cria território de quadras selecionadas. Gera id único a partir do nome.
  criarTerritorio: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const cor = String(fd.get('cor') ?? '').trim() || '#3388ff';
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });

    // id = slug do nome; se colidir, sufixa -2, -3...
    const base = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'territorio';
    const { data: existentes } = await locals.supabase.from('territorios').select('id');
    const usados = new Set((existentes ?? []).map((t) => t.id));
    let id = base;
    let n = 2;
    while (usados.has(id)) { id = `${base}-${n++}`; }

    const { error: errT } = await locals.supabase
      .from('territorios').insert({ id, nome, cor });
    if (errT) return fail(400, { erro: errT.message });

    if (quadrasIds.length > 0) {
      const { error: errQ } = await locals.supabase
        .from('quadras').update({ territorio_id: id }).in('id', quadrasIds);
      if (errQ) return fail(400, { erro: 'Território criado mas falhou ao vincular quadras: ' + errQ.message });
    }
    return { ok: true, msg: `Território "${nome}" criado com ${quadrasIds.length} quadra(s)` };
  },

  atualizarTerritorio: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const nome = String(fd.get('nome') ?? '').trim();
    const cor = String(fd.get('cor') ?? '').trim() || '#3388ff';
    if (!id || !nome) return fail(400, { erro: 'id e nome obrigatórios' });
    const { error } = await locals.supabase
      .from('territorios').update({ nome, cor }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    // Propaga a cor pras quadras do território (visual consistente)
    await locals.supabase.from('quadras').update({ color: cor }).eq('territorio_id', id);
    return { ok: true, msg: 'Território atualizado' };
  },

  // Adiciona quadras selecionadas a um território existente
  adicionarQuadrasAoTerritorio: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    if (!id || quadrasIds.length === 0) return fail(400, { erro: 'território + quadras obrigatórios' });
    const { error } = await locals.supabase
      .from('quadras').update({ territorio_id: id }).in('id', quadrasIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${quadrasIds.length} quadra(s) adicionada(s)` };
  },

  // Remove quadras de qualquer território (viram órfãs)
  removerQuadrasDoTerritorio: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    if (quadrasIds.length === 0) return fail(400, { erro: 'Sem quadras' });
    const { error } = await locals.supabase
      .from('quadras').update({ territorio_id: null }).in('id', quadrasIds);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${quadrasIds.length} quadra(s) órfã(s)` };
  },

  // Deleta território. FK ON DELETE SET NULL deixa as quadras órfãs.
  deletarTerritorio: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('territorios').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `Território removido (quadras viraram órfãs)` };
  },

  // ===== Modo TCE =====
  criarTce: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const tipo = String(fd.get('tipo') ?? 'comercial').trim() || 'comercial';
    const localIds = fd.getAll('local_ids').map((v) => Number(v)).filter(Boolean);
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (localIds.length === 0) return fail(400, { erro: 'Selecione endereços comerciais' });
    const { data, error } = await locals.supabase.rpc('criar_tce' as any, {
      p_nome: nome, p_tipo: tipo, p_local_ids: localIds
    } as any);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `TCE "${nome}" criado (${localIds.length} endereço(s))`, id: data };
  },

  alterarStatusTce: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const status = String(fd.get('status') ?? '');
    if (!id || !['aberto', 'concluido', 'cancelado'].includes(status)) return fail(400, { erro: 'inválido' });
    const patch: any = { status };
    if (status === 'concluido') patch.data_conclusao = hojeIsoBrasil();
    const { error } = await locals.supabase.from('tces').update(patch).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `TCE ${status}` };
  },

  deletarTce: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tces').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'TCE removido' };
  },

  // ===== Geometria (terra-draw) =====
  // Salva polígono: cria quadra nova ou edita forma de existente
  salvarPoligonoQuadra: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '').trim();
    const geojsonRaw = String(fd.get('geojson') ?? '');
    const criar = fd.get('criar') === 'true';
    const color = String(fd.get('color') ?? '#3388ff');
    const territorioId = String(fd.get('territorio_id') ?? '').trim() || null;
    if (!id) return fail(400, { erro: 'id obrigatório' });
    let geojson: any;
    try { geojson = JSON.parse(geojsonRaw); } catch { return fail(400, { erro: 'GeoJSON inválido' }); }
    const { error } = await locals.supabase.rpc('salvar_quadra_poligono' as any, {
      p_id: id, p_geojson: geojson, p_color: color, p_territorio_id: territorioId, p_criar: criar
    } as any);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: criar ? `Quadra ${id} criada` : `Forma de ${id} salva` };
  },

  juntarQuadras: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    if (ids.length < 2) return fail(400, { erro: 'Selecione ao menos 2 quadras' });
    const { data, error } = await locals.supabase.rpc('quadras_join' as any, { p_ids: ids } as any);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `${ids.length} quadras unidas em ${data}` };
  },

  // Divide a quadra por uma linha (split). Cria uma nova quadra com a outra metade.
  dividirQuadra: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const novoId = String(fd.get('novo_id') ?? '').trim();
    const lineRaw = String(fd.get('line') ?? '');
    if (!id || !novoId) return fail(400, { erro: 'id e novo_id obrigatórios' });
    let line: any;
    try { line = JSON.parse(lineRaw); } catch { return fail(400, { erro: 'Linha inválida' }); }
    const { error } = await locals.supabase.rpc('dividir_quadra' as any, {
      p_id: id, p_line: line, p_novo_id: novoId
    } as any);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `Quadra ${id} dividida (nova: ${novoId})` };
  },

  // Exclui quadra. locais ficam órfãos (FK SET NULL); designacao_quadras cascata.
  excluirQuadra: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('quadras').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `Quadra ${id} excluída (endereços ficaram sem quadra)` };
  },

  // A20: "unificar clusters" — os locais de uma quadra com múltiplos
  // clusters IBGE (setor|quadra_ibge divergentes) não têm geometria
  // conflitante pra unir (é a MESMA quadra) — o problema é metadado
  // divergente. Normaliza todos os locais da quadra pro cluster
  // majoritário (mais locais), aceitando essa quadra como uma só.
  unificarClusterQuadra: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const quadraId = String(fd.get('quadra_id') ?? '');
    if (!quadraId) return fail(400, { erro: 'quadra_id obrigatório' });

    const { data: locaisDaQuadra, error: errL } = await locals.supabase
      .from('locais')
      .select('id, setor, quadra_ibge')
      .eq('quadra_id', quadraId);
    if (errL) return fail(400, { erro: errL.message });
    if (!locaisDaQuadra || locaisDaQuadra.length === 0) return fail(400, { erro: 'Quadra sem endereços' });

    const contagem = new Map<string, { setor: string | null; quadra_ibge: string | null; qtd: number }>();
    for (const l of locaisDaQuadra as any[]) {
      const chave = `${l.setor || ''}|${l.quadra_ibge || ''}`;
      const atual = contagem.get(chave) ?? { setor: l.setor, quadra_ibge: l.quadra_ibge, qtd: 0 };
      atual.qtd++;
      contagem.set(chave, atual);
    }
    const majoritario = [...contagem.values()].sort((a, b) => b.qtd - a.qtd)[0];
    if (contagem.size <= 1) return { ok: true, msg: 'Já é um cluster só' };

    const { error: errU } = await locals.supabase
      .from('locais')
      .update({ setor: majoritario.setor, quadra_ibge: majoritario.quadra_ibge })
      .eq('quadra_id', quadraId);
    if (errU) return fail(400, { erro: errU.message });
    return { ok: true, msg: `Quadra ${quadraId} unificada (${locaisDaQuadra.length} endereço(s) normalizado(s))` };
  },

  // Vincula UMA quadra a um território (ou desvincula se territorio_id vazio)
  vincularTerritorioQuadra: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const territorioId = String(fd.get('territorio_id') ?? '').trim() || null;
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('quadras').update({ territorio_id: territorioId }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: territorioId ? `${id} → território ${territorioId}` : `${id} sem território` };
  },

  // Renomeia uma quadra propagando o id em CASCADE (FK ON UPDATE):
  // - quadras.id → designacao_quadras.quadra_id, locais.quadra_id seguem auto.
  // Mas como nossas FKs estão como ON DELETE SET NULL/CASCADE e não ON UPDATE,
  // fazemos manualmente: insere nova, copia, atualiza refs, deleta antiga.
  renomearQuadra: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const idAntigo = String(fd.get('id_antigo') ?? '');
    const idNovo = String(fd.get('id_novo') ?? '').trim();
    if (!idAntigo || !idNovo) return fail(400, { erro: 'IDs obrigatórios' });
    if (idAntigo === idNovo) return { ok: true, msg: 'Sem mudança' };

    // Verifica que o novo não existe
    const { data: existe } = await locals.supabase.from('quadras').select('id').eq('id', idNovo).maybeSingle();
    if (existe) return fail(400, { erro: `Quadra ${idNovo} já existe` });

    // Pega dados da antiga
    const { data: antiga } = await locals.supabase.from('quadras').select('*').eq('id', idAntigo).maybeSingle();
    if (!antiga) return fail(400, { erro: 'Quadra antiga não encontrada' });

    // 1. Cria nova com os mesmos dados
    const { error: e1 } = await locals.supabase.from('quadras').insert({ ...antiga, id: idNovo });
    if (e1) return fail(400, { erro: 'Erro criando nova: ' + e1.message });

    // 2. Atualiza refs
    await locals.supabase.from('locais').update({ quadra_id: idNovo }).eq('quadra_id', idAntigo);
    await locals.supabase.from('designacao_quadras').update({ quadra_id: idNovo }).eq('quadra_id', idAntigo);

    // 3. Remove antiga
    const { error: e2 } = await locals.supabase.from('quadras').delete().eq('id', idAntigo);
    if (e2) return fail(400, { erro: 'Erro removendo antiga: ' + e2.message });

    return { ok: true, msg: `Renomeada de ${idAntigo} → ${idNovo}` };
  },

  // ===== Curadoria (T12/A6) =====

  // Confirma a edição/criação — vira definitiva, some da fila.
  confirmarCuradoria: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });

    // A7: confirmar um "não existe mais" de verdade inativa o endereço
    // (nao_visitar=true — some das listas de trabalho, reversível em
    // Polígonos/Vincular, sem apagar histórico).
    const { data: linha } = await locals.supabase
      .from('curadoria_edicoes').select('tipo, local_id').eq('id', id).maybeSingle();
    if (linha?.tipo === 'nao_existe' && linha.local_id) {
      const { error: errNv } = await locals.supabase
        .from('locais').update({ nao_visitar: true }).eq('id', linha.local_id);
      if (errNv) return fail(400, { erro: errNv.message });
    }

    const { error } = await locals.supabase
      .from('curadoria_edicoes')
      .update({ status: 'confirmado', resolvido_por: locals.user.id, resolvido_em: new Date().toISOString() })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Confirmado' };
  },

  // Reverte: 'criacao' apaga o local criado; 'edicao'/'nao_existe' restaura
  // o snapshot `antes` no registro (local ou unidade).
  reverterCuradoria: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });

    const { data: linha, error: errBusca } = await locals.supabase
      .from('curadoria_edicoes')
      .select('id, local_id, unidade_id, tipo, antes')
      .eq('id', id)
      .single();
    if (errBusca || !linha) return fail(404, { erro: 'Registro de curadoria não encontrado' });

    if (linha.tipo === 'criacao') {
      if (!linha.local_id) return fail(400, { erro: 'Sem local_id pra reverter criação' });
      // Cascata apaga unidades e a própria linha de curadoria (FK on delete cascade).
      const { error } = await locals.supabase.from('locais').delete().eq('id', linha.local_id);
      if (error) return fail(400, { erro: error.message });
      return { ok: true, msg: 'Criação revertida (endereço excluído)' };
    }

    if (!linha.antes || Object.keys(linha.antes).length === 0) {
      return fail(400, { erro: 'Sem snapshot "antes" pra restaurar' });
    }
    if (linha.unidade_id) {
      const { error } = await locals.supabase.from('unidades').update(linha.antes).eq('id', linha.unidade_id);
      if (error) return fail(400, { erro: error.message });
    } else if (linha.local_id) {
      const { error } = await locals.supabase.from('locais').update(linha.antes).eq('id', linha.local_id);
      if (error) return fail(400, { erro: error.message });
    } else {
      return fail(400, { erro: 'Sem local_id/unidade_id pra reverter' });
    }

    const { error: errUpd } = await locals.supabase
      .from('curadoria_edicoes')
      .update({ status: 'revertido', resolvido_por: locals.user.id, resolvido_em: new Date().toISOString() })
      .eq('id', id);
    if (errUpd) return fail(400, { erro: errUpd.message });
    return { ok: true, msg: 'Revertido' };
  }
};

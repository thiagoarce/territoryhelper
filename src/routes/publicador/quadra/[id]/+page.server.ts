// W8: o LOAD desta rota mora em +page.ts (universal, browser, com
// cache offline — modo rua). Este arquivo fica só com as ACTIONS, que
// continuam server-side com o guard de posse próprio (pode_editar_local
// via RPC — defesa em profundidade, o load do layout não protege POST).
import type { Actions } from './$types';
import { hojeIsoBrasil, horaBrasilParaIso } from '$lib/utils/data';
import { fail } from '@sveltejs/kit';
import { registrarCuradoria, snapshotAntes } from '$lib/server/curadoria';
import { registrarConclusaoQuadra, desfazerConclusaoQuadra, registrarConclusaoLado, desfazerConclusaoLado } from '$lib/server/conclusao';
import { criarPontoReferencia } from '$lib/server/pontos';

const DESFECHOS_VALIDOS = ['conversou', 'semConversa', 'naoAtendeu', ''] as const;

// Defesa em profundidade: o guard de posse roda por ACTION (um POST
// direto não passa pelo load). Sem isso, um UPDATE bloqueado pela RLS
// retorna sucesso "silencioso" (0 linhas afetadas, sem erro). Usa a
// mesma RPC que a RLS usa (pode_editar_local).
async function podeEditarLocal(locals: App.Locals, localId: number): Promise<boolean> {
  const { data, error: err } = await locals.supabase.rpc('pode_editar_local', { p_local_id: localId });
  if (err) return false;
  return !!data;
}

async function localIdDaUnidade(locals: App.Locals, unidadeId: number): Promise<number | null> {
  const { data } = await locals.supabase.from('unidades').select('local_id').eq('id', unidadeId).maybeSingle();
  return data?.local_id ?? null;
}

export const actions: Actions = {
  // Marca desfecho mutex (naoAtendeu | semConversa | conversou) numa unidade.
  // Tipo vazio = "desfeito" (undo). Insere row em registros (append-only).
  marcarDesfecho: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const tipo = String(fd.get('tipo') ?? '');
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });
    if (!DESFECHOS_VALIDOS.includes(tipo as any)) {
      return fail(400, { erro: 'tipo inválido' });
    }
    const localId = await localIdDaUnidade(locals, unidadeId);
    if (!localId || !(await podeEditarLocal(locals, localId))) {
      return fail(403, { erro: 'Você não tem posse dessa unidade' });
    }
    const tipoFinal = tipo === '' ? 'desfeito' : tipo;
    const { error: err } = await locals.supabase
      .from('registros')
      .insert({
        unidade_id: unidadeId,
        tipo: tipoFinal,
        publicador_id: locals.user.id
      });
    if (err) return fail(400, { erro: err.message });
    return { ok: true };
  },

  // Upload de foto pro Supabase Storage. Retorna URL pública pra salvar
  // em locais.foto_url via outra ação.
  uploadFoto: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const localId = Number(fd.get('local_id') ?? 0);
    const file = fd.get('foto') as File;
    if (!localId || !file || file.size === 0) return fail(400, { erro: 'Arquivo obrigatório' });
    if (file.size > 5 * 1024 * 1024) return fail(400, { erro: 'Foto > 5MB' });
    const { data: antesFoto } = await locals.supabase.from('locais').select('foto_url').eq('id', localId).maybeSingle();
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `local-${localId}-${Date.now()}.${ext}`;
    const { error: errUp } = await locals.supabase.storage
      .from('fotos-locais')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (errUp) return fail(400, { erro: errUp.message });
    const { data: pub } = locals.supabase.storage.from('fotos-locais').getPublicUrl(path);
    const { error: errL } = await locals.supabase
      .from('locais')
      .update({ foto_url: pub.publicUrl })
      .eq('id', localId);
    if (errL) return fail(400, { erro: errL.message });
    await registrarCuradoria(locals, { local_id: localId, tipo: 'edicao', antes: { foto_url: antesFoto?.foto_url ?? null }, depois: { foto_url: pub.publicUrl } });
    return { ok: true, foto_url: pub.publicUrl };
  },

  // Remove foto
  removerFoto: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const localId = Number(fd.get('local_id') ?? 0);
    if (!localId) return fail(400, { erro: 'id obrigatório' });
    const { data: antesFoto } = await locals.supabase.from('locais').select('foto_url').eq('id', localId).maybeSingle();
    const { error } = await locals.supabase.from('locais').update({ foto_url: null }).eq('id', localId);
    if (error) return fail(400, { erro: error.message });
    await registrarCuradoria(locals, { local_id: localId, tipo: 'edicao', antes: { foto_url: antesFoto?.foto_url ?? null }, depois: { foto_url: null } });
    return { ok: true };
  },

  // A8: reordenação manual — recebe os ids de um grupo (face) NA ORDEM
  // desejada (o client já fez o swap ▲▼ em JS) e reatribui ordem_na_quadra
  // sequencial (0,1,2...). Só gera curadoria pros locais cujo valor
  // realmente mudou, senão um clique gera uma linha por local do grupo.
  reordenarLocais: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => Number(v)).filter(Boolean);
    if (ids.length === 0) return fail(400, { erro: 'ids obrigatório' });
    const { data: atuais } = await locals.supabase
      .from('locais').select('id, ordem_na_quadra').in('id', ids);
    const ordemAtualPorId = new Map((atuais ?? []).map((l) => [l.id, l.ordem_na_quadra]));
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (ordemAtualPorId.get(id) === i) continue;
      const { error: err } = await locals.supabase.from('locais').update({ ordem_na_quadra: i }).eq('id', id);
      if (err) return fail(400, { erro: err.message });
      await registrarCuradoria(locals, {
        local_id: id, tipo: 'edicao',
        antes: { ordem_na_quadra: ordemAtualPorId.get(id) ?? null }, depois: { ordem_na_quadra: i }
      });
    }
    return { ok: true };
  },

  // Atualiza overlay de um local (prédio/casa). Campos permitidos:
  // nome, irmao_mora, nome_irmao, notas, tipo_entrada, acesso_caixas,
  // acesso_interfones, nao_visitar. Bloqueia mudança em geo/logradouro/etc.
  atualizarLocal: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    // Overlay é edição livre (migration 057) — trigger barra estrutura,
    // curadoria registra pro admin confirmar/reverter.
    const permitidos = ['nome', 'irmao_mora', 'nome_irmao', 'notas', 'tipo_entrada', 'acesso_caixas', 'acesso_interfones', 'nao_visitar', 'tipo'];
    const booleanos = new Set(['irmao_mora', 'acesso_caixas', 'acesso_interfones', 'nao_visitar']);
    const tiposValidos = new Set(['casa', 'predio', 'comercio', 'coletivo', 'terreno']);
    const patch: Record<string, unknown> = {};
    for (const k of permitidos) {
      if (!fd.has(k)) continue;
      const v = fd.get(k);
      if (booleanos.has(k)) {
        patch[k] = v === 'on' || v === 'true';
      } else if (k === 'tipo') {
        const s = String(v ?? '').trim();
        if (tiposValidos.has(s)) patch[k] = s;
      } else {
        const s = String(v ?? '').trim();
        patch[k] = s === '' ? null : s;
      }
    }
    const { data: atual } = await locals.supabase.from('locais').select('*').eq('id', id).maybeSingle();
    const { error: err } = await locals.supabase.from('locais').update(patch).eq('id', id);
    if (err) return fail(400, { erro: err.message });
    await registrarCuradoria(locals, { local_id: id, tipo: 'edicao', antes: snapshotAntes(atual, patch), depois: patch });
    return { ok: true, msg: 'Local atualizado' };
  },

  // A7: feedback "este endereço não existe mais" — esmaece na UI e sai das
  // contagens de progresso; fica pendente até o admin confirmar (Polígonos
  // → Curadoria, T12) ou reverter.
  marcarNaoExiste: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const marcar = fd.get('marcar') !== 'false';
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const patch = marcar
      ? { marcado_nao_existe: true, marcado_por: locals.user.id, marcado_em: new Date().toISOString() }
      : { marcado_nao_existe: false, marcado_por: null, marcado_em: null };
    const { error: err } = await locals.supabase.from('locais').update(patch).eq('id', id);
    if (err) return fail(400, { erro: err.message });
    if (marcar) {
      await registrarCuradoria(locals, {
        local_id: id, tipo: 'nao_existe',
        antes: { marcado_nao_existe: false }, depois: { marcado_nao_existe: true }
      });
    }
    return { ok: true, msg: marcar ? 'Marcado como "não existe mais"' : 'Desmarcado' };
  },

  // Atualiza overlay de uma unidade. Campos: complemento, nota,
  // desocupado, nao_escrever.
  atualizarUnidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const localId = await localIdDaUnidade(locals, id);
    if (!localId) return fail(404, { erro: 'Unidade não encontrada' });
    const permitidos = ['complemento', 'nota', 'desocupado', 'nao_escrever'];
    const patch: Record<string, unknown> = {};
    for (const k of permitidos) {
      if (!fd.has(k)) continue;
      const v = fd.get(k);
      if (k === 'desocupado' || k === 'nao_escrever') patch[k] = v === 'on' || v === 'true';
      else {
        const s = String(v ?? '').trim();
        patch[k] = s === '' ? null : s;
      }
    }
    const { data: atualU } = await locals.supabase.from('unidades').select('*').eq('id', id).maybeSingle();
    const { error: err } = await locals.supabase.from('unidades').update(patch).eq('id', id);
    if (err) return fail(400, { erro: err.message });
    await registrarCuradoria(locals, { local_id: localId, unidade_id: id, tipo: 'edicao', antes: snapshotAntes(atualU, patch), depois: patch });
    return { ok: true, msg: 'Unidade atualizada' };
  },

  // Exclui unidade (cascade limpa registros dela). Irreversível.
  excluirUnidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const localId = await localIdDaUnidade(locals, id);
    if (!localId || !(await podeEditarLocal(locals, localId))) {
      return fail(403, { erro: 'Você não tem posse dessa unidade' });
    }
    const { error: err } = await locals.supabase.from('unidades').delete().eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Unidade excluída' };
  },

  // Cria novo local + 1 ou N unidades (pra prédio com múltiplos aptos).
  // Vincula automaticamente à quadra atual.
  criarLocal: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const tipo = String(fd.get('tipo') ?? 'casa');
    const logradouro = String(fd.get('logradouro') ?? '').trim();
    const numero = String(fd.get('numero') ?? '').trim() || 's/n';
    const nome = String(fd.get('nome') ?? '').trim() || null;
    const lat = parseFloat(String(fd.get('lat') ?? ''));
    const lng = parseFloat(String(fd.get('lng') ?? ''));
    const face_ibge = String(fd.get('face_ibge') ?? '').trim() || null;
    const andares = parseInt(String(fd.get('andares') ?? '0'), 10);
    const aptosPorAndar = parseInt(String(fd.get('aptos_por_andar') ?? '0'), 10);
    const complementoUnico = String(fd.get('complemento') ?? '').trim() || null;

    if (!logradouro) return fail(400, { erro: 'Logradouro obrigatório' });
    if (!['predio', 'casa', 'comercio', 'coletivo', 'terreno'].includes(tipo)) {
      return fail(400, { erro: 'Tipo inválido' });
    }

    const geo = isFinite(lat) && isFinite(lng) ? `SRID=4326;POINT(${lng} ${lat})` : null;

    // Publicador comum cria PENDENTE (admin valida em /admin/predios);
    // dirigente/admin cria direto. Entra na curadoria de qualquer jeito.
    const pendente = locals.profile?.role === 'publicador';
    const { data: novoLocal, error: errLoc } = await locals.supabase
      .from('locais')
      .insert({
        tipo,
        logradouro,
        numero,
        nome,
        geo,
        quadra_id: params.id,
        face_ibge,
        pendente,
        criado_por: locals.user.id
      })
      .select('id')
      .single();
    if (errLoc) return fail(400, { erro: errLoc.message });
    await registrarCuradoria(locals, {
      local_id: novoLocal.id, tipo: 'criacao',
      depois: { tipo, logradouro, numero, nome, quadra_id: params.id, pendente }
    });

    // Gera unidades
    const unidades: any[] = [];
    if (tipo === 'predio' && andares > 0 && aptosPorAndar > 0) {
      if (andares * aptosPorAndar > 500) return fail(400, { erro: 'Máximo 500 aptos por prédio' });
      for (let a = 1; a <= andares; a++) {
        for (let p = 1; p <= aptosPorAndar; p++) {
          unidades.push({ local_id: novoLocal.id, complemento: `APARTAMENTO ${a * 100 + p}`, ordem: a * 100 + p });
        }
      }
    } else {
      unidades.push({ local_id: novoLocal.id, complemento: complementoUnico, ordem: null });
    }
    const { error: errUni } = await locals.supabase.from('unidades').insert(unidades);
    if (errUni) return fail(400, { erro: 'Local criado mas falhou ao criar unidades: ' + errUni.message });

    return { ok: true, msg: `Criado ${tipo} com ${unidades.length} unidade(s)` };
  },

  // Exclui local inteiro (cascade deleta unidades + registros + tce_unidades)
  excluirLocal: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (!(await podeEditarLocal(locals, id))) return fail(403, { erro: 'Você não tem posse desse local' });
    const { error } = await locals.supabase.from('locais').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Local excluído' };
  },

  // Concluir um LADO da quadra ("só fizemos o lado da Rua X"). Mesmo
  // poder de concluir a quadra inteira: dirigente/admin. Marcar o
  // ÚLTIMO lado fecha a quadra sozinha, pelo caminho canônico.
  concluirLado: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode marcar conclusão' });
    }
    const fd = await request.formData();
    const chave = String(fd.get('lado_chave') ?? '').trim();
    const rotulo = String(fd.get('lado_rotulo') ?? '').trim();
    if (!chave || !rotulo) return fail(400, { erro: 'lado obrigatório' });
    const data = String(fd.get('data') ?? '').trim() || hojeIsoBrasil();
    const hora = String(fd.get('hora') ?? '').trim();
    const marcadoEm = hora ? horaBrasilParaIso(data, hora) : null;
    const r = await registrarConclusaoLado(
      locals.supabase,
      params.id,
      { chave, rotulo },
      data,
      locals.user.id,
      marcadoEm
    );
    if (r.error) return fail(400, { erro: r.error });
    return {
      ok: true,
      quadraConcluida: r.quadraConcluida,
      msg: r.quadraConcluida ? 'Último lado — quadra concluída' : `Lado "${rotulo}" marcado`
    };
  },

  desfazerLado: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const chave = String(fd.get('lado_chave') ?? '').trim();
    if (!chave) return fail(400, { erro: 'lado obrigatório' });
    const { error: err } = await desfazerConclusaoLado(locals.supabase, params.id, chave);
    if (err) return fail(400, { erro: err });
    return { ok: true, msg: 'Marca do lado removida' };
  },

  // SUGESTÃO de ponto de referência, a partir de um lugar que o app
  // achou em campo. O cadastro de verdade mora em /admin/poligonos: o
  // ponto de encontro é característica do TERRITÓRIO (às vezes de
  // vários), não da quadra — por isso aqui o dirigente só sugere e o
  // admin valida. Admin sugerindo já entra validado.
  sugerirPontoReferencia: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode sugerir ponto' });
    }
    const fd = await request.formData();
    const { error: err } = await criarPontoReferencia(locals.supabase, {
      nome: String(fd.get('nome') ?? ''),
      tipo: fd.get('tipo'),
      lat: fd.get('lat'),
      lng: fd.get('lng'),
      notas: String(fd.get('notas') ?? '') || null,
      endereco: String(fd.get('endereco') ?? '') || null,
      osmId: String(fd.get('osm_id') ?? '') || null,
      status: locals.profile?.role === 'admin' ? 'validado' : 'sugerido',
      criadoPor: locals.user.id
    });
    if (err) return fail(400, { erro: err });
    return {
      ok: true,
      msg: locals.profile?.role === 'admin' ? 'Ponto salvo' : 'Sugestão enviada pro servo de território'
    };
  },

  // Marca a quadra atual como concluída (só dirigente/admin). Poder de
  // dirigente no modo campo — publicador comum não pode.
  concluirQuadra: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode marcar conclusão' });
    }
    const fd = await request.formData();
    const data = String(fd.get('data') ?? '').trim() || hojeIsoBrasil();
    const hora = String(fd.get('hora') ?? '').trim();
    const marcadoEm = hora ? horaBrasilParaIso(data, hora) : null;
    const { error: err } = await registrarConclusaoQuadra(locals.supabase, params.id, data, locals.user.id, marcadoEm);
    if (err) return fail(400, { erro: err });
    return { ok: true, msg: 'Quadra concluída em ' + data };
  },

  // Desfaz conclusão (dirigente/admin)
  desfazerConclusao: async ({ locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const { error: err } = await desfazerConclusaoQuadra(locals.supabase, params.id);
    if (err) return fail(400, { erro: err });
    return { ok: true, msg: 'Conclusão desfeita' };
  },

  // Marca/desmarca carta entregue. Atualiza unidades.carta_entregue (date)
  // E insere em registros pra trilha histórica.
  toggleCarta: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const marcar = fd.get('marcar') === 'true';
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });
    const localId = await localIdDaUnidade(locals, unidadeId);
    if (!localId || !(await podeEditarLocal(locals, localId))) {
      return fail(403, { erro: 'Você não tem posse dessa unidade' });
    }

    const hoje = hojeIsoBrasil();
    const { error: errUpd } = await locals.supabase
      .from('unidades')
      .update({ carta_entregue: marcar ? hoje : null })
      .eq('id', unidadeId);
    if (errUpd) return fail(400, { erro: errUpd.message });

    const { error: errReg } = await locals.supabase
      .from('registros')
      .insert({
        unidade_id: unidadeId,
        tipo: marcar ? 'carta' : 'carta_undo',
        publicador_id: locals.user.id
      });
    if (errReg) return fail(400, { erro: errReg.message });

    return { ok: true };
  }
};

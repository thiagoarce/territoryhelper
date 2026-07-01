import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { carregarQuadraComLocais } from '$lib/server/queries';
import { exigirQuadraDesignada } from '$lib/server/guards';

const DESFECHOS_VALIDOS = ['conversou', 'semConversa', 'naoAtendeu', ''] as const;

export const load: PageServerLoad = async ({ locals, params }) => {
  await exigirQuadraDesignada(locals, params.id);
  const dados = await carregarQuadraComLocais(locals.supabase, params.id);
  if (!dados) throw error(404, 'Quadra não encontrada');
  return { ...dados, minhaRole: locals.profile?.role };
};

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
    return { ok: true, foto_url: pub.publicUrl };
  },

  // Remove foto
  removerFoto: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const localId = Number(fd.get('local_id') ?? 0);
    if (!localId) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('locais').update({ foto_url: null }).eq('id', localId);
    if (error) return fail(400, { erro: error.message });
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
    const { error: err } = await locals.supabase.from('locais').update(patch).eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Local atualizado' };
  },

  // Atualiza overlay de uma unidade. Campos: complemento, nota,
  // desocupado, nao_escrever.
  atualizarUnidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
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
    const { error: err } = await locals.supabase.from('unidades').update(patch).eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Unidade atualizada' };
  },

  // Exclui unidade (cascade limpa registros dela). Irreversível.
  excluirUnidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
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
        criado_por: locals.user.id
      })
      .select('id')
      .single();
    if (errLoc) return fail(400, { erro: errLoc.message });

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
    const { error } = await locals.supabase.from('locais').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Local excluído' };
  },

  // Marca a quadra atual como concluída (só dirigente/admin). Poder de
  // dirigente no modo campo — publicador comum não pode.
  concluirQuadra: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin pode marcar conclusão' });
    }
    const fd = await request.formData();
    const data = String(fd.get('data') ?? '').trim() || new Date().toISOString().substring(0, 10);
    const { error: err } = await locals.supabase
      .from('quadras')
      .update({ data_conclusao: data })
      .eq('id', params.id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Quadra concluída em ' + data };
  },

  // Desfaz conclusão (dirigente/admin)
  desfazerConclusao: async ({ locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const { error: err } = await locals.supabase
      .from('quadras')
      .update({ data_conclusao: null })
      .eq('id', params.id);
    if (err) return fail(400, { erro: err.message });
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

    const hoje = new Date().toISOString().substring(0, 10);
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

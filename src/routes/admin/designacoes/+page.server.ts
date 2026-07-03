import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import {
  listarDesignacoes,
  listarPublicadores,
  quadrasEmArranjoFuturo,
  msgConflitoArranjo
} from '$lib/server/queries';
import type { DesignacaoEnriquecida } from '$lib/server/queries';

// Hub central de gestão de designações: pessoal, arranjo (distribuídas),
// cartas e TCE num lugar só. Antes cada tipo era gerido na tela onde nascia.

export interface DesignacaoHub extends DesignacaoEnriquecida {
  predios: { id: number; nome: string | null; logradouro: string; numero: string }[];
}

export interface TceHub {
  id: string;
  nome: string;
  tipo: string;
  publicador_id: string | null;
  publicador_nome: string | null;
  prazo: string | null;
  status: string;
  data_conclusao: string | null;
}

export interface ArranjoHub {
  id: number;
  nome: string | null;
  data: string | null;
  hora_inicio: string | null;
  local_endereco: string | null;
  dirigente_id: string | null;
  dirigente_nome: string | null;
  quadras_ids: string[];
  cartas_locais_ids: number[];
  tce_id: string | null;
}

export interface ArranjoDestino {
  id: number;
  nome: string | null;
  data: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const ontem = new Date(Date.now() - 86400000).toISOString().substring(0, 10);

  const [designacoes, publicadores, tceRes, dlRes, arrRes] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarPublicadores(locals.supabase),
    locals.supabase
      .from('tces')
      .select('id, nome, tipo, publicador_id, prazo, status, data_conclusao')
      .order('status')
      .order('prazo', { nullsFirst: false }),
    locals.supabase.from('designacao_locais').select('designacao_id, local_id'),
    // Arranjos ativos de ontem em diante — o território deles também é
    // "designação" (herdada pelo dirigente)
    locals.supabase
      .from('arranjos')
      .select('id, nome, data, hora_inicio, local_endereco, dirigente_id, quadras_ids, cartas_locais_ids, tce_id')
      .eq('ativo', true)
      .gte('data', ontem)
      .order('data')
  ]);

  // Resolve prédios das designações de cartas (uma query pros locais referenciados)
  const localIds = Array.from(new Set((dlRes.data ?? []).map((r: any) => r.local_id)));
  const locaisById = new Map<number, { id: number; nome: string | null; logradouro: string; numero: string }>();
  if (localIds.length > 0) {
    const { data: locs } = await locals.supabase
      .from('locais').select('id, nome, logradouro, numero').in('id', localIds);
    for (const l of (locs ?? []) as any[]) locaisById.set(l.id, l);
  }
  const prediosPorDesig: Record<number, any[]> = {};
  for (const r of (dlRes.data ?? []) as any[]) {
    const l = locaisById.get(r.local_id);
    if (l) (prediosPorDesig[r.designacao_id] ||= []).push(l);
  }

  const nomePorId = new Map(publicadores.map((p) => [p.id, p.nome]));
  const hub: DesignacaoHub[] = designacoes.map((d) => ({
    ...d,
    predios: prediosPorDesig[d.id] ?? []
  }));

  const tces: TceHub[] = ((tceRes.data ?? []) as any[]).map((t) => ({
    ...t,
    publicador_nome: t.publicador_id ? nomePorId.get(t.publicador_id) ?? null : null
  }));

  // Só entra no hub arranjo que tem TERRITÓRIO anexado (quadra/prédio/TCE) —
  // evento sem território é só agenda, mora em /admin/arranjos.
  const arranjosBrutos: ArranjoHub[] = ((arrRes.data ?? []) as any[]).map((a) => ({
    ...a,
    quadras_ids: a.quadras_ids ?? [],
    cartas_locais_ids: a.cartas_locais_ids ?? [],
    dirigente_nome: a.dirigente_id ? nomePorId.get(a.dirigente_id) ?? null : null
  }));

  // Só entra no hub arranjo que tem TERRITÓRIO anexado (quadra/prédio/TCE) —
  // evento sem território é só agenda, mora em /admin/arranjos.
  const arranjos = arranjosBrutos.filter(
    (a) => a.quadras_ids.length > 0 || a.cartas_locais_ids.length > 0 || a.tce_id
  );

  // Destinos possíveis pra realocar quadras — QUALQUER arranjo futuro ativo,
  // com ou sem território (pode estar vazio esperando receber as quadras).
  const arranjosDestino: ArranjoDestino[] = arranjosBrutos.map((a) => ({
    id: a.id,
    nome: a.nome,
    data: a.data
  }));

  return { designacoes: hub, tces, arranjos, arranjosDestino, publicadores };
};

function exigirAdmin(locals: App.Locals) {
  if (!locals.user) return fail(401, { erro: 'Não autenticado' });
  if (locals.profile?.role !== 'admin') return fail(403, { erro: 'Só admin' });
  return null;
}

export const actions: Actions = {
  // Muda status (concluida / cancelada / aberta) — cobre concluir, cancelar e reabrir
  mudarStatus: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const status = String(fd.get('status') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (!['aberta', 'concluida', 'cancelada'].includes(status)) return fail(400, { erro: 'status inválido' });
    const { error } = await locals.supabase.from('designacoes').update({ status }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `Designação ${status}` };
  },

  // Edita publicador / prazo / notas de uma designação
  editar: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const publicadorId = String(fd.get('publicador_id') ?? '').trim() || null;
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const { error } = await locals.supabase
      .from('designacoes')
      .update({ publicador_id: publicadorId, prazo, notas })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Designação atualizada' };
  },

  // Apaga a designação (cascade limpa junções). Libera as quadras/prédios.
  apagar: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('designacoes').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Designação removida' };
  },

  // Limpa o TERRITÓRIO de um arranjo (quadras/prédios/TCE) sem apagar o
  // evento — ele some do hub de designações mas continua na agenda.
  limparTerritorioArranjo: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('arranjos')
      .update({ quadras_ids: [], cartas_locais_ids: [], tce_id: null })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    // Partes repartidas apontavam pro território que acabou de sumir
    await locals.supabase.from('arranjo_partes').delete().eq('arranjo_id', id);
    return { ok: true, msg: 'Território do arranjo liberado' };
  },

  // Realoca um subconjunto de quadras de um arranjo (que não terminou tudo)
  // pra outro arranjo — sem apagar nenhum dos dois eventos. Trava: a quadra
  // nunca pode ficar em dois arranjos futuros ao mesmo tempo.
  realocarQuadras: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const origemId = Number(fd.get('origem_id') ?? 0);
    const destinoId = Number(fd.get('destino_id') ?? 0);
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    if (!origemId || !destinoId) return fail(400, { erro: 'origem e destino obrigatórios' });
    if (origemId === destinoId) return fail(400, { erro: 'Origem e destino não podem ser o mesmo arranjo' });
    if (quadrasIds.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });

    const { data: origem, error: errO } = await locals.supabase
      .from('arranjos').select('id, quadras_ids').eq('id', origemId).single();
    if (errO || !origem) return fail(400, { erro: 'Arranjo de origem não encontrado' });
    const quadrasOrigem = (origem.quadras_ids ?? []) as string[];
    const foraDoOrigem = quadrasIds.filter((q) => !quadrasOrigem.includes(q));
    if (foraDoOrigem.length > 0) {
      return fail(400, { erro: `Quadra(s) ${foraDoOrigem.join(', ')} não pertence(m) ao arranjo de origem` });
    }

    const { data: destino, error: errD } = await locals.supabase
      .from('arranjos').select('id, quadras_ids').eq('id', destinoId).single();
    if (errD || !destino) return fail(400, { erro: 'Arranjo de destino não encontrado' });

    // Trava: nenhuma dessas quadras pode estar em OUTRO arranjo futuro além
    // da própria origem (de onde estão saindo) e do destino (pra onde vão).
    const conflitos = await quadrasEmArranjoFuturo(locals.supabase, quadrasIds, [origemId, destinoId]);
    if (conflitos.size > 0) return fail(409, { erro: msgConflitoArranjo(conflitos) });

    const novasOrigem = quadrasOrigem.filter((q) => !quadrasIds.includes(q));
    const novasDestino = Array.from(new Set([...(destino.quadras_ids ?? []), ...quadrasIds]));

    const { error: errUpO } = await locals.supabase
      .from('arranjos').update({ quadras_ids: novasOrigem }).eq('id', origemId);
    if (errUpO) return fail(400, { erro: errUpO.message });
    const { error: errUpD } = await locals.supabase
      .from('arranjos').update({ quadras_ids: novasDestino }).eq('id', destinoId);
    if (errUpD) return fail(400, { erro: errUpD.message });

    // Partes do arranjo de origem que repartiam essas quadras ficam órfãs —
    // tira as quadras movidas delas (e apaga a parte se ficar vazia).
    const { data: partes } = await locals.supabase
      .from('arranjo_partes').select('id, quadras_ids, locais_ids').eq('arranjo_id', origemId);
    for (const p of (partes ?? []) as any[]) {
      const restantes = ((p.quadras_ids ?? []) as string[]).filter((q) => !quadrasIds.includes(q));
      if (restantes.length === (p.quadras_ids ?? []).length) continue;
      if (restantes.length === 0 && (p.locais_ids ?? []).length === 0) {
        await locals.supabase.from('arranjo_partes').delete().eq('id', p.id);
      } else {
        await locals.supabase.from('arranjo_partes').update({ quadras_ids: restantes }).eq('id', p.id);
      }
    }

    return { ok: true, msg: `${quadrasIds.length} quadra(s) realocada(s)` };
  },

  // Gera link público /t/<token> — designação OU arranjo (WhatsApp)
  gerarLinkTerritorio: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const designacaoId = Number(fd.get('designacao_id') ?? 0);
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!designacaoId && !arranjoId) return fail(400, { erro: 'id obrigatório' });
    const row: any = { criado_por: locals.user!.id };
    if (arranjoId) row.arranjo_id = arranjoId;
    else row.designacao_id = designacaoId;
    const { data, error } = await locals.supabase
      .from('territorio_tokens')
      .insert(row)
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  },

  // Status de TCE (aberto / concluido / cancelado)
  mudarStatusTce: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const status = String(fd.get('status') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (!['aberto', 'concluido', 'cancelado'].includes(status)) return fail(400, { erro: 'status inválido' });
    const patch: any = { status };
    if (status === 'concluido') patch.data_conclusao = new Date().toISOString().substring(0, 10);
    if (status === 'aberto') patch.data_conclusao = null;
    const { error } = await locals.supabase.from('tces').update(patch).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: `TCE ${status}` };
  }
};

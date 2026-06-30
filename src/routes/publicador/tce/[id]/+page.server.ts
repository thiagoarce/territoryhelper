import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';

const DESFECHOS_VALIDOS = ['conversou', 'semConversa', 'naoAtendeu', ''] as const;

export interface TceEndereco {
  unidade_id: number;
  local_id: number;
  logradouro: string;
  numero: string;
  nome: string | null;
  complemento: string | null;
  tipo: string;
  ultimoTipo: string | null;
  cartaEntregue: boolean;
}

export const load: PageServerLoad = async ({ locals, params }) => {
  // RLS garante que só vê TCE designado a ele (ou admin)
  const { data: tce, error: errT } = await locals.supabase
    .from('tces')
    .select('id, nome, tipo, prazo, status, notas')
    .eq('id', params.id)
    .maybeSingle();
  if (errT) throw errT;
  if (!tce) throw error(404, 'TCE não encontrado');

  // Unidades do TCE → join com locais
  const { data: vinculos } = await locals.supabase
    .from('tce_unidades')
    .select('unidade_id, unidades(id, complemento, local_id, locais(id, logradouro, numero, nome, tipo))')
    .eq('tce_id', params.id);

  const unidadeIds = (vinculos ?? []).map((v: any) => v.unidade_id);

  // Último desfecho por unidade (Registros)
  const ultimoPorUnidade = new Map<number, string>();
  if (unidadeIds.length > 0) {
    const { data: regs } = await locals.supabase
      .from('registros')
      .select('unidade_id, tipo, ts')
      .in('unidade_id', unidadeIds)
      .order('ts', { ascending: false });
    for (const r of regs ?? []) {
      if (!ultimoPorUnidade.has(r.unidade_id)) ultimoPorUnidade.set(r.unidade_id, r.tipo);
    }
  }

  const enderecos: TceEndereco[] = (vinculos ?? []).map((v: any) => {
    const u = v.unidades;
    const l = u?.locais;
    const ult = ultimoPorUnidade.get(v.unidade_id) ?? null;
    return {
      unidade_id: v.unidade_id,
      local_id: l?.id ?? 0,
      logradouro: l?.logradouro ?? '(sem)',
      numero: l?.numero ?? 's/n',
      nome: l?.nome ?? null,
      complemento: u?.complemento ?? null,
      tipo: l?.tipo ?? 'comercio',
      ultimoTipo: ult === 'desfeito' || ult === 'carta_undo' ? null : ult,
      cartaEntregue: ult === 'carta'
    };
  }).sort((a, b) =>
    a.logradouro.localeCompare(b.logradouro) || a.numero.localeCompare(b.numero)
  );

  return { tce, enderecos };
};

export const actions: Actions = {
  marcarDesfecho: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const tipo = String(fd.get('tipo') ?? '');
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });
    if (!DESFECHOS_VALIDOS.includes(tipo as any)) return fail(400, { erro: 'tipo inválido' });
    const tipoFinal = tipo === '' ? 'desfeito' : tipo;
    const { error: err } = await locals.supabase
      .from('registros')
      .insert({ unidade_id: unidadeId, tipo: tipoFinal, publicador_id: locals.user.id });
    if (err) return fail(400, { erro: err.message });
    return { ok: true };
  },

  toggleCarta: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const undo = fd.get('undo') === 'true';
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });
    const { error: err } = await locals.supabase
      .from('registros')
      .insert({ unidade_id: unidadeId, tipo: undo ? 'carta_undo' : 'carta', publicador_id: locals.user.id });
    if (err) return fail(400, { erro: err.message });
    return { ok: true };
  },

  concluir: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error: err } = await locals.supabase
      .from('tces')
      .update({ status: 'concluido', data_conclusao: new Date().toISOString().substring(0, 10) })
      .eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'TCE concluído' };
  }
};

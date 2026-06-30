import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { selectAll } from '$lib/server/queries';

export interface Modalidade {
  id: number;
  nome: string;
  tipo_territorio: 'quadras' | 'cartas_lista' | 'arquivo' | 'ponto_tp';
  default_local: string | null;
  default_dia_semana: number | null;
  default_hora: string | null;
  cor: string;
  ativo: boolean;
  ordem: number;
}

export interface Arranjo {
  id: number;
  modalidade_id: number;
  nome: string | null;
  recorrente: boolean;
  dia_semana: number | null;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  local_endereco: string | null;
  local_lat: number | null;
  local_lng: number | null;
  dirigente_id: string | null;
  quadras_ids: string[] | null;
  cartas_locais_ids: number[] | null;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  notas: string | null;
  ativo: boolean;
  data_inicio: string | null;
  data_fim: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return { modalidades: [], arranjos: [], dirigentes: [] };

  const [modalidades, arranjos, { data: dirigentes }] = await Promise.all([
    selectAll<Modalidade>(
      locals.supabase
        .from('arranjo_modalidades')
        .select('*')
        .order('ordem')
        .order('nome')
    ),
    selectAll<Arranjo>(
      locals.supabase
        .from('arranjos')
        .select('*')
        .order('dia_semana', { nullsFirst: false })
        .order('hora_inicio', { nullsFirst: false })
    ),
    locals.supabase
      .from('profiles')
      .select('id, nome')
      .in('role', ['dirigente', 'admin'])
      .eq('ativo', true)
      .order('nome')
  ]);

  return {
    modalidades,
    arranjos,
    dirigentes: dirigentes ?? []
  };
};

export const actions: Actions = {
  criarModalidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const tipo = String(fd.get('tipo_territorio') ?? '').trim();
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!['quadras', 'cartas_lista', 'arquivo', 'ponto_tp'].includes(tipo))
      return fail(400, { erro: 'Tipo inválido' });

    const dia = String(fd.get('default_dia_semana') ?? '').trim();
    const hora = String(fd.get('default_hora') ?? '').trim();
    const local = String(fd.get('default_local') ?? '').trim();
    const cor = String(fd.get('cor') ?? '').trim();

    const { error } = await locals.supabase.from('arranjo_modalidades').insert({
      nome,
      tipo_territorio: tipo,
      default_local: local || null,
      default_dia_semana: dia === '' ? null : Number(dia),
      default_hora: hora || null,
      cor: cor || '#3b82f6'
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Modalidade criada' };
  },

  atualizarModalidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });

    const nome = String(fd.get('nome') ?? '').trim();
    const tipo = String(fd.get('tipo_territorio') ?? '').trim();
    const dia = String(fd.get('default_dia_semana') ?? '').trim();
    const hora = String(fd.get('default_hora') ?? '').trim();
    const local = String(fd.get('default_local') ?? '').trim();
    const cor = String(fd.get('cor') ?? '').trim();
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true';

    const { error } = await locals.supabase
      .from('arranjo_modalidades')
      .update({
        nome,
        tipo_territorio: tipo,
        default_local: local || null,
        default_dia_semana: dia === '' ? null : Number(dia),
        default_hora: hora || null,
        cor: cor || '#3b82f6',
        ativo
      })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Modalidade atualizada' };
  },

  deletarModalidade: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('arranjo_modalidades').delete().eq('id', id);
    if (error) return fail(400, { erro: 'Não dá pra apagar (provavelmente tem arranjos usando essa modalidade)' });
    return { ok: true, msg: 'Modalidade removida' };
  }
};

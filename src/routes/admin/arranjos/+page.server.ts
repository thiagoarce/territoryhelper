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
  excecoes_datas: string[] | null;
}

export interface PredioLite {
  id: number;
  logradouro: string | null;
  numero: string | null;
  nome_estabelecimento: string | null;
}

async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error(`[arranjos load] ${label} falhou:`, (e as any)?.message ?? e);
    return fallback;
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return { modalidades: [], arranjos: [], dirigentes: [], quadrasIds: [], predios: [], loadErro: null };

  const [modalidades, arranjos, dirigRes, quadrasRes, predios] = await Promise.all([
    safe('modalidades', selectAll<Modalidade>(
      locals.supabase.from('arranjo_modalidades').select('*').order('ordem').order('nome')
    ), [] as Modalidade[]),
    safe('arranjos', selectAll<Arranjo>(
      locals.supabase
        .from('arranjos')
        .select('*')
        .order('dia_semana', { nullsFirst: false })
        .order('hora_inicio', { nullsFirst: false })
        .order('id')
    ), [] as Arranjo[]),
    safe('dirigentes', locals.supabase
      .from('profiles')
      .select('id, nome')
      .in('role', ['dirigente', 'admin'])
      .eq('ativo', true)
      .order('nome'),
      { data: [] as { id: string; nome: string }[], error: null } as any
    ),
    safe('quadras', locals.supabase.from('quadras').select('id').eq('ativa', true).order('id'),
      { data: [] as { id: string }[], error: null } as any),
    safe('predios', selectAll<PredioLite>(
      locals.supabase
        .from('locais')
        .select('id, logradouro, numero, nome_estabelecimento')
        .eq('tipo', 'predio')
        .order('logradouro')
        .order('numero')
        .order('id')
    ), [] as PredioLite[])
  ]);

  return {
    modalidades,
    arranjos,
    dirigentes: dirigRes?.data ?? [],
    quadrasIds: (quadrasRes?.data ?? []).map((q: any) => q.id as string),
    predios,
    loadErro: null as string | null
  };
};

function parseIntArray(s: string): number[] {
  return s
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function parseStrArray(s: string): string[] {
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function arranjoFromForm(fd: FormData) {
  const modalidade_id = Number(fd.get('modalidade_id') ?? 0);
  const nome = String(fd.get('nome') ?? '').trim() || null;
  const recorrente = fd.get('recorrente') === 'on' || fd.get('recorrente') === 'true';
  const diaStr = String(fd.get('dia_semana') ?? '').trim();
  const data = String(fd.get('data') ?? '').trim() || null;
  const hi = String(fd.get('hora_inicio') ?? '').trim() || null;
  const hf = String(fd.get('hora_fim') ?? '').trim() || null;
  const local = String(fd.get('local_endereco') ?? '').trim() || null;
  const latStr = String(fd.get('local_lat') ?? '').trim();
  const lngStr = String(fd.get('local_lng') ?? '').trim();
  const dirigente_id = String(fd.get('dirigente_id') ?? '').trim() || null;
  const quadras_csv = String(fd.get('quadras_ids') ?? '').trim();
  const cartas_csv = String(fd.get('cartas_locais_ids') ?? '').trim();
  const arquivo_url = String(fd.get('arquivo_url') ?? '').trim() || null;
  const arquivo_nome = String(fd.get('arquivo_nome') ?? '').trim() || null;
  const notas = String(fd.get('notas') ?? '').trim() || null;
  const data_inicio = String(fd.get('data_inicio') ?? '').trim() || null;
  const data_fim = String(fd.get('data_fim') ?? '').trim() || null;
  const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true' || fd.get('ativo') === null;

  return {
    modalidade_id,
    nome,
    recorrente,
    dia_semana: diaStr === '' ? null : Number(diaStr),
    data: recorrente ? null : data,
    hora_inicio: hi,
    hora_fim: hf,
    local_endereco: local,
    local_lat: latStr === '' ? null : Number(latStr),
    local_lng: lngStr === '' ? null : Number(lngStr),
    dirigente_id,
    quadras_ids: quadras_csv ? parseStrArray(quadras_csv) : null,
    cartas_locais_ids: cartas_csv ? parseIntArray(cartas_csv) : null,
    arquivo_url,
    arquivo_nome,
    notas,
    data_inicio: recorrente ? data_inicio : null,
    data_fim: recorrente ? data_fim : null,
    ativo
  };
}

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
  },

  criarArranjo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const data = arranjoFromForm(fd);
    if (!data.modalidade_id) return fail(400, { erro: 'Modalidade obrigatória' });
    if (data.recorrente && data.dia_semana === null) return fail(400, { erro: 'Recorrente exige dia da semana' });
    if (!data.recorrente && !data.data) return fail(400, { erro: 'Data obrigatória pra arranjo único' });
    // Fallback: se nome vier vazio, usa nome da modalidade (defesa contra NOT NULL legado)
    if (!data.nome) {
      const { data: mod } = await locals.supabase
        .from('arranjo_modalidades').select('nome').eq('id', data.modalidade_id).single();
      data.nome = mod?.nome ?? 'Arranjo';
    }
    const { error } = await locals.supabase.from('arranjos').insert({ ...data, criado_por: locals.user.id });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Arranjo criado' };
  },

  atualizarArranjo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const data = arranjoFromForm(fd);
    if (!data.modalidade_id) return fail(400, { erro: 'Modalidade obrigatória' });
    if (data.recorrente && data.dia_semana === null) return fail(400, { erro: 'Recorrente exige dia da semana' });
    if (!data.recorrente && !data.data) return fail(400, { erro: 'Data obrigatória pra arranjo único' });
    if (!data.nome) {
      const { data: mod } = await locals.supabase
        .from('arranjo_modalidades').select('nome').eq('id', data.modalidade_id).single();
      data.nome = mod?.nome ?? 'Arranjo';
    }
    const { error } = await locals.supabase.from('arranjos').update(data).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Arranjo salvo' };
  },

  // Cria uma cópia pontual de um arranjo recorrente pra uma data específica
  // e adiciona essa data nas exceções da recorrência. Permite editar só
  // aquele dia (mudar dirigente, território, etc) sem afetar os outros.
  materializarOcorrencia: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    const dataIso = String(fd.get('data') ?? '').trim();
    if (!arranjoId || !dataIso) return fail(400, { erro: 'arranjo_id e data obrigatórios' });

    const { data: orig, error: errO } = await locals.supabase
      .from('arranjos').select('*').eq('id', arranjoId).single();
    if (errO || !orig) return fail(400, { erro: 'Arranjo não encontrado' });
    if (!orig.recorrente) return fail(400, { erro: 'Arranjo não é recorrente' });

    // Cria cópia pontual nesta data (sem recorrência)
    const { id: _omit, criado_em, atualizado_em, excecoes_datas, ...resto } = orig as any;
    const { data: novo, error: errN } = await locals.supabase
      .from('arranjos').insert({
        ...resto,
        recorrente: false,
        dia_semana: null,
        data: dataIso,
        data_inicio: null,
        data_fim: null,
        excecoes_datas: [],
        criado_por: locals.user.id
      }).select('id').single();
    if (errN || !novo) return fail(400, { erro: errN?.message ?? 'Falha ao clonar' });

    // Adiciona data nas exceções da recorrência
    const novasExc = Array.from(new Set([...(orig.excecoes_datas ?? []), dataIso])).sort();
    const { error: errU } = await locals.supabase
      .from('arranjos').update({ excecoes_datas: novasExc }).eq('id', arranjoId);
    if (errU) return fail(400, { erro: errU.message });

    return { ok: true, msg: 'Ocorrência personalizada', novoId: novo.id };
  },

  deletarArranjo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('arranjos').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Arranjo removido' };
  },

  uploadArquivo: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const file = fd.get('arquivo') as File | null;
    if (!file || file.size === 0) return fail(400, { erro: 'Arquivo vazio' });
    if (file.size > 10 * 1024 * 1024) return fail(400, { erro: 'Arquivo > 10MB' });
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `arranjo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: errUp } = await locals.supabase.storage
      .from('arranjos')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (errUp) return fail(400, { erro: errUp.message });
    const { data: pub } = locals.supabase.storage.from('arranjos').getPublicUrl(path);
    return { ok: true, url: pub.publicUrl, nome: file.name };
  }
};

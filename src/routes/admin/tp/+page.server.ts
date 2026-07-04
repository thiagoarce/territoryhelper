import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { semanaAtual, DIAS_SEMANA, DIAS_ORDENADOS } from '$lib/arranjos';

export interface TpPonto {
  id: number;
  nome: string;
  endereco: string | null;
  notas: string | null;
  ativo: boolean;
  lat: number | null;
  lng: number | null;
}

export interface TpTurno {
  id: number;
  ponto_id: number;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  vagas: number;
  ativo: boolean;
}

export interface EscalaDoTurno {
  data: string;
  publicador_id: string;
  nome: string;
}

export interface TpCarrinhoTipo {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export interface TpPecaCatalogo {
  id: number;
  tipo_id: number;
  nome: string;
  categoria: 'fisica' | 'literatura';
  publicacao_id: number | null;
  publicacao_nome: string | null;
  ordem: number;
  ativo: boolean;
}

export interface TpCarrinho {
  id: number;
  nome: string;
  tipo_id: number;
  tipo_nome: string;
  guardado_em: string | null;
  custodia_id: string | null;
  custodia_nome: string | null;
  status: 'disponivel' | 'manutencao' | 'aposentado';
  notas: string | null;
}

function exigirAdmin(locals: App.Locals) {
  if (!locals.user) return fail(401, { erro: 'Não autenticado' });
  if (locals.profile?.role !== 'admin') return fail(403, { erro: 'Só admin' });
  return null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const [pontosRes, turnosRes, tiposRes, pecasRes, carrinhosRes, publicadoresRes, publicacoesRes] = await Promise.all([
    locals.supabase.from('tp_pontos_geo').select('id, nome, endereco, notas, ativo, geo_geojson').order('nome'),
    locals.supabase.from('tp_turnos').select('*').order('dia_semana').order('hora_inicio'),
    locals.supabase.from('tp_carrinho_tipos').select('*').order('nome'),
    locals.supabase.from('tp_pecas_catalogo').select('*').order('tipo_id').order('ordem'),
    locals.supabase.from('tp_carrinhos').select('*').order('nome'),
    locals.supabase.from('profiles').select('id, nome').eq('ativo', true).order('nome'),
    locals.supabase.from('publicacoes').select('id, nome').eq('ativo', true).order('nome')
  ]);

  const pontos: TpPonto[] = ((pontosRes.data ?? []) as any[]).map((p) => ({
    id: p.id,
    nome: p.nome,
    endereco: p.endereco,
    notas: p.notas,
    ativo: p.ativo,
    lat: p.geo_geojson?.coordinates?.[1] ?? null,
    lng: p.geo_geojson?.coordinates?.[0] ?? null
  }));

  const turnos = (turnosRes.data ?? []) as TpTurno[];

  // Escala da semana corrente: pra cada turno, a data concreta desta semana
  // + quem já se inscreveu (nome via profiles).
  const sem = semanaAtual();
  const datasPorDiaSemana: Record<number, string> = {};
  {
    const d = new Date(sem.ini);
    for (let i = 0; i < 7; i++) {
      datasPorDiaSemana[d.getDay()] = d.toISOString().slice(0, 10);
      d.setDate(d.getDate() + 1);
    }
  }
  const turnoIds = turnos.map((t) => t.id);
  const escalaPorTurno: Record<number, EscalaDoTurno[]> = {};
  if (turnoIds.length > 0) {
    const { data: escalaRows } = await locals.supabase
      .from('tp_escala')
      .select('turno_id, data, publicador_id')
      .in('turno_id', turnoIds)
      .gte('data', sem.isoIni)
      .lte('data', sem.isoFim);
    const pubIds = Array.from(new Set((escalaRows ?? []).map((r: any) => r.publicador_id)));
    const nomePorId: Record<string, string> = {};
    if (pubIds.length > 0) {
      const { data: profs } = await locals.supabase.from('profiles').select('id, nome').in('id', pubIds);
      for (const p of (profs ?? []) as any[]) nomePorId[p.id] = p.nome;
    }
    for (const r of (escalaRows ?? []) as any[]) {
      (escalaPorTurno[r.turno_id] ||= []).push({
        data: r.data,
        publicador_id: r.publicador_id,
        nome: nomePorId[r.publicador_id] ?? '?'
      });
    }
  }

  // Equipamentos: tipos + peças do catálogo + carrinhos, com nomes
  // resolvidos à mão (tipo/custódia/publicação) — mesmo padrão de
  // nomePorId acima, evita depender de embed de FK em tabela nova.
  const tiposRows = (tiposRes.data ?? []) as TpCarrinhoTipo[];
  const nomeTipoPorId: Record<number, string> = {};
  for (const t of tiposRows) nomeTipoPorId[t.id] = t.nome;

  const publicadores = (publicadoresRes.data ?? []) as { id: string; nome: string }[];
  const nomePublicadorPorId: Record<string, string> = {};
  for (const p of publicadores) nomePublicadorPorId[p.id] = p.nome;

  const publicacoes = (publicacoesRes.data ?? []) as { id: number; nome: string }[];
  const nomePublicacaoPorId: Record<number, string> = {};
  for (const p of publicacoes) nomePublicacaoPorId[p.id] = p.nome;

  const pecas: TpPecaCatalogo[] = ((pecasRes.data ?? []) as any[]).map((p) => ({
    id: p.id,
    tipo_id: p.tipo_id,
    nome: p.nome,
    categoria: p.categoria,
    publicacao_id: p.publicacao_id,
    publicacao_nome: p.publicacao_id ? (nomePublicacaoPorId[p.publicacao_id] ?? null) : null,
    ordem: p.ordem,
    ativo: p.ativo
  }));

  const carrinhos: TpCarrinho[] = ((carrinhosRes.data ?? []) as any[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo_id: c.tipo_id,
    tipo_nome: nomeTipoPorId[c.tipo_id] ?? '?',
    guardado_em: c.guardado_em,
    custodia_id: c.custodia_id,
    custodia_nome: c.custodia_id ? (nomePublicadorPorId[c.custodia_id] ?? null) : null,
    status: c.status,
    notas: c.notas
  }));

  return {
    pontos,
    turnos,
    escalaPorTurno,
    datasPorDiaSemana,
    diasSemana: DIAS_SEMANA,
    diasOrdenados: DIAS_ORDENADOS,
    carrinhoTipos: tiposRows,
    pecasCatalogo: pecas,
    carrinhos,
    publicadores,
    publicacoes
  };
};

export const actions: Actions = {
  criarPonto: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const endereco = String(fd.get('endereco') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const lat = parseFloat(String(fd.get('lat') ?? ''));
    const lng = parseFloat(String(fd.get('lng') ?? ''));
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const geo = isFinite(lat) && isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null;
    const { error } = await locals.supabase.from('tp_pontos').insert({ nome, endereco, notas, geo });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Ponto criado' };
  },

  atualizarPonto: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const nome = String(fd.get('nome') ?? '').trim();
    const endereco = String(fd.get('endereco') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true';
    const lat = parseFloat(String(fd.get('lat') ?? ''));
    const lng = parseFloat(String(fd.get('lng') ?? ''));
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const geo = isFinite(lat) && isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null;
    const { error } = await locals.supabase
      .from('tp_pontos').update({ nome, endereco, notas, ativo, geo }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Ponto atualizado' };
  },

  apagarPonto: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_pontos').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Ponto removido (cascade limpa turnos/escala)' };
  },

  criarTurno: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const pontoId = Number(fd.get('ponto_id') ?? 0);
    const diaSemana = Number(fd.get('dia_semana') ?? -1);
    const horaInicio = String(fd.get('hora_inicio') ?? '').trim();
    const horaFim = String(fd.get('hora_fim') ?? '').trim();
    const vagas = Number(fd.get('vagas') ?? 2) || 2;
    if (!pontoId) return fail(400, { erro: 'ponto_id obrigatório' });
    if (diaSemana < 0 || diaSemana > 6) return fail(400, { erro: 'Dia da semana inválido' });
    if (!horaInicio || !horaFim) return fail(400, { erro: 'Horário obrigatório' });
    if (horaFim <= horaInicio) return fail(400, { erro: 'Hora de fim precisa ser depois da hora de início' });
    const { error } = await locals.supabase.from('tp_turnos').insert({
      ponto_id: pontoId, dia_semana: diaSemana, hora_inicio: horaInicio, hora_fim: horaFim, vagas
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Turno criado' };
  },

  atualizarTurno: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const vagas = Number(fd.get('vagas') ?? 0);
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true';
    if (!vagas || vagas < 1) return fail(400, { erro: 'Vagas deve ser >= 1' });
    const { error } = await locals.supabase.from('tp_turnos').update({ vagas, ativo }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Turno atualizado' };
  },

  apagarTurno: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_turnos').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Turno removido' };
  },

  // ---- Equipamentos (TP-A) ----

  criarTipo: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const { error } = await locals.supabase.from('tp_carrinho_tipos').insert({ nome, descricao });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Tipo criado' };
  },

  atualizarTipo: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const nome = String(fd.get('nome') ?? '').trim();
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true';
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const { error } = await locals.supabase.from('tp_carrinho_tipos').update({ nome, descricao, ativo }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Tipo atualizado' };
  },

  apagarTipo: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_carrinho_tipos').delete().eq('id', id);
    if (error) return fail(400, { erro: 'Tipo tem carrinho(s) vinculado(s) — mude o tipo deles primeiro ou apague-os.' });
    return { ok: true, msg: 'Tipo removido (peças do catálogo somem junto)' };
  },

  criarPeca: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const tipoId = Number(fd.get('tipo_id') ?? 0);
    const nome = String(fd.get('nome') ?? '').trim();
    const categoria = String(fd.get('categoria') ?? '').trim();
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0) || null;
    const ordem = Number(fd.get('ordem') ?? 0) || 0;
    if (!tipoId) return fail(400, { erro: 'tipo_id obrigatório' });
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!['fisica', 'literatura'].includes(categoria)) return fail(400, { erro: 'Categoria inválida' });
    const { error } = await locals.supabase.from('tp_pecas_catalogo').insert({
      tipo_id: tipoId, nome, categoria,
      publicacao_id: categoria === 'literatura' ? publicacaoId : null,
      ordem
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Peça adicionada' };
  },

  atualizarPeca: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const nome = String(fd.get('nome') ?? '').trim();
    const categoria = String(fd.get('categoria') ?? '').trim();
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0) || null;
    const ordem = Number(fd.get('ordem') ?? 0) || 0;
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true';
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!['fisica', 'literatura'].includes(categoria)) return fail(400, { erro: 'Categoria inválida' });
    const { error } = await locals.supabase.from('tp_pecas_catalogo').update({
      nome, categoria,
      publicacao_id: categoria === 'literatura' ? publicacaoId : null,
      ordem, ativo
    }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Peça atualizada' };
  },

  apagarPeca: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_pecas_catalogo').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Peça removida' };
  },

  criarCarrinho: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const tipoId = Number(fd.get('tipo_id') ?? 0);
    const guardadoEm = String(fd.get('guardado_em') ?? '').trim() || null;
    const custodiaId = String(fd.get('custodia_id') ?? '').trim() || null;
    const status = String(fd.get('status') ?? 'disponivel').trim();
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!tipoId) return fail(400, { erro: 'Tipo obrigatório' });
    if (!['disponivel', 'manutencao', 'aposentado'].includes(status)) return fail(400, { erro: 'Status inválido' });
    const { error } = await locals.supabase.from('tp_carrinhos').insert({
      nome, tipo_id: tipoId, guardado_em: guardadoEm, custodia_id: custodiaId, status, notas
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Carrinho criado' };
  },

  atualizarCarrinho: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const nome = String(fd.get('nome') ?? '').trim();
    const tipoId = Number(fd.get('tipo_id') ?? 0);
    const guardadoEm = String(fd.get('guardado_em') ?? '').trim() || null;
    const custodiaId = String(fd.get('custodia_id') ?? '').trim() || null;
    const status = String(fd.get('status') ?? 'disponivel').trim();
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!tipoId) return fail(400, { erro: 'Tipo obrigatório' });
    if (!['disponivel', 'manutencao', 'aposentado'].includes(status)) return fail(400, { erro: 'Status inválido' });
    const { error } = await locals.supabase.from('tp_carrinhos').update({
      nome, tipo_id: tipoId, guardado_em: guardadoEm, custodia_id: custodiaId, status, notas
    }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Carrinho atualizado' };
  },

  apagarCarrinho: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_carrinhos').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Carrinho removido' };
  }
};

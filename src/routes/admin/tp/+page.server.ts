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

function exigirAdmin(locals: App.Locals) {
  if (!locals.user) return fail(401, { erro: 'Não autenticado' });
  if (locals.profile?.role !== 'admin') return fail(403, { erro: 'Só admin' });
  return null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const [pontosRes, turnosRes] = await Promise.all([
    locals.supabase.from('tp_pontos_geo').select('id, nome, endereco, notas, ativo, geo_geojson').order('nome'),
    locals.supabase.from('tp_turnos').select('*').order('dia_semana').order('hora_inicio')
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

  return {
    pontos,
    turnos,
    escalaPorTurno,
    datasPorDiaSemana,
    diasSemana: DIAS_SEMANA,
    diasOrdenados: DIAS_ORDENADOS
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
  }
};

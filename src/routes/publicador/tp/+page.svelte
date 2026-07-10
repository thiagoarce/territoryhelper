<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { postComFila } from '$lib/offline';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { DIAS_SEMANA } from '$lib/arranjos';
  import { hojeIsoLocal } from '$lib/utils/data';
  import { ocorrenciasAgendamentoEntre, ocorrenciaConflitante } from '$lib/tp-agendamentos';
  import TpGradeSemana from '$lib/components/TpGradeSemana.svelte';
  import type { AgendamentoBase, ExcecaoBase } from '$lib/tp-agendamentos';
  import type {
    TpCarrinhoLite, TpPontoLite, TpParticipanteLinha, TpPecaCatalogoLite,
    TpRelatorioLinha, CampanhaPublicacaoLite, TpDisponibilidadeLinha
  } from './$types';

  let { data }: {
    data: {
      minhaId: string;
      tpAgendamentos: AgendamentoBase[];
      tpExcecoes: ExcecaoBase[];
      tpCarrinhos: Record<number, TpCarrinhoLite>;
      tpPontos: Record<number, TpPontoLite>;
      tpParticipantes: TpParticipanteLinha[];
      nomesPorId: Record<string, string>;
      tpPecasCatalogo: TpPecaCatalogoLite[];
      campanhaPublicacao: CampanhaPublicacaoLite | null;
      tpRelatorios: TpRelatorioLinha[];
      tpPreferencias: { transporta_carrinho: boolean; notas: string | null };
      tpDisponibilidade: TpDisponibilidadeLinha[];
      mesAtual: string;
      tpMeses: { mes: string; fase: string }[];
      mesesAlvo: string[];
      dispMes: { id: number; mes: string; dia: string; hora_inicio: string; hora_fim: string }[];
      meuTpAprovado: boolean;
      publicadoresAprovados: { id: string; nome: string }[];
      cacheInfo?: { deCache: boolean; gravadoEm: number };
    };
  } = $props();

  // === Calendário mensal ===
  function isoDate(d: Date): string { return d.toISOString().substring(0, 10); }
  const hojeIso = hojeIsoLocal();

  let mesRef = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  let diaSelecionado = $state<string | null>(null);

  function mudarMes(delta: number) {
    mesRef = new Date(mesRef.getFullYear(), mesRef.getMonth() + delta, 1);
    diaSelecionado = null;
  }

  const mesIniIso = $derived(isoDate(new Date(mesRef.getFullYear(), mesRef.getMonth(), 1)));
  const mesFimIso = $derived(isoDate(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0)));

  const ocAgendamentos = $derived(
    ocorrenciasAgendamentoEntre(data.tpAgendamentos, data.tpExcecoes, mesIniIso, mesFimIso)
  );
  const agendamentosPorData = $derived.by(() => {
    const m: Record<string, typeof ocAgendamentos> = {};
    for (const oc of ocAgendamentos) (m[oc.data] ||= []).push(oc);
    return m;
  });

  // Grade de 42 células (6 semanas), começando no domingo antes/no dia 1
  const celulasCalendario = $derived.by(() => {
    const primeiroDoMes = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
    const inicioGrid = new Date(primeiroDoMes);
    inicioGrid.setDate(primeiroDoMes.getDate() - primeiroDoMes.getDay());
    const celulas: { iso: string; dia: number; noMes: boolean; qtd: number }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicioGrid);
      d.setDate(inicioGrid.getDate() + i);
      const iso = isoDate(d);
      celulas.push({
        iso,
        dia: d.getDate(),
        noMes: d.getMonth() === mesRef.getMonth(),
        qtd: (agendamentosPorData[iso] ?? []).length
      });
    }
    return celulas;
  });

  // Sem dia selecionado, a lista mostra só o que vem pela frente — os dias
  // que já passaram ficam atrás de um toggle (antes era preciso rolar por
  // todo o começo do mês pra achar o próximo turno).
  let mostrarPassados = $state(false);
  const datasParaMostrar = $derived.by(() => {
    if (diaSelecionado) return [diaSelecionado];
    const todas = Object.keys(agendamentosPorData).sort();
    return mostrarPassados ? todas : todas.filter((d) => d >= hojeIso);
  });
  const qtdDiasPassados = $derived(
    diaSelecionado ? 0 : Object.keys(agendamentosPorData).filter((d) => d < hojeIso).length
  );

  const nomeMesExibido = $derived(mesRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));

  const inscritosPorOcorrencia = $derived.by(() => {
    const m: Record<string, { publicador_id: string; nome: string }[]> = {};
    for (const e of data.tpParticipantes) {
      const key = e.agendamento_id + '|' + e.data;
      (m[key] ||= []).push({ publicador_id: e.publicador_id, nome: data.nomesPorId[e.publicador_id] ?? '?' });
    }
    return m;
  });
  const relatorioPorOcorrencia = $derived.by(() => {
    const m: Record<string, TpRelatorioLinha> = {};
    for (const r of data.tpRelatorios) m[r.agendamento_id + '|' + r.data] = r;
    return m;
  });


  // === Sheet relatório de fim de agendamento (TP-D) ===
  interface ItemChecklist {
    pecaId: number | null;
    tipoId: number;
    nome: string;
    categoria: 'fisica' | 'literatura';
    estado: string;
    qtdColocada: string;
    obs: string;
    publicacaoVirtualId: number | null;
    nomeVirtual: string | null;
  }
  let sheetRelatorio = $state(false);
  let relatorioOcAtual = $state<{ agendamento_id: number; data: string } | null>(null);
  let relatorioSomenteLeitura = $state(false);
  let relatorioAutorNome = $state('');
  let itensRelatorio = $state<ItemChecklist[]>([]);
  let notasRelatorio = $state('');
  let enviandoRelatorio = $state(false);

  function abrirRelatorio(oc: { agendamento_id: number; data: string; carrinho_id: number }) {
    const carrinho = data.tpCarrinhos[oc.carrinho_id];
    const tipoId = carrinho?.tipo_id ?? 0;
    const pecas = data.tpPecasCatalogo.filter((p) => p.tipo_id === tipoId);
    const existente = relatorioPorOcorrencia[oc.agendamento_id + '|' + oc.data];

    relatorioSomenteLeitura = !!existente && existente.publicador_id !== data.minhaId;
    relatorioAutorNome = existente ? (data.nomesPorId[existente.publicador_id] ?? '?') : '';
    notasRelatorio = existente?.notas ?? '';

    const itensExistentesPorPeca = new Map((existente?.itens ?? []).map((i) => [i.peca_id, i]));
    itensRelatorio = pecas.map((p) => {
      const ex = itensExistentesPorPeca.get(p.id);
      return {
        pecaId: p.id,
        tipoId,
        nome: p.nome,
        categoria: p.categoria,
        estado: ex?.estado ?? 'ok',
        qtdColocada: ex?.qtd_colocada != null ? String(ex.qtd_colocada) : '',
        obs: ex?.obs ?? '',
        publicacaoVirtualId: null,
        nomeVirtual: null
      };
    });

    const cp = data.campanhaPublicacao;
    if (cp && !pecas.some((p) => p.publicacao_id === cp.publicacao_id)) {
      const exVirtual = (existente?.itens ?? []).find((i) => {
        const p = data.tpPecasCatalogo.find((pc) => pc.id === i.peca_id);
        return p?.publicacao_id === cp.publicacao_id;
      });
      itensRelatorio = [
        ...itensRelatorio,
        {
          pecaId: exVirtual?.peca_id ?? null,
          tipoId,
          nome: cp.nome + ' (campanha)',
          categoria: 'literatura',
          estado: exVirtual?.estado ?? 'ok',
          qtdColocada: exVirtual?.qtd_colocada != null ? String(exVirtual.qtd_colocada) : '',
          obs: exVirtual?.obs ?? '',
          publicacaoVirtualId: exVirtual ? null : cp.publicacao_id,
          nomeVirtual: cp.nome
        }
      ];
    }

    relatorioOcAtual = { agendamento_id: oc.agendamento_id, data: oc.data };
    sheetRelatorio = true;
  }

  async function enviarRelatorio() {
    if (!relatorioOcAtual) return;
    enviandoRelatorio = true;
    const itensPayload = itensRelatorio.map((it) => ({
      peca_id: it.pecaId,
      tipo_id: it.tipoId,
      estado: it.estado,
      qtd_colocada: it.qtdColocada === '' ? null : Number(it.qtdColocada),
      obs: it.obs,
      publicacao_virtual_id: it.publicacaoVirtualId,
      nome_virtual: it.nomeVirtual
    }));
    const fd = new FormData();
    fd.append('agendamento_id', String(relatorioOcAtual.agendamento_id));
    fd.append('data', relatorioOcAtual.data);
    fd.append('notas', notasRelatorio);
    fd.append('itens_json', JSON.stringify(itensPayload));
    const r = await postComFila('?/salvarRelatorio', fd, `Relatório do turno de ${new Date(relatorioOcAtual.data + 'T12:00:00').toLocaleDateString('pt-BR')}`);
    enviandoRelatorio = false;
    if (r.ok) {
      toast.success('Relatório enviado');
      sheetRelatorio = false;
      await invalidateAll();
    } else if (r.offline) {
      toast.info('Sem rede — salvo no aparelho, sincroniza quando o sinal voltar');
      sheetRelatorio = false;
    } else {
      toast.error(r.erro);
    }
  }

  // === Sheet sugerir ponto de TP (TP-E) ===
  let sheetSugerirPonto = $state(false);
  let sugestaoNome = $state('');
  let sugestaoEndereco = $state('');
  let sugestaoLat = $state<number | null>(null);
  let sugestaoLng = $state<number | null>(null);
  let buscandoGPSSugestao = $state(false);
  let enviandoSugestao = $state(false);

  function abrirSugerirPonto() {
    sugestaoNome = '';
    sugestaoEndereco = '';
    sugestaoLat = null;
    sugestaoLng = null;
    sheetSugerirPonto = true;
  }

  function usarMinhaLocalizacaoSugestao() {
    if (!navigator.geolocation) { toast.error('GPS indisponível'); return; }
    buscandoGPSSugestao = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sugestaoLat = pos.coords.latitude;
        sugestaoLng = pos.coords.longitude;
        buscandoGPSSugestao = false;
      },
      () => { toast.error('Falhou pegar GPS'); buscandoGPSSugestao = false; },
      { enableHighAccuracy: true }
    );
  }

  async function enviarSugestaoPonto(e: SubmitEvent) {
    e.preventDefault();
    enviandoSugestao = true;
    const fd = new FormData();
    fd.append('nome', sugestaoNome);
    fd.append('endereco', sugestaoEndereco);
    fd.append('lat', sugestaoLat != null ? String(sugestaoLat) : '');
    fd.append('lng', sugestaoLng != null ? String(sugestaoLng) : '');
    const res = await fetch('?/sugerirPonto', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    enviandoSugestao = false;
    if (parsed.type === 'success') {
      toast.success(String(parsed.data?.msg || 'Enviado'));
      sheetSugerirPonto = false;
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou'));
    }
  }

  // === Disponibilidade (movida de /perfil, agora num modal) ===
  let sheetDisponibilidade = $state(false);
  let salvandoPreferencias = $state(false);
  let adicionandoDisponibilidade = $state(false);
  let removendoId = $state<number | null>(null);
  let novoDia = $state(1);
  let novaHoraInicio = $state('');
  let novaHoraFim = $state('');

  async function removerDisponibilidade(id: number) {
    removendoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/removerDisponibilidade', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    removendoId = null;
    if (parsed.type === 'success') { toast.success('Janela removida'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }


  const nomeMesAtual = $derived(
    new Date(data.mesAtual + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  );

  function fmtMesRotulo(mes: string): string {
    return new Date(mes + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
  const fasePorMes = $derived(new Map(data.tpMeses.map((m) => [m.mes, m.fase])));
  const mesesEmDisponibilidade = $derived(data.mesesAlvo.filter((m) => fasePorMes.get(m) === 'disponibilidade'));

  // ── T26: editor de disponibilidade DO MÊS (mini-calendário) ─────────
  const FAIXAS: [string, string][] = [
    ['08:00', '10:00'], ['10:00', '12:00'], ['14:00', '16:00'], ['16:00', '18:00'], ['18:00', '20:00']
  ];
  let sheetDispMes = $state(false);
  let mesDisp = $state<string>('');
  let diaDispSel = $state<string | null>(null);
  let janelasDia = $state<{ inicio: string; fim: string }[]>([]);
  let salvandoDia = $state(false);
  let preenchendoPadrao = $state(false);
  let horaCustomIni = $state('');
  let horaCustomFim = $state('');

  const janelasPorDia = $derived.by(() => {
    const m: Record<string, { inicio: string; fim: string }[]> = {};
    for (const d of data.dispMes) {
      if (d.mes !== mesDisp) continue;
      (m[d.dia] ??= []).push({ inicio: d.hora_inicio.substring(0, 5), fim: d.hora_fim.substring(0, 5) });
    }
    return m;
  });
  const mesDispVazio = $derived(data.dispMes.filter((d) => d.mes === mesDisp).length === 0);

  const celulasDispMes = $derived.by(() => {
    if (!mesDisp) return [] as { iso: string; dia: number; noMes: boolean; qtd: number }[];
    const [y, m] = mesDisp.split('-').map(Number);
    const primeiro = new Date(y, m - 1, 1);
    const inicioGrid = new Date(primeiro);
    inicioGrid.setDate(primeiro.getDate() - primeiro.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicioGrid);
      d.setDate(inicioGrid.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { iso, dia: d.getDate(), noMes: d.getMonth() === m - 1, qtd: (janelasPorDia[iso] ?? []).length };
    });
  });

  function abrirDispMes(mes: string) {
    mesDisp = mes;
    diaDispSel = null;
    sheetDispMes = true;
  }
  function abrirDiaDisp(iso: string) {
    diaDispSel = iso;
    janelasDia = (janelasPorDia[iso] ?? []).map((j) => ({ ...j }));
    horaCustomIni = '';
    horaCustomFim = '';
  }
  function temJanela(ini: string, fim: string): boolean {
    return janelasDia.some((j) => j.inicio === ini && j.fim === fim);
  }
  function toggleFaixa(ini: string, fim: string) {
    if (temJanela(ini, fim)) janelasDia = janelasDia.filter((j) => !(j.inicio === ini && j.fim === fim));
    else janelasDia = [...janelasDia, { inicio: ini, fim: fim }].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }
  function addJanelaCustom() {
    if (!horaCustomIni || !horaCustomFim || horaCustomFim <= horaCustomIni) {
      toast.error('Horário inválido');
      return;
    }
    if (!temJanela(horaCustomIni, horaCustomFim)) {
      janelasDia = [...janelasDia, { inicio: horaCustomIni, fim: horaCustomFim }].sort((a, b) => a.inicio.localeCompare(b.inicio));
    }
    horaCustomIni = '';
    horaCustomFim = '';
  }
  async function salvarDiaDisp() {
    if (!diaDispSel) return;
    salvandoDia = true;
    const fd = new FormData();
    fd.append('mes', mesDisp);
    fd.append('dia', diaDispSel);
    fd.append('janelas_json', JSON.stringify(janelasDia));
    const res = await fetch('?/salvarDisponibilidadeDia', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    salvandoDia = false;
    if (parsed.type === 'success') { toast.success('Dia salvo'); diaDispSel = null; await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
  async function preencherPadrao() {
    preenchendoPadrao = true;
    const fd = new FormData();
    fd.append('mes', mesDisp);
    const res = await fetch('?/preencherMesDoPadrao', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    preenchendoPadrao = false;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Preenchido')); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // ── T27: grade da semana (leitura) + aceitar/recusar ─────────────────
  let visao = $state<'grade' | 'lista'>('grade');
  let larguraTela = $state(1024);
  function segundaDaSemana(base: Date): Date {
    const d = new Date(base);
    d.setHours(12, 0, 0, 0);
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d;
  }
  let inicioSemana = $state(segundaDaSemana(new Date()));
  let diaGradeSel = $state(hojeIsoLocal());
  function isoDe(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const diasSemanaGrade = $derived(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicioSemana);
      d.setDate(inicioSemana.getDate() + i);
      return isoDe(d);
    })
  );
  const diasGrade = $derived(larguraTela >= 640 ? diasSemanaGrade : [diaGradeSel]);
  function mudarSemana(delta: number) {
    const d = new Date(inicioSemana);
    d.setDate(d.getDate() + delta * 7);
    inicioSemana = d;
    if (larguraTela < 640) diaGradeSel = isoDe(d);
  }
  const ocGrade = $derived(
    ocorrenciasAgendamentoEntre(data.tpAgendamentos, data.tpExcecoes, diasSemanaGrade[0], diasSemanaGrade[6])
  );
  const participantesGrade = $derived.by(() => {
    const m: Record<string, { nome: string }[]> = {};
    for (const p of data.tpParticipantes) {
      (m[p.agendamento_id + '|' + p.data] ??= []).push({ nome: data.nomesPorId[p.publicador_id] ?? '?' });
    }
    return m;
  });

  // Sheet de detalhe do turno (clique num card da grade)
  let sheetTurno = $state(false);
  let turnoSel = $state<(typeof ocGrade)[number] | null>(null);
  let respondendo = $state(false);
  function abrirTurno(oc: (typeof ocGrade)[number]) {
    turnoSel = oc;
    sheetTurno = true;
  }
  const meuStatusTurno = $derived.by(() => {
    if (!turnoSel) return null;
    const p = data.tpParticipantes.find(
      (x) => x.agendamento_id === turnoSel!.agendamento_id && x.data === turnoSel!.data && x.publicador_id === data.minhaId
    );
    return p?.status ?? null;
  });
  async function responder(oc: { agendamento_id: number; data: string }, resposta: 'aceito' | 'recusado') {
    respondendo = true;
    const fd = new FormData();
    fd.append('agendamento_id', String(oc.agendamento_id));
    fd.append('data', oc.data);
    fd.append('resposta', resposta);
    const res = await fetch('?/responderDesignacao', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    respondendo = false;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Ok')); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
  const STATUS_DESIGNACAO: Record<string, { rotulo: string; cls: string }> = {
    designado: { rotulo: 'aguardando resposta', cls: 'bg-amber-100 text-amber-800' },
    aceito: { rotulo: 'aceito', cls: 'bg-green-100 text-green-700' },
    recusado: { rotulo: 'recusou', cls: 'bg-slate-200 text-slate-500' }
  };

  // Agendamento por trás da ocorrência selecionada — pra saber se é uma
  // reserva minha (mostra "Cancelar reserva" no sheet de detalhe).
  const agendamentoDoTurnoSel = $derived(
    turnoSel ? data.tpAgendamentos.find((a) => a.id === turnoSel!.agendamento_id) : null
  );
  let cancelandoReserva = $state(false);
  async function cancelarReserva() {
    if (!agendamentoDoTurnoSel) return;
    if (!confirm('Cancelar essa reserva? Quem foi convidado perde o acesso.')) return;
    cancelandoReserva = true;
    const fd = new FormData();
    fd.append('agendamento_id', String(agendamentoDoTurnoSel.id));
    const res = await fetch('?/cancelarReserva', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    cancelandoReserva = false;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Cancelada')); sheetTurno = false; await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // ── T28: reserva de sobra — tocar numa célula vazia da grade ─────────
  let sheetReserva = $state(false);
  let reservaData = $state('');
  let reservaHoraInicio = $state('');
  let reservaHoraFim = $state('');
  let reservaCarrinhoId = $state<number | null>(null);
  let reservaPontoId = $state<number | null>(null);
  let reservaPontoAvulso = $state('');
  let reservaConvidados = $state<Set<string>>(new Set());
  let criandoReserva = $state(false);

  function mesDaData(iso: string): string { return iso.substring(0, 7); }

  function abrirReserva(dataIso: string, horaInicio: string, horaFim: string) {
    if (!data.meuTpAprovado) {
      toast.error('Você ainda não foi aprovado pro testemunho público — fale com o admin');
      return;
    }
    if (fasePorMes.get(mesDaData(dataIso)) !== 'publicado') {
      toast.error('Reservas só valem depois que o mês for publicado');
      return;
    }
    reservaData = dataIso;
    reservaHoraInicio = horaInicio;
    reservaHoraFim = horaFim;
    reservaCarrinhoId = null;
    reservaPontoId = null;
    reservaPontoAvulso = '';
    reservaConvidados = new Set();
    sheetReserva = true;
  }
  function toggleConvidado(id: string) {
    if (reservaConvidados.has(id)) reservaConvidados.delete(id); else reservaConvidados.add(id);
    reservaConvidados = new Set(reservaConvidados);
  }
  // Carrinhos livres nesse dia/horário — mesma lógica de conflito do admin.
  const carrinhosLivres = $derived.by(() => {
    if (!sheetReserva) return Object.values(data.tpCarrinhos);
    return Object.values(data.tpCarrinhos).filter(
      (c) => !ocorrenciaConflitante(data.tpAgendamentos, data.tpExcecoes, c.id, reservaData, reservaHoraInicio, reservaHoraFim)
    );
  });
  async function confirmarReserva() {
    if (!reservaCarrinhoId) { toast.error('Escolha um equipamento livre'); return; }
    if (!reservaPontoId && !reservaPontoAvulso.trim()) { toast.error('Escolha ou digite um ponto'); return; }
    criandoReserva = true;
    const fd = new FormData();
    fd.append('data', reservaData);
    fd.append('hora_inicio', reservaHoraInicio);
    fd.append('hora_fim', reservaHoraFim);
    fd.append('carrinho_id', String(reservaCarrinhoId));
    if (reservaPontoId) fd.append('ponto_id', String(reservaPontoId));
    else fd.append('ponto_avulso', reservaPontoAvulso.trim());
    for (const pid of reservaConvidados) fd.append('publicador_ids', pid);
    const res = await fetch('?/criarReserva', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    criandoReserva = false;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Reserva criada')); sheetReserva = false; await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
</script>

<svelte:window bind:innerWidth={larguraTela} />

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Testemunho público</h1>
    <p class="text-sm text-slate-500">Agenda mensal — turnos, ponto e sua disponibilidade</p>
    <CacheInfoBadge cacheInfo={data.cacheInfo} />
  </div>

  {#if mesesEmDisponibilidade.length > 0}
    {#each mesesEmDisponibilidade as mes (mes)}
      {@const qtdDias = data.dispMes.filter((d) => d.mes === mes).length}
      <button
        type="button"
        onclick={() => abrirDispMes(mes)}
        class="w-full flex items-center justify-between gap-2 rounded-xl border-2 p-3 text-left transition-colors {qtdDias > 0 ? 'border-green-300 bg-green-50 hover:bg-green-100' : 'border-amber-400 bg-amber-50 hover:bg-amber-100'}"
      >
        <div>
          <div class="text-sm font-semibold {qtdDias > 0 ? 'text-green-900' : 'text-amber-900'}">
            {#if qtdDias > 0}
              <Icon nome="check" size={14} /> Disponível em <span class="capitalize">{fmtMesRotulo(mes)}</span> — {qtdDias} janela(s)
            {:else}
              <Icon nome="alert" size={14} /> Marque seus dias de <span class="capitalize">{fmtMesRotulo(mes)}</span>
            {/if}
          </div>
          <div class="text-xs {qtdDias > 0 ? 'text-green-700' : 'text-amber-700'} mt-0.5">Toque pra escolher dias e horários no calendário</div>
        </div>
        <Icon nome="chevron-right" size={16} class={qtdDias > 0 ? 'text-green-700' : 'text-amber-700'} />
      </button>
    {/each}
  {/if}
  <button type="button" onclick={() => (sheetDisponibilidade = true)} class="text-xs text-slate-500 hover:underline">
    <Icon nome="clock" size={12} /> Meu padrão semanal (pré-preenche os meses)
  </button>

  <button type="button" onclick={abrirSugerirPonto} class="text-xs text-primary-700 hover:underline">
    <Icon nome="map-pin" size={12} /> Sugerir ponto de testemunho público
  </button>

  <div class="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
    {#each [['grade', 'Grade'], ['lista', 'Lista']] as [v, rotulo]}
      <button type="button" onclick={() => (visao = v as any)}
        class="px-3 py-1 text-xs font-medium rounded transition-colors"
        class:bg-white={visao === v} class:shadow-sm={visao === v}
        class:text-slate-900={visao === v} class:text-slate-500={visao !== v}
      >{rotulo}</button>
    {/each}
  </div>

  {#if visao === 'grade'}
    <!-- T27: grade da semana (desktop/paisagem = 7 dias; retrato = 1 dia) -->
    <div class="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <div class="flex items-center justify-between">
        <button type="button" onclick={() => mudarSemana(-1)} aria-label="Semana anterior" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 text-lg">‹</button>
        <div class="text-sm font-semibold">
          {new Date(diasSemanaGrade[0] + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          — {new Date(diasSemanaGrade[6] + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </div>
        <button type="button" onclick={() => mudarSemana(1)} aria-label="Próxima semana" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 text-lg">›</button>
      </div>
      {#if larguraTela < 640}
        <div class="flex gap-1 overflow-x-auto pb-1">
          {#each diasSemanaGrade as d (d)}
            <button type="button" onclick={() => (diaGradeSel = d)}
              class="shrink-0 px-2.5 py-1 rounded-lg text-xs border transition-colors"
              class:bg-primary-600={diaGradeSel === d} class:text-white={diaGradeSel === d} class:border-primary-600={diaGradeSel === d}
              class:border-slate-200={diaGradeSel !== d} class:text-slate-600={diaGradeSel !== d}
            >{new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}</button>
          {/each}
        </div>
      {/if}
      <TpGradeSemana
        dias={diasGrade}
        ocorrencias={ocGrade.filter((o) => diasGrade.includes(o.data))}
        carrinhosPorId={data.tpCarrinhos}
        pontos={data.tpPontos}
        participantesPorOcorrencia={participantesGrade}
        onEditar={abrirTurno}
        onCriar={abrirReserva}
        readonly
      />
      <p class="text-[11px] text-slate-400">Toque num turno pra ver detalhes e responder à designação. Toque num espaço vazio pra reservar um equipamento livre.</p>
    </div>
  {:else}
  <div class="rounded-xl border border-slate-200 bg-white p-3">
    <div class="flex items-center justify-between mb-2">
      <button type="button" onclick={() => mudarMes(-1)} aria-label="Mês anterior" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 text-lg">‹</button>
      <div class="font-semibold capitalize">{nomeMesExibido}</div>
      <button type="button" onclick={() => mudarMes(1)} aria-label="Próximo mês" class="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 text-lg">›</button>
    </div>
    <div class="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400 mb-1">
      {#each DIAS_SEMANA as d}<div>{d}</div>{/each}
    </div>
    <div class="grid grid-cols-7 gap-1">
      {#each celulasCalendario as c (c.iso)}
        <button
          type="button"
          onclick={() => (diaSelecionado = diaSelecionado === c.iso ? null : c.iso)}
          class="aspect-square rounded-lg text-sm flex flex-col items-center justify-center gap-0.5 transition-colors"
          class:text-slate-300={!c.noMes}
          class:text-slate-700={c.noMes && diaSelecionado !== c.iso}
          class:bg-primary-600={diaSelecionado === c.iso}
          class:text-white={diaSelecionado === c.iso}
          class:font-bold={c.iso === hojeIso}
          class:bg-slate-50={diaSelecionado !== c.iso && c.noMes}
          class:hover:bg-slate-100={diaSelecionado !== c.iso}
        >
          <span>{c.dia}</span>
          {#if c.qtd > 0}<span class="w-1 h-1 rounded-full {diaSelecionado === c.iso ? 'bg-white' : 'bg-teal-500'}"></span>{/if}
        </button>
      {/each}
    </div>
    {#if diaSelecionado}
      <button type="button" onclick={() => (diaSelecionado = null)} class="mt-2 text-xs text-primary-700 hover:underline">
        <Icon nome="x" size={12} /> Ver o mês todo
      </button>
    {/if}
  </div>

  {#if ocAgendamentos.length === 0}
    <Card padding="md">
      <div class="text-center py-8">
        <Icon nome="megaphone" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Sem turnos de TP nesse mês</div>
      </div>
    </Card>
  {:else if diaSelecionado && (agendamentosPorData[diaSelecionado] ?? []).length === 0}
    <Card padding="md">
      <div class="text-center py-6">
        <div class="font-medium text-sm text-slate-500">Sem turnos nesse dia</div>
      </div>
    </Card>
  {:else}
    {#if qtdDiasPassados > 0}
      <button type="button" onclick={() => (mostrarPassados = !mostrarPassados)} class="text-xs text-slate-500 hover:underline">
        {mostrarPassados ? 'Esconder dias passados' : `Mostrar ${qtdDiasPassados} dia(s) que já passaram`}
      </button>
    {/if}
    {#if datasParaMostrar.length === 0}
      <Card padding="md">
        <div class="text-center py-6 text-sm text-slate-500">Os turnos desse mês já passaram — toque acima pra revê-los.</div>
      </Card>
    {:else}
    <div class="grid gap-3">
      {#each datasParaMostrar as dataIso}
        <div>
          <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
            {new Date(dataIso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
          <div class="grid gap-2">
            {#each agendamentosPorData[dataIso] ?? [] as oc (oc.agendamento_id + '-' + oc.data)}
              {@const carrinho = oc.carrinho_id ? data.tpCarrinhos[oc.carrinho_id] : null}
              {@const ponto = oc.ponto_id ? data.tpPontos[oc.ponto_id] : null}
              {@const inscritos = inscritosPorOcorrencia[oc.agendamento_id + '|' + oc.data] ?? []}
              {@const souInscrito = inscritos.some((i) => i.publicador_id === data.minhaId)}
              {@const relatorio = relatorioPorOcorrencia[oc.agendamento_id + '|' + oc.data]}
              <Card padding="md">
                <div class="flex items-start gap-3">
                  <span class="w-2 self-stretch rounded shrink-0 bg-teal-500"></span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-semibold">{ponto?.nome ?? oc.ponto_avulso ?? 'Testemunho público'}</span>
                      {#if carrinho}<span class="text-[10px] bg-teal-100 text-teal-700 px-1.5 rounded">{carrinho.nome}</span>{/if}
                    </div>
                    <div class="text-sm text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span><Icon nome="clock" size={14} /> {oc.hora_inicio.substring(0, 5)}–{oc.hora_fim.substring(0, 5)}</span>
                      {#if ponto?.endereco}<span class="truncate"><Icon nome="map-pin" size={14} /> {ponto.endereco}</span>{/if}
                    </div>
                    <div class="mt-1 text-xs text-slate-500">
                      {#if inscritos.length > 0}{inscritos.map((i) => i.nome).join(', ')}{:else}Ninguém inscrito ainda{/if}
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                      {#if souInscrito}
                        {@const meu = data.tpParticipantes.find((x) => x.agendamento_id === oc.agendamento_id && x.data === oc.data && x.publicador_id === data.minhaId)}
                        {#if meu}
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full {STATUS_DESIGNACAO[meu.status].cls}">{STATUS_DESIGNACAO[meu.status].rotulo}</span>
                          {#if meu.status === 'designado' && oc.data >= hojeIso}
                            <Button variant="primary" size="sm" loading={respondendo} onclick={() => responder(oc, 'aceito')}>Aceitar</Button>
                            <Button variant="secondary" size="sm" loading={respondendo} onclick={() => responder(oc, 'recusado')}>Recusar</Button>
                          {/if}
                        {/if}
                      {/if}
                      {#if oc.data <= hojeIso && souInscrito && carrinho}
                        <Button variant="secondary" size="sm" onclick={() => abrirRelatorio(oc)}>
                          <Icon nome="file-text" size={12} /> {relatorio ? 'Ver relatório' : 'Relatório do turno'}
                        </Button>
                      {/if}
                    </div>
                  </div>
                </div>
              </Card>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    {/if}
  {/if}
  {/if}

</div>

<!-- Sheet disponibilidade (movida de /perfil) — botão abre; confirmação mensal fica no topo -->
<BottomSheet bind:open={sheetDisponibilidade} title="Padrão semanal">
  <p class="text-xs text-slate-500 mb-3">Seu horário de costume — usado só pra PRÉ-PREENCHER o calendário de cada mês (o que vale é o que você marca no mês).</p>

  <div class="pb-4 mb-4 border-b border-slate-100">
    <form
      method="POST"
      action="?/salvarPreferenciasTp"
      use:enhance={() => {
        salvandoPreferencias = true;
        return async ({ result, update }) => {
          await update();
          salvandoPreferencias = false;
          if (result.type === 'success') { toast.success('Preferências salvas'); await invalidateAll(); }
          else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
        };
      }}
      class="space-y-2"
    >
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" name="transporta_carrinho" checked={data.tpPreferencias.transporta_carrinho} class="w-4 h-4 rounded" />
        Consigo levar o equipamento até o ponto
      </label>
      <textarea
        name="notas"
        rows="2"
        placeholder="Notas (opcional) — ex: só de carro, só aos sábados de manhã"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >{data.tpPreferencias.notas ?? ''}</textarea>
      <Button variant="primary" type="submit" loading={salvandoPreferencias} class="w-full">Salvar</Button>
    </form>
  </div>

    <div>
      <div class="text-sm font-medium mb-2">Janelas do padrão</div>
      <div class="space-y-1.5 mb-3">
        {#each data.tpDisponibilidade as d (d.id)}
          <div class="flex items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
            <span>{DIAS_SEMANA[d.dia_semana]} · {d.hora_inicio.substring(0, 5)}–{d.hora_fim.substring(0, 5)}</span>
            <button
              type="button"
              disabled={removendoId === d.id}
              onclick={() => removerDisponibilidade(d.id)}
              class="text-red-600 hover:underline shrink-0 disabled:opacity-40"
            ><Icon nome={removendoId === d.id ? 'loader' : 'trash'} size={14} spin={removendoId === d.id} /></button>
          </div>
        {/each}
        {#if data.tpDisponibilidade.length === 0}
          <p class="text-xs text-slate-400">Nenhuma janela cadastrada ainda.</p>
        {/if}
      </div>

      <form
        method="POST"
        action="?/adicionarDisponibilidade"
        use:enhance={() => {
          adicionandoDisponibilidade = true;
          return async ({ result, update }) => {
            await update();
            adicionandoDisponibilidade = false;
            if (result.type === 'success') {
              toast.success('Janela adicionada');
              novaHoraInicio = '';
              novaHoraFim = '';
              await invalidateAll();
            } else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
          };
        }}
        class="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end"
      >
        <div>
          <label for="disp-dia" class="block text-xs text-slate-500 mb-1">Dia</label>
          <select id="disp-dia" name="dia_semana" bind:value={novoDia} class="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
            {#each [1, 2, 3, 4, 5, 6, 0] as dia}
              <option value={dia}>{DIAS_SEMANA[dia]}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="disp-inicio" class="block text-xs text-slate-500 mb-1">Início</label>
          <input id="disp-inicio" name="hora_inicio" type="time" bind:value={novaHoraInicio} required class="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        </div>
        <div>
          <label for="disp-fim" class="block text-xs text-slate-500 mb-1">Fim</label>
          <input id="disp-fim" name="hora_fim" type="time" bind:value={novaHoraFim} required class="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        </div>
        <Button variant="secondary" type="submit" loading={adicionandoDisponibilidade}><Icon nome="plus" size={14} /></Button>
      </form>
    </div>
</BottomSheet>

<!-- T26: calendário de disponibilidade do MÊS -->
<BottomSheet bind:open={sheetDispMes} title="Disponível em {fmtMesRotulo(mesDisp)}">
  {#if !diaDispSel}
    <p class="text-xs text-slate-500 mb-2">Toque num dia pra marcar seus horários. Dias com janela ficam verdes.</p>
    {#if mesDispVazio}
      <Button variant="secondary" size="sm" loading={preenchendoPadrao} onclick={preencherPadrao} class="w-full mb-3">
        <Icon nome="clock" size={14} /> Pré-preencher do padrão semanal
      </Button>
    {/if}
    <div class="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400 mb-1">
      {#each DIAS_SEMANA as d}<div>{d}</div>{/each}
    </div>
    <div class="grid grid-cols-7 gap-1">
      {#each celulasDispMes as c (c.iso)}
        <button
          type="button"
          disabled={!c.noMes}
          onclick={() => abrirDiaDisp(c.iso)}
          class="aspect-square rounded-lg text-sm flex flex-col items-center justify-center gap-0.5 transition-colors disabled:opacity-0"
          class:bg-green-100={c.qtd > 0}
          class:text-green-900={c.qtd > 0}
          class:bg-slate-50={c.qtd === 0}
          class:text-slate-700={c.qtd === 0}
          class:hover:bg-slate-100={c.qtd === 0}
        >
          <span>{c.dia}</span>
          {#if c.qtd > 0}<span class="text-[9px] leading-none text-green-700">{c.qtd}</span>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <button type="button" onclick={() => (diaDispSel = null)} class="text-xs text-primary-700 hover:underline mb-2">← Voltar pro mês</button>
    <div class="font-semibold mb-2 capitalize">{new Date(diaDispSel + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</div>

    <div class="text-xs text-slate-500 mb-1.5">Faixas rápidas (2h):</div>
    <div class="flex flex-wrap gap-1.5 mb-3">
      {#each FAIXAS as [ini, fim]}
        <button type="button" onclick={() => toggleFaixa(ini, fim)}
          class="text-xs px-2.5 py-1.5 rounded-full border transition-colors {temJanela(ini, fim) ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-300 hover:bg-slate-50'}"
        >{ini}–{fim}</button>
      {/each}
    </div>

    <div class="text-xs text-slate-500 mb-1.5">Ou digite o horário exato:</div>
    <div class="flex items-center gap-2 mb-3">
      <input type="time" bind:value={horaCustomIni} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      <span class="text-slate-400">—</span>
      <input type="time" bind:value={horaCustomFim} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      <Button variant="secondary" size="sm" onclick={addJanelaCustom}><Icon nome="plus" size={14} /></Button>
    </div>

    {#if janelasDia.length > 0}
      <div class="space-y-1 mb-3">
        {#each janelasDia as j (j.inicio + j.fim)}
          <div class="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-1.5">
            <span>{j.inicio}–{j.fim}</span>
            <button type="button" onclick={() => (janelasDia = janelasDia.filter((x) => x !== j))} class="text-red-600"><Icon nome="trash" size={14} /></button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-xs text-slate-400 mb-3">Nenhuma janela nesse dia (salvar assim limpa o dia).</p>
    {/if}

    <Button variant="primary" loading={salvandoDia} onclick={salvarDiaDisp} class="w-full">Salvar dia</Button>
  {/if}
</BottomSheet>

<!-- T27: detalhe do turno (clique na grade) -->
<BottomSheet bind:open={sheetTurno} title="Turno de testemunho público">
  {#if turnoSel}
    {@const carrinho = turnoSel.carrinho_id ? data.tpCarrinhos[turnoSel.carrinho_id] : null}
    {@const ponto = turnoSel.ponto_id ? data.tpPontos[turnoSel.ponto_id] : null}
    {@const parts = data.tpParticipantes.filter((x) => x.agendamento_id === turnoSel!.agendamento_id && x.data === turnoSel!.data)}
    <div class="space-y-3">
      <div>
        <div class="font-semibold">{ponto?.nome ?? turnoSel.ponto_avulso ?? 'Testemunho público'}</div>
        <div class="text-sm text-slate-600 mt-0.5">
          {new Date(turnoSel.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
          · {turnoSel.hora_inicio.substring(0, 5)}–{turnoSel.hora_fim.substring(0, 5)}
          {#if carrinho}· {carrinho.nome}{/if}
        </div>
        {#if ponto?.endereco}<div class="text-xs text-slate-500 mt-0.5"><Icon nome="map-pin" size={12} /> {ponto.endereco}</div>{/if}
      </div>

      <div>
        <div class="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">Designados</div>
        {#if parts.length === 0}
          <p class="text-sm text-slate-400">Ninguém designado ainda.</p>
        {:else}
          <div class="space-y-1">
            {#each parts as pt (pt.publicador_id)}
              <div class="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-1.5">
                <span>{data.nomesPorId[pt.publicador_id] ?? '?'}{pt.publicador_id === data.minhaId ? ' (você)' : ''}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full {STATUS_DESIGNACAO[pt.status].cls}">{STATUS_DESIGNACAO[pt.status].rotulo}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      {#if meuStatusTurno === 'designado' && turnoSel.data >= hojeIso}
        <div class="flex gap-2">
          <Button variant="primary" loading={respondendo} onclick={() => responder(turnoSel!, 'aceito')} class="flex-1"><Icon nome="check" size={14} /> Aceitar</Button>
          <Button variant="secondary" loading={respondendo} onclick={() => responder(turnoSel!, 'recusado')} class="flex-1">Recusar</Button>
        </div>
      {:else if meuStatusTurno}
        <p class="text-sm {meuStatusTurno === 'aceito' ? 'text-green-700' : 'text-slate-500'}">
          Sua resposta: {STATUS_DESIGNACAO[meuStatusTurno].rotulo}.
          {#if turnoSel.data >= hojeIso}
            <button type="button" class="text-primary-700 hover:underline ml-1" onclick={() => responder(turnoSel!, meuStatusTurno === 'aceito' ? 'recusado' : 'aceito')}>mudar</button>
          {/if}
        </p>
      {/if}

      {#if turnoSel.data <= hojeIso && meuStatusTurno && turnoSel.carrinho_id}
        <Button variant="secondary" size="sm" onclick={() => { sheetTurno = false; abrirRelatorio(turnoSel!); }} class="w-full">
          <Icon nome="file-text" size={12} /> Relatório do turno
        </Button>
      {/if}

      {#if agendamentoDoTurnoSel?.origem === 'reserva' && agendamentoDoTurnoSel.criado_por === data.minhaId && turnoSel.data >= hojeIso}
        <Button variant="secondary" size="sm" loading={cancelandoReserva} onclick={cancelarReserva} class="w-full text-red-600">
          <Icon nome="x" size={12} /> Cancelar reserva
        </Button>
      {/if}
    </div>
  {/if}
</BottomSheet>

<!-- T28: sheet de reserva (célula vazia da grade) -->
<BottomSheet bind:open={sheetReserva} title="Reservar equipamento">
  <div class="space-y-3">
    <p class="text-xs text-slate-500">
      {new Date(reservaData + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
      · {reservaHoraInicio}–{reservaHoraFim}
    </p>

    <div>
      <span class="block text-sm font-medium mb-1">Equipamento livre nesse horário</span>
      {#if carrinhosLivres.length === 0}
        <p class="text-xs text-red-600">Nenhum equipamento livre nesse horário.</p>
      {:else}
        <div class="flex flex-wrap gap-1.5">
          {#each carrinhosLivres as c (c.id)}
            <button type="button" onclick={() => (reservaCarrinhoId = c.id)}
              class="text-xs px-2 py-1 rounded border transition-colors"
              class:bg-primary-600={reservaCarrinhoId === c.id} class:text-white={reservaCarrinhoId === c.id} class:border-primary-600={reservaCarrinhoId === c.id}
              class:border-slate-300={reservaCarrinhoId !== c.id}
            >{c.nome}</button>
          {/each}
        </div>
      {/if}
    </div>

    <div>
      <label for="reserva-ponto" class="block text-sm font-medium mb-1">Ponto</label>
      <select id="reserva-ponto" bind:value={reservaPontoId} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value={null}>— escolher um ponto cadastrado —</option>
        {#each Object.values(data.tpPontos) as p (p.id)}
          <option value={p.id}>{p.nome}</option>
        {/each}
      </select>
      <p class="text-xs text-slate-400 text-center my-1">ou</p>
      <input bind:value={reservaPontoAvulso} placeholder="Ponto avulso (texto livre)" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div>
      <span class="block text-sm font-medium mb-1">Convidar publicadores aprovados (opcional)</span>
      {#if data.publicadoresAprovados.length === 0}
        <p class="text-xs text-slate-400">Nenhum outro publicador aprovado ainda.</p>
      {:else}
        <div class="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {#each data.publicadoresAprovados as p (p.id)}
            <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={reservaConvidados.has(p.id)} onchange={() => toggleConvidado(p.id)} class="w-4 h-4 rounded" />
              <span class="flex-1">{p.nome}</span>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetReserva = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" loading={criandoReserva} onclick={confirmarReserva} class="flex-1">Reservar</Button>
    </div>
  </div>
</BottomSheet>

<!-- Sheet relatório de fim de agendamento (TP-D) -->
<BottomSheet bind:open={sheetRelatorio} title="Relatório do turno">
  {#if relatorioSomenteLeitura}
    <p class="text-xs text-slate-500 mb-3">Enviado por {relatorioAutorNome} — só quem enviou (ou admin) pode editar.</p>
  {/if}
  <div class="space-y-3">
    {#each itensRelatorio as item, i}
      <div class="rounded-lg border border-slate-200 p-2.5">
        <div class="text-sm font-medium mb-1.5">{item.nome}</div>
        <div class="flex flex-wrap gap-1.5">
          {#each (item.categoria === 'fisica' ? ['ok', 'danificado'] : ['ok', 'acabando', 'zerado']) as opcao}
            <label class="cursor-pointer">
              <input
                type="radio"
                name="estado-{i}"
                value={opcao}
                checked={item.estado === opcao}
                disabled={relatorioSomenteLeitura}
                onchange={() => (itensRelatorio[i].estado = opcao)}
                class="peer sr-only"
              />
              <div class="text-xs px-2.5 py-1 rounded-full border border-slate-300 peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700 peer-disabled:opacity-50">
                {opcao === 'ok' ? 'OK' : opcao === 'acabando' ? 'Acabando' : opcao === 'zerado' ? 'Zerado' : 'Danificado'}
              </div>
            </label>
          {/each}
        </div>
        {#if item.categoria === 'literatura'}
          <input
            type="number"
            min="0"
            placeholder="Qtd colocada"
            value={item.qtdColocada}
            disabled={relatorioSomenteLeitura}
            oninput={(e) => (itensRelatorio[i].qtdColocada = (e.target as HTMLInputElement).value)}
            class="mt-1.5 w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50 disabled:bg-slate-50"
          />
        {/if}
        {#if item.estado !== 'ok'}
          <input
            placeholder="Obs (opcional)"
            value={item.obs}
            disabled={relatorioSomenteLeitura}
            oninput={(e) => (itensRelatorio[i].obs = (e.target as HTMLInputElement).value)}
            class="mt-1.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50 disabled:bg-slate-50"
          />
        {/if}
      </div>
    {/each}
    <div>
      <label for="rel-notas" class="block text-sm font-medium mb-1">Notas gerais</label>
      <textarea
        id="rel-notas"
        rows="2"
        value={notasRelatorio}
        disabled={relatorioSomenteLeitura}
        oninput={(e) => (notasRelatorio = (e.target as HTMLTextAreaElement).value)}
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 disabled:bg-slate-50"
      ></textarea>
    </div>
    {#if !relatorioSomenteLeitura}
      <Button variant="primary" loading={enviandoRelatorio} onclick={enviarRelatorio} class="w-full">Enviar relatório</Button>
    {/if}
  </div>
</BottomSheet>

<!-- Sheet sugerir ponto de TP (TP-E) -->
<BottomSheet bind:open={sheetSugerirPonto} title="Sugerir ponto de TP">
  <form onsubmit={enviarSugestaoPonto} class="space-y-3">
    <p class="text-xs text-slate-500">O admin vai revisar antes do ponto aparecer nos agendamentos.</p>
    <div>
      <label for="sug-nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="sug-nome" bind:value={sugestaoNome} required placeholder="Ex: Praça da minha área" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="sug-endereco" class="block text-sm font-medium mb-1">Endereço</label>
      <input id="sug-endereco" bind:value={sugestaoEndereco} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-medium">Localização</span>
        <button type="button" onclick={usarMinhaLocalizacaoSugestao} disabled={buscandoGPSSugestao} class="text-xs text-primary-700 hover:underline">
          <Icon nome="map-pin" size={12} /> {buscandoGPSSugestao ? 'Buscando...' : 'Usar minha localização'}
        </button>
      </div>
      {#if sugestaoLat != null && sugestaoLng != null}
        <p class="text-xs text-slate-500">{sugestaoLat.toFixed(5)}, {sugestaoLng.toFixed(5)}</p>
      {:else}
        <p class="text-xs text-slate-400">Nenhuma localização marcada ainda.</p>
      {/if}
    </div>
    <Button variant="primary" type="submit" loading={enviandoSugestao} disabled={sugestaoLat == null} class="w-full">Enviar sugestão</Button>
  </form>
</BottomSheet>

<script lang="ts">
  // Grade semanal tipo agenda: colunas = dias, linhas = horário. Clicar/
  // arrastar num espaço vazio cria um agendamento nesse horário; arrastar a
  // borda de cima/baixo de um card ajusta início/fim (chama onAjustarHorario,
  // que grava só a ocorrência clicada — igual ao editar manual). Cores por
  // carrinho, igual à Visão Geral (barra lateral, não texto colorido).
  import Icon from '$lib/ui/Icon.svelte';
  import { DIAS_SEMANA } from '$lib/arranjos';
  import type { OcorrenciaAgendamento } from '$lib/tp-agendamentos';

  interface CarrinhoCor {
    id: number;
    nome: string;
    cor: string;
  }
  interface PontoNome {
    id: number;
    nome: string;
  }
  interface ParticipanteResumo {
    nome: string;
  }

  let {
    dias,
    ocorrencias,
    carrinhosPorId,
    pontos,
    participantesPorOcorrencia,
    onCriar,
    onEditar,
    onAjustarHorario,
    readonly: somenteLeitura = false
  }: {
    dias: string[];
    ocorrencias: OcorrenciaAgendamento[];
    carrinhosPorId: Record<number, CarrinhoCor>;
    pontos: Record<number, PontoNome>;
    participantesPorOcorrencia: Record<string, ParticipanteResumo[]>;
    onCriar?: (dataIso: string, horaInicio: string, horaFim: string) => void;
    onEditar: (oc: OcorrenciaAgendamento) => void;
    onAjustarHorario?: (oc: OcorrenciaAgendamento, horaInicio: string, horaFim: string) => void;
    // Modo publicador: sem arrastar-pra-criar nem ajustar bordas — só
    // clicar num card (onEditar) e, se onCriar existir, tocar num vazio.
    readonly?: boolean;
  } = $props();

  const ALTURA_HORA = 52; // px por hora
  const PASSO_MIN = 15; // snap de arrasto

  function horaParaMinutos(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  }
  function minutosParaHora(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function hojeIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const horaMin = $derived(
    Math.max(0, Math.min(6, ...ocorrencias.map((o) => Math.floor(horaParaMinutos(o.hora_inicio) / 60))))
  );
  const horaMax = $derived(
    Math.min(24, Math.max(21, ...ocorrencias.map((o) => Math.ceil(horaParaMinutos(o.hora_fim) / 60))))
  );
  const horas = $derived(Array.from({ length: horaMax - horaMin + 1 }, (_, i) => horaMin + i));
  const alturaTotal = $derived((horaMax - horaMin) * ALTURA_HORA);

  const ocorrenciasPorDia = $derived.by(() => {
    const m: Record<string, OcorrenciaAgendamento[]> = {};
    for (const o of ocorrencias) (m[o.data] ??= []).push(o);
    return m;
  });

  function layoutDoDia(dia: string) {
    const evs = (ocorrenciasPorDia[dia] ?? [])
      .map((oc) => {
        let ini = horaParaMinutos(oc.hora_inicio);
        let fim = horaParaMinutos(oc.hora_fim);
        if (arrastando && (arrastando.tipo === 'ini' || arrastando.tipo === 'fim') && arrastando.oc === oc) {
          ini = arrastando.inicio;
          fim = arrastando.fim;
        }
        return { oc, ini, fim };
      })
      .sort((a, b) => a.ini - b.ini || a.fim - b.fim);
    const fimPorFaixa: number[] = [];
    const comFaixa = evs.map((e) => {
      let faixa = fimPorFaixa.findIndex((fim) => fim <= e.ini);
      if (faixa === -1) {
        faixa = fimPorFaixa.length;
        fimPorFaixa.push(e.fim);
      } else {
        fimPorFaixa[faixa] = e.fim;
      }
      return { ...e, faixa };
    });
    const totalFaixas = fimPorFaixa.length || 1;
    return comFaixa.map((e) => ({ ...e, totalFaixas }));
  }

  type Arrasto =
    // 'criar-pendente': ainda não sabemos se é um scroll (mobile) ou um
    // drag de criar — decide em `mover` pelo eixo dominante. No touch, a
    // coluna não trava mais o touch-action (ver comentário no markup):
    // um scroll de verdade dispara pointercancel e aborta limpo; só um
    // tap parado (sem scroll) chega a criar-pendente no soltar().
    | { tipo: 'criar-pendente'; dia: string; colIndex: number; startX: number; startY: number; origem: number }
    | { tipo: 'criar'; dia: string; colIndex: number; origem: number; inicio: number; fim: number }
    | { tipo: 'ini' | 'fim'; dia: string; colIndex: number; oc: OcorrenciaAgendamento; inicio: number; fim: number };

  const LIMIAR_EIXO_PX = 8; // px de movimento antes de decidir horizontal vs. vertical

  let colEls: (HTMLDivElement | null)[] = $state([]);
  let arrastando: Arrasto | null = $state(null);
  let recemArrastado = $state(false);

  function minutosDoY(colIndex: number, clientY: number): number {
    const rect = colEls[colIndex]?.getBoundingClientRect();
    if (!rect) return horaMin * 60;
    const bruto = ((clientY - rect.top) / ALTURA_HORA) * 60 + horaMin * 60;
    const clampado = Math.min(horaMax * 60, Math.max(horaMin * 60, bruto));
    return Math.round(clampado / PASSO_MIN) * PASSO_MIN;
  }

  // Não decide ainda se é criar ou rolar a semana (mobile) — só registra o
  // ponto de partida. `mover` decide pelo eixo dominante do gesto.
  function iniciarCriacao(e: PointerEvent, dia: string, colIndex: number) {
    if (somenteLeitura && !onCriar) return;
    if (e.button !== 0 && e.button !== undefined) return;
    const m = minutosDoY(colIndex, e.clientY);
    arrastando = { tipo: 'criar-pendente', dia, colIndex, startX: e.clientX, startY: e.clientY, origem: m };
  }

  function iniciarResize(e: PointerEvent, borda: 'ini' | 'fim', oc: OcorrenciaAgendamento, colIndex: number) {
    if (somenteLeitura) return;
    e.stopPropagation();
    e.preventDefault();
    arrastando = {
      tipo: borda,
      dia: oc.data,
      colIndex,
      oc,
      inicio: horaParaMinutos(oc.hora_inicio),
      fim: horaParaMinutos(oc.hora_fim)
    };
  }

  function mover(e: PointerEvent) {
    if (!arrastando) return;
    if (arrastando.tipo === 'criar-pendente') {
      const dx = e.clientX - arrastando.startX;
      const dy = e.clientY - arrastando.startY;
      if (Math.abs(dx) > LIMIAR_EIXO_PX && Math.abs(dx) >= Math.abs(dy)) {
        // Gesto horizontal — é rolagem da semana (mobile), não criar. Deixa
        // o navegador rolar (touch-action: pan-x na coluna) e aborta.
        arrastando = null;
        return;
      }
      if (Math.abs(dy) < LIMIAR_EIXO_PX) return; // ainda indeciso, espera mais
      e.preventDefault();
      const m = minutosDoY(arrastando.colIndex, e.clientY);
      arrastando = {
        tipo: 'criar',
        dia: arrastando.dia,
        colIndex: arrastando.colIndex,
        origem: arrastando.origem,
        inicio: Math.min(m, arrastando.origem),
        fim: Math.max(m, arrastando.origem)
      };
      return;
    }
    e.preventDefault();
    const m = minutosDoY(arrastando.colIndex, e.clientY);
    if (arrastando.tipo === 'criar') {
      arrastando = { ...arrastando, inicio: Math.min(m, arrastando.origem), fim: Math.max(m, arrastando.origem) };
    } else if (arrastando.tipo === 'ini') {
      arrastando = { ...arrastando, inicio: Math.min(m, arrastando.fim - PASSO_MIN) };
    } else {
      arrastando = { ...arrastando, fim: Math.max(m, arrastando.inicio + PASSO_MIN) };
    }
  }

  // Fim normal do gesto (pointerup) — finaliza criar/ajustar.
  function soltar() {
    if (!arrastando) return;
    const a = arrastando;
    arrastando = null;
    if (a.tipo === 'criar-pendente') {
      // Sem movimento (ou só um tap/click) — cria com duração padrão de 1h.
      const fim = Math.min(horaMax * 60, a.origem + 60);
      onCriar?.(a.dia, minutosParaHora(a.origem), minutosParaHora(fim));
      return;
    }
    if (a.tipo === 'criar') {
      let fim = a.fim;
      if (fim - a.inicio < PASSO_MIN) fim = Math.min(horaMax * 60, a.inicio + 60);
      onCriar?.(a.dia, minutosParaHora(a.inicio), minutosParaHora(fim));
      return;
    }
    recemArrastado = true;
    setTimeout(() => (recemArrastado = false), 50);
    const inicioOriginal = horaParaMinutos(a.oc.hora_inicio);
    const fimOriginal = horaParaMinutos(a.oc.hora_fim);
    if (a.inicio === inicioOriginal && a.fim === fimOriginal) return;
    onAjustarHorario?.(a.oc, minutosParaHora(a.inicio), minutosParaHora(a.fim));
  }

  // Fim ANORMAL do gesto (pointercancel — ex: o navegador assumiu como
  // rolagem nativa). Só aborta, nunca finaliza como se tivesse soltado —
  // senão um swipe horizontal vira uma criação/ajuste espúrio.
  function cancelarGesto() {
    arrastando = null;
  }

  function clicarCard(oc: OcorrenciaAgendamento) {
    if (recemArrastado) return;
    onEditar(oc);
  }

  const agora = $derived.by(() => {
    const hj = hojeIso();
    const idx = dias.indexOf(hj);
    if (idx === -1) return null;
    const d = new Date();
    const min = d.getHours() * 60 + d.getMinutes();
    if (min < horaMin * 60 || min > horaMax * 60) return null;
    return { idx, top: ((min - horaMin * 60) / 60) * ALTURA_HORA };
  });
</script>

<svelte:window onpointermove={mover} onpointerup={soltar} onpointercancel={cancelarGesto} />

<div class="border border-slate-200 rounded-lg overflow-hidden bg-white">
  <!-- Um ÚNICO container rola nos dois eixos — cabeçalho (dias) e coluna de
       horas ficam sticky dentro dele. Antes eram 2 containers de scroll
       horizontal separados (cabeçalho vs. grade), que não se moviam juntos
       e no touch a coluna ficava travada (touch-action:none bloqueava o
       swipe nativo). A coluna do dia (abaixo) TAMBÉM não fixa touch-action
       — tinha "pan-x" (só permitia rolagem horizontal), o que travava a
       rolagem VERTICAL do próprio grid em toda a área dos dias no iPhone
       (só dava pra rolar puxando a faixa estreita das horas à esquerda).
       Sem essa trava, um scroll de verdade cancela o gesto de criar via
       pointercancel (ver `cancelarGesto`) — só um tap parado ainda cria. -->
  <div class="overflow-auto" style="max-height: 62vh">
    <div class="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-20">
      <div class="w-9 shrink-0 sticky left-0 bg-slate-50 z-30"></div>
      {#each dias as dia}
        {@const ehHoje = dia === hojeIso()}
        {@const d = new Date(dia + 'T12:00:00')}
        <div class="flex-1 min-w-[92px] text-center py-1.5">
          <div class="text-[10px] uppercase tracking-wide text-slate-400">{DIAS_SEMANA[d.getDay()]}</div>
          <div
            class="text-xs font-medium mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full"
            class:bg-primary-600={ehHoje}
            class:text-white={ehHoje}
            class:text-slate-700={!ehHoje}
          >{d.getDate()}</div>
        </div>
      {/each}
    </div>

    <div class="flex">
      <div class="w-9 shrink-0 relative sticky left-0 bg-white z-10" style="height: {alturaTotal}px">
        {#each horas as h}
          <div
            class="absolute right-1 -translate-y-1/2 text-[10px] text-slate-400"
            style="top: {(h - horaMin) * ALTURA_HORA}px"
          >{h}h</div>
        {/each}
      </div>

      {#each dias as dia, colIndex}
        <div
          bind:this={colEls[colIndex]}
          class="flex-1 min-w-[92px] relative border-l border-slate-100 select-none"
          style="height: {alturaTotal}px;"
          onpointerdown={(e) => iniciarCriacao(e, dia, colIndex)}
          role="presentation"
        >
        {#each horas as h}
          <div class="absolute left-0 right-0 border-t border-slate-100" style="top: {(h - horaMin) * ALTURA_HORA}px"></div>
        {/each}

        {#if agora && agora.idx === colIndex}
          <div class="absolute left-0 right-0 border-t-2 border-red-500 z-10" style="top: {agora.top}px">
            <div class="w-1.5 h-1.5 rounded-full bg-red-500 -translate-y-1/2 -translate-x-1/2"></div>
          </div>
        {/if}

        {#if arrastando?.tipo === 'criar' && arrastando.dia === dia}
          <div
            class="absolute left-0.5 right-0.5 rounded bg-primary-200/60 border border-primary-400 pointer-events-none z-20"
            style="top: {((arrastando.inicio - horaMin * 60) / 60) * ALTURA_HORA}px; height: {((arrastando.fim - arrastando.inicio) / 60) * ALTURA_HORA}px"
          ></div>
        {/if}

        {#each layoutDoDia(dia) as ev (ev.oc.agendamento_id + '-' + ev.oc.data)}
          {@const carrinho = carrinhosPorId[ev.oc.carrinho_id]}
          {@const cor = carrinho?.cor ?? '#94a3b8'}
          {@const ponto = ev.oc.ponto_id ? pontos[ev.oc.ponto_id] : null}
          {@const participantes = participantesPorOcorrencia[ev.oc.agendamento_id + '|' + ev.oc.data] ?? []}
          {@const largura = 100 / ev.totalFaixas}
          <div
            class="absolute rounded-md text-[10px] overflow-hidden shadow-sm cursor-pointer select-none z-10"
            style="
              top: {Math.max(0, ((ev.ini - horaMin * 60) / 60) * ALTURA_HORA)}px;
              height: {Math.max(28, ((ev.fim - ev.ini) / 60) * ALTURA_HORA)}px;
              left: calc({ev.faixa * largura}% + 1px);
              width: calc({largura}% - 2px);
              background-color: {cor}22;
              border-left: 3px solid {cor};
            "
            role="button"
            tabindex="0"
            onpointerdown={(e) => e.stopPropagation()}
            onclick={() => clicarCard(ev.oc)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clicarCard(ev.oc); }
            }}
          >
            <div class="px-1 py-0.5 leading-tight">
              <div class="font-semibold truncate text-slate-800">{ev.oc.hora_inicio.substring(0, 5)}–{ev.oc.hora_fim.substring(0, 5)}</div>
              <div class="truncate text-slate-600">{ponto?.nome ?? ev.oc.ponto_avulso}</div>
              {#if participantes.length > 0}
                <div class="truncate text-slate-500 flex items-center gap-0.5"><Icon nome="users" size={9} /> {participantes.length}</div>
              {/if}
            </div>
            <div
              class="absolute left-0 right-0 top-0 h-2.5 cursor-ns-resize"
              style="touch-action: none;"
              onpointerdown={(e) => iniciarResize(e, 'ini', ev.oc, colIndex)}
              role="presentation"
            ></div>
            <div
              class="absolute left-0 right-0 bottom-0 h-2.5 cursor-ns-resize"
              style="touch-action: none;"
              onpointerdown={(e) => iniciarResize(e, 'fim', ev.oc, colIndex)}
              role="presentation"
            ></div>
          </div>
        {/each}
      </div>
    {/each}
    </div>
  </div>
</div>

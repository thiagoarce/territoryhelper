<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll, goto } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import TpGradeSemana from '$lib/components/TpGradeSemana.svelte';
  import type { OcorrenciaAgendamento, AgendamentoBase, Recorrencia } from '$lib/tp-agendamentos';
  import type {
    TpCarrinhoLite,
    TpPontoLite,
    TpParticipanteLinha,
    TpDisponibilidadeLinha
  } from './$types';

  let { data }: {
    data: {
      periodo: 'semana' | 'mes';
      range: { isoIni: string; isoFim: string; label: string };
      carrinhos: TpCarrinhoLite[];
      carrinhosSelecionados: number[];
      pontos: Record<number, TpPontoLite>;
      publicadores: { id: string; nome: string }[];
      ocorrencias: OcorrenciaAgendamento[];
      agendamentosDoCarrinho: AgendamentoBase[];
      participantesPorOcorrencia: Record<string, TpParticipanteLinha[]>;
      disponibilidade: TpDisponibilidadeLinha[];
      minhaId: string;
    };
  } = $props();

  const ocPorData = $derived.by(() => {
    const m: Record<string, OcorrenciaAgendamento[]> = {};
    for (const o of data.ocorrencias) (m[o.data] ??= []).push(o);
    return m;
  });
  const datasOrdenadas = $derived(Object.keys(ocPorData).sort());

  function aplicarFiltroCarrinhos(ids: number[]) {
    goto(`?carrinhos=${ids.join(',')}&periodo=${data.periodo}`, { keepFocus: true, noScroll: true });
  }
  function toggleCarrinho(id: number) {
    const atual = new Set(data.carrinhosSelecionados);
    if (atual.has(id)) atual.delete(id);
    else atual.add(id);
    aplicarFiltroCarrinhos([...atual]);
  }
  function alternarTodosCarrinhos() {
    const todosSelecionados = data.carrinhosSelecionados.length === data.carrinhos.length;
    aplicarFiltroCarrinhos(todosSelecionados ? [] : data.carrinhos.map((c) => c.id));
  }
  function mudarPeriodo(p: 'semana' | 'mes') {
    goto(`?carrinhos=${data.carrinhosSelecionados.join(',')}&periodo=${p}`, { keepFocus: true });
  }

  const carrinhosPorId = $derived(Object.fromEntries(data.carrinhos.map((c) => [c.id, c])));

  // Colunas da grade semanal (segunda→domingo), calculadas em data local
  // (evita o bug clássico de UTC virando meia-noite errada — CLAUDE.md).
  const diasDaSemana = $derived.by(() => {
    if (data.periodo !== 'semana') return [] as string[];
    const [y, m, d] = data.range.isoIni.split('-').map(Number);
    const base = new Date(y, m - 1, d, 12);
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(base);
      dt.setDate(base.getDate() + i);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    });
  });

  const RECORRENCIA_LABEL: Record<Recorrencia, string> = {
    nenhuma: 'Não repete',
    diaria: 'Diária',
    semanal: 'Semanal',
    quinzenal: 'Quinzenal',
    mensal: 'Mensal'
  };

  // ---- Sheet agendamento (criar/editar) ----
  interface AgendamentoFormState {
    carrinho_id: number | null;
    ponto_id: number | null;
    ponto_avulso: string;
    data: string;
    hora_inicio: string;
    hora_fim: string;
    recorrencia_fim: string;
    notas: string;
  }

  let sheetAgendamento = $state(false);
  let modoEdicao = $state(false);
  let recorrenteEdit = $state(false);
  let aplicarA = $state<'ocorrencia' | 'serie'>('ocorrencia');
  let recorrenciaAtual = $state<Recorrencia>('nenhuma');
  let usaPontoAvulso = $state(false);
  let agendamentoIdEdit = $state<number | null>(null);
  let ocorrenciaDataEdit = $state<string | null>(null);
  let agendamentoEdit = $state<AgendamentoFormState | null>(null);
  let salvandoAgendamento = $state(false);
  let cancelandoOcorrencia = $state(false);
  let processandoSerie = $state(false);

  function novoAgendamento() {
    modoEdicao = false;
    agendamentoIdEdit = null;
    ocorrenciaDataEdit = null;
    aplicarA = 'serie';
    recorrenteEdit = false;
    recorrenciaAtual = 'nenhuma';
    usaPontoAvulso = false;
    agendamentoEdit = {
      carrinho_id:
        data.carrinhosSelecionados.length === 1 ? data.carrinhosSelecionados[0] : (data.carrinhos[0]?.id ?? null),
      ponto_id: null,
      ponto_avulso: '',
      data: '',
      hora_inicio: '',
      hora_fim: '',
      recorrencia_fim: '',
      notas: ''
    };
    sheetAgendamento = true;
  }

  // Clicar/arrastar um horário vazio na grade — mesmo fluxo de novoAgendamento,
  // só pré-preenchendo data/hora do arrasto.
  function criarNoHorario(dataIso: string, horaInicio: string, horaFim: string) {
    novoAgendamento();
    agendamentoEdit = { ...agendamentoEdit!, data: dataIso, hora_inicio: horaInicio, hora_fim: horaFim };
  }

  // Arrastar a borda de um card na grade — ajusta só essa ocorrência
  // (mesma semântica de aplicar_a='ocorrencia' do sheet de editar).
  async function ajustarHorario(oc: OcorrenciaAgendamento, horaInicio: string, horaFim: string) {
    const fd = new FormData();
    fd.append('agendamento_id', String(oc.agendamento_id));
    fd.append('ocorrencia_data', oc.data);
    fd.append('aplicar_a', 'ocorrencia');
    fd.append('carrinho_id', String(oc.carrinho_id));
    if (oc.ponto_id) fd.append('ponto_id', String(oc.ponto_id));
    else fd.append('ponto_avulso', oc.ponto_avulso ?? '');
    fd.append('hora_inicio', horaInicio);
    fd.append('hora_fim', horaFim);
    fd.append('notas', oc.notas ?? '');
    const res = await fetch('?/atualizarAgendamento', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success') await invalidateAll();
    else toast.error(String(parsed.data?.erro || 'Não deu pra ajustar o horário'));
  }

  function editarOcorrencia(oc: OcorrenciaAgendamento) {
    const base = data.agendamentosDoCarrinho.find((a) => a.id === oc.agendamento_id) ?? null;
    modoEdicao = true;
    agendamentoIdEdit = oc.agendamento_id;
    ocorrenciaDataEdit = oc.data;
    recorrenteEdit = (base?.recorrencia ?? 'nenhuma') !== 'nenhuma';
    aplicarA = 'ocorrencia';
    recorrenciaAtual = base?.recorrencia ?? 'nenhuma';
    usaPontoAvulso = !oc.ponto_id;
    agendamentoEdit = {
      carrinho_id: oc.carrinho_id,
      ponto_id: oc.ponto_id,
      ponto_avulso: oc.ponto_avulso ?? '',
      data: base?.data ?? oc.data,
      hora_inicio: oc.hora_inicio.substring(0, 5),
      hora_fim: oc.hora_fim.substring(0, 5),
      recorrencia_fim: base?.recorrencia_fim ?? '',
      notas: oc.notas ?? ''
    };
    sheetAgendamento = true;
  }

  async function cancelarOcorrencia() {
    if (!agendamentoIdEdit || !ocorrenciaDataEdit) return;
    if (!confirm('Cancelar só essa ocorrência? O resto da série continua.')) return;
    cancelandoOcorrencia = true;
    const fd = new FormData();
    fd.append('agendamento_id', String(agendamentoIdEdit));
    fd.append('data', ocorrenciaDataEdit);
    const res = await fetch('?/cancelarOcorrencia', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    cancelandoOcorrencia = false;
    if (parsed.type === 'success') { toast.success('Cancelada'); sheetAgendamento = false; await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function arquivarSerie() {
    if (!agendamentoIdEdit) return;
    if (!confirm('Arquivar toda a série? Some do planner, mas o histórico fica.')) return;
    processandoSerie = true;
    const fd = new FormData();
    fd.append('id', String(agendamentoIdEdit));
    const res = await fetch('?/arquivarAgendamento', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    processandoSerie = false;
    if (parsed.type === 'success') { toast.success('Arquivada'); sheetAgendamento = false; await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function apagarDefinitivo() {
    if (!agendamentoIdEdit) return;
    if (!confirm('Excluir a série de vez? Não dá pra desfazer.')) return;
    processandoSerie = true;
    const fd = new FormData();
    fd.append('id', String(agendamentoIdEdit));
    const res = await fetch('?/apagarAgendamentoDefinitivo', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    processandoSerie = false;
    if (parsed.type === 'success') { toast.success('Excluída'); sheetAgendamento = false; await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // ---- Sheet designar ----
  let sheetDesignar = $state(false);
  let designarAgendamentoId = $state<number | null>(null);
  let designarData = $state<string | null>(null);
  let designarDiaSemana = $state<number | null>(null);
  let designarHoraInicio = $state<string | null>(null);
  let designarHoraFim = $state<string | null>(null);
  let designandoId = $state<string | null>(null);
  let removendoId = $state<string | null>(null);

  function abrirDesignar(oc: OcorrenciaAgendamento) {
    designarAgendamentoId = oc.agendamento_id;
    designarData = oc.data;
    designarDiaSemana = new Date(oc.data + 'T12:00:00').getDay();
    designarHoraInicio = oc.hora_inicio;
    designarHoraFim = oc.hora_fim;
    sheetDesignar = true;
  }

  function ehCompativel(publicadorId: string): boolean {
    if (designarDiaSemana === null || !designarHoraInicio || !designarHoraFim) return false;
    return data.disponibilidade.some(
      (d) =>
        d.publicador_id === publicadorId &&
        d.dia_semana === designarDiaSemana &&
        d.hora_inicio <= designarHoraInicio! &&
        d.hora_fim >= designarHoraFim!
    );
  }

  async function designar(publicadorId: string) {
    if (!designarAgendamentoId || !designarData) return;
    designandoId = publicadorId;
    const fd = new FormData();
    fd.append('agendamento_id', String(designarAgendamentoId));
    fd.append('data', designarData);
    fd.append('publicador_id', publicadorId);
    const res = await fetch('?/designarParticipante', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    designandoId = null;
    if (parsed.type === 'success') { toast.success('Designado'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function removerParticipante(publicadorId: string) {
    if (!designarAgendamentoId || !designarData) return;
    removendoId = publicadorId;
    const fd = new FormData();
    fd.append('agendamento_id', String(designarAgendamentoId));
    fd.append('data', designarData);
    fd.append('publicador_id', publicadorId);
    const res = await fetch('?/removerParticipante', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    removendoId = null;
    if (parsed.type === 'success') { toast.success('Removido'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  const participantesDoSheet = $derived.by(() => {
    if (!designarAgendamentoId || !designarData) return [] as TpParticipanteLinha[];
    return data.participantesPorOcorrencia[designarAgendamentoId + '|' + designarData] ?? [];
  });
</script>

<div class="p-4 space-y-3 pb-10">
  <div class="flex items-center justify-between flex-wrap gap-2">
    <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
      {#each [['semana', 'Semana'], ['mes', 'Mês']] as [p, label]}
        <button
          type="button"
          onclick={() => mudarPeriodo(p as 'semana' | 'mes')}
          class="px-3 py-1 text-xs font-medium rounded transition-colors"
          class:bg-white={data.periodo === p}
          class:shadow-sm={data.periodo === p}
          class:text-slate-900={data.periodo === p}
          class:text-slate-500={data.periodo !== p}
        >{label}</button>
      {/each}
    </div>
    <Button variant="primary" size="sm" onclick={novoAgendamento} disabled={data.carrinhos.length === 0}>
      <Icon nome="plus" size={14} /> Agendamento
    </Button>
  </div>

  <div class="flex gap-2 overflow-x-auto pb-1">
    <button
      type="button"
      onclick={alternarTodosCarrinhos}
      class="shrink-0 text-xs rounded-full px-3 py-1.5 border transition-colors"
      class:border-primary-500={data.carrinhosSelecionados.length === data.carrinhos.length}
      class:bg-primary-50={data.carrinhosSelecionados.length === data.carrinhos.length}
      class:border-slate-200={data.carrinhosSelecionados.length !== data.carrinhos.length}
    >Todos</button>
    {#each data.carrinhos as c (c.id)}
      {@const ativo = data.carrinhosSelecionados.includes(c.id)}
      <button
        type="button"
        onclick={() => toggleCarrinho(c.id)}
        class="shrink-0 inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border transition-colors"
        class:border-primary-500={ativo}
        class:bg-primary-50={ativo}
        class:border-slate-200={!ativo}
        class:opacity-50={!ativo}
      >
        <span class="w-2 h-2 rounded-full shrink-0" style="background-color: {c.cor}"></span>
        {c.nome}
      </button>
    {/each}
    {#if data.carrinhos.length === 0}
      <span class="text-xs text-slate-400">Nenhum equipamento cadastrado — crie um em Equipamentos.</span>
    {/if}
  </div>

  {#if data.carrinhos.length === 0}
    <Card padding="md">
      <div class="text-center py-8">
        <Icon nome="calendar" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Nenhum equipamento cadastrado</div>
        <div class="text-sm text-slate-500">Crie um em Equipamentos pra começar a agendar.</div>
      </div>
    </Card>
  {:else if data.periodo === 'semana'}
    <TpGradeSemana
      dias={diasDaSemana}
      ocorrencias={data.ocorrencias}
      {carrinhosPorId}
      pontos={data.pontos}
      participantesPorOcorrencia={data.participantesPorOcorrencia}
      onCriar={criarNoHorario}
      onEditar={editarOcorrencia}
      onAjustarHorario={ajustarHorario}
    />
  {:else if datasOrdenadas.length === 0}
    <Card padding="md">
      <div class="text-center py-8">
        <Icon nome="calendar" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Nenhum agendamento nesse período</div>
        <div class="text-sm text-slate-500">Crie um agendamento pra esse equipamento.</div>
      </div>
    </Card>
  {:else}
    <div class="grid gap-3">
      {#each datasOrdenadas as dataIso}
        <div>
          <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
            {new Date(dataIso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
          <div class="grid gap-2">
            {#each ocPorData[dataIso] as oc (oc.agendamento_id + '-' + oc.data)}
              {@const ponto = oc.ponto_id ? data.pontos[oc.ponto_id] : null}
              {@const carrinho = carrinhosPorId[oc.carrinho_id]}
              {@const participantes = data.participantesPorOcorrencia[oc.agendamento_id + '|' + oc.data] ?? []}
              <Card padding="md">
                <div class="flex items-start gap-3">
                  <span class="w-2 self-stretch rounded shrink-0" style="background-color: {carrinho?.cor ?? '#94a3b8'}"></span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium">{carrinho?.nome ?? 'Equipamento'}</div>
                    <div class="text-sm text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span><Icon nome="clock" size={14} /> {oc.hora_inicio.substring(0, 5)}–{oc.hora_fim.substring(0, 5)}</span>
                      <span class="truncate"><Icon nome="map-pin" size={14} /> {ponto?.nome ?? oc.ponto_avulso}</span>
                    </div>
                    <div class="mt-1.5 flex flex-wrap gap-1">
                      {#each participantes as p}
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full {p.origem === 'designacao' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'}">
                          {p.nome}{#if p.origem === 'designacao'} · designado{/if}
                        </span>
                      {/each}
                      {#if participantes.length === 0}
                        <span class="text-xs text-slate-400">Ninguém ainda</span>
                      {/if}
                    </div>
                    {#if oc.notas}<div class="text-xs italic text-slate-500 mt-1">{oc.notas}</div>{/if}
                  </div>
                  <div class="flex flex-col gap-1.5 shrink-0 items-end">
                    <button onclick={() => abrirDesignar(oc)} class="text-xs text-primary-700 hover:underline whitespace-nowrap"><Icon nome="users" size={12} /> Designar</button>
                    <button onclick={() => editarOcorrencia(oc)} class="text-xs text-slate-500 hover:underline whitespace-nowrap"><Icon nome="pencil" size={12} /> Editar</button>
                  </div>
                </div>
              </Card>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Sheet agendamento -->
<BottomSheet bind:open={sheetAgendamento} title={modoEdicao ? 'Editar agendamento' : 'Novo agendamento'}>
  <form
    method="POST"
    action={modoEdicao ? '?/atualizarAgendamento' : '?/criarAgendamento'}
    use:enhance={() => {
      salvandoAgendamento = true;
      return async ({ result, update }) => {
        await update();
        salvandoAgendamento = false;
        if (result.type === 'success') { toast.success('Salvo'); sheetAgendamento = false; await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      };
    }}
    class="space-y-3"
  >
    {#if modoEdicao}
      <input type="hidden" name="agendamento_id" value={agendamentoIdEdit} />
      <input type="hidden" name="ocorrencia_data" value={ocorrenciaDataEdit} />
      {#if recorrenteEdit}
        <div>
          <span class="block text-sm font-medium mb-1">Aplicar a</span>
          <div class="grid grid-cols-2 gap-1">
            <label class="cursor-pointer">
              <input type="radio" name="aplicar_a" value="ocorrencia" checked={aplicarA === 'ocorrencia'} onchange={() => (aplicarA = 'ocorrencia')} class="peer sr-only" />
              <div class="text-center text-sm px-3 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">Só esta ocorrência</div>
            </label>
            <label class="cursor-pointer">
              <input type="radio" name="aplicar_a" value="serie" checked={aplicarA === 'serie'} onchange={() => (aplicarA = 'serie')} class="peer sr-only" />
              <div class="text-center text-sm px-3 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">Toda a série</div>
            </label>
          </div>
        </div>
      {:else}
        <input type="hidden" name="aplicar_a" value="serie" />
      {/if}
    {/if}

    <div>
      <label for="ag-carrinho" class="block text-sm font-medium mb-1">Equipamento</label>
      <select id="ag-carrinho" name="carrinho_id" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        {#each data.carrinhos as c}
          <option value={c.id} selected={agendamentoEdit?.carrinho_id === c.id}>{c.nome}</option>
        {/each}
      </select>
    </div>

    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-medium">Ponto</span>
        <label class="flex items-center gap-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={usaPontoAvulso}
            onchange={(e) => (usaPontoAvulso = (e.target as HTMLInputElement).checked)}
            class="w-3.5 h-3.5 rounded"
          /> Avulso (digitar na hora)
        </label>
      </div>
      {#if usaPontoAvulso}
        <input name="ponto_avulso" value={agendamentoEdit?.ponto_avulso ?? ''} required placeholder="Ex: Feira da praça, em frente ao mercado" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {:else}
        <select name="ponto_id" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">— selecione —</option>
          {#each Object.values(data.pontos) as p}
            <option value={p.id} selected={agendamentoEdit?.ponto_id === p.id}>{p.nome}</option>
          {/each}
        </select>
      {/if}
    </div>

    {#if !modoEdicao || aplicarA === 'serie'}
      <div>
        <label for="ag-data" class="block text-sm font-medium mb-1">Data{modoEdicao ? ' (primeira ocorrência da série)' : ''}</label>
        <input id="ag-data" name="data" type="date" value={agendamentoEdit?.data ?? ''} required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
    {/if}

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="ag-hora-inicio" class="block text-sm font-medium mb-1">Início</label>
        <input id="ag-hora-inicio" name="hora_inicio" type="time" value={agendamentoEdit?.hora_inicio ?? ''} required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label for="ag-hora-fim" class="block text-sm font-medium mb-1">Fim</label>
        <input id="ag-hora-fim" name="hora_fim" type="time" value={agendamentoEdit?.hora_fim ?? ''} required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
    </div>

    {#if !modoEdicao || aplicarA === 'serie'}
      <div>
        <label for="ag-recorrencia" class="block text-sm font-medium mb-1">Recorrência</label>
        <select
          id="ag-recorrencia"
          name="recorrencia"
          onchange={(e) => (recorrenciaAtual = (e.target as HTMLSelectElement).value as Recorrencia)}
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {#each Object.entries(RECORRENCIA_LABEL) as [v, label]}
            <option value={v} selected={recorrenciaAtual === v}>{label}</option>
          {/each}
        </select>
        {#if recorrenciaAtual === 'mensal'}
          <p class="text-xs text-slate-400 mt-1">Repete no mesmo dia do mês. Meses sem esse dia (ex: dia 31 em abril) não geram ocorrência naquele mês.</p>
        {/if}
      </div>
      {#if recorrenciaAtual !== 'nenhuma'}
        <div>
          <label for="ag-recorrencia-fim" class="block text-sm font-medium mb-1">Repetir até (opcional)</label>
          <input id="ag-recorrencia-fim" name="recorrencia_fim" type="date" value={agendamentoEdit?.recorrencia_fim ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      {/if}
    {/if}

    <div>
      <label for="ag-notas" class="block text-sm font-medium mb-1">Notas</label>
      <textarea id="ag-notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{agendamentoEdit?.notas ?? ''}</textarea>
    </div>

    <Button variant="primary" type="submit" loading={salvandoAgendamento} class="w-full">Salvar</Button>
  </form>

  {#if modoEdicao}
    <div class="mt-4 pt-4 border-t border-slate-100 space-y-2">
      <Button variant="secondary" loading={cancelandoOcorrencia} onclick={cancelarOcorrencia} class="w-full text-amber-700">Cancelar esta ocorrência</Button>
      {#if aplicarA === 'serie'}
        <Button variant="secondary" loading={processandoSerie} onclick={arquivarSerie} class="w-full text-slate-600">Arquivar toda a série</Button>
        <Button variant="secondary" loading={processandoSerie} onclick={apagarDefinitivo} class="w-full text-red-600">Excluir de vez</Button>
      {/if}
    </div>
  {/if}
</BottomSheet>

<!-- Sheet designar -->
<BottomSheet bind:open={sheetDesignar} title="Designar publicador">
  <div class="space-y-1">
    {#each data.publicadores as p (p.id)}
      {@const jaEsta = participantesDoSheet.some((x) => x.publicador_id === p.id)}
      {@const compativel = ehCompativel(p.id)}
      <div class="flex items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
        <span class="flex items-center gap-2 min-w-0">
          <span class="truncate">{p.nome}</span>
          {#if compativel}<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 shrink-0">disponível</span>{/if}
        </span>
        {#if jaEsta}
          <button
            disabled={removendoId === p.id}
            onclick={() => removerParticipante(p.id)}
            class="text-xs text-red-600 hover:underline shrink-0 disabled:opacity-40"
          ><Icon nome={removendoId === p.id ? 'loader' : 'x'} size={12} spin={removendoId === p.id} /> Remover</button>
        {:else}
          <button
            disabled={designandoId === p.id}
            onclick={() => designar(p.id)}
            class="text-xs text-primary-700 hover:underline shrink-0 disabled:opacity-40"
          ><Icon nome={designandoId === p.id ? 'loader' : 'plus'} size={12} spin={designandoId === p.id} /> Designar</button>
        {/if}
      </div>
    {/each}
    {#if data.publicadores.length === 0}
      <p class="text-xs text-slate-400 text-center py-4">Nenhum publicador cadastrado.</p>
    {/if}
  </div>
</BottomSheet>

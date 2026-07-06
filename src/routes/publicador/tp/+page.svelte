<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { DIAS_SEMANA } from '$lib/arranjos';
  import { hojeIsoLocal } from '$lib/utils/data';
  import { ocorrenciasAgendamentoEntre } from '$lib/tp-agendamentos';
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
      disponibilidadeConfirmada: boolean;
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

  const datasParaMostrar = $derived(
    diaSelecionado ? [diaSelecionado] : Object.keys(agendamentosPorData).sort()
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

  let acaoEmCurso = $state<string | null>(null);
  function isBusy(key: string): boolean {
    return acaoEmCurso === key;
  }

  async function inscreverAgendamento(agendamentoId: number, dataOc: string) {
    const key = `agendamento:${agendamentoId}:${dataOc}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('agendamento_id', String(agendamentoId));
    fd.append('data', dataOc);
    const res = await fetch('?/inscreverAgendamento', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success') { toast.success('Inscrito'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function sairAgendamento(agendamentoId: number, dataOc: string) {
    const key = `agendamento:${agendamentoId}:${dataOc}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('agendamento_id', String(agendamentoId));
    fd.append('data', dataOc);
    const res = await fetch('?/sairAgendamento', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success') { toast.success('Saiu do agendamento'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

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
    const res = await fetch('?/salvarRelatorio', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    enviandoRelatorio = false;
    if (parsed.type === 'success') {
      toast.success('Relatório enviado');
      sheetRelatorio = false;
      await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou'));
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
  let confirmandoMes = $state(false);
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

  async function confirmarDisponibilidadeMes() {
    confirmandoMes = true;
    const res = await fetch('?/confirmarDisponibilidadeMes', { method: 'POST', body: new FormData() });
    const parsed = deserialize(await res.text()) as any;
    confirmandoMes = false;
    if (parsed.type === 'success') { toast.success('Disponibilidade confirmada'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  const nomeMesAtual = $derived(
    new Date(data.mesAtual + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  );
</script>

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Testemunho público</h1>
    <p class="text-sm text-slate-500">Agenda mensal — turnos, ponto e sua disponibilidade</p>
  </div>

  <button
    type="button"
    onclick={() => (sheetDisponibilidade = true)}
    class="w-full flex items-center justify-between gap-2 rounded-xl border-2 p-3 text-left transition-colors {data.disponibilidadeConfirmada ? 'border-green-300 bg-green-50 hover:bg-green-100' : 'border-amber-400 bg-amber-50 hover:bg-amber-100'}"
  >
    <div>
      <div class="text-sm font-semibold {data.disponibilidadeConfirmada ? 'text-green-900' : 'text-amber-900'}">
        {#if data.disponibilidadeConfirmada}
          <Icon nome="check" size={14} /> Disponibilidade de <span class="capitalize">{nomeMesAtual}</span> confirmada
        {:else}
          <Icon nome="alert" size={14} /> Confirmar disponibilidade de <span class="capitalize">{nomeMesAtual}</span>
        {/if}
      </div>
      <div class="text-xs {data.disponibilidadeConfirmada ? 'text-green-700' : 'text-amber-700'} mt-0.5">Toque pra revisar seus horários</div>
    </div>
    <Icon nome="chevron-right" size={16} class={data.disponibilidadeConfirmada ? 'text-green-700' : 'text-amber-700'} />
  </button>

  <button type="button" onclick={abrirSugerirPonto} class="text-xs text-primary-700 hover:underline">
    <Icon nome="map-pin" size={12} /> Sugerir ponto de testemunho público
  </button>

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
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      {#if souInscrito}
                        <Button variant="secondary" size="sm" loading={isBusy(`agendamento:${oc.agendamento_id}:${oc.data}`)} onclick={() => sairAgendamento(oc.agendamento_id, oc.data)}>Sair do agendamento</Button>
                      {:else}
                        <Button variant="primary" size="sm" loading={isBusy(`agendamento:${oc.agendamento_id}:${oc.data}`)} onclick={() => inscreverAgendamento(oc.agendamento_id, oc.data)}><Icon nome="hand" size={12} /> Me inscrever</Button>
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

</div>

<!-- Sheet disponibilidade (movida de /perfil) — botão abre; confirmação mensal fica no topo -->
<BottomSheet bind:open={sheetDisponibilidade} title="Sua disponibilidade">
  <p class="text-xs text-slate-500 mb-3">Ajuda o admin a te escalar num horário que funciona pra você.</p>

  <Button variant="primary" loading={confirmandoMes} onclick={confirmarDisponibilidadeMes} class="w-full mb-4">
    <Icon nome="check" size={14} /> Confirmar disponibilidade de <span class="capitalize ml-1">{nomeMesAtual}</span>
  </Button>

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
      <div class="text-sm font-medium mb-2">Horários que costumo estar disponível</div>
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

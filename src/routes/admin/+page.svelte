<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaAdmin from '$lib/components/MapaAdmin.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo, DesignacaoEnriquecida } from '$lib/queries';
  import type { TceComQuadras, TerritoriosStatus } from './+page';
  import { diasDesde } from '$lib/utils/data';
  import { statusCampanha } from '$lib/campanhas';

  let {
    data,
    form
  }: {
    data: {
      quadras: QuadraGeo[];
      designacoesAbertas: DesignacaoEnriquecida[];
      publicadores: { id: string; nome: string; role: string }[];
      quadrasAlocadas: string[];
      arranjosQuadras: { id: number; nome: string | null; modalidade_nome: string; modalidade_cor: string; data: string | null; dia_semana: number | null; recorrente: boolean; quadras_ids: string[] | null; hora_inicio: string | null }[];
      arranjoPorQuadra: Record<string, { id: number; nome: string; modalidade_nome: string; modalidade_cor: string; data: string | null }>;
      campanhaAtiva: { id: number; nome: string; data_inicio: string; data_alvo: string; ativa: boolean } | null;
      campanhaPlanejada: { id: number; nome: string; data_inicio: string; data_alvo: string; ativa: boolean } | null;
      reservadasIds: string[];
      curadoriaPendente: { total: number; edicao: number; criacao: number; nao_existe: number };
      tces: TceComQuadras[];
      territoriosStatus: TerritoriosStatus;
      profile?: import('$lib/types').Profile | null;
      cacheInfo?: { deCache: boolean; gravadoEm: number };
    };
    form: any;
  } = $props();

  // Estado
  let colorirPor = $state<'conclusao' | 'territorio' | 'densidade_enderecos' | 'densidade_residencias' | 'campanha'>('conclusao');
  let mostrarRotulos = $state(true);
  let selecionadas = $state<Set<string>>(new Set());
  let busca = $state('');
  // Painel de números (quadras ativas/designadas/... + territórios) fica
  // colapsado por padrão no mobile — o mapa é a tela principal, o resumo
  // detalhado é consulta ocasional, não precisa competir por espaço.
  let statsAbertas = $state(false);

  // Filtro "quadras feitas da campanha": só faz sentido com campanha JÁ EM
  // ANDAMENTO (planejada ainda não teve chance de concluir nada). Calculado
  // no cliente a partir de `data.quadras` (já carregada) — sem query nova.
  const campanhaEmAndamento = $derived(
    data.campanhaAtiva && statusCampanha(data.campanhaAtiva) === 'em_andamento' ? data.campanhaAtiva : null
  );
  const concluidasNaCampanha = $derived(
    campanhaEmAndamento
      ? data.quadras.filter((q) => q.data_conclusao && q.data_conclusao >= campanhaEmAndamento.data_inicio).map((q) => q.id)
      : []
  );

  // A21-f1: filtro "TCEs" — esconde o resto e mostra só as quadras que
  // contêm unidades de algum TCE (representação por quadras-contêiner,
  // sem convex hull cortando quadra). Clicar num TCE no painel restringe
  // pra só as quadras dele.
  let modoTce = $state(false);
  let tceSelecionado = $state<string | null>(null);
  const STATUS_TCE_LABEL: Record<string, string> = { aberto: 'Aberto', concluido: 'Concluído', cancelado: 'Cancelado' };
  const quadrasTceFiltro = $derived.by(() => {
    if (tceSelecionado) return new Set(data.tces.find((t) => t.id === tceSelecionado)?.quadras_ids ?? []);
    const s = new Set<string>();
    for (const t of data.tces) for (const q of t.quadras_ids) s.add(q);
    return s;
  });
  const quadrasFiltradasTce = $derived(data.quadras.filter((q) => quadrasTceFiltro.has(q.id)));
  let salvando = $state(false);

  // Concluir quadra (fundido de /admin/registro)
  let dataConclusao = $state(new Date().toISOString().substring(0, 10));
  let horaConclusao = $state(new Date().toTimeString().slice(0, 5));
  let salvandoConclusao = $state(false);
  let conflito = $state<{ ids: string[]; data: string; hora: string; ultimas: { id: string; ultima: string }[] } | null>(null);
  let sheetDetalheQuadra = $state(false);
  let quadraDetalhe = $state<QuadraGeo | null>(null);
  let historicoQuadra = $state<{ data_conclusao: string; marcado_em: string; nome: string | null }[]>([]);
  // Lados da quadra (migration 092): o servo de território recebe a
  // informação de boca ("fizemos só o lado da Rua X") e precisa lançar.
  let ladosQuadra = $state<{ chave: string; rotulo: string; localIds: number[]; feitoEm: string | null }[]>([]);
  let carregandoLados = $state(false);
  let salvandoLado = $state<string | null>(null);

  async function carregarLados(quadraId: string) {
    carregandoLados = true;
    ladosQuadra = [];
    try {
      const fd = new FormData();
      fd.append('id', quadraId);
      const res = await fetch('?/ladosDaQuadra', { method: 'POST', body: fd });
      const parsed = deserialize(await res.text()) as any;
      if (parsed.type === 'success') ladosQuadra = parsed.data?.lados ?? [];
    } finally {
      carregandoLados = false;
    }
  }

  async function marcarLadoAdmin(chave: string, rotulo: string, desfazer = false) {
    if (!quadraDetalhe) return;
    salvandoLado = chave;
    const fd = new FormData();
    fd.append('quadra_id', quadraDetalhe.id);
    fd.append('lado_chave', chave);
    fd.append('lado_rotulo', rotulo);
    if (!desfazer) {
      fd.append('data', dataConclusao);
      fd.append('hora', horaConclusao);
    }
    const res = await fetch(desfazer ? '?/desfazerLadoAdmin' : '?/concluirLadoAdmin', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    salvandoLado = null;
    if (parsed.type === 'success') {
      toast.success(String(parsed.data?.msg ?? 'Feito'));
      await carregarLados(quadraDetalhe.id);
      if (parsed.data?.quadraConcluida) await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro ?? 'Falhou'));
    }
  }
  let carregandoHistorico = $state(false);

  async function onLongPressQuadra(q: QuadraGeo) {
    quadraDetalhe = q;
    historicoQuadra = [];
    sheetDetalheQuadra = true;
    carregandoHistorico = true;
    carregarLados(q.id); // em paralelo com o histórico
    try {
      const fd = new FormData();
      fd.append('id', q.id);
      const res = await fetch('?/historico', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success' && result.data?.historico) {
        historicoQuadra = result.data.historico.map((h: any) => ({
          data_conclusao: h.data_conclusao,
          marcado_em: h.marcado_em,
          nome: h.profiles?.nome ?? null
        }));
      }
    } finally {
      carregandoHistorico = false;
    }
  }

  async function reSubmeterConclusao(modo: 'substituir' | 'historico') {
    if (!conflito) return;
    salvandoConclusao = true;
    try {
      const fd = new FormData();
      for (const id of conflito.ids) fd.append('ids', id);
      fd.append('data', conflito.data);
      fd.append('hora', conflito.hora);
      fd.append('modo', modo);
      const res = await fetch('?/marcarConcluidas', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success') {
        toast.success(modo === 'substituir' ? 'Substituída' : 'Adicionada ao histórico');
        conflito = null;
        limparSelecao();
        await invalidateAll();
      } else {
        toast.error('Falhou');
      }
    } finally {
      salvandoConclusao = false;
    }
  }

  // Sheets
  let sheetDesignar = $state(false);

  // TCE vira uma unidade selecionável igual quadra: checkbox por card,
  // barra de ações em massa (Designar / Anexar a arranjo), sem precisar
  // clicar nas quadras-contêiner no mapa.
  let tcesSelecionados = $state<Set<string>>(new Set());
  function toggleTceSelecionado(id: string) {
    if (tcesSelecionados.has(id)) tcesSelecionados.delete(id);
    else tcesSelecionados.add(id);
    tcesSelecionados = new Set(tcesSelecionados);
  }
  function limparSelecaoTce() { tcesSelecionados = new Set(); }
  let sheetArranjoTce = $state(false);
  let modoAnexarTce = $state<'somar' | 'substituir'>('somar');
  let salvandoAnexarTce = $state(false);

  // Estado do form de designar
  let publicadoresSel = $state<Set<string>>(new Set());

  // Adicionar quadras a um arranjo
  let sheetArranjo = $state(false);
  let modoAnexar = $state<'somar' | 'substituir'>('somar');
  let salvandoAnexar = $state(false);

  // Quais das selecionadas estão em algum arranjo (pra exibir botão Liberar)
  const selEmArranjo = $derived(
    [...selecionadas].filter((qid) => data.arranjoPorQuadra?.[qid])
  );

  // Quais das selecionadas já estão reservadas pra alguma campanha
  const reservadasSet = $derived(new Set(data.reservadasIds));
  const selReservadas = $derived([...selecionadas].filter((qid) => reservadasSet.has(qid)));
  let salvandoReserva = $state(false);

  async function liberarQuadrasIds(ids: string[]) {
    const fd = new FormData();
    for (const qid of ids) fd.append('quadras_ids', qid);
    const res = await fetch('?/liberarQuadrasDeArranjos', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text());
    if (parsed.type === 'success') {
      toast.success(String((parsed.data as any)?.msg || 'Liberadas'));
      await invalidateAll();
    } else if (parsed.type === 'failure') {
      toast.error(String((parsed.data as any)?.erro || 'Falhou'));
    }
  }

  async function liberarDeArranjo() {
    if (selEmArranjo.length === 0) return;
    if (!confirm(`Liberar ${selEmArranjo.length} quadra(s) do(s) arranjo(s)? A trava some — a quadra fica livre pra novo uso.`)) return;
    await liberarQuadrasIds(selEmArranjo);
    selecionadas = new Set();
  }

  async function reservarParaCampanha() {
    if (!data.campanhaPlanejada || selecionadas.size === 0) return;
    salvandoReserva = true;
    const fd = new FormData();
    fd.append('campanha_id', String(data.campanhaPlanejada.id));
    for (const qid of selecionadas) fd.append('quadras_ids', qid);
    const res = await fetch('?/reservarQuadras', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text());
    salvandoReserva = false;
    if (parsed.type === 'success') {
      toast.success(String((parsed.data as any)?.msg || 'Reservadas'));
      selecionadas = new Set();
      await invalidateAll();
    } else if (parsed.type === 'failure') {
      toast.error(String((parsed.data as any)?.erro || 'Falhou'));
    }
  }

  async function liberarReserva() {
    if (selReservadas.length === 0) return;
    if (!confirm(`Liberar a reserva de ${selReservadas.length} quadra(s)?`)) return;
    salvandoReserva = true;
    const fd = new FormData();
    for (const qid of selReservadas) fd.append('quadras_ids', qid);
    const res = await fetch('?/liberarReservaQuadras', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text());
    salvandoReserva = false;
    if (parsed.type === 'success') {
      toast.success(String((parsed.data as any)?.msg || 'Liberadas'));
      selecionadas = new Set();
      await invalidateAll();
    } else if (parsed.type === 'failure') {
      toast.error(String((parsed.data as any)?.erro || 'Falhou'));
    }
  }

  function onClickQuadra(q: QuadraGeo, multi: boolean) {
    if (!q.ativa) {
      toast.info(`Quadra ${q.id} está inativa — edita em Polígonos pra reativar`);
      return;
    }
    const arr = data.arranjoPorQuadra?.[q.id];
    if (arr && !selecionadas.has(q.id)) {
      const dataPretty = arr.data ? new Date(arr.data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
      toast.info(`Quadra ${q.id} está em arranjo "${arr.nome}"${dataPretty ? ' (' + dataPretty + ')' : ''}`);
    }
    if (selecionadas.has(q.id)) selecionadas.delete(q.id);
    else selecionadas.add(q.id);
    selecionadas = new Set(selecionadas);
  }

  function limparSelecao() { selecionadas = new Set(); }

  function togglePub(id: string) {
    if (publicadoresSel.has(id)) publicadoresSel.delete(id);
    else publicadoresSel.add(id);
    publicadoresSel = new Set(publicadoresSel);
  }

  const stats = $derived.by(() => {
    const total = data.quadras.length;
    const inativas = data.quadras.filter((q) => !q.ativa).length;
    return { total, ativas: total - inativas, alocadas: data.quadrasAlocadas.length, abertas: data.designacoesAbertas.length };
  });
</script>

<div class="p-4 space-y-3">
  <CacheInfoBadge cacheInfo={data.cacheInfo} />
  <!-- Toolbar topo: select flexível + 2 toggles compactos, tudo numa linha
       só (mobile não pode gastar uma linha inteira num único checkbox). -->
  <div class="flex items-center gap-1.5">
    <select bind:value={colorirPor} disabled={modoTce} class="flex-1 min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50">
      <option value="conclusao">Conclusão</option>
      <option value="territorio">Território</option>
      <option value="densidade_enderecos">Densidade (endereços)</option>
      <option value="densidade_residencias">Densidade (residências)</option>
      {#if campanhaEmAndamento}<option value="campanha">Campanha "{campanhaEmAndamento.nome}"</option>{/if}
    </select>

    <button
      type="button"
      onclick={() => { modoTce = !modoTce; tceSelecionado = null; limparSelecaoTce(); }}
      class="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium rounded-lg border shrink-0"
      class:bg-orange-100={modoTce}
      class:border-orange-300={modoTce}
      class:text-orange-800={modoTce}
      class:border-slate-300={!modoTce}
      aria-pressed={modoTce}
    >
      <Icon nome="store" size={14} />
      {#if data.tces.length > 0}<span class="text-[10px] px-1 rounded-full bg-orange-200 text-orange-800">{data.tces.length}</span>{/if}
    </button>

    <button
      type="button"
      onclick={() => (mostrarRotulos = !mostrarRotulos)}
      class="flex items-center justify-center w-9 h-9 rounded-lg border shrink-0"
      class:bg-primary-100={mostrarRotulos}
      class:border-primary-300={mostrarRotulos}
      class:text-primary-700={mostrarRotulos}
      class:border-slate-300={!mostrarRotulos}
      aria-pressed={mostrarRotulos}
      aria-label="Mostrar rótulos das quadras no mapa"
      title="Rótulos"
    >
      <Icon nome="tag" size={14} />
    </button>
  </div>

  <!-- Resumo de números: colapsado por padrão (mapa é a estrela da tela;
       o detalhe fica a 1 toque, não empurrando o mapa pra fora da tela). -->
  <button
    type="button"
    onclick={() => (statsAbertas = !statsAbertas)}
    class="w-full flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
    aria-expanded={statsAbertas}
  >
    <span class="text-slate-600">
      <strong class="text-slate-900">{stats.ativas}</strong> quadras ·
      <strong class="text-blue-700">{stats.alocadas}</strong> designadas ·
      <strong class={stats.abertas > 0 ? 'text-amber-700' : 'text-slate-900'}>{stats.abertas}</strong> abertas ·
      <strong class="text-green-700">{data.territoriosStatus.concluido}</strong>/<strong class="text-amber-700">{data.territoriosStatus.iniciado}</strong>/<strong>{data.territoriosStatus.pendente}</strong> territ.
    </span>
    <Icon nome={statsAbertas ? 'chevron-up' : 'chevron-down'} size={14} class="text-slate-400 shrink-0" />
  </button>

  {#if statsAbertas}
    <!-- Stats compactos -->
    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-lg bg-slate-50 p-2">
        <div class="text-lg font-bold">{stats.ativas}</div>
        <div class="text-[10px] text-slate-500 uppercase">quadras ativas</div>
      </div>
      <div class="rounded-lg bg-blue-50 p-2">
        <div class="text-lg font-bold text-blue-700">{stats.alocadas}</div>
        <div class="text-[10px] text-slate-500 uppercase">quadras designadas</div>
      </div>
      <div class="rounded-lg p-2 {stats.abertas > 0 ? 'bg-amber-50' : 'bg-slate-50'}">
        <div class="text-lg font-bold {stats.abertas > 0 ? 'text-amber-700' : ''}">{stats.abertas}</div>
        <div class="text-[10px] text-slate-500 uppercase">designações abertas</div>
      </div>
    </div>

    <!-- Status por território: "concluídas: N quadras" sozinho não dizia
         nada — o que importa é o estado do ciclo do território (S-13). -->
    <div class="grid grid-cols-3 gap-2 text-center">
      <div class="rounded-lg bg-slate-50 p-2">
        <div class="text-lg font-bold">{data.territoriosStatus.pendente}</div>
        <div class="text-[10px] text-slate-500 uppercase">territ. pendentes</div>
      </div>
      <div class="rounded-lg bg-amber-50 p-2">
        <div class="text-lg font-bold text-amber-700">{data.territoriosStatus.iniciado}</div>
        <div class="text-[10px] text-slate-500 uppercase">territ. iniciados</div>
      </div>
      <div class="rounded-lg bg-green-50 p-2">
        <div class="text-lg font-bold text-green-700">{data.territoriosStatus.concluido}</div>
        <div class="text-[10px] text-slate-500 uppercase">territ. concluídos</div>
      </div>
    </div>
  {/if}

  {#if modoTce}
    <div class="grid gap-3 md:grid-cols-[2fr_1fr]">
      <div>
        {#if quadrasFiltradasTce.length === 0}
          <div class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
            <Icon nome="store" size={32} class="mx-auto mb-2 text-slate-300" />
            {data.tces.length === 0 ? 'Nenhum TCE cadastrado ainda.' : 'Nenhuma quadra vinculada a esse TCE (unidades sem quadra).'}
          </div>
        {:else}
          <MapaAdmin
            quadras={quadrasFiltradasTce}
            altura={520}
            colorirPor="territorio"
            mostrarRotulos={true}
            bind:selecionadas
            basemap={data.profile?.pref_basemap ?? 'bright'}
            onClick={onClickQuadra}
          />
          <p class="text-xs text-slate-400 text-center mt-1">
            Quadras que contêm ao menos 1 unidade do TCE {tceSelecionado ? `"${data.tces.find((t) => t.id === tceSelecionado)?.nome}"` : 'selecionado'}.
          </p>
        {/if}
      </div>
      <div class="space-y-1.5 max-h-[520px] overflow-y-auto">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-1">TCEs ({data.tces.length})</div>
        {#if tceSelecionado}
          <button onclick={() => (tceSelecionado = null)} class="text-xs text-primary-700 hover:underline mb-1">← Ver todos</button>
        {/if}
        {#each data.tces as t (t.id)}
          <div
            role="button"
            tabindex="0"
            onclick={() => (tceSelecionado = tceSelecionado === t.id ? null : t.id)}
            onkeydown={(e) => { if (e.key === 'Enter') tceSelecionado = tceSelecionado === t.id ? null : t.id; }}
            class="w-full text-left rounded-lg border p-2 text-sm hover:bg-slate-50 cursor-pointer"
            class:border-orange-400={tceSelecionado === t.id}
            class:bg-orange-50={tceSelecionado === t.id}
            class:border-slate-200={tceSelecionado !== t.id}
          >
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tcesSelecionados.has(t.id)}
                onclick={(e) => e.stopPropagation()}
                onchange={() => toggleTceSelecionado(t.id)}
                class="w-4 h-4 rounded shrink-0"
              />
              <div class="font-medium truncate flex-1 min-w-0">{t.nome}</div>
            </div>
            <div class="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
              <span class="px-1.5 py-0.5 rounded-full bg-slate-100">{STATUS_TCE_LABEL[t.status] ?? t.status}</span>
              {#if t.publicador_nome}<span><Icon nome="user" size={11} /> {t.publicador_nome}</span>{/if}
              {#if t.prazo}<span><Icon nome="calendar" size={11} /> {new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</span>{/if}
              <span>{t.quadras_ids.length} quadra(s)</span>
            </div>
          </div>
        {:else}
          <p class="text-xs text-slate-400">Nenhum TCE cadastrado — crie em Polígonos → TCE.</p>
        {/each}
      </div>
    </div>
  {:else}
    {#if colorirPor === 'conclusao'}
      <div class="flex items-center gap-3 text-xs flex-wrap">
        <span class="font-medium text-slate-600">Conclusão:</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-amber-500/60"></span>a fazer</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-green-500/60"></span>&lt;15d</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-yellow-400/60"></span>&lt;30d</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-orange-500/60"></span>&lt;60d</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-red-600/60"></span>&gt;90d</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-slate-400/30"></span>inativa</span>
      </div>
    {:else if colorirPor === 'campanha' && campanhaEmAndamento}
      <div class="flex items-center gap-3 text-xs flex-wrap">
        <span class="font-medium text-slate-600">Campanha "{campanhaEmAndamento.nome}":</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-green-700/75"></span>feita na campanha ({concluidasNaCampanha.length})</span>
        <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-slate-400/35"></span>resto</span>
      </div>
    {/if}

    <!-- Mapa -->
    <MapaAdmin
      quadras={data.quadras}
      altura={520}
      {colorirPor}
      {mostrarRotulos}
      quadrasAlocadas={data.quadrasAlocadas}
      reservadasIds={data.reservadasIds}
      concluidasCampanha={concluidasNaCampanha}
      bind:selecionadas
      basemap={data.profile?.pref_basemap ?? 'bright'}
      onClick={onClickQuadra}
      onLongPress={onLongPressQuadra}
    />
    {#if data.reservadasIds.length > 0}
      <p class="text-xs text-purple-700 text-center -mt-2">
        <Icon nome="hourglass" size={12} /> Contorno tracejado roxo = reservada pra "{data.campanhaAtiva?.nome}"
      </p>
    {/if}
    <p class="text-xs text-slate-400 text-center">Long-press numa quadra abre histórico de conclusões.</p>
  {/if}

  <p class="text-xs text-slate-500 text-center">
    {#if selecionadas.size === 0}
      Clique nas quadras pra selecionar. Long-press abre detalhes.
    {:else}
      <strong>{selecionadas.size}</strong> selecionada(s) — use a barra inferior pra agir
    {/if}
  </p>

  {#if data.curadoriaPendente.total > 0}
    <a
      href="/admin/poligonos?modo=curadoria"
      class="flex items-center justify-between gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 hover:bg-amber-100 transition-colors"
    >
      <span class="text-sm font-medium text-amber-900">
        <Icon nome="alert" size={14} /> Feedback do campo — {data.curadoriaPendente.total} pendente(s)
        <span class="text-xs text-amber-700 font-normal">
          ({data.curadoriaPendente.edicao} edição(ões) · {data.curadoriaPendente.criacao} inserção(ões) · {data.curadoriaPendente.nao_existe} "não existe")
        </span>
      </span>
      <Icon nome="chevron-right" size={16} class="text-amber-700" />
    </a>
  {/if}
</div>

<!-- Barra inferior de ações em massa — TCEs selecionados (checkbox nos cards) -->
{#if modoTce && tcesSelecionados.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex flex-col gap-2">
    <div class="flex items-center gap-1 overflow-x-auto pb-1">
      <span class="text-xs font-medium text-slate-500 whitespace-nowrap mr-1">{tcesSelecionados.size}:</span>
      {#each [...tcesSelecionados] as tid}
        <span class="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded whitespace-nowrap">{data.tces.find((t) => t.id === tid)?.nome ?? tid}</span>
      {/each}
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <div class="text-sm font-medium">
        <strong>{tcesSelecionados.size}</strong> TCE(s) selecionado(s)
      </div>
      <div class="flex gap-2 ml-auto flex-wrap justify-end">
        <Button variant="primary" size="sm" onclick={() => (sheetDesignar = true)}><Icon nome="share" size={14} /> Designar</Button>
        <Button variant="secondary" size="sm" onclick={() => (sheetArranjoTce = true)}><Icon nome="calendar" size={14} /> Anexar a arranjo</Button>
        <Button variant="secondary" size="sm" onclick={limparSelecaoTce}>Limpar</Button>
      </div>
    </div>
  </div>
{/if}

<!-- Barra inferior de ações em massa -->
{#if selecionadas.size > 0 && !modoTce}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex flex-col gap-2">
    <!-- Linha 1: chips com IDs (scroll horizontal se muitas) -->
    <div class="flex items-center gap-1 overflow-x-auto pb-1">
      <span class="text-xs font-medium text-slate-500 whitespace-nowrap mr-1">{selecionadas.size}:</span>
      {#each [...selecionadas] as qid}
        <span class="text-[10px] font-mono bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded whitespace-nowrap">{qid}</span>
      {/each}
    </div>
    <!-- Linha 2: ações -->
    <div class="flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium">
      <strong>{selecionadas.size}</strong> quadra(s) selecionada(s)
    </div>
    <div class="flex gap-2 ml-auto flex-wrap justify-end">
      <Button variant="primary" size="sm" onclick={() => (sheetDesignar = true)}><Icon nome="share" size={14} /> Designar</Button>
      <Button variant="secondary" size="sm" onclick={() => (sheetArranjo = true)}><Icon nome="calendar" size={14} /> Anexar a arranjo</Button>
      {#if selEmArranjo.length > 0}
        <Button variant="secondary" size="sm" onclick={liberarDeArranjo} class="text-amber-700"><Icon nome="unlock" size={14} /> Liberar de arranjo ({selEmArranjo.length})</Button>
      {/if}
      {#if data.campanhaPlanejada}
        <Button variant="secondary" size="sm" loading={salvandoReserva} onclick={reservarParaCampanha} class="text-purple-700">
          <Icon nome="hourglass" size={14} /> Reservar p/ {data.campanhaPlanejada.nome}
        </Button>
      {/if}
      {#if selReservadas.length > 0}
        <Button variant="secondary" size="sm" loading={salvandoReserva} onclick={liberarReserva} class="text-purple-700">
          <Icon nome="unlock" size={14} /> Liberar reserva ({selReservadas.length})
        </Button>
      {/if}
      <Button variant="secondary" size="sm" onclick={limparSelecao}>Limpar</Button>
    </div>
    </div>
    <!-- Linha 3: concluir/reverter/limpar histórico (fundido de Registro) -->
    <div class="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
      <form
        method="POST"
        action="?/marcarConcluidas"
        use:enhance={() => {
          salvandoConclusao = true;
          return async ({ result, update }) => {
            await update();
            salvandoConclusao = false;
            if (result.type === 'success') {
              const d = result.data as any;
              if (d?.conflito) {
                conflito = { ids: d.ids, data: d.data, hora: horaConclusao, ultimas: d.ultimas };
                return;
              }
              toast.success(d?.msg || 'Concluídas');
              limparSelecao();
              await invalidateAll();
              const restantes = (d?.quadrasRestantesEmArranjo ?? []) as string[];
              if (restantes.length > 0 && confirm(
                `Esse arranjo ainda tem ${restantes.length} quadra(s) não concluída(s) (${restantes.join(', ')}). Liberar essas quadras do arranjo?`
              )) {
                await liberarQuadrasIds(restantes);
              }
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.erro || 'Falhou'));
            }
          };
        }}
        class="flex items-center gap-2"
      >
        {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
        <input name="data" type="date" bind:value={dataConclusao} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        <input name="hora" type="time" bind:value={horaConclusao} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" title="Hora que o trabalho foi feito" />
        <Button variant="success" size="sm" type="submit" loading={salvandoConclusao}><Icon nome="check" size={14} /> Concluir</Button>
      </form>
      <form
        method="POST"
        action="?/reverter"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success') {
            toast.info(String((result.data as any)?.msg || 'Revertidas'));
            limparSelecao();
            await invalidateAll();
          }
        }}
      >
        {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
        <Button variant="secondary" size="sm" type="submit" title="Desfaz a última conclusão e volta pra penúltima"><Icon nome="refresh" size={14} /> Reverter</Button>
      </form>
      <form
        method="POST"
        action="?/limparConclusao"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success') {
            toast.warn(String((result.data as any)?.msg || 'Limpa(s)'));
            limparSelecao();
            await invalidateAll();
          }
        }}
        onsubmit={(e) => { if (!confirm(`Apagar TODO o histórico de conclusão de ${selecionadas.size} quadra(s)? Não dá pra desfazer.`)) e.preventDefault(); }}
      >
        {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
        <Button variant="ghost" size="sm" type="submit" title="APAGA todo histórico e marca como pendente"><Icon nome="trash" size={14} /> Limpar histórico</Button>
      </form>
    </div>
  </div>
{/if}


<!-- Sheet: criar designação (sempre território pessoal — saída em grupo é arranjo) -->
<BottomSheet bind:open={sheetDesignar} title="Designar território pessoal">
  <form
    method="POST"
    action="?/criarDesignacao"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.msg || 'Criada');
          sheetDesignar = false;
          limparSelecao();
          limparSelecaoTce();
          publicadoresSel = new Set();
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    {#each [...selecionadas] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
    {#each [...tcesSelecionados] as tid}<input type="hidden" name="tces_ids" value={tid} />{/each}

    {#if tcesSelecionados.size > 0}
      <div class="rounded-lg bg-orange-50 p-3 text-sm">
        <div class="font-medium mb-1"><Icon nome="store" size={14} /> {tcesSelecionados.size} TCE(s)</div>
        <div class="text-xs text-slate-600">
          {[...tcesSelecionados].map((tid) => data.tces.find((t) => t.id === tid)?.nome ?? tid).join(', ')}
        </div>
      </div>
    {/if}
    {#if selecionadas.size > 0}
      <div class="rounded-lg bg-slate-50 p-3 text-sm">
        <div class="font-medium mb-1">{selecionadas.size} quadra(s)</div>
        <div class="text-xs text-slate-500 font-mono">{[...selecionadas].join(', ')}</div>
      </div>

      <p class="text-xs text-slate-500">
        Pra saída em grupo com dirigente, crie um <a href="/admin/arranjos" class="text-primary-700 hover:underline">arranjo</a> e anexe as quadras lá.
      </p>
    {/if}

    <div>
      <span class="block text-sm font-medium mb-1">Publicadores (≥1, primeiro é líder)</span>
      <div class="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {#each data.publicadores as p}
          <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
            <input type="checkbox" checked={publicadoresSel.has(p.id)} onchange={() => togglePub(p.id)} class="w-4 h-4 rounded" />
            <span class="flex-1">{p.nome}</span>
            <span class="text-xs text-slate-400">{p.role}</span>
          </label>
        {/each}
      </div>
      {#each [...publicadoresSel] as pid}<input type="hidden" name="publicador_ids" value={pid} />{/each}
      <p class="text-xs text-slate-500 mt-1">{publicadoresSel.size} selecionado(s)</p>
    </div>

    <div>
      <label for="prazo" class="block text-sm font-medium mb-1">Prazo (opcional)</label>
      <input id="prazo" name="prazo" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div>
      <label for="notas" class="block text-sm font-medium mb-1">Notas (opcional)</label>
      <textarea id="notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetDesignar = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Designar</Button>
    </div>
  </form>
</BottomSheet>

<!-- Sheet: anexar quadras selecionadas a um arranjo (admin → arranjo direto) -->
<BottomSheet bind:open={sheetArranjo} title="Anexar quadras a um arranjo">
  {#if data.arranjosQuadras.length === 0}
    <div class="text-center py-8 text-slate-500">
      <div class="text-4xl mb-2 opacity-50"><Icon nome="calendar" size={40} class="mx-auto text-slate-300" /></div>
      <div class="font-medium">Nenhum arranjo de quadras</div>
      <div class="text-sm">Cria um arranjo do tipo "quadras" em <a href="/admin/arranjos" class="text-primary-700 hover:underline">/admin/arranjos</a>.</div>
    </div>
  {:else}
    <form
      method="POST"
      action="?/adicionarQuadrasAoArranjo"
      use:enhance={() => {
        salvandoAnexar = true;
        return async ({ result, update }) => {
          await update();
          salvandoAnexar = false;
          if (result.type === 'success') {
            toast.success(String((result.data as any)?.msg || 'Anexado'));
            sheetArranjo = false;
            selecionadas = new Set();
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-3"
    >
      {#each [...selecionadas] as qid}
        <input type="hidden" name="quadras_ids" value={qid} />
      {/each}

      <div class="text-sm bg-slate-50 rounded p-2">
        <strong>{selecionadas.size}</strong> quadra(s) selecionada(s)
      </div>

      <div>
        <span class="block text-sm font-medium mb-1">Modo</span>
        <div class="flex gap-1 bg-slate-100 rounded-lg p-1 text-xs">
          <button type="button" onclick={() => (modoAnexar = 'somar')}
            class="flex-1 px-2 py-1 rounded font-medium"
            class:bg-white={modoAnexar === 'somar'}
            class:text-slate-900={modoAnexar === 'somar'}
            class:text-slate-500={modoAnexar !== 'somar'}>Somar às existentes</button>
          <button type="button" onclick={() => (modoAnexar = 'substituir')}
            class="flex-1 px-2 py-1 rounded font-medium"
            class:bg-white={modoAnexar === 'substituir'}
            class:text-slate-900={modoAnexar === 'substituir'}
            class:text-slate-500={modoAnexar !== 'substituir'}>Substituir tudo</button>
        </div>
        <input type="hidden" name="substituir" value={modoAnexar === 'substituir' ? 'true' : 'false'} />
      </div>

      <div>
        <span class="block text-sm font-medium mb-1">Arranjo</span>
        <div class="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {#each data.arranjosQuadras as a}
            <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="radio" name="arranjo_id" value={a.id} required class="w-4 h-4" />
              <span class="w-2 h-8 rounded shrink-0" style="background:{a.modalidade_cor}"></span>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{a.nome || a.modalidade_nome}</div>
                <div class="text-xs text-slate-500">
                  {a.data ? new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) : '—'}
                  {a.hora_inicio ? ` · ${a.hora_inicio.substring(0, 5)}` : ''}
                  · {(a.quadras_ids ?? []).length} já vinculada(s)
                </div>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (sheetArranjo = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvandoAnexar} class="flex-1">Anexar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

<!-- Sheet: anexar TCEs selecionados a um arranjo (dirigente reparte depois em Casa a casa) -->
<BottomSheet bind:open={sheetArranjoTce} title="Anexar TCEs a um arranjo">
  {#if data.arranjosQuadras.length === 0}
    <div class="text-center py-8 text-slate-500">
      <div class="text-4xl mb-2 opacity-50"><Icon nome="calendar" size={40} class="mx-auto text-slate-300" /></div>
      <div class="font-medium">Nenhum arranjo disponível</div>
      <div class="text-sm">Cria um arranjo em <a href="/admin/arranjos" class="text-primary-700 hover:underline">/admin/arranjos</a>.</div>
    </div>
  {:else}
    <form
      method="POST"
      action="?/adicionarTcesAoArranjo"
      use:enhance={() => {
        salvandoAnexarTce = true;
        return async ({ result, update }) => {
          await update();
          salvandoAnexarTce = false;
          if (result.type === 'success') {
            toast.success(String((result.data as any)?.msg || 'Anexado'));
            sheetArranjoTce = false;
            limparSelecaoTce();
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-3"
    >
      {#each [...tcesSelecionados] as tid}
        <input type="hidden" name="tces_ids" value={tid} />
      {/each}

      <div class="text-sm bg-orange-50 rounded p-2">
        <strong>{tcesSelecionados.size}</strong> TCE(s) selecionado(s):
        {[...tcesSelecionados].map((tid) => data.tces.find((t) => t.id === tid)?.nome ?? tid).join(', ')}
      </div>

      <div>
        <span class="block text-sm font-medium mb-1">Modo</span>
        <div class="flex gap-1 bg-slate-100 rounded-lg p-1 text-xs">
          <button type="button" onclick={() => (modoAnexarTce = 'somar')}
            class="flex-1 px-2 py-1 rounded font-medium"
            class:bg-white={modoAnexarTce === 'somar'}
            class:text-slate-900={modoAnexarTce === 'somar'}
            class:text-slate-500={modoAnexarTce !== 'somar'}>Somar aos existentes</button>
          <button type="button" onclick={() => (modoAnexarTce = 'substituir')}
            class="flex-1 px-2 py-1 rounded font-medium"
            class:bg-white={modoAnexarTce === 'substituir'}
            class:text-slate-900={modoAnexarTce === 'substituir'}
            class:text-slate-500={modoAnexarTce !== 'substituir'}>Substituir tudo</button>
        </div>
        <input type="hidden" name="substituir" value={modoAnexarTce === 'substituir' ? 'true' : 'false'} />
      </div>

      <div>
        <span class="block text-sm font-medium mb-1">Arranjo</span>
        <div class="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {#each data.arranjosQuadras as a}
            <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="radio" name="arranjo_id" value={a.id} required class="w-4 h-4" />
              <span class="w-2 h-8 rounded shrink-0" style="background:{a.modalidade_cor}"></span>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{a.nome || a.modalidade_nome}</div>
                <div class="text-xs text-slate-500">
                  {a.data ? new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) : '—'}
                  {a.hora_inicio ? ` · ${a.hora_inicio.substring(0, 5)}` : ''}
                </div>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (sheetArranjoTce = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvandoAnexarTce} class="flex-1">Anexar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

<!-- Sheet: detalhe da quadra (long-press) — fundido de /admin/registro -->
<BottomSheet bind:open={sheetDetalheQuadra} title={quadraDetalhe ? `Quadra ${quadraDetalhe.id}` : ''}>
  {#if quadraDetalhe}
    {@const dias = quadraDetalhe.data_conclusao ? diasDesde(quadraDetalhe.data_conclusao) : null}
    <div class="space-y-2 text-sm">
      <div><span class="text-slate-500">Território:</span> <span class="font-medium">{quadraDetalhe.territorio_nome || '—'}</span></div>
      <div><span class="text-slate-500">Status:</span> <span class="font-medium">{quadraDetalhe.status}</span></div>
      <div><span class="text-slate-500">Endereços:</span> <span class="font-medium">{quadraDetalhe.qtd_locais}</span></div>
      <div>
        <span class="text-slate-500">Última conclusão:</span>
        {#if quadraDetalhe.data_conclusao}
          <span class="font-medium">{new Date(quadraDetalhe.data_conclusao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
          <span class="text-xs text-slate-400 ml-1">({dias}d atrás)</span>
        {:else}
          <span class="font-medium text-slate-400">nunca</span>
        {/if}
      </div>

      <!-- Conclusão POR LADO: o servo recebe a informação de boca
           ("fizemos só o lado da Rua X") e precisa conseguir lançar. -->
      <div class="mt-3 border-t border-slate-100 pt-2">
        <div class="text-xs font-semibold text-slate-600 mb-1">
          Lados da quadra
          {#if ladosQuadra.length > 0}
            <span class="font-normal text-slate-400">
              · {ladosQuadra.filter((l) => l.feitoEm).length} de {ladosQuadra.length} feitos
            </span>
          {/if}
        </div>
        {#if carregandoLados}
          <div class="text-xs text-slate-400">carregando...</div>
        {:else if ladosQuadra.length === 0}
          <div class="text-xs text-slate-400">Esta quadra não tem endereço cadastrado.</div>
        {:else}
          <div class="space-y-1">
            {#each ladosQuadra as l (l.chave)}
              <div class="flex items-center gap-2 text-xs">
                <span class="flex-1 min-w-0 truncate">{l.rotulo}</span>
                <span class="text-slate-400">{l.localIds.length}</span>
                {#if l.feitoEm}
                  <button
                    type="button"
                    disabled={salvandoLado === l.chave}
                    onclick={() => marcarLadoAdmin(l.chave, l.rotulo, true)}
                    class="px-2 py-0.5 rounded-full bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-40"
                    title="Desmarcar"
                  >feito {new Date(l.feitoEm + 'T12:00:00').toLocaleDateString('pt-BR')}</button>
                {:else}
                  <button
                    type="button"
                    disabled={salvandoLado === l.chave}
                    onclick={() => marcarLadoAdmin(l.chave, l.rotulo)}
                    class="px-2 py-0.5 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >marcar feito</button>
                {/if}
              </div>
            {/each}
          </div>
          <p class="text-[11px] text-slate-400 mt-1">
            Usa a data e a hora escolhidas na barra de conclusão. Marcando o último lado, a quadra fecha sozinha.
          </p>
        {/if}
      </div>

      <div class="mt-3 border-t border-slate-100 pt-2">
        <div class="text-xs font-semibold text-slate-600 mb-1">Histórico</div>
        {#if carregandoHistorico}
          <div class="text-xs text-slate-400">carregando...</div>
        {:else if historicoQuadra.length === 0}
          <div class="text-xs text-slate-400">Nenhuma conclusão registrada ainda.</div>
        {:else}
          <ul class="text-xs space-y-1">
            {#each historicoQuadra as h}
              <li class="flex items-center justify-between">
                <span class="font-mono">{new Date(h.data_conclusao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                <span class="text-slate-500">{h.nome ?? '(sem autor)'}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      {#if quadraDetalhe.notas}
        <div><span class="text-slate-500">Notas:</span> <span class="italic">{quadraDetalhe.notas}</span></div>
      {/if}
    </div>
  {/if}
</BottomSheet>

<!-- Sheet: conflito de data anterior ao concluir -->
<BottomSheet open={conflito !== null} title="Data anterior detectada">
  {#if conflito}
    <div class="space-y-3 text-sm">
      <p class="text-slate-600">
        Você está marcando <strong>{conflito.ids.length} quadra(s)</strong> como concluídas em
        <strong class="font-mono">{new Date(conflito.data + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>,
        mas essas quadras já têm conclusão mais recente:
      </p>
      <ul class="text-xs space-y-1 max-h-32 overflow-y-auto bg-slate-50 rounded p-2">
        {#each conflito.ultimas as u}
          <li class="flex justify-between">
            <span class="font-mono font-semibold">{u.id}</span>
            <span class="text-slate-500">última: {u.ultima}</span>
          </li>
        {/each}
      </ul>
      <p class="text-xs text-slate-500">O que fazer?</p>
      <div class="flex flex-col gap-2">
        <Button variant="primary" onclick={() => reSubmeterConclusao('historico')} loading={salvandoConclusao}>
          <Icon nome="file-text" size={14} /> Só adicionar ao histórico
          <span class="block text-xs font-normal opacity-70">Mantém a última como atual</span>
        </Button>
        <Button variant="secondary" onclick={() => reSubmeterConclusao('substituir')} loading={salvandoConclusao}>
          <Icon nome="refresh" size={14} /> Substituir a última
          <span class="block text-xs font-normal opacity-70">Apaga a última e usa essa</span>
        </Button>
        <Button variant="ghost" onclick={() => (conflito = null)}>
          <Icon nome="x" size={14} /> Cancelar (foi erro)
        </Button>
      </div>
    </div>
  {/if}
</BottomSheet>

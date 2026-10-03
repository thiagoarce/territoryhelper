<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaPoligonos from '$lib/components/MapaPoligonos.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { supabaseBrowser } from '$lib/supabase-browser';
  import {
    listarAreasCensoViewport,
    type FiltroCenso,
    type QuadraGeo,
    type ResumoCensoIdioma,
    type ViewportMapa
  } from '$lib/queries';

  let { data }: {
    data: {
      resumo: ResumoCensoIdioma;
      profile?: import('$lib/types').Profile | null;
      cacheInfo?: { deCache: boolean; gravadoEm: number };
    };
  } = $props();

  // A malha de idioma pode ter milhares de áreas. O filtro é o jeito de o
  // revisor achar o que ainda depende dele sem varrer o mapa inteiro.
  let filtro = $state<FiltroCenso>('manual');
  // Rótulo por área custa caro com milhares de polígonos — fica opcional.
  let mostrarRotulos = $state(false);
  let aprovandoLote = $state(false);
  let sheetArea = $state(false);
  let areaSel = $state<QuadraGeo | null>(null);
  let quadras = $state<QuadraGeo[]>([]);
  let viewport = $state<ViewportMapa | null>(null);
  let carregandoAreas = $state(false);
  let erroAreas = $state<string | null>(null);
  let totalViewport = $state(0);
  let consultaAtual = 0;
  const stats = $derived(data.resumo);
  const zoomMinimo = 12;

  const boundsIniciais = $derived.by(() => {
    const b = data.resumo.bounds;
    return b ? ([[b[0], b[1]], [b[2], b[3]]] as [[number, number], [number, number]]) : null;
  });

  async function carregarAreas() {
    const v = viewport;
    const f = filtro;
    const id = ++consultaAtual;
    erroAreas = null;
    if (!v || (f !== 'manual' && v.zoom < zoomMinimo)) {
      quadras = [];
      totalViewport = 0;
      carregandoAreas = false;
      return;
    }
    carregandoAreas = true;
    try {
      const resultado = await listarAreasCensoViewport(supabaseBrowser(), v, f);
      if (id !== consultaAtual) return;
      quadras = resultado.quadras;
      totalViewport = resultado.total;
    } catch (e) {
      if (id !== consultaAtual) return;
      quadras = [];
      totalViewport = 0;
      erroAreas = e instanceof Error ? e.message : 'Não foi possível carregar esta região';
    } finally {
      if (id === consultaAtual) carregandoAreas = false;
    }
  }

  function onViewportChange(novo: ViewportMapa) {
    viewport = novo;
  }

  $effect(() => {
    void viewport;
    void filtro;
    void carregarAreas();
  });

  function onClickQuadra(q: QuadraGeo) {
    areaSel = q;
    sheetArea = true;
  }
</script>

<svelte:head><title>Censo de idioma</title></svelte:head>

<div class="space-y-4">
  <div class="flex items-start justify-between gap-3 flex-wrap">
    <div>
      <h1 class="text-xl font-bold text-slate-900 flex items-center gap-2">
        <Icon nome="users" size={20} /> Censo de idioma
      </h1>
      <p class="text-sm text-slate-500">Malha exclusiva do grupo de idioma — separada da pregação regular.</p>
    </div>
    <CacheInfoBadge cacheInfo={data.cacheInfo} />
  </div>

  <div class="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900">
    Estas áreas existem para dar <strong>contexto visual e registrar o censo</strong> do idioma.
    Elas podem se sobrepor às áreas regulares e não entram em designação, arranjo nem carteira de
    ninguém. Endereço do IBGE/CNEFE <strong>nunca</strong> é vinculado aqui: dentro do idioma só vale
    endereço cadastrado explicitamente pelos publicadores do idioma.
    O território regular e rural se revisa em <a class="underline" href="/admin/poligonos">Polígonos</a>.
  </div>

  {#if stats.total === 0}
    <div class="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
      Nenhuma área de censo de idioma nesta instalação.
    </div>
  {:else}
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{stats.total} área(s)</span>
      <span class="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">{stats.aprovadas} aprovada(s)</span>
      <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{stats.sugeridas} sugerida(s)</span>
      {#if stats.manual > 0}
        <span class="rounded-full bg-red-100 px-2.5 py-1 text-red-800">{stats.manual} exige(m) revisão manual</span>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      {#each [
        { v: 'manual' as FiltroCenso, rotulo: `Revisão manual (${stats.manual})` },
        { v: 'pendentes' as FiltroCenso, rotulo: `Pendentes (${stats.sugeridas})` },
        { v: 'todas' as FiltroCenso, rotulo: `Todas (${stats.total})` }
      ] as opcao}
        <button
          onclick={() => (filtro = opcao.v)}
          class="text-sm px-3 py-1.5 rounded-lg border transition-colors"
          class:bg-primary-50={filtro === opcao.v}
          class:border-primary-500={filtro === opcao.v}
          class:text-primary-700={filtro === opcao.v}
          class:border-slate-300={filtro !== opcao.v}
        >{opcao.rotulo}</button>
      {/each}
      <button
        onclick={() => (mostrarRotulos = !mostrarRotulos)}
        class="text-sm px-3 py-1.5 rounded-lg border transition-colors"
        class:bg-primary-50={mostrarRotulos}
        class:border-primary-500={mostrarRotulos}
        class:text-primary-700={mostrarRotulos}
        class:border-slate-300={!mostrarRotulos}
        title="Rótulos ficam pesados com muitas áreas"
      ><Icon nome="tag" size={14} /> Rótulos</button>

      {#if stats.confiaveis > 0}
        <form
          method="POST"
          action="?/aprovarAreasConfiaveis"
          use:enhance={() => {
            aprovandoLote = true;
            return async ({ result, update }) => {
              await update();
              aprovandoLote = false;
              if (result.type === 'success') {
                toast.success((result.data as any)?.msg || 'Áreas aprovadas');
                await invalidateAll();
              } else if (result.type === 'failure') {
                toast.error(String((result.data as any)?.erro || 'Falhou'));
              }
            };
          }}
          onsubmit={(e) => {
            if (!confirm(`Aprovar ${stats.confiaveis} áreas de censo de alta confiança?`)) e.preventDefault();
          }}
        >
          <Button variant="secondary" size="sm" type="submit" loading={aprovandoLote}>
            Aprovar censo confiável ({stats.confiaveis})
          </Button>
        </form>
      {/if}
    </div>

    {#if filtro !== 'manual' && viewport && viewport.zoom < zoomMinimo}
      <p class="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
        Aproxime o mapa para carregar as áreas desta região. Assim a tela não baixa milhares de
        polígonos de uma vez.
      </p>
    {:else if erroAreas}
      <p class="rounded-lg bg-red-50 p-3 text-xs text-red-800">{erroAreas}</p>
    {:else}
      <p class="text-xs text-slate-500">
        {carregandoAreas ? 'Carregando a região visível…' : `${totalViewport} área(s) nesta região.`}
        Clique numa área para ver os metadados e aprovar ou reabrir a revisão.
        {#if totalViewport > quadras.length} Aproxime mais para ver todas.{/if}
      </p>
    {/if}

    <MapaPoligonos
      {quadras}
      locais={[]}
      altura={500}
      {mostrarRotulos}
      mostrarEnderecos={false}
      basemap={data.profile?.pref_basemap ?? 'bright'}
      {boundsIniciais}
      {onClickQuadra}
      {onViewportChange}
    />
  {/if}
</div>

<BottomSheet bind:open={sheetArea} title={areaSel ? `Área ${areaSel.id}` : ''}>
  {#if areaSel}
    <div class="space-y-4 text-sm">
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <div><strong>Tipo:</strong> {areaSel.tipo_area}</div>
        <div><strong>Finalidade:</strong> censo de idioma</div>
        <div><strong>Origem:</strong> {areaSel.origem_geografica} · confiança {areaSel.confianca}</div>
        <div><strong>Revisão:</strong> {areaSel.revisao_status === 'approved' ? 'aprovada' : 'sugerida'}</div>
      </div>

      <form
        method="POST"
        action="?/alterarRevisaoArea"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success') {
            toast.success((result.data as any)?.msg || 'Revisão atualizada');
            sheetArea = false;
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        }}
      >
        <input type="hidden" name="id" value={areaSel.id} />
        <input type="hidden" name="revisao_status" value={areaSel.revisao_status === 'approved' ? 'suggested' : 'approved'} />
        <Button variant={areaSel.revisao_status === 'approved' ? 'secondary' : 'primary'} type="submit" class="w-full">
          {areaSel.revisao_status === 'approved' ? 'Reabrir revisão' : 'Aprovar esta área'}
        </Button>
      </form>

      <p class="text-xs text-slate-500">
        Aprovar mantém a área dentro do censo de idioma: ela continua invisível para os fluxos de
        pregação regular e nunca recebe endereço do IBGE.
      </p>
    </div>
  {/if}
</BottomSheet>

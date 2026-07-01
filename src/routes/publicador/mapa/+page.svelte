<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { buscarPOIs, categoriaLabel, categoriaEmoji, urlRotaGoogleMaps, type CategoriaPOI } from '$lib/utils/overpass';
  import type { QuadraGeo, DesignacaoEnriquecida } from '$lib/server/queries';

  interface DelegTemp { id: number; publicador_id: string; quadras_ids: string[]; data_fim: string }
  interface Pub { id: string; nome: string; role: string }

  let { data, form }: {
    data: {
      quadras: QuadraGeo[];
      designacoesAbertas: DesignacaoEnriquecida[];
      publicadores: Pub[];
      delegacoesTemp: DelegTemp[];
    };
    form: any;
  } = $props();

  let quadraSel: QuadraGeo | null = $state(null);
  let sheetOpen = $state(false);
  let dataConclusao = $state(new Date().toISOString().substring(0, 10));
  let salvando = $state(false);

  // Delegação temporária
  let sheetDelegar = $state(false);
  let quadrasParaDelegar = $state<Set<string>>(new Set());
  let publicadorAlvo = $state('');
  let dataFimDelegar = $state('');
  let notasDelegar = $state('');
  let delegando = $state(false);
  const pubById = $derived(Object.fromEntries(data.publicadores.map((p) => [p.id, p.nome])));

  function toggleQuadraDeleg(qid: string) {
    if (quadrasParaDelegar.has(qid)) quadrasParaDelegar.delete(qid);
    else quadrasParaDelegar.add(qid);
    quadrasParaDelegar = new Set(quadrasParaDelegar);
  }
  function abrirDelegar() {
    quadrasParaDelegar = new Set();
    publicadorAlvo = '';
    dataFimDelegar = '';
    notasDelegar = '';
    sheetDelegar = true;
  }
  async function encerrarDeleg(id: number) {
    if (!confirm('Encerrar essa delegação agora?')) return;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/encerrarDelegacaoTemp', { method: 'POST', body: fd });
    if (res.ok) { toast.success('Encerrada'); await invalidateAll(); }
    else toast.error('Falhou');
  }

  let mapaRef: { exportarPng: () => string | null; centralizarEmQuadra: (q: QuadraGeo) => void } | null = $state(null);

  // POIs viram marcadores no mapa (specs Fase 3 — "renderizar no mapa")
  const poisMarcadores = $derived(
    pois.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      nome: `${p.nome} · ${p.distancia}m`,
      emoji: categoriaEmoji(p.categoria),
      url: urlRotaGoogleMaps(p.lat, p.lng)
    }))
  );

  function exportarMapa() {
    const png = mapaRef?.exportarPng();
    if (!png) {
      toast.warn('Não foi possível exportar');
      return;
    }
    const a = document.createElement('a');
    a.href = png;
    a.download = `mapa-${new Date().toISOString().substring(0, 10)}.png`;
    a.click();
    toast.success('PNG baixado');
  }

  let buscandoPOIs = $state(false);
  let pois: { id: string; lat: number; lng: number; nome: string; categoria: CategoriaPOI; distancia: number }[] = $state([]);

  let visao: 'mapa' | 'lista' = $state('mapa');
  let buscaLista = $state('');
  let filtroStatusLista = $state<'todos' | 'pendente' | 'concluido' | 'inativa'>('pendente');

  const quadrasFiltradas = $derived(
    data.quadras.filter((q) => {
      if (filtroStatusLista !== 'todos' && q.status !== filtroStatusLista) return false;
      if (buscaLista.trim() && !q.id.toLowerCase().includes(buscaLista.toLowerCase()))
        return false;
      return true;
    })
  );

  async function buscarEstacionamentos() {
    if (!quadraSel?.poly_geojson) {
      toast.warn('Quadra sem polígono');
      return;
    }
    // Centroide aproximado do polígono
    const coords: any[] = (quadraSel.poly_geojson as any).coordinates?.[0] ?? [];
    if (coords.length === 0) return;
    const sumLat = coords.reduce((s: number, c: number[]) => s + c[1], 0);
    const sumLng = coords.reduce((s: number, c: number[]) => s + c[0], 0);
    const centerLat = sumLat / coords.length;
    const centerLng = sumLng / coords.length;
    buscandoPOIs = true;
    pois = [];
    try {
      const raw = await buscarPOIs(centerLat, centerLng, 500, ['parking', 'pharmacy', 'square', 'bakery', 'fuel']);
      pois = raw.map((p) => ({
        ...p,
        distancia: Math.round(distanciaMetros(centerLat, centerLng, p.lat, p.lng))
      })).sort((a, b) => a.distancia - b.distancia);
      if (pois.length === 0) {
        toast.info('Nenhum POI encontrado em 500m');
        return;
      }
      // Fecha o sheet e centraliza o mapa na quadra pra ver os marcadores
      if (visao === 'mapa' && mapaRef && quadraSel) {
        mapaRef.centralizarEmQuadra(quadraSel);
        sheetOpen = false;
        toast.success(`${pois.length} POIs no mapa`);
      }
    } catch (e: any) {
      toast.error('Overpass falhou: ' + (e?.message || e));
    } finally {
      buscandoPOIs = false;
    }
  }

  function limparPOIs() {
    pois = [];
  }

  // Haversine simplificado pra distância em metros entre 2 pontos
  function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180, Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function abrirQuadra(q: QuadraGeo) {
    quadraSel = q;
    sheetOpen = true;
    dataConclusao = new Date().toISOString().substring(0, 10);
    pois = [];
  }

  const designacoesQuadra = $derived(
    quadraSel
      ? data.designacoesAbertas.filter((d) => d.quadras_ids.includes(quadraSel!.id))
      : []
  );
</script>

<div class="flex items-end justify-between flex-wrap gap-3">
  <div>
    <h1 class="text-2xl font-bold">Mapa estratégico</h1>
    <p class="text-sm text-slate-500 mt-1">Concluir quadras · estacionamento · delegar temp</p>
  </div>
  <div class="flex gap-2 flex-wrap">
    <div class="flex border border-slate-300 rounded-lg overflow-hidden text-sm">
      <button onclick={() => (visao = 'mapa')} class="px-3 py-1.5 {visao === 'mapa' ? 'bg-primary-600 text-white' : 'bg-white hover:bg-slate-50'}">🗺 Mapa</button>
      <button onclick={() => (visao = 'lista')} class="px-3 py-1.5 {visao === 'lista' ? 'bg-primary-600 text-white' : 'bg-white hover:bg-slate-50'}">☰ Lista</button>
    </div>
    {#if visao === 'mapa'}
      <Button variant="secondary" size="sm" onclick={exportarMapa}>📸 PNG</Button>
    {/if}
    <Button variant="primary" size="sm" onclick={abrirDelegar}>👤 Delegar temp</Button>
  </div>
</div>

{#if visao === 'mapa'}
  <div class="mt-4">
    <AdminMapa bind:this={mapaRef} quadras={data.quadras} pois={poisMarcadores} altura={620} onQuadraClick={abrirQuadra} />
  </div>
  {#if pois.length > 0}
    <div class="mt-2 flex items-center gap-2 flex-wrap text-xs">
      <span class="font-medium">{pois.length} POI(s) no mapa</span>
      <button type="button" onclick={limparPOIs} class="text-red-600 hover:underline">🧹 Limpar</button>
    </div>
  {/if}
{:else}
  <!-- Lista -->
  <div class="mt-4 flex gap-2 flex-wrap">
    <input
      type="search"
      bind:value={buscaLista}
      placeholder="Buscar quadra..."
      class="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48"
    />
    <div class="flex gap-1">
      {#each [['todos', 'Todos'], ['pendente', 'Pendentes'], ['concluido', 'Concluídas'], ['inativa', 'Inativas']] as [k, l]}
        <button
          onclick={() => (filtroStatusLista = k as any)}
          class="px-3 py-1.5 text-sm rounded border"
          class:bg-primary-100={filtroStatusLista === k}
          class:border-primary-500={filtroStatusLista === k}
          class:text-primary-700={filtroStatusLista === k}
          class:border-slate-200={filtroStatusLista !== k}
        >{l}</button>
      {/each}
    </div>
    <div class="ml-auto text-sm text-slate-500">{quadrasFiltradas.length} quadra(s)</div>
  </div>
  <div class="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
    {#each quadrasFiltradas as q (q.id)}
      <button
        type="button"
        onclick={() => abrirQuadra(q)}
        class="text-left p-2 rounded-lg border-2 border-transparent hover:border-primary-500 hover:bg-primary-50 transition-colors"
        class:bg-amber-50={q.ativa && !q.data_conclusao}
        class:bg-green-50={q.ativa && q.data_conclusao}
        class:bg-slate-100={!q.ativa}
      >
        <div class="flex items-center gap-1 mb-1">
          <span class="inline-block w-3 h-3 rounded" style:background-color={q.color}></span>
          <span class="font-mono font-semibold text-sm">{q.id}</span>
        </div>
        <div class="text-xs text-slate-500 truncate">{q.territorio_nome ?? '—'}</div>
        {#if q.data_conclusao}
          <div class="text-[10px] text-green-600 mt-1">✓ {q.data_conclusao}</div>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<!-- Legenda -->
<div class="mt-3 flex gap-4 flex-wrap text-xs">
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-amber-500/60"></span> Pendente</span>
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-green-500/60"></span> Concluída</span>
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-slate-400/60"></span> Inativa</span>
</div>

<BottomSheet bind:open={sheetOpen} title={quadraSel ? `Quadra ${quadraSel.id}` : ''}>
  {#if quadraSel}
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <span class="inline-block w-4 h-4 rounded" style:background-color={quadraSel.color}></span>
        <span class="text-sm text-slate-500">Cor</span>
        <span class="font-medium ml-auto">{quadraSel.color}</span>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <div class="text-xs text-slate-500">Território</div>
          <div class="font-medium">{quadraSel.territorio_nome ?? '—'}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">Status</div>
          <div class="font-medium capitalize">{quadraSel.status}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">Locais</div>
          <div class="font-medium">{quadraSel.qtd_locais}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">Última conclusão</div>
          <div class="font-medium">{quadraSel.data_conclusao || '—'}</div>
        </div>
      </div>

      {#if designacoesQuadra.length > 0}
        <div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
          <strong>⚠ Quadra em designação aberta:</strong>
          <ul class="mt-1 space-y-1">
            {#each designacoesQuadra as d}
              <li>📌 {d.publicador_nome ?? '(sem publicador)'}{d.prazo ? ` · prazo ${d.prazo}` : ''}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Estacionar perto -->
      <div class="rounded-lg border border-slate-200 p-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">Estacionar perto</span>
          <Button variant="ghost" size="sm" onclick={buscarEstacionamentos} loading={buscandoPOIs}>
            🅿️ Buscar
          </Button>
        </div>
        {#if pois.length > 0}
          <ul class="space-y-1 max-h-40 overflow-y-auto text-sm">
            {#each pois.slice(0, 8) as p}
              <li class="flex items-center gap-2">
                <span>{categoriaEmoji(p.categoria)}</span>
                <a
                  href="https://www.google.com/maps/dir/?api=1&destination={p.lat},{p.lng}"
                  target="_blank"
                  rel="noopener"
                  class="text-primary-700 hover:underline flex-1 truncate"
                >{p.nome}</a>
                <span class="text-xs text-slate-500">{p.distancia}m</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if quadraSel.data_conclusao}
        <div class="rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
          ✓ Concluída em <strong>{quadraSel.data_conclusao}</strong>
        </div>
        <form
          method="POST"
          action="?/desfazerConclusao"
          use:enhance={() => {
            salvando = true;
            return async ({ result, update }) => {
              await update();
              salvando = false;
              if (result.type === 'success') {
                toast.success('Conclusão desfeita');
                sheetOpen = false;
                await invalidateAll();
              }
            };
          }}
        >
          <input type="hidden" name="id" value={quadraSel.id} />
          <Button variant="secondary" type="submit" loading={salvando} class="w-full">Desfazer conclusão</Button>
        </form>
      {:else}
        <form
          method="POST"
          action="?/concluirQuadra"
          use:enhance={() => {
            salvando = true;
            return async ({ result, update }) => {
              await update();
              salvando = false;
              if (result.type === 'success') {
                toast.success((result.data as any)?.msg || 'Concluída');
                sheetOpen = false;
                await invalidateAll();
              } else if (result.type === 'failure') {
                toast.error(String((result.data as any)?.erro || 'Falhou'));
              }
            };
          }}
          class="space-y-3"
        >
          <input type="hidden" name="id" value={quadraSel.id} />
          <div>
            <label for="data" class="block text-sm font-medium mb-1">Data da conclusão</label>
            <input
              id="data"
              name="data"
              type="date"
              bind:value={dataConclusao}
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <Button variant="success" type="submit" loading={salvando} class="w-full">✓ Marcar como concluída</Button>
        </form>
      {/if}
    </div>
  {/if}
</BottomSheet>

{#if data.delegacoesTemp.length > 0}
  <div class="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
    <div class="text-xs uppercase tracking-wider font-semibold text-amber-900 mb-2">Delegações ativas ({data.delegacoesTemp.length})</div>
    <div class="space-y-1">
      {#each data.delegacoesTemp as d}
        <div class="flex items-center gap-2 text-sm bg-white rounded p-2">
          <div class="flex-1 min-w-0">
            <div class="font-medium">👤 {pubById[d.publicador_id] ?? '?'}</div>
            <div class="text-xs text-slate-500">
              {d.quadras_ids.length} quadra(s) · até {new Date(d.data_fim).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div class="flex flex-wrap gap-1 mt-1">
              {#each d.quadras_ids as q}
                <span class="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{q}</span>
              {/each}
            </div>
          </div>
          <button type="button" onclick={() => encerrarDeleg(d.id)} class="text-xs text-red-600 hover:underline">Encerrar</button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<BottomSheet bind:open={sheetDelegar} title="Delegar temporariamente">
  <form
    method="POST"
    action="?/delegarTemp"
    use:enhance={() => { delegando = true; return async ({ result, update }) => {
      await update(); delegando = false;
      if (result.type === 'success') {
        toast.success(String((result.data as any)?.msg || 'Delegado'));
        sheetDelegar = false; await invalidateAll();
      } else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
    }; }}
    class="space-y-3"
  >
    <p class="text-xs text-slate-500">Delegação some sozinha no fim do dia. O publicador ganha acesso temporário sem virar designação persistente.</p>
    {#each [...quadrasParaDelegar] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}

    <div>
      <label for="pub" class="block text-sm font-medium mb-1">Publicador</label>
      <select id="pub" name="publicador_id" required bind:value={publicadorAlvo} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">—</option>
        {#each data.publicadores as p}<option value={p.id}>{p.nome}</option>{/each}
      </select>
    </div>

    <div>
      <span class="block text-sm font-medium mb-1">Quadras ({quadrasParaDelegar.size} selecionadas)</span>
      <div class="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {#each data.quadras.filter((q) => q.ativa && !q.data_conclusao) as q}
          <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
            <input type="checkbox" checked={quadrasParaDelegar.has(q.id)} onchange={() => toggleQuadraDeleg(q.id)} class="w-4 h-4 rounded" />
            <span class="inline-block w-2 h-2 rounded" style:background-color={q.color}></span>
            <span class="font-mono">{q.id}</span>
            <span class="ml-auto text-xs text-slate-400 truncate max-w-[150px]">{q.territorio_nome ?? ''}</span>
          </label>
        {/each}
      </div>
      <p class="text-xs text-slate-500 mt-1">Só quadras ativas não concluídas</p>
    </div>

    <div>
      <label for="fim" class="block text-sm font-medium mb-1">Válida até (opcional)</label>
      <input id="fim" name="data_fim" type="datetime-local" bind:value={dataFimDelegar} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <p class="text-xs text-slate-500 mt-1">Vazio = hoje 23:59</p>
    </div>

    <div>
      <label for="notas" class="block text-sm font-medium mb-1">Notas (opcional)</label>
      <input id="notas" name="notas" bind:value={notasDelegar} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetDelegar = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={delegando} class="flex-1" disabled={quadrasParaDelegar.size === 0 || !publicadorAlvo}>Delegar</Button>
    </div>
  </form>
</BottomSheet>

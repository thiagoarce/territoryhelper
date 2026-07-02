<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { buscarPOIs, categoriaLabel, categoriaEmoji, urlRotaGoogleMaps, type CategoriaPOI } from '$lib/utils/overpass';
  import type { QuadraGeo, DesignacaoEnriquecida } from '$lib/server/queries';

  interface MeuArranjo { id: number; nome: string | null; data: string; quadras_ids: string[] | null; cartas_locais_ids: number[] | null }
  interface Parte { id: number; arranjo_id: number; quadras_ids: string[]; locais_ids: number[]; publicadores: string[] }
  interface Pub { id: string; nome: string; role: string }

  let { data, form }: {
    data: {
      quadras: QuadraGeo[];
      designacoesAbertas: DesignacaoEnriquecida[];
      publicadores: Pub[];
      meusArranjos: MeuArranjo[];
      partes: Parte[];
      minhaId: string;
    };
    form: any;
  } = $props();

  let quadraSel: QuadraGeo | null = $state(null);
  let sheetOpen = $state(false);
  let dataConclusao = $state(new Date().toISOString().substring(0, 10));
  let salvando = $state(false);

  // Quadras designadas a MIM (destaque com borda escura no mapa)
  const minhasQuadrasIds = $derived(
    data.designacoesAbertas
      .filter((d) => d.publicador_id === data.minhaId)
      .flatMap((d) => d.quadras_ids)
  );

  // Modo seleção: click no mapa acumula quadras em vez de abrir o sheet
  let modoSelecao = $state(false);
  let selecaoMapa = $state<Set<string>>(new Set());
  const selecaoMapaIds = $derived([...selecaoMapa]);
  function toggleModoSelecao() {
    modoSelecao = !modoSelecao;
    if (!modoSelecao) selecaoMapa = new Set();
  }

  // Repartir (parte de arranjo) — só dentro de arranjo que EU dirijo
  let sheetRepartir = $state(false);
  let arranjoAlvoId = $state<number | ''>('');
  let quadrasParte = $state<Set<string>>(new Set());
  let pubsParte = $state<Set<string>>(new Set());
  let notasParte = $state('');
  let repartindo = $state(false);
  const pubById = $derived(Object.fromEntries(data.publicadores.map((p) => [p.id, p.nome])));
  const arranjoAlvo = $derived(data.meusArranjos.find((a) => a.id === arranjoAlvoId) ?? null);

  function toggleQuadraParte(qid: string) {
    if (quadrasParte.has(qid)) quadrasParte.delete(qid);
    else quadrasParte.add(qid);
    quadrasParte = new Set(quadrasParte);
  }
  function togglePubParte(id: string) {
    if (pubsParte.has(id)) pubsParte.delete(id);
    else pubsParte.add(id);
    pubsParte = new Set(pubsParte);
  }
  function abrirRepartir(preQuadras?: Set<string>) {
    arranjoAlvoId = data.meusArranjos.length === 1 ? data.meusArranjos[0].id : '';
    quadrasParte = new Set(preQuadras ?? []);
    pubsParte = new Set();
    notasParte = '';
    sheetRepartir = true;
  }
  async function apagarParte(id: number) {
    if (!confirm('Remover essa parte?')) return;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarParte', { method: 'POST', body: fd });
    if (res.ok) { toast.success('Removida'); await invalidateAll(); }
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
    if (modoSelecao) {
      // Modo seleção: click acumula (só quadras ativas não recém-concluídas)
      if (selecaoMapa.has(q.id)) selecaoMapa.delete(q.id);
      else selecaoMapa.add(q.id);
      selecaoMapa = new Set(selecaoMapa);
      return;
    }
    quadraSel = q;
    sheetOpen = true;
    dataConclusao = new Date().toISOString().substring(0, 10);
    pois = [];
  }

  // Abre o sheet de repartir pré-preenchido com a seleção do mapa
  function repartirSelecao() {
    abrirRepartir(selecaoMapa);
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
    <p class="text-sm text-slate-500 mt-1">Concluir quadras · estacionamento · repartir arranjo</p>
  </div>
  <div class="flex gap-2 flex-wrap">
    <div class="flex border border-slate-300 rounded-lg overflow-hidden text-sm">
      <button onclick={() => (visao = 'mapa')} class="px-3 py-1.5 {visao === 'mapa' ? 'bg-primary-600 text-white' : 'bg-white hover:bg-slate-50'}">🗺 Mapa</button>
      <button onclick={() => (visao = 'lista')} class="px-3 py-1.5 {visao === 'lista' ? 'bg-primary-600 text-white' : 'bg-white hover:bg-slate-50'}">☰ Lista</button>
    </div>
    {#if visao === 'mapa'}
      <Button variant="secondary" size="sm" onclick={exportarMapa}>📸 PNG</Button>
      <Button
        variant={modoSelecao ? 'primary' : 'secondary'}
        size="sm"
        onclick={toggleModoSelecao}
      >{modoSelecao ? '✓ Selecionando…' : '☑ Selecionar'}</Button>
    {/if}
    {#if data.meusArranjos.length > 0}
      <Button variant="primary" size="sm" onclick={() => abrirRepartir()}>✂ Repartir</Button>
    {/if}
  </div>
</div>

{#if visao === 'mapa'}
  <div class="mt-4">
    <AdminMapa
      bind:this={mapaRef}
      quadras={data.quadras}
      pois={poisMarcadores}
      altura={620}
      colorirPor="recencia"
      destacarIds={minhasQuadrasIds}
      selecionadasIds={selecaoMapaIds}
      onQuadraClick={abrirQuadra}
    />
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

<!-- Legenda (recência — visão do dirigente) -->
<div class="mt-3 flex gap-x-4 gap-y-1 flex-wrap text-xs">
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-green-500/50"></span> Livre pra trabalhar</span>
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-amber-500/60"></span> Concluída 15–45d</span>
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-red-600/60"></span> Concluída &lt;15d — evitar</span>
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-slate-400/50"></span> Inativa</span>
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded border-2 border-slate-900"></span> Minhas designadas</span>
</div>

<!-- Barra de seleção (modo selecionar ativo) -->
{#if modoSelecao && selecaoMapa.size > 0}
  <div class="fixed bottom-14 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium"><strong>{selecaoMapa.size}</strong> quadra(s):
      <span class="font-mono text-xs text-slate-600">{selecaoMapaIds.slice(0, 6).join(', ')}{selecaoMapa.size > 6 ? '…' : ''}</span>
    </div>
    <div class="flex gap-2 ml-auto">
      {#if data.meusArranjos.length > 0}
        <Button variant="primary" size="sm" onclick={repartirSelecao}>✂ Repartir ({selecaoMapa.size})</Button>
      {:else}
        <span class="text-xs text-slate-500 self-center">Crie/assuma um arranjo pra repartir</span>
      {/if}
      <Button variant="secondary" size="sm" onclick={() => (selecaoMapa = new Set())}>Limpar</Button>
    </div>
  </div>
{/if}

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

{#if data.partes.length > 0}
  <div class="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
    <div class="text-xs uppercase tracking-wider font-semibold text-amber-900 mb-2">Partes dos meus arranjos ({data.partes.length})</div>
    <div class="space-y-1">
      {#each data.partes as pt (pt.id)}
        {@const arr = data.meusArranjos.find((a) => a.id === pt.arranjo_id)}
        <div class="flex items-center gap-2 text-sm bg-white rounded p-2">
          <div class="flex-1 min-w-0">
            <div class="font-medium">👤 {pt.publicadores.map((id) => pubById[id] ?? '?').join(' + ')}</div>
            <div class="text-xs text-slate-500">
              {arr?.nome ?? 'Arranjo'}{arr?.data ? ` · ${new Date(arr.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` : ''}
            </div>
            <div class="flex flex-wrap gap-1 mt-1">
              {#each pt.quadras_ids as q}
                <span class="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{q}</span>
              {/each}
              {#if pt.locais_ids.length > 0}
                <span class="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">✉ {pt.locais_ids.length} prédio(s)</span>
              {/if}
            </div>
          </div>
          <button type="button" onclick={() => apagarParte(pt.id)} class="text-xs text-red-600 hover:underline">🗑</button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<!-- Sheet repartir: parte de arranjo que EU dirijo -->
<BottomSheet bind:open={sheetRepartir} title="Repartir arranjo">
  <form
    method="POST"
    action="?/criarParte"
    use:enhance={() => { repartindo = true; return async ({ result, update }) => {
      await update(); repartindo = false;
      if (result.type === 'success') {
        toast.success(String((result.data as any)?.msg || 'Parte criada'));
        sheetRepartir = false; selecaoMapa = new Set(); await invalidateAll();
      } else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
    }; }}
    class="space-y-3"
  >
    {#each [...quadrasParte] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
    {#each [...pubsParte] as pid}<input type="hidden" name="publicador_ids" value={pid} />{/each}

    <p class="text-xs text-slate-500">A parte vale só durante o arranjo (some da carteira depois da data). Dupla/trio compartilham a mesma parte.</p>

    <div>
      <label for="arr-alvo" class="block text-sm font-medium mb-1">Arranjo</label>
      <select id="arr-alvo" name="arranjo_id" required bind:value={arranjoAlvoId} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">—</option>
        {#each data.meusArranjos as a}
          <option value={a.id}>{a.nome ?? 'Arranjo'} · {new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</option>
        {/each}
      </select>
    </div>

    {#if arranjoAlvo}
      <div>
        <span class="block text-sm font-medium mb-1">Quadras do arranjo ({quadrasParte.size} na parte)</span>
        {#if (arranjoAlvo.quadras_ids?.length ?? 0) === 0}
          <p class="text-xs text-amber-700 bg-amber-50 rounded p-2">Esse arranjo não tem quadras anexadas. Anexe na Visão Geral ou em /admin/arranjos.</p>
        {:else}
          <div class="flex flex-wrap gap-1.5">
            {#each arranjoAlvo.quadras_ids ?? [] as q}
              <button type="button" onclick={() => toggleQuadraParte(q)}
                class="text-xs font-mono px-2 py-1 rounded border transition-colors"
                class:bg-primary-600={quadrasParte.has(q)}
                class:text-white={quadrasParte.has(q)}
                class:border-primary-600={quadrasParte.has(q)}
                class:bg-white={!quadrasParte.has(q)}
                class:border-slate-300={!quadrasParte.has(q)}
              >{q}</button>
            {/each}
          </div>
          <p class="text-xs text-slate-500 mt-1">Quadras selecionadas fora do arranjo são rejeitadas.</p>
        {/if}
      </div>
    {/if}

    <div>
      <span class="block text-sm font-medium mb-1">Publicadores (dupla/trio)</span>
      <div class="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {#each data.publicadores as p}
          <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
            <input type="checkbox" checked={pubsParte.has(p.id)} onchange={() => togglePubParte(p.id)} class="w-4 h-4 rounded" />
            <span class="flex-1">{p.nome}</span>
            <span class="text-xs text-slate-400">{p.role}</span>
          </label>
        {/each}
      </div>
      <p class="text-xs text-slate-500 mt-1">{pubsParte.size} selecionado(s)</p>
    </div>

    <div>
      <label for="notas" class="block text-sm font-medium mb-1">Notas (opcional)</label>
      <input id="notas" name="notas" bind:value={notasParte} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetRepartir = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={repartindo} class="flex-1"
        disabled={quadrasParte.size === 0 || pubsParte.size === 0 || !arranjoAlvoId}>Criar parte</Button>
    </div>
  </form>
</BottomSheet>

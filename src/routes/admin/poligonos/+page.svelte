<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaPoligonos from '$lib/components/MapaPoligonos.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo } from '$lib/server/queries';
  import type { LocalComGeo } from './$types';

  let { data, form }: {
    data: {
      locais: LocalComGeo[];
      quadras: QuadraGeo[];
      territorios: { id: string; nome: string; cor: string | null; qtd: number }[];
      tces: { id: string; nome: string; tipo: string; status: string; prazo: string | null; publicador_id: string | null; publicador_nome: string | null; poly_geojson: unknown | null }[];
      publicadores: { id: string; nome: string; role: string }[];
      quadrasMultiCluster: { quadra_id: string; clusters: { cluster: string; qtd: number }[] }[];
      quadrasVazias: string[];
      quadrasOrfas: string[];
      quadrasParaRenomear: { id: string; color: string; status: string }[];
    };
    form: any;
  } = $props();

  // null = mapa limpo (nenhum modo). Endereços só aparecem em 'vincular'/'tce'.
  type Modo = 'vincular' | 'quadras' | 'territorios' | 'tce' | 'auditar' | null;
  let modo = $state<Modo>(null);

  let filtroTipo = $state<'dom' | 'com' | 'ambos'>('ambos');
  let filtroVinculo = $state<'vinculados' | 'sem' | 'ambos'>('ambos');
  let porFace = $state(false);
  let mostrarRotulos = $state(true);
  let basemap = $state<'positron' | 'liberty' | 'bright'>('bright');
  let selecionadosLocais = $state<Set<number>>(new Set());
  let selecionadasQuadras = $state<Set<string>>(new Set());
  let quadraDestaque = $state<string | null>(null);
  let salvando = $state(false);

  // TCE (designar é no Visão Geral; aqui só cria/conclui/deleta)
  let sheetCriarTce = $state(false);
  let novoTceNome = $state('');

  // Sheet do modo Quadras (renomear + território + ativa)
  let sheetQuadra = $state(false);
  let quadraSel = $state<QuadraGeo | null>(null);
  let novoIdQuadra = $state('');
  let territorioSel = $state('');

  // Desenho de polígono (terra-draw)
  let mapaRef = $state<any>(null);
  let desenhoAtivo = $state<'off' | 'nova' | 'editar'>('off');
  let quadraEditandoForma = $state<QuadraGeo | null>(null);
  let sheetNovaQuadra = $state(false);
  let novaQuadraId = $state('');
  let novaQuadraCor = $state('#3388ff');
  let novaQuadraTerr = $state('');
  // Juntar quadras (sub-modo dentro de Quadras)
  let juntarAtivo = $state(false);

  // Modo Território
  let sheetCriarTerr = $state(false);
  let sheetEditarTerr = $state(false);
  let terrEdit = $state<{ id: string; nome: string; cor: string | null; qtd: number } | null>(null);
  let novoTerrNome = $state('');
  let novoTerrCor = $state('#3388ff');
  let adicionarAterritorio = $state('');

  const mostrarEnderecos = $derived(modo === 'vincular' || modo === 'tce');
  const colorirPorTerritorio = $derived(modo === 'territorios');
  // No TCE o filtro é sempre comércio
  const filtroTipoEfetivo = $derived(modo === 'tce' ? 'com' : filtroTipo);

  function setModo(m: Modo) {
    if (desenhoAtivo !== 'off') cancelarDesenho();
    modo = modo === m ? null : m;
    if (modo !== 'vincular' && modo !== 'tce') selecionadosLocais = new Set();
    if (modo !== 'territorios' && modo !== 'quadras') selecionadasQuadras = new Set();
    if (modo !== 'auditar') quadraDestaque = null;
    if (modo !== 'quadras') juntarAtivo = false;
    // TCE entra já agrupado por face (cluster de comércios)
    if (modo === 'tce') porFace = true;
  }

  // Locais visíveis conforme filtros do modo atual
  const locaisVisiveis = $derived.by(() => {
    return data.locais.filter((l) => {
      if (filtroTipoEfetivo === 'com' && l.tipo !== 'comercio') return false;
      if (filtroTipoEfetivo === 'dom' && l.tipo === 'comercio') return false;
      if (modo === 'vincular') {
        if (filtroVinculo === 'vinculados' && !l.quadra_id) return false;
        if (filtroVinculo === 'sem' && l.quadra_id) return false;
      }
      return true;
    });
  });

  // Faces (cluster por setor|quadra_ibge|face_ibge) dos locais visíveis
  function faceKey(l: LocalComGeo): string {
    return `${l.setor ?? ''}|${l.quadra_ibge ?? ''}|${l.face_ibge ?? ''}`;
  }
  const faceIds = $derived.by(() => {
    const m = new Map<string, number[]>();
    for (const l of locaisVisiveis) {
      const k = faceKey(l);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l.id);
    }
    return m;
  });
  const selLocaisKey = $derived([...selecionadosLocais].sort().join('|'));
  const faces = $derived.by(() => {
    void selLocaisKey;
    const acc = new Map<string, { lat: number; lng: number; n: number; sel: number }>();
    for (const l of locaisVisiveis) {
      if (l.lat == null || l.lng == null) continue;
      const k = faceKey(l);
      const e = acc.get(k) ?? { lat: 0, lng: 0, n: 0, sel: 0 };
      e.lat += l.lat; e.lng += l.lng; e.n++;
      if (selecionadosLocais.has(l.id)) e.sel++;
      acc.set(k, e);
    }
    return [...acc].map(([key, e]) => ({
      key, lat: e.lat / e.n, lng: e.lng / e.n, qtd: e.n, selecionada: e.sel === e.n && e.n > 0
    }));
  });

  function onClickFace(key: string) {
    const ids = faceIds.get(key) ?? [];
    const todosSel = ids.every((id) => selecionadosLocais.has(id));
    for (const id of ids) {
      if (todosSel) selecionadosLocais.delete(id);
      else selecionadosLocais.add(id);
    }
    selecionadosLocais = new Set(selecionadosLocais);
  }

  function toggleQuadraSel(id: string) {
    if (selecionadasQuadras.has(id)) selecionadasQuadras.delete(id);
    else selecionadasQuadras.add(id);
    selecionadasQuadras = new Set(selecionadasQuadras);
  }
  function limparQuadras() { selecionadasQuadras = new Set(); }

  function onClickLocal(l: LocalComGeo) {
    if (modo !== 'vincular') return;
    if (selecionadosLocais.has(l.id)) selecionadosLocais.delete(l.id);
    else selecionadosLocais.add(l.id);
    selecionadosLocais = new Set(selecionadosLocais);
  }

  async function onClickQuadra(q: QuadraGeo) {
    if (desenhoAtivo !== 'off') return; // ignora cliques enquanto desenha
    if (modo === 'quadras') {
      if (juntarAtivo) { toggleQuadraSel(q.id); return; }
      quadraSel = q;
      novoIdQuadra = '';
      territorioSel = q.territorio_id ?? '';
      sheetQuadra = true;
      return;
    }
    if (modo === 'territorios') {
      toggleQuadraSel(q.id);
      return;
    }
    if (modo === 'vincular' && selecionadosLocais.size > 0) {
      const fd = new FormData();
      fd.append('quadra_id', q.id);
      for (const id of selecionadosLocais) fd.append('local_ids', String(id));
      salvando = true;
      try {
        const res = await fetch('?/vincularManual', { method: 'POST', body: fd });
        const { deserialize } = await import('$app/forms');
        const result = deserialize(await res.text()) as any;
        if (result.type === 'success') {
          toast.success(`${selecionadosLocais.size} endereço(s) vinculado(s) a ${q.id}`);
          selecionadosLocais = new Set();
          await invalidateAll();
        } else {
          toast.error(String(result.data?.erro || 'Falhou'));
        }
      } finally {
        salvando = false;
      }
    }
  }

  function destacarQuadra(id: string) {
    quadraDestaque = quadraDestaque === id ? null : id;
  }

  // ---- Desenho ----
  function iniciarNova() {
    desenhoAtivo = 'nova';
    quadraEditandoForma = null;
    mapaRef?.desenharNova();
  }
  function onDesenhoPronto() {
    // Polígono novo terminado → abre sheet pra id/cor/território
    novaQuadraId = '';
    novaQuadraCor = '#3388ff';
    novaQuadraTerr = '';
    sheetNovaQuadra = true;
  }
  function iniciarEditarForma(q: QuadraGeo) {
    sheetQuadra = false;
    desenhoAtivo = 'editar';
    quadraEditandoForma = q;
    mapaRef?.editarForma(q);
  }
  function cancelarDesenho() {
    mapaRef?.cancelarDesenho();
    desenhoAtivo = 'off';
    quadraEditandoForma = null;
    sheetNovaQuadra = false;
  }
  async function salvarPoligono(criar: boolean, id: string, color = '#3388ff', territorioId = '') {
    const geom = mapaRef?.pegarPoligono();
    if (!geom) { toast.error('Desenhe o polígono primeiro'); return; }
    const fd = new FormData();
    fd.append('id', id);
    fd.append('geojson', JSON.stringify(geom));
    fd.append('criar', String(criar));
    fd.append('color', color);
    fd.append('territorio_id', territorioId);
    salvando = true;
    try {
      const res = await fetch('?/salvarPoligonoQuadra', { method: 'POST', body: fd });
      const { deserialize } = await import('$app/forms');
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success') {
        toast.success(result.data?.msg || 'Salvo');
        cancelarDesenho();
        await invalidateAll();
      } else {
        toast.error(String(result.data?.erro || 'Falhou'));
      }
    } finally {
      salvando = false;
    }
  }

  function limparSelecao() { selecionadosLocais = new Set(); }

  const stats = $derived.by(() => {
    const semQuadra = data.locais.filter((l) => !l.quadra_id).length;
    const total = data.locais.length;
    return { total, semQuadra, vinculados: total - semQuadra };
  });

  const totalProblemas = $derived(
    data.quadrasMultiCluster.length + data.quadrasVazias.length + data.quadrasOrfas.length
  );

  const MODOS: { k: Exclude<Modo, null>; label: string }[] = [
    { k: 'vincular', label: 'Vincular' },
    { k: 'quadras', label: 'Quadras' },
    { k: 'territorios', label: 'Territórios' },
    { k: 'tce', label: 'TCE' },
    { k: 'auditar', label: 'Auditar' }
  ];

  function nomeTerritorio(id: string | null): string {
    if (!id) return '—';
    return data.territorios.find((t) => t.id === id)?.nome ?? id;
  }
</script>

<div class="p-4 space-y-3">
  <!-- Toolbar topo -->
  <div class="flex items-center gap-2 flex-wrap">
    <div class="flex gap-1 rounded-lg bg-slate-100 p-0.5">
      {#each MODOS as m}
        <button
          onclick={() => setModo(m.k)}
          class="px-3 py-1 text-sm rounded transition-colors flex items-center gap-1"
          class:bg-white={modo === m.k}
          class:font-medium={modo === m.k}
          class:shadow-sm={modo === m.k}
          class:text-slate-500={modo !== m.k}
        >
          {m.label}
          {#if m.k === 'auditar' && totalProblemas > 0}
            <span class="bg-red-600 text-white text-[10px] px-1.5 rounded-full">{totalProblemas}</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if modo === 'vincular'}
      <select bind:value={filtroTipo} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
        <option value="ambos">Domic. + Comércio</option>
        <option value="dom">Só Domicílios</option>
        <option value="com">Só Comércio</option>
      </select>
      <select bind:value={filtroVinculo} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
        <option value="ambos">Todos</option>
        <option value="vinculados">Vinculados</option>
        <option value="sem">Sem quadra</option>
      </select>
    {/if}

    {#if modo === 'vincular' || modo === 'tce'}
      <label class="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="checkbox" bind:checked={porFace} class="w-4 h-4 rounded" />
        Por face
      </label>
    {/if}

    <select bind:value={basemap} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" title="Mapa base">
      <option value="positron">Cinza</option>
      <option value="liberty">Colorido</option>
      <option value="bright">Brilhante</option>
    </select>

    <label class="flex items-center gap-1.5 text-sm cursor-pointer ml-auto">
      <input type="checkbox" bind:checked={mostrarRotulos} class="w-4 h-4 rounded" />
      Rótulos
    </label>
  </div>

  <!-- Stats (só no Vincular) -->
  {#if modo === 'vincular'}
    <div class="grid grid-cols-3 gap-2 text-center text-xs">
      <div class="rounded bg-slate-50 p-2">
        <div class="font-bold text-base">{stats.total.toLocaleString('pt-BR')}</div>
        <div class="text-slate-500 uppercase">endereços</div>
      </div>
      <div class="rounded bg-green-50 p-2">
        <div class="font-bold text-base text-green-700">{stats.vinculados.toLocaleString('pt-BR')}</div>
        <div class="text-slate-500 uppercase">vinculados</div>
      </div>
      <div class="rounded bg-red-50 p-2">
        <div class="font-bold text-base text-red-700">{stats.semQuadra.toLocaleString('pt-BR')}</div>
        <div class="text-slate-500 uppercase">sem quadra</div>
      </div>
    </div>

    {#if stats.semQuadra > 0}
      <form
        method="POST"
        action="?/autoVincular"
        use:enhance={() => {
          salvando = true;
          return async ({ result, update }) => {
            await update();
            salvando = false;
            if (result.type === 'success') {
              toast.success((result.data as any)?.msg || 'OK');
              await invalidateAll();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.erro || 'Falhou'));
            }
          };
        }}
      >
        <Button variant="primary" type="submit" loading={salvando}>⚡ Auto-vincular {stats.semQuadra} endereço(s)</Button>
      </form>
    {/if}
  {/if}

  <!-- Painel Auditar -->
  {#if modo === 'auditar'}
    {#if totalProblemas === 0}
      <div class="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
        ✓ Nada pra auditar — todas as quadras consistentes
      </div>
    {:else}
      <div class="space-y-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {#if data.quadrasOrfas.length > 0}
          <div class="text-xs font-semibold text-orange-700">◇ Quadras sem território ({data.quadrasOrfas.length})</div>
          <div class="flex flex-wrap gap-1">
            {#each data.quadrasOrfas as qid}
              <button
                onclick={() => destacarQuadra(qid)}
                class="text-xs font-mono px-2 py-0.5 rounded bg-orange-50 text-orange-700 hover:bg-orange-100"
                class:ring-2={quadraDestaque === qid}
              >{qid}</button>
            {/each}
          </div>
        {/if}
        {#if data.quadrasMultiCluster.length > 0}
          <div class="text-xs font-semibold text-amber-700 mt-2">⚠ Múltiplos clusters IBGE ({data.quadrasMultiCluster.length})</div>
          {#each data.quadrasMultiCluster as item}
            <button
              onclick={() => destacarQuadra(item.quadra_id)}
              class="w-full text-left text-xs px-2 py-1 rounded hover:bg-amber-50"
              class:bg-amber-100={quadraDestaque === item.quadra_id}
            >
              <span class="font-mono font-semibold">{item.quadra_id}</span>
              <span class="text-slate-500">— {item.clusters.length} clusters</span>
            </button>
          {/each}
        {/if}
        {#if data.quadrasVazias.length > 0}
          <div class="text-xs font-semibold text-red-700 mt-2">∅ Quadras sem endereço ({data.quadrasVazias.length})</div>
          <div class="flex flex-wrap gap-1">
            {#each data.quadrasVazias as qid}
              <button
                onclick={() => destacarQuadra(qid)}
                class="text-xs font-mono px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100"
                class:ring-2={quadraDestaque === qid}
              >{qid}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  <!-- Painel Territórios -->
  {#if modo === 'territorios'}
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="text-xs text-slate-500">
        {data.territorios.length} território(s). Click numa quadra pra selecionar; click num território abaixo pra editar.
      </div>
      <Button variant="primary" size="sm" onclick={() => { novoTerrNome = ''; novoTerrCor = '#3388ff'; sheetCriarTerr = true; }}>+ Novo território</Button>
    </div>
    <div class="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
      {#each data.territorios as t}
        <button
          onclick={() => { terrEdit = t; novoTerrNome = t.nome; novoTerrCor = t.cor ?? '#3388ff'; sheetEditarTerr = true; }}
          class="text-xs px-2 py-1 rounded-full border flex items-center gap-1.5 hover:bg-slate-50"
          style:border-color={t.cor ?? '#cbd5e1'}
        >
          <span class="w-3 h-3 rounded-full" style:background-color={t.cor ?? '#cbd5e1'}></span>
          {t.nome} <span class="text-slate-400">({t.qtd})</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Painel TCE -->
  {#if modo === 'tce'}
    <div class="text-xs text-slate-500">
      Comércios{porFace ? ' agrupados por face' : ''}. Click pra selecionar; depois "Criar TCE".
    </div>
    {#if data.tces.length > 0}
      <div class="space-y-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {#each data.tces as t}
          <div class="flex items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" style:background-color={t.status === 'aberto' ? '#9333ea' : '#94a3b8'}></span>
              <span class="font-medium truncate">{t.nome}</span>
              {#if t.publicador_nome}
                <span class="text-blue-600 truncate">👤 {t.publicador_nome}</span>
              {:else}
                <span class="text-slate-400">{t.status}</span>
              {/if}
            </div>
            <div class="flex gap-1.5 shrink-0">
              {#if t.status === 'aberto'}
                <form method="POST" action="?/alterarStatusTce" use:enhance={() => async ({ result, update }) => { await update(); if (result.type==='success'){ toast.success('Concluído'); await invalidateAll(); } }}>
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="concluido" />
                  <button type="submit" class="text-green-700 hover:underline">✓</button>
                </form>
              {/if}
              <form method="POST" action="?/deletarTce" use:enhance={() => async ({ result, update }) => { await update(); if (result.type==='success'){ toast.warn('Removido'); await invalidateAll(); } }} onsubmit={(e) => { if (!confirm(`Deletar TCE "${t.nome}"?`)) e.preventDefault(); }}>
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" class="text-red-600 hover:underline">🗑</button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Instruções por modo -->
  <p class="text-xs text-slate-500 text-center">
    {#if modo === null}
      Escolha um modo acima. Mapa mostra as quadras coloridas.
    {:else if modo === 'tce'}
      {#if selecionadosLocais.size === 0}
        Click nos comércios/faces pra montar o TCE.
      {:else}
        <strong>{selecionadosLocais.size}</strong> endereço(s) — clique "Criar TCE" abaixo
      {/if}
    {:else if modo === 'vincular'}
      {#if selecionadosLocais.size === 0}
        Click nos pontos pra selecionar endereços. Depois click numa quadra pra vincular.
      {:else}
        <strong>{selecionadosLocais.size}</strong> endereço(s) selecionado(s) · click numa quadra pra vincular
      {/if}
    {:else if modo === 'quadras'}
      {#if desenhoAtivo === 'nova'}
        Desenhe a quadra no mapa: clique nos cantos, duplo-clique pra fechar.
      {:else if desenhoAtivo === 'editar'}
        Arraste os vértices pra ajustar a forma de {quadraEditandoForma?.id}.
      {:else if juntarAtivo}
        Click em 2+ quadras adjacentes pra juntar.
      {:else}
        Click numa quadra pra renomear/território/ativar. Ou desenhe/junte abaixo.
      {/if}
    {:else if modo === 'territorios'}
      {#if selecionadasQuadras.size === 0}
        Click nas quadras pra montar um território. Cores mostram os territórios atuais.
      {:else}
        <strong>{selecionadasQuadras.size}</strong> quadra(s) selecionada(s) — use a barra inferior
      {/if}
    {:else}
      Click num item da lista pra destacar a quadra no mapa.
    {/if}
  </p>

  <!-- Sub-toolbar do modo Quadras: desenhar / juntar -->
  {#if modo === 'quadras' && desenhoAtivo === 'off'}
    <div class="flex items-center gap-2">
      <Button variant="secondary" size="sm" onclick={iniciarNova}>✏ Desenhar nova quadra</Button>
      <button
        onclick={() => { juntarAtivo = !juntarAtivo; selecionadasQuadras = new Set(); }}
        class="text-sm px-3 py-1.5 rounded-lg border transition-colors"
        class:bg-primary-50={juntarAtivo}
        class:border-primary-500={juntarAtivo}
        class:text-primary-700={juntarAtivo}
        class:border-slate-300={!juntarAtivo}
      >🔗 Juntar quadras</button>
    </div>
  {/if}

  <MapaPoligonos
    bind:this={mapaRef}
    quadras={data.quadras}
    locais={data.locais}
    tces={data.tces}
    {faces}
    mostrarFaces={porFace}
    altura={500}
    {mostrarRotulos}
    {mostrarEnderecos}
    filtroTipo={filtroTipoEfetivo}
    {filtroVinculo}
    {quadraDestaque}
    {colorirPorTerritorio}
    bind:selecionadosLocais
    bind:selecionadasQuadras
    bind:basemap
    {onClickLocal}
    {onClickQuadra}
    {onClickFace}
    {onDesenhoPronto}
  />
</div>

<!-- Barra inferior do Vincular -->
{#if modo === 'vincular' && selecionadosLocais.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium">
      <strong>{selecionadosLocais.size}</strong> selecionado(s)
    </div>
    <p class="text-xs text-slate-500 hidden sm:block">click numa quadra pra vincular · ou:</p>

    <form
      method="POST"
      action="?/desvincular"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success('Desvinculados'); limparSelecao(); await invalidateAll(); }
      }}
      onsubmit={(e) => { if (!confirm(`Remover quadra de ${selecionadosLocais.size} endereço(s)?`)) e.preventDefault(); }}
    >
      {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
      <Button variant="ghost" size="sm" type="submit">↺ Desvincular</Button>
    </form>

    <form
      method="POST"
      action="?/toggleAtivacao"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); limparSelecao(); await invalidateAll(); }
      }}
    >
      {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
      <input type="hidden" name="ativar" value="false" />
      <Button variant="ghost" size="sm" type="submit">∅ Desativar</Button>
    </form>

    <form
      method="POST"
      action="?/toggleAtivacao"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); limparSelecao(); await invalidateAll(); }
      }}
    >
      {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
      <input type="hidden" name="ativar" value="true" />
      <Button variant="ghost" size="sm" type="submit">✓ Ativar</Button>
    </form>

    <Button variant="ghost" size="sm" onclick={limparSelecao} class="ml-auto">Limpar</Button>
  </div>
{/if}

<!-- Barra inferior do modo Território (quadras selecionadas) -->
{#if modo === 'territorios' && selecionadasQuadras.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium"><strong>{selecionadasQuadras.size}</strong> quadra(s)</div>

    <Button variant="primary" size="sm" onclick={() => { novoTerrNome = ''; novoTerrCor = '#3388ff'; sheetCriarTerr = true; }}>+ Criar território</Button>

    <form
      method="POST"
      action="?/adicionarQuadrasAoTerritorio"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); limparQuadras(); adicionarAterritorio=''; await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      }}
      class="flex items-center gap-1"
    >
      {#each [...selecionadasQuadras] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
      <select name="id" bind:value={adicionarAterritorio} required class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">+ a existente…</option>
        {#each data.territorios as t}<option value={t.id}>{t.nome}</option>{/each}
      </select>
      <Button variant="secondary" size="sm" type="submit" disabled={!adicionarAterritorio}>Add</Button>
    </form>

    <form
      method="POST"
      action="?/removerQuadrasDoTerritorio"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.info((result.data as any)?.msg || 'Órfãs'); limparQuadras(); await invalidateAll(); }
      }}
    >
      {#each [...selecionadasQuadras] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
      <Button variant="ghost" size="sm" type="submit">↺ Tirar do território</Button>
    </form>

    <Button variant="ghost" size="sm" onclick={limparQuadras} class="ml-auto">Limpar</Button>
  </div>
{/if}

<!-- Barra inferior: salvar forma editada -->
{#if desenhoAtivo === 'editar' && quadraEditandoForma}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2">
    <div class="text-sm font-medium">Editando forma de <strong>{quadraEditandoForma.id}</strong></div>
    <div class="ml-auto flex gap-2">
      <Button variant="ghost" size="sm" onclick={cancelarDesenho}>Cancelar</Button>
      <Button variant="primary" size="sm" loading={salvando} onclick={() => salvarPoligono(false, quadraEditandoForma!.id)}>Salvar forma</Button>
    </div>
  </div>
{/if}

<!-- Barra inferior: desenhando nova (antes de fechar o polígono) -->
{#if desenhoAtivo === 'nova' && !sheetNovaQuadra}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2">
    <div class="text-sm text-slate-600">Desenhando nova quadra…</div>
    <Button variant="ghost" size="sm" onclick={cancelarDesenho} class="ml-auto">Cancelar</Button>
  </div>
{/if}

<!-- Barra inferior: juntar quadras -->
{#if modo === 'quadras' && juntarAtivo && selecionadasQuadras.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium"><strong>{selecionadasQuadras.size}</strong>: {[...selecionadasQuadras].join(', ')}</div>
    <form
      method="POST"
      action="?/juntarQuadras"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            toast.success((result.data as any)?.msg || 'Unidas');
            selecionadasQuadras = new Set();
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="ml-auto"
    >
      {#each [...selecionadasQuadras] as id}<input type="hidden" name="ids" value={id} />{/each}
      <Button variant="primary" size="sm" type="submit" loading={salvando} disabled={selecionadasQuadras.size < 2}>🔗 Juntar (mantém {[...selecionadasQuadras][0] ?? ''})</Button>
    </form>
    <Button variant="ghost" size="sm" onclick={() => (selecionadasQuadras = new Set())}>Limpar</Button>
  </div>
{/if}

<!-- Barra inferior do modo TCE -->
{#if modo === 'tce' && selecionadosLocais.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium"><strong>{selecionadosLocais.size}</strong> comércio(s)</div>
    <Button variant="primary" size="sm" onclick={() => { novoTceNome = ''; sheetCriarTce = true; }}>🏪 Criar TCE</Button>
    <Button variant="ghost" size="sm" onclick={limparSelecao} class="ml-auto">Limpar</Button>
  </div>
{/if}

<!-- Sheet: criar TCE -->
<BottomSheet bind:open={sheetCriarTce} title="Novo TCE">
  <form
    method="POST"
    action="?/criarTce"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.msg || 'TCE criado');
          sheetCriarTce = false; limparSelecao();
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
    <input type="hidden" name="tipo" value="comercial" />
    <div class="text-xs text-slate-500">{selecionadosLocais.size} endereço(s) comerciais. O polígono é o convex hull dos pontos.</div>
    <div>
      <label for="tce_nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="tce_nome" name="nome" bind:value={novoTceNome} required placeholder="Ex: Galeria X, Av. Comercial" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetCriarTce = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Criar TCE</Button>
    </div>
  </form>
</BottomSheet>

<!-- Sheet: nova quadra (depois de desenhar) -->
<BottomSheet open={sheetNovaQuadra} title="Nova quadra">
  <div class="space-y-3">
    <div class="text-xs text-slate-500">Polígono desenhado. Defina o ID da quadra.</div>
    <div>
      <label for="nq_id" class="block text-sm font-medium mb-1">ID da quadra</label>
      <input id="nq_id" bind:value={novaQuadraId} placeholder="Ex: 12B" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="nq_cor" class="block text-sm font-medium mb-1">Cor</label>
        <input id="nq_cor" type="color" bind:value={novaQuadraCor} class="h-10 w-20 rounded border border-slate-300" />
      </div>
      <div>
        <label for="nq_terr" class="block text-sm font-medium mb-1">Território</label>
        <select id="nq_terr" bind:value={novaQuadraTerr} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">— sem —</option>
          {#each data.territorios as t}<option value={t.id}>{t.nome}</option>{/each}
        </select>
      </div>
    </div>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={cancelarDesenho} class="flex-1">Cancelar</Button>
      <Button variant="primary" loading={salvando} disabled={!novaQuadraId.trim()} onclick={() => salvarPoligono(true, novaQuadraId.trim(), novaQuadraCor, novaQuadraTerr)} class="flex-1">Criar quadra</Button>
    </div>
  </div>
</BottomSheet>

<!-- Sheet: criar território -->
<BottomSheet bind:open={sheetCriarTerr} title="Novo território">
  <form
    method="POST"
    action="?/criarTerritorio"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.msg || 'Criado');
          sheetCriarTerr = false; limparQuadras();
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    {#each [...selecionadasQuadras] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
    <div class="text-xs text-slate-500">{selecionadasQuadras.size} quadra(s) selecionada(s) entrarão neste território.</div>
    <div>
      <label for="terr_nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="terr_nome" name="nome" bind:value={novoTerrNome} required placeholder="Ex: Centro, Bairro X" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="terr_cor" class="block text-sm font-medium mb-1">Cor</label>
      <input id="terr_cor" name="cor" type="color" bind:value={novoTerrCor} class="h-10 w-20 rounded border border-slate-300" />
    </div>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetCriarTerr = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Criar</Button>
    </div>
  </form>
</BottomSheet>

<!-- Sheet: editar/deletar território -->
<BottomSheet bind:open={sheetEditarTerr} title={terrEdit ? `Território ${terrEdit.nome}` : ''}>
  {#if terrEdit}
    <div class="space-y-4">
      <form
        method="POST"
        action="?/atualizarTerritorio"
        use:enhance={() => {
          salvando = true;
          return async ({ result, update }) => {
            await update();
            salvando = false;
            if (result.type === 'success') { toast.success('Salvo'); sheetEditarTerr = false; await invalidateAll(); }
            else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
          };
        }}
        class="space-y-3"
      >
        <input type="hidden" name="id" value={terrEdit.id} />
        <div class="text-xs text-slate-500">{terrEdit.qtd} quadra(s) neste território.</div>
        <div>
          <label for="ed_nome" class="block text-sm font-medium mb-1">Nome</label>
          <input id="ed_nome" name="nome" bind:value={novoTerrNome} required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label for="ed_cor" class="block text-sm font-medium mb-1">Cor (propaga pras quadras)</label>
          <input id="ed_cor" name="cor" type="color" bind:value={novoTerrCor} class="h-10 w-20 rounded border border-slate-300" />
        </div>
        <Button variant="primary" type="submit" loading={salvando} class="w-full">Salvar</Button>
      </form>

      <form
        method="POST"
        action="?/deletarTerritorio"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success') { toast.warn((result.data as any)?.msg || 'Removido'); sheetEditarTerr = false; await invalidateAll(); }
          else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
        }}
        onsubmit={(e) => { if (!confirm(`Deletar território "${terrEdit?.nome}"? As ${terrEdit?.qtd} quadra(s) ficam órfãs.`)) e.preventDefault(); }}
        class="border-t border-slate-100 pt-3"
      >
        <input type="hidden" name="id" value={terrEdit.id} />
        <button type="submit" class="text-sm text-red-700 hover:underline">🗑 Deletar território (quadras viram órfãs)</button>
      </form>
    </div>
  {/if}
</BottomSheet>

<!-- Sheet do modo Quadras (renomear + território + ativa) -->
<BottomSheet bind:open={sheetQuadra} title={quadraSel ? `Quadra ${quadraSel.id}` : ''}>
  {#if quadraSel}
    <div class="space-y-4 text-sm">
      <div class="text-xs text-slate-500">
        Território: <strong>{nomeTerritorio(quadraSel.territorio_id)}</strong> ·
        {quadraSel.ativa ? 'ativa' : 'inativa'} ·
        {quadraSel.qtd_locais} endereço(s)
      </div>

      <!-- Território -->
      <form
        method="POST"
        action="?/vincularTerritorioQuadra"
        use:enhance={() => {
          salvando = true;
          return async ({ result, update }) => {
            await update();
            salvando = false;
            if (result.type === 'success') {
              toast.success((result.data as any)?.msg || 'OK');
              sheetQuadra = false;
              await invalidateAll();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.erro || 'Falhou'));
            }
          };
        }}
        class="space-y-2"
      >
        <input type="hidden" name="id" value={quadraSel.id} />
        <label for="territorio_id" class="block font-medium">Território</label>
        <div class="flex gap-2">
          <select id="territorio_id" name="territorio_id" bind:value={territorioSel} class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— sem território —</option>
            {#each data.territorios as t}
              <option value={t.id}>{t.nome}</option>
            {/each}
          </select>
          <Button variant="primary" size="sm" type="submit" loading={salvando}>Salvar</Button>
        </div>
        <p class="text-xs text-slate-500">Criar/deletar território é no modo Territórios.</p>
      </form>

      <!-- Ativa/Inativa -->
      <div class="grid grid-cols-2 gap-2">
        {#each [{ v: true, label: '✓ Ativa' }, { v: false, label: '∅ Inativa' }] as opt}
          <form
            method="POST"
            action="?/alterarStatusQuadra"
            use:enhance={() => async ({ result, update }) => {
              await update();
              if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); sheetQuadra = false; await invalidateAll(); }
            }}
          >
            <input type="hidden" name="id" value={quadraSel.id} />
            <input type="hidden" name="ativa" value={String(opt.v)} />
            <button type="submit"
              class="w-full px-3 py-2 border rounded-lg hover:bg-slate-50 transition-colors text-center"
              class:bg-primary-50={quadraSel.ativa === opt.v}
              class:border-primary-500={quadraSel.ativa === opt.v}
              class:border-slate-300={quadraSel.ativa !== opt.v}
            >{opt.label}</button>
          </form>
        {/each}
      </div>

      <!-- Renomear -->
      <form
        method="POST"
        action="?/renomearQuadra"
        use:enhance={() => {
          salvando = true;
          return async ({ result, update }) => {
            await update();
            salvando = false;
            if (result.type === 'success') {
              toast.success((result.data as any)?.msg || 'OK');
              sheetQuadra = false;
              await invalidateAll();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.erro || 'Falhou'));
            }
          };
        }}
        class="space-y-2 border-t border-slate-100 pt-3"
      >
        <input type="hidden" name="id_antigo" value={quadraSel.id} />
        <label for="id_novo" class="block font-medium">Renomear (novo ID)</label>
        <div class="flex gap-2">
          <input id="id_novo" name="id_novo" bind:value={novoIdQuadra} placeholder="Ex: 12B" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <Button variant="secondary" size="sm" type="submit" loading={salvando} disabled={!novoIdQuadra.trim()}>Renomear</Button>
        </div>
        <p class="text-xs text-slate-500">Cascata via locais e designações.</p>
      </form>

      <!-- Editar forma do polígono -->
      <div class="border-t border-slate-100 pt-3">
        <Button variant="secondary" onclick={() => iniciarEditarForma(quadraSel!)} class="w-full">✏ Editar forma do polígono</Button>
      </div>

      <Button variant="ghost" onclick={() => (sheetQuadra = false)} class="w-full">Fechar</Button>
    </div>
  {/if}
</BottomSheet>

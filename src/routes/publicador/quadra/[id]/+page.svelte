<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { cartaEscritaNoCiclo } from '$lib/ciclos';
  import { invalidateAll } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { supabaseBrowser } from '$lib/supabase-browser';
  import type { LocalComUnidades, UnidadeEnriquecida } from '$lib/queries';
  import type { DadosQuadraCampo } from '$lib/campo-fetchers';
  import QuadraMap from '$lib/components/QuadraMap.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import EditarLocalSheet from '$lib/components/EditarLocalSheet.svelte';
  import AdicionarLocalSheet from '$lib/components/AdicionarLocalSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { centroidePoligono, ordenarPorCaminho } from '$lib/utils/geo';
  import { postComFila } from '$lib/offline';
  import { chaveLado, ladosDaQuadra } from '$lib/lados';
  import EstacionarPertoSheet from '$lib/components/EstacionarPertoSheet.svelte';
  import PontoReferenciaSheet from '$lib/components/PontoReferenciaSheet.svelte';

  let { data }: { data: DadosQuadraCampo & { minhaRole?: string; cacheInfo?: { deCache: boolean; gravadoEm: number } } } = $props();

  // "Onde parar / referências" na PRÓPRIA tela da quadra: é aqui que o
  // publicador está quando não reconhece o lugar. Centro = centroide da
  // quadra (não a média do território, que num território comprido cai
  // no meio do nada).
  // (o centroide da quadra já é calculado mais abaixo, pra ordenar o
  // percurso dos endereços — reusado aqui como centro da busca)
  let sheetEstacionar = $state(false);
  let poisMapa = $state<any[]>([]);
  // Cadastro de ponto (toque longo no mapa ou "salvar" num POI achado)
  let sheetPonto = $state(false);
  let pontoLat = $state<number | null>(null);
  let pontoLng = $state<number | null>(null);
  let pontoNome = $state('');
  let pontoOsmId = $state<string | null>(null);
  const pontosSalvos = $derived(data.pontosReferencia ?? []);

  function abrirCadastroPonto(lngLat: { lng: number; lat: number }) {
    if (!podeDirigir) return; // publicador comum não cadastra
    pontoLat = lngLat.lat;
    pontoLng = lngLat.lng;
    pontoNome = '';
    pontoOsmId = null;
    sheetPonto = true;
  }
  function salvarPoiComoPonto(p: { nome: string; lat: number; lng: number; osmId: string }) {
    pontoLat = p.lat;
    pontoLng = p.lng;
    pontoNome = p.nome;
    pontoOsmId = p.osmId;
    sheetEstacionar = false;
    sheetPonto = true;
  }

  // W8 ("modo rua"): desfechos/carta resilientes a sinal ruim — mesmo
  // padrão de /predio/[id]: overlay otimista local + postComFila (sem
  // rede, enfileira no IndexedDB e sincroniza no evento `online`).
  let overrideDesfecho = $state<Record<number, string | null>>({});
  let overrideCarta = $state<Record<number, boolean>>({});

  async function marcarDesfechoFila(u: UnidadeEnriquecida, tipo: string, l: LocalComUnidades) {
    overrideDesfecho[u.id] = tipo === '' ? null : tipo;
    const fd = new FormData();
    fd.append('unidade_id', String(u.id));
    fd.append('tipo', tipo);
    const r = await postComFila('?/marcarDesfecho', fd, `Desfecho em ${l.logradouro}, ${l.numero}${u.complemento ? ' - ' + u.complemento : ''}`);
    if (r.ok) {
      await invalidateAll();
      delete overrideDesfecho[u.id];
    } else if (r.offline) {
      toast.info('Sem rede — salvo no aparelho, sincroniza sozinho quando voltar');
    } else {
      delete overrideDesfecho[u.id];
      toast.error(r.erro);
    }
  }

  async function toggleCartaFila(u: UnidadeEnriquecida, marcar: boolean, l: LocalComUnidades) {
    overrideCarta[u.id] = marcar;
    const fd = new FormData();
    fd.append('unidade_id', String(u.id));
    fd.append('marcar', String(marcar));
    const r = await postComFila('?/toggleCarta', fd, `Carta em ${l.logradouro}, ${l.numero}${u.complemento ? ' - ' + u.complemento : ''}`);
    if (r.ok) {
      await invalidateAll();
      delete overrideCarta[u.id];
    } else if (r.offline) {
      toast.info('Sem rede — salvo no aparelho, sincroniza sozinho quando voltar');
    } else {
      delete overrideCarta[u.id];
      toast.error(r.erro);
    }
  }
  let editandoLocal: LocalComUnidades | null = $state(null);
  let sheetEditar = $state(false);
  let sheetAdd = $state(false);
  const podeDirigir = $derived(['dirigente', 'admin'].includes(data.minhaRole ?? ''));
  let dataConclusao = $state(new Date().toISOString().substring(0, 10));
  // Hora que o trabalho foi feito de verdade (não "hora do registro") —
  // pré-preenche com a do arranjo vinculado, se houver (ver
  // carregarQuadraCampo::arranjoHoraInicio); senão, hora atual. O servo
  // pode ajustar — quem sabe quando concluiu é ele, não o sistema.
  // svelte-ignore state_referenced_locally
  let horaConclusao = $state((data.arranjoHoraInicio ?? new Date().toTimeString()).slice(0, 5));
  let salvandoConclusao = $state(false);

  // W10: concluir/desfazer conclusão viram postComFila (dirigente marca a
  // quadra concluída no fim da saída, muitas vezes já saindo do sinal).
  let overrideConcluida = $state<boolean | null>(null);
  async function concluirQuadraFila() {
    salvandoConclusao = true;
    overrideConcluida = true;
    const fd = new FormData();
    fd.append('data', dataConclusao);
    fd.append('hora', horaConclusao);
    const r = await postComFila('?/concluirQuadra', fd, `Concluir quadra ${data.quadra.id}`);
    salvandoConclusao = false;
    if (r.ok) { toast.success('Concluída'); overrideConcluida = null; await invalidateAll(); }
    else if (r.offline) toast.info('Sem rede — salvo no aparelho, sincroniza sozinho quando voltar');
    else { overrideConcluida = null; toast.error(r.erro); }
  }
  async function desfazerConclusaoFila() {
    salvandoConclusao = true;
    overrideConcluida = false;
    const r = await postComFila('?/desfazerConclusao', new FormData(), `Desfazer conclusão da quadra ${data.quadra.id}`);
    salvandoConclusao = false;
    if (r.ok) { toast.success('Desfeito'); overrideConcluida = null; await invalidateAll(); }
    else if (r.offline) toast.info('Sem rede — salvo no aparelho, sincroniza sozinho quando voltar');
    else { overrideConcluida = null; toast.error(r.erro); }
  }
  const quadraConcluidaEfetiva = $derived(overrideConcluida ?? !!data.quadra.data_conclusao);

  // Modo simples: botões gigantes, sem mapa nem ações de edição.
  // Persistido em localStorage por usuário.
  let modoSimples = $state(false);
  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    try { modoSimples = localStorage.getItem('modo_pub') === 'simples'; } catch {}
  });
  function alternarModo() {
    modoSimples = !modoSimples;
    try { localStorage.setItem('modo_pub', modoSimples ? 'simples' : 'avancado'); } catch {}
  }
  function abrirEditar(l: LocalComUnidades) {
    editandoLocal = l;
    sheetEditar = true;
  }

  // Realtime: escuta INSERTs em registros e UPDATEs em unidades pra esta quadra.
  // Quando outro publicador marca algo, invalida e re-fetch os dados.
  let realtimeChannel: any = null;
  onMount(() => {
    const supa = supabaseBrowser();
    const unidadeIds = new Set(data.locais.flatMap((l) => l.unidades.map((u) => u.id)));
    let timer: any = null;
    function debouncedInvalidate() {
      clearTimeout(timer);
      timer = setTimeout(() => invalidateAll(), 800);
    }
    realtimeChannel = supa
      .channel('quadra-' + data.quadra.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registros' }, (payload: any) => {
        if (unidadeIds.has(payload.new?.unidade_id)) debouncedInvalidate();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'unidades' }, (payload: any) => {
        if (unidadeIds.has(payload.new?.id)) debouncedInvalidate();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'locais' }, (payload: any) => {
        if (payload.new?.quadra_id === data.quadra.id) debouncedInvalidate();
      })
      .subscribe();
  });
  onDestroy(() => {
    if (realtimeChannel) {
      try { realtimeChannel.unsubscribe(); } catch {}
    }
  });

  // A8/U1: ordem_na_quadra (ajuste fino manual, T14) tem prioridade sobre
  // a ordem automática. Sem NENHUM ajuste manual na quadra, o padrão
  // agora segue um percurso "vizinho mais próximo" a partir do ponto
  // mais distante do centro (aproxima uma esquina/extremidade) — troca
  // do ângulo-em-torno-do-centro anterior, que zigzagueava em quadras
  // finas/alongadas (ver $lib/utils/geo.ts).
  const centroQuadra = $derived(centroidePoligono(data.quadra.poly_geojson));
  const temOrdemManual = $derived(data.locais.some((l) => l.ordem_na_quadra != null));
  const locaisBase = $derived(
    temOrdemManual
      ? [...data.locais].sort((a, b) => {
          if (a.ordem_na_quadra != null && b.ordem_na_quadra != null) return a.ordem_na_quadra - b.ordem_na_quadra;
          if (a.ordem_na_quadra != null) return -1;
          if (b.ordem_na_quadra != null) return 1;
          return 0; // mantém ordem original (id) — sort é estável
        })
      : ordenarPorCaminho(centroQuadra, data.locais)
  );

  // Inverte a ordem de percurso (às vezes a quadra se faz no sentido
  // anti-horário) — client-side, só muda a ordem de exibição/numeração
  // dos pinos, não grava nada.
  let ordemInvertida = $state(false);
  const locaisOrdenados = $derived(ordemInvertida ? [...locaisBase].reverse() : locaisBase);

  // Modo reordenar: setinhas ▲▼ gravando ordem_na_quadra por grupo (face).
  let modoReordenar = $state(false);
  let reordenandoId = $state<number | null>(null);
  async function moverLocal(face: string, localId: number, direcao: -1 | 1) {
    const grupo = porFace.find(([f]) => f === face)?.[1];
    if (!grupo) return;
    const idx = grupo.findIndex((l) => l.id === localId);
    const novoIdx = idx + direcao;
    if (idx < 0 || novoIdx < 0 || novoIdx >= grupo.length) return;
    const ids = grupo.map((l) => l.id);
    [ids[idx], ids[novoIdx]] = [ids[novoIdx], ids[idx]];
    reordenandoId = localId;
    try {
      const fd = new FormData();
      for (const id of ids) fd.append('ids', String(id));
      const r = await postComFila('?/reordenarLocais', fd, `Reordenar face ${face} da quadra ${data.quadra.id}`);
      if (r.ok) await invalidateAll();
      else if (r.offline) toast.info('Sem rede — salvo no aparelho, sincroniza sozinho quando voltar');
      else toast.error(r.erro);
    } finally {
      reordenandoId = null;
    }
  }

  // Agrupa locais por face IBGE pra mostrar separados (cada face é um trecho da quadra)
  // Agrupa por RUA (chave normalizada, ver $lib/lados.ts) em vez do
  // número de face do IBGE: "Face 3" não diz nada pro publicador, o
  // campo vem vazio em boa parte dos endereços, e é a rua que ele usa
  // pra falar do trabalho ("fizemos o lado da Napoleão Abdon").
  // ⚠️ moverLocal (reordenar ▲▼) usa ESTA MESMA chave — mudar aqui sem
  // mudar lá quebra a reordenação em silêncio.
  const porFace = $derived.by(() => {
    const grupos = new Map<string, LocalComUnidades[]>();
    for (const l of locaisOrdenados) {
      const k = chaveLado(l.logradouro) || '—';
      const arr = grupos.get(k) ?? [];
      arr.push(l);
      grupos.set(k, arr);
    }
    return [...grupos.entries()].sort(([, a], [, b]) =>
      (a[0]?.logradouro ?? '').localeCompare(b[0]?.logradouro ?? '', 'pt-BR')
    );
  });

  // Estado de cada lado (feito/não feito NESTE ciclo da quadra)
  const ladosDaTela = $derived(
    ladosDaQuadra(data.locais, data.ladosConclusoes ?? [], data.quadra.data_conclusao)
  );
  const ladosFeitos = $derived(ladosDaTela.filter((l) => l.feitoEm !== null).length);
  const overrideLados = $state<Record<string, string | null>>({});
  function ladoFeitoEm(chave: string): string | null {
    if (chave in overrideLados) return overrideLados[chave];
    return ladosDaTela.find((l) => l.chave === chave)?.feitoEm ?? null;
  }

  let salvandoLado = $state<string | null>(null);
  async function marcarLado(chave: string, rotulo: string) {
    salvandoLado = chave;
    overrideLados[chave] = dataConclusao; // otimista: o campo já fica verde
    const fd = new FormData();
    fd.append('lado_chave', chave);
    fd.append('lado_rotulo', rotulo);
    fd.append('data', dataConclusao);
    fd.append('hora', horaConclusao);
    const r = await postComFila('?/concluirLado', fd, `Lado ${rotulo} da quadra ${data.quadra.id}`);
    salvandoLado = null;
    if (r.ok) {
      delete overrideLados[chave];
      toast.success('Lado marcado');
      await invalidateAll();
    } else if (r.offline) {
      toast.info('Sem rede — salvo no aparelho. A quadra fecha sozinha quando a rede voltar.');
    } else {
      delete overrideLados[chave];
      toast.error(r.erro);
    }
  }
  async function desfazerLado(chave: string, rotulo: string) {
    salvandoLado = chave;
    overrideLados[chave] = null;
    const fd = new FormData();
    fd.append('lado_chave', chave);
    const r = await postComFila('?/desfazerLado', fd, `Desfazer lado ${rotulo} da quadra ${data.quadra.id}`);
    salvandoLado = null;
    if (r.ok) {
      delete overrideLados[chave];
      await invalidateAll();
    } else if (!r.offline) {
      delete overrideLados[chave];
      toast.error(r.erro);
    }
  }

  // Estado de expansão dos prédios (default fechado)
  let abertos = $state<Set<number>>(new Set());
  function togglePredio(localId: number) {
    if (abertos.has(localId)) abertos.delete(localId);
    else abertos.add(localId);
    abertos = new Set(abertos);
  }

  // Filtro simples: todos / pendentes / feitos / revisitas
  let filtro = $state<'todos' | 'pendentes' | 'feitos' | 'revisitas'>('todos');

  function unidadeFeita(u: UnidadeEnriquecida): boolean {
    return !!u.ultimo_tipo && u.ultimo_tipo !== 'desfeito' && u.ultimo_tipo !== 'carta_undo';
  }

  // "Não atendeu" já é um desfecho VÁLIDO (visitou, ninguém abriu) —
  // diferente de pendente (nunca visitado). Mas é justamente quem mais
  // vale voltar: já sabe o endereço, só faltou encontrar alguém em casa.
  function ehRevisita(u: UnidadeEnriquecida): boolean {
    return u.ultimo_tipo === 'naoAtendeu';
  }

  function passaFiltro(u: UnidadeEnriquecida): boolean {
    if (filtro === 'todos') return true;
    if (filtro === 'revisitas') return ehRevisita(u);
    const feita = unidadeFeita(u);
    return filtro === 'feitos' ? feita : !feita;
  }

  const totalRevisitas = $derived(
    data.locais.reduce((acc, l) => acc + l.unidades.filter(ehRevisita).length, 0)
  );

  function localPassaFiltro(l: LocalComUnidades): boolean {
    return l.unidades.some(passaFiltro);
  }

  const cores: Record<string, string> = {
    naoAtendeu: 'bg-slate-200 text-slate-700',
    semConversa: 'bg-amber-200 text-amber-900',
    conversou: 'bg-green-200 text-green-900',
    carta: 'bg-purple-200 text-purple-900',
    desfeito: 'bg-slate-100 text-slate-500'
  };
  const rotulos: Record<string, string> = {
    naoAtendeu: 'Não atendeu',
    semConversa: 'Sem palestra',
    conversou: 'Conversou',
    carta: 'Deixou carta',
    desfeito: 'Desfeito'
  };

  // Numera os locais na mesma ordem em que aparecem — correlaciona o pino
  // do mapa com o card da lista (ambos mostram o mesmo número).
  const numeroPorLocal = $derived(new Map(locaisOrdenados.map((l, i) => [l.id, i + 1])));

  const totalUnidades = $derived(data.locais.reduce((acc, l) => acc + l.unidades.length, 0));
  const feitasUnidades = $derived(data.locais.reduce((acc, l) => acc + l.unidades.filter(unidadeFeita).length, 0));
</script>

<div class="flex items-start justify-between gap-4 flex-wrap">
  <div>
    <a href="/publicador" class="text-sm text-primary-700 hover:underline">← Designações</a>
    <h1 class="text-2xl font-bold mt-1">
      <span
        class="inline-block w-4 h-4 rounded mr-1 align-middle"
        style:background-color={data.quadra.color}
      ></span>
      Quadra {data.quadra.id}
    </h1>
    {#if data.quadra.territorio_nome}
      <div class="text-sm text-slate-500">Território {data.quadra.territorio_nome}</div>
    {/if}
    <CacheInfoBadge cacheInfo={data.cacheInfo} />
  </div>
  <div class="flex items-center gap-3">
    <div class="text-sm text-slate-600 text-right">
      <div><strong>{feitasUnidades}</strong> de <strong>{totalUnidades}</strong></div>
      <div class="text-xs text-slate-400">{data.locais.length} local(is)</div>
    </div>
    <button
      onclick={() => (ordemInvertida = !ordemInvertida)}
      disabled={modoReordenar}
      class="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 flex items-center gap-1 disabled:opacity-40"
      title={ordemInvertida ? 'Voltar ao sentido original' : 'Inverter ordem (sentido anti-horário)'}
      aria-label="Inverter ordem da lista"
    ><Icon nome="swap" size={12} /> {ordemInvertida ? 'Ordem invertida' : 'Inverter ordem'}</button>
    <button
      onclick={() => {
        modoReordenar = !modoReordenar;
        if (modoReordenar) { ordemInvertida = false; filtro = 'todos'; }
      }}
      class="text-xs px-2 py-1 rounded border flex items-center gap-1"
      class:border-primary-500={modoReordenar}
      class:bg-primary-50={modoReordenar}
      class:text-primary-700={modoReordenar}
      class:border-slate-300={!modoReordenar}
      class:hover:bg-slate-100={!modoReordenar}
      title={modoReordenar ? 'Sair do modo reordenar' : 'Ajustar ordem manualmente'}
    ><Icon nome="chevron-down" size={12} /> {modoReordenar ? 'Concluir' : 'Reordenar'}</button>
    <button
      onclick={alternarModo}
      class="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
      title={modoSimples ? 'Voltar ao modo avançado' : 'Modo simples (botões grandes)'}
    >{modoSimples ? 'Avançado' : 'Simples'}</button>
  </div>
</div>

<!-- Ações de dirigente (marcar quadra concluída / desfazer) — só se role permite -->
{#if podeDirigir}
  <div class="mt-3 rounded-lg border border-slate-200 bg-white p-3">
    {#if quadraConcluidaEfetiva}
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-sm text-green-700 flex-1">
          <Icon nome="check" size={14} />
          {#if data.quadra.data_conclusao}Concluída em <strong>{new Date(data.quadra.data_conclusao + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>{:else}Concluída{/if}
        </span>
        <Button type="button" variant="secondary" size="sm" onclick={desfazerConclusaoFila} loading={salvandoConclusao}>Desfazer</Button>
      </div>
    {:else}
      {#if ladosDaTela.length > 1}
        <p class="text-xs text-slate-500 mb-2">
          {ladosFeitos} de {ladosDaTela.length} lados feitos
          {#if ladosFeitos > 0}· a quadra fecha sozinha quando marcar o último{/if}
        </p>
      {/if}
      <div class="flex items-center gap-2 flex-wrap">
        <label for="data-conc" class="text-sm text-slate-600">Concluir em</label>
        <input id="data-conc" type="date" name="data" bind:value={dataConclusao}
          class="rounded border border-slate-300 px-2 py-1 text-sm" />
        <label for="hora-conc" class="text-sm text-slate-600">às</label>
        <input id="hora-conc" type="time" name="hora" bind:value={horaConclusao}
          class="rounded border border-slate-300 px-2 py-1 text-sm" />
        <Button type="button" variant="success" size="sm" onclick={concluirQuadraFila} loading={salvandoConclusao}><Icon nome="check" size={14} /> Marcar concluída</Button>
      </div>
    {/if}
  </div>
{/if}

<!-- Mapa (escondido no modo simples) -->
{#if !modoSimples}
  <div class="mt-4">
    <QuadraMap
      quadraGeo={data.quadra.poly_geojson}
      quadraColor={data.quadra.color}
      locais={locaisOrdenados}
      {numeroPorLocal}
      altura={240}
      pois={poisMapa}
      onToqueLongo={podeDirigir ? abrirCadastroPonto : undefined}
    />
    {#if podeDirigir}
      <p class="mt-1 text-xs text-slate-400">
        Segure o dedo no mapa pra salvar um ponto (ex: onde dá pra estacionar).
      </p>
    {/if}
    <button
      type="button"
      onclick={() => (sheetEstacionar = true)}
      class="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-primary-200 text-primary-700 hover:bg-primary-50 text-sm font-medium"
    >
      <Icon nome="parking" size={16} /> Onde parar / referências
    </button>
  </div>
{/if}

<EstacionarPertoSheet
  bind:open={sheetEstacionar}
  centro={centroQuadra}
  bind:pois={poisMapa}
  pontosSalvos={pontosSalvos}
  podeSalvar={podeDirigir}
  onSalvarPonto={salvarPoiComoPonto}
/>
<PontoReferenciaSheet
  bind:open={sheetPonto}
  bind:lat={pontoLat}
  bind:lng={pontoLng}
  nomeInicial={pontoNome}
  osmId={pontoOsmId}
  quadraId={data.quadra.id}
  territorioId={data.quadra.territorio_id}
/>

<!-- Filtros -->
<div class="mt-4 flex gap-2 flex-wrap">
  {#each [['todos', 'Todos'], ['pendentes', 'Pendentes'], ['feitos', 'Feitos']] as [k, label]}
    <button
      onclick={() => (filtro = k as any)}
      class="px-3 py-1 text-sm rounded border"
      class:bg-primary-100={filtro === k}
      class:border-primary-500={filtro === k}
      class:text-primary-700={filtro === k}
      class:border-slate-200={filtro !== k}
      class:text-slate-600={filtro !== k}
    >
      {label}
    </button>
  {/each}
  {#if totalRevisitas > 0}
    <button
      onclick={() => (filtro = filtro === 'revisitas' ? 'todos' : 'revisitas')}
      class="px-3 py-1 text-sm rounded border flex items-center gap-1"
      class:bg-slate-200={filtro === 'revisitas'}
      class:border-slate-500={filtro === 'revisitas'}
      class:text-slate-800={filtro === 'revisitas'}
      class:border-slate-200={filtro !== 'revisitas'}
      class:text-slate-600={filtro !== 'revisitas'}
      title="Endereços onde ninguém atendeu — já sabe onde é, só falta encontrar alguém em casa"
    >
      <Icon nome="undo" size={12} /> Revisitas ({totalRevisitas})
    </button>
  {/if}
</div>

<div class="mt-4 space-y-4">
  {#each porFace as [face, locaisDaFace]}
    {@const visiveis = locaisDaFace.filter(localPassaFiltro)}
    {#if visiveis.length > 0}
      {@const rotuloLado = locaisDaFace[0]?.logradouro ?? '—'}
      {@const feitoEm = ladoFeitoEm(face)}
      <div>
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <div class="text-xs uppercase font-semibold text-slate-500 flex-1 min-w-0">
            {rotuloLado}
            <span class="text-slate-400 font-normal normal-case">· {visiveis.length} endereço(s)</span>
          </div>
          {#if podeDirigir && !quadraConcluidaEfetiva}
            {#if feitoEm}
              <button
                type="button"
                disabled={salvandoLado === face}
                onclick={() => desfazerLado(face, rotuloLado)}
                class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-40"
                title="Desmarcar este lado"
              >
                <Icon nome="check" size={12} /> lado feito
              </button>
            {:else}
              <button
                type="button"
                disabled={salvandoLado === face}
                onclick={() => marcarLado(face, rotuloLado)}
                class="text-xs px-2 py-1 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Marcar lado feito
              </button>
            {/if}
          {/if}
        </div>
        <div class="space-y-2">
          {#each visiveis as l (l.id)}
            {@const ehMultiUnidade = l.unidades.length >= 2}
            {@const visUnidades = l.unidades.filter(passaFiltro)}
            <div id="local-{l.id}" class="rounded-lg border border-slate-200 bg-white transition-all" class:opacity-50={l.marcado_nao_existe}>
              {#if ehMultiUnidade}
                <!-- Header clicável — qualquer local com 2+ unidades (prédio, comércio, coletivo) -->
                <div class="flex items-stretch">
                  <button
                    type="button"
                    onclick={() => togglePredio(l.id)}
                    class="flex-1 px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50"
                  >
                    <span class="text-xl"><Icon nome={l.tipo === 'predio' ? 'building' : 'store'} size={14} /></span>
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold truncate flex items-center gap-1">
                        <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-700 text-white text-[10px] font-bold shrink-0">{numeroPorLocal.get(l.id)}</span>
                        <span class:line-through={l.marcado_nao_existe}>{l.nome || `${l.logradouro}, ${l.numero}`}</span>
                        {#if l.tipo_entrada === 'porteiro'}<span class="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Porteiro</span>{/if}
                        {#if l.tipo_entrada === 'eletronica'}<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Eletrônica</span>{/if}
                        {#if l.irmao_mora}<span title="Irmão mora aqui" class="text-xs"><Icon nome="user" size={14} /></span>{/if}
                        {#if l.nao_visitar}<span class="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Não visitar</span>{/if}
                        {#if l.marcado_nao_existe}<span class="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Não existe mais</span>{/if}
                      </div>
                      <div class="text-xs text-slate-500">
                        {l.logradouro}, {l.numero} · {l.unidades.length} unidades · {l.unidades.filter(unidadeFeita).length} feitas
                      </div>
                    </div>
                    <span class="text-slate-400">{#if abertos.has(l.id)}<Icon nome="chevron-down" size={16} />{:else}<Icon nome="chevron-down" size={16} class="inline-block -rotate-90" />{/if}</span>
                  </button>
                  {#if modoReordenar}{@render setinhas(face, l.id)}{/if}
                  <button
                    type="button"
                    onclick={() => abrirEditar(l)}
                    aria-label="Editar"
                    class="px-3 text-slate-400 hover:text-primary-600 hover:bg-slate-50 border-l border-slate-100"
                  ><Icon nome="pencil" size={14} /></button>
                </div>
                {#if abertos.has(l.id)}
                  <div class="border-t border-slate-100">
                    {#each visUnidades as u, indice (u.id)}
                      <div class="px-3 py-2 border-b border-slate-100 last:border-b-0">
                        <div class="flex items-center justify-between gap-2 mb-1">
                          <span class="font-mono text-sm">
                            {u.complemento || u.nota || `Apto ${indice + 1}`}
                            {#if cartaEscritaNoCiclo(u.carta_entregue, data.cicloCartasPorLocal[l.id])}<span class="text-purple-600 ml-1" title="carta escrita"><Icon nome="mail" size={14} /></span>{/if}
                          </span>
                          {#if u.ultimo_tipo && u.ultimo_tipo !== 'desfeito' && u.ultimo_tipo !== 'carta_undo'}
                            <span class="text-xs rounded px-2 py-0.5 {cores[u.ultimo_tipo] ?? 'bg-slate-100'}">
                              {rotulos[u.ultimo_tipo] ?? u.ultimo_tipo}
                            </span>
                          {:else if u.desfecho_anterior}
                            <span class="text-xs rounded px-2 py-0.5 bg-slate-100 text-slate-400">{rotulos[u.desfecho_anterior] ?? u.desfecho_anterior} · ciclo anterior</span>
                          {/if}
                        </div>
                        {@render botoes(u, l)}
                      </div>
                    {/each}
                  </div>
                {/if}
              {:else}
                <!-- Casa / comércio / etc — só 1 unidade visível direto -->
                {#each visUnidades as u (u.id)}
                  <div class="p-3">
                    <div class="flex items-center justify-between gap-2 mb-2">
                      <div class="flex-1 min-w-0">
                        <div class="font-semibold truncate flex items-center gap-1">
                          <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-700 text-white text-[10px] font-bold shrink-0">{numeroPorLocal.get(l.id)}</span>
                          <span class:line-through={l.marcado_nao_existe}>{l.nome || `${l.logradouro}, ${l.numero}`}</span>
                          {#if l.irmao_mora}<span title="Irmão mora aqui" class="text-sm"><Icon nome="user" size={14} /></span>{/if}
                          {#if l.nao_visitar}<span class="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Não visitar</span>{/if}
                          {#if l.marcado_nao_existe}<span class="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Não existe mais</span>{/if}
                          {#if cartaEscritaNoCiclo(u.carta_entregue, data.cicloCartasPorLocal[l.id])}<span class="text-purple-600 ml-1" title="carta escrita"><Icon nome="mail" size={14} /></span>{/if}
                        </div>
                        <div class="text-xs text-slate-500">
                          {l.tipo} · {l.logradouro}, {l.numero}{u.complemento ? ' · ' + u.complemento : ''}
                        </div>
                      </div>
                      <div class="flex items-center gap-1">
                        {#if u.ultimo_tipo && u.ultimo_tipo !== 'desfeito' && u.ultimo_tipo !== 'carta_undo'}
                          <span class="text-xs rounded px-2 py-0.5 {cores[u.ultimo_tipo] ?? 'bg-slate-100'}">
                            {rotulos[u.ultimo_tipo] ?? u.ultimo_tipo}
                          </span>
                        {:else if u.desfecho_anterior}
                          <span class="text-xs rounded px-2 py-0.5 bg-slate-100 text-slate-400">{rotulos[u.desfecho_anterior] ?? u.desfecho_anterior} · ciclo anterior</span>
                        {/if}
                        {#if modoReordenar}{@render setinhas(face, l.id)}{/if}
                        <button
                          type="button"
                          onclick={() => abrirEditar(l)}
                          aria-label="Editar"
                          class="text-slate-400 hover:text-primary-600 px-1"
                        ><Icon nome="pencil" size={14} /></button>
                      </div>
                    </div>
                    {@render botoes(u, l)}
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <div class="text-center text-slate-400 py-10">
      Nenhuma unidade ainda nessa quadra.
    </div>
  {/each}
</div>

<EditarLocalSheet bind:open={sheetEditar} local={editandoLocal} />
<AdicionarLocalSheet bind:open={sheetAdd} locaisProximidade={data.locais} />

<!-- FAB Adicionar -->
<button
  type="button"
  onclick={() => (sheetAdd = true)}
  aria-label="Adicionar endereço"
  class="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-30 bg-primary-600 text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center text-3xl hover:bg-primary-700 transition-colors"
>+</button>

{#snippet setinhas(face: string, localId: number)}
  <div class="flex flex-col border-l border-slate-100">
    <button
      type="button"
      disabled={reordenandoId !== null}
      onclick={(e) => { e.stopPropagation(); moverLocal(face, localId, -1); }}
      aria-label="Mover pra cima"
      class="px-2 py-0.5 text-slate-400 hover:text-primary-600 disabled:opacity-40"
    ><Icon nome="chevron-down" size={12} class="rotate-180" /></button>
    <button
      type="button"
      disabled={reordenandoId !== null}
      onclick={(e) => { e.stopPropagation(); moverLocal(face, localId, 1); }}
      aria-label="Mover pra baixo"
      class="px-2 py-0.5 text-slate-400 hover:text-primary-600 disabled:opacity-40"
    ><Icon nome="chevron-down" size={12} /></button>
  </div>
{/snippet}

{#snippet botoes(u: UnidadeEnriquecida, l: LocalComUnidades)}
  {@const tipoEfetivo = u.id in overrideDesfecho ? overrideDesfecho[u.id] : u.ultimo_tipo}
  {@const cartaMarcada = u.id in overrideCarta ? overrideCarta[u.id] : !!u.carta_entregue}
  <div class="flex gap-1 flex-wrap" class:grid={modoSimples} class:grid-cols-2={modoSimples} class:gap-2={modoSimples}>
    {#each [
      { tipo: 'naoAtendeu', icone: 'door-closed', label: 'Não atendeu' },
      { tipo: 'semConversa', icone: 'door', label: 'Sem palestra' },
      { tipo: 'conversou', icone: 'chat', label: 'Conversou' }
    ] as const as opt}
      {@const ativo = tipoEfetivo === opt.tipo}
      <button
        type="button"
        onclick={() => marcarDesfechoFila(u, ativo ? '' : opt.tipo, l)}
        title={opt.label}
        aria-label={opt.label}
        class="rounded border transition-colors {modoSimples ? 'w-full text-base py-3 px-4' : 'px-3 py-1.5 text-sm'} {ativo ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-300 hover:bg-slate-100'}"
      >
        <Icon nome={opt.icone} size={16} /> <span>{opt.label}</span>
      </button>
    {/each}
    <button
      type="button"
      onclick={() => toggleCartaFila(u, !cartaMarcada, l)}
      title="Carta entregue"
      aria-label="Carta entregue"
      class="rounded border transition-colors {modoSimples ? 'w-full text-base py-3 px-4' : 'px-3 py-1.5 text-sm'} {cartaMarcada ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-300 hover:bg-slate-100'}"
    >
      <Icon nome="mail" size={14} /> <span>Carta</span>
    </button>
  </div>
{/snippet}

<script lang="ts">
  // "Estacionar perto" — pontos úteis em volta do território (Overpass/
  // OSM) + os pontos que a própria congregação salvou.
  //
  // Reescrito depois da queixa "nem sempre funciona". O que estava
  // errado, em ordem de gravidade:
  //  1. o sheet NÃO listava nada — jogava pinos no mapa e fechava; se o
  //     enquadramento não mexia (ou a seção errada estava ativa, no Casa
  //     a casa, que tem dois mapas), a sensação era de que nada
  //     aconteceu;
  //  2. cada categoria era um clique separado, e cada tentativa podia
  //     levar 13s por espelho da Overpass (3 espelhos = ~39s) com um
  //     "buscando..." discreto — o publicador desistia antes;
  //  3. erro e "não tem nada aqui" davam a MESMA mensagem;
  //  4. raio fixo de 800m a partir do centro médio do território: em
  //     território comprido, esse centro cai no meio do nada.
  // Transporte endurecido em $lib/utils/overpass.ts (corrida entre
  // espelhos, espelho bom lembrado, retry com o dobro do raio, erro
  // tipado); aqui está a parte de UI.
  import Icon from '$lib/ui/Icon.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import {
    buscarPOIs,
    categoriaLabel,
    categoriaIcone,
    urlRotaGoogleMaps,
    distanciaMetros,
    OverpassIndisponivel,
    REFERENCIAS,
    type CategoriaPOI,
    type POI
  } from '$lib/utils/overpass';
  import type { NomeIcone } from '$lib/ui/Icon.svelte';

  interface PoiMarcador {
    id: string;
    lat: number;
    lng: number;
    nome: string;
    icone: NomeIcone;
    cor?: string;
    url?: string;
  }

  /** Ponto salvo pela congregação (nome que todo mundo usa) */
  export interface PontoSalvo {
    id: number;
    nome: string;
    lat: number;
    lng: number;
    tipo?: string;
  }

  let {
    open = $bindable(false),
    centro,
    pois = $bindable<PoiMarcador[]>([]),
    pontosSalvos = [],
    podeSalvar = false,
    onSalvarPonto
  }: {
    open?: boolean;
    centro: { lat: number; lng: number } | null;
    pois?: PoiMarcador[];
    pontosSalvos?: PontoSalvo[];
    /** dirigente/admin: mostra o botão de salvar o ponto com nome nosso */
    podeSalvar?: boolean;
    onSalvarPonto?: (p: { nome: string; lat: number; lng: number; osmId: string }) => void;
  } = $props();

  const PARADA: CategoriaPOI[] = ['parking', 'square', 'fuel', 'supermarket'];
  const RAIOS = [400, 800, 1500];

  let raio = $state(800);
  let buscando = $state(false);
  let erro = $state<'sem_rede' | 'servidores' | null>(null);
  let achados = $state<POI[]>([]);
  let avisoRaio = $state<string | null>(null);
  let jaBuscou = $state(false);

  const COR_SALVO = '#d97706'; // âmbar: ponto nosso
  const COR_OSM = '#2563eb';

  const salvosOrdenados = $derived.by(() => {
    if (!centro) return pontosSalvos;
    return [...pontosSalvos].sort(
      (a, b) => distanciaMetros(centro, a) - distanciaMetros(centro, b)
    );
  });

  function metrosLegivel(m: number): string {
    return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`.replace('.', ',');
  }
  function distanciaDe(p: { lat: number; lng: number }): string {
    return centro ? metrosLegivel(distanciaMetros(centro, p)) : '';
  }

  function sincronizarPinos() {
    const doOsm: PoiMarcador[] = achados.map((p) => ({
      id: `poi-${p.id}`,
      lat: p.lat,
      lng: p.lng,
      nome: p.nome,
      icone: categoriaIcone(p.categoria) as NomeIcone,
      cor: COR_OSM,
      url: urlRotaGoogleMaps(p.lat, p.lng)
    }));
    const doNosso: PoiMarcador[] = pontosSalvos.map((p) => ({
      id: `salvo-${p.id}`,
      lat: p.lat,
      lng: p.lng,
      nome: p.nome,
      icone: 'estrela',
      cor: COR_SALVO,
      url: urlRotaGoogleMaps(p.lat, p.lng)
    }));
    pois = [...doNosso, ...doOsm];
  }

  async function buscar(categorias: CategoriaPOI[]) {
    if (!centro || buscando) return;
    buscando = true;
    erro = null;
    avisoRaio = null;
    try {
      const r = await buscarPOIs(centro.lat, centro.lng, raio, categorias);
      achados = r.pois;
      jaBuscou = true;
      if (r.ampliado) avisoRaio = `Nada em ${metrosLegivel(raio)} — mostrando até ${metrosLegivel(r.raioUsado)}`;
      sincronizarPinos();
      if (r.pois.length > 0) toast.success(`${r.pois.length} ponto(s) — toque num item pra abrir a rota`);
    } catch (e) {
      achados = [];
      jaBuscou = true;
      erro = e instanceof OverpassIndisponivel ? e.motivo : 'servidores';
    } finally {
      buscando = false;
    }
  }

  function limparPontos() {
    achados = [];
    jaBuscou = false;
    avisoRaio = null;
    pois = [];
  }

  async function compartilharRota() {
    if (!centro) return;
    const url = urlRotaGoogleMaps(centro.lat, centro.lng);
    const nav: any = navigator;
    if (nav.share) {
      try {
        await nav.share({ url, text: 'Rota até o território' });
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    }
    window.open(url, '_blank', 'noopener');
  }

  // Os pontos salvos não dependem de rede — aparecem no mapa assim que o
  // sheet abre, mesmo com a Overpass fora do ar.
  $effect(() => {
    const abriu = open;
    const qtd = pontosSalvos.length;
    if (abriu && qtd > 0 && pois.length === 0) sincronizarPinos();
  });
</script>

<BottomSheet bind:open title="Onde parar / referências">
  {#if !centro}
    <p class="text-sm text-amber-600">Sem coordenada de referência pra buscar por perto.</p>
  {:else}
    <div class="flex items-center gap-2 mb-3 flex-wrap">
      <span class="text-xs text-slate-500">Raio</span>
      {#each RAIOS as r}
        <button
          type="button"
          onclick={() => (raio = r)}
          class="px-2.5 py-1 rounded-full text-xs border {raio === r
            ? 'bg-primary-600 text-white border-primary-600'
            : 'border-slate-300 text-slate-600 hover:bg-slate-50'}"
        >{metrosLegivel(r)}</button>
      {/each}
    </div>

    <div class="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={buscando}
        onclick={() => buscar(PARADA)}
        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary-600 text-white disabled:opacity-40 text-sm font-medium"
      >
        <Icon nome="parking" size={16} /> Onde parar
      </button>
      <button
        type="button"
        disabled={buscando}
        onclick={() => buscar(REFERENCIAS)}
        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-primary-200 text-primary-700 hover:bg-primary-50 disabled:opacity-40 text-sm font-medium"
      >
        <Icon nome="banco" size={16} /> Referências
      </button>
    </div>
    {#if buscando}
      <p class="text-xs text-slate-500 mt-2 flex items-center gap-1">
        <Icon nome="loader" size={12} spin /> Buscando no OpenStreetMap...
      </p>
    {/if}
    {#if avisoRaio}
      <p class="text-xs text-amber-700 mt-2">{avisoRaio}</p>
    {/if}

    {#if erro}
      <div class="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
        {#if erro === 'sem_rede'}
          Sem internet agora. Os pontos que a congregação já salvou continuam na lista abaixo.
        {:else}
          Servidor de mapas do OpenStreetMap ocupado.
        {/if}
        <button type="button" class="block mt-2 underline text-amber-900" onclick={() => buscar(PARADA)}>
          Tentar de novo
        </button>
      </div>
    {/if}

    <!-- Pontos NOSSOS primeiro: é o nome que a congregação usa
         ("Banco do Brasil da Fernando") e não depende de rede. -->
    {#if salvosOrdenados.length > 0}
      <h3 class="text-xs font-semibold text-slate-500 mt-4 mb-1 uppercase tracking-wide">Pontos da congregação</h3>
      <ul class="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {#each salvosOrdenados as p}
          <li class="flex items-center gap-2 px-3 py-2">
            <Icon nome="estrela" size={16} class="text-amber-600 shrink-0" />
            <span class="text-sm flex-1 min-w-0 truncate">{p.nome}</span>
            <span class="text-xs text-slate-400 shrink-0">{distanciaDe(p)}</span>
            <a
              href={urlRotaGoogleMaps(p.lat, p.lng)}
              target="_blank"
              rel="noopener"
              class="text-xs text-primary-700 underline shrink-0"
            >Rota</a>
          </li>
        {/each}
      </ul>
    {/if}

    {#if achados.length > 0}
      <h3 class="text-xs font-semibold text-slate-500 mt-4 mb-1 uppercase tracking-wide">Encontrados no mapa</h3>
      <ul class="divide-y divide-slate-100 rounded-lg border border-slate-200 max-h-64 overflow-y-auto">
        {#each achados.slice(0, 25) as p}
          <li class="flex items-center gap-2 px-3 py-2">
            <Icon nome={categoriaIcone(p.categoria) as NomeIcone} size={16} class="text-primary-600 shrink-0" />
            <span class="text-sm flex-1 min-w-0">
              <span class="truncate block">{p.nome}</span>
              <span class="text-xs text-slate-400">{categoriaLabel(p.categoria)}</span>
            </span>
            <span class="text-xs text-slate-400 shrink-0">{distanciaDe(p)}</span>
            {#if podeSalvar && onSalvarPonto}
              <button
                type="button"
                title="Salvar com o nome que usamos"
                onclick={() => onSalvarPonto?.({ nome: p.nome, lat: p.lat, lng: p.lng, osmId: p.id })}
                class="text-amber-600 hover:text-amber-700 shrink-0"
              ><Icon nome="estrela" size={16} /></button>
            {/if}
            <a
              href={urlRotaGoogleMaps(p.lat, p.lng)}
              target="_blank"
              rel="noopener"
              class="text-xs text-primary-700 underline shrink-0"
            >Rota</a>
          </li>
        {/each}
      </ul>
    {:else if jaBuscou && !erro && !buscando}
      <p class="text-sm text-slate-500 mt-3">
        Nada encontrado num raio de {metrosLegivel(raio)}. Tente um raio maior.
      </p>
    {/if}

    <div class="mt-4 pt-3 border-t border-slate-100 space-y-2">
      {#if pois.length > 0}
        <button
          type="button"
          onclick={limparPontos}
          class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm"
        ><Icon nome="eraser" size={14} /> Limpar pontos do mapa</button>
      {/if}
      <button
        type="button"
        onclick={() => (open = false)}
        class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm"
      ><Icon nome="map" size={14} /> Ver no mapa</button>
      <button
        type="button"
        onclick={compartilharRota}
        class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm"
      ><Icon nome="share" size={14} /> Compartilhar rota até o território</button>
    </div>
  {/if}
</BottomSheet>

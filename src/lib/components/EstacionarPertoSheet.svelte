<script lang="ts">
  // "Estacionar perto" (recurso do app antigo, reconstruído do zero —
  // $lib/utils/overpass.ts já existia pronto mas órfão, nenhuma tela
  // usava). Sheet de categorias de POI (Overpass/OSM) em volta de um
  // ponto — clicar numa categoria busca e soma pinos no mapa (via
  // bind:pois, o chamador já tem um <AdminMapa pois={...}>); clicar num
  // pino no mapa abre rota no Google Maps (AdminMapa já suporta
  // `pois[].url` → window.open). "Compartilhar rota até o território"
  // é o mesmo urlRotaGoogleMaps, mas direto pro centro (sem precisar
  // achar um POI primeiro).
  import Icon from '$lib/ui/Icon.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { buscarPOIs, categoriaLabel, categoriaIcone, urlRotaGoogleMaps, type CategoriaPOI } from '$lib/utils/overpass';
  import type { NomeIcone } from '$lib/ui/Icon.svelte';

  interface PoiMarcador {
    id: string;
    lat: number;
    lng: number;
    nome: string;
    icone: NomeIcone;
    url?: string;
  }

  let {
    open = $bindable(false),
    centro,
    pois = $bindable<PoiMarcador[]>([])
  }: {
    open?: boolean;
    centro: { lat: number; lng: number } | null;
    pois?: PoiMarcador[];
  } = $props();

  const CATEGORIAS: CategoriaPOI[] = ['parking', 'square', 'pharmacy', 'bakery', 'fuel', 'supermarket'];
  const RAIO_METROS = 800;

  let buscando = $state<CategoriaPOI | null>(null);

  async function buscarCategoria(cat: CategoriaPOI) {
    if (!centro || buscando) return;
    buscando = cat;
    try {
      const encontrados = await buscarPOIs(centro.lat, centro.lng, RAIO_METROS, [cat]);
      const novos: PoiMarcador[] = encontrados.map((p) => ({
        id: `poi-${cat}-${p.id}`,
        lat: p.lat,
        lng: p.lng,
        nome: p.nome,
        icone: categoriaIcone(cat),
        url: urlRotaGoogleMaps(p.lat, p.lng)
      }));
      const idsNovos = new Set(novos.map((p) => p.id));
      pois = [...pois.filter((p) => !idsNovos.has(p.id)), ...novos];
      if (novos.length === 0) toast.info(`Nenhum(a) ${categoriaLabel(cat).toLowerCase()} encontrado(a) por perto`);
    } catch {
      toast.error('Falhou buscar — confira a conexão');
    } finally {
      buscando = null;
    }
  }

  function limparPontos() {
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
</script>

<BottomSheet bind:open title="Estacionar perto">
  <p class="text-sm text-slate-500 mb-3">
    Pontos próximos aparecem direto no mapa. Toque num ponto pra abrir rota no Google Maps.
  </p>
  <div class="space-y-2">
    {#each CATEGORIAS as cat}
      <button
        type="button"
        disabled={!centro || buscando !== null}
        onclick={() => buscarCategoria(cat)}
        class="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-primary-200 text-primary-700 hover:bg-primary-50 disabled:opacity-40 text-sm font-medium"
      >
        <Icon nome={categoriaIcone(cat)} size={18} />
        {categoriaLabel(cat)} por perto
        {#if buscando === cat}<span class="ml-auto text-xs text-slate-400">buscando...</span>{/if}
      </button>
    {/each}
  </div>

  {#if !centro}
    <p class="text-xs text-amber-600 mt-3">Sem coordenada de referência pra buscar por perto.</p>
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
      disabled={!centro}
      onclick={compartilharRota}
      class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 text-sm"
    ><Icon nome="share" size={14} /> Compartilhar rota até o território</button>
  </div>
</BottomSheet>

<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import CartaoTerritorio, { type QuadraContexto } from '$lib/components/CartaoTerritorio.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Toaster from '$lib/ui/Toaster.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';

  let { data }: { data: { territorio: any; token: string } } = $props();

  const t = data.territorio;

  // Quadras no shape que o AdminMapa espera (rota pública não tem status real)
  const quadrasMapa = (t.quadras ?? []).map((q: any) => ({
    id: q.id,
    color: q.color ?? '#3b82f6',
    status: 'pendente',
    territorio_id: null,
    qtd_locais: 0,
    poly_geojson: q.poly_geojson,
    ativa: true,
    data_conclusao: null
  }));

  // Prédios viram marcadores
  const poisPredios = (t.predios ?? [])
    .filter((p: any) => Array.isArray(p.geo_geojson?.coordinates))
    .map((p: any) => ({
      id: String(p.id),
      lat: p.geo_geojson.coordinates[1],
      lng: p.geo_geojson.coordinates[0],
      nome: p.nome || `${p.logradouro ?? ''}, ${p.numero ?? ''}`,
      icone: 'map-pin' as const
    }));

  let mapaRef: { exportarPng: () => Promise<string | null> } | null = $state(null);

  const titulo: string = t.tipo === 'arranjo' ? (t.titulo ?? 'Arranjo') : `Território de ${t.titulo}`;
  const urlPagina = $derived(typeof window !== 'undefined' ? window.location.href : '');

  function msgTexto(): string {
    const partes: string[] = [titulo];
    if (t.tipo === 'arranjo' && t.data) {
      partes.push(new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }) + (t.hora_inicio ? ` às ${t.hora_inicio.substring(0, 5)}` : ''));
    }
    if (t.local_endereco) partes.push(`${t.local_endereco}`);
    if ((t.quadras ?? []).length > 0) partes.push(`Quadras: ${(t.quadras as any[]).map((q) => q.id).join(', ')}`);
    return partes.join('\n');
  }

  function compartilharLink() {
    const msg = `${msgTexto()}\n\n${urlPagina}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  async function compartilharPng(png: string, nomeArquivo: string) {
    try {
      const blob = await (await fetch(png)).blob();
      const file = new File([blob], nomeArquivo, { type: 'image/png' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text: `${msgTexto()}\n\n${urlPagina}` });
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // usuário cancelou o share
    }
    // Fallback (desktop/navegador sem share de arquivo): baixa o PNG + abre WhatsApp
    const a = document.createElement('a');
    a.href = png;
    a.download = nomeArquivo;
    a.click();
    toast.info('Imagem baixada — anexa no WhatsApp');
    compartilharLink();
  }

  async function compartilharComImagem() {
    // E1: com contexto de território (token com quadras), abre o sheet do
    // Cartão S-12; sem quadras (só cartas/TCE), mantém o PNG cru do mapa.
    if (contextoQuadras.length > 0) {
      abrirSheetCartao();
      return;
    }
    const png = await mapaRef?.exportarPng();
    if (!png) { compartilharLink(); return; }
    await compartilharPng(png, 'territorio.png');
  }

  // === E1: Cartão de Mapa de Território (S-12) ===
  const contextoQuadras: QuadraContexto[] = (t.contexto?.quadras ?? []) as QuadraContexto[];
  const contextoTerritorios: { id: string; nome: string | null }[] = t.contexto?.territorios ?? [];
  const destaqueIds: string[] = (t.quadras ?? []).map((q: any) => String(q.id));
  const terrNumeros = $derived(contextoTerritorios.map((tr) => tr.nome?.trim() || tr.id).join(', '));

  let cartaoRef: { gerar: (o: { localidade: string; terrNumeros: string; basemap: string; limiarDias: number }) => Promise<string | null> } | null = $state(null);
  let sheetCartao = $state(false);
  let cartaoPng = $state<string | null>(null);
  let gerandoCartao = $state(false);
  let localidade = $state('');
  let fundoCartao = $state<'positron' | 'liberty' | 'bright'>('positron');
  let limiarMeses = $state(6);
  let previaDesatualizada = $state(false);
  let buscouLocalidade = false;

  // Localidade pré-preenchida por geocodificação reversa (Nominatim) do
  // centroide das quadras do token — campo continua editável (o OSM erra).
  async function preencherLocalidade() {
    if (buscouLocalidade || localidade) return;
    buscouLocalidade = true;
    try {
      const pontos: [number, number][] = [];
      for (const q of (t.quadras ?? []) as any[]) {
        const anel = q.poly_geojson?.coordinates?.[0] as [number, number][] | undefined;
        if (anel?.length) {
          const cLng = anel.reduce((s, p) => s + p[0], 0) / anel.length;
          const cLat = anel.reduce((s, p) => s + p[1], 0) / anel.length;
          pontos.push([cLng, cLat]);
        }
      }
      if (pontos.length === 0) return;
      const lng = pontos.reduce((s, p) => s + p[0], 0) / pontos.length;
      const lat = pontos.reduce((s, p) => s + p[1], 0) / pontos.length;
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=pt-BR`);
      if (!res.ok) return;
      const j = await res.json();
      const a = j?.address ?? {};
      localidade = a.suburb || a.neighbourhood || a.city_district || a.town || a.city || a.municipality || '';
    } catch {
      // sem geocoder, digita à mão
    }
  }

  async function gerarCartao() {
    if (!cartaoRef) return;
    gerandoCartao = true;
    try {
      const png = await cartaoRef.gerar({
        localidade: localidade.trim(),
        terrNumeros,
        basemap: fundoCartao,
        limiarDias: limiarMeses * 30
      });
      if (!png) {
        toast.error('Não deu pra montar o cartão — confira a conexão');
        return;
      }
      cartaoPng = png;
      previaDesatualizada = false;
    } finally {
      gerandoCartao = false;
    }
  }

  function abrirSheetCartao() {
    sheetCartao = true;
    void preencherLocalidade().then(() => {
      if (!cartaoPng) void gerarCartao();
    });
  }

  async function compartilharCartao() {
    if (previaDesatualizada || !cartaoPng) await gerarCartao();
    if (cartaoPng) await compartilharPng(cartaoPng, 'cartao-territorio.png');
  }
</script>

<svelte:head>
  <title>{titulo}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<Toaster />

<div class="min-h-screen bg-slate-50 pb-16">
  <!-- Header -->
  <div class="bg-primary-600 text-white px-4 py-5">
    <div class="text-xs opacity-80 mb-1">{t.tipo === 'arranjo' ? 'Saída de campo' : 'Território pessoal'}</div>
    <h1 class="text-xl font-bold">{titulo}</h1>
    <div class="text-sm opacity-90 mt-1 space-y-0.5">
      {#if t.tipo === 'arranjo' && t.data}
        <div><Icon nome="calendar" size={14} /> {new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}{t.hora_inicio ? ` · ${t.hora_inicio.substring(0, 5)}` : ''}</div>
      {/if}
      {#if t.prazo}
        <div><Icon nome="hourglass" size={14} /> Prazo: {new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
      {/if}
      {#if t.local_endereco}<div><Icon nome="map-pin" size={14} /> {t.local_endereco}</div>{/if}
    </div>
    {#if t.notas}<p class="mt-2 text-sm bg-white/10 rounded p-2 italic">{t.notas}</p>{/if}
  </div>

  <div class="p-4 space-y-4 max-w-3xl mx-auto">
    <!-- Mapa -->
    {#if quadrasMapa.length > 0 || poisPredios.length > 0}
      <AdminMapa bind:this={mapaRef} quadras={quadrasMapa} pois={poisPredios} altura={420} />
    {/if}

    <!-- Compartilhar -->
    <div class="flex gap-2">
      <Button variant="primary" onclick={compartilharComImagem} class="flex-1"><Icon nome="share" size={14} /> Compartilhar com imagem</Button>
      <Button variant="secondary" onclick={compartilharLink} class="flex-1"><Icon nome="link" size={14} /> Só o link</Button>
    </div>

    <!-- Lista textual (pra quem não carrega o mapa) -->
    {#if (t.quadras ?? []).length > 0}
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2"><Icon nome="door" size={14} /> Quadras ({t.quadras.length})</div>
        <div class="flex flex-wrap gap-1.5">
          {#each t.quadras as q}
            <span class="text-sm font-mono px-2 py-1 rounded border border-slate-200" style="border-left: 4px solid {q.color ?? '#3b82f6'}">{q.id}</span>
          {/each}
        </div>
      </div>
    {/if}

    {#if (t.predios ?? []).length > 0}
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2"><Icon nome="mail" size={14} /> Prédios ({t.predios.length})</div>
        <ul class="divide-y divide-slate-100">
          {#each t.predios as p}
            <li class="py-1.5 text-sm">
              <span class="font-medium">{p.nome || `${p.logradouro ?? ''}, ${p.numero ?? ''}`}</span>
              {#if p.nome}<span class="text-xs text-slate-500"> · {p.logradouro ?? ''}, {p.numero ?? ''}</span>{/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if t.tces && t.tces.length > 0}
      <div class="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
        <Icon nome="store" size={14} /> Território comercial: <strong>{t.tces.map((tc: any) => tc.nome).join(', ')}</strong>
      </div>
    {/if}

    <p class="text-center text-xs text-slate-400">
      Visualização somente leitura. Pra marcar o trabalho, <a href="/login" class="text-primary-700 hover:underline">entre no app</a>.
    </p>
  </div>
</div>

<!-- E1: mapa oculto que renderiza o cartão S-12 -->
{#if contextoQuadras.length > 0}
  <CartaoTerritorio bind:this={cartaoRef} quadras={contextoQuadras} {destaqueIds} />
{/if}

<BottomSheet bind:open={sheetCartao} title="Cartão de território">
  <div class="space-y-3">
    {#if gerandoCartao}
      <div class="h-56 rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
        <span class="inline-block w-6 h-6 rounded-full border-2 border-primary-300 border-t-primary-600 animate-spin"></span>
        Montando o cartão…
      </div>
    {:else if cartaoPng}
      <div class="relative">
        <img src={cartaoPng} alt="Prévia do cartão de território" class="w-full rounded-lg border border-slate-200" />
        {#if previaDesatualizada}
          <div class="absolute inset-0 rounded-lg bg-white/60 flex items-center justify-center">
            <Button variant="secondary" size="sm" onclick={gerarCartao}><Icon nome="refresh" size={14} /> Atualizar prévia</Button>
          </div>
        {/if}
      </div>
    {/if}

    <div>
      <label for="cartao-loc" class="block text-sm font-medium text-slate-700 mb-1">Localidade</label>
      <input
        id="cartao-loc"
        bind:value={localidade}
        oninput={() => (previaDesatualizada = true)}
        placeholder="Ex: Vila Esperança"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div>
        <label for="cartao-fundo" class="block text-sm font-medium text-slate-700 mb-1">Fundo do mapa</label>
        <select id="cartao-fundo" bind:value={fundoCartao} onchange={() => (previaDesatualizada = true)} class="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value="positron">Cinza</option>
          <option value="liberty">Colorido</option>
          <option value="bright">Brilhante</option>
        </select>
      </div>
      <div>
        <label for="cartao-limiar" class="block text-sm font-medium text-slate-700 mb-1">Feitas há pouco = últimos</label>
        <select id="cartao-limiar" bind:value={limiarMeses} onchange={() => (previaDesatualizada = true)} class="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
          <option value={3}>3 meses</option>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
        </select>
      </div>
    </div>

    <p class="text-xs text-slate-500">
      Terr. N.º <strong>{terrNumeros}</strong> — o cartão mostra todas as quadras
      desse(s) território(s): as designadas em destaque, as feitas há pouco com ✕
      vermelho e as demais em cinza.
    </p>

    <div class="flex gap-2 pt-1">
      <Button variant="primary" onclick={compartilharCartao} loading={gerandoCartao} class="flex-1"><Icon nome="share" size={14} /> Compartilhar cartão</Button>
      <Button variant="secondary" onclick={gerarCartao} loading={gerandoCartao}><Icon nome="refresh" size={14} /></Button>
    </div>
  </div>
</BottomSheet>

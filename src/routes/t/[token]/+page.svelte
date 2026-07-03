<script lang="ts">
  import AdminMapa from '$lib/components/AdminMapa.svelte';
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
      emoji: '✉'
    }));

  let mapaRef: { exportarPng: () => Promise<string | null> } | null = $state(null);

  const titulo: string = t.tipo === 'arranjo' ? (t.titulo ?? 'Arranjo') : `Território de ${t.titulo}`;
  const urlPagina = $derived(typeof window !== 'undefined' ? window.location.href : '');

  function msgTexto(): string {
    const partes: string[] = [titulo];
    if (t.tipo === 'arranjo' && t.data) {
      partes.push(new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }) + (t.hora_inicio ? ` às ${t.hora_inicio.substring(0, 5)}` : ''));
    }
    if (t.local_endereco) partes.push(`📍 ${t.local_endereco}`);
    if ((t.quadras ?? []).length > 0) partes.push(`Quadras: ${(t.quadras as any[]).map((q) => q.id).join(', ')}`);
    return partes.join('\n');
  }

  function compartilharLink() {
    const msg = `${msgTexto()}\n\n${urlPagina}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  async function compartilharComImagem() {
    const png = await mapaRef?.exportarPng();
    if (!png) { compartilharLink(); return; }
    try {
      const blob = await (await fetch(png)).blob();
      const file = new File([blob], 'territorio.png', { type: 'image/png' });
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
    a.download = 'territorio.png';
    a.click();
    toast.info('Mapa baixado — anexa no WhatsApp');
    compartilharLink();
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
        <div>📅 {new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}{t.hora_inicio ? ` · ${t.hora_inicio.substring(0, 5)}` : ''}</div>
      {/if}
      {#if t.prazo}
        <div>⏳ Prazo: {new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
      {/if}
      {#if t.local_endereco}<div>📍 {t.local_endereco}</div>{/if}
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
      <Button variant="primary" onclick={compartilharComImagem} class="flex-1">📤 Compartilhar com imagem</Button>
      <Button variant="secondary" onclick={compartilharLink} class="flex-1">🔗 Só o link</Button>
    </div>

    <!-- Lista textual (pra quem não carrega o mapa) -->
    {#if (t.quadras ?? []).length > 0}
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">🚪 Quadras ({t.quadras.length})</div>
        <div class="flex flex-wrap gap-1.5">
          {#each t.quadras as q}
            <span class="text-sm font-mono px-2 py-1 rounded border border-slate-200" style="border-left: 4px solid {q.color ?? '#3b82f6'}">{q.id}</span>
          {/each}
        </div>
      </div>
    {/if}

    {#if (t.predios ?? []).length > 0}
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">✉ Prédios ({t.predios.length})</div>
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

    {#if t.tce}
      <div class="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
        🏪 Território comercial: <strong>{t.tce.nome}</strong>
      </div>
    {/if}

    <p class="text-center text-xs text-slate-400">
      Visualização somente leitura. Pra marcar o trabalho, <a href="/login" class="text-primary-700 hover:underline">entre no app</a>.
    </p>
  </div>
</div>

<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaAdmin from '$lib/components/MapaAdmin.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo } from '$lib/server/queries';

  let { data, form }: { data: { quadras: QuadraGeo[]; quadrasAlocadas: string[] }; form: any } = $props();

  let selecionadas = $state<Set<string>>(new Set());
  let dataConclusao = $state(new Date().toISOString().substring(0, 10));
  let mostrarRotulos = $state(true);
  let basemap = $state<'positron' | 'liberty' | 'bright'>('positron');
  let sheetDetalhe = $state(false);
  let quadraDetalhe = $state<QuadraGeo | null>(null);
  let salvando = $state(false);

  function onClickQuadra(q: QuadraGeo) {
    if (selecionadas.has(q.id)) selecionadas.delete(q.id);
    else selecionadas.add(q.id);
    selecionadas = new Set(selecionadas);
  }

  function onLongPress(q: QuadraGeo) {
    quadraDetalhe = q;
    sheetDetalhe = true;
  }

  function limpar() { selecionadas = new Set(); }

  function diasDesde(s: string | null): number | null {
    if (!s) return null;
    const d = new Date(s + 'T12:00:00').getTime();
    return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  }

  const stats = $derived.by(() => {
    const semNunca = data.quadras.filter((q) => q.status !== 'inativa' && !q.data_conclusao).length;
    const recentes = data.quadras.filter((q) => {
      const d = diasDesde(q.data_conclusao);
      return d != null && d < 30;
    }).length;
    const velhas = data.quadras.filter((q) => {
      const d = diasDesde(q.data_conclusao);
      return d != null && d > 90;
    }).length;
    return { semNunca, recentes, velhas };
  });
</script>

<div class="p-4 space-y-3">
  <div class="flex items-center justify-between flex-wrap gap-2">
    <div>
      <h1 class="text-2xl font-bold">Registro</h1>
      <p class="text-sm text-slate-500">Click numa quadra pra selecionar. Long-press abre detalhes.</p>
    </div>
    <div class="flex items-center gap-2">
      <select bind:value={basemap} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" title="Mapa base">
        <option value="positron">Cinza</option>
        <option value="liberty">Colorido</option>
        <option value="bright">Brilhante</option>
      </select>
      <label class="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="checkbox" bind:checked={mostrarRotulos} class="w-4 h-4 rounded" />
        Rótulos
      </label>
    </div>
  </div>

  <!-- Legenda gradient -->
  <div class="flex items-center gap-3 text-xs flex-wrap">
    <span class="font-medium text-slate-600">Idade:</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-green-500/60"></span>&lt;15d</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-yellow-400/60"></span>&lt;30d</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-orange-500/60"></span>&lt;60d</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-red-600/60"></span>&gt;90d</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-slate-400/30"></span>nunca</span>
  </div>

  <!-- Stats compactos -->
  <div class="grid grid-cols-3 gap-2 text-center">
    <div class="rounded-lg bg-green-50 p-2">
      <div class="text-lg font-bold text-green-700">{stats.recentes}</div>
      <div class="text-[10px] text-slate-500 uppercase">&lt;30d</div>
    </div>
    <div class="rounded-lg bg-red-50 p-2">
      <div class="text-lg font-bold text-red-700">{stats.velhas}</div>
      <div class="text-[10px] text-slate-500 uppercase">&gt;90d</div>
    </div>
    <div class="rounded-lg bg-slate-100 p-2">
      <div class="text-lg font-bold text-slate-700">{stats.semNunca}</div>
      <div class="text-[10px] text-slate-500 uppercase">nunca</div>
    </div>
  </div>

  <MapaAdmin
    quadras={data.quadras}
    altura={500}
    colorirPor="idade"
    {mostrarRotulos}
    quadrasAlocadas={data.quadrasAlocadas}
    bind:selecionadas
    bind:basemap
    onClick={onClickQuadra}
    {onLongPress}
  />
</div>

<!-- Barra inferior quando tem seleção -->
{#if selecionadas.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium">
      <strong>{selecionadas.size}</strong> selecionada(s)
    </div>
    <form
      method="POST"
      action="?/marcarConcluidas"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            toast.success((result.data as any)?.msg || 'Concluídas');
            limpar();
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="flex items-center gap-2 ml-auto"
    >
      {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
      <input
        name="data"
        type="date"
        bind:value={dataConclusao}
        class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      />
      <Button variant="success" size="sm" type="submit" loading={salvando}>✓ Concluir</Button>
    </form>
    <form
      method="POST"
      action="?/reverter"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.info('Revertidas'); limpar(); await invalidateAll(); }
      }}
    >
      {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
      <Button variant="secondary" size="sm" type="submit">↻ Reverter</Button>
    </form>
    <Button variant="ghost" size="sm" onclick={limpar}>Limpar</Button>
  </div>
{/if}

<!-- Sheet detalhe (long-press) -->
<BottomSheet bind:open={sheetDetalhe} title={quadraDetalhe ? `Quadra ${quadraDetalhe.id}` : ''}>
  {#if quadraDetalhe}
    {@const dias = diasDesde(quadraDetalhe.data_conclusao)}
    <div class="space-y-2 text-sm">
      <div><span class="text-slate-500">Território:</span> <span class="font-medium">{quadraDetalhe.territorio_nome || '—'}</span></div>
      <div><span class="text-slate-500">Status:</span> <span class="font-medium">{quadraDetalhe.status}</span></div>
      <div><span class="text-slate-500">Endereços:</span> <span class="font-medium">{quadraDetalhe.qtd_locais}</span></div>
      <div>
        <span class="text-slate-500">Última conclusão:</span>
        {#if quadraDetalhe.data_conclusao}
          <span class="font-medium">{quadraDetalhe.data_conclusao}</span>
          <span class="text-xs text-slate-400 ml-1">({dias}d atrás)</span>
        {:else}
          <span class="font-medium text-slate-400">nunca</span>
        {/if}
      </div>
      {#if quadraDetalhe.notas}
        <div><span class="text-slate-500">Notas:</span> <span class="italic">{quadraDetalhe.notas}</span></div>
      {/if}
    </div>
  {/if}
</BottomSheet>

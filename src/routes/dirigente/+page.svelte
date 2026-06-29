<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo, DesignacaoEnriquecida } from '$lib/server/queries';

  let { data, form }: { data: { quadras: QuadraGeo[]; designacoesAbertas: DesignacaoEnriquecida[] }; form: any } = $props();

  let quadraSel: QuadraGeo | null = $state(null);
  let sheetOpen = $state(false);
  let dataConclusao = $state(new Date().toISOString().substring(0, 10));
  let salvando = $state(false);

  function abrirQuadra(q: QuadraGeo) {
    quadraSel = q;
    sheetOpen = true;
    dataConclusao = new Date().toISOString().substring(0, 10);
  }

  const designacoesQuadra = $derived(
    quadraSel
      ? data.designacoesAbertas.filter((d) => d.quadras_ids.includes(quadraSel!.id))
      : []
  );
</script>

<div class="flex items-end justify-between flex-wrap gap-3">
  <div>
    <h1 class="text-2xl font-bold">Mapa do dirigente</h1>
    <p class="text-sm text-slate-500 mt-1">Click numa quadra pra concluir ou ver detalhes</p>
  </div>
</div>

<div class="mt-4">
  <AdminMapa quadras={data.quadras} altura={620} onQuadraClick={abrirQuadra} />
</div>

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

      {#if quadraSel.status === 'concluido'}
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

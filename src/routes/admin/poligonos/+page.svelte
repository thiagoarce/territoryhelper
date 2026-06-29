<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';

  let { data, form }: { data: any; form: any } = $props();

  let aba: 'vincular' | 'auditar' | 'renomear' = $state('vincular');
  let renomeando: string | null = $state(null);
  let sheetRenomeio = $state(false);
  let salvando = $state(false);
  let buscaRenomear = $state('');

  const quadrasFiltradas = $derived(
    !buscaRenomear.trim() ? data.quadrasParaRenomear
    : data.quadrasParaRenomear.filter((q: any) => q.id.toLowerCase().includes(buscaRenomear.toLowerCase()))
  );

  function abrirRenomeio(id: string) {
    renomeando = id;
    sheetRenomeio = true;
  }
</script>

<div>
  <h1 class="text-2xl font-bold">Polígonos</h1>
  <p class="text-sm text-slate-500 mt-1">Vincular endereços a quadras, auditar inconsistências, renomear</p>
</div>

<!-- Abas -->
<div class="mt-4 flex gap-2 border-b border-slate-200">
  {#each [['vincular', `Sem quadra (${data.semQuadra.length})`], ['auditar', `Auditar (${data.quadrasMultiCluster.length + data.quadrasVazias.length})`], ['renomear', 'Renomear']] as [k, l]}
    <button
      onclick={() => (aba = k as any)}
      class="border-b-2 px-3 py-2 text-sm font-medium transition-colors"
      class:border-primary-600={aba === k}
      class:text-primary-700={aba === k}
      class:border-transparent={aba !== k}
      class:text-slate-500={aba !== k}
    >{l}</button>
  {/each}
</div>

{#if form?.msg}
  <div class="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{form.msg}</div>
{/if}
{#if form?.erro}
  <div class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{form.erro}</div>
{/if}

<!-- Vincular -->
{#if aba === 'vincular'}
  <div class="mt-4 space-y-4">
    {#if data.semQuadra.length === 0}
      <Card padding="md">
        <div class="flex items-start gap-3">
          <div class="text-2xl">✓</div>
          <div>
            <div class="font-semibold text-green-700">Tudo vinculado!</div>
            <div class="text-sm text-slate-600 mt-1">
              Todos os endereços estão associados a uma quadra. O trabalho que foi feito na planilha original
              foi preservado na migração.
            </div>
            <div class="text-xs text-slate-500 mt-2">
              O <strong>auto-vincular</strong> só roda em endereços NOVOS sem quadra (não sobrescreve trabalho manual).
              Útil quando: você cadastra endereços novos sem quadra, ou importa endereços do IBGE.
            </div>
          </div>
        </div>
      </Card>
    {:else}
      <Card padding="md">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex-1">
            <div class="font-semibold">{data.semQuadra.length} endereço(s) sem quadra</div>
            <div class="text-sm text-slate-500">Auto-vincular usa PostGIS pra detectar a quadra que contém cada ponto (não sobrescreve vinculações existentes)</div>
          </div>
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
            <Button variant="primary" type="submit" loading={salvando}>⚡ Auto-vincular</Button>
          </form>
        </div>
      </Card>

      <div class="space-y-1 max-h-[60vh] overflow-y-auto">
        {#each data.semQuadra as l (l.id)}
          <Card padding="sm">
            <div class="flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">{l.logradouro}, {l.numero}</div>
                <div class="text-xs text-slate-500">
                  {l.tipo}{l.setor ? ' · setor ' + l.setor : ''}{l.quadra_ibge ? ' · IBGE ' + l.quadra_ibge : ''}
                </div>
              </div>
              {#if !l.geo_geojson}
                <span class="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">sem coord</span>
              {/if}
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<!-- Auditar -->
{#if aba === 'auditar'}
  <div class="mt-4 space-y-4">
    {#if data.quadrasMultiCluster.length > 0}
      <div>
        <h3 class="font-semibold mb-2 text-amber-700">⚠ Quadras com múltiplos clusters IBGE</h3>
        <div class="text-sm text-slate-500 mb-2">
          Endereços com diferentes setor/quadra-IBGE foram vinculados à mesma quadra. Pode ser intencional ou erro humano.
        </div>
        <div class="space-y-2">
          {#each data.quadrasMultiCluster as item}
            <Card padding="md">
              <div class="font-mono font-semibold mb-2">{item.quadra_id}</div>
              <ul class="text-sm space-y-1">
                {#each item.clusters as c}
                  <li class="flex justify-between">
                    <span class="font-mono text-xs">{c.cluster}</span>
                    <span class="text-slate-500">{c.qtd} endereço(s)</span>
                  </li>
                {/each}
              </ul>
            </Card>
          {/each}
        </div>
      </div>
    {/if}

    {#if data.quadrasVazias.length > 0}
      <div>
        <h3 class="font-semibold mb-2 text-red-700">∅ Quadras sem nenhum endereço</h3>
        <div class="flex flex-wrap gap-2">
          {#each data.quadrasVazias as qid}
            <span class="font-mono text-sm bg-red-50 text-red-700 px-3 py-1 rounded border border-red-200">{qid}</span>
          {/each}
        </div>
      </div>
    {/if}

    {#if data.quadrasMultiCluster.length === 0 && data.quadrasVazias.length === 0}
      <div class="text-center text-slate-400 py-10">✓ Nada pra auditar</div>
    {/if}
  </div>
{/if}

<!-- Renomear -->
{#if aba === 'renomear'}
  <div class="mt-4 space-y-3">
    <Card padding="md">
      <div class="text-sm">
        Renomear uma quadra propaga o novo ID em <strong>locais</strong> e <strong>designacao_quadras</strong>.
        Use pra padronizar (ex: <code class="bg-slate-100 px-1 rounded">10A</code> → <code class="bg-slate-100 px-1 rounded">Q-10A</code>).
      </div>
    </Card>

    <input
      type="search"
      bind:value={buscaRenomear}
      placeholder="Buscar quadra..."
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
    />

    <div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
      {#each quadrasFiltradas as q}
        <button
          type="button"
          onclick={() => abrirRenomeio(q.id)}
          class="px-2 py-2 rounded border border-slate-200 hover:border-primary-500 hover:bg-primary-50 text-left transition-colors"
        >
          <div class="flex items-center gap-1">
            <span class="inline-block w-2 h-2 rounded" style:background-color={q.color}></span>
            <span class="font-mono font-semibold text-sm">{q.id}</span>
          </div>
          <div class="text-xs text-slate-400">{q.status}</div>
        </button>
      {/each}
    </div>
  </div>
{/if}

<BottomSheet bind:open={sheetRenomeio} title={renomeando ? `Renomear quadra ${renomeando}` : ''}>
  {#if renomeando}
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
            sheetRenomeio = false;
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-3"
    >
      <input type="hidden" name="id_antigo" value={renomeando} />
      <div>
        <label for="id_novo" class="block text-sm font-medium mb-1">Novo ID</label>
        <input
          id="id_novo"
          name="id_novo"
          required
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <p class="text-xs text-slate-500 mt-1">Cuidado: não pode ser ID já usado.</p>
      </div>
      <div class="flex gap-2">
        <Button variant="secondary" onclick={() => (sheetRenomeio = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvando} class="flex-1">Renomear</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

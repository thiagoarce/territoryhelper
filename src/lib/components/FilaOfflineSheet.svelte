<script lang="ts">
  // W10 ("fila 2.0"): tela de revisão da fila de escrita offline — lista
  // cada item pendente/com erro com descrição legível, e deixa o
  // publicador tentar de novo ou descartar item por item (em vez de só
  // um "tentar tudo" às cegas). Aberta pelo botão "Ver fila" do banner
  // global (+layout.svelte).
  import { onMount } from 'svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { listarFila, reenviarItem, descartarItem, type ItemFila } from '$lib/offline';
  import { invalidateAll } from '$app/navigation';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let itens = $state<ItemFila[]>([]);
  let ocupadoId = $state<number | null>(null);

  async function recarregar() {
    itens = await listarFila();
  }

  $effect(() => {
    if (open) void recarregar();
  });

  onMount(() => {
    void recarregar();
  });

  function fmtHora(ts: number): string {
    return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  async function tentarDeNovo(item: ItemFila) {
    ocupadoId = item.id;
    const r = await reenviarItem(item.id);
    ocupadoId = null;
    if (r === 'sucesso') {
      toast.success('Sincronizado');
      await invalidateAll();
    } else if (r === 'sem_rede') {
      toast.info('Ainda sem sinal — vai sincronizar sozinho quando voltar');
    } else if (r === 'erro') {
      toast.error('Recusado de novo pelo servidor');
    }
    await recarregar();
  }

  async function descartar(item: ItemFila) {
    if (!confirm(`Descartar "${item.descricao}"? Essa ação não vai ser sincronizada.`)) return;
    ocupadoId = item.id;
    await descartarItem(item.id);
    ocupadoId = null;
    await recarregar();
  }
</script>

<BottomSheet bind:open title="Fila offline">
  {#if itens.length === 0}
    <div class="text-center py-8 text-slate-400">
      <Icon nome="check" size={32} class="mx-auto mb-2" />
      <p class="text-sm">Nada pendente — tudo sincronizado.</p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each itens as item (item.id)}
        <div class="rounded-lg border p-3 {item.status === 'erro' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-sm font-medium truncate">{item.descricao}</div>
              <div class="text-xs text-slate-400 mt-0.5">{fmtHora(item.criadoEm)}</div>
              {#if item.status === 'erro' && item.erro}
                <div class="text-xs text-red-700 mt-1"><Icon nome="alert" size={12} /> {item.erro}</div>
              {:else}
                <div class="text-xs text-amber-700 mt-1">Aguardando sinal pra sincronizar</div>
              {/if}
            </div>
          </div>
          <div class="flex gap-2 mt-2">
            <button
              type="button"
              onclick={() => tentarDeNovo(item)}
              disabled={ocupadoId === item.id}
              class="flex-1 text-xs font-semibold px-2 py-1.5 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-1"
            ><Icon nome="refresh" size={12} /> Tentar de novo</button>
            <button
              type="button"
              onclick={() => descartar(item)}
              disabled={ocupadoId === item.id}
              class="text-xs font-medium px-2 py-1.5 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1"
            ><Icon nome="trash" size={12} /> Descartar</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</BottomSheet>

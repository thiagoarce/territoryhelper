<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { TceEndereco } from './$types';

  let { data }: {
    data: {
      tce: { id: string; nome: string; tipo: string; prazo: string | null; status: string; notas: string | null };
      enderecos: TceEndereco[];
    };
  } = $props();

  const feitos = $derived(data.enderecos.filter((e) => e.ultimoTipo || e.cartaEntregue).length);

  function rotuloDesfecho(t: string | null): string {
    if (t === 'conversou') return '✓ conversou';
    if (t === 'semConversa') return '📞 sem palestra';
    if (t === 'naoAtendeu') return '🚪 não atendeu';
    return '';
  }
</script>

<div class="p-4 space-y-3 pb-24">
  <div>
    <a href="/publicador" class="text-sm text-primary-700">← Voltar</a>
    <h1 class="text-2xl font-bold mt-1">🏪 {data.tce.nome}</h1>
    <p class="text-sm text-slate-500">
      {data.enderecos.length} endereço(s) · {feitos} trabalhado(s)
      {#if data.tce.prazo}· prazo {data.tce.prazo}{/if}
    </p>
  </div>

  {#if data.tce.notas}
    <Card padding="sm"><div class="text-sm text-slate-600 italic">{data.tce.notas}</div></Card>
  {/if}

  <div class="space-y-2">
    {#each data.enderecos as e (e.unidade_id)}
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="font-medium truncate">
          {e.nome || `${e.logradouro}, ${e.numero}`}
          {#if e.complemento}<span class="text-slate-400 text-sm">· {e.complemento}</span>{/if}
        </div>
        <div class="text-xs text-slate-500 truncate mt-0.5">{e.logradouro}, {e.numero}</div>

        {#if e.ultimoTipo}
          <div class="text-xs text-green-700 mt-1">{rotuloDesfecho(e.ultimoTipo)}</div>
        {/if}

        <div class="mt-2 flex gap-1.5 flex-wrap">
          {#each [['naoAtendeu', '🚪'], ['semConversa', '📞'], ['conversou', '✓']] as [tipo, icon]}
            <form
              method="POST"
              action="?/marcarDesfecho"
              use:enhance={() => async ({ result, update }) => {
                await update();
                if (result.type === 'success') await invalidateAll();
                else if (result.type === 'failure') toast.error('Falhou');
              }}
            >
              <input type="hidden" name="unidade_id" value={e.unidade_id} />
              <input type="hidden" name="tipo" value={e.ultimoTipo === tipo ? '' : tipo} />
              <button type="submit"
                class="w-10 h-10 rounded-lg border flex items-center justify-center text-lg"
                class:bg-green-100={e.ultimoTipo === tipo}
                class:border-green-500={e.ultimoTipo === tipo}
                class:border-slate-200={e.ultimoTipo !== tipo}
              >{icon}</button>
            </form>
          {/each}

          <form
            method="POST"
            action="?/toggleCarta"
            use:enhance={() => async ({ result, update }) => {
              await update();
              if (result.type === 'success') await invalidateAll();
            }}
          >
            <input type="hidden" name="unidade_id" value={e.unidade_id} />
            <input type="hidden" name="undo" value={String(e.cartaEntregue)} />
            <button type="submit"
              class="w-10 h-10 rounded-lg border flex items-center justify-center text-lg"
              class:bg-purple-100={e.cartaEntregue}
              class:border-purple-500={e.cartaEntregue}
              class:border-slate-200={!e.cartaEntregue}
              title="Carta entregue"
            >✉</button>
          </form>
        </div>
      </div>
    {:else}
      <Card padding="md"><div class="text-center text-slate-400 py-6">Sem endereços neste TCE.</div></Card>
    {/each}
  </div>
</div>

<!-- Barra de concluir -->
{#if data.tce.status === 'aberto'}
  <div class="fixed bottom-16 left-0 right-0 z-20 p-3">
    <form
      method="POST"
      action="?/concluir"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success('TCE concluído'); await invalidateAll(); }
      }}
      onsubmit={(e) => { if (!confirm('Concluir este TCE?')) e.preventDefault(); }}
    >
      <input type="hidden" name="id" value={data.tce.id} />
      <Button variant="success" type="submit" class="w-full">✓ Concluir TCE</Button>
    </form>
  </div>
{/if}

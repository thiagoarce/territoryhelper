<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let { data }: { data: any } = $props();

  let q = $state(data.q);
  let timer: any = null;
  $effect(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const url = new URL(window.location.href);
      if (q) url.searchParams.set('q', q);
      else url.searchParams.delete('q');
      if (url.search !== window.location.search) goto(url.toString(), { keepFocus: true, noScroll: true, replaceState: true });
    }, 250);
  });
</script>

<div>
  <h1 class="text-2xl font-bold mb-1">Buscar</h1>
  <p class="text-sm text-slate-500">Quadras, endereços, prédios</p>
</div>

<input
  type="search"
  bind:value={q}
  placeholder="Digite ID da quadra, nome do prédio, logradouro..."
  autofocus
  class="mt-4 w-full rounded-lg border border-slate-300 px-4 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
/>

{#if data.q}
  <div class="mt-4 space-y-6">
    {#if data.quadras.length > 0}
      <section>
        <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Quadras ({data.quadras.length})</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {#each data.quadras as q}
            <a href="/publicador/quadra/{encodeURIComponent(q.id)}" class="p-2 rounded-lg border border-slate-200 hover:border-primary-500 hover:bg-primary-50">
              <div class="flex items-center gap-1">
                <span class="inline-block w-2 h-2 rounded" style:background-color={q.color}></span>
                <span class="font-mono font-semibold text-sm">{q.id}</span>
              </div>
              <div class="text-xs text-slate-500">{q.status}</div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    {#if data.locais.length > 0}
      <section>
        <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Endereços ({data.locais.length})</h2>
        <div class="space-y-1">
          {#each data.locais as l}
            <a
              href={l.tipo === 'predio' ? '/admin/cartas/' + l.id : '/publicador/quadra/' + encodeURIComponent(l.quadra_id || '')}
              class="block p-2 rounded-lg border border-slate-200 hover:border-primary-500 hover:bg-primary-50"
            >
              <div class="text-sm font-medium">{l.nome || `${l.logradouro}, ${l.numero}`}</div>
              <div class="text-xs text-slate-500">
                {l.tipo} · {l.logradouro}, {l.numero}{l.quadra_id ? ' · quadra ' + l.quadra_id : ''}
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    {#if data.quadras.length === 0 && data.locais.length === 0}
      <div class="text-center text-slate-400 py-10">Nada encontrado pra "{data.q}".</div>
    {/if}
  </div>
{/if}

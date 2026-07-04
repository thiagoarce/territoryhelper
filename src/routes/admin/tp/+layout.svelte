<script lang="ts">
  import TpNav from '$lib/components/TpNav.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="p-4 pb-2">
  <h1 class="text-2xl font-bold">Testemunho público</h1>
  <p class="text-sm text-slate-500">Agenda por equipamento, pontos e catálogo.</p>
</div>

<div class="md:flex md:items-start md:px-4">
  <TpNav />
  <div class="flex-1 min-w-0">
    {@render children()}
  </div>
</div>

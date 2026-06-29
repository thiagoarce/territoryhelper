<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    icon = '📭',
    titulo,
    descricao,
    children
  }: {
    icon?: string;
    titulo: string;
    descricao?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="flex flex-col items-center text-center py-10 px-4">
  <div class="text-5xl mb-3 opacity-60">{icon}</div>
  <div class="text-base font-medium text-slate-700">{titulo}</div>
  {#if descricao}
    <div class="text-sm text-slate-500 mt-1 max-w-md">{descricao}</div>
  {/if}
  {#if children}
    <div class="mt-4">{@render children()}</div>
  {/if}
</div>

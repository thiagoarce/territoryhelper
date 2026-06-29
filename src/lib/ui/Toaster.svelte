<script lang="ts">
  import { toast, type ToastTipo } from './toast.svelte';
  import { fly } from 'svelte/transition';

  const cores: Record<ToastTipo, string> = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    warn: 'bg-amber-500 text-white',
    info: 'bg-slate-800 text-white'
  };

  const icones: Record<ToastTipo, string> = {
    success: '✓',
    error: '✕',
    warn: '⚠',
    info: 'ℹ'
  };
</script>

<div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
  {#each [...toast.itens.values()] as item (item.id)}
    <button
      type="button"
      onclick={() => toast.dismiss(item.id)}
      transition:fly={{ x: 20, duration: 200 }}
      class="pointer-events-auto flex items-center gap-2 rounded-lg shadow-lg px-4 py-3 text-sm font-medium hover:opacity-90 {cores[item.tipo]}"
    >
      <span class="text-lg">{icones[item.tipo]}</span>
      <span class="text-left">{item.msg}</span>
    </button>
  {/each}
</div>

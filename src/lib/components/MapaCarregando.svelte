<script lang="ts">
  let { demorando = false, travado = false }: { demorando?: boolean; travado?: boolean } = $props();
</script>

<div class="absolute inset-0 flex items-center justify-center bg-slate-100/85 backdrop-blur-[1px] z-[5]">
  {#if travado}
    <div class="text-center text-sm text-slate-600 px-4">
      <p>Não foi possível carregar o mapa.</p>
      <button
        type="button"
        onclick={() => location.reload()}
        class="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700"
      >
        Tentar de novo
      </button>
    </div>
  {:else}
    <div class="flex flex-col items-center gap-2 text-slate-500 text-sm">
      <svg class="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span>{demorando ? 'Ainda carregando...' : 'Carregando mapa...'}</span>
    </div>
  {/if}
</div>

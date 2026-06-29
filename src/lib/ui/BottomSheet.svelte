<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  let {
    open = $bindable(false),
    title,
    children,
    footer
  }: {
    open?: boolean;
    title?: string;
    children?: Snippet;
    footer?: Snippet;
  } = $props();

  function fechar() { open = false; }

  // Scroll lock no body quando sheet aberto + ESC fecha
  $effect(() => {
    if (typeof document === 'undefined') return;
    if (open) {
      document.body.style.overflow = 'hidden';
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
      window.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', onKey);
      };
    } else {
      document.body.style.overflow = '';
    }
  });
</script>

{#if open}
  <div
    class="fixed inset-0 z-40 bg-slate-900/50"
    onclick={fechar}
    transition:fade={{ duration: 150 }}
  ></div>
  <div
    class="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col"
    transition:fly={{ y: 400, duration: 250 }}
  >
    <!-- Handle/grabber visual -->
    <div class="pt-2 pb-1 flex justify-center">
      <div class="w-10 h-1.5 rounded-full bg-slate-300"></div>
    </div>
    {#if title}
      <div class="px-5 pb-3 border-b border-slate-100 flex items-center justify-between">
        <h2 class="text-lg font-semibold">{title}</h2>
        <button onclick={fechar} aria-label="Fechar" class="text-2xl text-slate-400 hover:text-slate-700 leading-none">×</button>
      </div>
    {/if}
    <div class="flex-1 overflow-y-auto p-5">
      {#if children}{@render children()}{/if}
    </div>
    {#if footer}
      <div class="px-5 py-4 border-t border-slate-100 bg-slate-50">
        {@render footer()}
      </div>
    {/if}
  </div>
{/if}

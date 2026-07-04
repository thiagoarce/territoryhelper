<script lang="ts">
  // Navegação das 5 seções de Testemunho Público. Sidebar de verdade só no
  // desktop (dentro de /admin/tp/*, exceção pontual — o app não tem sidebar
  // persistente em nenhuma outra tela); no mobile vira botão + BottomSheet
  // (não dá pra manter sidebar fixa roubando espaço da agenda).
  import Icon from '$lib/ui/Icon.svelte';
  import type { NomeIcone } from '$lib/ui/Icon.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { page } from '$app/stores';

  const ITENS: { href: string; label: string; icone: NomeIcone }[] = [
    { href: '/admin/tp', label: 'Planner', icone: 'calendar' },
    { href: '/admin/tp/geral', label: 'Visão geral', icone: 'eye' },
    { href: '/admin/tp/pontos', label: 'Pontos', icone: 'map-pin' },
    { href: '/admin/tp/equipamentos', label: 'Equipamentos', icone: 'cart' },
    { href: '/admin/tp/publicadores', label: 'Publicadores', icone: 'users' }
  ];

  let sheetAberto = $state(false);
  const atual = $derived(ITENS.find((i) => i.href === $page.url.pathname) ?? ITENS[0]);
</script>

<nav class="hidden md:block w-44 shrink-0 pr-4 space-y-0.5">
  {#each ITENS as item}
    {@const ativo = $page.url.pathname === item.href}
    <a
      href={item.href}
      class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
      class:bg-primary-50={ativo}
      class:text-primary-700={ativo}
      class:font-medium={ativo}
      class:text-slate-600={!ativo}
      class:hover:bg-slate-50={!ativo}
    >
      <Icon nome={item.icone} size={16} />
      {item.label}
    </a>
  {/each}
</nav>

<div class="md:hidden px-4 pt-4">
  <button
    type="button"
    onclick={() => (sheetAberto = true)}
    class="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
  >
    <span class="flex items-center gap-2"><Icon nome={atual.icone} size={16} /> {atual.label}</span>
    <Icon nome="menu" size={16} class="text-slate-400" />
  </button>
</div>

<BottomSheet bind:open={sheetAberto} title="Testemunho público">
  <div class="space-y-1">
    {#each ITENS as item}
      {@const ativo = $page.url.pathname === item.href}
      <a
        href={item.href}
        onclick={() => (sheetAberto = false)}
        class="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
        class:bg-primary-50={ativo}
        class:text-primary-700={ativo}
        class:font-medium={ativo}
      >
        <Icon nome={item.icone} size={16} />
        {item.label}
      </a>
    {/each}
  </div>
</BottomSheet>

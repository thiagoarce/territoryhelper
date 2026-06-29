<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import type { Snippet } from 'svelte';
  import Toaster from '$lib/ui/Toaster.svelte';
  import InstallPrompt from '$lib/components/InstallPrompt.svelte';

  let { data, children }: { data: { profile: any }; children: Snippet } = $props();

  const isLogin = $derived($page.url.pathname === '/login');
  const role = $derived(data.profile?.role ?? null);

  type Link = { href: string; label: string; icon: string; roles: string[]; group?: 'main' | 'tools' };
  const links: Link[] = [
    { href: '/admin', label: 'Visão geral', icon: '◴', roles: ['admin'], group: 'main' },
    { href: '/admin/quadras', label: 'Quadras', icon: '▦', roles: ['admin'], group: 'main' },
    { href: '/admin/designacoes', label: 'Designar', icon: '✎', roles: ['admin'], group: 'main' },
    { href: '/admin/registro', label: 'Registro', icon: '✓', roles: ['admin'], group: 'main' },
    { href: '/admin/poligonos', label: 'Polígonos', icon: '◇', roles: ['admin'], group: 'main' },
    { href: '/admin/tces', label: 'TCEs', icon: '★', roles: ['admin'], group: 'main' },
    { href: '/admin/cartas', label: 'Cartas', icon: '✉', roles: ['admin'], group: 'main' },
    { href: '/admin/campanha', label: 'Campanha', icon: '★', roles: ['admin'], group: 'main' },
    { href: '/admin/usuarios', label: 'Usuários', icon: '◉', roles: ['admin'], group: 'tools' },
    { href: '/admin/auditoria', label: 'Auditoria', icon: '◴', roles: ['admin'], group: 'tools' },
    { href: '/dirigente', label: 'Dirigente', icon: '◈', roles: ['admin', 'dirigente'], group: 'main' },
    { href: '/publicador', label: 'Trabalhar', icon: '◎', roles: ['admin', 'dirigente', 'publicador'], group: 'main' },
    { href: '/admin/dev/sql', label: 'SQL (dev)', icon: '⚙', roles: ['admin'], group: 'tools' }
  ];

  const linksVisiveis = $derived(role ? links.filter((l) => l.roles.includes(role)) : []);
  const linksMain = $derived(linksVisiveis.filter((l) => l.group === 'main'));
  const linksTools = $derived(linksVisiveis.filter((l) => l.group === 'tools'));

  // Pra mobile bottom nav: só mostra os 4-5 principais
  const linksMobile = $derived(linksMain.slice(0, 5));

  function ativo(href: string): boolean {
    const p = $page.url.pathname;
    if (href === '/admin') return p === '/admin';
    return p.startsWith(href);
  }
</script>

<Toaster />
<InstallPrompt />

{#if isLogin || !data.profile}
  {@render children()}
{:else}
  <div class="md:flex md:min-h-screen">
    <!-- Sidebar desktop -->
    <aside class="hidden md:flex md:flex-col md:w-56 md:shrink-0 md:border-r md:border-slate-200 md:bg-white md:p-4">
      <div class="mb-6">
        <div class="text-lg font-bold text-primary-700">Territory Helper</div>
        <a href="/perfil" class="text-xs text-slate-500 hover:text-primary-700 mt-1 block">
          {data.profile.nome} <span class="opacity-60">›</span>
        </a>
        <div class="mt-1 inline-block rounded bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
          {data.profile.role}
        </div>
      </div>
      <nav class="space-y-0.5 flex-1 overflow-y-auto">
        {#each linksMain as link}
          {@const isAtivo = ativo(link.href)}
          <a
            href={link.href}
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative"
            class:bg-primary-50={isAtivo}
            class:text-primary-700={isAtivo}
            class:hover:bg-slate-100={!isAtivo}
            class:text-slate-700={!isAtivo}
          >
            {#if isAtivo}
              <span class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary-600 rounded-r"></span>
            {/if}
            <span class="text-base w-5 text-center">{link.icon}</span>
            <span>{link.label}</span>
          </a>
        {/each}
        {#if linksTools.length > 0}
          <div class="pt-3 mt-3 border-t border-slate-100">
            <div class="px-3 mb-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Ferramentas</div>
            {#each linksTools as link}
              {@const isAtivo = ativo(link.href)}
              <a
                href={link.href}
                class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                class:bg-primary-50={isAtivo}
                class:text-primary-700={isAtivo}
                class:hover:bg-slate-100={!isAtivo}
                class:text-slate-500={!isAtivo}
              >
                <span class="text-base w-5 text-center">{link.icon}</span>
                <span>{link.label}</span>
              </a>
            {/each}
          </div>
        {/if}
      </nav>
      <form action="/logout" method="POST" class="mt-4">
        <button
          type="submit"
          class="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100"
        >
          Sair
        </button>
      </form>
    </aside>

    <!-- Header mobile -->
    <header class="md:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
      <div>
        <div class="font-bold text-primary-700">Territory Helper</div>
        <a href="/perfil" class="text-xs text-slate-500 hover:text-primary-700">
          {data.profile.nome} · {data.profile.role}
        </a>
      </div>
      <form action="/logout" method="POST">
        <button
          type="submit"
          aria-label="Sair"
          class="text-slate-500 hover:text-slate-700 p-2"
        >Sair</button>
      </form>
    </header>

    <main class="flex-1 p-4 md:p-6 pb-24 md:pb-6">
      {@render children()}
    </main>

    <!-- Bottom nav mobile -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex">
      {#each linksMobile as link}
        <a
          href={link.href}
          class="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs"
          class:text-primary-700={ativo(link.href)}
          class:font-semibold={ativo(link.href)}
          class:text-slate-500={!ativo(link.href)}
        >
          <span class="text-xl leading-none">{link.icon}</span>
          <span class="text-[10px]">{link.label}</span>
        </a>
      {/each}
    </nav>
  </div>
{/if}

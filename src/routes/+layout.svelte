<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import type { Snippet } from 'svelte';
  import Toaster from '$lib/ui/Toaster.svelte';
  import InstallPrompt from '$lib/components/InstallPrompt.svelte';

  let { data, children }: { data: { profile: any }; children: Snippet } = $props();

  // Rotas sem chrome (header/nav): públicas + login
  const rotasPublicas = ['/login', '/c', '/cartas', '/convite'];
  const semChrome = $derived(rotasPublicas.some((p) => $page.url.pathname.startsWith(p)));
  const role = $derived(data.profile?.role ?? null);

  // Modo atual baseado na URL — decide chrome (admin=drawer, dirigente=bottom, publicador=bottom)
  type Modo = 'admin' | 'dirigente' | 'publicador';
  const modoAtual = $derived<Modo>(
    $page.url.pathname.startsWith('/publicador') ? 'publicador'
    : $page.url.pathname.startsWith('/dirigente') ? 'dirigente'
    : 'admin'
  );

  // Itens do bottom nav (publicador/dirigente) — mesma estrutura, contextos diferentes
  const bottomNavPublicador = [
    { href: '/publicador', label: 'Designações', icon: 'home' },
    { href: '/publicador/arranjo', label: 'Arranjo', icon: 'clipboard' },
    { href: '/publicador/campanha', label: 'Campanha', icon: 'chart' },
    { href: '/perfil', label: 'Perfil', icon: 'user' }
  ];
  const bottomNavDirigente = [
    { href: '/dirigente', label: 'Designações', icon: 'home' },
    { href: '/dirigente/arranjo', label: 'Arranjo', icon: 'clipboard' },
    { href: '/dirigente/campanha', label: 'Campanha', icon: 'chart' },
    { href: '/perfil', label: 'Perfil', icon: 'user' }
  ];
  const bottomNav = $derived(modoAtual === 'publicador' ? bottomNavPublicador : bottomNavDirigente);

  // Drawer admin
  let drawerAberto = $state(false);

  const drawerGrupos = [
    {
      titulo: 'Administrar',
      items: [
        { href: '/admin', label: 'Geral', icon: 'map' },
        { href: '/admin/poligonos', label: 'Polígonos', icon: 'polygon' },
        { href: '/admin/registro', label: 'Registro', icon: 'clipboard' },
        { href: '/admin/predios', label: 'Prédios', icon: 'building' },
        { href: '/admin/campanha', label: 'Campanha', icon: 'chart' },
        { href: '/admin/arranjos', label: 'Arranjos', icon: 'calendar' }
      ]
    },
    {
      titulo: 'Sistema',
      items: [
        { href: '/admin/usuarios', label: 'Usuários e convites', icon: 'people' },
        { href: '/admin/auditoria', label: 'Auditoria', icon: 'history' },
        { href: '/admin/dev/sql', label: 'SQL (dev)', icon: 'wrench' }
      ]
    },
    {
      titulo: 'Outros modos',
      items: [
        { href: '/dirigente', label: 'Modo Dirigente', icon: 'eye' },
        { href: '/publicador', label: 'Modo Publicador', icon: 'eye' }
      ]
    }
  ];

  function ativo(href: string): boolean {
    const p = $page.url.pathname;
    if (href === '/admin') return p === '/admin';
    if (href === '/publicador') return p === '/publicador';
    if (href === '/dirigente') return p === '/dirigente';
    return p.startsWith(href);
  }

  // Título do header — vem do modo OR override (futuro: pode ser setado por página)
  const tituloHeader = $derived(
    modoAtual === 'publicador' ? 'Publicador'
    : modoAtual === 'dirigente' ? 'Dirigente'
    : 'Território'
  );

  // Iniciais do nome pra avatar
  const iniciais = $derived(
    data.profile?.nome
      ? data.profile.nome.split(' ').slice(0, 2).map((s: string) => s[0] || '').join('').toUpperCase()
      : '?'
  );
</script>

<Toaster />
<InstallPrompt />

{#if semChrome || !data.profile}
  {@render children()}
{:else}
  <!-- Header global comum -->
  <header class="sticky top-0 z-30 bg-white border-b border-slate-200 px-3 py-2.5 flex items-center gap-2">
    {#if modoAtual === 'admin'}
      <button
        type="button"
        onclick={() => (drawerAberto = !drawerAberto)}
        aria-label="Menu"
        class="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-700"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    {/if}

    <div class="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm">
      {iniciais}
    </div>
    <h1 class="text-lg font-bold flex-1 truncate">{tituloHeader}</h1>

    <a href="/buscar" aria-label="Buscar" class="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3" stroke-linecap="round"/></svg>
    </a>
    <a href="/perfil" aria-label="Perfil" class="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7" stroke-linecap="round"/></svg>
    </a>
  </header>

  <!-- Drawer lateral (admin) -->
  {#if drawerAberto && modoAtual === 'admin'}
    <button
      type="button"
      aria-label="Fechar menu"
      onclick={() => (drawerAberto = false)}
      class="fixed inset-0 z-40 bg-slate-900/30"
    ></button>
    <aside class="fixed top-0 left-0 bottom-0 z-50 w-80 max-w-[85vw] bg-white shadow-xl flex flex-col">
      <div class="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <button onclick={() => (drawerAberto = false)} class="w-9 h-9 rounded-lg border border-dashed border-slate-300 hover:bg-slate-100 flex items-center justify-center" aria-label="Fechar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6l-12 12" stroke-linecap="round"/></svg>
        </button>
        <div class="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center text-primary-700">📁</div>
        <h2 class="text-lg font-bold flex-1">Território</h2>
      </div>

      <nav class="flex-1 overflow-y-auto py-2">
        {#each drawerGrupos as grupo, i}
          {#if i > 0}<div class="my-2 mx-3 border-t border-slate-100"></div>{/if}
          <div class="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{grupo.titulo}</div>
          {#each grupo.items as link}
            {@const isAtivo = ativo(link.href)}
            <a
              href={link.href}
              onclick={() => (drawerAberto = false)}
              class="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative"
              class:bg-slate-100={isAtivo}
              class:text-slate-900={isAtivo}
              class:font-medium={isAtivo}
              class:hover:bg-slate-50={!isAtivo}
              class:text-slate-700={!isAtivo}
            >
              {#if isAtivo}
                <span class="absolute left-0 top-0 bottom-0 w-1 bg-primary-600"></span>
              {/if}
              <span class="w-5 text-center text-slate-500">
                {#if link.icon === 'map'}🗺{:else if link.icon === 'polygon'}◇{:else if link.icon === 'clipboard'}📋{:else if link.icon === 'building'}✉{:else if link.icon === 'chart'}📊{:else if link.icon === 'calendar'}📅{:else if link.icon === 'people'}◉{:else if link.icon === 'history'}◴{:else if link.icon === 'wrench'}⚙{:else if link.icon === 'eye'}👁{:else}·{/if}
              </span>
              <span>{link.label}</span>
            </a>
          {/each}
        {/each}

        <div class="my-2 mx-3 border-t border-slate-100"></div>
        <div class="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Conta</div>
        <a
          href="/perfil"
          onclick={() => (drawerAberto = false)}
          class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <span class="w-5 text-center text-slate-500">◉</span>
          <span>Perfil</span>
        </a>
        <form action="/logout" method="POST" class="px-4 py-1">
          <button type="submit" class="w-full text-left text-sm text-slate-500 hover:text-slate-900 py-2">Sair</button>
        </form>
      </nav>
    </aside>
  {/if}

  <main class="pb-20" class:pb-6={modoAtual === 'admin'}>
    {@render children()}
  </main>

  <!-- Bottom nav (publicador/dirigente) -->
  {#if modoAtual !== 'admin'}
    <nav class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex">
      {#each bottomNav as t}
        {@const isAtivo = ativo(t.href)}
        <a
          href={t.href}
          class="flex-1 flex flex-col items-center gap-1 py-2.5 text-xs transition-colors"
          class:text-slate-900={isAtivo}
          class:font-medium={isAtivo}
          class:text-slate-400={!isAtivo}
        >
          <span class="w-6 h-6 flex items-center justify-center">
            {#if t.icon === 'home'}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12l9-9 9 9M5 10v10h4v-6h6v6h4V10" stroke-linejoin="round"/></svg>
            {:else if t.icon === 'report'}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
            {:else if t.icon === 'envelope'}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
            {:else if t.icon === 'user'}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>
            {:else if t.icon === 'map'}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3V7zM9 4v17M15 7v17"/></svg>
            {:else if t.icon === 'clipboard'}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="4" width="12" height="18" rx="2"/><path d="M9 2h6v4H9z"/></svg>
            {:else if t.icon === 'chart'}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke-linecap="round"/></svg>
            {/if}
          </span>
          <span class="text-[10px]">{t.label}</span>
        </a>
      {/each}
    </nav>
  {/if}
{/if}

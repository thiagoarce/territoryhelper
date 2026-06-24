<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import type { Snippet } from 'svelte';

  let { data, children }: { data: { profile: any }; children: Snippet } = $props();

  const isLogin = $derived($page.url.pathname === '/login');
  const role = $derived(data.profile?.role ?? null);

  // Links da sidebar — cada um marca quais roles podem ver.
  const links = [
    { href: '/admin', label: 'Admin', roles: ['admin'] },
    { href: '/admin/usuarios', label: 'Usuários', roles: ['admin'] },
    { href: '/dirigente', label: 'Dirigente', roles: ['admin', 'dirigente'] },
    { href: '/publicador', label: 'Publicador', roles: ['admin', 'dirigente', 'publicador'] }
  ];
  const linksVisiveis = $derived(role ? links.filter((l) => l.roles.includes(role)) : []);
</script>

{#if isLogin || !data.profile}
  {@render children()}
{:else}
  <div class="flex min-h-screen">
    <aside class="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
      <div class="mb-6">
        <div class="text-lg font-bold text-primary-700">Territory Helper</div>
        <div class="text-xs text-slate-500">{data.profile.nome}</div>
        <div class="mt-1 inline-block rounded bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
          {data.profile.role}
        </div>
      </div>
      <nav class="space-y-1">
        {#each linksVisiveis as link}
          <a
            href={link.href}
            class="block rounded px-3 py-2 text-sm font-medium hover:bg-slate-100"
            class:bg-primary-50={$page.url.pathname.startsWith(link.href)}
            class:text-primary-700={$page.url.pathname.startsWith(link.href)}
          >
            {link.label}
          </a>
        {/each}
      </nav>
      <form action="/logout" method="POST" class="mt-6">
        <button
          type="submit"
          class="w-full rounded px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
        >
          Sair
        </button>
      </form>
    </aside>

    <main class="flex-1 p-4 md:p-6">
      {@render children()}
    </main>
  </div>
{/if}

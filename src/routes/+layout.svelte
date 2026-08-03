<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import type { NomeIcone } from '$lib/ui/Icon.svelte';
  import '../app.css';
  import { page, updated } from '$app/stores';
  import type { Snippet } from 'svelte';
  import Toaster from '$lib/ui/Toaster.svelte';
  import InstallPrompt from '$lib/components/InstallPrompt.svelte';
  import NotificacoesBell from '$lib/components/NotificacoesBell.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { invalidateAll } from '$app/navigation';
  import { flushFila, filaDoUsuarioAtual } from '$lib/offline';
  import { gravarUidAtual } from '$lib/offline/status';
  import { instalarCapturaDeErros } from '$lib/erros-client';
  import FilaOfflineSheet from '$lib/components/FilaOfflineSheet.svelte';
  import { onMount } from 'svelte';

  // Recarrega buscando a versão nova. skipWaiting no SW garante que o
  // service worker novo assume; o reload traz os assets novos.
  function atualizarApp() {
    location.reload();
  }

  // Fila offline (escritas de campo com sinal ruim): tenta sincronizar ao
  // carregar a página e sempre que a conexão voltar. Item recusado pelo
  // servidor fica na fila (não desaparece) — ver `FilaOfflineSheet`.
  // Contagens separadas: pendente (sobe sozinho) vs erro (precisa do
  // publicador decidir) — o banner promete coisas diferentes pra cada um.
  let filaPendentes = $state(0);
  let filaComErro = $state(0);
  let filaAberta = $state(false);
  async function atualizarContagemFila() {
    const itens = await filaDoUsuarioAtual();
    filaPendentes = itens.filter((i) => i.status === 'pendente').length;
    filaComErro = itens.filter((i) => i.status === 'erro').length;
  }
  async function sincronizarFila() {
    const { sincronizadas, falhas } = await flushFila();
    await atualizarContagemFila();
    if (sincronizadas > 0) {
      toast.success(`${sincronizadas} ação(ões) sincronizada(s)`);
    }
    if (falhas > 0) {
      toast.error(`${falhas} ação(ões) recusada(s) pelo servidor — veja a fila offline`);
    }
    if (sincronizadas > 0 || falhas > 0) await invalidateAll();
  }
  // Banner "sem conexão" — o app continua navegável no que já foi
  // cacheado pelo service worker; escritas entram na fila.
  let online = $state(true);
  function aoFicarOffline() {
    online = false;
    atualizarContagemFila();
  }
  function aoVoltarOnline() {
    online = true;
    sincronizarFila();
  }
  // Chunk de JS de uma navegação lazy que 404ou (build antigo em memória
  // depois de um deploy): recarrega — o HTML novo aponta pros chunks
  // certos. Padrão do Vite pra PWA que fica dias aberto.
  function aoFalharChunk() {
    location.reload();
  }
  onMount(() => {
    // Sinaliza pro watchdog do app.html que o boot completou, apaga o
    // contador de retry e tira a splash estática de trás do app.
    (window as any).__appPronto = true;
    try { sessionStorage.removeItem('th:boot-retry'); } catch {}
    document.getElementById('splash-inicial')?.remove();

    online = navigator.onLine;
    sincronizarFila();
    window.addEventListener('online', aoVoltarOnline);
    window.addEventListener('offline', aoFicarOffline);
    window.addEventListener('vite:preloadError', aoFalharChunk);
    return () => {
      window.removeEventListener('online', aoVoltarOnline);
      window.removeEventListener('offline', aoFicarOffline);
      window.removeEventListener('vite:preloadError', aoFalharChunk);
    };
  });

  let { data, children }: { data: { profile: any; temCasaACasa?: boolean; modules?: Record<string, boolean> }; children: Snippet } = $props();

  // Etiqueta de usuário da fila offline (aparelho compartilhado): a fila
  // só enfileira/replaya itens do uid gravado aqui. Atualiza a cada troca
  // de sessão (login/logout re-renderiza o layout com outro profile).
  $effect(() => {
    gravarUidAtual(data.profile?.id ?? null);
    instalarCapturaDeErros(data.profile?.id ?? null);
  });

  // Rotas sem chrome (header/nav): públicas + login
  const rotasPublicas = ['/login', '/c', '/cartas', '/convite', '/t/'];
  const semChrome = $derived(rotasPublicas.some((p) => $page.url.pathname.startsWith(p)));
  const role = $derived(data.profile?.role ?? null);

  // 2 modos apenas: admin (organizador) e campo (publicador+dirigente).
  // Dirigente = publicador com features extras habilitadas por role,
  // não uma tela separada (specs.md revisado).
  type Modo = 'admin' | 'campo';
  const modoAtual = $derived<Modo>(
    $page.url.pathname.startsWith('/admin') ? 'admin'
    : $page.url.pathname.startsWith('/publicador') ? 'campo'
    : $page.url.pathname.startsWith('/dirigente') ? 'campo'
    : (role === 'admin' ? 'admin' : 'campo')
  );

  // Bottom nav do modo campo. "Mapa estratégico" (visão geral read-only da
  // congregação, só dirigente/admin) virou ícone no header — não é mais
  // aba, já que concluir/repartir no geral saiu de lá (fica em Casa a
  // casa, escopado ao território designado). TP (testemunho público) tem
  // agenda própria, separada de Arranjo (só pregação em grupo).
  const podeDirigir = $derived(['dirigente', 'admin'].includes(role ?? ''));
  // TP só aparece pra quem tem profiles.tp_aprovado — admin vê mesmo sem
  // aprovação (é quem aprova os outros).
  const vePodeTp = $derived(data.modules?.publicWitnessing !== false && (role === 'admin' || !!data.profile?.tp_aprovado));
  // Casa a casa só aparece se tiver ALGO pra mostrar ali (arranjo que
  // dirige, parte, território pessoal ou TCE pessoal) — mesmo padrão do
  // TP. Sem isso, dirigente designado a um arranjo ainda sem quadras
  // via aba vazia sem sentido (RPC leve, migration 081).
  const veCasaACasa = $derived(!!data.temCasaACasa);
  const bottomNav = $derived<{ href: string; label: string; icon: NomeIcone }[]>([
    { href: '/publicador', label: 'Designações', icon: 'home' },
    ...(veCasaACasa ? [{ href: '/publicador/casa-a-casa', label: 'Casa a casa', icon: 'door' as NomeIcone }] : []),
    { href: '/publicador/arranjo', label: 'Agenda', icon: 'clipboard' },
    ...(vePodeTp ? [{ href: '/publicador/tp', label: 'TP', icon: 'megaphone' as NomeIcone }] : []),
    { href: '/publicador/predios', label: 'Prédios', icon: 'building' }
  ]);

  // Drawer admin
  let drawerAberto = $state(false);

  const drawerGrupos = $derived<{ titulo: string; items: { href: string; label: string; icon: NomeIcone }[] }[]>([
    {
      titulo: 'Administrar',
      items: [
        { href: '/admin', label: 'Geral', icon: 'map' },
        { href: '/admin/dashboard', label: 'Dashboard', icon: 'zap' },
        { href: '/admin/designacoes', label: 'Designações', icon: 'clipboard' },
        { href: '/admin/poligonos', label: 'Polígonos', icon: 'shapes' },
        // Malha de idioma: domínio separado da pregação regular, só aparece
        // pra instalação que tem grupo/congregação de idioma.
        ...(data.modules?.languageCensus ? [{ href: '/admin/censo', label: 'Censo de idioma', icon: 'users' as NomeIcone }] : []),
        { href: '/admin/predios', label: 'Prédios', icon: 'building' },
        ...(data.modules?.campaigns === false ? [] : [{ href: '/admin/campanha', label: 'Campanha', icon: 'chart' as NomeIcone }]),
        { href: '/admin/arranjos', label: 'Arranjos', icon: 'calendar' },
        ...(data.modules?.publicWitnessing === false ? [] : [{ href: '/admin/tp', label: 'Testemunho público', icon: 'megaphone' as NomeIcone }]),
        ...(data.modules?.publications === false ? [] : [{ href: '/publicacoes', label: 'Publicações', icon: 'inbox' as NomeIcone }])
      ]
    },
    {
      titulo: 'Sistema',
      items: [
        { href: '/admin/usuarios', label: 'Usuários e convites', icon: 'users' },
        { href: '/admin/relatorios/s13', label: 'Relatório S-13', icon: 'clipboard' },
        { href: '/admin/relatorios/cartoes', label: 'Cartões S-12 em lote', icon: 'map' },
        { href: '/admin/auditoria', label: 'Auditoria', icon: 'history' },
        { href: '/admin/dev/backup', label: 'Backup', icon: 'inbox' },
        { href: '/admin/dev/erros', label: 'Erros do client', icon: 'alert' }
      ]
    }
  ]);

  function ativo(href: string): boolean {
    const p = $page.url.pathname;
    if (href === '/admin') return p === '/admin';
    if (href === '/publicador') return p === '/publicador';
    if (href === '/publicador/mapa') return p === '/publicador/mapa';
    return p.startsWith(href);
  }

  // Título do header — modo campo pra publicador/dirigente, Território pra admin
  const tituloHeader = $derived(
    modoAtual === 'campo' ? (podeDirigir ? 'Campo' : 'Publicador') : 'Território'
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

<!-- Banner de versão nova (PWA não atualiza sozinho sem reload) -->
{#if $updated}
  <div class="fixed top-0 left-0 right-0 z-[60] bg-primary-700 text-white px-4 py-2.5 flex items-center gap-3 shadow-lg">
    <span class="text-sm flex-1"><Icon nome="sparkles" size={14} /> Nova versão disponível</span>
    <button
      type="button"
      onclick={atualizarApp}
      class="text-sm font-semibold bg-white text-primary-700 px-3 py-1 rounded-lg hover:bg-primary-50"
    >Atualizar</button>
  </div>
{/if}

<!-- Sem conexão: o que já foi carregado continua acessível (SW) -->
{#if !online}
  <div class="fixed top-0 left-0 right-0 z-[59] bg-slate-700 text-white px-4 py-2 flex items-center gap-3 shadow-lg text-sm" style:top={$updated ? '44px' : '0'}>
    <Icon nome="alert" size={14} />
    <span class="flex-1">Sem conexão — mostrando o que já foi carregado{filaPendentes + filaComErro > 0 ? ` · ${filaPendentes + filaComErro} ação(ões) na fila` : ''}</span>
  </div>
{:else if filaComErro > 0}
  <!-- Item recusado pelo servidor NÃO sobe sozinho — precisa do publicador -->
  <div class="fixed top-0 left-0 right-0 z-[59] bg-red-600 text-white px-4 py-2 flex items-center gap-3 shadow-lg text-sm" style:top={$updated ? '44px' : '0'}>
    <Icon nome="alert" size={14} />
    <span class="flex-1">{filaComErro} ação(ões) recusada(s) pelo servidor — revise a fila{filaPendentes > 0 ? ` · ${filaPendentes} aguardando sinal` : ''}</span>
    <button type="button" onclick={() => (filaAberta = true)} class="text-xs font-semibold bg-white/20 px-2 py-1 rounded hover:bg-white/30">Ver fila</button>
  </div>
{:else if filaPendentes > 0}
  <!-- Aviso de ações pendentes de sincronizar (sinal ruim em campo) -->
  <div class="fixed top-0 left-0 right-0 z-[59] bg-amber-600 text-white px-4 py-2 flex items-center gap-3 shadow-lg text-sm" style:top={$updated ? '44px' : '0'}>
    <Icon nome="refresh" size={14} />
    <span class="flex-1">{filaPendentes} ação(ões) salva(s) offline — sincroniza sozinho quando o sinal voltar</span>
    <button type="button" onclick={() => (filaAberta = true)} class="text-xs font-semibold bg-white/20 px-2 py-1 rounded hover:bg-white/30">Ver fila</button>
    <button type="button" onclick={sincronizarFila} class="text-xs font-semibold bg-white/20 px-2 py-1 rounded hover:bg-white/30">Tentar agora</button>
  </div>
{/if}

<FilaOfflineSheet bind:open={filaAberta} onMudanca={atualizarContagemFila} />

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

    {#if role === 'admin'}
      <a
        href={modoAtual === 'admin' ? '/publicador' : '/admin'}
        aria-label={modoAtual === 'admin' ? 'Ir pro modo campo' : 'Voltar pro modo admin'}
        title={modoAtual === 'admin' ? 'Ir pro modo campo' : 'Voltar pro modo admin'}
        class="flex items-center gap-1.5 px-2.5 h-9 rounded-lg hover:bg-slate-100 text-slate-600 text-xs font-medium"
      >
        <Icon nome="swap" size={16} />
        <span class="hidden sm:inline">{modoAtual === 'admin' ? 'Campo' : 'Admin'}</span>
      </a>
    {/if}

    {#if modoAtual === 'campo' && podeDirigir}
      <a href="/publicador/mapa" aria-label="Território da congregação" title="Território da congregação" class="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600">
        <Icon nome="map" size={18} />
      </a>
    {/if}

    <a href="/buscar" aria-label="Buscar" class="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3" stroke-linecap="round"/></svg>
    </a>
    <NotificacoesBell />
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
        <div class="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center text-primary-700"><Icon nome="map" size={18} /></div>
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
                <Icon nome={link.icon} size={18} />
              </span>
              <span>{link.label}</span>
            </a>
          {/each}
        {/each}

        <div class="my-2 mx-3 border-t border-slate-100"></div>
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
            <Icon nome={t.icon} size={22} />
          </span>
          <span class="text-[10px]">{t.label}</span>
        </a>
      {/each}
    </nav>
  {/if}
{/if}

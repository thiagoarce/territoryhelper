<script lang="ts">
  // Sino de notificações — fallback universal (funciona sem permissão de
  // push). Busca as próprias notificações via /api/notificacoes (RLS já
  // filtra pro usuário da sessão); poll leve pra manter o badge atual.
  import { goto } from '$app/navigation';
  import Icon from '$lib/ui/Icon.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { onMount, onDestroy } from 'svelte';

  interface Notificacao {
    id: number;
    titulo: string;
    corpo: string | null;
    url: string | null;
    lida_em: string | null;
    criado_em: string;
  }

  let notificacoes = $state<Notificacao[]>([]);
  let aberto = $state(false);
  let carregando = $state(false);
  const naoLidas = $derived(notificacoes.filter((n) => !n.lida_em).length);

  async function carregar() {
    try {
      const res = await fetch('/api/notificacoes');
      if (!res.ok) return;
      const j = (await res.json()) as { notificacoes: Notificacao[] };
      notificacoes = j.notificacoes ?? [];
    } catch {
      // Offline — mantém o que já tinha carregado.
    }
  }

  let intervalo: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    carregar();
    // Poll leve — fallback pra quem não ativou push (ou iOS sem PWA instalado).
    intervalo = setInterval(carregar, 60_000);
  });
  onDestroy(() => { if (intervalo) clearInterval(intervalo); });

  async function abrir() {
    aberto = true;
    carregando = true;
    await carregar();
    carregando = false;
  }

  async function marcarLida(n: Notificacao) {
    if (!n.lida_em) {
      n.lida_em = new Date().toISOString();
      notificacoes = [...notificacoes];
      fetch('/api/notificacoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: n.id })
      }).catch(() => {});
    }
    aberto = false;
    if (n.url) await goto(n.url);
  }

  async function marcarTodasLidas() {
    const agora = new Date().toISOString();
    notificacoes = notificacoes.map((n) => ({ ...n, lida_em: n.lida_em ?? agora }));
    fetch('/api/notificacoes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marcarTodas: true })
    }).catch(() => {});
  }

  const temLidas = $derived(notificacoes.some((n) => n.lida_em));
  let limpando = $state(false);
  async function limparLidas() {
    limpando = true;
    try {
      const res = await fetch('/api/notificacoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limparLidas: true })
      });
      if (res.ok) notificacoes = notificacoes.filter((n) => !n.lida_em);
    } catch {
      // Offline — tenta de novo na próxima abertura.
    } finally {
      limpando = false;
    }
  }

  function tempoRelativo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }
</script>

<button
  type="button"
  onclick={abrir}
  aria-label="Notificações"
  class="relative w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600"
>
  <Icon nome="bell" size={18} />
  {#if naoLidas > 0}
    <span class="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
      {naoLidas > 9 ? '9+' : naoLidas}
    </span>
  {/if}
</button>

<BottomSheet bind:open={aberto} title="Notificações">
  <div class="flex items-center gap-3 mb-2">
    {#if naoLidas > 0}
      <button type="button" onclick={marcarTodasLidas} class="text-xs text-primary-700 hover:underline">
        Marcar todas como lidas
      </button>
    {/if}
    {#if temLidas}
      <button type="button" onclick={limparLidas} disabled={limpando} class="text-xs text-slate-500 hover:underline disabled:opacity-40">
        {limpando ? 'Limpando...' : 'Limpar lidas'}
      </button>
    {/if}
  </div>
  {#if carregando && notificacoes.length === 0}
    <p class="text-sm text-slate-400 text-center py-6">Carregando...</p>
  {:else if notificacoes.length === 0}
    <div class="text-center py-8">
      <Icon nome="bell" size={32} class="mx-auto text-slate-300" />
      <p class="text-sm text-slate-400 mt-2">Nenhuma notificação ainda.</p>
    </div>
  {:else}
    <div class="space-y-1">
      {#each notificacoes as n (n.id)}
        <button
          type="button"
          onclick={() => marcarLida(n)}
          class="w-full text-left rounded-lg px-3 py-2 transition-colors {n.lida_em ? 'bg-white hover:bg-slate-50' : 'bg-primary-50 hover:bg-primary-100'}"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="text-sm font-medium" class:font-semibold={!n.lida_em}>{n.titulo}</span>
            <span class="text-[10px] text-slate-400 shrink-0">{tempoRelativo(n.criado_em)}</span>
          </div>
          {#if n.corpo}<div class="text-xs text-slate-600 mt-0.5">{n.corpo}</div>{/if}
        </button>
      {/each}
    </div>
  {/if}
</BottomSheet>

<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/ui/toast.svelte';
  import type { ErroClienteLinha } from './+page.server';

  let { data }: { data: { erros: ErroClienteLinha[] } } = $props();

  let expandido = $state<number | null>(null);
  let limpando = $state(false);

  async function limparTodos() {
    if (!confirm(`Apagar todos os ${data.erros.length} erros registrados?`)) return;
    limpando = true;
    try {
      const res = await fetch('?/limparTodos', { method: 'POST', body: new FormData() });
      const parsed = deserialize(await res.text()) as any;
      if (parsed.type === 'success') {
        toast.success('Lista limpa');
        await invalidateAll();
      } else {
        toast.error(String(parsed.data?.erro || 'Falhou'));
      }
    } finally {
      limpando = false;
    }
  }

  function fmt(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR');
  }

  // `url` vem do client (qualquer autenticado pode inserir via PostgREST
  // com texto arbitrário) — `new URL()` direto no template lançava no
  // render e UMA linha malformada derrubava a tela inteira de erros.
  function pathDe(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url.slice(0, 80);
    }
  }
</script>

<div class="p-4 space-y-3 max-w-4xl mx-auto">
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 class="text-2xl font-bold">Erros do client</h1>
      <p class="text-sm text-slate-500">
        Capturados automaticamente no aparelho dos usuários (janela de até 8 por sessão) — visibilidade
        de problemas que ninguém reportou de viva voz.
      </p>
    </div>
    {#if data.erros.length > 0}
      <Button variant="secondary" size="sm" loading={limpando} onclick={limparTodos}>
        <Icon nome="trash" size={14} /> Limpar tudo
      </Button>
    {/if}
  </div>

  {#if data.erros.length === 0}
    <Card padding="md">
      <p class="text-sm text-slate-500">Nenhum erro registrado.</p>
    </Card>
  {:else}
    <div class="space-y-2">
      {#each data.erros as e}
        <Card padding="sm">
          <button
            type="button"
            class="w-full text-left"
            onclick={() => (expandido = expandido === e.id ? null : e.id)}
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="text-sm font-medium text-red-700 truncate">{e.mensagem}</div>
                <div class="text-xs text-slate-500 mt-0.5">
                  {fmt(e.criado_em)} · {e.publicador_nome ?? '(desconhecido)'}
                  {#if e.url}· <span class="font-mono">{pathDe(e.url)}</span>{/if}
                </div>
              </div>
              <Icon nome={expandido === e.id ? 'chevron-down' : 'chevron-right'} size={14} />
            </div>
          </button>
          {#if expandido === e.id}
            <div class="mt-2 pt-2 border-t border-slate-100 space-y-1 text-xs">
              {#if e.stack}
                <pre class="whitespace-pre-wrap break-all bg-slate-50 rounded p-2 font-mono">{e.stack}</pre>
              {/if}
              {#if e.user_agent}
                <div class="text-slate-400 break-all">{e.user_agent}</div>
              {/if}
            </div>
          {/if}
        </Card>
      {/each}
    </div>
  {/if}
</div>

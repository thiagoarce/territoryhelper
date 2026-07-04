<script lang="ts">
  import { deserialize } from '$app/forms';
  import { invalidateAll, goto } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { PedidoLinha } from './$types';

  let { data }: { data: { pedidos: PedidoLinha[]; filtro: string; souAdmin: boolean; erro?: string } } = $props();

  const FILTROS = [
    ['pendentes', 'Pendentes'],
    ['entregue', 'Entregues'],
    ['cancelado', 'Cancelados'],
    ['todos', 'Todos']
  ] as const;

  const STATUS_LABEL: Record<string, string> = {
    aberto: 'Aberto',
    pedido: 'Pedido feito',
    entregue: 'Entregue',
    cancelado: 'Cancelado'
  };
  const STATUS_CLASSE: Record<string, string> = {
    aberto: 'bg-slate-100 text-slate-700',
    pedido: 'bg-blue-100 text-blue-700',
    entregue: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-700'
  };

  let processandoId = $state<number | null>(null);
  let notasEmEdicao: Record<number, string> = $state({});

  function mudarFiltro(f: string) {
    goto(`?status=${f}`, { keepFocus: true });
  }

  async function atualizarStatus(id: number, status: string) {
    processandoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    fd.append('status', status);
    const res = await fetch('?/atualizarPedido', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    processandoId = null;
    if (parsed.type === 'success') { toast.success('Atualizado'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function salvarNotas(id: number) {
    processandoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    fd.append('notas_servo', notasEmEdicao[id] ?? '');
    const res = await fetch('?/atualizarPedido', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    processandoId = null;
    if (parsed.type === 'success') { toast.success('Notas salvas'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
</script>

<div class="p-4 space-y-3 pb-10 max-w-2xl mx-auto">
  <div>
    <h1 class="text-2xl font-bold">Área do servo</h1>
    <p class="text-sm text-slate-500">Pedidos de publicação da congregação</p>
  </div>

  <div class="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
    {#each FILTROS as [f, label]}
      <button
        type="button"
        onclick={() => mudarFiltro(f)}
        class="px-3 py-1 text-xs font-medium rounded transition-colors"
        class:bg-white={data.filtro === f}
        class:shadow-sm={data.filtro === f}
        class:text-slate-900={data.filtro === f}
        class:text-slate-500={data.filtro !== f}
      >{label}</button>
    {/each}
  </div>

  {#if data.pedidos.length === 0}
    <Card padding="md">
      <div class="text-center py-8">
        <Icon nome="inbox" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Nenhum pedido nesse filtro</div>
      </div>
    </Card>
  {:else}
    <div class="grid gap-2">
      {#each data.pedidos as p (p.id)}
        <Card padding="md">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">{p.publicacao_nome ?? p.descricao ?? 'Publicação'}</div>
              <div class="text-sm text-slate-600">
                <Icon nome="user" size={14} /> {p.publicador_nome} · qtd {p.qtd}
              </div>
              <div class="text-xs text-slate-400 mt-0.5">{new Date(p.criado_em).toLocaleDateString('pt-BR')}</div>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 {STATUS_CLASSE[p.status]}">{STATUS_LABEL[p.status]}</span>
          </div>

          <div class="mt-2 flex flex-wrap gap-1.5">
            {#if p.status === 'aberto'}
              <Button variant="secondary" size="sm" loading={processandoId === p.id} onclick={() => atualizarStatus(p.id, 'pedido')}>Marcar como pedido</Button>
            {/if}
            {#if p.status === 'pedido'}
              <Button variant="secondary" size="sm" loading={processandoId === p.id} onclick={() => atualizarStatus(p.id, 'entregue')}>Marcar como entregue</Button>
            {/if}
            {#if p.status === 'aberto' || p.status === 'pedido'}
              <Button variant="secondary" size="sm" loading={processandoId === p.id} onclick={() => atualizarStatus(p.id, 'cancelado')} class="text-red-600">Cancelar</Button>
            {/if}
          </div>

          <div class="mt-2 flex gap-1.5">
            <input
              value={notasEmEdicao[p.id] ?? p.notas_servo ?? ''}
              oninput={(e) => (notasEmEdicao[p.id] = (e.target as HTMLInputElement).value)}
              placeholder="Notas do servo (opcional)"
              class="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
            <Button variant="secondary" size="sm" loading={processandoId === p.id} onclick={() => salvarNotas(p.id)}>Salvar</Button>
          </div>
        </Card>
      {/each}
    </div>
  {/if}

  <Card padding="md">
    <h2 class="font-semibold mb-1">Suprimento de campanha</h2>
    {#if data.souAdmin}
      <a href="/admin/campanha" class="text-sm text-primary-700 hover:underline">Gerenciar em Campanha →</a>
    {:else}
      <p class="text-sm text-slate-500">O suprimento (catálogo + checklist da campanha) é gerenciado por um admin em Campanha.</p>
    {/if}
  </Card>
</div>

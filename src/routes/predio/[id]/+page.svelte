<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/ui/toast.svelte';
  import type { PredioDetalhado } from '$lib/server/queries';

  let { data }: { data: { predio: PredioDetalhado } } = $props();

  const entregues = $derived(data.predio.unidades.filter((u) => u.carta_entregue).length);
  const total = $derived(data.predio.unidades.length);

  function voltar() {
    if (typeof history !== 'undefined' && history.length > 1) history.back();
    else location.href = '/';
  }
</script>

<svelte:head>
  <title>{data.predio.nome || data.predio.logradouro} — cartas</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pb-12">
  <div class="bg-primary-600 text-white px-4 py-5">
    <button type="button" onclick={voltar} class="text-xs opacity-80 mb-1 hover:opacity-100 flex items-center gap-1">
      ← Voltar
    </button>
    <div class="text-xs opacity-80 mb-1">Trabalho de cartas</div>
    <h1 class="text-xl font-bold">{data.predio.nome || `${data.predio.logradouro}, ${data.predio.numero}`}</h1>
    <div class="text-sm opacity-90 mt-1">{data.predio.logradouro}, {data.predio.numero}</div>

    <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
      {#if data.predio.tipo_entrada === 'porteiro'}<span class="bg-white/20 px-2 py-1 rounded">🚪 Porteiro</span>{/if}
      {#if data.predio.tipo_entrada === 'eletronica'}<span class="bg-white/20 px-2 py-1 rounded">🔌 Eletrônica</span>{/if}
      {#if data.predio.acesso_caixas}<span class="bg-white/20 px-2 py-1 rounded">📬 Caixas</span>{/if}
      {#if data.predio.acesso_interfones}<span class="bg-white/20 px-2 py-1 rounded">📞 Interfones</span>{/if}
      {#if data.predio.irmao_mora}<span class="bg-white/20 px-2 py-1 rounded">👤 Irmão{data.predio.nome_irmao ? `: ${data.predio.nome_irmao}` : ''}</span>{/if}
    </div>

    <div class="mt-4">
      <div class="flex justify-between text-sm mb-1">
        <span>Entregues</span>
        <span class="font-bold">{entregues} de {total}</span>
      </div>
      <div class="h-2 rounded-full bg-white/20 overflow-hidden">
        <div class="h-full bg-white" style:width="{total === 0 ? 0 : (entregues / total) * 100}%"></div>
      </div>
    </div>

    {#if data.predio.notas}
      <p class="mt-3 text-sm bg-white/10 rounded p-2 italic">{data.predio.notas}</p>
    {/if}
  </div>

  <div class="p-4 space-y-1">
    {#each data.predio.unidades as u (u.id)}
      {@const st = u.nao_escrever ? 'naoescrever' : u.desocupado ? 'desocupado' : u.carta_entregue ? 'entregue' : 'pendente'}
      <div
        class="rounded-lg border p-3 transition-colors"
        class:bg-purple-50={st === 'entregue'}
        class:border-purple-200={st === 'entregue'}
        class:bg-slate-100={st === 'desocupado'}
        class:border-slate-300={st === 'desocupado'}
        class:bg-red-50={st === 'naoescrever'}
        class:border-red-200={st === 'naoescrever'}
        class:bg-white={st === 'pendente'}
        class:border-slate-200={st === 'pendente'}
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="font-mono font-semibold">{u.complemento || `Apto ${u.id}`}</div>
            {#if u.carta_entregue}<div class="text-xs text-purple-700">✉ {u.carta_entregue}</div>{/if}
          </div>
          <div class="flex gap-1">
            {#each [
              { c: 'carta_entregue', e: '✉', ativo: !!u.carta_entregue, cls: 'bg-purple-600' },
              { c: 'desocupado', e: '🏚', ativo: u.desocupado, cls: 'bg-slate-600' },
              { c: 'nao_escrever', e: '🚫', ativo: u.nao_escrever, cls: 'bg-red-600' }
            ] as opt}
              <form
                method="POST"
                action="?/toggle"
                use:enhance={() => async ({ result, update }) => {
                  await update();
                  if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
                  await invalidateAll();
                }}
              >
                <input type="hidden" name="unidade_id" value={u.id} />
                <input type="hidden" name="campo" value={opt.c} />
                <button class="px-3 py-2 rounded text-base border {opt.ativo ? opt.cls + ' text-white border-transparent' : 'border-slate-300 bg-white hover:bg-slate-50'}">
                  {opt.e}
                </button>
              </form>
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

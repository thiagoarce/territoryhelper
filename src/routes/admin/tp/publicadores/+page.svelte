<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/ui/toast.svelte';
  import { DIAS_SEMANA } from '$lib/arranjos';
  import type { TpPublicadorLinha } from './$types';

  let { data }: { data: { publicadores: TpPublicadorLinha[] } } = $props();

  let alternandoId = $state<string | null>(null);
  async function alternarAprovacao(p: TpPublicadorLinha) {
    alternandoId = p.id;
    const fd = new FormData();
    fd.append('id', p.id);
    fd.append('aprovado', String(!p.tp_aprovado));
    const res = await fetch('?/alternarAprovacao', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    alternandoId = null;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Atualizado')); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
</script>

<div class="p-4 space-y-3 pb-10">
  <p class="text-xs text-slate-500">
    Disponibilidade informada pelo próprio publicador em Perfil. "Aprovado"
    controla quem aparece nas listas de designação/montagem/reserva do
    testemunho público — publicador não aprovado ainda marca disponibilidade
    normalmente, só não aparece pra escalar.
  </p>
  {#each data.publicadores as p (p.id)}
    <Card padding="md">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <span class="font-semibold flex items-center gap-2">
          <Icon nome="user" size={14} /> {p.nome}
          {#if p.transporta_carrinho}
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">Leva equipamento</span>
          {/if}
        </span>
        <button
          type="button"
          disabled={alternandoId === p.id}
          onclick={() => alternarAprovacao(p)}
          class="text-xs px-2 py-1 rounded-lg border font-medium disabled:opacity-40 flex items-center gap-1"
          class:bg-green-100={p.tp_aprovado}
          class:text-green-700={p.tp_aprovado}
          class:border-green-300={p.tp_aprovado}
          class:bg-slate-100={!p.tp_aprovado}
          class:text-slate-500={!p.tp_aprovado}
          class:border-slate-300={!p.tp_aprovado}
        >
          <Icon nome={alternandoId === p.id ? 'loader' : (p.tp_aprovado ? 'check' : 'x')} size={12} spin={alternandoId === p.id} />
          {p.tp_aprovado ? 'Aprovado' : 'Não aprovado'}
        </button>
      </div>
      {#if p.janelas.length === 0}
        <p class="text-xs text-slate-400 mt-1">Sem disponibilidade informada.</p>
      {:else}
        <div class="flex flex-wrap gap-1.5 mt-2">
          {#each p.janelas as j}
            <span class="text-xs bg-slate-50 rounded px-2 py-1">
              {DIAS_SEMANA[j.dia_semana]} {j.hora_inicio.substring(0, 5)}–{j.hora_fim.substring(0, 5)}
            </span>
          {/each}
        </div>
      {/if}
    </Card>
  {/each}
  {#if data.publicadores.length === 0}
    <div class="text-center py-10 text-slate-400">
      <Icon nome="users" size={40} class="mx-auto text-slate-300" />
      <p class="mt-2">Nenhum publicador cadastrado.</p>
    </div>
  {/if}
</div>

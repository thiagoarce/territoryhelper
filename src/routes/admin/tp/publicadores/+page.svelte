<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import { DIAS_SEMANA } from '$lib/arranjos';
  import type { TpPublicadorLinha } from './$types';

  let { data }: { data: { publicadores: TpPublicadorLinha[] } } = $props();
</script>

<div class="p-4 space-y-3 pb-10">
  <p class="text-xs text-slate-500">
    Disponibilidade informada pelo próprio publicador em Perfil. Usa isso
    pra saber quem escalar no Planner.
  </p>
  {#each data.publicadores as p (p.id)}
    <Card padding="md">
      <div class="flex items-center justify-between gap-2">
        <span class="font-semibold flex items-center gap-2">
          <Icon nome="user" size={14} /> {p.nome}
          {#if p.transporta_carrinho}
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">Leva equipamento</span>
          {/if}
        </span>
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

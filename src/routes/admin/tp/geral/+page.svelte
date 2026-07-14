<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import { goto } from '$app/navigation';
  import type { OcorrenciaAgendamento } from '$lib/tp-agendamentos';
  import type { TpCarrinhoCor } from './+page.server';

  let { data }: {
    data: {
      periodo: 'semana' | 'mes';
      range: { isoIni: string; isoFim: string; label: string };
      carrinhos: TpCarrinhoCor[];
      corPorCarrinho: Record<number, TpCarrinhoCor>;
      pontos: Record<number, string>;
      ocPorData: Record<string, OcorrenciaAgendamento[]>;
    };
  } = $props();

  const datasOrdenadas = $derived(Object.keys(data.ocPorData).sort());

  function mudarPeriodo(p: 'semana' | 'mes') {
    goto(`?periodo=${p}`, { keepFocus: true });
  }
</script>

<div class="p-4 space-y-3 pb-10">
  <div class="flex items-center justify-between flex-wrap gap-2">
    <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
      {#each [['semana', 'Semana'], ['mes', 'Mês']] as [p, label]}
        <button
          type="button"
          onclick={() => mudarPeriodo(p as 'semana' | 'mes')}
          class="px-3 py-1 text-xs font-medium rounded transition-colors"
          class:bg-white={data.periodo === p}
          class:shadow-sm={data.periodo === p}
          class:text-slate-900={data.periodo === p}
          class:text-slate-500={data.periodo !== p}
        >{label}</button>
      {/each}
    </div>
    <div class="text-xs text-slate-400">{data.range.label}</div>
  </div>

  <div class="flex flex-wrap gap-2">
    {#each data.carrinhos as c}
      <span class="inline-flex items-center gap-1.5 text-xs bg-slate-50 rounded-full px-2 py-1">
        <span class="w-2 h-2 rounded-full shrink-0" style="background-color: {c.cor}"></span>
        {c.nome}
      </span>
    {/each}
  </div>

  {#if datasOrdenadas.length === 0}
    <Card padding="md">
      <div class="text-center py-8">
        <Icon nome="eye" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Nenhum agendamento nesse período</div>
      </div>
    </Card>
  {:else}
    <div class="grid gap-3">
      {#each datasOrdenadas as dataIso}
        <div>
          <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
            {new Date(dataIso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
          <div class="grid gap-2">
            {#each data.ocPorData[dataIso] as oc (oc.agendamento_id + '-' + oc.data)}
              {@const carrinho = data.corPorCarrinho[oc.carrinho_id]}
              <Card padding="md">
                <div class="flex items-start gap-3">
                  <span class="w-2 self-stretch rounded shrink-0" style="background-color: {carrinho?.cor ?? '#94a3b8'}"></span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-semibold">{carrinho?.nome ?? 'Equipamento'}</span>
                    </div>
                    <div class="text-sm text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span><Icon nome="clock" size={14} /> {oc.hora_inicio.substring(0, 5)}–{oc.hora_fim.substring(0, 5)}</span>
                      <span class="truncate"><Icon nome="map-pin" size={14} /> {oc.ponto_id ? (data.pontos[oc.ponto_id] ?? '?') : oc.ponto_avulso}</span>
                    </div>
                  </div>
                </div>
              </Card>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

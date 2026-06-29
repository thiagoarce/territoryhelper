<script lang="ts">
  import Card from '$lib/ui/Card.svelte';
  import type { ArranjoLinha } from './$types';

  let { data }: {
    data: {
      arranjos: ArranjoLinha[];
      dirigenteNomes: Record<string, string>;
      quadrasPorArranjo: Record<number, string[]>;
      participantesPorArranjo: Record<number, { id: string; nome: string; papel: string }[]>;
    };
  } = $props();

  function diaSemana(dataStr: string | null): string {
    if (!dataStr) return '—';
    const d = new Date(dataStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }
</script>

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Arranjo</h1>
    <p class="text-sm text-slate-500">Saídas em grupo coordenadas por dirigentes</p>
  </div>

  {#if data.arranjos.length === 0}
    <Card padding="md">
      <div class="text-center py-6">
        <div class="text-4xl mb-2 opacity-50">📅</div>
        <div class="font-medium">Nenhum arranjo marcado</div>
        <div class="text-sm text-slate-500">Quando um dirigente marcar uma saída em grupo, ela aparece aqui.</div>
      </div>
    </Card>
  {:else}
    {#each data.arranjos as a (a.id)}
      {@const quadras = data.quadrasPorArranjo[a.id] ?? []}
      {@const participantes = data.participantesPorArranjo[a.id] ?? []}
      {@const dirigenteNome = a.dirigente_id ? data.dirigenteNomes[a.dirigente_id] : null}
      <Card padding="md">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-lg">{diaSemana(a.data_encontro)}{a.hora_encontro ? ` · ${a.hora_encontro.substring(0, 5)}` : ''}</div>
            {#if dirigenteNome}<div class="text-xs text-slate-500">Dirigente: {dirigenteNome}</div>{/if}
          </div>
          <span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{quadras.length} quadra(s)</span>
        </div>

        {#if a.ponto_encontro_endereco}
          <div class="mt-2 text-sm">
            <span class="text-slate-500">Ponto de encontro:</span> {a.ponto_encontro_endereco}
          </div>
        {/if}

        {#if quadras.length > 0}
          <div class="mt-2 flex flex-wrap gap-1">
            {#each quadras as q}
              <a href="/publicador/quadra/{q}" class="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded hover:bg-slate-200">{q}</a>
            {/each}
          </div>
        {/if}

        {#if participantes.length > 0}
          <div class="mt-2 text-xs text-slate-500">
            <span class="font-medium">Participantes:</span>
            {#each participantes as p, i}
              <span class:font-semibold={p.papel === 'lider'}>{p.nome}</span>{i < participantes.length - 1 ? ', ' : ''}
            {/each}
          </div>
        {/if}

        {#if a.notas}
          <div class="mt-2 text-xs text-slate-500 italic">{a.notas}</div>
        {/if}
      </Card>
    {/each}
  {/if}
</div>

<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { ArranjoLinha } from './$types';

  let { data }: {
    data: {
      arranjos: ArranjoLinha[];
      dirigenteNomes: Record<string, string>;
      publicadores: { id: string; nome: string; role: string }[];
      quadrasPorArranjo: Record<number, string[]>;
      participantesPorArranjo: Record<number, { id: string; nome: string; papel: string }[]>;
      podeCoordenar: boolean;
      minhaId: string;
    };
  } = $props();

  // Prompt inicial — se não é dirigente, pergunta se quer só olhar
  let modoVisita = $state<'pendente' | 'olhar' | 'dirigir'>(
    data.podeCoordenar ? 'dirigir' : 'pendente'
  );

  let sheetNovo = $state(false);
  let salvando = $state(false);
  let quadrasInput = $state('');
  let participantesSel = $state<Set<string>>(new Set());

  function diaSemana(dataStr: string | null): string {
    if (!dataStr) return '—';
    const d = new Date(dataStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  function togglePart(id: string) {
    if (participantesSel.has(id)) participantesSel.delete(id);
    else participantesSel.add(id);
    participantesSel = new Set(participantesSel);
  }
</script>

{#if modoVisita === 'pendente'}
  <div class="p-4 flex items-center justify-center min-h-[60vh]">
    <Card padding="md" class="max-w-md w-full">
      <div class="text-center">
        <div class="text-4xl mb-3">📅</div>
        <h2 class="text-lg font-bold mb-2">Arranjo de saídas</h2>
        <p class="text-sm text-slate-600 mb-4">
          Saídas em grupo coordenadas pelos dirigentes. Você quer só ver as saídas marcadas, ou está coordenando uma?
        </p>
        <div class="flex flex-col gap-2">
          <Button variant="primary" onclick={() => (modoVisita = 'dirigir')}>Sou dirigente — coordenar</Button>
          <Button variant="secondary" onclick={() => (modoVisita = 'olhar')}>Só olhar as saídas</Button>
        </div>
        <p class="text-xs text-slate-400 mt-3">
          Coordenar exige permissão de dirigente. Ações de criação ficarão restritas se você não for.
        </p>
      </div>
    </Card>
  </div>
{:else}
  <div class="p-4 space-y-3">
    <div class="flex items-end justify-between gap-2 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold">Arranjo</h1>
        <p class="text-sm text-slate-500">
          {modoVisita === 'dirigir' ? 'Coordenando saídas em grupo' : 'Saídas marcadas (visualização)'}
        </p>
      </div>
      {#if modoVisita === 'dirigir' && data.podeCoordenar}
        <Button variant="primary" onclick={() => { sheetNovo = true; participantesSel = new Set(); quadrasInput = ''; }}>+ Nova saída</Button>
      {/if}
    </div>

    {#if data.arranjos.length === 0}
      <Card padding="md">
        <div class="text-center py-6">
          <div class="text-4xl mb-2 opacity-50">📅</div>
          <div class="font-medium">Nenhum arranjo marcado</div>
          <div class="text-sm text-slate-500">
            {#if modoVisita === 'dirigir' && data.podeCoordenar}
              Crie a primeira saída clicando em "+ Nova saída".
            {:else}
              Volte mais tarde — os dirigentes ainda não marcaram saídas.
            {/if}
          </div>
        </div>
      </Card>
    {:else}
      {#each data.arranjos as a (a.id)}
        {@const quadras = data.quadrasPorArranjo[a.id] ?? []}
        {@const participantes = data.participantesPorArranjo[a.id] ?? []}
        {@const dirigenteNome = a.dirigente_id ? data.dirigenteNomes[a.dirigente_id] : null}
        {@const ehMeu = a.dirigente_id === data.minhaId}
        <Card padding="md">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-lg">
                {diaSemana(a.data_encontro)}{a.hora_encontro ? ` · ${a.hora_encontro.substring(0, 5)}` : ''}
              </div>
              {#if dirigenteNome}
                <div class="text-xs text-slate-500">
                  Dirigente: {dirigenteNome}{ehMeu ? ' (você)' : ''}
                </div>
              {/if}
            </div>
            <div class="flex gap-1">
              {#if a.status === 'concluida'}
                <span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded">concluído</span>
              {/if}
              <span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{quadras.length} q</span>
            </div>
          </div>

          {#if a.ponto_encontro_endereco}
            <div class="mt-2 text-sm">
              <span class="text-slate-500">📍 Ponto:</span> {a.ponto_encontro_endereco}
            </div>
          {/if}

          {#if quadras.length > 0}
            <div class="mt-2 flex flex-wrap gap-1">
              {#each quadras as q}
                <span class="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{q}</span>
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

          {#if ehMeu && a.status === 'aberta' && modoVisita === 'dirigir'}
            <form
              method="POST"
              action="?/concluir"
              use:enhance={() => async ({ result, update }) => {
                await update();
                if (result.type === 'success') { toast.success('Concluído'); await invalidateAll(); }
              }}
              class="mt-2"
            >
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" class="text-xs text-green-700 hover:underline">✓ Marcar como concluído</button>
            </form>
          {/if}
        </Card>
      {/each}
    {/if}
  </div>
{/if}

<BottomSheet bind:open={sheetNovo} title="Nova saída em arranjo">
  <form
    method="POST"
    action="?/criarArranjo"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success('Arranjo criado');
          sheetNovo = false;
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="data_encontro" class="block text-sm font-medium mb-1">Data</label>
        <input id="data_encontro" name="data_encontro" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label for="hora_encontro" class="block text-sm font-medium mb-1">Hora</label>
        <input id="hora_encontro" name="hora_encontro" type="time" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
    </div>

    <div>
      <label for="ponto_encontro_endereco" class="block text-sm font-medium mb-1">Ponto de encontro</label>
      <input id="ponto_encontro_endereco" name="ponto_encontro_endereco" placeholder="Ex: esquina da Rua X com Y" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div>
      <label for="quadras_input" class="block text-sm font-medium mb-1">Quadras (separadas por vírgula)</label>
      <input id="quadras_input" bind:value={quadrasInput} placeholder="Q-1, Q-2, Q-3" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {#each quadrasInput.split(',').map((s) => s.trim()).filter(Boolean) as qid}
        <input type="hidden" name="quadras_ids" value={qid} />
      {/each}
    </div>

    <div>
      <span class="block text-sm font-medium mb-1">Participantes</span>
      <div class="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {#each data.publicadores as p}
          <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
            <input type="checkbox" checked={participantesSel.has(p.id)} onchange={() => togglePart(p.id)} class="w-4 h-4 rounded" />
            <span class="flex-1">{p.nome}</span>
            <span class="text-xs text-slate-400">{p.role}</span>
          </label>
        {/each}
      </div>
      {#each [...participantesSel] as pid}
        <input type="hidden" name="publicador_ids" value={pid} />
      {/each}
      <p class="text-xs text-slate-500 mt-1">Primeiro selecionado vira "líder" da saída.</p>
    </div>

    <div>
      <label for="notas" class="block text-sm font-medium mb-1">Notas (opcional)</label>
      <textarea id="notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetNovo = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Criar</Button>
    </div>
  </form>
</BottomSheet>

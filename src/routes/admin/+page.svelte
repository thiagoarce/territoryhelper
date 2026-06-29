<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaAdmin from '$lib/components/MapaAdmin.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo, DesignacaoEnriquecida } from '$lib/server/queries';

  let {
    data,
    form
  }: {
    data: {
      quadras: QuadraGeo[];
      designacoesAbertas: DesignacaoEnriquecida[];
      publicadores: { id: string; nome: string; role: string }[];
      quadrasAlocadas: string[];
    };
    form: any;
  } = $props();

  // Estado
  let colorirPor = $state<'status' | 'territorio' | 'densidade'>('status');
  let basemap = $state<'positron' | 'liberty' | 'bright'>('positron');
  let mostrarRotulos = $state(true);
  let selecionadas = $state<Set<string>>(new Set());
  let busca = $state('');
  let salvando = $state(false);

  // Sheets
  let sheetDesignacoes = $state(false);
  let sheetDesignar = $state(false);

  function onClickQuadra(q: QuadraGeo, multi: boolean) {
    if (selecionadas.has(q.id)) selecionadas.delete(q.id);
    else selecionadas.add(q.id);
    selecionadas = new Set(selecionadas);
  }

  function limparSelecao() { selecionadas = new Set(); }

  const stats = $derived.by(() => {
    const total = data.quadras.length;
    const concluidas = data.quadras.filter((q) => q.status === 'concluido').length;
    const inativas = data.quadras.filter((q) => q.status === 'inativa').length;
    return { total, ativas: total - inativas, concluidas, alocadas: data.quadrasAlocadas.length, abertas: data.designacoesAbertas.length };
  });
</script>

<div class="p-4 space-y-3">
  <!-- Toolbar topo -->
  <div class="flex flex-wrap items-center gap-2">
    <button
      onclick={() => (sheetDesignacoes = true)}
      class="px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium flex items-center gap-1.5"
    >
      🔒 Designações
      {#if stats.abertas > 0}
        <span class="bg-blue-700 text-white rounded-full text-[10px] px-1.5 min-w-[18px] text-center">{stats.abertas}</span>
      {/if}
    </button>

    <select bind:value={colorirPor} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
      <option value="status">Cor por status</option>
      <option value="territorio">Cor por território</option>
      <option value="densidade">Cor por densidade</option>
    </select>

    <select bind:value={basemap} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" title="Mapa base">
      <option value="positron">Cinza</option>
      <option value="liberty">Colorido</option>
      <option value="bright">Brilhante</option>
    </select>

    <label class="flex items-center gap-1.5 text-sm cursor-pointer ml-auto">
      <input type="checkbox" bind:checked={mostrarRotulos} class="w-4 h-4 rounded" />
      Rótulos
    </label>
  </div>

  <!-- Stats compactos -->
  <div class="grid grid-cols-4 gap-2 text-center">
    <div class="rounded-lg bg-slate-50 p-2">
      <div class="text-lg font-bold">{stats.ativas}</div>
      <div class="text-[10px] text-slate-500 uppercase">ativas</div>
    </div>
    <div class="rounded-lg bg-green-50 p-2">
      <div class="text-lg font-bold text-green-700">{stats.concluidas}</div>
      <div class="text-[10px] text-slate-500 uppercase">concluídas</div>
    </div>
    <div class="rounded-lg bg-blue-50 p-2">
      <div class="text-lg font-bold text-blue-700">{stats.alocadas}</div>
      <div class="text-[10px] text-slate-500 uppercase">designadas</div>
    </div>
    <div class="rounded-lg bg-amber-50 p-2">
      <div class="text-lg font-bold text-amber-700">{stats.abertas}</div>
      <div class="text-[10px] text-slate-500 uppercase">abertas</div>
    </div>
  </div>

  <!-- Mapa -->
  <MapaAdmin
    quadras={data.quadras}
    altura={520}
    {colorirPor}
    {mostrarRotulos}
    quadrasAlocadas={data.quadrasAlocadas}
    bind:selecionadas
    bind:basemap
    onClick={onClickQuadra}
  />

  <p class="text-xs text-slate-500 text-center">
    {#if selecionadas.size === 0}
      Clique nas quadras pra selecionar. Long-press abre detalhes.
    {:else}
      <strong>{selecionadas.size}</strong> selecionada(s) — use a barra inferior pra agir
    {/if}
  </p>
</div>

<!-- Barra inferior de ações em massa -->
{#if selecionadas.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium">
      <strong>{selecionadas.size}</strong> quadra(s) selecionada(s)
    </div>
    <div class="flex gap-2 ml-auto">
      <Button variant="primary" size="sm" onclick={() => (sheetDesignar = true)}>📤 Designar</Button>
      <Button variant="secondary" size="sm" onclick={limparSelecao}>Limpar</Button>
    </div>
  </div>
{/if}

<!-- Sheet: lista designações ativas -->
<BottomSheet bind:open={sheetDesignacoes} title="Designações ativas">
  {#if data.designacoesAbertas.length === 0}
    <div class="text-center py-10 text-slate-400">Nenhuma designação aberta.</div>
  {:else}
    <ul class="space-y-2">
      {#each data.designacoesAbertas as d}
        <li class="rounded-lg border border-slate-200 p-3">
          <div class="font-medium">{d.publicador_nome ?? '(sem publicador)'}</div>
          <div class="text-xs text-slate-500 mt-0.5">
            {d.quadras_ids.length} quadra(s) · {d.quadras_ids.join(', ')}
          </div>
          {#if d.prazo}<div class="text-xs text-amber-700 mt-1">prazo: {d.prazo}</div>{/if}
          {#if d.notas}<div class="text-xs text-slate-500 italic mt-1">{d.notas}</div>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</BottomSheet>

<!-- Sheet: criar designação -->
<BottomSheet bind:open={sheetDesignar} title="Designar quadras">
  <form
    method="POST"
    action="?/criarDesignacao"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.msg || 'Criada');
          sheetDesignar = false;
          limparSelecao();
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    {#each [...selecionadas] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}

    <div class="rounded-lg bg-slate-50 p-3 text-sm">
      <div class="font-medium mb-1">{selecionadas.size} quadra(s)</div>
      <div class="text-xs text-slate-500 font-mono">{[...selecionadas].join(', ')}</div>
    </div>

    <div>
      <label for="publicador_id" class="block text-sm font-medium mb-1">Publicador</label>
      <select id="publicador_id" name="publicador_id" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">— escolha —</option>
        {#each data.publicadores as p}
          <option value={p.id}>{p.nome} ({p.role})</option>
        {/each}
      </select>
    </div>

    <div>
      <label for="prazo" class="block text-sm font-medium mb-1">Prazo (opcional)</label>
      <input id="prazo" name="prazo" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div>
      <label for="notas" class="block text-sm font-medium mb-1">Notas (opcional)</label>
      <textarea id="notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetDesignar = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Designar</Button>
    </div>
  </form>
</BottomSheet>

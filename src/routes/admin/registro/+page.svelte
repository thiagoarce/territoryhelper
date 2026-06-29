<script lang="ts">
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaAdmin from '$lib/components/MapaAdmin.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo } from '$lib/server/queries';

  let { data, form }: { data: { quadras: QuadraGeo[]; quadrasAlocadas: string[] }; form: any } = $props();

  let selecionadas = $state<Set<string>>(new Set());
  let dataConclusao = $state(new Date().toISOString().substring(0, 10));
  let mostrarRotulos = $state(true);
  let basemap = $state<'positron' | 'liberty' | 'bright'>('bright');
  let sheetDetalhe = $state(false);
  let quadraDetalhe = $state<QuadraGeo | null>(null);
  let historicoQuadra = $state<{ data_conclusao: string; marcado_em: string; nome: string | null }[]>([]);
  let carregandoHistorico = $state(false);
  let salvando = $state(false);

  // Conflito de data anterior
  let conflito = $state<{ ids: string[]; data: string; ultimas: { id: string; ultima: string }[] } | null>(null);

  async function reSubmeter(modo: 'substituir' | 'historico') {
    if (!conflito) return;
    salvando = true;
    try {
      const fd = new FormData();
      for (const id of conflito.ids) fd.append('ids', id);
      fd.append('data', conflito.data);
      fd.append('modo', modo);
      const res = await fetch('?/marcarConcluidas', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success') {
        toast.success(modo === 'substituir' ? 'Substituída' : 'Adicionada ao histórico');
        conflito = null;
        limpar();
        await invalidateAll();
      } else {
        toast.error('Falhou');
      }
    } finally {
      salvando = false;
    }
  }

  function onClickQuadra(q: QuadraGeo) {
    if (!q.ativa) {
      toast.info(`Quadra ${q.id} está inativa — edita pelo Polígonos pra reativar`);
      return;
    }
    if (selecionadas.has(q.id)) selecionadas.delete(q.id);
    else selecionadas.add(q.id);
    selecionadas = new Set(selecionadas);
  }

  async function onLongPress(q: QuadraGeo) {
    quadraDetalhe = q;
    historicoQuadra = [];
    sheetDetalhe = true;
    carregandoHistorico = true;
    try {
      const fd = new FormData();
      fd.append('id', q.id);
      const res = await fetch('?/historico', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success' && result.data?.historico) {
        historicoQuadra = result.data.historico.map((h: any) => ({
          data_conclusao: h.data_conclusao,
          marcado_em: h.marcado_em,
          nome: h.profiles?.nome ?? null
        }));
      }
    } finally {
      carregandoHistorico = false;
    }
  }

  function limpar() { selecionadas = new Set(); }

  function diasDesde(s: string | null): number | null {
    if (!s) return null;
    const d = new Date(s + 'T12:00:00').getTime();
    return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
  }

  const stats = $derived.by(() => {
    const semNunca = data.quadras.filter((q) => q.status !== 'inativa' && !q.data_conclusao).length;
    const recentes = data.quadras.filter((q) => {
      const d = diasDesde(q.data_conclusao);
      return d != null && d < 30;
    }).length;
    const velhas = data.quadras.filter((q) => {
      const d = diasDesde(q.data_conclusao);
      return d != null && d > 90;
    }).length;
    return { semNunca, recentes, velhas };
  });
</script>

<div class="p-4 space-y-3">
  <div class="flex items-center justify-between flex-wrap gap-2">
    <div>
      <h1 class="text-2xl font-bold">Registro</h1>
      <p class="text-sm text-slate-500">Click numa quadra pra selecionar. Long-press abre detalhes.</p>
    </div>
    <div class="flex items-center gap-2">
      <select bind:value={basemap} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" title="Mapa base">
        <option value="positron">Cinza</option>
        <option value="liberty">Colorido</option>
        <option value="bright">Brilhante</option>
      </select>
      <label class="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="checkbox" bind:checked={mostrarRotulos} class="w-4 h-4 rounded" />
        Rótulos
      </label>
    </div>
  </div>

  <!-- Legenda gradient -->
  <div class="flex items-center gap-3 text-xs flex-wrap">
    <span class="font-medium text-slate-600">Idade:</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-green-500/60"></span>&lt;15d</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-yellow-400/60"></span>&lt;30d</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-orange-500/60"></span>&lt;60d</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-red-600/60"></span>&gt;90d</span>
    <span class="flex items-center gap-1"><span class="inline-block w-3 h-3 rounded bg-slate-400/30"></span>nunca</span>
  </div>

  <!-- Stats compactos -->
  <div class="grid grid-cols-3 gap-2 text-center">
    <div class="rounded-lg bg-green-50 p-2">
      <div class="text-lg font-bold text-green-700">{stats.recentes}</div>
      <div class="text-[10px] text-slate-500 uppercase">&lt;30d</div>
    </div>
    <div class="rounded-lg bg-red-50 p-2">
      <div class="text-lg font-bold text-red-700">{stats.velhas}</div>
      <div class="text-[10px] text-slate-500 uppercase">&gt;90d</div>
    </div>
    <div class="rounded-lg bg-slate-100 p-2">
      <div class="text-lg font-bold text-slate-700">{stats.semNunca}</div>
      <div class="text-[10px] text-slate-500 uppercase">nunca</div>
    </div>
  </div>

  <MapaAdmin
    quadras={data.quadras}
    altura={500}
    colorirPor="idade"
    {mostrarRotulos}
    quadrasAlocadas={data.quadrasAlocadas}
    bind:selecionadas
    bind:basemap
    onClick={onClickQuadra}
    {onLongPress}
  />
</div>

<!-- Barra inferior quando tem seleção -->
{#if selecionadas.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex flex-col gap-2">
    <div class="flex items-center gap-1 overflow-x-auto pb-1">
      <span class="text-xs font-medium text-slate-500 whitespace-nowrap mr-1">{selecionadas.size}:</span>
      {#each [...selecionadas] as qid}
        <span class="text-[10px] font-mono bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded whitespace-nowrap">{qid}</span>
      {/each}
    </div>
    <div class="flex items-center gap-2 flex-wrap">
    <form
      method="POST"
      action="?/marcarConcluidas"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            const d = result.data as any;
            // Server devolve { ok:false, conflito:true, ... } como success normal
            if (d?.conflito) {
              conflito = { ids: d.ids, data: d.data, ultimas: d.ultimas };
              return;
            }
            toast.success(d?.msg || 'Concluídas');
            limpar();
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="flex items-center gap-2 ml-auto"
    >
      {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
      <input
        name="data"
        type="date"
        bind:value={dataConclusao}
        class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      />
      <Button variant="success" size="sm" type="submit" loading={salvando}>✓ Concluir</Button>
    </form>
    <form
      method="POST"
      action="?/reverter"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') {
          toast.info(String((result.data as any)?.msg || 'Revertidas'));
          limpar();
          await invalidateAll();
        }
      }}
    >
      {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
      <Button variant="secondary" size="sm" type="submit" title="Desfaz a última conclusão e volta pra penúltima">↻ Reverter</Button>
    </form>
    <form
      method="POST"
      action="?/limparConclusao"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') {
          toast.warn(String((result.data as any)?.msg || 'Limpa(s)'));
          limpar();
          await invalidateAll();
        }
      }}
      onsubmit={(e) => { if (!confirm(`Apagar TODO o histórico de ${selecionadas.size} quadra(s)? Não dá pra desfazer.`)) e.preventDefault(); }}
    >
      {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
      <Button variant="ghost" size="sm" type="submit" title="APAGA todo histórico e marca como pendente">🗑 Limpar</Button>
    </form>
    <Button variant="ghost" size="sm" onclick={limpar}>Cancelar</Button>
    </div>
  </div>
{/if}

<!-- Sheet detalhe (long-press) -->
<BottomSheet bind:open={sheetDetalhe} title={quadraDetalhe ? `Quadra ${quadraDetalhe.id}` : ''}>
  {#if quadraDetalhe}
    {@const dias = diasDesde(quadraDetalhe.data_conclusao)}
    <div class="space-y-2 text-sm">
      <div><span class="text-slate-500">Território:</span> <span class="font-medium">{quadraDetalhe.territorio_nome || '—'}</span></div>
      <div><span class="text-slate-500">Status:</span> <span class="font-medium">{quadraDetalhe.status}</span></div>
      <div><span class="text-slate-500">Endereços:</span> <span class="font-medium">{quadraDetalhe.qtd_locais}</span></div>
      <div>
        <span class="text-slate-500">Última conclusão:</span>
        {#if quadraDetalhe.data_conclusao}
          <span class="font-medium">{quadraDetalhe.data_conclusao}</span>
          <span class="text-xs text-slate-400 ml-1">({dias}d atrás)</span>
        {:else}
          <span class="font-medium text-slate-400">nunca</span>
        {/if}
      </div>

      <!-- Histórico -->
      <div class="mt-3 border-t border-slate-100 pt-2">
        <div class="text-xs font-semibold text-slate-600 mb-1">Histórico</div>
        {#if carregandoHistorico}
          <div class="text-xs text-slate-400">carregando...</div>
        {:else if historicoQuadra.length === 0}
          <div class="text-xs text-slate-400">Nenhuma conclusão registrada ainda.</div>
        {:else}
          <ul class="text-xs space-y-1">
            {#each historicoQuadra as h}
              <li class="flex items-center justify-between">
                <span class="font-mono">{h.data_conclusao}</span>
                <span class="text-slate-500">{h.nome ?? '(sem autor)'}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      {#if quadraDetalhe.notas}
        <div><span class="text-slate-500">Notas:</span> <span class="italic">{quadraDetalhe.notas}</span></div>
      {/if}
    </div>
  {/if}
</BottomSheet>

<!-- Sheet: conflito de data anterior -->
<BottomSheet open={conflito !== null} title="⚠ Data anterior detectada">
  {#if conflito}
    <div class="space-y-3 text-sm">
      <p class="text-slate-600">
        Você está marcando <strong>{conflito.ids.length} quadra(s)</strong> como concluídas em
        <strong class="font-mono">{conflito.data}</strong>,
        mas essas quadras já têm conclusão mais recente:
      </p>
      <ul class="text-xs space-y-1 max-h-32 overflow-y-auto bg-slate-50 rounded p-2">
        {#each conflito.ultimas as u}
          <li class="flex justify-between">
            <span class="font-mono font-semibold">{u.id}</span>
            <span class="text-slate-500">última: {u.ultima}</span>
          </li>
        {/each}
      </ul>
      <p class="text-xs text-slate-500">O que fazer?</p>
      <div class="flex flex-col gap-2">
        <Button variant="primary" onclick={() => reSubmeter('historico')} loading={salvando}>
          📜 Só adicionar ao histórico
          <span class="block text-xs font-normal opacity-70">Mantém a última como atual</span>
        </Button>
        <Button variant="secondary" onclick={() => reSubmeter('substituir')} loading={salvando}>
          🔄 Substituir a última
          <span class="block text-xs font-normal opacity-70">Apaga a última e usa essa</span>
        </Button>
        <Button variant="ghost" onclick={() => (conflito = null)}>
          ❌ Cancelar (foi erro)
        </Button>
      </div>
    </div>
  {/if}
</BottomSheet>

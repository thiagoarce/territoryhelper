<script lang="ts">
  import type { QuadraEnriquecida } from '$lib/server/queries';
  import type { Territorio } from '$lib/types';

  let {
    data
  }: { data: { quadras: QuadraEnriquecida[]; territorios: Territorio[] } } = $props();

  let busca = $state('');
  let filtroStatus = $state<'todos' | 'pendente' | 'concluido' | 'inativa'>('todos');
  let filtroTerritorio = $state<string>('todos');

  const filtradas = $derived(
    data.quadras.filter((q) => {
      if (filtroStatus !== 'todos' && q.status !== filtroStatus) return false;
      if (filtroTerritorio !== 'todos') {
        if (filtroTerritorio === '__sem') {
          if (q.territorio_id) return false;
        } else if (q.territorio_id !== filtroTerritorio) return false;
      }
      if (busca.trim()) {
        const b = busca.toLowerCase();
        if (!q.id.toLowerCase().includes(b) && !(q.territorio_nome || '').toLowerCase().includes(b))
          return false;
      }
      return true;
    })
  );

  const statusClasses: Record<string, string> = {
    pendente: 'bg-amber-100 text-amber-700',
    concluido: 'bg-green-100 text-green-700',
    inativa: 'bg-slate-100 text-slate-500'
  };
</script>

<div class="flex items-end justify-between gap-4 flex-wrap">
  <div>
    <h1 class="text-2xl font-bold">Quadras</h1>
    <p class="text-sm text-slate-500 mt-1">{data.quadras.length} cadastrada(s)</p>
  </div>
</div>

<!-- Filtros -->
<div class="mt-4 flex gap-3 flex-wrap items-center">
  <input
    type="search"
    bind:value={busca}
    placeholder="Buscar por id ou território..."
    class="rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 w-64"
  />
  <select bind:value={filtroStatus} class="rounded border border-slate-300 px-3 py-2 text-sm">
    <option value="todos">Todos os status</option>
    <option value="pendente">Pendente</option>
    <option value="concluido">Concluído</option>
    <option value="inativa">Inativa</option>
  </select>
  <select bind:value={filtroTerritorio} class="rounded border border-slate-300 px-3 py-2 text-sm">
    <option value="todos">Todos os territórios</option>
    <option value="__sem">Sem território</option>
    {#each data.territorios as t}
      <option value={t.id}>{t.nome}</option>
    {/each}
  </select>
  <div class="text-sm text-slate-500 ml-auto">
    Mostrando <strong>{filtradas.length}</strong>
  </div>
</div>

<!-- Tabela -->
<div class="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
  <table class="w-full text-sm">
    <thead class="bg-slate-50 text-left text-xs uppercase text-slate-500">
      <tr>
        <th class="px-3 py-2">Quadra</th>
        <th class="px-3 py-2">Território</th>
        <th class="px-3 py-2">Status</th>
        <th class="px-3 py-2 text-right">Locais</th>
        <th class="px-3 py-2">Última conclusão</th>
        <th class="px-3 py-2"></th>
      </tr>
    </thead>
    <tbody>
      {#each filtradas as q (q.id)}
        <tr class="border-t border-slate-100 hover:bg-slate-50">
          <td class="px-3 py-2 font-mono font-semibold">
            <span
              class="inline-block w-3 h-3 rounded mr-2 align-middle"
              style:background-color={q.color}
            ></span>
            {q.id}
          </td>
          <td class="px-3 py-2 text-slate-600">{q.territorio_nome ?? '—'}</td>
          <td class="px-3 py-2">
            <span class="rounded px-2 py-0.5 text-xs {statusClasses[q.status] ?? 'bg-slate-100 text-slate-600'}">
              {q.status}
            </span>
          </td>
          <td class="px-3 py-2 text-right">{q.qtd_locais}</td>
          <td class="px-3 py-2 text-slate-500">{q.data_conclusao ?? '—'}</td>
          <td class="px-3 py-2 text-right">
            <a
              href="/admin/quadras/{encodeURIComponent(q.id)}"
              class="text-sm text-primary-700 hover:underline"
            >
              Abrir
            </a>
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="6" class="px-3 py-10 text-center text-slate-400">
            {data.quadras.length === 0
              ? 'Nenhuma quadra cadastrada. Importe os dados do Sheets antigo via npm run migrate.'
              : 'Nenhuma quadra bate com os filtros.'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

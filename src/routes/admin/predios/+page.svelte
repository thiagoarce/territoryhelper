<script lang="ts">
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { PredioListado, PredioDetalhado } from '$lib/server/queries';

  let { data, form }: { data: { predios: PredioListado[] }; form: any } = $props();

  let busca = $state('');
  let filtroTipo = $state<'todos' | 'residencial' | 'comercial'>('todos');
  let filtroPortaria = $state<'todos' | 'porteiro' | 'eletronica' | 'sem' | 'sem_info'>('todos');
  let soComIrmao = $state(false);
  let soComCaixas = $state(false);
  let soComInterfone = $state(false);
  let mostrarFiltros = $state(false);

  const filtrados = $derived(
    data.predios.filter((p) => {
      if (filtroTipo === 'residencial' && p.tipo !== 'predio') return false;
      if (filtroTipo === 'comercial' && p.tipo !== 'comercio') return false;

      if (filtroPortaria !== 'todos') {
        if (filtroPortaria === 'sem_info' && p.tipo_entrada != null) return false;
        else if (filtroPortaria !== 'sem_info' && p.tipo_entrada !== filtroPortaria) return false;
      }

      if (soComIrmao && !p.irmao_mora) return false;
      if (soComCaixas && !p.acesso_caixas) return false;
      if (soComInterfone && !p.acesso_interfones) return false;

      if (busca.trim()) {
        const b = busca.toLowerCase();
        if (!((p.nome || '').toLowerCase().includes(b) ||
              p.logradouro.toLowerCase().includes(b) ||
              p.numero.toLowerCase().includes(b))) return false;
      }
      return true;
    })
  );

  const stats = $derived.by(() => ({
    residencial: data.predios.filter((p) => p.tipo === 'predio').length,
    comercial: data.predios.filter((p) => p.tipo === 'comercio').length,
    comIrmao: data.predios.filter((p) => p.irmao_mora).length
  }));

  function limparFiltros() {
    filtroTipo = 'todos';
    filtroPortaria = 'todos';
    soComIrmao = false;
    soComCaixas = false;
    soComInterfone = false;
  }

  const filtrosAtivos = $derived(
    (filtroTipo !== 'todos' ? 1 : 0) +
    (filtroPortaria !== 'todos' ? 1 : 0) +
    (soComIrmao ? 1 : 0) +
    (soComCaixas ? 1 : 0) +
    (soComInterfone ? 1 : 0)
  );

  // Modal de editar
  let sheetEditar = $state(false);
  let predioSel: PredioDetalhado | null = $state(null);
  let irmaoMora = $state(false);
  let salvando = $state(false);

  async function abrirEditar(predioId: number) {
    try {
      const fd = new FormData();
      fd.append('id', String(predioId));
      const res = await fetch('?/detalhe', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success' && result.data?.predio) {
        predioSel = result.data.predio as PredioDetalhado;
        irmaoMora = predioSel.irmao_mora;
        sheetEditar = true;
        return;
      }
      throw new Error(result.data?.erro || 'sem dados');
    } catch (e) {
      // Fallback: usa o predio listado básico
      const p = data.predios.find((p) => p.id === predioId);
      if (p) {
        predioSel = {
          ...p,
          nome_irmao: null,
          notas: null,
          geo_geojson: null,
          unidades: []
        } as any;
        irmaoMora = p.irmao_mora;
        sheetEditar = true;
      } else {
        toast.error('Não consegui abrir o prédio');
      }
    }
  }

  async function compartilharWhatsApp(predioId: number, nome: string | null, logradouro: string, numero: string) {
    try {
      const fd = new FormData();
      fd.append('id', String(predioId));
      const res = await fetch('?/gerarLink', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success' && result.data?.token) {
        const url = `${window.location.origin}/cartas/${result.data.token}`;
        const msg = `Trabalho de cartas — *${nome || logradouro + ', ' + numero}*\n\n${url}`;
        window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
        return;
      }
      throw new Error(result.data?.erro || 'sem token');
    } catch {
      toast.error('Não consegui gerar o link');
    }
  }

  function pct(parcial: number, total: number): number {
    return total === 0 ? 0 : Math.round((parcial / total) * 100);
  }
</script>

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Prédios — Cartas</h1>
    <p class="text-sm text-slate-500">
      {filtrados.length} de {data.predios.length} · 🏢 {stats.residencial} residenciais · 🏪 {stats.comercial} comerciais
    </p>
  </div>

  <input
    type="search"
    bind:value={busca}
    placeholder="Buscar logradouro, nome..."
    class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
  />

  <!-- Tabs de tipo -->
  <div class="flex gap-1 rounded-lg bg-slate-100 p-0.5">
    {#each [['todos', `Todos (${data.predios.length})`], ['residencial', `🏢 Residencial (${stats.residencial})`], ['comercial', `🏪 Comercial (${stats.comercial})`]] as [k, l]}
      <button
        onclick={() => (filtroTipo = k as any)}
        class="flex-1 px-2 py-1.5 text-xs sm:text-sm rounded transition-colors"
        class:bg-white={filtroTipo === k}
        class:font-medium={filtroTipo === k}
        class:shadow-sm={filtroTipo === k}
        class:text-slate-500={filtroTipo !== k}
      >{l}</button>
    {/each}
  </div>

  <!-- Botão de filtros avançados (mostra contador se ativos) -->
  <div class="flex items-center gap-2">
    <button
      onclick={() => (mostrarFiltros = !mostrarFiltros)}
      class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5"
    >
      ⚙ Filtros{#if filtrosAtivos > 0}<span class="bg-primary-600 text-white text-[10px] px-1.5 rounded-full">{filtrosAtivos}</span>{/if}
    </button>
    {#if filtrosAtivos > 0}
      <button onclick={limparFiltros} class="text-xs text-slate-500 hover:underline">Limpar filtros</button>
    {/if}
  </div>

  {#if mostrarFiltros}
    <div class="rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50">
      <div>
        <span class="block text-xs font-medium text-slate-600 mb-1">Portaria</span>
        <div class="flex gap-1 flex-wrap">
          {#each [['todos', 'Todos'], ['porteiro', '👮 Porteiro'], ['eletronica', '🔘 Eletrônica'], ['sem', '🚪 Sem'], ['sem_info', 'Sem info']] as [k, l]}
            <button
              onclick={() => (filtroPortaria = k as any)}
              class="text-xs px-2 py-1 rounded border"
              class:bg-primary-100={filtroPortaria === k}
              class:border-primary-500={filtroPortaria === k}
              class:text-primary-700={filtroPortaria === k}
              class:border-slate-300={filtroPortaria !== k}
              class:bg-white={filtroPortaria !== k}
            >{l}</button>
          {/each}
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label class="flex items-center gap-2 cursor-pointer p-2 bg-white border border-slate-200 rounded-lg">
          <input type="checkbox" bind:checked={soComIrmao} class="w-4 h-4 rounded" />
          <span class="text-sm">👤 Só com irmão</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer p-2 bg-white border border-slate-200 rounded-lg">
          <input type="checkbox" bind:checked={soComCaixas} class="w-4 h-4 rounded" />
          <span class="text-sm">📬 Só com caixas</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer p-2 bg-white border border-slate-200 rounded-lg">
          <input type="checkbox" bind:checked={soComInterfone} class="w-4 h-4 rounded" />
          <span class="text-sm">📞 Só com interfone</span>
        </label>
      </div>
    </div>
  {/if}

  <div class="space-y-2">
    {#each filtrados as p (p.id)}
      <div class="rounded-lg border border-slate-200 bg-white p-3 flex items-start gap-3">
        <button
          type="button"
          onclick={() => abrirEditar(p.id)}
          class="flex-1 text-left min-w-0"
        >
          <div class="font-semibold truncate flex items-center gap-1.5">
            <span title={p.tipo === 'comercio' ? 'Comercial' : 'Residencial'}>{p.tipo === 'comercio' ? '🏪' : '🏢'}</span>
            {p.nome || `${p.logradouro}, ${p.numero}`}
            {#if p.irmao_mora}<span title="Irmão mora">👤</span>{/if}
          </div>
          <div class="text-xs text-slate-500 truncate mt-0.5">
            {p.logradouro}, {p.numero} · {p.qtd_aptos} {p.tipo === 'comercio' ? 'unidade' : 'apto'}(s)
            {#if p.quadra_id}· Q{p.quadra_id}{/if}
          </div>
          <div class="mt-2 flex gap-1 flex-wrap">
            {#if p.tipo_entrada === 'porteiro'}<span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Porteiro</span>{/if}
            {#if p.tipo_entrada === 'eletronica'}<span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Eletrônica</span>{/if}
            {#if p.acesso_caixas}<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📬</span>{/if}
            {#if p.acesso_interfones}<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📞</span>{/if}
            <span class="text-[10px] text-slate-500 ml-auto">{p.qtd_carta_entregue}/{p.qtd_aptos} entregues</span>
          </div>
          <div class="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full bg-purple-500" style:width="{pct(p.qtd_carta_entregue, p.qtd_aptos)}%"></div>
          </div>
        </button>
        <button
          type="button"
          onclick={() => compartilharWhatsApp(p.id, p.nome, p.logradouro, p.numero)}
          aria-label="Compartilhar no WhatsApp"
          class="w-10 h-10 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 flex items-center justify-center shrink-0"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1-.3-.1-1.2-.4-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.4.1-.5.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.3 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.5h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2 0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.2.7 3 .6.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.2-.2-.4-.3M12 21c-1.6 0-3.2-.4-4.6-1.3l-.3-.2-3.4.9.9-3.3-.2-.3C3.5 15.4 3 13.7 3 12c0-5 4-9 9-9s9 4 9 9-4 9-9 9m0-20C6 1 1 6 1 12c0 1.9.5 3.8 1.5 5.4L1 23l5.7-1.5c1.6.9 3.4 1.4 5.3 1.4 6 0 11-5 11-11S18 1 12 1"/></svg>
        </button>
      </div>
    {:else}
      <div class="text-center py-10">
        <div class="text-5xl mb-3 opacity-60">🏢</div>
        <div class="text-base text-slate-700">Nenhum prédio bate</div>
      </div>
    {/each}
  </div>
</div>

<!-- Modal editar prédio (igual ao GAS) -->
<BottomSheet bind:open={sheetEditar} title="Editar prédio">
  {#if predioSel}
    <form
      method="POST"
      action="?/atualizar"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            toast.success('Salvo');
            sheetEditar = false;
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-4"
    >
      <input type="hidden" name="id" value={predioSel.id} />

      <div class="text-sm text-slate-500">{predioSel.logradouro}, {predioSel.numero} · {predioSel.qtd_aptos} apto(s)</div>

      <div>
        <label for="nome" class="block text-sm font-medium mb-1">Nome do edifício</label>
        <input id="nome" name="nome" value={predioSel.nome ?? ''} placeholder="Ex: Edif. Solar" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <span class="block text-sm font-medium mb-2">Entrada do prédio</span>
        <div class="grid grid-cols-3 gap-2">
          {#each [{ v: 'porteiro', l: 'Porteiro', icon: '👮' }, { v: 'eletronica', l: 'Eletrônica', icon: '🔘' }, { v: 'sem', l: 'Sem portaria', icon: '🚪' }] as opt}
            <label class="cursor-pointer">
              <input type="radio" name="tipo_entrada" value={opt.v} checked={predioSel.tipo_entrada === opt.v} class="peer sr-only" />
              <div class="text-center text-sm px-3 py-3 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">
                <div class="text-xl mb-0.5">{opt.icon}</div>
                <div class="text-xs">{opt.l}</div>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <label class="flex items-center gap-2 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="acesso_caixas" checked={predioSel.acesso_caixas} class="w-4 h-4 rounded" />
          <span class="text-sm flex items-center gap-1">📬 Acesso caixas</span>
        </label>
        <label class="flex items-center gap-2 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
          <input type="checkbox" name="acesso_interfones" checked={predioSel.acesso_interfones} class="w-4 h-4 rounded" />
          <span class="text-sm flex items-center gap-1">📞 Interfones</span>
        </label>
      </div>

      <div class="rounded-lg bg-amber-50 border border-amber-200 p-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="irmao_mora" bind:checked={irmaoMora} class="w-4 h-4 rounded" />
          <span class="text-sm font-medium flex items-center gap-1">👤 Irmão mora aqui</span>
        </label>
        {#if irmaoMora}
          <input name="nome_irmao" value={predioSel.nome_irmao ?? ''} placeholder="Nome do irmão" class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        {/if}
      </div>

      <div class="rounded-lg border border-slate-200 p-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="nao_eh_predio" checked={(predioSel as any).nao_eh_predio ?? false} class="w-4 h-4 rounded" />
          <span class="text-sm flex items-center gap-1">🚫 Não é prédio (vila / casas geminadas)</span>
        </label>
        <p class="text-xs text-slate-500 mt-1 ml-6">Marque pra remover da lista de prédios</p>
      </div>

      <div>
        <label for="notas" class="block text-sm font-medium mb-1">📝 Notas</label>
        <textarea id="notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{predioSel.notas ?? ''}</textarea>
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (sheetEditar = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvando} class="flex-1">Salvar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

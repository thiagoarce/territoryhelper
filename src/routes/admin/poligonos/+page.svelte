<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaPoligonos from '$lib/components/MapaPoligonos.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo } from '$lib/server/queries';
  import type { LocalComGeo } from './$types';

  let { data, form }: {
    data: {
      locais: LocalComGeo[];
      quadras: QuadraGeo[];
      quadrasMultiCluster: { quadra_id: string; clusters: { cluster: string; qtd: number }[] }[];
      quadrasVazias: string[];
      quadrasParaRenomear: { id: string; color: string; status: string }[];
    };
    form: any;
  } = $props();

  type Modo = 'vincular' | 'renomear' | 'auditar' | 'status';

  let modo = $state<Modo>('vincular');
  let sheetStatus = $state(false);
  let quadraStatusEdit = $state<QuadraGeo | null>(null);
  let filtroTipo = $state<'dom' | 'com' | 'ambos'>('ambos');
  let filtroVinculo = $state<'vinculados' | 'sem' | 'ambos'>('ambos');
  let mostrarRotulos = $state(true);
  let basemap = $state<'positron' | 'liberty' | 'bright'>('bright');
  let selecionadosLocais = $state<Set<number>>(new Set());
  let quadraDestaque = $state<string | null>(null);
  let salvando = $state(false);

  // Renomear
  let renomeando: string | null = $state(null);
  let sheetRenomeio = $state(false);

  function onClickLocal(l: LocalComGeo) {
    if (modo !== 'vincular') return;
    if (selecionadosLocais.has(l.id)) selecionadosLocais.delete(l.id);
    else selecionadosLocais.add(l.id);
    selecionadosLocais = new Set(selecionadosLocais);
  }

  async function onClickQuadra(q: QuadraGeo) {
    if (modo === 'renomear') {
      renomeando = q.id;
      sheetRenomeio = true;
      return;
    }
    if (modo === 'status') {
      quadraStatusEdit = q;
      sheetStatus = true;
      return;
    }
    if (modo === 'vincular' && selecionadosLocais.size > 0) {
      const fd = new FormData();
      fd.append('quadra_id', q.id);
      for (const id of selecionadosLocais) fd.append('local_ids', String(id));
      salvando = true;
      try {
        const res = await fetch('?/vincularManual', { method: 'POST', body: fd });
        const { deserialize } = await import('$app/forms');
        const result = deserialize(await res.text()) as any;
        if (result.type === 'success') {
          toast.success(`${selecionadosLocais.size} endereço(s) vinculado(s) a ${q.id}`);
          selecionadosLocais = new Set();
          await invalidateAll();
        } else {
          toast.error(String(result.data?.erro || 'Falhou'));
        }
      } finally {
        salvando = false;
      }
    }
  }

  function destacarQuadra(id: string) {
    quadraDestaque = quadraDestaque === id ? null : id;
  }

  function limparSelecao() { selecionadosLocais = new Set(); }

  const stats = $derived.by(() => {
    const semQuadra = data.locais.filter((l) => !l.quadra_id).length;
    const total = data.locais.length;
    return { total, semQuadra, vinculados: total - semQuadra };
  });
</script>

<div class="p-4 space-y-3">
  <!-- Toolbar topo -->
  <div class="flex items-center gap-2 flex-wrap">
    <div class="flex gap-1 rounded-lg bg-slate-100 p-0.5">
      {#each [['vincular', 'Vincular'], ['renomear', 'Renomear'], ['status', 'Status'], ['auditar', 'Auditar']] as [k, l]}
        <button
          onclick={() => (modo = k as Modo)}
          class="px-3 py-1 text-sm rounded transition-colors"
          class:bg-white={modo === k}
          class:font-medium={modo === k}
          class:shadow-sm={modo === k}
          class:text-slate-500={modo !== k}
        >{l}</button>
      {/each}
    </div>

    {#if modo === 'vincular'}
      <select bind:value={filtroTipo} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
        <option value="ambos">Casa + Comércio</option>
        <option value="dom">Só Casa</option>
        <option value="com">Só Comércio</option>
      </select>
      <select bind:value={filtroVinculo} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
        <option value="ambos">Todos</option>
        <option value="vinculados">Vinculados</option>
        <option value="sem">Sem quadra</option>
      </select>
    {/if}

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
  <div class="grid grid-cols-3 gap-2 text-center text-xs">
    <div class="rounded bg-slate-50 p-2">
      <div class="font-bold text-base">{stats.total.toLocaleString('pt-BR')}</div>
      <div class="text-slate-500 uppercase">endereços</div>
    </div>
    <div class="rounded bg-green-50 p-2">
      <div class="font-bold text-base text-green-700">{stats.vinculados.toLocaleString('pt-BR')}</div>
      <div class="text-slate-500 uppercase">vinculados</div>
    </div>
    <div class="rounded bg-red-50 p-2">
      <div class="font-bold text-base text-red-700">{stats.semQuadra.toLocaleString('pt-BR')}</div>
      <div class="text-slate-500 uppercase">sem quadra</div>
    </div>
  </div>

  <!-- Botões de ação por modo -->
  {#if modo === 'vincular' && stats.semQuadra > 0}
    <form
      method="POST"
      action="?/autoVincular"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            toast.success((result.data as any)?.msg || 'OK');
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
    >
      <Button variant="primary" type="submit" loading={salvando}>⚡ Auto-vincular {stats.semQuadra} endereço(s)</Button>
    </form>
  {/if}

  {#if modo === 'auditar'}
    {#if data.quadrasMultiCluster.length === 0 && data.quadrasVazias.length === 0}
      <div class="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
        ✓ Nada pra auditar — todas as quadras consistentes
      </div>
    {:else}
      <div class="space-y-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {#if data.quadrasMultiCluster.length > 0}
          <div class="text-xs font-semibold text-amber-700">⚠ Quadras com múltiplos clusters IBGE</div>
          {#each data.quadrasMultiCluster as item}
            <button
              onclick={() => destacarQuadra(item.quadra_id)}
              class="w-full text-left text-xs px-2 py-1 rounded hover:bg-amber-50"
              class:bg-amber-100={quadraDestaque === item.quadra_id}
            >
              <span class="font-mono font-semibold">{item.quadra_id}</span>
              <span class="text-slate-500">— {item.clusters.length} clusters</span>
            </button>
          {/each}
        {/if}
        {#if data.quadrasVazias.length > 0}
          <div class="text-xs font-semibold text-red-700 mt-2">∅ Quadras sem endereço</div>
          <div class="flex flex-wrap gap-1">
            {#each data.quadrasVazias as qid}
              <button
                onclick={() => destacarQuadra(qid)}
                class="text-xs font-mono px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100"
                class:ring-2={quadraDestaque === qid}
              >{qid}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  <!-- Instruções por modo -->
  <p class="text-xs text-slate-500 text-center">
    {#if modo === 'vincular'}
      {#if selecionadosLocais.size === 0}
        Click nos pontos pra selecionar endereços. Depois click numa quadra pra vincular.
      {:else}
        <strong>{selecionadosLocais.size}</strong> endereço(s) selecionado(s) · click numa quadra pra vincular
      {/if}
    {:else if modo === 'renomear'}
      Click numa quadra no mapa pra renomear.
    {:else if modo === 'status'}
      Click numa quadra pra mudar status (pendente / concluído / inativa).
    {:else}
      Click num item da lista pra destacar a quadra no mapa.
    {/if}
  </p>

  <MapaPoligonos
    quadras={data.quadras}
    locais={data.locais}
    altura={500}
    {mostrarRotulos}
    {filtroTipo}
    {filtroVinculo}
    {quadraDestaque}
    bind:selecionadosLocais
    bind:basemap
    {onClickLocal}
    {onClickQuadra}
  />
</div>

<!-- Barra inferior quando há seleção -->
{#if modo === 'vincular' && selecionadosLocais.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium">
      <strong>{selecionadosLocais.size}</strong> selecionado(s)
    </div>
    <p class="text-xs text-slate-500 hidden sm:block">click numa quadra pra vincular · ou:</p>

    <form
      method="POST"
      action="?/desvincular"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success('Desvinculados'); limparSelecao(); await invalidateAll(); }
      }}
      onsubmit={(e) => { if (!confirm(`Remover quadra de ${selecionadosLocais.size} endereço(s)?`)) e.preventDefault(); }}
    >
      {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
      <Button variant="ghost" size="sm" type="submit">↺ Desvincular</Button>
    </form>

    <form
      method="POST"
      action="?/toggleAtivacao"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); limparSelecao(); await invalidateAll(); }
      }}
    >
      {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
      <input type="hidden" name="ativar" value="false" />
      <Button variant="ghost" size="sm" type="submit">∅ Desativar</Button>
    </form>

    <form
      method="POST"
      action="?/toggleAtivacao"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); limparSelecao(); await invalidateAll(); }
      }}
    >
      {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
      <input type="hidden" name="ativar" value="true" />
      <Button variant="ghost" size="sm" type="submit">✓ Ativar</Button>
    </form>

    <Button variant="ghost" size="sm" onclick={limparSelecao} class="ml-auto">Limpar</Button>
  </div>
{/if}

<!-- Sheet renomeio -->
<BottomSheet bind:open={sheetRenomeio} title={renomeando ? `Renomear ${renomeando}` : ''}>
  {#if renomeando}
    <form
      method="POST"
      action="?/renomearQuadra"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            toast.success((result.data as any)?.msg || 'OK');
            sheetRenomeio = false;
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-3"
    >
      <input type="hidden" name="id_antigo" value={renomeando} />
      <div>
        <label for="id_novo" class="block text-sm font-medium mb-1">Novo ID</label>
        <input
          id="id_novo"
          name="id_novo"
          required
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <p class="text-xs text-slate-500 mt-1">Cascata via locais e designacao_quadras.</p>
      </div>
      <div class="flex gap-2">
        <Button variant="secondary" onclick={() => (sheetRenomeio = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvando} class="flex-1">Renomear</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

<!-- Sheet: alterar status da quadra -->
<BottomSheet bind:open={sheetStatus} title={quadraStatusEdit ? `Status — ${quadraStatusEdit.id}` : ''}>
  {#if quadraStatusEdit}
    <div class="space-y-2 text-sm">
      <div class="text-xs text-slate-500">Status atual: <strong class="capitalize">{quadraStatusEdit.status}</strong></div>
      {#each [
        { v: 'pendente', label: '⏳ Pendente', desc: 'A trabalhar' },
        { v: 'concluido', label: '✓ Concluído', desc: 'Marca como feita hoje' },
        { v: 'inativa', label: '∅ Inativa', desc: 'Esconde do Registro, não conta na Campanha' }
      ] as opt}
        <form
          method="POST"
          action="?/alterarStatusQuadra"
          use:enhance={() => {
            salvando = true;
            return async ({ result, update }) => {
              await update();
              salvando = false;
              if (result.type === 'success') {
                toast.success((result.data as any)?.msg || 'OK');
                sheetStatus = false;
                await invalidateAll();
              } else if (result.type === 'failure') {
                toast.error(String((result.data as any)?.erro || 'Falhou'));
              }
            };
          }}
        >
          <input type="hidden" name="id" value={quadraStatusEdit.id} />
          <input type="hidden" name="status" value={opt.v} />
          <button type="submit"
            class="w-full text-left px-3 py-2 border rounded-lg hover:bg-slate-50 transition-colors"
            class:bg-primary-50={quadraStatusEdit.status === opt.v}
            class:border-primary-500={quadraStatusEdit.status === opt.v}
            class:border-slate-300={quadraStatusEdit.status !== opt.v}
          >
            <div class="font-medium">{opt.label}</div>
            <div class="text-xs text-slate-500">{opt.desc}</div>
          </button>
        </form>
      {/each}
      <Button variant="ghost" onclick={() => (sheetStatus = false)} class="w-full mt-2">Cancelar</Button>
    </div>
  {/if}
</BottomSheet>

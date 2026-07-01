<script lang="ts">
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';

  interface UnidadeEnriched {
    id: number;
    complemento: string | null;
    carta_entregue: string | null;
    desocupado: boolean;
    nao_escrever: boolean;
    nota: string | null;
    ultimo_tipo: string | null;
    ultimo_ts: string | null;
  }

  let { data }: {
    data: {
      predio: {
        id: number;
        nome: string | null;
        logradouro: string;
        numero: string;
        tipo_entrada: string | null;
        acesso_caixas: boolean;
        acesso_interfones: boolean;
        irmao_mora: boolean;
        nome_irmao: string | null;
        notas: string | null;
        unidades: UnidadeEnriched[];
      };
      minhaRole?: string;
    };
  } = $props();

  type Modo = 'casa' | 'cartas';
  let modo = $state<Modo>('cartas');

  // Persiste modo no localStorage por conveniência
  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const salvo = localStorage.getItem('predio_modo');
      if (salvo === 'casa' || salvo === 'cartas') modo = salvo;
    } catch {}
  });
  function trocarModo(m: Modo) {
    modo = m;
    try { localStorage.setItem('predio_modo', m); } catch {}
  }

  const cores: Record<string, string> = {
    naoAtendeu: 'bg-slate-200 text-slate-700',
    semConversa: 'bg-amber-200 text-amber-900',
    conversou: 'bg-green-200 text-green-900',
    carta: 'bg-purple-200 text-purple-900',
    desfeito: 'bg-slate-100 text-slate-500'
  };

  function unidadeVisitada(u: UnidadeEnriched): boolean {
    return !!u.ultimo_tipo && u.ultimo_tipo !== 'desfeito' && u.ultimo_tipo !== 'carta_undo';
  }

  const visitadas = $derived(data.predio.unidades.filter(unidadeVisitada).length);
  const entregues = $derived(data.predio.unidades.filter((u) => u.carta_entregue).length);
  const total = $derived(data.predio.unidades.length);

  function voltar() {
    if (typeof history !== 'undefined' && history.length > 1) history.back();
    else location.href = '/publicador/predios';
  }

  // Edit sheet
  let sheetEditar = $state(false);
  let salvandoEditar = $state(false);
  let irmaoMora = $state(data.predio.irmao_mora);

  async function compartilharWhatsApp() {
    try {
      const res = await fetch('?/gerarLink', { method: 'POST', body: new FormData() });
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success' && result.data?.token) {
        const url = `${window.location.origin}/cartas/${result.data.token}`;
        const nome = data.predio.nome || `${data.predio.logradouro}, ${data.predio.numero}`;
        const msg = `Trabalho de cartas — *${nome}*\n\n${url}`;
        window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
        return;
      }
      throw new Error(result.data?.erro || 'sem token');
    } catch { toast.error('Não consegui gerar o link'); }
  }
</script>

<svelte:head>
  <title>{data.predio.nome || data.predio.logradouro}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pb-24">
  <!-- Header -->
  <div class="bg-primary-600 text-white px-4 py-4">
    <div class="flex items-center gap-2 mb-2">
      <button type="button" onclick={voltar} class="text-xs opacity-90 hover:opacity-100">← Voltar</button>
      <div class="ml-auto flex gap-1">
        <button type="button" onclick={() => (sheetEditar = true)} title="Editar prédio"
          class="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center">✏</button>
        <button type="button" onclick={compartilharWhatsApp} title="Compartilhar cartas"
          class="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center">📤</button>
      </div>
    </div>
    <h1 class="text-xl font-bold">{data.predio.nome || `${data.predio.logradouro}, ${data.predio.numero}`}</h1>
    <div class="text-sm opacity-90 mt-0.5">{data.predio.logradouro}, {data.predio.numero}</div>

    <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
      {#if data.predio.tipo_entrada === 'porteiro'}<span class="bg-white/20 px-2 py-1 rounded">🚪 Porteiro</span>{/if}
      {#if data.predio.tipo_entrada === 'eletronica'}<span class="bg-white/20 px-2 py-1 rounded">🔌 Eletrônica</span>{/if}
      {#if data.predio.acesso_caixas}<span class="bg-white/20 px-2 py-1 rounded">📬 Caixas</span>{/if}
      {#if data.predio.acesso_interfones}<span class="bg-white/20 px-2 py-1 rounded">📞 Interfones</span>{/if}
      {#if data.predio.irmao_mora}<span class="bg-white/20 px-2 py-1 rounded">👤 Irmão{data.predio.nome_irmao ? `: ${data.predio.nome_irmao}` : ''}</span>{/if}
    </div>

    <!-- Progresso duplo (visitados + entregues) -->
    <div class="mt-4 grid grid-cols-2 gap-3">
      <div>
        <div class="flex justify-between text-xs mb-0.5"><span>🚪 Visitados</span><span class="font-bold">{visitadas}/{total}</span></div>
        <div class="h-1.5 rounded-full bg-white/20 overflow-hidden">
          <div class="h-full bg-white" style:width="{total === 0 ? 0 : (visitadas / total) * 100}%"></div>
        </div>
      </div>
      <div>
        <div class="flex justify-between text-xs mb-0.5"><span>✉ Cartas</span><span class="font-bold">{entregues}/{total}</span></div>
        <div class="h-1.5 rounded-full bg-white/20 overflow-hidden">
          <div class="h-full bg-white" style:width="{total === 0 ? 0 : (entregues / total) * 100}%"></div>
        </div>
      </div>
    </div>

    {#if data.predio.notas}<p class="mt-3 text-sm bg-white/10 rounded p-2 italic">{data.predio.notas}</p>{/if}
  </div>

  <!-- Toggle modo -->
  <div class="sticky top-0 z-10 bg-slate-50 px-4 pt-3 pb-2 border-b border-slate-200">
    <div class="flex gap-1 bg-white border border-slate-200 rounded-lg p-0.5 max-w-md mx-auto">
      <button
        type="button"
        onclick={() => trocarModo('casa')}
        class="flex-1 px-3 py-2 text-sm rounded transition-colors"
        class:bg-primary-600={modo === 'casa'}
        class:text-white={modo === 'casa'}
        class:font-medium={modo === 'casa'}
        class:text-slate-600={modo !== 'casa'}
      >🚪 Casa em casa</button>
      <button
        type="button"
        onclick={() => trocarModo('cartas')}
        class="flex-1 px-3 py-2 text-sm rounded transition-colors"
        class:bg-primary-600={modo === 'cartas'}
        class:text-white={modo === 'cartas'}
        class:font-medium={modo === 'cartas'}
        class:text-slate-600={modo !== 'cartas'}
      >✉ Cartas</button>
    </div>
  </div>

  <!-- Lista -->
  <div class="p-4 space-y-1">
    {#each data.predio.unidades as u (u.id)}
      {@const st = u.nao_escrever ? 'naoescrever' : u.desocupado ? 'desocupado' : u.carta_entregue ? 'entregue' : 'pendente'}
      <div
        class="rounded-lg border p-3 transition-colors"
        class:bg-purple-50={modo === 'cartas' && st === 'entregue'}
        class:border-purple-200={modo === 'cartas' && st === 'entregue'}
        class:bg-slate-100={modo === 'cartas' && st === 'desocupado'}
        class:border-slate-300={modo === 'cartas' && st === 'desocupado'}
        class:bg-red-50={modo === 'cartas' && st === 'naoescrever'}
        class:border-red-200={modo === 'cartas' && st === 'naoescrever'}
        class:bg-white={modo !== 'cartas' || st === 'pendente'}
        class:border-slate-200={modo !== 'cartas' || st === 'pendente'}
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="font-mono font-semibold text-sm">{u.complemento || `Apto ${u.id}`}</div>
            {#if modo === 'cartas' && u.carta_entregue}<div class="text-xs text-purple-700">✉ {u.carta_entregue}</div>{/if}
            {#if modo === 'casa' && u.ultimo_tipo && u.ultimo_tipo !== 'desfeito' && u.ultimo_tipo !== 'carta_undo'}
              <span class="inline-block text-xs rounded px-2 py-0.5 mt-1 {cores[u.ultimo_tipo] ?? 'bg-slate-100'}">{u.ultimo_tipo}</span>
            {/if}
          </div>

          {#if modo === 'cartas'}
            <div class="flex gap-1">
              {#each [
                { c: 'carta_entregue', e: '✉', ativo: !!u.carta_entregue, cls: 'bg-purple-600' },
                { c: 'desocupado', e: '🏚', ativo: u.desocupado, cls: 'bg-slate-600' },
                { c: 'nao_escrever', e: '🚫', ativo: u.nao_escrever, cls: 'bg-red-600' }
              ] as opt}
                <form method="POST" action="?/toggle"
                  use:enhance={() => async ({ result, update }) => {
                    await update();
                    if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
                    await invalidateAll();
                  }}
                >
                  <input type="hidden" name="unidade_id" value={u.id} />
                  <input type="hidden" name="campo" value={opt.c} />
                  <button class="px-3 py-2 rounded text-base border {opt.ativo ? opt.cls + ' text-white border-transparent' : 'border-slate-300 bg-white hover:bg-slate-50'}">{opt.e}</button>
                </form>
              {/each}
            </div>
          {:else}
            <div class="flex gap-1">
              {#each [
                { t: 'conversou', e: '💬', cls: 'bg-green-600' },
                { t: 'semConversa', e: '🚪', cls: 'bg-amber-600' },
                { t: 'naoAtendeu', e: '👋', cls: 'bg-slate-600' },
                { t: 'carta', e: '✉', cls: 'bg-purple-600' }
              ] as opt}
                {@const ativo = u.ultimo_tipo === opt.t}
                <form method="POST" action="?/marcarDesfecho"
                  use:enhance={() => async ({ result, update }) => {
                    await update();
                    if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
                    await invalidateAll();
                  }}
                >
                  <input type="hidden" name="unidade_id" value={u.id} />
                  <input type="hidden" name="tipo" value={ativo ? '' : opt.t} />
                  <button class="px-2.5 py-2 rounded text-base border {ativo ? opt.cls + ' text-white border-transparent' : 'border-slate-300 bg-white hover:bg-slate-50'}">{opt.e}</button>
                </form>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<!-- Sheet editar prédio -->
<BottomSheet bind:open={sheetEditar} title="Editar prédio">
  <form
    method="POST"
    action="?/atualizarLocal"
    use:enhance={() => { salvandoEditar = true; return async ({ result, update }) => {
      await update(); salvandoEditar = false;
      if (result.type === 'success') { toast.success('Salvo'); sheetEditar = false; await invalidateAll(); }
      else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
    }; }}
    class="space-y-3"
  >
    <div class="text-xs text-slate-500">{data.predio.logradouro}, {data.predio.numero} · {data.predio.unidades.length} apto(s)</div>

    <div>
      <label for="nome" class="block text-sm font-medium mb-1">Nome do edifício</label>
      <input id="nome" name="nome" value={data.predio.nome ?? ''} placeholder="Ex: Edif. Solar" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div>
      <span class="block text-sm font-medium mb-2">Portaria</span>
      <div class="grid grid-cols-3 gap-2">
        {#each [{ v: 'porteiro', l: 'Porteiro', i: '👮' }, { v: 'eletronica', l: 'Eletrônica', i: '🔘' }, { v: 'sem', l: 'Sem', i: '🚪' }] as opt}
          <label class="cursor-pointer">
            <input type="radio" name="tipo_entrada" value={opt.v} checked={data.predio.tipo_entrada === opt.v} class="peer sr-only" />
            <div class="text-center text-sm px-2 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">
              <div class="text-lg">{opt.i}</div>
              <div class="text-xs">{opt.l}</div>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
        <input type="checkbox" name="acesso_caixas" checked={data.predio.acesso_caixas} class="w-4 h-4 rounded" />
        <span class="text-sm">📬 Caixas</span>
      </label>
      <label class="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
        <input type="checkbox" name="acesso_interfones" checked={data.predio.acesso_interfones} class="w-4 h-4 rounded" />
        <span class="text-sm">📞 Interfones</span>
      </label>
    </div>

    <div class="rounded-lg bg-amber-50 border border-amber-200 p-3">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" name="irmao_mora" bind:checked={irmaoMora} class="w-4 h-4 rounded" />
        <span class="text-sm font-medium">👤 Irmão mora aqui</span>
      </label>
      {#if irmaoMora}
        <input name="nome_irmao" value={data.predio.nome_irmao ?? ''} placeholder="Nome do irmão" class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {/if}
    </div>

    <div>
      <label for="notas" class="block text-sm font-medium mb-1">📝 Notas</label>
      <textarea id="notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{data.predio.notas ?? ''}</textarea>
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetEditar = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvandoEditar} class="flex-1">Salvar</Button>
    </div>
  </form>
</BottomSheet>

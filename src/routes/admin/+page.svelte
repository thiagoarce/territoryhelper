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
      participantesPorDesignacao: Record<number, string[]>;
      tces: { id: string; nome: string; tipo: string; status: string; prazo: string | null; publicador_id: string | null; publicador_nome: string | null }[];
      arranjosQuadras: { id: number; nome: string | null; modalidade_nome: string; modalidade_cor: string; data: string | null; dia_semana: number | null; recorrente: boolean; quadras_ids: string[] | null; hora_inicio: string | null }[];
    };
    form: any;
  } = $props();

  // Estado
  let colorirPor = $state<'status' | 'territorio' | 'densidade'>('status');
  let basemap = $state<'positron' | 'liberty' | 'bright'>('bright');
  let mostrarRotulos = $state(true);
  let selecionadas = $state<Set<string>>(new Set());
  let busca = $state('');
  let salvando = $state(false);

  // Sheets
  let sheetDesignacoes = $state(false);
  let sheetDesignar = $state(false);
  let sheetEditarDesignacao = $state(false);
  let editandoDesignacao = $state<DesignacaoEnriquecida | null>(null);
  let editPublicadoresSel = $state<Set<string>>(new Set());
  let editQuadrasSel = $state<Set<string>>(new Set());

  // Estado do form de designar
  let tipoDesignacao = $state<'pessoal' | 'arranjo'>('pessoal');
  let publicadoresSel = $state<Set<string>>(new Set());

  // TCE designar
  let sheetAtribuirTce = $state(false);
  let tceAtribuir = $state<{ id: string; nome: string; publicador_id: string | null; prazo: string | null } | null>(null);

  // Adicionar quadras a um arranjo
  let sheetArranjo = $state(false);
  let modoAnexar = $state<'somar' | 'substituir'>('somar');
  let salvandoAnexar = $state(false);

  function abrirEditarDesignacao(d: DesignacaoEnriquecida) {
    editandoDesignacao = d;
    editQuadrasSel = new Set(d.quadras_ids);
    editPublicadoresSel = new Set(data.participantesPorDesignacao[d.id] ?? (d.publicador_id ? [d.publicador_id] : []));
    sheetDesignacoes = false;
    sheetEditarDesignacao = true;
  }

  function toggleEditQuadra(id: string) {
    if (editQuadrasSel.has(id)) editQuadrasSel.delete(id);
    else editQuadrasSel.add(id);
    editQuadrasSel = new Set(editQuadrasSel);
  }
  function toggleEditPub(id: string) {
    if (editPublicadoresSel.has(id)) editPublicadoresSel.delete(id);
    else editPublicadoresSel.add(id);
    editPublicadoresSel = new Set(editPublicadoresSel);
  }

  const dirigentes = $derived(data.publicadores.filter((p) => p.role === 'dirigente' || p.role === 'admin'));

  function onClickQuadra(q: QuadraGeo, multi: boolean) {
    if (!q.ativa) {
      toast.info(`Quadra ${q.id} está inativa — edita em Polígonos pra reativar`);
      return;
    }
    if (selecionadas.has(q.id)) selecionadas.delete(q.id);
    else selecionadas.add(q.id);
    selecionadas = new Set(selecionadas);
  }

  function limparSelecao() { selecionadas = new Set(); }

  function togglePub(id: string) {
    if (publicadoresSel.has(id)) publicadoresSel.delete(id);
    else publicadoresSel.add(id);
    publicadoresSel = new Set(publicadoresSel);
  }

  const stats = $derived.by(() => {
    const total = data.quadras.length;
    const concluidas = data.quadras.filter((q) => q.data_conclusao != null).length;
    const inativas = data.quadras.filter((q) => !q.ativa).length;
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
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex flex-col gap-2">
    <!-- Linha 1: chips com IDs (scroll horizontal se muitas) -->
    <div class="flex items-center gap-1 overflow-x-auto pb-1">
      <span class="text-xs font-medium text-slate-500 whitespace-nowrap mr-1">{selecionadas.size}:</span>
      {#each [...selecionadas] as qid}
        <span class="text-[10px] font-mono bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded whitespace-nowrap">{qid}</span>
      {/each}
    </div>
    <!-- Linha 2: ações -->
    <div class="flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium">
      <strong>{selecionadas.size}</strong> quadra(s) selecionada(s)
    </div>
    <div class="flex gap-2 ml-auto flex-wrap justify-end">
      <Button variant="primary" size="sm" onclick={() => (sheetDesignar = true)}>📤 Designar</Button>
      <Button variant="secondary" size="sm" onclick={() => (sheetArranjo = true)}>📅 Anexar a arranjo</Button>
      <Button variant="secondary" size="sm" onclick={limparSelecao}>Limpar</Button>
    </div>
    </div>
  </div>
{/if}

<!-- Sheet: lista designações ativas (com editar/encerrar) -->
<BottomSheet bind:open={sheetDesignacoes} title="Designações ativas">
  {#if data.designacoesAbertas.length === 0}
    <div class="text-center py-10 text-slate-400">Nenhuma designação aberta.</div>
  {:else}
    <ul class="space-y-2">
      {#each data.designacoesAbertas as d}
        <li class="rounded-lg border border-slate-200 p-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="font-medium flex items-center gap-2">
                {d.publicador_nome ?? '(sem publicador)'}
                {#if (d as any).tipo === 'arranjo'}<span class="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">arranjo</span>{/if}
              </div>
              <div class="text-xs text-slate-500 mt-0.5">
                {d.quadras_ids.length} quadra(s) · {d.quadras_ids.join(', ')}
              </div>
              {#if d.prazo}<div class="text-xs text-amber-700 mt-1">prazo: {d.prazo}</div>{/if}
              {#if d.notas}<div class="text-xs text-slate-500 italic mt-1">{d.notas}</div>{/if}
            </div>
            <div class="flex flex-col gap-1">
              <button onclick={() => abrirEditarDesignacao(d)} class="text-[11px] text-primary-700 hover:underline">Editar</button>
              <form
                method="POST"
                action="?/encerrarDesignacao"
                use:enhance={() => async ({ result, update }) => {
                  await update();
                  if (result.type === 'success') {
                    toast.success('Encerrada');
                    await invalidateAll();
                  }
                }}
                onsubmit={(e) => { if (!confirm(`Encerrar designação de ${d.publicador_nome ?? '?'}?`)) e.preventDefault(); }}
              >
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" class="text-[11px] text-red-700 hover:underline">Encerrar</button>
              </form>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <!-- TCEs: designar aqui também (designações num lugar só) -->
  {#if data.tces.length > 0}
    <div class="mt-4 pt-3 border-t border-slate-100">
      <div class="text-xs font-semibold text-slate-500 uppercase mb-2">🏪 TCEs</div>
      <ul class="space-y-2">
        {#each data.tces as t}
          <li class="rounded-lg border border-purple-200 p-3 flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="font-medium truncate">{t.nome}</div>
              <div class="text-xs text-slate-500">
                {#if t.publicador_nome}👤 {t.publicador_nome}{:else}sem designação{/if}
                {#if t.prazo}· prazo {t.prazo}{/if}
              </div>
            </div>
            <button onclick={() => { tceAtribuir = { id: t.id, nome: t.nome, publicador_id: t.publicador_id, prazo: t.prazo }; sheetDesignacoes = false; sheetAtribuirTce = true; }} class="text-[11px] text-primary-700 hover:underline whitespace-nowrap">Designar</button>
          </li>
        {/each}
      </ul>
      <p class="text-[11px] text-slate-400 mt-2">TCEs são criados no editor de Polígonos.</p>
    </div>
  {/if}
</BottomSheet>

<!-- Sheet: designar TCE -->
<BottomSheet bind:open={sheetAtribuirTce} title={tceAtribuir ? `Designar — ${tceAtribuir.nome}` : ''}>
  {#if tceAtribuir}
    <form
      method="POST"
      action="?/atribuirTce"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            toast.success((result.data as any)?.msg || 'OK');
            sheetAtribuirTce = false;
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-3"
    >
      <input type="hidden" name="id" value={tceAtribuir.id} />
      <div>
        <label for="tce_pub" class="block text-sm font-medium mb-1">Publicador / Dirigente</label>
        <select id="tce_pub" name="publicador_id" value={tceAtribuir.publicador_id ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">— sem designação —</option>
          {#each data.publicadores as p}
            <option value={p.id}>{p.nome} ({p.role})</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="tce_prazo" class="block text-sm font-medium mb-1">Prazo (opcional)</label>
        <input id="tce_prazo" name="prazo" type="date" value={tceAtribuir.prazo ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (sheetAtribuirTce = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvando} class="flex-1">Designar</Button>
      </div>
    </form>
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
          publicadoresSel = new Set();
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    {#each [...selecionadas] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
    <input type="hidden" name="tipo" value={tipoDesignacao} />

    <div class="rounded-lg bg-slate-50 p-3 text-sm">
      <div class="font-medium mb-1">{selecionadas.size} quadra(s)</div>
      <div class="text-xs text-slate-500 font-mono">{[...selecionadas].join(', ')}</div>
    </div>

    <!-- Tipo: pessoal (publicador trabalha) vs arranjo (dirigente coordena) -->
    <div>
      <span class="block text-sm font-medium mb-2">Tipo</span>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" onclick={() => (tipoDesignacao = 'pessoal')}
          class="text-left px-3 py-2 border rounded-lg transition-colors"
          class:bg-primary-50={tipoDesignacao === 'pessoal'}
          class:border-primary-500={tipoDesignacao === 'pessoal'}
          class:border-slate-300={tipoDesignacao !== 'pessoal'}
        >
          <div class="font-medium text-sm">📍 Pessoal</div>
          <div class="text-xs text-slate-500">Publicador trabalha</div>
        </button>
        <button type="button" onclick={() => (tipoDesignacao = 'arranjo')}
          class="text-left px-3 py-2 border rounded-lg transition-colors"
          class:bg-primary-50={tipoDesignacao === 'arranjo'}
          class:border-primary-500={tipoDesignacao === 'arranjo'}
          class:border-slate-300={tipoDesignacao !== 'arranjo'}
        >
          <div class="font-medium text-sm">👥 Arranjo</div>
          <div class="text-xs text-slate-500">Dirigente coordena</div>
        </button>
      </div>
    </div>

    {#if tipoDesignacao === 'arranjo'}
      <div>
        <label for="dirigente_id" class="block text-sm font-medium mb-1">Dirigente responsável</label>
        <select id="dirigente_id" name="dirigente_id" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">— escolha —</option>
          {#each dirigentes as p}
            <option value={p.id}>{p.nome} ({p.role})</option>
          {/each}
        </select>
        <p class="text-xs text-slate-500 mt-1">Ele convida os publicadores depois.</p>
      </div>
    {:else}
      <div>
        <span class="block text-sm font-medium mb-1">Publicadores (≥1, primeiro é líder)</span>
        <div class="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {#each data.publicadores as p}
            <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={publicadoresSel.has(p.id)} onchange={() => togglePub(p.id)} class="w-4 h-4 rounded" />
              <span class="flex-1">{p.nome}</span>
              <span class="text-xs text-slate-400">{p.role}</span>
            </label>
          {/each}
        </div>
        {#each [...publicadoresSel] as pid}<input type="hidden" name="publicador_ids" value={pid} />{/each}
        <p class="text-xs text-slate-500 mt-1">{publicadoresSel.size} selecionado(s)</p>
      </div>
    {/if}

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

<!-- Sheet: Editar designação existente -->
<BottomSheet bind:open={sheetEditarDesignacao} title={editandoDesignacao ? `Editar — ${editandoDesignacao.publicador_nome ?? 'designação'}` : ''}>
  {#if editandoDesignacao}
    <form
      method="POST"
      action="?/editarDesignacao"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            toast.success('Atualizada');
            sheetEditarDesignacao = false;
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-3"
    >
      <input type="hidden" name="id" value={editandoDesignacao.id} />

      <div>
        <span class="block text-sm font-medium mb-1">Quadras ({editQuadrasSel.size})</span>
        <div class="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 flex flex-wrap gap-1">
          {#each data.quadras as q}
            <button type="button"
              onclick={() => toggleEditQuadra(q.id)}
              class="text-xs font-mono px-2 py-0.5 rounded border"
              class:bg-primary-100={editQuadrasSel.has(q.id)}
              class:border-primary-500={editQuadrasSel.has(q.id)}
              class:text-primary-700={editQuadrasSel.has(q.id)}
              class:border-slate-200={!editQuadrasSel.has(q.id)}
              class:text-slate-500={!editQuadrasSel.has(q.id)}
            >{q.id}</button>
          {/each}
        </div>
        {#each [...editQuadrasSel] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
      </div>

      <div>
        <span class="block text-sm font-medium mb-1">Publicadores</span>
        <div class="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {#each data.publicadores as p}
            <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={editPublicadoresSel.has(p.id)} onchange={() => toggleEditPub(p.id)} class="w-4 h-4 rounded" />
              <span class="flex-1">{p.nome}</span>
              <span class="text-xs text-slate-400">{p.role}</span>
            </label>
          {/each}
        </div>
        {#each [...editPublicadoresSel] as pid}<input type="hidden" name="publicador_ids" value={pid} />{/each}
        <p class="text-xs text-slate-500 mt-1">{editPublicadoresSel.size} selecionado(s) · primeiro vira líder</p>
      </div>

      <div>
        <label for="edit_prazo" class="block text-sm font-medium mb-1">Prazo</label>
        <input id="edit_prazo" name="prazo" type="date" value={editandoDesignacao.prazo ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label for="edit_notas" class="block text-sm font-medium mb-1">Notas</label>
        <textarea id="edit_notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{editandoDesignacao.notas ?? ''}</textarea>
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (sheetEditarDesignacao = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvando} class="flex-1">Salvar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

<!-- Sheet: anexar quadras selecionadas a um arranjo (admin → arranjo direto) -->
<BottomSheet bind:open={sheetArranjo} title="Anexar quadras a um arranjo">
  {#if data.arranjosQuadras.length === 0}
    <div class="text-center py-8 text-slate-500">
      <div class="text-4xl mb-2 opacity-50">📅</div>
      <div class="font-medium">Nenhum arranjo de quadras</div>
      <div class="text-sm">Cria um arranjo do tipo "quadras" em <a href="/admin/arranjos" class="text-primary-700 hover:underline">/admin/arranjos</a>.</div>
    </div>
  {:else}
    <form
      method="POST"
      action="?/adicionarQuadrasAoArranjo"
      use:enhance={() => {
        salvandoAnexar = true;
        return async ({ result, update }) => {
          await update();
          salvandoAnexar = false;
          if (result.type === 'success') {
            toast.success(String((result.data as any)?.msg || 'Anexado'));
            sheetArranjo = false;
            selecionadas = new Set();
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-3"
    >
      {#each [...selecionadas] as qid}
        <input type="hidden" name="quadras_ids" value={qid} />
      {/each}

      <div class="text-sm bg-slate-50 rounded p-2">
        <strong>{selecionadas.size}</strong> quadra(s) selecionada(s)
      </div>

      <div>
        <span class="block text-sm font-medium mb-1">Modo</span>
        <div class="flex gap-1 bg-slate-100 rounded-lg p-1 text-xs">
          <button type="button" onclick={() => (modoAnexar = 'somar')}
            class="flex-1 px-2 py-1 rounded font-medium"
            class:bg-white={modoAnexar === 'somar'}
            class:text-slate-900={modoAnexar === 'somar'}
            class:text-slate-500={modoAnexar !== 'somar'}>Somar às existentes</button>
          <button type="button" onclick={() => (modoAnexar = 'substituir')}
            class="flex-1 px-2 py-1 rounded font-medium"
            class:bg-white={modoAnexar === 'substituir'}
            class:text-slate-900={modoAnexar === 'substituir'}
            class:text-slate-500={modoAnexar !== 'substituir'}>Substituir tudo</button>
        </div>
        <input type="hidden" name="substituir" value={modoAnexar === 'substituir' ? 'true' : 'false'} />
      </div>

      <div>
        <span class="block text-sm font-medium mb-1">Arranjo</span>
        <div class="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {#each data.arranjosQuadras as a}
            <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="radio" name="arranjo_id" value={a.id} required class="w-4 h-4" />
              <span class="w-2 h-8 rounded shrink-0" style="background:{a.modalidade_cor}"></span>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{a.nome || a.modalidade_nome}</div>
                <div class="text-xs text-slate-500">
                  {a.data ? new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) : '—'}
                  {a.hora_inicio ? ` · ${a.hora_inicio.substring(0, 5)}` : ''}
                  · {(a.quadras_ids ?? []).length} já vinculada(s)
                </div>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (sheetArranjo = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvandoAnexar} class="flex-1">Anexar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

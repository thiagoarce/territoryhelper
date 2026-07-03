<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Card from '$lib/ui/Card.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { DesignacaoHub, TceHub, ArranjoHub } from './$types';

  let { data }: {
    data: {
      designacoes: DesignacaoHub[];
      tces: TceHub[];
      arranjos: ArranjoHub[];
      publicadores: { id: string; nome: string; role: string }[];
    };
  } = $props();

  type FiltroTipo = 'todas' | 'pessoal' | 'cartas' | 'tce' | 'arranjo';
  type FiltroStatus = 'abertas' | 'concluidas' | 'canceladas' | 'todas';
  let filtroTipo = $state<FiltroTipo>('todas');
  let filtroStatus = $state<FiltroStatus>('abertas');
  let busca = $state('');

  const TIPO_META: Record<string, { label: string; icone: 'target' | 'mail'; cls: string }> = {
    pessoal: { label: 'Pessoal', icone: 'target' as const, cls: 'bg-blue-100 text-blue-700' },
    cartas: { label: 'Cartas', icone: 'mail' as const, cls: 'bg-purple-100 text-purple-700' }
  };

  function statusOk(s: string): boolean {
    if (filtroStatus === 'todas') return true;
    if (filtroStatus === 'abertas') return s === 'aberta' || s === 'aberto';
    if (filtroStatus === 'concluidas') return s === 'concluida' || s === 'concluido';
    return s === 'cancelada' || s === 'cancelado';
  }

  const designacoesFiltradas = $derived(
    data.designacoes.filter((d) => {
      if (filtroTipo === 'tce' || filtroTipo === 'arranjo') return false;
      if (filtroTipo !== 'todas' && (d.tipo ?? 'pessoal') !== filtroTipo) return false;
      if (!statusOk(d.status)) return false;
      if (busca.trim()) {
        const b = busca.toLowerCase();
        const alvo = `${d.publicador_nome ?? ''} ${d.quadras_ids.join(' ')} ${d.notas ?? ''} ${d.predios.map((p) => p.nome ?? p.logradouro).join(' ')}`.toLowerCase();
        if (!alvo.includes(b)) return false;
      }
      return true;
    })
  );

  const tcesFiltrados = $derived(
    (filtroTipo === 'todas' || filtroTipo === 'tce')
      ? data.tces.filter((t) => {
          if (!statusOk(t.status)) return false;
          if (busca.trim()) {
            const b = busca.toLowerCase();
            if (!`${t.nome} ${t.publicador_nome ?? ''}`.toLowerCase().includes(b)) return false;
          }
          return true;
        })
      : []
  );

  // Contadores do header (abertas por tipo)
  const stats = $derived.by(() => {
    const abertas = data.designacoes.filter((d) => d.status === 'aberta');
    return {
      pessoal: abertas.filter((d) => (d.tipo ?? 'pessoal') === 'pessoal').length,
      cartas: abertas.filter((d) => d.tipo === 'cartas').length,
      tce: data.tces.filter((t) => t.status === 'aberto').length
    };
  });

  // Sheet editar
  let sheetEditar = $state(false);
  let editando: DesignacaoHub | null = $state(null);
  let salvandoEditar = $state(false);
  function abrirEditar(d: DesignacaoHub) {
    editando = d;
    sheetEditar = true;
  }

  async function acaoRapida(action: string, id: number | string, extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.append('id', String(id));
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const res = await fetch(`?/${action}`, { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success') {
      toast.success(String(parsed.data?.msg || 'Feito'));
      await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou'));
    }
  }

  async function apagarDesignacao(d: DesignacaoHub) {
    if (!confirm(`Apagar a designação de ${d.publicador_nome ?? '(sem publicador)'}? Libera as quadras/prédios.`)) return;
    await acaoRapida('apagar', d.id);
    sheetEditar = false;
  }

  async function abrirLinkPublico(tipo: 'designacao' | 'arranjo', id: number) {
    const fd = new FormData();
    fd.append(tipo === 'arranjo' ? 'arranjo_id' : 'designacao_id', String(id));
    const res = await fetch('?/gerarLinkTerritorio', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success' && parsed.data?.token) {
      window.open('/t/' + parsed.data.token, '_blank', 'noopener');
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou gerar link'));
    }
  }

  const arranjosFiltrados = $derived(
    (filtroTipo === 'todas' || filtroTipo === 'arranjo')
      ? data.arranjos.filter((a) => {
          if (busca.trim()) {
            const b = busca.toLowerCase();
            const alvo = `${a.nome ?? ''} ${a.dirigente_nome ?? ''} ${a.quadras_ids.join(' ')}`.toLowerCase();
            if (!alvo.includes(b)) return false;
          }
          return true;
        })
      : []
  );

  function fmtData(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso.substring(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
  }
</script>

<div class="p-4 space-y-3 max-w-5xl mx-auto">
  <div>
    <h1 class="text-2xl font-bold">Designações</h1>
    <p class="text-sm text-slate-500">
      Gestão central — <Icon nome="target" size={14} /> {stats.pessoal} pessoais · <Icon nome="mail" size={14} /> {stats.cartas} cartas · <Icon nome="store" size={14} /> {stats.tce} TCEs · <Icon nome="tent" size={14} /> {data.arranjos.length} arranjo(s)
    </p>
  </div>

  <input
    type="search"
    bind:value={busca}
    placeholder="Buscar por publicador, quadra, prédio..."
    class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
  />

  <!-- Filtro tipo -->
  <div class="flex gap-1 rounded-lg bg-slate-100 p-0.5 overflow-x-auto">
    {#each [['todas', 'Todas'], ['pessoal', 'Pessoal'], ['cartas', 'Cartas'], ['tce', 'TCE'], ['arranjo', 'Arranjos']] as [k, l]}
      <button
        onclick={() => (filtroTipo = k as FiltroTipo)}
        class="flex-1 px-2 py-1.5 text-xs rounded whitespace-nowrap transition-colors"
        class:bg-white={filtroTipo === k}
        class:font-medium={filtroTipo === k}
        class:shadow-sm={filtroTipo === k}
        class:text-slate-500={filtroTipo !== k}
      >{l}</button>
    {/each}
  </div>

  <!-- Filtro status -->
  <div class="flex gap-1">
    {#each [['abertas', 'Abertas'], ['concluidas', 'Concluídas'], ['canceladas', 'Canceladas'], ['todas', 'Todas']] as [k, l]}
      <button
        onclick={() => (filtroStatus = k as FiltroStatus)}
        class="px-3 py-1 text-xs rounded border"
        class:bg-primary-100={filtroStatus === k}
        class:border-primary-500={filtroStatus === k}
        class:text-primary-700={filtroStatus === k}
        class:border-slate-200={filtroStatus !== k}
        class:text-slate-600={filtroStatus !== k}
      >{l}</button>
    {/each}
  </div>

  <!-- Lista de designações -->
  <div class="space-y-2">
    {#each designacoesFiltradas as d (d.id)}
      {@const meta = TIPO_META[d.tipo ?? 'pessoal'] ?? TIPO_META.pessoal}
      <Card padding="md">
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[10px] px-1.5 py-0.5 rounded font-medium {meta.cls}"><Icon nome={meta.icone} size={12} /> {meta.label}</span>
              <span class="font-semibold text-sm">{d.publicador_nome ?? '(sem publicador)'}</span>
              {#if d.status !== 'aberta'}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{d.status}</span>
              {/if}
            </div>
            <div class="text-xs text-slate-500 mt-1">
              Criada {fmtData(d.criada_em)}
              {#if d.prazo}· prazo <strong>{fmtData(d.prazo)}</strong>{/if}
            </div>
            {#if d.quadras_ids.length > 0}
              <div class="mt-1.5 flex flex-wrap gap-1">
                {#each d.quadras_ids as q}
                  <span class="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{q}</span>
                {/each}
              </div>
            {/if}
            {#if d.predios.length > 0}
              <div class="mt-1.5 flex flex-wrap gap-1">
                {#each d.predios as p}
                  <a href="/predio/{p.id}" class="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded hover:bg-purple-200 truncate max-w-[200px]">
                    <Icon nome="mail" size={14} /> {p.nome || `${p.logradouro}, ${p.numero}`}
                  </a>
                {/each}
              </div>
            {/if}
            {#if d.notas}<div class="mt-1 text-xs italic text-slate-500 truncate">{d.notas}</div>{/if}
          </div>
          <div class="flex flex-col gap-1 items-end shrink-0">
            {#if d.status === 'aberta'}
              <button type="button" onclick={() => acaoRapida('mudarStatus', d.id, { status: 'concluida' })}
                class="text-xs text-green-700 hover:underline"><Icon nome="check" size={14} /> Concluir</button>
            {:else}
              <button type="button" onclick={() => acaoRapida('mudarStatus', d.id, { status: 'aberta' })}
                class="text-xs text-primary-700 hover:underline"><Icon nome="undo" size={14} /> Reabrir</button>
            {/if}
            <button type="button" onclick={() => abrirEditar(d)} class="text-xs text-slate-600 hover:underline"><Icon nome="pencil" size={14} /> Editar</button>
            <button type="button" onclick={() => abrirLinkPublico('designacao', d.id)} class="text-xs text-slate-600 hover:underline" title="Link público com mapa (WhatsApp)"><Icon nome="share" size={14} /> Link</button>
          </div>
        </div>
      </Card>
    {/each}

    <!-- Arranjos ativos (o território deles é designação herdada pelo dirigente) -->
    {#each arranjosFiltrados as a (a.id)}
      <Card padding="md">
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700"><Icon nome="tent" size={14} /> Arranjo</span>
              <span class="font-semibold text-sm">{a.nome ?? 'Arranjo'}</span>
              <span class="text-xs text-slate-500"><Icon nome="user" size={14} /> {a.dirigente_nome ?? '(sem dirigente)'}</span>
            </div>
            <div class="text-xs text-slate-500 mt-1">
              {#if a.data}{fmtData(a.data)}{/if}
              {#if a.hora_inicio}· {a.hora_inicio.substring(0, 5)}{/if}
              {#if a.local_endereco}· <Icon nome="map-pin" size={14} /> {a.local_endereco}{/if}
            </div>
            {#if a.quadras_ids.length > 0}
              <div class="mt-1.5 flex flex-wrap gap-1">
                {#each a.quadras_ids as q}
                  <span class="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{q}</span>
                {/each}
              </div>
            {/if}
            <div class="mt-1 flex gap-2 text-xs text-slate-500">
              {#if a.cartas_locais_ids.length > 0}<span><Icon nome="mail" size={14} /> {a.cartas_locais_ids.length} prédio(s)</span>{/if}
              {#if a.tce_id}<span><Icon nome="store" size={14} /> TCE {a.tce_id}</span>{/if}
            </div>
          </div>
          <div class="flex flex-col gap-1 items-end shrink-0">
            <a href="/admin/arranjos" class="text-xs text-slate-600 hover:underline"><Icon nome="pencil" size={14} /> Editar</a>
            <button type="button" onclick={() => abrirLinkPublico('arranjo', a.id)}
              class="text-xs text-slate-600 hover:underline" title="Link público com mapa (WhatsApp)"><Icon nome="share" size={14} /> Link</button>
          </div>
        </div>
      </Card>
    {/each}

    <!-- TCEs -->
    {#each tcesFiltrados as t (t.id)}
      <Card padding="md">
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-orange-100 text-orange-700"><Icon nome="store" size={14} /> TCE</span>
              <span class="font-semibold text-sm">{t.nome}</span>
              <span class="text-xs text-slate-500">{t.publicador_nome ?? '(sem publicador)'}</span>
              {#if t.status !== 'aberto'}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{t.status}</span>
              {/if}
            </div>
            <div class="text-xs text-slate-500 mt-1">
              {#if t.prazo}prazo <strong>{fmtData(t.prazo)}</strong>{/if}
              {#if t.data_conclusao}· concluído {fmtData(t.data_conclusao)}{/if}
            </div>
          </div>
          <div class="flex flex-col gap-1 items-end shrink-0">
            {#if t.status === 'aberto'}
              <button type="button" onclick={() => acaoRapida('mudarStatusTce', t.id, { status: 'concluido' })}
                class="text-xs text-green-700 hover:underline"><Icon nome="check" size={14} /> Concluir</button>
              <button type="button" onclick={() => acaoRapida('mudarStatusTce', t.id, { status: 'cancelado' })}
                class="text-xs text-red-600 hover:underline"><Icon nome="x" size={14} /> Cancelar</button>
            {:else}
              <button type="button" onclick={() => acaoRapida('mudarStatusTce', t.id, { status: 'aberto' })}
                class="text-xs text-primary-700 hover:underline"><Icon nome="undo" size={14} /> Reabrir</button>
            {/if}
          </div>
        </div>
      </Card>
    {/each}

    {#if designacoesFiltradas.length === 0 && tcesFiltrados.length === 0 && arranjosFiltrados.length === 0}
      <div class="text-center py-10">
        <div class="text-5xl mb-3 opacity-60"><Icon nome="clipboard" size={40} class="mx-auto text-slate-300" /></div>
        <div class="text-slate-500">Nenhuma designação nesse filtro.</div>
        <p class="text-xs text-slate-400 mt-1">Designe quadras na Visão Geral ou cartas em Prédios. Saídas em grupo são arranjos (gestão em /admin/arranjos).</p>
      </div>
    {/if}
  </div>
</div>

<!-- Sheet editar designação -->
<BottomSheet bind:open={sheetEditar} title="Editar designação">
  {#if editando}
    <form
      method="POST"
      action="?/editar"
      use:enhance={() => { salvandoEditar = true; return async ({ result, update }) => {
        await update(); salvandoEditar = false;
        if (result.type === 'success') { toast.success('Salvo'); sheetEditar = false; await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      }; }}
      class="space-y-3"
    >
      <input type="hidden" name="id" value={editando.id} />

      <div class="text-xs text-slate-500">
        {(TIPO_META[editando.tipo ?? 'pessoal'] ?? TIPO_META.pessoal).label} ·
        {editando.quadras_ids.length > 0 ? `${editando.quadras_ids.length} quadra(s)` : ''}
        {editando.predios.length > 0 ? `${editando.predios.length} prédio(s)` : ''}
      </div>

      <div>
        <label for="pub-ed" class="block text-sm font-medium mb-1">Publicador</label>
        <select id="pub-ed" name="publicador_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editando.publicador_id ?? ''}>
          <option value="">— sem publicador —</option>
          {#each data.publicadores as p}<option value={p.id}>{p.nome}</option>{/each}
        </select>
      </div>

      <div>
        <label for="prazo-ed" class="block text-sm font-medium mb-1">Prazo</label>
        <input id="prazo-ed" name="prazo" type="date" value={editando.prazo ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label for="notas-ed" class="block text-sm font-medium mb-1">Notas</label>
        <textarea id="notas-ed" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{editando.notas ?? ''}</textarea>
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => apagarDesignacao(editando!)} class="text-red-600">Apagar</Button>
        {#if editando.status === 'aberta'}
          <Button variant="secondary" onclick={() => { acaoRapida('mudarStatus', editando!.id, { status: 'cancelada' }); sheetEditar = false; }}><Icon nome="x" size={14} /> Cancelar desig.</Button>
        {/if}
        <Button variant="primary" type="submit" loading={salvandoEditar} class="flex-1">Salvar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

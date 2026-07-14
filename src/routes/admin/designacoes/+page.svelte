<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Card from '$lib/ui/Card.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { DesignacaoHub, TceHub, ArranjoHub, ArranjoDestino } from './$types';

  let { data }: {
    data: {
      designacoes: DesignacaoHub[];
      tces: TceHub[];
      arranjos: ArranjoHub[];
      arranjosDestino: ArranjoDestino[];
      publicadores: { id: string; nome: string; role: string }[];
      participantesPorDesignacao: Record<number, string[]>;
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
        const alvo = `${nomesDesignacao(d)} ${d.quadras_ids.join(' ')} ${d.notas ?? ''} ${d.predios.map((p) => p.nome ?? p.logradouro).join(' ')}`.toLowerCase();
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
      tce: data.tces.filter((t) => t.status === 'aberto').length,
      // data.arranjos agora inclui inativos (concluídos/cancelados dos
      // últimos 6 meses) — conta só os abertos, igual aos vizinhos
      arranjos: data.arranjos.filter((a) => a.status === 'aberta').length
    };
  });

  // Sheet editar
  let sheetEditar = $state(false);
  let editando: DesignacaoHub | null = $state(null);
  let salvandoEditar = $state(false);
  let editPublicadoresSel = $state<Set<string>>(new Set());

  function toggleEditPub(id: string) {
    if (editPublicadoresSel.has(id)) editPublicadoresSel.delete(id);
    else editPublicadoresSel.add(id);
    editPublicadoresSel = new Set(editPublicadoresSel);
  }

  // Sheet realocar restante (quando o arranjo não terminou tudo)
  let sheetRealocar = $state(false);
  let realocando: ArranjoHub | null = $state(null);
  let quadrasParaRealocar = $state<string[]>([]);
  let destinoRealocar = $state('');
  let salvandoRealocar = $state(false);

  function abrirRealocar(a: ArranjoHub) {
    realocando = a;
    quadrasParaRealocar = [];
    destinoRealocar = '';
    sheetRealocar = true;
  }

  function toggleQuadraRealocar(q: string) {
    quadrasParaRealocar = quadrasParaRealocar.includes(q)
      ? quadrasParaRealocar.filter((x) => x !== q)
      : [...quadrasParaRealocar, q];
  }

  const destinosDisponiveis = $derived(
    realocando ? data.arranjosDestino.filter((a) => a.id !== realocando!.id) : []
  );

  async function realocarQuadras() {
    if (!realocando || quadrasParaRealocar.length === 0 || !destinoRealocar) return;
    salvandoRealocar = true;
    const fd = new FormData();
    fd.append('origem_id', String(realocando.id));
    fd.append('destino_id', destinoRealocar);
    for (const q of quadrasParaRealocar) fd.append('quadras_ids', q);
    const res = await fetch('?/realocarQuadras', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    salvandoRealocar = false;
    if (parsed.type === 'success') {
      toast.success(String(parsed.data?.msg || 'Realocado'));
      sheetRealocar = false;
      await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou'));
    }
  }
  const nomePorId = $derived(new Map(data.publicadores.map((p) => [p.id, p.nome])));

  function nomesDesignacao(d: DesignacaoHub): string {
    const ids = data.participantesPorDesignacao[d.id];
    if (!ids || ids.length === 0) return d.publicador_nome ?? '(sem publicador)';
    return ids.map((id) => nomePorId.get(id) ?? '?').join(' + ');
  }

  function abrirEditar(d: DesignacaoHub) {
    editando = d;
    editPublicadoresSel = new Set(
      data.participantesPorDesignacao[d.id] ?? (d.publicador_id ? [d.publicador_id] : [])
    );
    sheetEditar = true;
  }

  let acaoEmCurso = $state<string | null>(null);
  function isBusy(key: string): boolean {
    return acaoEmCurso === key;
  }

  async function acaoRapida(action: string, id: number | string, extra: Record<string, string> = {}) {
    const key = `${action}:${id}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('id', String(id));
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const res = await fetch(`?/${action}`, { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success') {
      toast.success(String(parsed.data?.msg || 'Feito'));
      await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou'));
    }
  }

  async function apagarDesignacao(d: DesignacaoHub) {
    if (!confirm(`Excluir a designação de ${d.publicador_nome ?? '(sem publicador)'}? Libera as quadras/prédios.`)) return;
    await acaoRapida('apagar', d.id);
    sheetEditar = false;
  }

  async function limparTerritorioArranjo(a: ArranjoHub) {
    if (!confirm(`Liberar o território de "${a.nome ?? 'Arranjo'}"? Quadras/prédios/TCE saem do arranjo (e as partes repartidas somem) — o evento continua na agenda.`)) return;
    await acaoRapida('limparTerritorioArranjo', a.id);
  }

  async function abrirLinkPublico(tipo: 'designacao' | 'arranjo', id: number) {
    const key = `link:${tipo}:${id}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append(tipo === 'arranjo' ? 'arranjo_id' : 'designacao_id', String(id));
    const res = await fetch('?/gerarLinkTerritorio', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success' && parsed.data?.token) {
      window.open('/t/' + parsed.data.token, '_blank', 'noopener');
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou gerar link'));
    }
  }

  const arranjosFiltrados = $derived(
    (filtroTipo === 'todas' || filtroTipo === 'arranjo')
      ? data.arranjos.filter((a) => {
          if (!statusOk(a.status)) return false;
          if (busca.trim()) {
            const b = busca.toLowerCase();
            const alvo = `${a.nome ?? ''} ${a.dirigente_nome ?? ''} ${a.quadras_ids.join(' ')}`.toLowerCase();
            if (!alvo.includes(b)) return false;
          }
          return true;
        })
      : []
  );

  // Nome do TCE por id — pro chip no card "Pessoal" (design. só-de-TCE).
  const nomeTcePorId = $derived(new Map(data.tces.map((t) => [t.id, t.nome])));

  // TCE coberto por uma designação pessoal ABERTA — pro card solto da
  // seção TCEs não mostrar "(sem publicador)" quando já está designado
  // (esse fluxo nunca seta tces.publicador_id, só designacao_tces).
  const designacaoPorTce = $derived.by(() => {
    const m = new Map<string, DesignacaoHub>();
    for (const d of data.designacoes) {
      if (d.status !== 'aberta') continue;
      for (const tid of d.tces_ids) m.set(tid, d);
    }
    return m;
  });

  function nomeTce(t: TceHub): string {
    if (t.publicador_nome) return t.publicador_nome;
    const d = designacaoPorTce.get(t.id);
    return d ? nomesDesignacao(d) : '(sem publicador)';
  }

  function fmtData(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso.substring(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
  }
</script>

<div class="p-4 space-y-3 max-w-5xl mx-auto">
  <div>
    <h1 class="text-2xl font-bold">Designações</h1>
    <p class="text-sm text-slate-500">
      Gestão central — <Icon nome="target" size={14} /> {stats.pessoal} pessoais · <Icon nome="mail" size={14} /> {stats.cartas} cartas · <Icon nome="store" size={14} /> {stats.tce} TCEs · <Icon nome="tent" size={14} /> {stats.arranjos} arranjo(s)
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
              <span class="font-semibold text-sm">{nomesDesignacao(d)}</span>
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
            {#if d.tces_ids.length > 0}
              <div class="mt-1.5 flex flex-wrap gap-1">
                {#each d.tces_ids as tid}
                  <span class="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded truncate max-w-[200px]">
                    <Icon nome="store" size={14} /> {nomeTcePorId.get(tid) ?? tid}
                  </span>
                {/each}
              </div>
            {/if}
            {#if d.notas}<div class="mt-1 text-xs italic text-slate-500 truncate">{d.notas}</div>{/if}
          </div>
          <div class="flex flex-col gap-1 items-end shrink-0">
            {#if d.status === 'aberta'}
              <button type="button" disabled={isBusy(`mudarStatus:${d.id}`)} onclick={() => acaoRapida('mudarStatus', d.id, { status: 'concluida' })}
                class="text-xs text-green-700 hover:underline disabled:opacity-40"><Icon nome={isBusy(`mudarStatus:${d.id}`) ? 'loader' : 'check'} size={14} spin={isBusy(`mudarStatus:${d.id}`)} /> Concluir</button>
            {:else}
              <button type="button" disabled={isBusy(`mudarStatus:${d.id}`)} onclick={() => acaoRapida('mudarStatus', d.id, { status: 'aberta' })}
                class="text-xs text-primary-700 hover:underline disabled:opacity-40"><Icon nome={isBusy(`mudarStatus:${d.id}`) ? 'loader' : 'undo'} size={14} spin={isBusy(`mudarStatus:${d.id}`)} /> Reabrir</button>
            {/if}
            <button type="button" onclick={() => abrirEditar(d)} class="text-xs text-slate-600 hover:underline"><Icon nome="pencil" size={14} /> Editar</button>
            <button type="button" disabled={isBusy(`link:designacao:${d.id}`)} onclick={() => abrirLinkPublico('designacao', d.id)} class="text-xs text-slate-600 hover:underline disabled:opacity-40" title="Link público com mapa (WhatsApp)"><Icon nome={isBusy(`link:designacao:${d.id}`) ? 'loader' : 'share'} size={14} spin={isBusy(`link:designacao:${d.id}`)} /> Link</button>
            <button type="button" disabled={isBusy(`apagar:${d.id}`)} onclick={() => apagarDesignacao(d)} class="text-xs text-red-600 hover:underline disabled:opacity-40" title="Exclui a designação e libera quadras/prédios"><Icon nome={isBusy(`apagar:${d.id}`) ? 'loader' : 'trash'} size={14} spin={isBusy(`apagar:${d.id}`)} /> Excluir</button>
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
              {#if a.status !== 'aberta'}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">{a.status}</span>
              {/if}
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
              {#if a.tces_ids.length > 0}<span><Icon nome="store" size={14} /> {a.tces_ids.length} TCE(s)</span>{/if}
            </div>
          </div>
          <div class="flex flex-col gap-1 items-end shrink-0">
            <a href="/admin/arranjos" class="text-xs text-slate-600 hover:underline" title="Abre a tela de Arranjos pra editar"><Icon nome="link" size={14} /> Abrir em Arranjos</a>
            <button type="button" disabled={isBusy(`link:arranjo:${a.id}`)} onclick={() => abrirLinkPublico('arranjo', a.id)}
              class="text-xs text-slate-600 hover:underline disabled:opacity-40" title="Link público com mapa (WhatsApp)"><Icon nome={isBusy(`link:arranjo:${a.id}`) ? 'loader' : 'share'} size={14} spin={isBusy(`link:arranjo:${a.id}`)} /> Link</button>
            {#if a.quadras_ids.length > 0}
              <button type="button" onclick={() => abrirRealocar(a)}
                class="text-xs text-slate-600 hover:underline" title="Move quadras que não foram terminadas pra outro arranjo"><Icon nome="swap" size={14} /> Realocar</button>
            {/if}
            <button type="button" disabled={isBusy(`limparTerritorioArranjo:${a.id}`)} onclick={() => limparTerritorioArranjo(a)}
              class="text-xs text-slate-600 hover:underline disabled:opacity-40" title="Remove quadras/prédios/TCE do arranjo — o evento continua na agenda"><Icon nome={isBusy(`limparTerritorioArranjo:${a.id}`) ? 'loader' : 'eraser'} size={14} spin={isBusy(`limparTerritorioArranjo:${a.id}`)} /> Limpar</button>
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
              <span class="text-xs text-slate-500">{nomeTce(t)}</span>
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
              <button type="button" disabled={isBusy(`mudarStatusTce:${t.id}`)} onclick={() => acaoRapida('mudarStatusTce', t.id, { status: 'concluido' })}
                class="text-xs text-green-700 hover:underline disabled:opacity-40"><Icon nome={isBusy(`mudarStatusTce:${t.id}`) ? 'loader' : 'check'} size={14} spin={isBusy(`mudarStatusTce:${t.id}`)} /> Concluir</button>
              <button type="button" disabled={isBusy(`mudarStatusTce:${t.id}`)} onclick={() => acaoRapida('mudarStatusTce', t.id, { status: 'cancelado' })}
                class="text-xs text-red-600 hover:underline disabled:opacity-40"><Icon nome="x" size={14} /> Cancelar</button>
            {:else}
              <button type="button" disabled={isBusy(`mudarStatusTce:${t.id}`)} onclick={() => acaoRapida('mudarStatusTce', t.id, { status: 'aberto' })}
                class="text-xs text-primary-700 hover:underline disabled:opacity-40"><Icon nome={isBusy(`mudarStatusTce:${t.id}`) ? 'loader' : 'undo'} size={14} spin={isBusy(`mudarStatusTce:${t.id}`)} /> Reabrir</button>
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
        <span class="block text-sm font-medium mb-1">Publicadores (dupla/trio)</span>
        <div class="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
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
        <label for="prazo-ed" class="block text-sm font-medium mb-1">Prazo</label>
        <input id="prazo-ed" name="prazo" type="date" value={editando.prazo ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label for="notas-ed" class="block text-sm font-medium mb-1">Notas</label>
        <textarea id="notas-ed" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{editando.notas ?? ''}</textarea>
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" loading={isBusy(`apagar:${editando.id}`)} onclick={() => apagarDesignacao(editando!)} class="text-red-600">Excluir</Button>
        {#if editando.status === 'aberta'}
          <Button variant="secondary" loading={isBusy(`mudarStatus:${editando.id}`)} onclick={async () => { await acaoRapida('mudarStatus', editando!.id, { status: 'cancelada' }); sheetEditar = false; }}><Icon nome="x" size={14} /> Cancelar desig.</Button>
        {/if}
        <Button variant="primary" type="submit" loading={salvandoEditar} class="flex-1">Salvar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

<!-- Sheet realocar quadras não terminadas -->
<BottomSheet bind:open={sheetRealocar} title="Realocar quadras">
  {#if realocando}
    <div class="space-y-3">
      <p class="text-xs text-slate-500">
        Marque as quadras de <strong>{realocando.nome ?? 'Arranjo'}</strong> que não foram terminadas e escolha pra qual arranjo elas vão. As demais ficam onde estão.
      </p>

      <div class="flex flex-wrap gap-1.5">
        {#each realocando.quadras_ids as q}
          <button
            type="button"
            onclick={() => toggleQuadraRealocar(q)}
            class="text-xs font-mono px-2 py-1 rounded border"
            class:bg-primary-100={quadrasParaRealocar.includes(q)}
            class:border-primary-500={quadrasParaRealocar.includes(q)}
            class:text-primary-700={quadrasParaRealocar.includes(q)}
            class:bg-slate-50={!quadrasParaRealocar.includes(q)}
            class:border-slate-200={!quadrasParaRealocar.includes(q)}
            class:text-slate-600={!quadrasParaRealocar.includes(q)}
          >{q}</button>
        {/each}
      </div>

      <div>
        <label for="destino-realocar" class="block text-sm font-medium mb-1">Arranjo de destino</label>
        <select id="destino-realocar" bind:value={destinoRealocar} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">— selecione —</option>
          {#each destinosDisponiveis as a}
            <option value={a.id}>{a.nome ?? 'Arranjo'}{a.data ? ' · ' + a.data.split('-').reverse().join('/') : ''}</option>
          {/each}
        </select>
      </div>

      <Button
        variant="primary"
        class="w-full"
        loading={salvandoRealocar}
        disabled={quadrasParaRealocar.length === 0 || !destinoRealocar}
        onclick={realocarQuadras}
      >
        <Icon nome="swap" size={14} /> Realocar {quadrasParaRealocar.length || ''} quadra(s)
      </Button>
    </div>
  {/if}
</BottomSheet>

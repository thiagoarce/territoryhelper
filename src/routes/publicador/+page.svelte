<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { deserialize } from '$app/forms';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { DesignacaoEnriquecida, QuadraGeo, CoberturaQuadra } from '$lib/server/queries';

  interface CampanhaAtiva {
    id: number;
    nome: string;
    data_inicio: string;
    data_alvo: string;
    meta_semanal: number | null;
    concluidas_no_periodo: number;
    total_meta: number;
    status: 'planejada' | 'em_andamento' | 'encerrada';
    diasParaComecar: number;
  }

  interface MinhaParte {
    id: number;
    arranjo_nome: string;
    arranjo_data: string | null;
    hora_inicio: string | null;
    local_endereco: string | null;
    dirigente_nome: string | null;
    colegas: string[];
    quadras_ids: string[];
    locais_ids: number[];
  }
  interface ArranjoQueDirijo {
    id: number;
    nome: string;
    data: string;
    hora_inicio: string | null;
    local_endereco: string | null;
    quadras_ids: string[];
    cartas_locais_ids: number[];
    tce_id: string | null;
  }
  interface CartaDesignada {
    designacao_id: number;
    prazo: string | null;
    predios: { id: number; nome: string | null; logradouro: string; numero: string; qtd_entregues: number; qtd_aptos: number }[];
  }

  let {
    data
  }: {
    data: {
      abertas: DesignacaoEnriquecida[];
      concluidas: DesignacaoEnriquecida[];
      quadrasMap: Record<string, QuadraGeo>;
      cobertura: Record<string, CoberturaQuadra>;
      tces: { id: string; nome: string; tipo: string; prazo: string | null; status: string }[];
      campanhaAtiva: CampanhaAtiva | null;
      minhasPartes: MinhaParte[];
      arranjosQueDirijo: ArranjoQueDirijo[];
      cartasDesignadas: CartaDesignada[];
      minhaRole: string | undefined;
    };
  } = $props();

  function fmtDia(iso: string | null): string {
    if (!iso) return '';
    const hoje = new Date().toISOString().substring(0, 10);
    if (iso === hoje) return 'hoje';
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  // Link público — abre /t/<token> pra compartilhar (designação OU arranjo)
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

  let aba: 'abertas' | 'concluidas' = $state('abertas');
  const lista = $derived(aba === 'abertas' ? data.abertas : data.concluidas);

  // Designações agora são só território pessoal (quadras) e cartas (prédios).
  // Pregação em grupo vem de arranjo_partes, não de designações.
  const pessoais = $derived(lista.filter((d: any) => d.tipo !== 'cartas'));

  // Quadras envolvidas nas designações abertas — pro mini-mapa
  const quadrasMapa = $derived.by(() => {
    const ids = new Set<string>();
    for (const d of data.abertas) for (const q of d.quadras_ids) ids.add(q);
    return [...ids].map((id) => data.quadrasMap[id]).filter(Boolean);
  });

  function diasAteOuApos(dataStr: string | null): string {
    if (!dataStr) return '';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const prazo = new Date(dataStr + 'T12:00:00');
    const dias = Math.round((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    if (dias < 0) return `vencido há ${-dias}d`;
    if (dias === 0) return 'vence hoje';
    if (dias === 1) return 'vence amanhã';
    return `${dias} dias`;
  }
</script>

<div class="p-4">
{#if data.arranjosQueDirijo.length > 0}
  <div class="mb-4 rounded-xl border-2 border-primary-400 bg-primary-50 p-3">
    <div class="text-xs uppercase tracking-wider font-bold text-primary-900 mb-2"><Icon nome="tent" size={14} /> Você dirige</div>
    {#each data.arranjosQueDirijo as a}
      <div class="bg-white rounded-lg p-3 mb-1 last:mb-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium">{a.nome}</span>
          <span class="text-xs text-primary-700 font-medium">{fmtDia(a.data)}{a.hora_inicio ? ` · ${a.hora_inicio.substring(0, 5)}` : ''}</span>
        </div>
        {#if a.local_endereco}<div class="text-xs text-slate-500 mt-0.5"><Icon nome="map-pin" size={14} /> {a.local_endereco}</div>{/if}
        <div class="flex flex-wrap gap-1.5 mt-1.5">
          {#each a.quadras_ids as qid}
            {@const q = data.quadrasMap[qid]}
            <a href="/publicador/quadra/{encodeURIComponent(qid)}"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-mono border border-primary-200 bg-primary-100 text-primary-900 hover:bg-primary-200">
              {#if q}<span class="inline-block w-2 h-2 rounded" style:background-color={q.color}></span>{/if}
              <span>{qid}</span>
            </a>
          {/each}
          {#each a.cartas_locais_ids as lid}
            <a href="/predio/{lid}" class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-lg border border-purple-200 hover:bg-purple-200"><Icon nome="mail" size={14} /> #{lid}</a>
          {/each}
          {#if a.tce_id}
            <span class="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-lg border border-orange-200"><Icon nome="store" size={14} /> {a.tce_id}</span>
          {/if}
        </div>
        <div class="mt-2 flex items-center gap-3">
          <a href="/publicador/arranjo" class="text-xs font-medium text-primary-700 hover:underline"><Icon nome="scissors" size={14} /> Repartir território →</a>
          <button type="button" onclick={() => abrirLinkPublico('arranjo', a.id)}
            class="text-xs font-medium text-primary-700 hover:underline"><Icon nome="share" size={14} /> Compartilhar</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if data.minhasPartes.length > 0}
  <div class="mb-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
    <div class="text-xs uppercase tracking-wider font-bold text-amber-900 mb-2"><Icon nome="walk" size={14} /> Pregação em grupo — sua parte</div>
    {#each data.minhasPartes as p}
      <div class="bg-white rounded-lg p-3 mb-1 last:mb-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium">{p.arranjo_nome}</span>
          <span class="text-xs text-amber-700 font-medium">{fmtDia(p.arranjo_data)}{p.hora_inicio ? ` · ${p.hora_inicio.substring(0, 5)}` : ''}</span>
        </div>
        <div class="text-xs text-slate-500 mt-0.5">
          {#if p.dirigente_nome}Dirigente: {p.dirigente_nome}{/if}
          {#if p.colegas.length > 0} · com {p.colegas.join(', ')}{/if}
        </div>
        {#if p.local_endereco}<div class="text-xs text-slate-500"><Icon nome="map-pin" size={14} /> {p.local_endereco}</div>{/if}
        <div class="flex flex-wrap gap-1.5 mt-1.5">
          {#each p.quadras_ids as qid}
            {@const q = data.quadrasMap[qid]}
            <a href="/publicador/quadra/{encodeURIComponent(qid)}"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-mono border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200">
              {#if q}<span class="inline-block w-2 h-2 rounded" style:background-color={q.color}></span>{/if}
              <span>{qid}</span>
            </a>
          {/each}
          {#each p.locais_ids as lid}
            <a href="/predio/{lid}" class="text-xs bg-amber-100 text-amber-900 px-2 py-1 rounded-lg border border-amber-300 hover:bg-amber-200"><Icon nome="mail" size={14} /> #{lid}</a>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if data.campanhaAtiva?.status === 'planejada'}
  {@const c = data.campanhaAtiva}
  <a
    href="/publicador/arranjo?periodo=tres_meses"
    class="block mb-4 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 text-white p-4 shadow-sm hover:shadow transition-shadow"
  >
    <div class="text-xs opacity-80 uppercase tracking-wider">Campanha se aproxima</div>
    <div class="text-lg font-bold truncate">Faltam {c.diasParaComecar} dia(s) — {c.nome}</div>
    <div class="mt-1 text-xs opacity-90">
      Início {new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · veja os arranjos da campanha →
    </div>
  </a>
{:else if data.campanhaAtiva?.status === 'em_andamento'}
  {@const c = data.campanhaAtiva}
  {@const pct = c.total_meta > 0 ? Math.round((c.concluidas_no_periodo / c.total_meta) * 100) : 0}
  <a
    href="/publicador/campanha"
    class="block mb-4 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 text-white p-4 shadow-sm hover:shadow transition-shadow"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="text-xs opacity-80 uppercase tracking-wider">Campanha ativa</div>
        <div class="text-lg font-bold truncate">{c.nome}</div>
      </div>
      <div class="text-2xl font-bold">{pct}%</div>
    </div>
    <div class="mt-2 h-2 rounded-full bg-white/20 overflow-hidden">
      <div class="h-full bg-white" style:width="{pct}%"></div>
    </div>
    <div class="mt-2 flex justify-between text-xs opacity-90">
      <span>{c.concluidas_no_periodo}/{c.total_meta} quadras</span>
      <span>{new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} → {new Date(c.data_alvo + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
    </div>
  </a>
{/if}

<div>
  <h1 class="text-2xl font-bold">Minha carteira</h1>
  <p class="mt-1 text-sm text-slate-500">
    Território pessoal · pregação em grupo · cartas.
    {#if data.minhaRole === 'admin' || data.minhaRole === 'dirigente'}
      <a href="/publicador/mapa" class="text-primary-700 hover:underline">Visão geral no mapa →</a>
    {/if}
  </p>
</div>

{#if quadrasMapa.length > 0 && aba === 'abertas'}
  <div class="mt-4">
    <AdminMapa quadras={quadrasMapa} altura={220} onQuadraClick={(q) => (window.location.href = '/publicador/quadra/' + encodeURIComponent(q.id))} />
  </div>
{/if}

<!-- TCEs designados -->
{#if data.tces && data.tces.length > 0}
  <div class="mt-4">
    <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2"><Icon nome="store" size={14} /> Territórios comerciais</h2>
    <div class="space-y-2">
      {#each data.tces as t}
        <a href="/publicador/tce/{t.id}" class="block rounded-lg border border-purple-200 bg-purple-50 p-3 hover:bg-purple-100 transition-colors">
          <div class="font-medium flex items-center justify-between">
            {t.nome}
            {#if t.prazo}<span class="text-xs text-amber-700">prazo {t.prazo}</span>{/if}
          </div>
          <div class="text-xs text-slate-500 mt-0.5">{t.tipo} · toque pra trabalhar</div>
        </a>
      {/each}
    </div>
  </div>
{/if}

<div class="mt-4 flex gap-2">
  {#each [['abertas', 'Abertas', data.abertas.length], ['concluidas', 'Concluídas', data.concluidas.length]] as [k, label, n]}
    <button
      onclick={() => (aba = k as any)}
      class="px-3 py-1 text-sm rounded border"
      class:bg-primary-100={aba === k}
      class:border-primary-500={aba === k}
      class:text-primary-700={aba === k}
      class:border-slate-200={aba !== k}
      class:text-slate-600={aba !== k}
    >
      {label} ({n})
    </button>
  {/each}
</div>

{#snippet cardDesignacao(d: DesignacaoEnriquecida)}
  <div class="rounded-lg border border-slate-200 bg-white p-4 hover:shadow transition-shadow">
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="text-sm text-slate-500">
          Designada em {new Date(d.criada_em).toLocaleDateString('pt-BR')}
        </div>
        <div class="mt-2 text-sm font-semibold">{d.quadras_ids.length} quadra(s)</div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          {#each d.quadras_ids as qid}
            {@const q = data.quadrasMap[qid]}
            {@const cov = data.cobertura[qid]}
            <a
              href="/publicador/quadra/{encodeURIComponent(qid)}"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-mono border border-slate-200 hover:bg-slate-100 hover:border-primary-500 transition-colors"
            >
              <span class="inline-block w-2 h-2 rounded" style:background-color={q?.color ?? '#999'}></span>
              <span>{qid}</span>
              {#if cov && cov.total > 0}<span class="text-[10px] text-slate-500">{cov.feitas}/{cov.total}</span>{/if}
            </a>
          {/each}
        </div>
        {#if d.notas}<div class="mt-2 text-sm text-slate-600 italic">{d.notas}</div>{/if}
      </div>
    </div>
    <div class="mt-3 flex items-center gap-3">
      {#if d.prazo}
        <div class="text-xs text-slate-500">
          Prazo: <strong>{new Date(d.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
          <span class="ml-1 text-slate-400">({diasAteOuApos(d.prazo)})</span>
        </div>
      {/if}
      <button type="button" onclick={() => abrirLinkPublico('designacao', d.id)}
        class="ml-auto text-xs text-primary-700 hover:underline" title="Link público com mapa (WhatsApp)"><Icon nome="share" size={14} /> Compartilhar</button>
    </div>
  </div>
{/snippet}

<div class="mt-4 space-y-4">
  <section>
    <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
      <Icon nome="target" size={14} /> Território pessoal
      <span class="text-xs text-slate-400 normal-case font-normal">({pessoais.length})</span>
    </h2>
    {#if pessoais.length === 0}
      <div class="text-sm text-slate-400 italic bg-slate-50 rounded-lg p-3">Sem designação pessoal no momento.</div>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2">
        {#each pessoais as d (d.id)}{@render cardDesignacao(d)}{/each}
      </div>
    {/if}
  </section>

  {#if data.cartasDesignadas && data.cartasDesignadas.length > 0}
    <section>
      <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
        <Icon nome="mail" size={14} /> Cartas designadas
        <span class="text-xs text-slate-400 normal-case font-normal">({data.cartasDesignadas.reduce((s, c) => s + c.predios.length, 0)} prédio(s))</span>
      </h2>
      <div class="grid gap-3">
        {#each data.cartasDesignadas as c}
          <div class="rounded-lg border border-purple-200 bg-purple-50 p-3">
            {#if c.prazo}
              <div class="text-xs text-purple-700 font-medium mb-1.5">Prazo: {new Date(c.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
            {/if}
            <div class="flex flex-wrap gap-1.5">
              {#each c.predios as p}
                <a href="/predio/{p.id}"
                  class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs border border-purple-300 bg-white text-purple-900 hover:bg-purple-100 max-w-[240px]">
                  <span><Icon nome="mail" size={14} /></span>
                  <span class="truncate">{p.nome || `${p.logradouro}, ${p.numero}`}</span>
                  <span class="text-[10px] text-purple-500 shrink-0">{p.qtd_entregues}/{p.qtd_aptos}</span>
                </a>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
</div>

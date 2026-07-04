<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
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
    notasSuprimento: string | null;
    imagemUrl: string | null;
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
  interface MeuAgendamentoTp {
    agendamento_id: number;
    data: string;
    hora_inicio: string;
    hora_fim: string;
    ponto_nome: string;
  }
  interface MeuPedidoPublicacao {
    id: number;
    publicacao_nome: string | null;
    descricao: string | null;
    qtd: number;
    status: 'aberto' | 'pedido' | 'entregue' | 'cancelado';
    criado_em: string;
  }
  interface PublicacaoLite {
    id: number;
    nome: string;
    categoria: string;
    qtd_estoque: number;
    imagem_url: string | null;
  }
  interface NecessidadeRegularLinha {
    publicacao_id: number;
    qtd: number;
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
      meusAgendamentosTp: MeuAgendamentoTp[];
      meusPedidosPublicacao: MeuPedidoPublicacao[];
      catalogoPublicacoes: PublicacaoLite[];
      necessidadeRegular: NecessidadeRegularLinha[];
      souServoPub: boolean;
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
  let gerandoLink = $state<string | null>(null);
  async function abrirLinkPublico(tipo: 'designacao' | 'arranjo', id: number) {
    const key = `${tipo}:${id}`;
    gerandoLink = key;
    const fd = new FormData();
    fd.append(tipo === 'arranjo' ? 'arranjo_id' : 'designacao_id', String(id));
    const res = await fetch('?/gerarLinkTerritorio', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    gerandoLink = null;
    if (parsed.type === 'success' && parsed.data?.token) {
      window.open('/t/' + parsed.data.token, '_blank', 'noopener');
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou gerar link'));
    }
  }

  // Pedido de publicação (P-A) — catálogo OU descrição livre
  let sheetPedido = $state(false);
  let usaDescricaoLivre = $state(false);
  let enviandoPedido = $state(false);
  let cancelandoPedidoId = $state<number | null>(null);
  let publicacaoSelecionadaId = $state<number | null>(null);

  const CATEGORIA_LABEL: Record<string, string> = {
    biblia: 'Bíblias', livro: 'Livros', brochura: 'Brochuras e livretos',
    folheto: 'Folhetos e convites', cartao_visita: 'Cartões de visita',
    revista: 'Revistas', formulario: 'Formulários e acessórios', outro: 'Outros'
  };
  const catalogoAgrupado = $derived.by(() => {
    const m: Record<string, PublicacaoLite[]> = {};
    for (const p of data.catalogoPublicacoes) (m[p.categoria] ??= []).push(p);
    return m;
  });
  const publicacaoSelecionada = $derived(
    data.catalogoPublicacoes.find((p) => p.id === publicacaoSelecionadaId) ?? null
  );

  async function enviarPedido(e: SubmitEvent) {
    e.preventDefault();
    enviandoPedido = true;
    const fd = new FormData(e.target as HTMLFormElement);
    const res = await fetch('?/pedirPublicacao', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    enviandoPedido = false;
    if (parsed.type === 'success') {
      toast.success('Pedido enviado');
      sheetPedido = false;
      publicacaoSelecionadaId = null;
      await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou'));
    }
  }

  // Necessidade regular de revistas (Despertai/Sentinela) — preferência, sem status
  let necessidadeEmEdicao: Record<number, number> = $state({});
  let salvandoNecessidadeId = $state<number | null>(null);
  function necessidadeAtual(publicacaoId: number): number {
    if (publicacaoId in necessidadeEmEdicao) return necessidadeEmEdicao[publicacaoId];
    return data.necessidadeRegular.find((n) => n.publicacao_id === publicacaoId)?.qtd ?? 0;
  }
  async function salvarNecessidade(publicacaoId: number, delta: number) {
    const novaQtd = Math.max(0, necessidadeAtual(publicacaoId) + delta);
    necessidadeEmEdicao[publicacaoId] = novaQtd;
    salvandoNecessidadeId = publicacaoId;
    const fd = new FormData();
    fd.append('publicacao_id', String(publicacaoId));
    fd.append('qtd', String(novaQtd));
    const res = await fetch('?/salvarNecessidadeRegular', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    salvandoNecessidadeId = null;
    if (parsed.type !== 'success') toast.error(String(parsed.data?.erro || 'Falhou'));
    await invalidateAll();
  }

  async function cancelarPedido(id: number) {
    cancelandoPedidoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/cancelarPedidoPublicacao', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    cancelandoPedidoId = null;
    if (parsed.type === 'success') { toast.success('Cancelado'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  const PEDIDO_STATUS_LABEL: Record<string, string> = {
    aberto: 'Aberto', pedido: 'Pedido feito', entregue: 'Entregue', cancelado: 'Cancelado'
  };
  const PEDIDO_STATUS_CLASSE: Record<string, string> = {
    aberto: 'bg-slate-100 text-slate-700',
    pedido: 'bg-blue-100 text-blue-700',
    entregue: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-700'
  };

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

  // Progresso agregado (feitas/total de endereços) de um conjunto de quadras,
  // pra barra de progresso nos cards do home. null se não há dado de cobertura.
  function progressoQuadras(quadrasIds: string[]): { feitas: number; total: number; pct: number } | null {
    let feitas = 0, total = 0;
    for (const qid of quadrasIds) {
      const cov = data.cobertura[qid];
      if (!cov) continue;
      feitas += cov.feitas;
      total += cov.total;
    }
    if (total === 0) return null;
    return { feitas, total, pct: Math.round((feitas / total) * 100) };
  }
</script>

<div class="p-4">
{#if data.arranjosQueDirijo.length > 0}
  <div class="mb-4 rounded-xl border-2 border-primary-400 bg-primary-50 p-3">
    <div class="text-xs uppercase tracking-wider font-bold text-primary-900 mb-2"><Icon nome="tent" size={14} /> Você dirige</div>
    {#each data.arranjosQueDirijo as a}
      {@const prog = progressoQuadras(a.quadras_ids)}
      <div class="bg-white rounded-lg p-3 mb-1 last:mb-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium">{a.nome}</span>
          <span class="text-xs text-primary-700 font-medium">{fmtDia(a.data)}{a.hora_inicio ? ` · ${a.hora_inicio.substring(0, 5)}` : ''}</span>
        </div>
        {#if a.local_endereco}<div class="text-xs text-slate-500 mt-0.5"><Icon nome="map-pin" size={14} /> {a.local_endereco}</div>{/if}
        {#if prog}
          <div class="mt-1.5">
            <div class="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
              <span>Progresso</span>
              <span class="font-medium">{prog.feitas}/{prog.total}</span>
            </div>
            <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full bg-primary-500" style:width="{prog.pct}%"></div>
            </div>
          </div>
        {/if}
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
          <button type="button" disabled={gerandoLink === `arranjo:${a.id}`} onclick={() => abrirLinkPublico('arranjo', a.id)}
            class="text-xs font-medium text-primary-700 hover:underline disabled:opacity-40"><Icon nome={gerandoLink === `arranjo:${a.id}` ? 'loader' : 'share'} size={14} spin={gerandoLink === `arranjo:${a.id}`} /> Compartilhar</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if data.minhasPartes.length > 0}
  <div class="mb-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
    <div class="text-xs uppercase tracking-wider font-bold text-amber-900 mb-2"><Icon nome="walk" size={14} /> Pregação em grupo — sua parte</div>
    {#each data.minhasPartes as p}
      {@const prog = progressoQuadras(p.quadras_ids)}
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
        {#if prog}
          <div class="mt-1.5">
            <div class="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
              <span>Progresso</span>
              <span class="font-medium">{prog.feitas}/{prog.total}</span>
            </div>
            <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full bg-amber-500" style:width="{prog.pct}%"></div>
            </div>
          </div>
        {/if}
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

{#if data.meusAgendamentosTp.length > 0}
  <div class="mb-4 rounded-xl border-2 border-teal-400 bg-teal-50 p-3">
    <div class="text-xs uppercase tracking-wider font-bold text-teal-900 mb-2"><Icon nome="megaphone" size={14} /> Seus turnos de TP (próximos 7 dias)</div>
    <div class="flex flex-wrap gap-1.5">
      {#each data.meusAgendamentosTp as t}
        <a href="/publicador/arranjo" class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs border border-teal-300 bg-white text-teal-900 hover:bg-teal-100">
          <span class="font-medium">{t.ponto_nome}</span>
          <span class="text-teal-700">{fmtDia(t.data)} · {t.hora_inicio.substring(0, 5)}</span>
        </a>
      {/each}
    </div>
  </div>
{/if}

{#if data.souServoPub}
  <a href="/publicacoes" class="mb-4 flex items-center justify-between gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 hover:bg-amber-100 transition-colors">
    <span class="text-sm font-bold text-amber-900"><Icon nome="inbox" size={14} /> Área do servo — pedidos de publicação</span>
    <Icon nome="chevron-right" size={16} class="text-amber-700" />
  </a>
{/if}

<div class="mb-4 rounded-xl border border-slate-200 bg-white p-3">
  <div class="flex items-center justify-between gap-2">
    <div class="text-xs uppercase tracking-wider font-bold text-slate-600"><Icon nome="inbox" size={14} /> Publicações</div>
    <button type="button" onclick={() => (sheetPedido = true)} class="text-xs font-medium text-primary-700 hover:underline">+ Pedir publicação</button>
  </div>
  {#if data.meusPedidosPublicacao.length > 0}
    <div class="mt-2 space-y-1">
      {#each data.meusPedidosPublicacao as p (p.id)}
        <div class="flex items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-2.5 py-1.5">
          <span class="truncate">{p.publicacao_nome ?? p.descricao} <span class="text-slate-400">×{p.qtd}</span></span>
          <span class="flex items-center gap-1.5 shrink-0">
            <span class="text-[10px] px-1.5 py-0.5 rounded-full {PEDIDO_STATUS_CLASSE[p.status]}">{PEDIDO_STATUS_LABEL[p.status]}</span>
            {#if p.status === 'aberto'}
              <button
                type="button"
                disabled={cancelandoPedidoId === p.id}
                onclick={() => cancelarPedido(p.id)}
                class="text-red-600 hover:underline disabled:opacity-40"
              ><Icon nome={cancelandoPedidoId === p.id ? 'loader' : 'x'} size={12} spin={cancelandoPedidoId === p.id} /></button>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {:else}
    <p class="mt-2 text-xs text-slate-400">Nenhum pedido ainda.</p>
  {/if}

  {#if (catalogoAgrupado['revista'] ?? []).length > 0}
    <div class="mt-3 pt-3 border-t border-slate-100">
      <div class="text-xs text-slate-500 mb-1.5">Normalmente preciso de (Despertai/Sentinela chegam pela via normal):</div>
      <div class="flex flex-wrap gap-2">
        {#each catalogoAgrupado['revista'] as p (p.id)}
          <div class="flex items-center gap-1.5 text-sm bg-slate-50 rounded-lg px-2 py-1">
            <span class="truncate">{p.nome}</span>
            <button type="button" disabled={salvandoNecessidadeId === p.id} onclick={() => salvarNecessidade(p.id, -1)} class="w-5 h-5 rounded bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-xs">−</button>
            <span class="w-5 text-center font-medium">{necessidadeAtual(p.id)}</span>
            <button type="button" disabled={salvandoNecessidadeId === p.id} onclick={() => salvarNecessidade(p.id, 1)} class="w-5 h-5 rounded bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-xs">+</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if data.campanhaAtiva?.status === 'planejada'}
  {@const c = data.campanhaAtiva}
  <a
    href="/publicador/arranjo?periodo=tres_meses"
    class="flex items-center gap-3 mb-4 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 text-white p-4 shadow-sm hover:shadow transition-shadow"
  >
    {#if c.imagemUrl}<img src={c.imagemUrl} alt="" class="w-14 h-14 rounded-lg object-cover shrink-0 shadow" />{/if}
    <div class="flex-1 min-w-0">
      <div class="text-xs opacity-80 uppercase tracking-wider">Campanha se aproxima</div>
      <div class="text-lg font-bold truncate">Faltam {c.diasParaComecar} dia(s) — {c.nome}</div>
      <div class="mt-1 text-xs opacity-90">
        Início {new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · veja os arranjos da campanha →
      </div>
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
      {#if c.imagemUrl}<img src={c.imagemUrl} alt="" class="w-14 h-14 rounded-lg object-cover shrink-0 shadow" />{/if}
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
    {#if c.notasSuprimento}
      <div class="mt-2 pt-2 border-t border-white/20 text-xs opacity-90"><Icon nome="mail" size={12} /> {c.notasSuprimento}</div>
    {/if}
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
  {@const prog = progressoQuadras(d.quadras_ids)}
  <div class="rounded-lg border border-slate-200 bg-white p-4 hover:shadow transition-shadow">
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="text-sm text-slate-500">
          Designada em {new Date(d.criada_em).toLocaleDateString('pt-BR')}
        </div>
        <div class="mt-2 text-sm font-semibold">{d.quadras_ids.length} quadra(s)</div>
        {#if prog}
          <div class="mt-1.5">
            <div class="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
              <span>Progresso</span>
              <span class="font-medium">{prog.feitas}/{prog.total}</span>
            </div>
            <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full bg-primary-500" style:width="{prog.pct}%"></div>
            </div>
          </div>
        {/if}
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
      <button type="button" disabled={gerandoLink === `designacao:${d.id}`} onclick={() => abrirLinkPublico('designacao', d.id)}
        class="ml-auto text-xs text-primary-700 hover:underline disabled:opacity-40" title="Link público com mapa (WhatsApp)"><Icon nome={gerandoLink === `designacao:${d.id}` ? 'loader' : 'share'} size={14} spin={gerandoLink === `designacao:${d.id}`} /> Compartilhar</button>
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

<BottomSheet bind:open={sheetPedido} title="Pedir publicação">
  <form onsubmit={enviarPedido} class="space-y-3">
    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-medium">O que você precisa</span>
        <label class="flex items-center gap-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={usaDescricaoLivre}
            onchange={(e) => (usaDescricaoLivre = (e.target as HTMLInputElement).checked)}
            class="w-3.5 h-3.5 rounded"
          /> Não está no catálogo
        </label>
      </div>
      {#if usaDescricaoLivre}
        <input name="descricao" required placeholder="Ex: Bíblia em russo" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {:else}
        <select
          name="publicacao_id"
          required
          bind:value={publicacaoSelecionadaId}
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">— selecione —</option>
          {#each Object.entries(catalogoAgrupado) as [cat, itens]}
            <optgroup label={CATEGORIA_LABEL[cat] ?? cat}>
              {#each itens as p}
                <option value={p.id}>{p.nome}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
        {#if publicacaoSelecionada}
          <div class="mt-2 flex items-center gap-2">
            {#if publicacaoSelecionada.imagem_url}
              <img src={publicacaoSelecionada.imagem_url} alt="" class="w-10 h-10 rounded object-cover shrink-0" />
            {/if}
            {#if publicacaoSelecionada.qtd_estoque > 0}
              <p class="text-xs text-green-700 bg-green-50 rounded-lg px-2 py-1.5 flex-1">
                <Icon nome="check" size={12} /> Já temos {publicacaoSelecionada.qtd_estoque} em estoque — fale com o servo de publicações pra pegar direto.
              </p>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
    <div>
      <label for="ped-qtd" class="block text-sm font-medium mb-1">Quantidade</label>
      <input id="ped-qtd" name="qtd" type="number" min="1" value="1" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <Button variant="primary" type="submit" loading={enviandoPedido} class="w-full">Enviar pedido</Button>
  </form>
</BottomSheet>

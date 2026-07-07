<script lang="ts">
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import MapaAdmin from '$lib/components/MapaAdmin.svelte';
  import type { Campanha } from '$lib/types';
  import type { QuadraGeo } from '$lib/server/queries';
  import type { CampanhaResumo, ConclusaoSemana, MetaPessoal, MinhaColaboracao } from './+page.server';

  let { data }: {
    data: {
      ativa: CampanhaResumo | null;
      objetivos: Campanha[];
      quadras: QuadraGeo[];
      quadrasConcluidasNoPeriodo: string[];
      conclusoesSemana: ConclusaoSemana[];
      metasPessoais: MetaPessoal[];
      minhaColaboracao: MinhaColaboracao | null;
    };
  } = $props();

  const MODALIDADES = [
    { v: 'casa', icone: 'home', label: 'Casa em casa' },
    { v: 'comercial', icone: 'store', label: 'Comercial' },
    { v: 'rural', icone: 'wheat', label: 'Rural' },
    { v: 'cartas', icone: 'mail', label: 'Cartas' },
    { v: 'telefone', icone: 'phone', label: 'Telefone' },
    { v: 'publico', icone: 'megaphone', label: 'Testemunho público' }
  ];

  const TIPO_LABEL: Record<string, string> = {
    conversou: 'Conversou', semConversa: 'Sem palestra', naoAtendeu: 'Não atendeu',
    carta: 'Cartas entregues', interfone: 'Interfone', manual: 'Registro manual', auto: 'Automático'
  };

  const porModalidade = $derived.by(() => {
    const m = new Map<string, Campanha[]>();
    for (const o of data.objetivos) {
      const arr = m.get(o.modalidade) ?? [];
      arr.push(o);
      m.set(o.modalidade, arr);
    }
    return m;
  });

  function fmtData(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  const pct = $derived(
    data.ativa && data.ativa.total_meta > 0
      ? Math.round((data.ativa.concluidas_no_periodo / data.ativa.total_meta) * 100)
      : 0
  );

  const maxSemana = $derived(Math.max(1, ...data.conclusoesSemana.map((s) => s.qtd)));

  // Metas pessoais
  let novaMeta = $state('');
  let salvandoMeta = $state(false);
  let ocupadoId = $state<number | null>(null);

  async function criarMeta() {
    if (!novaMeta.trim() || !data.ativa) return;
    salvandoMeta = true;
    const fd = new FormData();
    fd.append('campanha_id', String(data.ativa.id));
    fd.append('texto', novaMeta.trim());
    const res = await fetch('?/criarMetaPessoal', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    salvandoMeta = false;
    if (parsed.type === 'success') { novaMeta = ''; await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function alternarMeta(m: MetaPessoal) {
    ocupadoId = m.id;
    const fd = new FormData();
    fd.append('id', String(m.id));
    fd.append('feito', String(!m.feito));
    const res = await fetch('?/marcarMetaPessoal', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    ocupadoId = null;
    if (parsed.type === 'success') await invalidateAll();
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function apagarMeta(id: number) {
    ocupadoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarMetaPessoal', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    ocupadoId = null;
    if (parsed.type === 'success') await invalidateAll();
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  function compartilharColaboracao() {
    if (!data.ativa || !data.minhaColaboracao) return;
    const c = data.minhaColaboracao;
    const linhas = [`Minha colaboração — *${data.ativa.nome}*`];
    for (const [tipo, qtd] of Object.entries(c.porTipo)) {
      linhas.push(`${TIPO_LABEL[tipo] ?? tipo}: ${qtd}`);
    }
    if (c.cartasEscritas > 0) linhas.push(`Cartas escritas: ${c.cartasEscritas}`);
    const msg = linhas.join('\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }
</script>

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Campanha</h1>
    {#if data.ativa}
      <p class="text-sm text-slate-500">{fmtData(data.ativa.data_inicio)} → {fmtData(data.ativa.data_alvo)}</p>
    {/if}
  </div>

  {#if !data.ativa}
    <Card padding="md">
      <div class="text-center py-6">
        <Icon nome="calendar" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Sem campanha ativa</div>
      </div>
    </Card>
  {:else}
    {@const c = data.ativa}

    {#if c.status === 'planejada'}
      <div class="rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 text-white p-4 shadow-sm">
        <div class="flex items-center gap-3">
          {#if c.imagemUrl}<img src={c.imagemUrl} alt="" class="w-14 h-14 rounded-lg object-cover shrink-0 shadow" />{/if}
          <div class="flex-1 min-w-0">
            <div class="text-xs opacity-80 uppercase tracking-wider">Campanha se aproxima</div>
            <div class="text-lg font-bold truncate">{c.nome}</div>
            <div class="mt-1 text-sm opacity-90">Faltam {c.diasParaComecar} dia(s) pra começar</div>
          </div>
        </div>
      </div>
    {:else}
      <div class="rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 text-white p-4 shadow-sm">
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
          <span>{c.concluidas_no_periodo}/{c.total_meta} quadras concluídas</span>
          <span>{c.diasRestantes === 0 ? 'último dia' : `${c.diasRestantes} dia(s) restantes`}</span>
        </div>
      </div>

      {#if c.meta_semanal}
        {@const noRitmo = c.concluidas_semana >= c.meta_semanal}
        <div class="rounded-xl border p-3 flex items-center gap-3 {noRitmo ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}">
          <Icon nome={noRitmo ? 'check' : 'alert'} size={18} class={noRitmo ? 'text-green-600' : 'text-amber-600'} />
          <div class="text-sm {noRitmo ? 'text-green-900' : 'text-amber-900'}">
            <strong>{c.concluidas_semana}</strong> quadra(s) nos últimos 7 dias — meta semanal: <strong>{c.meta_semanal}</strong>
            {#if !noRitmo}<span class="block text-xs mt-0.5 text-amber-700">Faltam {c.meta_semanal - c.concluidas_semana} pra bater o ritmo da semana.</span>{/if}
          </div>
        </div>
      {/if}

      <Card padding="md">
        <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Mapa do período</h2>
        <MapaAdmin quadras={data.quadras} altura={280} colorirPor="campanha" concluidasCampanha={data.quadrasConcluidasNoPeriodo} mostrarRotulos={false} />
        <p class="text-xs text-slate-500 mt-1">Verde forte = concluída durante a campanha.</p>
      </Card>

      {#if data.conclusoesSemana.length > 0}
        <Card padding="md">
          <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Conclusões por semana</h2>
          <div class="flex items-end gap-1.5 h-24">
            {#each data.conclusoesSemana as s (s.semana)}
              <div class="flex-1 flex flex-col items-center gap-1">
                <div class="w-full bg-primary-500 rounded-t" style:height="{Math.max(4, (s.qtd / maxSemana) * 80)}px"></div>
                <span class="text-[10px] text-slate-400">{s.qtd}</span>
              </div>
            {/each}
          </div>
        </Card>
      {/if}
    {/if}

    {#if c.notasSuprimento}
      <div class="rounded-xl border border-slate-200 bg-white p-3 flex items-start gap-2">
        <Icon nome="inbox" size={16} class="text-slate-500 shrink-0 mt-0.5" />
        <div class="text-sm text-slate-700">
          <span class="block text-[10px] uppercase tracking-wider font-semibold text-slate-400">Suprimento</span>
          {c.notasSuprimento}
        </div>
      </div>
    {/if}

    {#if data.minhaColaboracao}
      {@const col = data.minhaColaboracao}
      {@const temAlgo = Object.keys(col.porTipo).length > 0 || col.cartasEscritas > 0}
      <Card padding="md">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h2 class="text-sm font-semibold text-slate-600 uppercase">Minha colaboração</h2>
          {#if temAlgo}
            <button onclick={compartilharColaboracao} class="text-xs text-primary-700 hover:underline"><Icon nome="share" size={12} /> Compartilhar</button>
          {/if}
        </div>
        {#if !temAlgo}
          <p class="text-xs text-slate-400">Nenhuma atividade registrada ainda neste período.</p>
        {:else}
          <div class="grid grid-cols-2 gap-2 text-sm">
            {#each Object.entries(col.porTipo) as [tipo, qtd]}
              <div class="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5">
                <span class="text-slate-600">{TIPO_LABEL[tipo] ?? tipo}</span>
                <span class="font-semibold">{qtd}</span>
              </div>
            {/each}
            {#if col.cartasEscritas > 0}
              <div class="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5">
                <span class="text-slate-600">Cartas escritas</span>
                <span class="font-semibold">{col.cartasEscritas}</span>
              </div>
            {/if}
          </div>
        {/if}
      </Card>

      <Card padding="md">
        <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Minhas metas</h2>
        <div class="flex gap-1.5 mb-2">
          <input
            bind:value={novaMeta}
            placeholder="Ex: fazer 3 turnos de TP essa semana"
            class="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            onkeydown={(e) => { if (e.key === 'Enter') criarMeta(); }}
          />
          <Button variant="primary" size="sm" loading={salvandoMeta} onclick={criarMeta}>+</Button>
        </div>
        {#if data.metasPessoais.length === 0}
          <p class="text-xs text-slate-400">Nenhuma meta pessoal ainda.</p>
        {:else}
          <div class="space-y-1.5">
            {#each data.metasPessoais as m (m.id)}
              <div class="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-2.5 py-1.5">
                <button onclick={() => alternarMeta(m)} disabled={ocupadoId === m.id} class="shrink-0 disabled:opacity-40">
                  <Icon nome={m.feito ? 'square-check' : 'square'} size={16} class={m.feito ? 'text-green-600' : 'text-slate-400'} />
                </button>
                <span class="flex-1 min-w-0 {m.feito ? 'line-through text-slate-400' : ''}">{m.texto}</span>
                <button onclick={() => apagarMeta(m.id)} disabled={ocupadoId === m.id} class="text-slate-400 hover:text-red-600 disabled:opacity-40 shrink-0">
                  <Icon nome="x" size={14} />
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </Card>
    {/if}

    {#each MODALIDADES as mod}
      {@const objs = porModalidade.get(mod.v) ?? []}
      {#if objs.length > 0}
        <div>
          <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
            <span><Icon nome={mod.icone} size={16} /></span> {mod.label}
          </h2>
          <div class="space-y-2">
            {#each objs as o}
              <Card padding="sm">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[10px] px-1.5 py-0.5 rounded {o.tipo === 'semana' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}">{o.tipo}</span>
                </div>
                <div class="font-medium text-sm">{o.titulo}</div>
                {#if o.descricao}<div class="text-xs text-slate-600 mt-0.5">{o.descricao}</div>{/if}
                {#if o.link}<a href={o.link} target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline"><Icon nome="link" size={14} /> abrir link</a>{/if}
              </Card>
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    {#if data.objetivos.length === 0}
      <Card padding="md">
        <div class="text-sm text-slate-500 text-center py-4">Nenhum objetivo publicado ainda.</div>
      </Card>
    {/if}
  {/if}
</div>

<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaAdmin from '$lib/components/MapaAdmin.svelte';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { Campanha } from '$lib/types';
  import type { QuadraGeo } from '$lib/server/queries';
  import type { CampanhaPeriodo, Publicacao, Suprimento } from './$types';

  let { data, form }: {
    data: {
      objetivos: Campanha[];
      periodos: CampanhaPeriodo[];
      ativa: CampanhaPeriodo | null;
      quadras: QuadraGeo[];
      quadrasConcluidasNoPeriodo: string[];
      conclusoesSemana: { semana: string; qtd: number }[];
      ritmo: {
        metaTotal: number | null;
        concluidas: number;
        faltam: number | null;
        diasDecorridos: number;
        diasRestantes: number;
        ritmoAtual: number;
        ritmoNecessario: number | null;
        status: 'ok' | 'atencao' | 'risco' | 'sem_meta';
        projecaoIso: string | null;
      } | null;
      publicacoes: Publicacao[];
      suprimentos: Suprimento[];
    };
    form: any;
  } = $props();

  let colorirMapa = $state<'campanha' | 'status'>('campanha');

  let sheetObj = $state(false);
  let editando: Campanha | null = $state(null);
  let sheetPeriodo = $state(false);
  let periodoEdit: CampanhaPeriodo | null = $state(null);
  let salvando = $state(false);
  let encerrando = $state(false);
  let reativandoId = $state<number | null>(null);
  let apagandoObjetivo = $state(false);
  let selecionadas = $state<Set<string>>(new Set());

  // Suprimento
  let sheetPublicacoes = $state(false);
  let novaPubNome = $state('');
  let novaPubCodigo = $state('');
  let salvandoPub = $state(false);
  let sheetAddSuprimento = $state(false);
  let pubParaSuprimento = $state('');
  let qtdNecessariaNova = $state(0);
  let salvandoSuprimento = $state(false);

  const publicacoesForaDaCampanha = $derived(
    data.publicacoes.filter((p) => p.ativo && !data.suprimentos.some((s) => s.publicacao_id === p.id))
  );

  let acaoEmCurso = $state<string | null>(null);
  function isBusy(key: string): boolean {
    return acaoEmCurso === key;
  }

  async function acaoRapida(action: string, params: Record<string, string>, key?: string) {
    if (key) acaoEmCurso = key;
    const fd = new FormData();
    for (const [k, v] of Object.entries(params)) fd.append(k, v);
    const res = await fetch(`?/${action}`, { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    if (key) acaoEmCurso = null;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Feito')); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function criarPublicacao() {
    if (!novaPubNome.trim()) return;
    salvandoPub = true;
    await acaoRapida('criarPublicacao', { nome: novaPubNome.trim(), codigo: novaPubCodigo.trim() });
    salvandoPub = false;
    novaPubNome = ''; novaPubCodigo = '';
  }

  function abrirAddSuprimento() {
    pubParaSuprimento = '';
    qtdNecessariaNova = 0;
    sheetAddSuprimento = true;
  }

  async function adicionarSuprimento() {
    if (!pubParaSuprimento || !data.ativa) return;
    salvandoSuprimento = true;
    await acaoRapida('criarSuprimento', {
      campanha_id: String(data.ativa.id),
      publicacao_id: pubParaSuprimento,
      qtd_necessaria: String(qtdNecessariaNova)
    });
    salvandoSuprimento = false;
    sheetAddSuprimento = false;
  }

  async function atualizarSuprimento(s: Suprimento, patch: Partial<Suprimento>) {
    const merged = { ...s, ...patch };
    await acaoRapida('atualizarSuprimento', {
      id: String(s.id),
      qtd_necessaria: String(merged.qtd_necessaria),
      qtd_em_maos: String(merged.qtd_em_maos),
      pedido_feito: merged.pedido_feito ? 'on' : '',
      notas: merged.notas ?? ''
    }, `suprimento:${s.id}`);
  }

  async function apagarSuprimento(id: number) {
    if (!confirm('Remover esse item do suprimento?')) return;
    await acaoRapida('apagarSuprimento', { id: String(id) }, `apagarSuprimento:${id}`);
  }

  // Alerta visual: falta suprimento e a campanha começa em <30 dias
  function suprimentoEmRisco(s: Suprimento): boolean {
    if (!data.ativa) return false;
    if (s.qtd_em_maos >= s.qtd_necessaria) return false;
    const diasParaComecar = Math.ceil((new Date(data.ativa.data_inicio + 'T12:00:00').getTime() - Date.now()) / 86400000);
    return diasParaComecar <= 30;
  }

  function novoObj() { editando = null; sheetObj = true; }
  function editarObj(o: Campanha) { editando = o; sheetObj = true; }
  function novoPeriodo() { periodoEdit = null; sheetPeriodo = true; }
  function editarPeriodo(p: CampanhaPeriodo) { periodoEdit = p; sheetPeriodo = true; }

  const MODALIDADES = [
    { v: 'casa', icone: 'home', label: 'Casa em casa' },
    { v: 'comercial', icone: 'store', label: 'Comercial' },
    { v: 'rural', icone: 'wheat', label: 'Rural' },
    { v: 'cartas', icone: 'mail', label: 'Cartas' },
    { v: 'telefone', icone: 'phone', label: 'Telefone' },
    { v: 'publico', icone: 'megaphone', label: 'Testemunho público' }
  ];

  const porModalidade = $derived.by(() => {
    const m = new Map<string, Campanha[]>();
    for (const o of data.objetivos) {
      const arr = m.get(o.modalidade) ?? [];
      arr.push(o);
      m.set(o.modalidade, arr);
    }
    return m;
  });

  const progressoCampanha = $derived.by(() => {
    if (!data.ativa) return null;
    const inicio = new Date(data.ativa.data_inicio + 'T12:00:00').getTime();
    const alvo = new Date(data.ativa.data_alvo + 'T12:00:00').getTime();
    const hoje = Date.now();
    const totalDias = Math.max(1, Math.ceil((alvo - inicio) / 86400000));
    const passados = Math.max(0, Math.min(totalDias, Math.ceil((hoje - inicio) / 86400000)));
    const ativasNoMapa = data.quadras.filter((q) => q.ativa).length;
    const concluidas = data.quadrasConcluidasNoPeriodo.length;
    return {
      diasTotais: totalDias,
      diasPassados: passados,
      diasRestantes: Math.max(0, totalDias - passados),
      pctTempo: Math.round((passados / totalDias) * 100),
      concluidas,
      restantes: Math.max(0, ativasNoMapa - concluidas),
      pctConclusao: ativasNoMapa === 0 ? 0 : Math.round((concluidas / ativasNoMapa) * 100)
    };
  });

  const maxConclusoes = $derived(
    Math.max(1, ...data.conclusoesSemana.map((s) => s.qtd))
  );
</script>

<div class="p-4 space-y-4">
  <div class="flex items-end justify-between flex-wrap gap-3">
    <div>
      <h1 class="text-2xl font-bold">Campanha</h1>
      {#if data.ativa}
        <p class="text-sm text-slate-500">{data.ativa.nome} · {data.ativa.data_inicio} → {data.ativa.data_alvo}</p>
      {:else}
        <p class="text-sm text-slate-500">Nenhuma campanha ativa</p>
      {/if}
    </div>
    <div class="flex gap-2 flex-wrap">
      <Button variant="secondary" onclick={() => (sheetPublicacoes = true)}><Icon nome="tag" size={14} /> Catálogo</Button>
      <Button variant="secondary" onclick={novoPeriodo}>+ Período</Button>
      <Button variant="primary" onclick={novoObj}>+ Objetivo</Button>
    </div>
  </div>

  {#if form?.erro}
    <div class="rounded-lg bg-red-50 p-3 text-sm text-red-700">{form.erro}</div>
  {/if}

  <!-- Card de período ativo -->
  {#if data.ativa && progressoCampanha}
    <Card padding="md">
      <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div class="font-semibold text-lg">{data.ativa.nome}</div>
          <div class="text-xs text-slate-500">
            {data.ativa.data_inicio} → {data.ativa.data_alvo}
            · {progressoCampanha.diasRestantes} dia(s) restante(s)
          </div>
        </div>
        <button onclick={() => editarPeriodo(data.ativa!)} class="text-sm text-primary-700 hover:underline"><Icon nome="pencil" size={14} /> Editar</button>
      </div>

      <!-- Progresso -->
      <div class="space-y-2">
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="text-slate-500">Quadras concluídas no período</span>
            <span class="font-medium">{progressoCampanha.concluidas} / {progressoCampanha.concluidas + progressoCampanha.restantes} ({progressoCampanha.pctConclusao}%)</span>
          </div>
          <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full bg-green-500" style:width="{progressoCampanha.pctConclusao}%"></div>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="text-slate-500">Tempo</span>
            <span class="font-medium">{progressoCampanha.pctTempo}%</span>
          </div>
          <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full bg-blue-500" style:width="{progressoCampanha.pctTempo}%"></div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 mt-3 text-center">
        <div class="rounded bg-green-50 p-2">
          <div class="font-bold text-green-700">{progressoCampanha.concluidas}</div>
          <div class="text-[10px] text-slate-500 uppercase">concluídas</div>
        </div>
        <div class="rounded bg-amber-50 p-2">
          <div class="font-bold text-amber-700">{progressoCampanha.restantes}</div>
          <div class="text-[10px] text-slate-500 uppercase">restantes</div>
        </div>
        <div class="rounded bg-slate-50 p-2">
          <div class="font-bold text-slate-700">{data.ativa.meta_semanal ?? '—'}</div>
          <div class="text-[10px] text-slate-500 uppercase">meta/sem</div>
        </div>
      </div>
    </Card>

    <!-- Termômetro de ritmo -->
    {#if data.ritmo}
      {@const r = data.ritmo}
      <Card padding="md">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h2 class="text-sm font-semibold text-slate-600 uppercase">Ritmo</h2>
          {#if r.status === 'ok'}
            <span class="text-[10px] px-2 py-0.5 rounded font-medium bg-green-100 text-green-700">Ritmo adequado</span>
          {:else if r.status === 'atencao'}
            <span class="text-[10px] px-2 py-0.5 rounded font-medium bg-amber-100 text-amber-700">Atenção</span>
          {:else if r.status === 'risco'}
            <span class="text-[10px] px-2 py-0.5 rounded font-medium bg-red-100 text-red-700">Risco de não concluir</span>
          {:else}
            <span class="text-[10px] px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-600">Sem meta definida</span>
          {/if}
        </div>

        {#if r.metaTotal != null}
          <div class="space-y-2">
            <div>
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-slate-500">Ritmo atual</span>
                <span class="font-medium">{r.ritmoAtual.toFixed(2)} quadra(s)/dia</span>
              </div>
              <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  class="h-full {r.status === 'ok' ? 'bg-green-500' : r.status === 'atencao' ? 'bg-amber-500' : 'bg-red-500'}"
                  style:width="{r.ritmoNecessario ? Math.min(100, Math.round((r.ritmoAtual / r.ritmoNecessario) * 100)) : 100}%"
                ></div>
              </div>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-500">Ritmo necessário</span>
              <span class="font-medium">{r.ritmoNecessario?.toFixed(2) ?? '—'} quadra(s)/dia</span>
            </div>
          </div>
          <div class="text-xs text-slate-500 mt-2">
            Faltam <strong>{r.faltam}</strong> de {r.metaTotal} (meta) · {r.diasRestantes} dia(s) restante(s)
            {#if r.projecaoIso}
              <br />No ritmo atual, término em ~{new Date(r.projecaoIso + 'T12:00:00').toLocaleDateString('pt-BR')}
            {/if}
          </div>
        {:else}
          <p class="text-xs text-slate-500">Defina uma meta semanal no período pra calcular o ritmo necessário.</p>
        {/if}
      </Card>
    {/if}

    <!-- Suprimento: checklist de publicações pra essa campanha -->
    <Card padding="md">
      <div class="flex items-center justify-between gap-2 mb-2">
        <h2 class="text-sm font-semibold text-slate-600 uppercase">Suprimento</h2>
        <div class="flex gap-2">
          <button onclick={() => (sheetPublicacoes = true)} class="text-xs text-slate-600 hover:underline">Catálogo</button>
          <button onclick={abrirAddSuprimento} class="text-xs text-primary-700 hover:underline"><Icon nome="plus" size={12} /> Adicionar</button>
        </div>
      </div>
      {#if data.suprimentos.length === 0}
        <p class="text-xs text-slate-400">Nenhuma publicação associada a essa campanha ainda.</p>
      {:else}
        <div class="space-y-2">
          {#each data.suprimentos as s (s.id)}
            {@const risco = suprimentoEmRisco(s)}
            <div class="rounded-lg border {risco ? 'border-red-300 bg-red-50' : 'border-slate-200'} p-2">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="font-medium text-sm">{s.publicacao_nome}</span>
                {#if risco}<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700"><Icon nome="alert" size={10} /> faltando, campanha perto</span>{/if}
                {#if isBusy(`suprimento:${s.id}`)}<Icon nome="loader" size={12} class="animate-spin text-slate-400 ml-auto" />{/if}
                <button disabled={isBusy(`apagarSuprimento:${s.id}`)} onclick={() => apagarSuprimento(s.id)} class="text-red-600 hover:underline disabled:opacity-40 {isBusy(`suprimento:${s.id}`) ? '' : 'ml-auto'}"><Icon nome={isBusy(`apagarSuprimento:${s.id}`) ? 'loader' : 'trash'} size={12} spin={isBusy(`apagarSuprimento:${s.id}`)} /></button>
              </div>
              <div class="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
                <label class="flex items-center gap-1">Necessária
                  <input type="number" min="0" value={s.qtd_necessaria} disabled={isBusy(`suprimento:${s.id}`)} onchange={(e) => atualizarSuprimento(s, { qtd_necessaria: Number((e.target as HTMLInputElement).value) })} class="w-16 rounded border border-slate-300 px-1.5 py-0.5 disabled:opacity-50" />
                </label>
                <label class="flex items-center gap-1">Em mãos
                  <input type="number" min="0" value={s.qtd_em_maos} disabled={isBusy(`suprimento:${s.id}`)} onchange={(e) => atualizarSuprimento(s, { qtd_em_maos: Number((e.target as HTMLInputElement).value) })} class="w-16 rounded border border-slate-300 px-1.5 py-0.5 disabled:opacity-50" />
                </label>
                <label class="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={s.pedido_feito} disabled={isBusy(`suprimento:${s.id}`)} onchange={(e) => atualizarSuprimento(s, { pedido_feito: (e.target as HTMLInputElement).checked })} class="w-3.5 h-3.5 rounded disabled:opacity-50" />
                  Pedido feito
                </label>
              </div>
              <input
                type="text"
                placeholder="Notas (ex: qtd sugerida por publicador)"
                value={s.notas ?? ''}
                disabled={isBusy(`suprimento:${s.id}`)}
                onchange={(e) => atualizarSuprimento(s, { notas: (e.target as HTMLInputElement).value })}
                class="w-full mt-1.5 rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-50"
              />
            </div>
          {/each}
        </div>
      {/if}
    </Card>

    <!-- Mapa do período -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-semibold text-slate-600 uppercase">Mapa do período</h2>
        <div class="flex gap-1">
          <button
            class="text-xs px-2 py-1 rounded border"
            class:bg-primary-100={colorirMapa === 'campanha'}
            class:border-primary-500={colorirMapa === 'campanha'}
            class:text-primary-700={colorirMapa === 'campanha'}
            class:border-slate-200={colorirMapa !== 'campanha'}
            class:text-slate-600={colorirMapa !== 'campanha'}
            onclick={() => (colorirMapa = 'campanha')}
          >Só a campanha</button>
          <button
            class="text-xs px-2 py-1 rounded border"
            class:bg-primary-100={colorirMapa === 'status'}
            class:border-primary-500={colorirMapa === 'status'}
            class:text-primary-700={colorirMapa === 'status'}
            class:border-slate-200={colorirMapa !== 'status'}
            class:text-slate-600={colorirMapa !== 'status'}
            onclick={() => (colorirMapa = 'status')}
          >Histórico completo</button>
        </div>
      </div>
      <MapaAdmin
        quadras={data.quadras}
        altura={400}
        colorirPor={colorirMapa}
        concluidasCampanha={data.quadrasConcluidasNoPeriodo}
        mostrarRotulos={false}
        bind:selecionadas
      />
      {#if colorirMapa === 'campanha'}
        <p class="text-xs text-slate-500 mt-1">Verde forte = concluída durante a campanha · cinza = resto (ignora conclusões antigas)</p>
      {:else}
        <p class="text-xs text-slate-500 mt-1">Coloração por recência de conclusão (inclui histórico anterior à campanha)</p>
      {/if}
    </div>

    <!-- Gráfico de barras semanal -->
    {#if data.conclusoesSemana.length > 0}
      <div>
        <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Conclusões por semana</h2>
        <Card padding="md">
          <div class="flex items-end gap-1 h-32">
            {#each data.conclusoesSemana as s}
              <div class="flex-1 flex flex-col items-center justify-end" title="Semana de {s.semana}: {s.qtd}">
                <div class="text-[10px] text-slate-500 mb-0.5">{s.qtd}</div>
                <div
                  class="w-full bg-green-500 rounded-t"
                  style:height="{Math.max(4, (s.qtd / maxConclusoes) * 100)}%"
                ></div>
              </div>
            {/each}
          </div>
          <div class="flex justify-between mt-2 text-[10px] text-slate-400">
            <span>{data.conclusoesSemana[0]?.semana}</span>
            <span>{data.conclusoesSemana[data.conclusoesSemana.length - 1]?.semana}</span>
          </div>
        </Card>
      </div>
    {/if}
  {:else}
    <Card padding="md">
      <div class="text-center py-4 text-slate-500">
        <Icon nome="calendar" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Sem campanha ativa</div>
        <div class="text-sm">Cria um período pra ver mapa do progresso e gráfico semanal.</div>
        <button onclick={novoPeriodo} class="mt-3 text-sm text-primary-700 hover:underline">+ Criar período</button>
      </div>
    </Card>
  {/if}

  <!-- Encerrar a campanha ativa (vira histórico, nunca deleta) -->
  {#if data.ativa}
    <form method="POST" action="?/desativarPeriodo" use:enhance={() => {
      encerrando = true;
      return async ({ result, update }) => {
        await update();
        encerrando = false;
        if (result.type === 'success') { toast.success('Campanha encerrada — foi pro histórico'); await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      };
    }} onsubmit={(e) => { if (!confirm(`Encerrar "${data.ativa!.nome}"? Ela vai pro histórico com os resultados (nada é apagado).`)) e.preventDefault(); }}>
      <Button variant="secondary" type="submit" loading={encerrando} class="w-full">Encerrar campanha ativa</Button>
    </form>
  {/if}

  <!-- Histórico com resultados (metas cumpridas?) -->
  {#if data.historico.length > 0}
    <div>
      <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Histórico ({data.historico.length})</h2>
      <div class="space-y-2">
        {#each data.historico as p}
          {@const pct = p.meta_total ? Math.round((p.concluidas / p.meta_total) * 100) : null}
          <Card padding="sm">
            <div class="flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium">{p.nome}</span>
                  {#if pct !== null}
                    <span class="text-[10px] px-1.5 py-0.5 rounded font-medium {pct >= 100 ? 'bg-green-100 text-green-700' : pct >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}">
                      {pct}% da meta
                    </span>
                  {/if}
                </div>
                <div class="text-xs text-slate-500 mt-0.5">
                  {new Date(p.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')} → {new Date(p.data_alvo + 'T12:00:00').toLocaleDateString('pt-BR')}
                  · <strong>{p.concluidas}</strong> concluída(s){p.meta_total ? ` de ${p.meta_total} (meta)` : ''}
                  {#if p.qtd_objetivos > 0}· {p.qtd_objetivos} objetivo(s){/if}
                </div>
                {#if p.meta_total}
                  <div class="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden max-w-xs">
                    <div class="h-full {pct !== null && pct >= 100 ? 'bg-green-500' : 'bg-amber-500'}" style:width="{Math.min(100, pct ?? 0)}%"></div>
                  </div>
                {/if}
              </div>
              <div class="flex flex-col gap-1 items-end shrink-0">
                <form method="POST" action="?/ativarPeriodo" use:enhance={() => {
                  reativandoId = p.id;
                  return async ({ result, update }) => {
                    await update();
                    reativandoId = null;
                    if (result.type === 'success') { toast.success('Ativada'); await invalidateAll(); }
                  };
                }}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" disabled={reativandoId === p.id} class="text-xs text-primary-700 hover:underline disabled:opacity-40"><Icon nome={reativandoId === p.id ? 'loader' : 'play'} size={12} spin={reativandoId === p.id} /> Reativar</button>
                </form>
                <button onclick={() => editarPeriodo(p)} class="text-xs text-slate-500 hover:underline"><Icon nome="pencil" size={14} /> Editar</button>
              </div>
            </div>
          </Card>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Objetivos por modalidade -->
  <div>
    <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Objetivos</h2>
    <div class="space-y-3">
      {#each MODALIDADES as mod}
        {@const objs = porModalidade.get(mod.v) ?? []}
        {#if objs.length > 0}
          <div>
            <h3 class="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-2">
              <span><Icon nome={mod.icone} size={16} /></span> {mod.label}
              <span class="text-slate-400 font-normal">· {objs.length}</span>
            </h3>
            <div class="space-y-2">
              {#each objs as o}
                <Card padding="sm">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-[10px] px-1.5 py-0.5 rounded {o.tipo === 'semana' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}">{o.tipo}</span>
                        {#if o.publico}<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">público</span>{/if}
                      </div>
                      <div class="font-medium text-sm">{o.titulo}</div>
                      {#if o.descricao}<div class="text-xs text-slate-600 mt-0.5">{o.descricao}</div>{/if}
                      {#if o.link}<a href={o.link} target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline"><Icon nome="link" size={14} /> link</a>{/if}
                    </div>
                    <button onclick={() => editarObj(o)} class="text-xs text-primary-700 hover:underline"><Icon nome="pencil" size={14} /> Editar</button>
                  </div>
                </Card>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
      {#if data.objetivos.length === 0}
        <div class="text-center text-slate-400 py-6 text-sm">
          Nenhum objetivo cadastrado.
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Sheet: Editar período -->
<BottomSheet bind:open={sheetPeriodo} title={periodoEdit ? 'Editar período' : 'Novo período'}>
  <form
    method="POST"
    action="?/salvarPeriodo"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success('Salvo');
          sheetPeriodo = false;
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    {#if periodoEdit}<input type="hidden" name="id" value={periodoEdit.id} />{/if}
    <div>
      <label for="nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="nome" name="nome" required value={periodoEdit?.nome ?? ''} placeholder="Ex: Campanha 2026" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="data_inicio" class="block text-sm font-medium mb-1">Início</label>
        <input id="data_inicio" name="data_inicio" type="date" required value={periodoEdit?.data_inicio ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label for="data_alvo" class="block text-sm font-medium mb-1">Alvo</label>
        <input id="data_alvo" name="data_alvo" type="date" required value={periodoEdit?.data_alvo ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
    </div>
    <div>
      <label for="meta_semanal" class="block text-sm font-medium mb-1">Meta semanal (opcional)</label>
      <input id="meta_semanal" name="meta_semanal" type="number" min="0" value={periodoEdit?.meta_semanal ?? ''} placeholder="Ex: 5 quadras/semana" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="publicacao_id" class="block text-sm font-medium mb-1">Publicação principal (opcional)</label>
      <select id="publicacao_id" name="publicacao_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={periodoEdit?.publicacao_id ?? ''}>
        <option value="">—</option>
        {#each data.publicacoes.filter((p) => p.ativo) as p}<option value={p.id}>{p.nome}</option>{/each}
      </select>
    </div>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetPeriodo = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Salvar</Button>
    </div>
  </form>
</BottomSheet>

<!-- Sheet: Editar objetivo -->
<BottomSheet bind:open={sheetObj} title={editando ? 'Editar objetivo' : 'Novo objetivo'}>
  <form
    method="POST"
    action={editando ? '?/atualizar' : '?/criar'}
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success(editando ? 'Atualizado' : 'Criado');
          sheetObj = false;
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-4"
  >
    {#if editando}<input type="hidden" name="id" value={editando.id} />{/if}
    {#if !editando}
      <div class="grid grid-cols-2 gap-3">
        <div>
          <span class="block text-sm font-medium mb-1">Tipo</span>
          <div class="grid grid-cols-2 gap-1">
            {#each ['geral', 'semana'] as t}
              <label class="cursor-pointer">
                <input type="radio" name="tipo" value={t} checked={t === 'geral'} required class="peer sr-only" />
                <div class="text-center text-sm px-3 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">{t}</div>
              </label>
            {/each}
          </div>
        </div>
        <div>
          <label for="modalidade" class="block text-sm font-medium mb-1">Modalidade</label>
          <select name="modalidade" id="modalidade" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {#each MODALIDADES as m}
              <option value={m.v}>{m.label}</option>
            {/each}
          </select>
        </div>
      </div>
    {/if}
    <div>
      <label for="titulo" class="block text-sm font-medium mb-1">Título</label>
      <input id="titulo" name="titulo" required value={editando?.titulo ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="descricao" class="block text-sm font-medium mb-1">Descrição</label>
      <textarea id="descricao" name="descricao" rows="3" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{editando?.descricao ?? ''}</textarea>
    </div>
    <div>
      <label for="link" class="block text-sm font-medium mb-1">Link (opcional)</label>
      <input id="link" name="link" type="url" value={editando?.link ?? ''} placeholder="https://..." class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
      <input type="checkbox" name="publico" checked={editando?.publico ?? false} class="w-4 h-4 rounded" />
      <span class="text-sm">Visível no painel público</span>
    </label>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetObj = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">
        {editando ? 'Salvar' : 'Criar'}
      </Button>
    </div>
  </form>
  {#if editando}
    <form
      method="POST"
      action="?/excluir"
      use:enhance={() => {
        apagandoObjetivo = true;
        return async ({ result, update }) => {
          await update();
          apagandoObjetivo = false;
          if (result.type === 'success') {
            toast.success('Excluído');
            sheetObj = false;
            await invalidateAll();
          }
        };
      }}
      onsubmit={(e) => { if (!confirm('Excluir esse objetivo?')) e.preventDefault(); }}
      class="mt-3"
    >
      <input type="hidden" name="id" value={editando.id} />
      <button type="submit" disabled={apagandoObjetivo} class="text-sm text-red-700 hover:underline disabled:opacity-40"><Icon nome={apagandoObjetivo ? 'loader' : 'trash'} size={14} spin={apagandoObjetivo} /> Excluir</button>
    </form>
  {/if}
</BottomSheet>

<!-- Sheet: Catálogo de publicações -->
<BottomSheet bind:open={sheetPublicacoes} title="Catálogo de publicações">
  <div class="space-y-3">
    <a href="/publicacoes" class="block text-xs text-primary-700 hover:underline">
      Catálogo completo (categorias, estoque, imagem de capa) em Publicações →
    </a>
    <div class="flex gap-2">
      <input bind:value={novaPubNome} placeholder="Nome (ex: Convite da Celebração)" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input bind:value={novaPubCodigo} placeholder="Código (opcional)" class="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <Button variant="primary" loading={salvandoPub} onclick={criarPublicacao}>+</Button>
    </div>
    <div class="space-y-1 max-h-80 overflow-y-auto">
      {#each data.publicacoes as p (p.id)}
        <div class="flex items-center gap-2 text-sm bg-slate-50 rounded p-2">
          <span class="flex-1">{p.nome}{#if p.codigo} <span class="text-xs text-slate-400">({p.codigo})</span>{/if}</span>
          {#if !p.ativo}<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">inativa</span>{/if}
          <button
            disabled={isBusy(`pub:${p.id}`)}
            onclick={() => acaoRapida('atualizarPublicacao', { id: String(p.id), nome: p.nome, codigo: p.codigo ?? '', ativo: p.ativo ? '' : 'on' }, `pub:${p.id}`)}
            class="text-xs text-primary-700 hover:underline disabled:opacity-40"
          ><Icon nome={isBusy(`pub:${p.id}`) ? 'loader' : (p.ativo ? 'ban' : 'undo')} size={12} spin={isBusy(`pub:${p.id}`)} /> {p.ativo ? 'Desativar' : 'Reativar'}</button>
        </div>
      {/each}
      {#if data.publicacoes.length === 0}
        <p class="text-xs text-slate-400 text-center py-4">Nenhuma publicação cadastrada.</p>
      {/if}
    </div>
  </div>
</BottomSheet>

<!-- Sheet: Adicionar suprimento à campanha ativa -->
<BottomSheet bind:open={sheetAddSuprimento} title="Adicionar ao suprimento">
  <div class="space-y-3">
    <div>
      <label for="pub-suprimento" class="block text-sm font-medium mb-1">Publicação</label>
      <select id="pub-suprimento" bind:value={pubParaSuprimento} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">— selecione —</option>
        {#each publicacoesForaDaCampanha as p}<option value={p.id}>{p.nome}</option>{/each}
      </select>
      {#if publicacoesForaDaCampanha.length === 0}
        <p class="text-xs text-slate-400 mt-1">Todas as publicações ativas já estão no suprimento (ou cadastre uma nova no Catálogo).</p>
      {/if}
    </div>
    <div>
      <label for="qtd-necessaria-nova" class="block text-sm font-medium mb-1">Quantidade necessária</label>
      <input id="qtd-necessaria-nova" type="number" min="0" bind:value={qtdNecessariaNova} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <Button variant="primary" class="w-full" loading={salvandoSuprimento} disabled={!pubParaSuprimento} onclick={adicionarSuprimento}>Adicionar</Button>
  </div>
</BottomSheet>

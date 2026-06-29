<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaAdmin from '$lib/components/MapaAdmin.svelte';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { Campanha } from '$lib/types';
  import type { QuadraGeo } from '$lib/server/queries';
  import type { CampanhaPeriodo } from './$types';

  let { data, form }: {
    data: {
      objetivos: Campanha[];
      periodos: CampanhaPeriodo[];
      ativa: CampanhaPeriodo | null;
      quadras: QuadraGeo[];
      quadrasConcluidasNoPeriodo: string[];
      conclusoesSemana: { semana: string; qtd: number }[];
    };
    form: any;
  } = $props();

  let sheetObj = $state(false);
  let editando: Campanha | null = $state(null);
  let sheetPeriodo = $state(false);
  let periodoEdit: CampanhaPeriodo | null = $state(null);
  let salvando = $state(false);
  let selecionadas = $state<Set<string>>(new Set());

  function novoObj() { editando = null; sheetObj = true; }
  function editarObj(o: Campanha) { editando = o; sheetObj = true; }
  function novoPeriodo() { periodoEdit = null; sheetPeriodo = true; }
  function editarPeriodo(p: CampanhaPeriodo) { periodoEdit = p; sheetPeriodo = true; }

  const MODALIDADES = [
    { v: 'casa', label: 'Casa em casa', icon: '🏠' },
    { v: 'comercial', label: 'Comercial', icon: '🏪' },
    { v: 'rural', label: 'Rural', icon: '🌾' },
    { v: 'cartas', label: 'Cartas', icon: '✉' },
    { v: 'telefone', label: 'Telefone', icon: '📞' },
    { v: 'publico', label: 'Testemunho público', icon: '📢' }
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

  // Quadras destacadas no mapa: as concluídas no período viram verdes (sobre status default)
  const quadrasComStatusCampanha = $derived.by(() => {
    if (!data.ativa) return data.quadras;
    const idsConcluidas = new Set(data.quadrasConcluidasNoPeriodo);
    return data.quadras.map((q) => ({
      ...q,
      // Substitui status pra que o MapaAdmin pinte verde apenas as do período
      status: idsConcluidas.has(q.id) ? 'concluido' : (!q.ativa ? 'inativa' : 'pendente')
    })) as QuadraGeo[];
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
    <div class="flex gap-2">
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
        <button onclick={() => editarPeriodo(data.ativa!)} class="text-sm text-primary-700 hover:underline">Editar</button>
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

    <!-- Mapa do período -->
    <div>
      <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Mapa do período</h2>
      <MapaAdmin
        quadras={quadrasComStatusCampanha}
        altura={400}
        colorirPor="status"
        mostrarRotulos={false}
        bind:selecionadas
      />
      <p class="text-xs text-slate-500 mt-1">Verde = concluída durante a campanha · âmbar = pendente · cinza = inativa</p>
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
        <div class="text-3xl mb-2">📅</div>
        <div class="font-medium">Sem campanha ativa</div>
        <div class="text-sm">Cria um período pra ver mapa do progresso e gráfico semanal.</div>
        <button onclick={novoPeriodo} class="mt-3 text-sm text-primary-700 hover:underline">+ Criar período</button>
      </div>
    </Card>
  {/if}

  <!-- Lista de outros períodos (só pra trocar de ativo) -->
  {#if data.periodos.length > 0}
    <div>
      <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Histórico</h2>
      <div class="space-y-2">
        {#each data.periodos as p}
          <Card padding="sm">
            <div class="flex items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{p.nome}</span>
                  {#if p.ativa}<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">ativa</span>{/if}
                </div>
                <div class="text-xs text-slate-500">{p.data_inicio} → {p.data_alvo}</div>
              </div>
              <div class="flex gap-1">
                {#if !p.ativa}
                  <form method="POST" action="?/ativarPeriodo" use:enhance={() => async ({ result, update }) => {
                    await update();
                    if (result.type === 'success') { toast.success('Ativada'); await invalidateAll(); }
                  }}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" class="text-xs text-primary-700 hover:underline">Ativar</button>
                  </form>
                {/if}
                <button onclick={() => editarPeriodo(p)} class="text-xs text-slate-500 hover:underline">Editar</button>
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
              <span>{mod.icon}</span> {mod.label}
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
                      {#if o.link}<a href={o.link} target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline">🔗 link</a>{/if}
                    </div>
                    <button onclick={() => editarObj(o)} class="text-xs text-primary-700 hover:underline">Editar</button>
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
              <option value={m.v}>{m.icon} {m.label}</option>
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
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') {
          toast.success('Excluído');
          sheetObj = false;
          await invalidateAll();
        }
      }}
      onsubmit={(e) => { if (!confirm('Excluir esse objetivo?')) e.preventDefault(); }}
      class="mt-3"
    >
      <input type="hidden" name="id" value={editando.id} />
      <button type="submit" class="text-sm text-red-700 hover:underline">🗑 Excluir</button>
    </form>
  {/if}
</BottomSheet>

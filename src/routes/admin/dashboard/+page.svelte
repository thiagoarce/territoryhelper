<script lang="ts">
  // E5: Dashboard de saúde do território — leitura pura, sem actions.
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import type { QuadraEsquecida, CicloTerrMedia } from './+page';

  let { data }: {
    data: {
      totalQuadras: number;
      totalTerritorios: number;
      cobertas12m: number;
      esquecidas: QuadraEsquecida[];
      cicloGlobalDias: number | null;
      cicloPorTerritorio: CicloTerrMedia[];
      conclusoesPorMes: { mes: string; qtd: number }[];
      conclusoesPorDiaSemana: { fimDeSemana: number; meioDaSemana: number };
      funil: { designadas: number; arranjo: number; livres: number };
      cacheInfo?: { deCache: boolean; gravadoEm: number };
    };
  } = $props();

  const pctCobertura = $derived(
    data.totalQuadras > 0 ? Math.round((data.cobertas12m / data.totalQuadras) * 100) : 0
  );
  const maxMes = $derived(Math.max(1, ...data.conclusoesPorMes.map((m) => m.qtd)));

  // Comparação justa: fim de semana só tem 2 dias (sáb+dom) contra 5 de
  // meio de semana — comparar total bruto sempre favoreceria "meio da
  // semana" só pela quantidade de dias. A taxa por dia é o que realmente
  // diz onde o pessoal está indo mais.
  const taxaFimDeSemana = $derived(data.conclusoesPorDiaSemana.fimDeSemana / 2);
  const taxaMeioDaSemana = $derived(data.conclusoesPorDiaSemana.meioDaSemana / 5);
  const maxTaxa = $derived(Math.max(0.01, taxaFimDeSemana, taxaMeioDaSemana));

  function fmtMes(m: string): string {
    const [y, mm] = m.split('-');
    return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(mm) - 1] + '/' + y.substring(2);
  }
  function fmtCiclo(dias: number | null): string {
    if (dias === null) return '—';
    if (dias >= 60) return `${Math.round(dias / 30)} meses`;
    return `${dias} dias`;
  }
</script>

<svelte:head><title>Dashboard — Território</title></svelte:head>

<div class="p-4 space-y-4 max-w-5xl mx-auto">
  <div>
    <h1 class="text-2xl font-bold">Dashboard</h1>
    <p class="text-sm text-slate-500 mt-1">Saúde do território — cobertura, ritmo e o que está ficando pra trás.</p>
    <CacheInfoBadge cacheInfo={data.cacheInfo} />
  </div>

  <!-- Cards de resumo -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <Card padding="md">
      <div class="text-xs uppercase tracking-wider text-slate-500">Cobertura 12 meses</div>
      <div class="text-3xl font-bold mt-1 {pctCobertura >= 80 ? 'text-green-600' : pctCobertura >= 50 ? 'text-amber-600' : 'text-red-600'}">{pctCobertura}%</div>
      <div class="text-xs text-slate-500 mt-0.5">{data.cobertas12m} de {data.totalQuadras} quadras</div>
    </Card>
    <Card padding="md">
      <div class="text-xs uppercase tracking-wider text-slate-500">Ciclo médio</div>
      <div class="text-3xl font-bold mt-1">{fmtCiclo(data.cicloGlobalDias)}</div>
      <div class="text-xs text-slate-500 mt-0.5">entre conclusões da mesma quadra</div>
    </Card>
    <Card padding="md">
      <div class="text-xs uppercase tracking-wider text-slate-500">Território</div>
      <div class="text-3xl font-bold mt-1">{data.totalTerritorios}</div>
      <div class="text-xs text-slate-500 mt-0.5">territórios · {data.totalQuadras} quadras ativas</div>
    </Card>
    <Card padding="md">
      <div class="text-xs uppercase tracking-wider text-slate-500">Agora</div>
      <div class="mt-1 space-y-0.5 text-sm">
        <div><strong>{data.funil.designadas}</strong> designadas</div>
        <div><strong>{data.funil.arranjo}</strong> em arranjo futuro</div>
        <div><strong>{data.funil.livres}</strong> livres</div>
      </div>
    </Card>
  </div>

  <!-- Conclusões por mês -->
  <Card padding="md">
    <h2 class="text-sm font-semibold text-slate-600 uppercase mb-3">Conclusões de quadra por mês</h2>
    <div class="flex items-end gap-1 h-32">
      {#each data.conclusoesPorMes as m (m.mes)}
        <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div class="text-[10px] text-slate-500">{m.qtd || ''}</div>
          <div class="w-full rounded-t bg-primary-500" style:height="{(m.qtd / maxMes) * 88}px"></div>
          <div class="text-[9px] text-slate-400 truncate">{fmtMes(m.mes)}</div>
        </div>
      {/each}
    </div>
  </Card>

  <!-- Fim de semana vs meio da semana -->
  <Card padding="md">
    <h2 class="text-sm font-semibold text-slate-600 uppercase mb-1">Fim de semana vs. meio da semana</h2>
    <p class="text-[11px] text-slate-400 mb-3">Taxa por dia (fim de semana tem só 2 dias contra 5 — comparar o total bruto enganaria).</p>
    <div class="space-y-2">
      <div class="flex items-center gap-2 text-sm">
        <span class="w-28 shrink-0 text-slate-600">Fim de semana</span>
        <div class="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full bg-primary-500" style:width="{(taxaFimDeSemana / maxTaxa) * 100}%"></div>
        </div>
        <span class="w-24 shrink-0 text-right text-xs text-slate-500">{taxaFimDeSemana.toFixed(1)}/dia ({data.conclusoesPorDiaSemana.fimDeSemana})</span>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="w-28 shrink-0 text-slate-600">Meio da semana</span>
        <div class="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full bg-primary-300" style:width="{(taxaMeioDaSemana / maxTaxa) * 100}%"></div>
        </div>
        <span class="w-24 shrink-0 text-right text-xs text-slate-500">{taxaMeioDaSemana.toFixed(1)}/dia ({data.conclusoesPorDiaSemana.meioDaSemana})</span>
      </div>
    </div>
  </Card>

  <div class="grid md:grid-cols-2 gap-3">
    <!-- Esquecidas -->
    <Card padding="md">
      <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2"><Icon nome="hourglass" size={14} /> Há mais tempo sem trabalhar</h2>
      <ul class="divide-y divide-slate-100">
        {#each data.esquecidas as q (q.id)}
          <li class="py-1.5 flex items-center gap-2 text-sm">
            <a href="/publicador/quadra/{encodeURIComponent(q.id)}" class="font-mono font-medium text-primary-700 hover:underline">{q.id}</a>
            {#if q.territorio_id}<span class="text-xs text-slate-400">terr. {q.territorio_id}</span>{/if}
            <span class="ml-auto text-xs {q.dias === null ? 'text-red-600 font-medium' : q.dias > 365 ? 'text-amber-700' : 'text-slate-500'}">
              {q.dias === null ? 'nunca concluída' : `há ${q.dias > 60 ? Math.round(q.dias / 30) + ' meses' : q.dias + ' dias'}`}
            </span>
          </li>
        {:else}
          <li class="py-4 text-center text-sm text-slate-400">Sem quadras ativas.</li>
        {/each}
      </ul>
    </Card>

    <!-- Ciclo por território -->
    <Card padding="md">
      <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2"><Icon nome="refresh" size={14} /> Ciclo médio por território</h2>
      <ul class="divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {#each data.cicloPorTerritorio as t (t.territorio_id)}
          <li class="py-1.5 flex items-center gap-2 text-sm">
            <span class="font-medium">{t.nome?.trim() || `Território ${t.territorio_id}`}</span>
            <span class="text-xs text-slate-400">{t.quadras} quadras</span>
            <span class="ml-auto text-xs {t.mediaDias === null ? 'text-slate-400' : 'text-slate-600 font-medium'}">{fmtCiclo(t.mediaDias)}</span>
          </li>
        {/each}
      </ul>
      <p class="text-[11px] text-slate-400 mt-2">— = ainda não há duas conclusões da mesma quadra pra medir.</p>
    </Card>
  </div>
</div>

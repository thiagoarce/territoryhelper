<script lang="ts">
  // Escala de saídas de campo, imprimível. O "PDF" é o print do
  // navegador (Imprimir → Salvar como PDF) — mesmo padrão do S-13 e dos
  // cartões S-12, zero dependência nova.
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import { ocorrenciasEntre, arranjoAindaVale, rangeEscala, DIAS_SEMANA } from '$lib/arranjos';
  import { hojeIsoBrasil } from '$lib/utils/data';
  import type { DadosEscala, ArranjoEscala } from './+page';

  let { data }: { data: DadosEscala & { cacheInfo?: { deCache: boolean; gravadoEm: number } } } = $props();

  let tipo = $state<'semana' | 'mes'>('mes');
  let offset = $state(0);

  const periodo = $derived(rangeEscala(tipo, offset));
  const hoje = hojeIsoBrasil();

  const nomeModalidade = $derived(new Map(data.modalidades.map((m) => [m.id, m.nome])));

  // Arranjo INATIVO cujo calendário já passou = saída que aconteceu e foi
  // finalizada — tem que sair na escala de um período fechado. Inativo que
  // ainda "venceria" = cancelado antes da hora, esse fica de fora. Mesma
  // regra que /admin/designacoes usa pra derivar concluída vs cancelada.
  // (ocorrenciasEntre pula !ativo, por isso a cópia com ativo: true.)
  const paraExpandir = $derived(
    data.arranjos
      .filter((a) => a.ativo || !arranjoAindaVale(a, hoje))
      .map((a) => ({ ...a, ativo: true }) as ArranjoEscala)
  );
  const ocorrencias = $derived(ocorrenciasEntre(paraExpandir, periodo.isoIni, periodo.isoFim));

  function fmtData(iso: string): string {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  }
  function fmtDia(iso: string): string {
    return DIAS_SEMANA[new Date(iso + 'T12:00:00').getDay()];
  }
  // time do Postgres vem "08:30:00" — no papel só interessa hh:mm
  function fmtHora(h: string | null): string {
    return h ? h.slice(0, 5) : '';
  }
  function horario(a: ArranjoEscala): string {
    const ini = fmtHora(a.hora_inicio);
    const fim = fmtHora(a.hora_fim);
    if (ini && fim) return `${ini} – ${fim}`;
    return ini || fim || '—';
  }
  function titulo(a: ArranjoEscala): string {
    return a.nome?.trim() || nomeModalidade.get(a.modalidade_id) || 'Saída de campo';
  }
  function dirigente(a: ArranjoEscala): string {
    return (a.dirigente_id && data.nomePorPublicador[a.dirigente_id]) || '—';
  }
</script>

<svelte:head><title>Escala de saídas — {periodo.label}</title></svelte:head>

<div class="p-4 no-print space-y-3">
  <h1 class="text-2xl font-bold">Escala de saídas de campo</h1>
  <p class="text-sm text-slate-500">
    Folha imprimível das saídas do período — data, horário, ponto de encontro e dirigente.
    Imprimir → Salvar como PDF.
  </p>
  <CacheInfoBadge cacheInfo={data.cacheInfo} />

  <div class="flex items-center gap-3 flex-wrap">
    <div class="inline-flex rounded-lg border border-slate-300 overflow-hidden">
      <button
        type="button"
        class="px-3 py-2 text-sm {tipo === 'semana' ? 'bg-primary-600 text-white' : 'bg-white hover:bg-slate-50'}"
        onclick={() => { tipo = 'semana'; offset = 0; }}
      >Semana</button>
      <button
        type="button"
        class="px-3 py-2 text-sm border-l border-slate-300 {tipo === 'mes' ? 'bg-primary-600 text-white' : 'bg-white hover:bg-slate-50'}"
        onclick={() => { tipo = 'mes'; offset = 0; }}
      >Mês</button>
    </div>

    <div class="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label="Período anterior"
        class="rounded-lg border border-slate-300 px-2 py-2 hover:bg-slate-50"
        onclick={() => offset--}
      ><Icon nome="chevron-left" size={16} /></button>
      <span class="text-sm font-medium min-w-56 text-center">{periodo.label}</span>
      <button
        type="button"
        aria-label="Próximo período"
        class="rounded-lg border border-slate-300 px-2 py-2 hover:bg-slate-50"
        onclick={() => offset++}
      ><Icon nome="chevron-right" size={16} /></button>
      {#if offset !== 0}
        <button type="button" class="text-xs text-primary-700 underline ml-1" onclick={() => (offset = 0)}>hoje</button>
      {/if}
    </div>

    <span class="text-sm text-slate-500">{ocorrencias.length} saída(s)</span>

    {#if ocorrencias.length > 0}
      <Button variant="secondary" onclick={() => window.print()}>
        <Icon nome="clipboard" size={14} /> Imprimir / Salvar PDF
      </Button>
    {/if}
  </div>
</div>

<div class="folha-escala mx-auto max-w-4xl bg-white p-6">
  <header class="text-center border-b-2 border-slate-800 pb-2 mb-4">
    <h2 class="text-2xl font-bold tracking-tight">Escala de Saídas de Campo</h2>
    <p class="text-sm text-slate-600 mt-0.5">{periodo.label}</p>
  </header>

  {#if ocorrencias.length === 0}
    <p class="text-center text-slate-500 py-10">Nenhuma saída cadastrada neste período.</p>
  {:else}
    <table class="tabela-escala w-full border-collapse">
      <thead>
        <tr>
          <th class="w-28">Data</th>
          <th>Saída</th>
          <th class="w-28">Horário</th>
          <th>Ponto de encontro</th>
          <th class="w-44">Dirigente</th>
        </tr>
      </thead>
      <tbody>
        {#each ocorrencias as oc (oc.arranjo.id + '@' + oc.data)}
          <tr>
            <td class="whitespace-nowrap">{fmtData(oc.data)} <span class="text-slate-500">{fmtDia(oc.data)}</span></td>
            <td class="font-medium">{titulo(oc.arranjo)}</td>
            <td class="whitespace-nowrap">{horario(oc.arranjo)}</td>
            <td>{oc.arranjo.local_endereco || '—'}</td>
            <td>{dirigente(oc.arranjo)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <p class="rodape text-xs text-slate-400 mt-4">Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
</div>

<style>
  .tabela-escala th,
  .tabela-escala td {
    border: 1px solid #0f172a;
    padding: 5px 8px;
    font-size: 13px;
    text-align: left;
    vertical-align: top;
  }
  .tabela-escala thead th {
    background: #e2e8f0;
    font-weight: 600;
  }
  /* Cabeçalho repete em toda página impressa e nenhuma saída quebra no
     meio (linha cortada por quebra de página fica ilegível). */
  .tabela-escala thead {
    display: table-header-group;
  }
  .tabela-escala tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  @media print {
    .no-print,
    :global(header),
    :global(nav),
    :global(aside) {
      display: none !important;
    }
    :global(main) {
      padding: 0 !important;
    }
    :global(body) {
      background: #fff !important;
    }
    .folha-escala {
      max-width: none;
      padding: 0;
    }
    .tabela-escala thead th {
      background: #e2e8f0 !important;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
</style>

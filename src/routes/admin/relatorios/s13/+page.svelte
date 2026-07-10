<script lang="ts">
  // E2: réplica imprimível do S-13-T. O "PDF" é o print do navegador
  // (Imprimir → Salvar como PDF) — zero dependência nova, e o CSS
  // @media print esconde o chrome do app.
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import { linhaDoAno, type CicloTerritorio } from '$lib/s13';
  import type { TerritorioComCiclos } from './+page';

  let { data }: {
    data: {
      territorios: TerritorioComCiclos[];
      anosDisponiveis: number[];
      anoAtual: number;
      cacheInfo?: { deCache: boolean; gravadoEm: number };
    };
  } = $props();

  // valor inicial de propósito: o seletor parte do ano corrente e vira estado local
  // svelte-ignore state_referenced_locally
  let ano = $state(data.anoAtual);
  const anos = $derived([...new Set([data.anoAtual, ...data.anosDisponiveis])].sort((a, b) => b - a));

  const COLUNAS = 4; // como o formulário

  interface LinhaImpressa {
    terr: string;
    nome: string | null;
    ultima: string | null;
    ciclos: CicloTerritorio[];
    continuacao: boolean;
  }

  // Uma linha do formulário comporta 4 designações; excedente vira
  // linha de continuação do mesmo território.
  const linhas = $derived.by(() => {
    const out: LinhaImpressa[] = [];
    for (const t of data.territorios) {
      const l = linhaDoAno({ id: t.id, nome: t.nome }, t.ciclos, ano);
      if (l.ciclos.length === 0) {
        out.push({ terr: t.id, nome: t.nome, ultima: l.ultimaConclusaoAnterior, ciclos: [], continuacao: false });
        continue;
      }
      for (let i = 0; i < l.ciclos.length; i += COLUNAS) {
        out.push({
          terr: t.id,
          nome: t.nome,
          ultima: l.ultimaConclusaoAnterior,
          ciclos: l.ciclos.slice(i, i + COLUNAS),
          continuacao: i > 0
        });
      }
    }
    return out;
  });

  function fmt(d: string | null): string {
    if (!d) return '';
    const [y, m, dia] = d.split('-');
    return `${dia}/${m}/${y.substring(2)}`;
  }
</script>

<svelte:head><title>Relatório S-13 — {ano}</title></svelte:head>

<div class="p-4 no-print">
  <h1 class="text-2xl font-bold">Registro de designação de território (S-13)</h1>
  <p class="text-sm text-slate-500 mt-1">
    Ciclos calculados do histórico: a designação abre na primeira quadra
    designada do território e fecha quando a última quadra é concluída.
  </p>
  <CacheInfoBadge cacheInfo={data.cacheInfo} />
  <div class="mt-3 flex items-center gap-3 flex-wrap">
    <label for="s13-ano" class="text-sm font-medium">Ano de serviço</label>
    <select id="s13-ano" bind:value={ano} class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
      {#each anos as a}<option value={a}>{a} (set/{a - 1} – ago/{a})</option>{/each}
    </select>
    <Button variant="primary" onclick={() => window.print()}><Icon nome="clipboard" size={14} /> Imprimir / Salvar PDF</Button>
  </div>
</div>

<div class="folha-s13 mx-auto bg-white px-6 py-4 max-w-[1100px]">
  <h2 class="text-center font-bold text-lg tracking-wide">REGISTRO DE DESIGNAÇÃO DE TERRITÓRIO</h2>
  <p class="mt-1 mb-3 text-sm"><strong>Ano de Serviço:</strong> <span class="underline underline-offset-2">&nbsp;&nbsp;{ano}&nbsp;&nbsp;</span></p>

  <table class="w-full border-collapse tabela-s13">
    <thead>
      <tr>
        <th rowspan="2" class="w-[52px]">Terr.<br />n.º</th>
        <th rowspan="2" class="w-[86px]">Última data concluída*</th>
        {#each Array(COLUNAS) as _}
          <th colspan="2">Designado para</th>
        {/each}
      </tr>
      <tr>
        {#each Array(COLUNAS) as _}
          <th class="sub">Data da designação</th>
          <th class="sub">Data da conclusão</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each linhas as l (l.terr + (l.continuacao ? '+' : ''))}
        <tr class="linha-nome">
          <td rowspan="2" class="text-center font-semibold">
            {l.terr}{#if l.continuacao}<span class="text-[9px] block">(cont.)</span>{/if}
          </td>
          <td rowspan="2" class="text-center">{l.continuacao ? '' : fmt(l.ultima)}</td>
          {#each Array(COLUNAS) as _, i}
            <td colspan="2" class="nome">{l.ciclos[i]?.designado ?? ''}</td>
          {/each}
        </tr>
        <tr class="linha-datas">
          {#each Array(COLUNAS) as _, i}
            <td class="text-center">{fmt(l.ciclos[i]?.inicio ?? null)}</td>
            <td class="text-center">{fmt(l.ciclos[i]?.conclusao ?? null)}</td>
          {/each}
        </tr>
      {:else}
        <tr><td colspan="10" class="text-center py-6 text-slate-400">Sem territórios com quadras ativas.</td></tr>
      {/each}
    </tbody>
  </table>

  <p class="mt-2 text-[11px]">
    *Ao iniciar uma nova folha, use esta coluna para registrar a data em que
    cada território foi concluído pela última vez.
  </p>
  <p class="text-[10px] text-slate-400">S-13-T · gerado pelo Territory Helper em {new Date().toLocaleDateString('pt-BR')}</p>
</div>

<style>
  .tabela-s13 th,
  .tabela-s13 td {
    border: 1px solid #0f172a;
    padding: 2px 4px;
    font-size: 11px;
  }
  .tabela-s13 thead th {
    background: #e2e8f0;
    font-weight: 600;
  }
  .tabela-s13 th.sub {
    font-size: 9px;
    font-weight: 500;
  }
  .tabela-s13 td.nome {
    height: 20px;
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
    .folha-s13 {
      max-width: none;
      padding: 0;
    }
    .tabela-s13 thead th {
      background: #e2e8f0 !important;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
  @page {
    size: A4 portrait;
    margin: 10mm;
  }
</style>

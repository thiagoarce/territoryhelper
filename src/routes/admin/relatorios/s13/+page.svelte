<script lang="ts">
  // E2: réplica imprimível do S-13-T. O "PDF" é o print do navegador
  // (Imprimir → Salvar como PDF) — zero dependência nova, e o CSS
  // @media print esconde o chrome do app.
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import { folhasImpressasS13 } from '$lib/s13';
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

  // Cada "folha" = uma listagem COMPLETA de todos os territórios. Quando
  // um território estoura as 4 designações do ano, nasce uma passada nova
  // (folha nova) com TODOS os territórios de novo — modelo físico real.
  const folhas = $derived(folhasImpressasS13(data.territorios, ano, COLUNAS));

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

{#snippet cabecalhoFolha()}
  <h2 class="text-center font-bold text-lg tracking-wide">REGISTRO DE DESIGNAÇÃO DE TERRITÓRIO</h2>
  <p class="mt-1 mb-3 text-sm"><strong>Ano de Serviço:</strong> <span class="underline underline-offset-2">&nbsp;&nbsp;{ano}&nbsp;&nbsp;</span></p>
{/snippet}

<div class="folha-s13 mx-auto bg-white px-6 py-4 max-w-[1100px]">
  {#each folhas as folha, fi (folha.passada)}
    <div class="folha-passada" class:nova-folha={folha.passada > 0}>
      {@render cabecalhoFolha()}
      {#if folha.passada > 0}
        <p class="-mt-2 mb-2 text-[11px] text-slate-500">
          Continuação (designações {folha.passada * COLUNAS + 1}ª em diante) — a
          coluna “Última data concluída” já traz a última data de cada território.
        </p>
      {/if}
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
        {#each folha.linhas as l (l.terr)}
          <tbody class="bloco-territorio">
            <tr class="linha-nome">
              <td rowspan="2" class="text-center font-semibold">{l.terr}</td>
              <td rowspan="2" class="text-center">{fmt(l.ultima)}</td>
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
          </tbody>
        {:else}
          <tbody>
            <tr><td colspan={2 + COLUNAS * 2} class="text-center py-6 text-slate-400">Sem territórios com quadras ativas.</td></tr>
          </tbody>
        {/each}
      </table>
      <p class="mt-2 text-[11px]">
        *Ao iniciar uma nova folha, use esta coluna para registrar a data em
        que cada território foi concluído pela última vez.
      </p>
      {#if fi === folhas.length - 1}
        <p class="text-[10px] text-slate-400">S-13-T · gerado pelo Territory Helper em {new Date().toLocaleDateString('pt-BR')}</p>
      {/if}
    </div>
  {/each}
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
  /* Cabeçalho repete em toda página impressa (thead group é o padrão da
     spec, mas Chrome/print engines variam — deixar explícito). Cada
     bloco de território (par linha-nome/linha-datas) nunca quebra no
     meio — um rowspan cortado por uma quebra de página fica ilegível. */
  .tabela-s13 thead {
    display: table-header-group;
  }
  .tabela-s13 .bloco-territorio {
    display: table-row-group;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* Separador visual entre passadas NA TELA (na impressão vira página
     nova de verdade, ver @media print). */
  .folha-passada.nova-folha {
    margin-top: 2.5rem;
    border-top: 2px dashed #cbd5e1;
    padding-top: 1.5rem;
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
    /* Cada passada (nova listagem completa de TODOS os territórios) é
       uma FOLHA NOVA de verdade — página física nova, igual ao servo
       pegando outra folha em branco. Quebra forçada num <div> (bloco de
       nível de página), não dentro de <tbody>/<tr> — o Safari/WebKit
       (impressão do iPhone) não respeita break-before/page-break-before
       de forma confiável dentro de estrutura de tabela, só em elementos
       de bloco. */
    .folha-passada.nova-folha {
      break-before: page;
      page-break-before: always;
      margin-top: 0;
      border-top: none;
      padding-top: 0;
    }
  }
  @page {
    size: A4 portrait;
    margin: 10mm;
  }
</style>

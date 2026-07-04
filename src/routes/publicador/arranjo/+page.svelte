<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { ocorrenciasEntre, agruparPorData, rangeDoPeriodo, type Periodo } from '$lib/arranjos';
  import { ocorrenciasAgendamentoEntre } from '$lib/tp-agendamentos';
  import type { AgendamentoBase, ExcecaoBase } from '$lib/tp-agendamentos';
  import { page } from '$app/stores';
  import type { QuadraGeo } from '$lib/server/queries';
  import type {
    ArranjoLinha,
    ModalidadeLite,
    ParteLinha,
    TpCarrinhoLite,
    TpPontoLite,
    TpParticipanteLinha,
    TpPecaCatalogoLite,
    TpRelatorioLinha,
    CampanhaPublicacaoLite
  } from './$types';

  interface PredioChip {
    id: number;
    logradouro: string | null;
    numero: string | null;
    nome: string | null;
    qtd_aptos: number;
    qtd_entregues: number;
  }

  let { data }: {
    data: {
      arranjos: ArranjoLinha[];
      modalidades: ModalidadeLite[];
      dirigentes: Record<string, string>;
      prediosMap: Record<number, PredioChip>;
      publicadores: { id: string; nome: string; role: string }[];
      partes: ParteLinha[];
      nomesPorId: Record<string, string>;
      tcesMap: Record<string, string>;
      quadrasGeo: QuadraGeo[];
      minhaId: string;
      podeCoordenar: boolean;
      tpAgendamentos: AgendamentoBase[];
      tpExcecoes: ExcecaoBase[];
      tpCarrinhos: Record<number, TpCarrinhoLite>;
      tpPontos: Record<number, TpPontoLite>;
      tpParticipantes: TpParticipanteLinha[];
      minhaDisponibilidadeVazia: boolean;
      tpPecasCatalogo: TpPecaCatalogoLite[];
      campanhaPublicacao: CampanhaPublicacaoLite | null;
      tpRelatorios: TpRelatorioLinha[];
    };
  } = $props();

  // Período igual ao admin: semana / mês / 3 meses / ano.
  // Aceita ?periodo=... na URL (banner de campanha planejada linka pra cá).
  const PERIODOS_VALIDOS: Periodo[] = ['semana', 'mes', 'tres_meses', 'ano'];
  const periodoUrl = $page.url.searchParams.get('periodo') as Periodo | null;
  let periodo = $state<Periodo>(periodoUrl && PERIODOS_VALIDOS.includes(periodoUrl) ? periodoUrl : 'semana');
  const range = $derived(rangeDoPeriodo(periodo));
  const ocorrencias = $derived(ocorrenciasEntre<ArranjoLinha>(data.arranjos, range.isoIni, range.isoFim));
  const ocPorData = $derived(agruparPorData(ocorrencias));
  const ocAgendamentos = $derived(
    ocorrenciasAgendamentoEntre(data.tpAgendamentos, data.tpExcecoes, range.isoIni, range.isoFim)
  );
  const agendamentosPorData = $derived.by(() => {
    const m: Record<string, typeof ocAgendamentos> = {};
    for (const oc of ocAgendamentos) (m[oc.data] ||= []).push(oc);
    return m;
  });
  const datasOrdenadas = $derived(
    Array.from(new Set([...Object.keys(ocPorData), ...Object.keys(agendamentosPorData)])).sort()
  );
  const modById = $derived(Object.fromEntries(data.modalidades.map((m) => [m.id, m] as const)));

  // Quem já se inscreveu em cada ocorrência (agendamento_id + data) de TP
  const inscritosPorOcorrencia = $derived.by(() => {
    const m: Record<string, { publicador_id: string; nome: string }[]> = {};
    for (const e of data.tpParticipantes) {
      const key = e.agendamento_id + '|' + e.data;
      (m[key] ||= []).push({ publicador_id: e.publicador_id, nome: data.nomesPorId[e.publicador_id] ?? '?' });
    }
    return m;
  });

  // Relatório de fim de agendamento já enviado, por ocorrência (TP-D) —
  // 1 por ocorrência; quem mandou primeiro é "dono" (RLS só deixa ele/admin editar depois)
  const relatorioPorOcorrencia = $derived.by(() => {
    const m: Record<string, TpRelatorioLinha> = {};
    for (const r of data.tpRelatorios) m[r.agendamento_id + '|' + r.data] = r;
    return m;
  });
  const hojeIso = new Date().toISOString().substring(0, 10);

  let acaoEmCurso = $state<string | null>(null);
  let assumindoId = $state<number | null>(null);
  function isBusy(key: string): boolean {
    return acaoEmCurso === key;
  }

  // === Sheet relatório de fim de agendamento (TP-D) ===
  interface ItemChecklist {
    pecaId: number | null;
    tipoId: number;
    nome: string;
    categoria: 'fisica' | 'literatura';
    estado: string;
    qtdColocada: string;
    obs: string;
    publicacaoVirtualId: number | null;
    nomeVirtual: string | null;
  }
  let sheetRelatorio = $state(false);
  let relatorioOcAtual = $state<{ agendamento_id: number; data: string } | null>(null);
  let relatorioSomenteLeitura = $state(false);
  let relatorioAutorNome = $state('');
  let itensRelatorio = $state<ItemChecklist[]>([]);
  let notasRelatorio = $state('');
  let enviandoRelatorio = $state(false);

  function abrirRelatorio(oc: { agendamento_id: number; data: string; carrinho_id: number }) {
    const carrinho = data.tpCarrinhos[oc.carrinho_id];
    const tipoId = carrinho?.tipo_id ?? 0;
    const pecas = data.tpPecasCatalogo.filter((p) => p.tipo_id === tipoId);
    const existente = relatorioPorOcorrencia[oc.agendamento_id + '|' + oc.data];

    relatorioSomenteLeitura = !!existente && existente.publicador_id !== data.minhaId;
    relatorioAutorNome = existente ? (data.nomesPorId[existente.publicador_id] ?? '?') : '';
    notasRelatorio = existente?.notas ?? '';

    const itensExistentesPorPeca = new Map((existente?.itens ?? []).map((i) => [i.peca_id, i]));
    itensRelatorio = pecas.map((p) => {
      const ex = itensExistentesPorPeca.get(p.id);
      return {
        pecaId: p.id,
        tipoId,
        nome: p.nome,
        categoria: p.categoria,
        estado: ex?.estado ?? 'ok',
        qtdColocada: ex?.qtd_colocada != null ? String(ex.qtd_colocada) : '',
        obs: ex?.obs ?? '',
        publicacaoVirtualId: null,
        nomeVirtual: null
      };
    });

    // Publicação principal da campanha ativa — se ainda não é uma peça
    // real do catálogo desse tipo, entra como item "virtual" (o server
    // cria a linha de catálogo sob demanda ao salvar).
    const cp = data.campanhaPublicacao;
    if (cp && !pecas.some((p) => p.publicacao_id === cp.publicacao_id)) {
      const exVirtual = (existente?.itens ?? []).find((i) => {
        const p = data.tpPecasCatalogo.find((pc) => pc.id === i.peca_id);
        return p?.publicacao_id === cp.publicacao_id;
      });
      itensRelatorio = [
        ...itensRelatorio,
        {
          pecaId: exVirtual?.peca_id ?? null,
          tipoId,
          nome: cp.nome + ' (campanha)',
          categoria: 'literatura',
          estado: exVirtual?.estado ?? 'ok',
          qtdColocada: exVirtual?.qtd_colocada != null ? String(exVirtual.qtd_colocada) : '',
          obs: exVirtual?.obs ?? '',
          publicacaoVirtualId: exVirtual ? null : cp.publicacao_id,
          nomeVirtual: cp.nome
        }
      ];
    }

    relatorioOcAtual = { agendamento_id: oc.agendamento_id, data: oc.data };
    sheetRelatorio = true;
  }

  async function enviarRelatorio() {
    if (!relatorioOcAtual) return;
    enviandoRelatorio = true;
    const itensPayload = itensRelatorio.map((it) => ({
      peca_id: it.pecaId,
      tipo_id: it.tipoId,
      estado: it.estado,
      qtd_colocada: it.qtdColocada === '' ? null : Number(it.qtdColocada),
      obs: it.obs,
      publicacao_virtual_id: it.publicacaoVirtualId,
      nome_virtual: it.nomeVirtual
    }));
    const fd = new FormData();
    fd.append('agendamento_id', String(relatorioOcAtual.agendamento_id));
    fd.append('data', relatorioOcAtual.data);
    fd.append('notas', notasRelatorio);
    fd.append('itens_json', JSON.stringify(itensPayload));
    const res = await fetch('?/salvarRelatorio', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    enviandoRelatorio = false;
    if (parsed.type === 'success') {
      toast.success('Relatório enviado');
      sheetRelatorio = false;
      await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou'));
    }
  }

  async function inscreverAgendamento(agendamentoId: number, dataOc: string) {
    const key = `agendamento:${agendamentoId}:${dataOc}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('agendamento_id', String(agendamentoId));
    fd.append('data', dataOc);
    const res = await fetch('?/inscreverAgendamento', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success') { toast.success('Inscrito'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function sairAgendamento(agendamentoId: number, dataOc: string) {
    const key = `agendamento:${agendamentoId}:${dataOc}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('agendamento_id', String(agendamentoId));
    fd.append('data', dataOc);
    const res = await fetch('?/sairAgendamento', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success') { toast.success('Saiu do agendamento'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
  const partesPorArranjo = $derived.by(() => {
    const m: Record<number, ParteLinha[]> = {};
    for (const p of data.partes) (m[p.arranjo_id] ||= []).push(p);
    return m;
  });

  function nomeParte(p: ParteLinha): string {
    return p.publicadores.map((id) => data.nomesPorId[id] ?? '?').join(' + ');
  }

  // === Sheet repartir (dirigente do arranjo) ===
  let sheetRepartir = $state(false);
  let arranjoRep = $state<ArranjoLinha | null>(null);
  let pubsSel = $state<Set<string>>(new Set());
  let quadrasSel = $state<Set<string>>(new Set());
  let locaisSel = $state<Set<number>>(new Set());
  let notasParte = $state('');
  let repartindo = $state(false);

  // O que do território ainda NÃO está em nenhuma parte (sugestão visual)
  const jaRepartidas = $derived.by(() => {
    if (!arranjoRep) return { q: new Set<string>(), l: new Set<number>() };
    const partes = partesPorArranjo[arranjoRep.id] ?? [];
    return {
      q: new Set(partes.flatMap((p) => p.quadras_ids)),
      l: new Set(partes.flatMap((p) => p.locais_ids))
    };
  });

  // Interessados (inscrição antecipada) aparecem primeiro na lista, com selo
  const publicadoresParaRepartir = $derived.by(() => {
    const interessados = new Set(arranjoRep?.interessados ?? []);
    return [...data.publicadores].sort((a, b) => {
      const ia = interessados.has(a.id) ? 0 : 1;
      const ib = interessados.has(b.id) ? 0 : 1;
      return ia - ib;
    });
  });

  // Geometrias das quadras do arranjo sendo repartido (mini-mapa do sheet)
  const quadrasRepGeo = $derived(
    arranjoRep
      ? data.quadrasGeo.filter((q) => (arranjoRep!.quadras_ids ?? []).includes(q.id))
      : []
  );

  // Quem já está com um item (pra montar o alerta de conflito)
  function donosDoItem(qid: string | null, lid: number | null): string[] {
    if (!arranjoRep) return [];
    const partes = partesPorArranjo[arranjoRep.id] ?? [];
    const nomes: string[] = [];
    for (const p of partes) {
      const bate = (qid && p.quadras_ids.includes(qid)) || (lid != null && p.locais_ids.includes(lid));
      if (bate) nomes.push(nomeParte(p));
    }
    return nomes;
  }

  function abrirRepartir(a: ArranjoLinha) {
    arranjoRep = a;
    pubsSel = new Set();
    quadrasSel = new Set();
    locaisSel = new Set();
    notasParte = '';
    sheetRepartir = true;
  }
  function togglePub(id: string) {
    if (pubsSel.has(id)) pubsSel.delete(id); else pubsSel.add(id);
    pubsSel = new Set(pubsSel);
  }
  function toggleQuadra(id: string) {
    if (quadrasSel.has(id)) quadrasSel.delete(id); else quadrasSel.add(id);
    quadrasSel = new Set(quadrasSel);
  }
  function toggleLocal(id: number) {
    if (locaisSel.has(id)) locaisSel.delete(id); else locaisSel.add(id);
    locaisSel = new Set(locaisSel);
  }

  async function apagarParte(id: number) {
    if (!confirm('Remover essa parte? O publicador perde o acesso.')) return;
    const key = `parte:${id}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarParte', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success') { toast.success('Removida'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // Link público do arranjo — abre /t/<token> onde dá pra compartilhar
  // com imagem do mapa (WhatsApp)
  async function abrirLinkPublico(arranjoId: number) {
    const key = `link:${arranjoId}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('arranjo_id', String(arranjoId));
    const res = await fetch('?/gerarLinkTerritorio', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success' && parsed.data?.token) {
      window.open('/t/' + parsed.data.token, '_blank', 'noopener');
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou gerar link'));
    }
  }

  // Inscrição antecipada — sinal de interesse, dirigente decide a repartição
  async function toggleInteresse(arranjoId: number) {
    const key = `interesse:${arranjoId}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('arranjo_id', String(arranjoId));
    const res = await fetch('?/toggleInteresse', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Feito')); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
</script>

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Arranjo</h1>
    <p class="text-sm text-slate-500">Saídas em grupo — planeje com antecedência</p>
  </div>

  {#if data.minhaDisponibilidadeVazia && Object.keys(data.tpCarrinhos).length > 0}
    <a
      href="/perfil"
      class="flex items-center justify-between gap-2 text-sm bg-teal-50 border border-teal-200 text-teal-800 rounded-lg px-3 py-2 hover:bg-teal-100"
    >
      <span><Icon nome="megaphone" size={14} /> Informe sua disponibilidade pro testemunho público</span>
      <Icon nome="chevron-right" size={14} />
    </a>
  {/if}

  <div class="flex items-center justify-between flex-wrap gap-2">
    <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
      {#each [['semana', 'Semana'], ['mes', 'Mês'], ['tres_meses', '3 meses'], ['ano', 'Ano']] as [p, label]}
        <button
          type="button"
          onclick={() => (periodo = p as Periodo)}
          class="px-3 py-1 text-xs font-medium rounded transition-colors"
          class:bg-white={periodo === p}
          class:shadow-sm={periodo === p}
          class:text-slate-900={periodo === p}
          class:text-slate-500={periodo !== p}
        >{label}</button>
      {/each}
    </div>
    <div class="text-xs text-slate-400">
      {new Date(range.isoIni + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
      — {new Date(range.isoFim + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
      · {ocorrencias.length} saída(s)
    </div>
  </div>

  {#if ocorrencias.length === 0}
    <Card padding="md">
      <div class="text-center py-8">
        <div class="text-4xl mb-2 opacity-50"><Icon nome="calendar" size={40} class="mx-auto text-slate-300" /></div>
        <div class="font-medium">Sem arranjos esta semana</div>
        <div class="text-sm text-slate-500">Quando uma saída for marcada, aparece aqui.</div>
      </div>
    </Card>
  {:else}
    <div class="grid gap-3">
      {#each datasOrdenadas as dataIso}
        {#if (ocPorData[dataIso] ?? []).length > 0 || (agendamentosPorData[dataIso] ?? []).length > 0}
          <div>
            <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
              {new Date(dataIso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
            </div>
            <div class="grid gap-2">
              {#each agendamentosPorData[dataIso] ?? [] as oc (oc.agendamento_id + '-' + oc.data)}
                {@const carrinho = oc.carrinho_id ? data.tpCarrinhos[oc.carrinho_id] : null}
                {@const ponto = oc.ponto_id ? data.tpPontos[oc.ponto_id] : null}
                {@const inscritos = inscritosPorOcorrencia[oc.agendamento_id + '|' + oc.data] ?? []}
                {@const souInscrito = inscritos.some((i) => i.publicador_id === data.minhaId)}
                {@const relatorio = relatorioPorOcorrencia[oc.agendamento_id + '|' + oc.data]}
                <Card padding="md">
                  <div class="flex items-start gap-3">
                    <span class="w-2 self-stretch rounded shrink-0 bg-teal-500"></span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold">{ponto?.nome ?? oc.ponto_avulso ?? 'Testemunho público'}</span>
                        <span class="text-[10px] bg-teal-100 text-teal-700 px-1.5 rounded"><Icon nome="megaphone" size={10} /> TP{#if carrinho} · {carrinho.nome}{/if}</span>
                      </div>
                      <div class="text-sm text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span><Icon nome="clock" size={14} /> {oc.hora_inicio.substring(0, 5)}–{oc.hora_fim.substring(0, 5)}</span>
                        {#if ponto?.endereco}<span class="truncate"><Icon nome="map-pin" size={14} /> {ponto.endereco}</span>{/if}
                      </div>
                      <div class="mt-1 text-xs text-slate-500">
                        {#if inscritos.length > 0}{inscritos.map((i) => i.nome).join(', ')}{:else}Ninguém inscrito ainda{/if}
                      </div>
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        {#if souInscrito}
                          <Button variant="secondary" size="sm" loading={isBusy(`agendamento:${oc.agendamento_id}:${oc.data}`)} onclick={() => sairAgendamento(oc.agendamento_id, oc.data)}>Sair do agendamento</Button>
                        {:else}
                          <Button variant="primary" size="sm" loading={isBusy(`agendamento:${oc.agendamento_id}:${oc.data}`)} onclick={() => inscreverAgendamento(oc.agendamento_id, oc.data)}><Icon nome="hand" size={12} /> Me inscrever</Button>
                        {/if}
                        {#if oc.data <= hojeIso && souInscrito && carrinho}
                          <Button variant="secondary" size="sm" onclick={() => abrirRelatorio(oc)}>
                            <Icon nome="file-text" size={12} /> {relatorio ? 'Ver relatório' : 'Relatório do turno'}
                          </Button>
                        {/if}
                      </div>
                    </div>
                  </div>
                </Card>
              {/each}
              {#each ocPorData[dataIso] ?? [] as oc (oc.arranjo.id + '-' + oc.data)}
                {@const a = oc.arranjo}
                {@const m = modById[a.modalidade_id]}
                {@const partesDoArranjo = partesPorArranjo[a.id] ?? []}
                {@const minhaParte = partesDoArranjo.find((p) => p.publicadores.includes(data.minhaId))}
                {@const souInteressado = (a.interessados ?? []).includes(data.minhaId)}
                <Card padding="md">
                  <div class="flex items-start gap-3">
                    <span class="w-2 self-stretch rounded shrink-0" style="background:{m?.cor ?? '#3b82f6'}"></span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold">{a.nome || m?.nome || 'Arranjo'}</span>
                        {#if m && m.nome !== a.nome}<span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 rounded">{m.nome}</span>{/if}
                      </div>
                      <div class="text-sm text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {#if a.hora_inicio}<span><Icon nome="clock" size={14} /> {a.hora_inicio.substring(0, 5)}{a.hora_fim ? `–${a.hora_fim.substring(0, 5)}` : ''}</span>{/if}
                        {#if a.local_endereco}<span class="truncate"><Icon nome="map-pin" size={14} /> {a.local_endereco}</span>{/if}
                        {#if a.dirigente_id}<span><Icon nome="user" size={14} /> {data.dirigentes[a.dirigente_id] ?? '?'}</span>{/if}
                      </div>
                      {#if (a.quadras_ids?.length ?? 0) > 0}
                        <div class="mt-1.5 flex flex-wrap gap-1">
                          {#each a.quadras_ids ?? [] as q}
                            <a href="/publicador/quadra/{q}" class="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-200">{q}</a>
                          {/each}
                        </div>
                      {/if}
                      {#if (a.cartas_locais_ids?.length ?? 0) > 0}
                        <div class="mt-1.5 flex flex-wrap gap-1">
                          {#each a.cartas_locais_ids ?? [] as pid}
                            {@const p = data.prediosMap[pid]}
                            <a href="/predio/{pid}" class="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded hover:bg-purple-200 truncate max-w-[220px]">
                              <Icon nome="mail" size={14} /> {p?.nome || (p ? `${p.logradouro ?? ''}, ${p.numero ?? ''}` : `#${pid}`)}
                              {#if p} · {p.qtd_entregues}/{p.qtd_aptos}{/if}
                            </a>
                          {/each}
                        </div>
                      {/if}
                      {#if (a as any).tce_id && data.tcesMap[(a as any).tce_id]}
                        <div class="mt-1.5">
                          <span class="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded"><Icon nome="store" size={14} /> TCE: {data.tcesMap[(a as any).tce_id]}</span>
                        </div>
                      {/if}
                      {#if a.arquivo_url}
                        <div class="mt-1"><a href={a.arquivo_url} target="_blank" rel="noopener" class="text-xs text-primary-700 hover:underline"><Icon nome="paperclip" size={14} /> {a.arquivo_nome || 'arquivo'}</a></div>
                      {/if}
                      {#if a.notas}<div class="mt-1 text-xs italic text-slate-500">{a.notas}</div>{/if}

                      <!-- Inscrição antecipada: sinal de interesse, não cria parte -->
                      <div class="mt-1.5 flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={isBusy(`interesse:${a.id}`)}
                          onclick={() => toggleInteresse(a.id)}
                          class="text-xs px-2 py-0.5 rounded border disabled:opacity-40 {souInteressado ? 'bg-primary-100 border-primary-400 text-primary-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}"
                        >
                          <Icon nome={isBusy(`interesse:${a.id}`) ? 'loader' : 'hand'} size={12} spin={isBusy(`interesse:${a.id}`)} /> {souInteressado ? 'Você quer participar' : 'Quero participar'}
                        </button>
                        {#if a.dirigente_id === data.minhaId && (a.interessados ?? []).length > 0}
                          <span class="text-xs text-slate-500">
                            Interessados: {(a.interessados ?? []).map((id) => data.nomesPorId[id] ?? '?').join(', ')}
                          </span>
                        {/if}
                      </div>

                      {#if data.podeCoordenar}
                        <button type="button" disabled={isBusy(`link:${a.id}`)} onclick={() => abrirLinkPublico(a.id)}
                          class="mt-1.5 text-xs text-primary-700 hover:underline disabled:opacity-40"><Icon nome={isBusy(`link:${a.id}`) ? 'loader' : 'share'} size={14} spin={isBusy(`link:${a.id}`)} /> Link público (WhatsApp c/ mapa)</button>
                      {/if}

                      <!-- Minha parte (destaque pro publicador) -->
                      {#if minhaParte}
                        <div class="mt-2 rounded-lg bg-amber-50 border border-amber-300 p-2">
                          <div class="text-[10px] uppercase tracking-wider font-bold text-amber-900">Sua parte{minhaParte.publicadores.length > 1 ? ` (com ${minhaParte.publicadores.filter((id) => id !== data.minhaId).map((id) => data.nomesPorId[id] ?? '?').join(', ')})` : ''}</div>
                          <div class="mt-1 flex flex-wrap gap-1">
                            {#each minhaParte.quadras_ids as q}
                              <a href="/publicador/quadra/{q}" class="text-xs font-mono bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded hover:bg-amber-200">{q}</a>
                            {/each}
                            {#each minhaParte.locais_ids as lid}
                              {@const p = data.prediosMap[lid]}
                              <a href="/predio/{lid}" class="text-xs bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded hover:bg-amber-200 truncate max-w-[180px]">
                                <Icon nome="mail" size={14} /> {p?.nome || (p ? `${p.logradouro ?? ''}, ${p.numero ?? ''}` : `#${lid}`)}
                              </a>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>

                  {#if data.podeCoordenar}
                    {@const ehMeu = a.dirigente_id === data.minhaId}
                    {#if ehMeu}
                      <!-- Partes já criadas (visão do dirigente) -->
                      {#if partesDoArranjo.length > 0}
                        <div class="mt-2 pt-2 border-t border-slate-100 space-y-1">
                          <div class="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Partes ({partesDoArranjo.length})</div>
                          {#each partesDoArranjo as pt (pt.id)}
                            <div class="flex items-center gap-2 text-xs bg-slate-50 rounded p-1.5">
                              <span class="flex-1 min-w-0 truncate">
                                <strong>{nomeParte(pt)}</strong> —
                                <span class="font-mono">{pt.quadras_ids.join(', ')}</span>
                                {#if pt.locais_ids.length > 0}{pt.quadras_ids.length > 0 ? ' + ' : ''}{pt.locais_ids.length} prédio(s){/if}
                              </span>
                              <button type="button" disabled={isBusy(`parte:${pt.id}`)} onclick={() => apagarParte(pt.id)} class="text-red-600 hover:underline shrink-0 disabled:opacity-40"><Icon nome={isBusy(`parte:${pt.id}`) ? 'loader' : 'trash'} size={14} spin={isBusy(`parte:${pt.id}`)} /></button>
                            </div>
                          {/each}
                        </div>
                      {/if}
                      {#if (a.quadras_ids?.length ?? 0) > 0 || (a.cartas_locais_ids?.length ?? 0) > 0}
                        <div class="mt-2 pt-2 border-t border-slate-100">
                          <Button variant="primary" onclick={() => abrirRepartir(a)} class="w-full"><Icon nome="scissors" size={14} /> Repartir território</Button>
                        </div>
                      {/if}
                    {:else}
                      <div class="mt-2 pt-2 border-t border-slate-100">
                        <form
                          method="POST"
                          action="?/assumirArranjo"
                          use:enhance={() => {
                            assumindoId = a.id;
                            return async ({ result, update }) => {
                              await update();
                              assumindoId = null;
                              if (result.type === 'success') { toast.success(String((result.data as any)?.msg || 'Assumido')); await invalidateAll(); }
                              else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
                            };
                          }}
                          onsubmit={(e) => { if (!confirm('Assumir a dirigência deste arranjo?')) e.preventDefault(); }}
                        >
                          <input type="hidden" name="arranjo_id" value={a.id} />
                          <Button variant="secondary" type="submit" loading={assumindoId === a.id} class="w-full"><Icon nome="hand" size={14} /> Assumir dirigência</Button>
                        </form>
                      </div>
                    {/if}
                  {/if}
                </Card>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<!-- Sheet repartir: subconjunto do território → 1+ publicadores (mesma parte) -->
<BottomSheet bind:open={sheetRepartir} title="Repartir território">
  {#if arranjoRep}
    <form
      method="POST"
      action="?/criarParte"
      use:enhance={({ cancel }) => {
        // Alerta: itens já repartidos pra outro publicador
        const confQ = [...quadrasSel].filter((q) => jaRepartidas.q.has(q));
        const confL = [...locaisSel].filter((l) => jaRepartidas.l.has(l));
        if (confQ.length > 0 || confL.length > 0) {
          const detalhes = [
            ...confQ.map((q) => `${q} (com ${donosDoItem(q, null).join(' / ')})`),
            ...confL.map((l) => `prédio #${l} (com ${donosDoItem(null, l).join(' / ')})`)
          ].join(', ');
          if (!confirm(`Já repartido: ${detalhes}.\n\nRepartir de novo mesmo assim? Os dois vão trabalhar o mesmo lugar.`)) {
            cancel();
            return;
          }
        }
        repartindo = true;
        return async ({ result, update }) => {
        await update(); repartindo = false;
        if (result.type === 'success') {
          toast.success(String((result.data as any)?.msg || 'Parte criada'));
          sheetRepartir = false; await invalidateAll();
        } else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      }; }}
      class="space-y-3"
    >
      <input type="hidden" name="arranjo_id" value={arranjoRep.id} />
      {#each [...pubsSel] as pid}<input type="hidden" name="publicador_ids" value={pid} />{/each}
      {#each [...quadrasSel] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
      {#each [...locaisSel] as lid}<input type="hidden" name="locais_ids" value={lid} />{/each}

      <p class="text-xs text-slate-500">Toque nas quadras no mapa (ou nos chips) pra montar a parte. Itens acinzentados já estão em outra parte — repartir de novo pede confirmação.</p>

      {#if quadrasRepGeo.length > 0}
        <AdminMapa
          quadras={quadrasRepGeo}
          selecionadasIds={[...quadrasSel]}
          altura={280}
          onQuadraClick={(q) => toggleQuadra(q.id)}
        />
      {/if}

      {#if (arranjoRep.quadras_ids?.length ?? 0) > 0}
        <div>
          <span class="block text-sm font-medium mb-1">Quadras</span>
          <div class="flex flex-wrap gap-1.5">
            {#each arranjoRep.quadras_ids ?? [] as q}
              {@const emParte = jaRepartidas.q.has(q)}
              <button type="button" onclick={() => toggleQuadra(q)}
                class="text-xs font-mono px-2 py-1 rounded border transition-colors"
                class:bg-primary-600={quadrasSel.has(q)}
                class:text-white={quadrasSel.has(q)}
                class:border-primary-600={quadrasSel.has(q)}
                class:bg-slate-100={!quadrasSel.has(q) && emParte}
                class:text-slate-400={!quadrasSel.has(q) && emParte}
                class:border-slate-200={!quadrasSel.has(q) && emParte}
                class:bg-white={!quadrasSel.has(q) && !emParte}
                class:border-slate-300={!quadrasSel.has(q) && !emParte}
              >{q}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if (arranjoRep.cartas_locais_ids?.length ?? 0) > 0}
        <div>
          <span class="block text-sm font-medium mb-1">Prédios (cartas)</span>
          <div class="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {#each arranjoRep.cartas_locais_ids ?? [] as lid}
              {@const p = data.prediosMap[lid]}
              {@const emParte = jaRepartidas.l.has(lid)}
              <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm" class:opacity-50={emParte && !locaisSel.has(lid)}>
                <input type="checkbox" checked={locaisSel.has(lid)} onchange={() => toggleLocal(lid)} class="w-4 h-4 rounded" />
                <span class="flex-1 truncate"><Icon nome="mail" size={14} /> {p?.nome || (p ? `${p.logradouro ?? ''}, ${p.numero ?? ''}` : `#${lid}`)}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}

      <div>
        <span class="block text-sm font-medium mb-1">Publicadores (dupla/trio)</span>
        <div class="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {#each publicadoresParaRepartir as p}
            {@const interessado = (arranjoRep?.interessados ?? []).includes(p.id)}
            <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={pubsSel.has(p.id)} onchange={() => togglePub(p.id)} class="w-4 h-4 rounded" />
              <span class="flex-1">{p.nome}</span>
              {#if interessado}<span class="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 text-primary-700"><Icon nome="hand" size={10} /> interessado</span>{/if}
              <span class="text-xs text-slate-400">{p.role}</span>
            </label>
          {/each}
        </div>
        <p class="text-xs text-slate-500 mt-1">{pubsSel.size} publicador(es) · {quadrasSel.size} quadra(s) · {locaisSel.size} prédio(s)</p>
      </div>

      <div>
        <label for="notas-pt" class="block text-sm font-medium mb-1">Notas (opcional)</label>
        <input id="notas-pt" name="notas" bind:value={notasParte} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (sheetRepartir = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={repartindo} class="flex-1"
          disabled={pubsSel.size === 0 || (quadrasSel.size === 0 && locaisSel.size === 0)}>Criar parte</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

<!-- Sheet relatório de fim de agendamento (TP-D) -->
<BottomSheet bind:open={sheetRelatorio} title="Relatório do turno">
  {#if relatorioSomenteLeitura}
    <p class="text-xs text-slate-500 mb-3">Enviado por {relatorioAutorNome} — só quem enviou (ou admin) pode editar.</p>
  {/if}
  <div class="space-y-3">
    {#each itensRelatorio as item, i}
      <div class="rounded-lg border border-slate-200 p-2.5">
        <div class="text-sm font-medium mb-1.5">{item.nome}</div>
        <div class="flex flex-wrap gap-1.5">
          {#each (item.categoria === 'fisica' ? ['ok', 'danificado'] : ['ok', 'acabando', 'zerado']) as opcao}
            <label class="cursor-pointer">
              <input
                type="radio"
                name="estado-{i}"
                value={opcao}
                checked={item.estado === opcao}
                disabled={relatorioSomenteLeitura}
                onchange={() => (itensRelatorio[i].estado = opcao)}
                class="peer sr-only"
              />
              <div class="text-xs px-2.5 py-1 rounded-full border border-slate-300 peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700 peer-disabled:opacity-50">
                {opcao === 'ok' ? 'OK' : opcao === 'acabando' ? 'Acabando' : opcao === 'zerado' ? 'Zerado' : 'Danificado'}
              </div>
            </label>
          {/each}
        </div>
        {#if item.categoria === 'literatura'}
          <input
            type="number"
            min="0"
            placeholder="Qtd colocada"
            value={item.qtdColocada}
            disabled={relatorioSomenteLeitura}
            oninput={(e) => (itensRelatorio[i].qtdColocada = (e.target as HTMLInputElement).value)}
            class="mt-1.5 w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50 disabled:bg-slate-50"
          />
        {/if}
        {#if item.estado !== 'ok'}
          <input
            placeholder="Obs (opcional)"
            value={item.obs}
            disabled={relatorioSomenteLeitura}
            oninput={(e) => (itensRelatorio[i].obs = (e.target as HTMLInputElement).value)}
            class="mt-1.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50 disabled:bg-slate-50"
          />
        {/if}
      </div>
    {/each}
    <div>
      <label for="rel-notas" class="block text-sm font-medium mb-1">Notas gerais</label>
      <textarea
        id="rel-notas"
        rows="2"
        value={notasRelatorio}
        disabled={relatorioSomenteLeitura}
        oninput={(e) => (notasRelatorio = (e.target as HTMLTextAreaElement).value)}
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 disabled:bg-slate-50"
      ></textarea>
    </div>
    {#if !relatorioSomenteLeitura}
      <Button variant="primary" loading={enviandoRelatorio} onclick={enviarRelatorio} class="w-full">Enviar relatório</Button>
    {/if}
  </div>
</BottomSheet>

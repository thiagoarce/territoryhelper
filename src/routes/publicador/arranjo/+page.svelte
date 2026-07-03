<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { ocorrenciasEntre, agruparPorData, rangeDoPeriodo, ocorrenciasTurnoEntre, type Periodo } from '$lib/arranjos';
  import { page } from '$app/stores';
  import type { QuadraGeo } from '$lib/server/queries';
  import type { ArranjoLinha, ModalidadeLite, ParteLinha, TpTurnoLinha, TpPontoLite, TpEscalaLinha } from './$types';

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
      tpTurnos: TpTurnoLinha[];
      tpPontos: Record<number, TpPontoLite>;
      tpEscala: TpEscalaLinha[];
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
  const ocTurnos = $derived(ocorrenciasTurnoEntre<TpTurnoLinha>(data.tpTurnos, range.isoIni, range.isoFim));
  const turnosPorData = $derived.by(() => {
    const m: Record<string, typeof ocTurnos> = {};
    for (const oc of ocTurnos) (m[oc.data] ||= []).push(oc);
    return m;
  });
  const datasOrdenadas = $derived(
    Array.from(new Set([...Object.keys(ocPorData), ...Object.keys(turnosPorData)])).sort()
  );
  const modById = $derived(Object.fromEntries(data.modalidades.map((m) => [m.id, m] as const)));

  // Quem já se inscreveu em cada ocorrência (turno_id + data) de TP
  const inscritosPorOcorrencia = $derived.by(() => {
    const m: Record<string, { publicador_id: string; nome: string }[]> = {};
    for (const e of data.tpEscala) {
      const key = e.turno_id + '|' + e.data;
      (m[key] ||= []).push({ publicador_id: e.publicador_id, nome: data.nomesPorId[e.publicador_id] ?? '?' });
    }
    return m;
  });

  let acaoEmCurso = $state<string | null>(null);
  let assumindoId = $state<number | null>(null);
  function isBusy(key: string): boolean {
    return acaoEmCurso === key;
  }

  async function inscreverTurno(turnoId: number, dataOc: string) {
    const key = `turno:${turnoId}:${dataOc}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('turno_id', String(turnoId));
    fd.append('data', dataOc);
    const res = await fetch('?/inscreverTurno', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success') { toast.success('Inscrito'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function sairTurno(turnoId: number, dataOc: string) {
    const key = `turno:${turnoId}:${dataOc}`;
    acaoEmCurso = key;
    const fd = new FormData();
    fd.append('turno_id', String(turnoId));
    fd.append('data', dataOc);
    const res = await fetch('?/sairTurno', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    acaoEmCurso = null;
    if (parsed.type === 'success') { toast.success('Saiu do turno'); await invalidateAll(); }
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
        {#if (ocPorData[dataIso] ?? []).length > 0 || (turnosPorData[dataIso] ?? []).length > 0}
          <div>
            <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
              {new Date(dataIso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
            </div>
            <div class="grid gap-2">
              {#each turnosPorData[dataIso] ?? [] as oct (oct.turno.id + '-' + oct.data)}
                {@const t = oct.turno}
                {@const ponto = data.tpPontos[t.ponto_id]}
                {@const inscritos = inscritosPorOcorrencia[t.id + '|' + oct.data] ?? []}
                {@const souInscrito = inscritos.some((i) => i.publicador_id === data.minhaId)}
                <Card padding="md">
                  <div class="flex items-start gap-3">
                    <span class="w-2 self-stretch rounded shrink-0 bg-teal-500"></span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold">{ponto?.nome ?? 'Testemunho público'}</span>
                        <span class="text-[10px] bg-teal-100 text-teal-700 px-1.5 rounded"><Icon nome="megaphone" size={10} /> TP</span>
                      </div>
                      <div class="text-sm text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span><Icon nome="clock" size={14} /> {t.hora_inicio.substring(0, 5)}–{t.hora_fim.substring(0, 5)}</span>
                        {#if ponto?.endereco}<span class="truncate"><Icon nome="map-pin" size={14} /> {ponto.endereco}</span>{/if}
                      </div>
                      <div class="mt-1 text-xs text-slate-500">
                        {inscritos.length}/{t.vagas} vaga(s) preenchida(s)
                        {#if inscritos.length > 0} — {inscritos.map((i) => i.nome).join(', ')}{/if}
                      </div>
                      <div class="mt-2">
                        {#if souInscrito}
                          <Button variant="secondary" size="sm" loading={isBusy(`turno:${t.id}:${oct.data}`)} onclick={() => sairTurno(t.id, oct.data)}>Sair do turno</Button>
                        {:else if inscritos.length < t.vagas}
                          <Button variant="primary" size="sm" loading={isBusy(`turno:${t.id}:${oct.data}`)} onclick={() => inscreverTurno(t.id, oct.data)}><Icon nome="hand" size={12} /> Me inscrever</Button>
                        {:else}
                          <span class="text-xs text-slate-400">Sem vagas</span>
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
                        {#if m}<span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 rounded">{m.nome}</span>{/if}
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
                          <Icon nome={isBusy(`interesse:${a.id}`) ? 'loader' : 'hand'} size={12} class={isBusy(`interesse:${a.id}`) && 'animate-spin'} /> {souInteressado ? 'Você quer participar' : 'Quero participar'}
                        </button>
                        {#if a.dirigente_id === data.minhaId && (a.interessados ?? []).length > 0}
                          <span class="text-xs text-slate-500">
                            Interessados: {(a.interessados ?? []).map((id) => data.nomesPorId[id] ?? '?').join(', ')}
                          </span>
                        {/if}
                      </div>

                      {#if data.podeCoordenar}
                        <button type="button" disabled={isBusy(`link:${a.id}`)} onclick={() => abrirLinkPublico(a.id)}
                          class="mt-1.5 text-xs text-primary-700 hover:underline disabled:opacity-40"><Icon nome={isBusy(`link:${a.id}`) ? 'loader' : 'share'} size={14} class={isBusy(`link:${a.id}`) && 'animate-spin'} /> Link público (WhatsApp c/ mapa)</button>
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
                              <button type="button" disabled={isBusy(`parte:${pt.id}`)} onclick={() => apagarParte(pt.id)} class="text-red-600 hover:underline shrink-0 disabled:opacity-40"><Icon nome={isBusy(`parte:${pt.id}`) ? 'loader' : 'trash'} size={14} class={isBusy(`parte:${pt.id}`) && 'animate-spin'} /></button>
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

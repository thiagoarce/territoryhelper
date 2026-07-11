<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { ocorrenciasEntre, agruparPorData, rangeDoPeriodo, type Periodo } from '$lib/arranjos';
  import { page } from '$app/stores';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import type { ArranjoLinha, ModalidadeLite, ParteLinha } from './$types';

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
      partes: ParteLinha[];
      nomesPorId: Record<string, string>;
      tcesMap: Record<string, string>;
      minhaId: string;
      podeCoordenar: boolean;
      cacheInfo?: { deCache: boolean; gravadoEm: number };
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
  const datasOrdenadas = $derived(Object.keys(ocPorData).sort());
  const modById = $derived(Object.fromEntries(data.modalidades.map((m) => [m.id, m] as const)));

  let acaoEmCurso = $state<string | null>(null);
  let assumindoId = $state<number | null>(null);
  function isBusy(key: string): boolean {
    return acaoEmCurso === key;
  }

  const partesPorArranjo = $derived.by(() => {
    const m: Record<number, ParteLinha[]> = {};
    for (const p of data.partes) (m[p.arranjo_id] ||= []).push(p);
    return m;
  });

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


</script>

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Agenda</h1>
    <p class="text-sm text-slate-500">Saídas em grupo (arranjos) — planeje com antecedência</p>
    <CacheInfoBadge cacheInfo={data.cacheInfo} />
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
        <div class="font-medium">Sem arranjos no período</div>
        <div class="text-sm text-slate-500">Quando uma saída for marcada, aparece aqui.</div>
      </div>
    </Card>
  {:else}
    <div class="grid gap-3">
      {#each datasOrdenadas as dataIso}
        <div>
          <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">
            {new Date(dataIso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
          <div class="grid gap-2">
            {#each ocPorData[dataIso] ?? [] as oc (oc.arranjo.id + '-' + oc.data)}
              {@const a = oc.arranjo}
              {@const m = modById[a.modalidade_id]}
              {@const partesDoArranjo = partesPorArranjo[a.id] ?? []}
              {@const minhaParte = partesDoArranjo.find((p) => p.publicadores.includes(data.minhaId))}
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
                    {#if ((a as any).tces_ids ?? []).length > 0}
                      <div class="mt-1.5 flex flex-wrap gap-1">
                        {#each (a as any).tces_ids as tid}
                          {#if data.tcesMap[tid]}
                            <span class="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded"><Icon nome="store" size={14} /> TCE: {data.tcesMap[tid]}</span>
                          {/if}
                        {/each}
                      </div>
                    {/if}
                    {#if a.arquivo_url}
                      <div class="mt-1"><a href={a.arquivo_url} target="_blank" rel="noopener" class="text-xs text-primary-700 hover:underline"><Icon nome="paperclip" size={14} /> {a.arquivo_nome || 'arquivo'}</a></div>
                    {/if}
                    {#if a.notas}<div class="mt-1 text-xs italic text-slate-500">{a.notas}</div>{/if}

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
                    {#if partesDoArranjo.length > 0}
                      <div class="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                        {partesDoArranjo.length} parte(s) já repartida(s) — <a href="/publicador/casa-a-casa" class="text-primary-700 hover:underline">gerencie em Casa a casa →</a>
                      </div>
                    {:else if (a.quadras_ids?.length ?? 0) > 0 || (a.cartas_locais_ids?.length ?? 0) > 0 || (a.tces_ids?.length ?? 0) > 0}
                      <div class="mt-2 pt-2 border-t border-slate-100">
                        <a href="/publicador/casa-a-casa" class="text-xs font-medium text-primary-700 hover:underline"><Icon nome="scissors" size={14} /> Repartir território (em Casa a casa) →</a>
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
      {/each}
    </div>
  {/if}
</div>

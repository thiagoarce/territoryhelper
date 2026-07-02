<script lang="ts">
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { ocorrenciasDaSemana, agruparPorDia, semanaAtual, DIAS_SEMANA, DIAS_ORDENADOS } from '$lib/arranjos';
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
      publicadores: { id: string; nome: string; role: string }[];
      partes: ParteLinha[];
      nomesPorId: Record<string, string>;
      tcesMap: Record<string, string>;
      minhaId: string;
      podeCoordenar: boolean;
    };
  } = $props();

  const semana = semanaAtual();
  const ocorrencias = $derived(ocorrenciasDaSemana<ArranjoLinha>(data.arranjos));
  const ocPorDia = $derived(agruparPorDia(ocorrencias));
  const modById = $derived(Object.fromEntries(data.modalidades.map((m) => [m.id, m] as const)));
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
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarParte', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success') { toast.success('Removida'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // Link público do arranjo — abre /t/<token> onde dá pra compartilhar
  // com imagem do mapa (WhatsApp)
  async function abrirLinkPublico(arranjoId: number) {
    const fd = new FormData();
    fd.append('arranjo_id', String(arranjoId));
    const res = await fetch('?/gerarLinkTerritorio', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success' && parsed.data?.token) {
      window.open('/t/' + parsed.data.token, '_blank', 'noopener');
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou gerar link'));
    }
  }
</script>

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Arranjo</h1>
    <p class="text-sm text-slate-500">Saídas em grupo desta semana</p>
    <div class="text-xs text-slate-400 mt-1">
      {semana.ini.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
      — {semana.fim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
    </div>
  </div>

  {#if ocorrencias.length === 0}
    <Card padding="md">
      <div class="text-center py-8">
        <div class="text-4xl mb-2 opacity-50">📅</div>
        <div class="font-medium">Sem arranjos esta semana</div>
        <div class="text-sm text-slate-500">Quando uma saída for marcada, aparece aqui.</div>
      </div>
    </Card>
  {:else}
    <div class="grid gap-3">
      {#each DIAS_ORDENADOS as dia}
        {#if (ocPorDia[dia] ?? []).length > 0}
          <div>
            <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">{DIAS_SEMANA[dia]}</div>
            <div class="grid gap-2">
              {#each ocPorDia[dia] ?? [] as oc (oc.arranjo.id + '-' + oc.data)}
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
                        {#if m}<span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 rounded">{m.nome}</span>{/if}
                      </div>
                      <div class="text-sm text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {#if a.hora_inicio}<span>🕒 {a.hora_inicio.substring(0, 5)}{a.hora_fim ? `–${a.hora_fim.substring(0, 5)}` : ''}</span>{/if}
                        {#if a.local_endereco}<span class="truncate">📍 {a.local_endereco}</span>{/if}
                        {#if a.dirigente_id}<span>👤 {data.dirigentes[a.dirigente_id] ?? '?'}</span>{/if}
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
                              ✉ {p?.nome || (p ? `${p.logradouro ?? ''}, ${p.numero ?? ''}` : `#${pid}`)}
                              {#if p} · {p.qtd_entregues}/{p.qtd_aptos}{/if}
                            </a>
                          {/each}
                        </div>
                      {/if}
                      {#if (a as any).tce_id && data.tcesMap[(a as any).tce_id]}
                        <div class="mt-1.5">
                          <span class="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded">🏪 TCE: {data.tcesMap[(a as any).tce_id]}</span>
                        </div>
                      {/if}
                      {#if a.arquivo_url}
                        <div class="mt-1"><a href={a.arquivo_url} target="_blank" rel="noopener" class="text-xs text-primary-700 hover:underline">📎 {a.arquivo_nome || 'arquivo'}</a></div>
                      {/if}
                      {#if a.notas}<div class="mt-1 text-xs italic text-slate-500">{a.notas}</div>{/if}

                      {#if data.podeCoordenar}
                        <button type="button" onclick={() => abrirLinkPublico(a.id)}
                          class="mt-1.5 text-xs text-primary-700 hover:underline">📤 Link público (WhatsApp c/ mapa)</button>
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
                                ✉ {p?.nome || (p ? `${p.logradouro ?? ''}, ${p.numero ?? ''}` : `#${lid}`)}
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
                              <button type="button" onclick={() => apagarParte(pt.id)} class="text-red-600 hover:underline shrink-0">🗑</button>
                            </div>
                          {/each}
                        </div>
                      {/if}
                      {#if (a.quadras_ids?.length ?? 0) > 0 || (a.cartas_locais_ids?.length ?? 0) > 0}
                        <div class="mt-2 pt-2 border-t border-slate-100">
                          <Button variant="primary" onclick={() => abrirRepartir(a)} class="w-full">✂ Repartir território</Button>
                        </div>
                      {/if}
                    {:else}
                      <div class="mt-2 pt-2 border-t border-slate-100">
                        <form
                          method="POST"
                          action="?/assumirArranjo"
                          use:enhance={() => async ({ result, update }) => {
                            await update();
                            if (result.type === 'success') { toast.success(String((result.data as any)?.msg || 'Assumido')); await invalidateAll(); }
                            else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
                          }}
                          onsubmit={(e) => { if (!confirm('Assumir a dirigência deste arranjo?')) e.preventDefault(); }}
                        >
                          <input type="hidden" name="arranjo_id" value={a.id} />
                          <Button variant="secondary" type="submit" class="w-full">👋 Assumir dirigência</Button>
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
      use:enhance={() => { repartindo = true; return async ({ result, update }) => {
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

      <p class="text-xs text-slate-500">Escolha um pedaço do território e quem vai trabalhar (dupla/trio compartilham a mesma parte). Itens acinzentados já estão em outra parte.</p>

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
                <span class="flex-1 truncate">✉ {p?.nome || (p ? `${p.logradouro ?? ''}, ${p.numero ?? ''}` : `#${lid}`)}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}

      <div>
        <span class="block text-sm font-medium mb-1">Publicadores (dupla/trio)</span>
        <div class="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {#each data.publicadores as p}
            <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={pubsSel.has(p.id)} onchange={() => togglePub(p.id)} class="w-4 h-4 rounded" />
              <span class="flex-1">{p.nome}</span>
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

<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { ocorrenciasDaSemana, agruparPorDia, semanaAtual, DIAS_SEMANA, DIAS_ORDENADOS } from '$lib/arranjos';
  import type { ArranjoLinha, ModalidadeLite } from './$types';

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
      minhaId: string;
      podeCoordenar: boolean;
    };
  } = $props();

  const semana = semanaAtual();
  const ocorrencias = $derived(ocorrenciasDaSemana<ArranjoLinha>(data.arranjos));
  const ocPorDia = $derived(agruparPorDia(ocorrencias));
  const modById = $derived(Object.fromEntries(data.modalidades.map((m) => [m.id, m] as const)));

  function tipoLabel(t: string): string {
    if (t === 'quadras') return 'Quadras';
    if (t === 'cartas_lista') return 'Cartas';
    if (t === 'arquivo') return 'Arquivo';
    if (t === 'ponto_tp') return 'TP fixo';
    return t;
  }

  // === Sheet distribuir (dirigente+) ===
  let sheetDist = $state(false);
  let arranjoDist = $state<ArranjoLinha | null>(null);
  let pubsSel = $state<Set<string>>(new Set());
  let prazo = $state('');
  let distribuindo = $state(false);

  function abrirDistribuir(a: ArranjoLinha) {
    arranjoDist = a; pubsSel = new Set(); prazo = ''; sheetDist = true;
  }
  function togglePub(id: string) {
    if (pubsSel.has(id)) pubsSel.delete(id); else pubsSel.add(id);
    pubsSel = new Set(pubsSel);
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
                <Card padding="md">
                  <div class="flex items-start gap-3">
                    <span class="w-2 self-stretch rounded shrink-0" style="background:{m?.cor ?? '#3b82f6'}"></span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold">{a.nome || m?.nome || 'Arranjo'}</span>
                        {#if m}<span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 rounded">{tipoLabel(m.tipo_territorio)}</span>{/if}
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
                      {#if a.arquivo_url}
                        <div class="mt-1"><a href={a.arquivo_url} target="_blank" rel="noopener" class="text-xs text-primary-700 hover:underline">📎 {a.arquivo_nome || 'arquivo'}</a></div>
                      {/if}
                      {#if a.notas}<div class="mt-1 text-xs italic text-slate-500">{a.notas}</div>{/if}
                    </div>
                  </div>
                  {#if data.podeCoordenar}
                    {@const ehMeu = a.dirigente_id === data.minhaId}
                    {#if ehMeu && m?.tipo_territorio === 'quadras' && (a.quadras_ids?.length ?? 0) > 0}
                      <div class="mt-2 pt-2 border-t border-slate-100">
                        <Button variant="primary" onclick={() => abrirDistribuir(a)} class="w-full">Distribuir quadras aos publicadores</Button>
                      </div>
                    {:else if !ehMeu}
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

<BottomSheet bind:open={sheetDist} title="Distribuir quadras">
  {#if arranjoDist}
    <form
      method="POST"
      action="?/distribuirQuadras"
      use:enhance={() => { distribuindo = true; return async ({ result, update }) => {
        await update(); distribuindo = false;
        if (result.type === 'success') {
          toast.success(String((result.data as any)?.msg || 'Distribuído'));
          sheetDist = false; await invalidateAll();
        } else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      }; }}
      class="space-y-3"
    >
      <input type="hidden" name="arranjo_id" value={arranjoDist.id} />
      {#each [...pubsSel] as pid}<input type="hidden" name="publicador_ids" value={pid} />{/each}
      <div class="text-sm">
        <div class="font-medium mb-1">Quadras do arranjo:</div>
        <div class="flex flex-wrap gap-1">
          {#each arranjoDist.quadras_ids ?? [] as q}
            <span class="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{q}</span>
          {/each}
        </div>
        <p class="text-xs text-slate-500 mt-2">Cada publicador selecionado vai receber uma designação com todas essas quadras.</p>
      </div>
      <div>
        <label for="prazo" class="block text-sm font-medium mb-1">Prazo (opcional)</label>
        <input id="prazo" type="date" bind:value={prazo} name="prazo" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <span class="block text-sm font-medium mb-1">Publicadores</span>
        <div class="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {#each data.publicadores as p}
            <label class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={pubsSel.has(p.id)} onchange={() => togglePub(p.id)} class="w-4 h-4 rounded" />
              <span class="flex-1">{p.nome}</span>
              <span class="text-xs text-slate-400">{p.role}</span>
            </label>
          {/each}
        </div>
        <p class="text-xs text-slate-500 mt-1">{pubsSel.size} selecionado(s).</p>
      </div>
      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (sheetDist = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={distribuindo} class="flex-1" disabled={pubsSel.size === 0}>Distribuir</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

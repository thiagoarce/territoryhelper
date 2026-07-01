<script lang="ts">
  import Card from '$lib/ui/Card.svelte';
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
                </Card>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

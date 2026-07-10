<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { invalidateAll } from '$app/navigation';
  import { postComFila } from '$lib/offline';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import QuadraMap from '$lib/components/QuadraMap.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { TceEndereco } from './+page';

  let { data }: {
    data: {
      tce: { id: string; nome: string; tipo: string; prazo: string | null; status: string; notas: string | null };
      enderecos: TceEndereco[];
      cacheInfo?: { deCache: boolean; gravadoEm: number };
    };
  } = $props();

  const feitos = $derived(data.enderecos.filter((e) => e.ultimoTipo || e.cartaEntregue).length);

  // Agrupa por local — um endereço (galeria, prédio comercial) pode ter
  // várias unidades/lojas; mesmo padrão já usado em /publicador/quadra/[id]
  // e /publicador/predios (um card por endereço, unidades aninhadas).
  interface GrupoLocal {
    local_id: number;
    logradouro: string;
    numero: string;
    nome: string | null;
    tipo: string;
    geo_geojson: unknown | null;
    unidades: TceEndereco[];
  }
  const grupos = $derived.by(() => {
    const porLocal = new Map<number, GrupoLocal>();
    for (const e of data.enderecos) {
      const g = porLocal.get(e.local_id);
      if (g) g.unidades.push(e);
      else porLocal.set(e.local_id, { local_id: e.local_id, logradouro: e.logradouro, numero: e.numero, nome: e.nome, tipo: e.tipo, geo_geojson: e.geo_geojson, unidades: [e] });
    }
    return [...porLocal.values()];
  });

  let abertos = $state<Set<number>>(new Set());
  function toggleGrupo(localId: number) {
    if (abertos.has(localId)) abertos.delete(localId);
    else abertos.add(localId);
    abertos = new Set(abertos);
  }

  // W8 ("modo rua"): desfechos/carta com fila offline + overlay otimista
  // (mesmo padrão de /predio/[id] e da tela de quadra).
  let overrideDesfecho = $state<Record<number, string | null>>({});
  let overrideCarta = $state<Record<number, boolean>>({});

  async function marcarDesfechoFila(e: TceEndereco, tipo: string) {
    overrideDesfecho[e.unidade_id] = tipo === '' ? null : tipo;
    const fd = new FormData();
    fd.append('unidade_id', String(e.unidade_id));
    fd.append('tipo', tipo);
    const r = await postComFila('?/marcarDesfecho', fd, `Desfecho em ${e.logradouro}, ${e.numero}${e.complemento ? ' - ' + e.complemento : ''}`);
    if (r.ok) {
      await invalidateAll();
      delete overrideDesfecho[e.unidade_id];
    } else if (r.offline) {
      toast.info('Sem rede — salvo no aparelho, sincroniza sozinho quando voltar');
    } else {
      delete overrideDesfecho[e.unidade_id];
      toast.error(r.erro);
    }
  }

  // W10: concluir TCE também via postComFila.
  let concluindo = $state(false);
  let concluindoOtimista = $state(false);
  async function concluirTceFila() {
    if (!confirm('Concluir este TCE?')) return;
    concluindo = true;
    concluindoOtimista = true;
    const fd = new FormData();
    fd.append('id', data.tce.id);
    const r = await postComFila('?/concluir', fd, `Concluir TCE ${data.tce.nome}`);
    concluindo = false;
    if (r.ok) { toast.success('TCE concluído'); await invalidateAll(); }
    else if (r.offline) toast.info('Sem rede — salvo no aparelho, sincroniza sozinho quando voltar');
    else { concluindoOtimista = false; toast.error(r.erro); }
  }

  async function toggleCartaFila(e: TceEndereco) {
    const atual = e.unidade_id in overrideCarta ? overrideCarta[e.unidade_id] : e.cartaEntregue;
    overrideCarta[e.unidade_id] = !atual;
    const fd = new FormData();
    fd.append('unidade_id', String(e.unidade_id));
    fd.append('undo', String(atual));
    const r = await postComFila('?/toggleCarta', fd, `Carta em ${e.logradouro}, ${e.numero}${e.complemento ? ' - ' + e.complemento : ''}`);
    if (r.ok) {
      await invalidateAll();
      delete overrideCarta[e.unidade_id];
    } else if (r.offline) {
      toast.info('Sem rede — salvo no aparelho, sincroniza sozinho quando voltar');
    } else {
      delete overrideCarta[e.unidade_id];
      toast.error(r.erro);
    }
  }

  function rotuloDesfecho(t: string | null): string {
    if (t === 'conversou') return 'conversou';
    if (t === 'semConversa') return 'sem palestra';
    if (t === 'naoAtendeu') return 'não atendeu';
    return '';
  }
</script>

{#snippet botoesUnidade(e: TceEndereco)}
  {@const tipoEfetivo = e.unidade_id in overrideDesfecho ? overrideDesfecho[e.unidade_id] : e.ultimoTipo}
  {@const cartaEfetiva = e.unidade_id in overrideCarta ? overrideCarta[e.unidade_id] : e.cartaEntregue}
  <div class="mt-2 flex gap-1.5 flex-wrap">
    {#each [
      { tipo: 'naoAtendeu', icone: 'door-closed', rotulo: 'Não atendeu' },
      { tipo: 'semConversa', icone: 'door', rotulo: 'Sem conversa' },
      { tipo: 'conversou', icone: 'chat', rotulo: 'Conversou' }
    ] as opt}
      <button type="button"
        onclick={() => marcarDesfechoFila(e, tipoEfetivo === opt.tipo ? '' : opt.tipo)}
        class="w-10 h-10 rounded-lg border flex items-center justify-center"
        class:bg-green-100={tipoEfetivo === opt.tipo}
        class:border-green-500={tipoEfetivo === opt.tipo}
        class:border-slate-200={tipoEfetivo !== opt.tipo}
        title={opt.rotulo}
        aria-label={opt.rotulo}
      ><Icon nome={opt.icone} size={16} /></button>
    {/each}

    <button type="button"
      onclick={() => toggleCartaFila(e)}
      class="w-10 h-10 rounded-lg border flex items-center justify-center text-lg"
      class:bg-purple-100={cartaEfetiva}
      class:border-purple-500={cartaEfetiva}
      class:border-slate-200={!cartaEfetiva}
      title="Carta entregue"
      aria-label="Carta entregue"
    ><Icon nome="mail" size={14} /></button>
  </div>
{/snippet}

<div class="p-4 space-y-3 pb-24">
  <div>
    <a href="/publicador" class="text-sm text-primary-700">← Voltar</a>
    <h1 class="text-2xl font-bold mt-1"><Icon nome="store" size={14} /> {data.tce.nome}</h1>
    <p class="text-sm text-slate-500">
      {data.enderecos.length} endereço(s) · {feitos} trabalhado(s)
      {#if data.tce.prazo}· prazo {new Date(data.tce.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}{/if}
    </p>
    <CacheInfoBadge cacheInfo={data.cacheInfo} />
  </div>

  {#if data.tce.notas}
    <Card padding="sm"><div class="text-sm text-slate-600 italic">{data.tce.notas}</div></Card>
  {/if}

  {#if grupos.some((g) => g.geo_geojson)}
    <QuadraMap
      quadraGeo={null}
      quadraColor="#f97316"
      locais={grupos.map((g) => ({ ...g, id: g.local_id, unidades: [] })) as any}
      altura={220}
    />
  {/if}

  <div class="space-y-2">
    {#each grupos as g (g.local_id)}
      {@const ehMultiUnidade = g.unidades.length >= 2}
      <div id="local-{g.local_id}" class="rounded-lg border border-slate-200 bg-white">
        {#if ehMultiUnidade}
          <button
            type="button"
            onclick={() => toggleGrupo(g.local_id)}
            class="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50"
          >
            <Icon nome={g.tipo === 'predio' ? 'building' : 'store'} size={14} />
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{g.nome || `${g.logradouro}, ${g.numero}`}</div>
              <div class="text-xs text-slate-500">
                {g.logradouro}, {g.numero} · {g.unidades.length} unidades · {g.unidades.filter((u) => u.ultimoTipo || u.cartaEntregue).length} feitas
              </div>
            </div>
            <span class="text-slate-400">
              {#if abertos.has(g.local_id)}<Icon nome="chevron-down" size={16} />{:else}<Icon nome="chevron-down" size={16} class="inline-block -rotate-90" />{/if}
            </span>
          </button>
          {#if abertos.has(g.local_id)}
            <div class="border-t border-slate-100">
              {#each g.unidades as e, indice (e.unidade_id)}
                <div class="px-3 py-2 border-b border-slate-100 last:border-b-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-sm">{e.complemento || `Unidade ${indice + 1}`}</span>
                    {#if e.ultimoTipo}<span class="text-xs text-green-700">{rotuloDesfecho(e.ultimoTipo)}</span>{/if}
                  </div>
                  {@render botoesUnidade(e)}
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          {@const e = g.unidades[0]}
          <div class="p-3">
            <div class="font-medium truncate">
              {e.nome || `${e.logradouro}, ${e.numero}`}
              {#if e.complemento}<span class="text-slate-400 text-sm">· {e.complemento}</span>{/if}
            </div>
            <div class="text-xs text-slate-500 truncate mt-0.5">{e.logradouro}, {e.numero}</div>
            {#if e.ultimoTipo}
              <div class="text-xs text-green-700 mt-1">{rotuloDesfecho(e.ultimoTipo)}</div>
            {/if}
            {@render botoesUnidade(e)}
          </div>
        {/if}
      </div>
    {:else}
      <Card padding="md"><div class="text-center text-slate-400 py-6">Sem endereços neste TCE.</div></Card>
    {/each}
  </div>
</div>

<!-- Barra de concluir -->
{#if data.tce.status === 'aberto' && !concluindoOtimista}
  <div class="fixed bottom-16 left-0 right-0 z-20 p-3">
    <Button
      type="button"
      variant="success"
      class="w-full"
      loading={concluindo}
      onclick={concluirTceFila}
    ><Icon nome="check" size={14} /> Concluir TCE</Button>
  </div>
{/if}

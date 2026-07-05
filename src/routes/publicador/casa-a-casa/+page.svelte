<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo } from '$lib/server/queries';

  interface ArranjoQueDirijo {
    id: number;
    nome: string;
    quadras_ids: string[];
    cartas_locais_ids: number[];
    interessados: string[];
    quadrasGeo: QuadraGeo[];
  }
  interface MinhaParte {
    id: number;
    arranjo_nome: string;
    colegas: string[];
    quadras_ids: string[];
    locais_ids: number[];
    quadrasGeo: QuadraGeo[];
  }
  interface ParteLinha {
    id: number;
    arranjo_id: number;
    arranjo_nome: string;
    quadras_ids: string[];
    locais_ids: number[];
    publicadores: string[];
    notas: string | null;
  }

  let { data }: {
    data: {
      arranjosQueDirijo: ArranjoQueDirijo[];
      minhasPartes: MinhaParte[];
      partesDosMeusArranjos: ParteLinha[];
      publicadoresParaRepartir: { id: string; nome: string; role: string }[];
      nomesPorId: Record<string, string>;
      territorioPessoal: QuadraGeo[];
      minhaId: string;
    };
  } = $props();

  function abrirQuadra(q: QuadraGeo) {
    window.location.href = '/publicador/quadra/' + encodeURIComponent(q.id);
  }

  const semNada = $derived(
    data.arranjosQueDirijo.length === 0 && data.minhasPartes.length === 0 && data.territorioPessoal.length === 0
  );

  const partesPorArranjo = $derived.by(() => {
    const m: Record<number, ParteLinha[]> = {};
    for (const p of data.partesDosMeusArranjos) (m[p.arranjo_id] ??= []).push(p);
    return m;
  });
  function nomeParte(p: ParteLinha): string {
    return p.publicadores.map((id) => data.nomesPorId[id] ?? '?').join(' + ');
  }

  // === Sheet repartir território (migrou de /publicador/arranjo) ===
  let sheetRepartir = $state(false);
  let arranjoRep = $state<ArranjoQueDirijo | null>(null);
  let pubsSel = $state<Set<string>>(new Set());
  let quadrasSel = $state<Set<string>>(new Set());
  let locaisSel = $state<Set<number>>(new Set());
  let notasParte = $state('');
  let repartindo = $state(false);
  let apagandoId = $state<number | null>(null);

  const jaRepartidas = $derived.by(() => {
    if (!arranjoRep) return { q: new Set<string>(), l: new Set<number>() };
    const partes = partesPorArranjo[arranjoRep.id] ?? [];
    return { q: new Set(partes.flatMap((p) => p.quadras_ids)), l: new Set(partes.flatMap((p) => p.locais_ids)) };
  });

  const publicadoresParaRepartir = $derived.by(() => {
    const interessados = new Set(arranjoRep?.interessados ?? []);
    return [...data.publicadoresParaRepartir].sort((a, b) => {
      const ia = interessados.has(a.id) ? 0 : 1;
      const ib = interessados.has(b.id) ? 0 : 1;
      return ia - ib;
    });
  });

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

  function abrirRepartir(a: ArranjoQueDirijo) {
    arranjoRep = a;
    pubsSel = new Set();
    quadrasSel = new Set();
    locaisSel = new Set();
    notasParte = '';
    sheetRepartir = true;
  }
  function togglePub(id: string) { if (pubsSel.has(id)) pubsSel.delete(id); else pubsSel.add(id); pubsSel = new Set(pubsSel); }
  function toggleQuadra(id: string) { if (quadrasSel.has(id)) quadrasSel.delete(id); else quadrasSel.add(id); quadrasSel = new Set(quadrasSel); }
  function toggleLocal(id: number) { if (locaisSel.has(id)) locaisSel.delete(id); else locaisSel.add(id); locaisSel = new Set(locaisSel); }

  async function apagarParte(id: number) {
    if (!confirm('Remover essa parte? O publicador perde o acesso.')) return;
    apagandoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarParte', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    apagandoId = null;
    if (parsed.type === 'success') { toast.success('Removida'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
</script>

<div class="p-4 space-y-4">
  <div>
    <h1 class="text-2xl font-bold">Casa a casa</h1>
    <p class="text-sm text-slate-500">Seu território agora — use o ponto azul (sua posição) pra saber em qual quadra você está.</p>
  </div>

  {#if semNada}
    <Card padding="md">
      <div class="text-center py-8">
        <Icon nome="door" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Nenhum território designado agora</div>
        <p class="text-sm text-slate-400 mt-1">Território pessoal, parte de pregação em grupo ou arranjo que você dirige aparecem aqui.</p>
      </div>
    </Card>
  {/if}

  {#each data.arranjosQueDirijo as a (a.id)}
    {@const partesDoArranjo = partesPorArranjo[a.id] ?? []}
    <div class="rounded-xl border-2 border-primary-200 bg-primary-50/40 p-3">
      <h2 class="text-xs uppercase tracking-wider font-bold text-primary-900 mb-2 flex items-center gap-2"><Icon nome="tent" size={14} /> Seu grupo — {a.nome}</h2>
      {#if a.quadrasGeo.length > 0}
        <Card padding="sm">
          <AdminMapa quadras={a.quadrasGeo} altura={300} destacarIds={a.quadras_ids} onQuadraClick={abrirQuadra} />
        </Card>
      {/if}
      <div class="flex flex-wrap gap-1.5 mt-2">
        {#each a.quadras_ids as qid}
          <a href="/publicador/quadra/{encodeURIComponent(qid)}" class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-mono border border-primary-200 bg-white text-primary-900 hover:bg-primary-100">{qid}</a>
        {/each}
        {#each a.cartas_locais_ids as lid}
          <a href="/predio/{lid}" class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-lg border border-purple-200 hover:bg-purple-200"><Icon nome="mail" size={14} /> #{lid}</a>
        {/each}
      </div>

      {#if partesDoArranjo.length > 0}
        <div class="mt-2 pt-2 border-t border-primary-100 space-y-1">
          <div class="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Partes já criadas ({partesDoArranjo.length})</div>
          {#each partesDoArranjo as pt (pt.id)}
            <div class="flex items-center gap-2 text-xs bg-white rounded p-1.5">
              <span class="flex-1 min-w-0 truncate">
                <strong>{nomeParte(pt)}</strong> —
                <span class="font-mono">{pt.quadras_ids.join(', ')}</span>
                {#if pt.locais_ids.length > 0}{pt.quadras_ids.length > 0 ? ' + ' : ''}{pt.locais_ids.length} prédio(s){/if}
              </span>
              <button type="button" disabled={apagandoId === pt.id} onclick={() => apagarParte(pt.id)} class="text-red-600 hover:underline shrink-0 disabled:opacity-40">
                <Icon nome={apagandoId === pt.id ? 'loader' : 'trash'} size={14} spin={apagandoId === pt.id} />
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if a.quadras_ids.length > 0 || a.cartas_locais_ids.length > 0}
        <Button variant="primary" onclick={() => abrirRepartir(a)} class="w-full mt-2"><Icon nome="scissors" size={14} /> Repartir território</Button>
      {/if}
    </div>
  {/each}

  {#each data.minhasPartes as p (p.id)}
    <div class="rounded-xl border-2 border-amber-300 bg-amber-50/40 p-3">
      <h2 class="text-xs uppercase tracking-wider font-bold text-amber-900 mb-2 flex items-center gap-2"><Icon nome="walk" size={14} /> Sua parte — {p.arranjo_nome}</h2>
      {#if p.quadrasGeo.length > 0}
        <Card padding="sm">
          <AdminMapa quadras={p.quadrasGeo} altura={300} destacarIds={p.quadras_ids} onQuadraClick={abrirQuadra} />
        </Card>
      {/if}
      <div class="flex flex-wrap gap-1.5 mt-2">
        {#each p.quadras_ids as qid}
          <a href="/publicador/quadra/{encodeURIComponent(qid)}" class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-mono border border-amber-300 bg-white text-amber-900 hover:bg-amber-100">{qid}</a>
        {/each}
        {#each p.locais_ids as lid}
          <a href="/predio/{lid}" class="text-xs bg-amber-100 text-amber-900 px-2 py-1 rounded-lg border border-amber-300 hover:bg-amber-200"><Icon nome="mail" size={14} /> #{lid}</a>
        {/each}
      </div>
      {#if p.colegas.length > 0}<p class="text-xs text-slate-500 mt-1.5">Com {p.colegas.join(', ')}</p>{/if}
    </div>
  {/each}

  {#if data.territorioPessoal.length > 0}
    <div>
      <h2 class="text-xs uppercase tracking-wider font-bold text-slate-600 mb-2 flex items-center gap-2"><Icon nome="target" size={14} /> Território pessoal</h2>
      <Card padding="sm">
        <AdminMapa quadras={data.territorioPessoal} altura={300} destacarIds={data.territorioPessoal.map((q) => q.id)} onQuadraClick={abrirQuadra} />
      </Card>
      <div class="flex flex-wrap gap-1.5 mt-2">
        {#each data.territorioPessoal as q (q.id)}
          <a href="/publicador/quadra/{encodeURIComponent(q.id)}" class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-mono border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100">{q.id}</a>
        {/each}
      </div>
    </div>
  {/if}

  <a href="/publicador/predios" class="block rounded-xl border-2 border-primary-200 bg-primary-50 p-3 hover:bg-primary-100 transition-colors">
    <div class="flex items-center gap-2 text-primary-900 font-medium text-sm">
      <Icon nome="search" size={16} /> Pesquise os prédios do território
    </div>
    <p class="text-xs text-primary-700 mt-0.5">Busca por endereço, GPS de proximidade e designar cartas →</p>
  </a>
</div>

<!-- Sheet repartir: subconjunto do território → 1+ publicadores (mesma parte) -->
<BottomSheet bind:open={sheetRepartir} title="Repartir território">
  {#if arranjoRep}
    <form
      method="POST"
      action="?/criarParte"
      use:enhance={({ cancel }) => {
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
        };
      }}
      class="space-y-3"
    >
      <input type="hidden" name="arranjo_id" value={arranjoRep.id} />
      {#each [...pubsSel] as pid}<input type="hidden" name="publicador_ids" value={pid} />{/each}
      {#each [...quadrasSel] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
      {#each [...locaisSel] as lid}<input type="hidden" name="locais_ids" value={lid} />{/each}

      <p class="text-xs text-slate-500">Toque nas quadras no mapa (ou nos chips) pra montar a parte. Itens acinzentados já estão em outra parte — repartir de novo pede confirmação.</p>

      {#if arranjoRep.quadrasGeo.length > 0}
        <AdminMapa
          quadras={arranjoRep.quadrasGeo}
          selecionadasIds={[...quadrasSel]}
          altura={280}
          onQuadraClick={(q) => toggleQuadra(q.id)}
          legenda={false}
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
          <div class="flex flex-wrap gap-1.5">
            {#each arranjoRep.cartas_locais_ids ?? [] as lid}
              {@const emParte = jaRepartidas.l.has(lid)}
              <button type="button" onclick={() => toggleLocal(lid)}
                class="text-xs px-2 py-1 rounded border {locaisSel.has(lid) ? 'bg-purple-600 text-white border-purple-600' : emParte ? 'bg-slate-100 text-slate-400 border-slate-200' : 'border-slate-300 hover:bg-slate-50'}"
              ><Icon nome="mail" size={12} /> #{lid}</button>
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

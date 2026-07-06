<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { postComFila } from '$lib/offline';

  interface UnidadeEnriched {
    id: number;
    complemento: string | null;
    carta_entregue: string | null;
    carta_escrita_por_nome?: string | null;
    desocupado: boolean;
    nao_escrever: boolean;
    nota: string | null;
    ultimo_tipo: string | null;
    ultimo_ts: string | null;
  }

  let { data }: {
    data: {
      predio: {
        id: number;
        nome: string | null;
        tipo: string;
        logradouro: string;
        numero: string;
        tipo_entrada: string | null;
        acesso_caixas: boolean;
        acesso_interfones: boolean;
        irmao_mora: boolean;
        nome_irmao: string | null;
        notas: string | null;
        unidades: UnidadeEnriched[];
      };
      minhaRole?: string;
    };
  } = $props();

  type Modo = 'casa' | 'cartas';
  let modo = $state<Modo>('cartas');

  // Persiste modo no localStorage por conveniência
  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const salvo = localStorage.getItem('predio_modo');
      if (salvo === 'casa' || salvo === 'cartas') modo = salvo;
    } catch {}
  });
  function trocarModo(m: Modo) {
    modo = m;
    try { localStorage.setItem('predio_modo', m); } catch {}
  }

  const cores: Record<string, string> = {
    naoAtendeu: 'bg-slate-200 text-slate-700',
    semConversa: 'bg-amber-200 text-amber-900',
    conversou: 'bg-green-200 text-green-900',
    carta: 'bg-purple-200 text-purple-900',
    desfeito: 'bg-slate-100 text-slate-500'
  };
  const rotulos: Record<string, string> = {
    naoAtendeu: 'Não atendeu',
    semConversa: 'Sem palestra',
    conversou: 'Conversou',
    carta: 'Deixou carta',
    desfeito: 'Desfeito'
  };

  function fmtDataCarta(iso: string): string {
    return new Date(iso.substring(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
  }

  // Rótulo de cada unidade na lista. `complemento` (ex: "Apto 101", "Sala 2")
  // é o dado real; sem ele, cai pra `nota` (texto livre da migração) e só em
  // último caso pra uma numeração sequencial — nunca o id bruto do banco,
  // que não tem significado nenhum pra quem olha a tela (ex: comércio com
  // uma unidade só, sem apto/sala, mostrava "Apto 2656").
  function rotuloUnidade(u: UnidadeEnriched, indice: number): string {
    if (u.complemento) return u.complemento;
    if (u.nota) return u.nota;
    if (data.predio.tipo === 'comercio') {
      return data.predio.unidades.length > 1 ? `Unidade ${indice + 1}` : data.predio.nome || 'Estabelecimento';
    }
    return `Apto ${indice + 1}`;
  }

  function unidadeVisitada(u: UnidadeEnriched): boolean {
    return !!u.ultimo_tipo && u.ultimo_tipo !== 'desfeito' && u.ultimo_tipo !== 'carta_undo';
  }

  // Escrita resiliente a sinal ruim: tenta enviar, se a rede falhar de
  // verdade enfileira em IndexedDB (sincroniza sozinho quando voltar —
  // ver $lib/offline). Overlay local dá feedback otimista imediato.
  let overrideDesfecho = $state<Record<number, string>>({});
  let overrideCartas = $state<Record<number, Partial<Record<'carta_entregue' | 'desocupado' | 'nao_escrever', boolean>>>>({});

  function tipoEfetivo(u: UnidadeEnriched): string | null {
    return u.id in overrideDesfecho ? (overrideDesfecho[u.id] || null) : u.ultimo_tipo;
  }
  function campoEfetivo(u: UnidadeEnriched, campo: 'carta_entregue' | 'desocupado' | 'nao_escrever'): boolean {
    const ov = overrideCartas[u.id];
    if (ov && campo in ov) return !!ov[campo];
    return campo === 'carta_entregue' ? !!u.carta_entregue : !!(u as any)[campo];
  }

  async function marcarDesfecho(u: UnidadeEnriched, tipo: string) {
    const marcandoNovoDesfecho = tipoEfetivo(u) !== tipo;
    const novoTipo = marcandoNovoDesfecho ? tipo : '';
    overrideDesfecho = { ...overrideDesfecho, [u.id]: novoTipo };
    if (marcandoNovoDesfecho) irParaProximoPendente(u.id);
    const fd = new FormData();
    fd.append('unidade_id', String(u.id));
    fd.append('tipo', novoTipo);
    const r = await postComFila('?/marcarDesfecho', fd);
    if (!r.ok && r.offline) {
      toast.info('Salvo offline — sincroniza quando o sinal voltar');
    } else if (!r.ok) {
      toast.error(r.erro);
      const { [u.id]: _omit, ...resto } = overrideDesfecho; overrideDesfecho = resto;
    } else {
      const { [u.id]: _omit, ...resto } = overrideDesfecho; overrideDesfecho = resto;
      await invalidateAll();
    }
  }

  async function toggleCarta(u: UnidadeEnriched, campo: 'carta_entregue' | 'desocupado' | 'nao_escrever') {
    const novoValor = !campoEfetivo(u, campo);
    overrideCartas = { ...overrideCartas, [u.id]: { ...(overrideCartas[u.id] ?? {}), [campo]: novoValor } };
    if (campo === 'carta_entregue' && novoValor) irParaProximoPendente(u.id);
    const fd = new FormData();
    fd.append('unidade_id', String(u.id));
    fd.append('campo', campo);
    const r = await postComFila('?/toggle', fd);
    if (!r.ok && r.offline) {
      toast.info('Salvo offline — sincroniza quando o sinal voltar');
    } else if (!r.ok) {
      toast.error(r.erro);
      const atual = { ...overrideCartas }; delete atual[u.id]; overrideCartas = atual;
    } else {
      const atual = { ...overrideCartas }; delete atual[u.id]; overrideCartas = atual;
      await invalidateAll();
    }
  }

  // Swipe pra próximo apto: navegação por gesto (walking door-to-door com
  // uma mão só) + auto-avanço pro próximo pendente ao marcar um desfecho.
  let cardRefs: Record<number, HTMLDivElement> = {};
  let focoId = $state<number | null>(null);
  let focoTimer: ReturnType<typeof setTimeout> | undefined;

  function irPara(id: number) {
    focoId = id;
    cardRefs[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (focoTimer) clearTimeout(focoTimer);
    focoTimer = setTimeout(() => { focoId = null; }, 1400);
  }

  function pendente(u: UnidadeEnriched): boolean {
    return modo === 'cartas' ? !campoEfetivo(u, 'carta_entregue') : !tipoEfetivo(u);
  }

  // Próximo apto ainda pendente depois do atual (não pula pra trás)
  function irParaProximoPendente(unidadeAtualId: number) {
    const lista = data.predio.unidades;
    const i = lista.findIndex((x) => x.id === unidadeAtualId);
    if (i < 0) return;
    const alvo = lista.slice(i + 1).find(pendente);
    if (alvo) irPara(alvo.id);
  }

  function vizinho(unidadeAtualId: number, direcao: 1 | -1): number | null {
    const lista = data.predio.unidades;
    const i = lista.findIndex((x) => x.id === unidadeAtualId);
    const j = i + direcao;
    return j >= 0 && j < lista.length ? lista[j].id : null;
  }

  let touchStartX = 0, touchStartY = 0, touchUnidadeId: number | null = null;
  function onTouchStart(e: TouchEvent, uid: number) {
    const t = e.touches[0];
    touchStartX = t.clientX; touchStartY = t.clientY; touchUnidadeId = uid;
  }
  function onTouchEnd(e: TouchEvent) {
    if (touchUnidadeId == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    // Swipe horizontal de verdade: bem maior que o deslocamento vertical
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const alvo = vizinho(touchUnidadeId, dx < 0 ? 1 : -1); // esquerda = próximo
      if (alvo != null) irPara(alvo);
    }
    touchUnidadeId = null;
  }

  const visitadas = $derived(data.predio.unidades.filter(unidadeVisitada).length);
  const entregues = $derived(data.predio.unidades.filter((u) => u.carta_entregue).length);
  const total = $derived(data.predio.unidades.length);

  function voltar() {
    if (typeof history !== 'undefined' && history.length > 1) history.back();
    else location.href = '/publicador/predios';
  }

  // Edit sheet
  let sheetEditar = $state(false);
  let salvandoEditar = $state(false);
  let irmaoMora = $state(data.predio.irmao_mora);
  let compartilhando = $state(false);

  async function compartilharWhatsApp() {
    compartilhando = true;
    try {
      const res = await fetch('?/gerarLink', { method: 'POST', body: new FormData() });
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success' && result.data?.token) {
        const url = `${window.location.origin}/cartas/${result.data.token}`;
        const nome = data.predio.nome || `${data.predio.logradouro}, ${data.predio.numero}`;
        const msg = `Trabalho de cartas — *${nome}*\n\n${url}`;
        window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener');
        return;
      }
      throw new Error(result.data?.erro || 'sem token');
    } catch { toast.error('Não consegui gerar o link'); }
    finally { compartilhando = false; }
  }
</script>

<svelte:head>
  <title>{data.predio.nome || data.predio.logradouro}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pb-24">
  <!-- Header -->
  <div class="bg-primary-600 text-white px-4 py-4">
    <div class="flex items-center gap-2 mb-2">
      <button type="button" onclick={voltar} class="text-xs opacity-90 hover:opacity-100">← Voltar</button>
      <div class="ml-auto flex gap-1">
        <button type="button" onclick={() => (sheetEditar = true)} title="Editar prédio"
          class="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center"><Icon nome="pencil" size={14} /></button>
        <button type="button" disabled={compartilhando} onclick={compartilharWhatsApp} title="Compartilhar cartas"
          class="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center disabled:opacity-50"><Icon nome={compartilhando ? 'loader' : 'share'} size={14} spin={compartilhando} /></button>
      </div>
    </div>
    <h1 class="text-xl font-bold">{data.predio.nome || `${data.predio.logradouro}, ${data.predio.numero}`}</h1>
    <div class="text-sm opacity-90 mt-0.5">{data.predio.logradouro}, {data.predio.numero}</div>

    <div class="mt-3 flex flex-wrap gap-1.5 text-xs">
      {#if data.predio.tipo_entrada === 'porteiro'}<span class="bg-white/20 px-2 py-1 rounded"><Icon nome="door" size={14} /> Porteiro</span>{/if}
      {#if data.predio.tipo_entrada === 'eletronica'}<span class="bg-white/20 px-2 py-1 rounded"><Icon nome="plug" size={14} /> Eletrônica</span>{/if}
      {#if data.predio.acesso_caixas}<span class="bg-white/20 px-2 py-1 rounded"><Icon nome="inbox" size={14} /> Caixas</span>{/if}
      {#if data.predio.acesso_interfones}<span class="bg-white/20 px-2 py-1 rounded"><Icon nome="phone" size={14} /> Interfones</span>{/if}
      {#if data.predio.irmao_mora}<span class="bg-white/20 px-2 py-1 rounded"><Icon nome="user" size={14} /> Irmão{data.predio.nome_irmao ? `: ${data.predio.nome_irmao}` : ''}</span>{/if}
    </div>

    <!-- Progresso duplo (visitados + entregues) -->
    <div class="mt-4 grid grid-cols-2 gap-3">
      <div>
        <div class="flex justify-between text-xs mb-0.5"><span><Icon nome="door" size={14} /> Visitados</span><span class="font-bold">{visitadas}/{total}</span></div>
        <div class="h-2 rounded-full bg-white/30 overflow-hidden">
          <div class="h-full bg-white" style:width="{total === 0 ? 0 : (visitadas / total) * 100}%"></div>
        </div>
      </div>
      <div>
        <div class="flex justify-between text-xs mb-0.5"><span><Icon nome="mail" size={14} /> Escritas</span><span class="font-bold">{entregues}/{total}</span></div>
        <div class="h-2 rounded-full bg-white/30 overflow-hidden">
          <div class="h-full bg-white" style:width="{total === 0 ? 0 : (entregues / total) * 100}%"></div>
        </div>
      </div>
    </div>

    {#if data.predio.notas}<p class="mt-3 text-sm bg-white/10 rounded p-2 italic">{data.predio.notas}</p>{/if}
  </div>

  <!-- Toggle modo -->
  <div class="sticky top-0 z-10 bg-slate-50 px-4 pt-3 pb-2 border-b border-slate-200">
    <div class="flex gap-1 bg-white border border-slate-200 rounded-lg p-0.5 max-w-md mx-auto">
      <button
        type="button"
        onclick={() => trocarModo('casa')}
        class="flex-1 px-3 py-2 text-sm rounded transition-colors"
        class:bg-primary-600={modo === 'casa'}
        class:text-white={modo === 'casa'}
        class:font-medium={modo === 'casa'}
        class:text-slate-600={modo !== 'casa'}
      ><Icon nome="door" size={14} /> Casa em casa</button>
      <button
        type="button"
        onclick={() => trocarModo('cartas')}
        class="flex-1 px-3 py-2 text-sm rounded transition-colors"
        class:bg-primary-600={modo === 'cartas'}
        class:text-white={modo === 'cartas'}
        class:font-medium={modo === 'cartas'}
        class:text-slate-600={modo !== 'cartas'}
      ><Icon nome="mail" size={14} /> Cartas</button>
    </div>
  </div>

  <!-- Lista (swipe esquerda/direita navega entre aptos) -->
  <div class="p-4 space-y-1">
    {#each data.predio.unidades as u, indice (u.id)}
      {@const st = u.nao_escrever ? 'naoescrever' : u.desocupado ? 'desocupado' : u.carta_entregue ? 'entregue' : 'pendente'}
      <div
        bind:this={cardRefs[u.id]}
        ontouchstart={(e) => onTouchStart(e, u.id)}
        ontouchend={onTouchEnd}
        class="rounded-lg border p-3 transition-all"
        class:ring-2={focoId === u.id}
        class:ring-primary-500={focoId === u.id}
        class:bg-purple-50={modo === 'cartas' && st === 'entregue'}
        class:border-purple-200={modo === 'cartas' && st === 'entregue'}
        class:bg-slate-100={modo === 'cartas' && st === 'desocupado'}
        class:border-slate-300={modo === 'cartas' && st === 'desocupado'}
        class:bg-red-50={modo === 'cartas' && st === 'naoescrever'}
        class:border-red-200={modo === 'cartas' && st === 'naoescrever'}
        class:bg-white={modo !== 'cartas' || st === 'pendente'}
        class:border-slate-200={modo !== 'cartas' || st === 'pendente'}
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="font-mono font-semibold text-sm">{rotuloUnidade(u, indice)}</div>
            {#if modo === 'cartas' && campoEfetivo(u, 'carta_entregue')}<div class="text-xs text-purple-700"><Icon nome="mail" size={14} /> escrita {u.carta_entregue ? fmtDataCarta(u.carta_entregue) : 'hoje'}{#if u.carta_escrita_por_nome}<span class="text-purple-500"> · {u.carta_escrita_por_nome}</span>{/if}</div>{/if}
            {#if modo === 'casa' && tipoEfetivo(u) && tipoEfetivo(u) !== 'desfeito' && tipoEfetivo(u) !== 'carta_undo'}
              <span class="inline-block text-xs rounded px-2 py-0.5 mt-1 {cores[tipoEfetivo(u)!] ?? 'bg-slate-100'}">{rotulos[tipoEfetivo(u)!] ?? tipoEfetivo(u)}</span>
            {/if}
          </div>

          {#if modo === 'cartas'}
            <div class="flex gap-1">
              {#each [
                { c: 'carta_entregue' as const, icone: 'mail', cls: 'bg-purple-600', l: 'Carta escrita' },
                { c: 'desocupado' as const, icone: 'door-closed', cls: 'bg-slate-600', l: 'Desocupado' },
                { c: 'nao_escrever' as const, icone: 'ban', cls: 'bg-red-600', l: 'Não escrever' }
              ] as opt}
                {@const ativo = campoEfetivo(u, opt.c)}
                <button
                  type="button"
                  onclick={() => toggleCarta(u, opt.c)}
                  title={opt.l}
                  aria-label={opt.l}
                  class="px-2 py-1.5 rounded border flex flex-col items-center gap-0.5 {ativo ? opt.cls + ' text-white border-transparent' : 'border-slate-300 bg-white hover:bg-slate-50'}"
                ><Icon nome={opt.icone} size={16} /><span class="text-[9px] leading-none whitespace-nowrap">{opt.l}</span></button>
              {/each}
            </div>
          {:else}
            <div class="flex gap-1">
              {#each [
                { t: 'conversou', icone: 'chat', cls: 'bg-green-600', l: 'Conversou' },
                { t: 'semConversa', icone: 'door', cls: 'bg-amber-600', l: 'Sem palestra' },
                { t: 'naoAtendeu', icone: 'door-closed', cls: 'bg-slate-600', l: 'Não atendeu' },
                { t: 'carta', icone: 'mail', cls: 'bg-purple-600', l: 'Deixou carta' }
              ] as opt}
                {@const ativo = tipoEfetivo(u) === opt.t}
                {@const entregaPendente = opt.t === 'carta' && !ativo && campoEfetivo(u, 'carta_entregue') && tipoEfetivo(u) !== 'carta'}
                <button
                  type="button"
                  onclick={() => marcarDesfecho(u, opt.t)}
                  title={entregaPendente ? 'Carta escrita — falta entregar' : opt.l}
                  aria-label={opt.l}
                  class="px-2 py-1.5 rounded border flex flex-col items-center gap-0.5 {ativo ? opt.cls + ' text-white border-transparent' : entregaPendente ? 'border-purple-400 bg-purple-50 text-purple-800 ring-2 ring-purple-300 animate-pulse' : 'border-slate-300 bg-white hover:bg-slate-50'}"
                ><Icon nome={opt.icone} size={16} /><span class="text-[9px] leading-none whitespace-nowrap">{opt.l}</span></button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<!-- Sheet editar prédio -->
<BottomSheet bind:open={sheetEditar} title="Editar prédio">
  <form
    method="POST"
    action="?/atualizarLocal"
    use:enhance={() => { salvandoEditar = true; return async ({ result, update }) => {
      await update(); salvandoEditar = false;
      if (result.type === 'success') { toast.success('Salvo'); sheetEditar = false; await invalidateAll(); }
      else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
    }; }}
    class="space-y-3"
  >
    <div class="text-xs text-slate-500">{data.predio.logradouro}, {data.predio.numero} · {data.predio.unidades.length} apto(s)</div>

    <div>
      <label for="nome" class="block text-sm font-medium mb-1">Nome do edifício</label>
      <input id="nome" name="nome" value={data.predio.nome ?? ''} placeholder="Ex: Edif. Solar" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div>
      <span class="block text-sm font-medium mb-2">Portaria</span>
      <div class="grid grid-cols-3 gap-2">
        {#each [{ v: 'porteiro', l: 'Porteiro', icone: 'shield' }, { v: 'eletronica', l: 'Eletrônica', icone: 'circle-dot' }, { v: 'sem', l: 'Sem', icone: 'door' }] as opt}
          <label class="cursor-pointer">
            <input type="radio" name="tipo_entrada" value={opt.v} checked={data.predio.tipo_entrada === opt.v} class="peer sr-only" />
            <div class="text-center text-sm px-2 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">
              <div><Icon nome={opt.icone} size={18} /></div>
              <div class="text-xs">{opt.l}</div>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
        <input type="checkbox" name="acesso_caixas" checked={data.predio.acesso_caixas} class="w-4 h-4 rounded" />
        <span class="text-sm"><Icon nome="inbox" size={14} /> Caixas</span>
      </label>
      <label class="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
        <input type="checkbox" name="acesso_interfones" checked={data.predio.acesso_interfones} class="w-4 h-4 rounded" />
        <span class="text-sm"><Icon nome="phone" size={14} /> Interfones</span>
      </label>
    </div>

    <div class="rounded-lg bg-amber-50 border border-amber-200 p-3">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" name="irmao_mora" bind:checked={irmaoMora} class="w-4 h-4 rounded" />
        <span class="text-sm font-medium"><Icon nome="user" size={14} /> Irmão mora aqui</span>
      </label>
      {#if irmaoMora}
        <input name="nome_irmao" value={data.predio.nome_irmao ?? ''} placeholder="Nome do irmão" class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {/if}
    </div>

    <div>
      <label for="notas" class="block text-sm font-medium mb-1"><Icon nome="file-text" size={14} /> Notas</label>
      <textarea id="notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{data.predio.notas ?? ''}</textarea>
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetEditar = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvandoEditar} class="flex-1">Salvar</Button>
    </div>
  </form>
</BottomSheet>

<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance, deserialize } from '$app/forms';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { PredioCampo } from './$types';

  let { data }: {
    data: {
      predios: PredioCampo[];
      q: string;
      lat: number | null;
      lng: number | null;
    };
  } = $props();

  let q = $state(data.q);
  let lat = $state<number | null>(data.lat);
  let lng = $state<number | null>(data.lng);
  let carregandoGPS = $state(false);

  // Filtros (mesmo modelo do /admin/predios)
  let filtroTipo = $state<'todos' | 'residencial' | 'comercial'>('todos');
  let filtroPortaria = $state<'todos' | 'porteiro' | 'eletronica' | 'sem' | 'sem_info'>('todos');
  let soComIrmao = $state(false);
  let soComCaixas = $state(false);
  let soComInterfone = $state(false);
  let soPendentes = $state(false);
  let mostrarFiltros = $state(false);

  let timer: any = null;
  $effect(() => {
    const _tick = q + '|' + lat + '|' + lng; // deps rastreadas
    clearTimeout(timer);
    timer = setTimeout(() => {
      const url = new URL(window.location.href);
      if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
      if (lat != null && lng != null) {
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lng', String(lng));
      } else {
        url.searchParams.delete('lat');
        url.searchParams.delete('lng');
      }
      if (url.search !== window.location.search) goto(url.toString(), { keepFocus: true, noScroll: true, replaceState: true });
    }, 250);
  });

  function usarLocalizacao() {
    if (!navigator.geolocation) { toast.warn('Geolocation não disponível'); return; }
    carregandoGPS = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        carregandoGPS = false;
        toast.success('Localização OK — ordenando por proximidade');
      },
      (err) => { carregandoGPS = false; toast.error('Falhou GPS: ' + err.message); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }
  function limparGeo() { lat = null; lng = null; }

  // Stats por tipo (usados nos tabs)
  const stats = $derived.by(() => ({
    residencial: data.predios.filter((p) => p.tipo === 'predio' && !p.pendente).length,
    comercial: data.predios.filter((p) => p.tipo === 'comercio' && !p.pendente).length,
    pendentes: data.predios.filter((p) => p.pendente).length
  }));

  // Filtro composto (mesma lógica de /admin/predios)
  const filtrados = $derived(
    data.predios.filter((p) => {
      // Pendentes é filtro exclusivo — quando ON, mostra SÓ pendentes
      if (soPendentes && !p.pendente) return false;
      if (!soPendentes && p.pendente) return false;

      if (filtroTipo === 'residencial' && p.tipo !== 'predio') return false;
      if (filtroTipo === 'comercial' && p.tipo !== 'comercio') return false;

      if (filtroPortaria !== 'todos') {
        if (filtroPortaria === 'sem_info' && p.tipo_entrada != null) return false;
        else if (filtroPortaria !== 'sem_info' && p.tipo_entrada !== filtroPortaria) return false;
      }
      if (soComIrmao && !p.irmao_mora) return false;
      if (soComCaixas && !p.acesso_caixas) return false;
      if (soComInterfone && !p.acesso_interfones) return false;

      if (q.trim()) {
        const b = q.toLowerCase();
        if (!((p.nome || '').toLowerCase().includes(b) ||
              p.logradouro.toLowerCase().includes(b) ||
              p.numero.toLowerCase().includes(b))) return false;
      }
      return true;
    })
  );

  function limparFiltros() {
    filtroTipo = 'todos';
    filtroPortaria = 'todos';
    soComIrmao = false;
    soComCaixas = false;
    soComInterfone = false;
  }

  const filtrosAtivos = $derived(
    (filtroTipo !== 'todos' ? 1 : 0) +
    (filtroPortaria !== 'todos' ? 1 : 0) +
    (soComIrmao ? 1 : 0) +
    (soComCaixas ? 1 : 0) +
    (soComInterfone ? 1 : 0)
  );

  // Sheet criar prédio pendente
  let sheetCriar = $state(false);
  let salvandoNovo = $state(false);

  async function compartilharWhatsApp(predioId: number, nome: string | null, logradouro: string, numero: string) {
    try {
      const fd = new FormData();
      fd.append('id', String(predioId));
      const res = await fetch('?/gerarLink', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success' && result.data?.token) {
        const url = `${window.location.origin}/cartas/${result.data.token}`;
        const msg = `Trabalho de cartas — *${nome || logradouro + ', ' + numero}*\n\n${url}`;
        window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
        return;
      }
      throw new Error(result.data?.erro || 'sem token');
    } catch {
      toast.error('Não consegui gerar o link');
    }
  }

  function pct(feitas: number, total: number): number {
    return total === 0 ? 0 : Math.round((feitas / total) * 100);
  }
</script>

<div class="p-4 max-w-4xl mx-auto pb-24">
  <div class="flex items-start justify-between gap-3 flex-wrap">
    <div>
      <h1 class="text-2xl font-bold">Prédios — Cartas</h1>
      <p class="text-sm text-slate-500">
        {filtrados.length} de {data.predios.length} · 🏢 {stats.residencial} residenciais · 🏪 {stats.comercial} comerciais
      </p>
    </div>
    <Button variant="primary" size="sm" onclick={() => (sheetCriar = true)}>➕ Novo</Button>
  </div>

  <input
    type="search"
    bind:value={q}
    placeholder="Buscar logradouro, nome..."
    class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
  />

  <!-- Tabs por tipo -->
  <div class="mt-2 flex gap-1 rounded-lg bg-slate-100 p-0.5">
    {#each [['todos', `Todos (${data.predios.filter(p => !p.pendente).length})`], ['residencial', `🏢 Residencial (${stats.residencial})`], ['comercial', `🏪 Comercial (${stats.comercial})`]] as [k, l]}
      <button
        onclick={() => (filtroTipo = k as any)}
        class="flex-1 px-2 py-1.5 text-xs rounded transition-colors"
        class:bg-white={filtroTipo === k}
        class:font-medium={filtroTipo === k}
        class:shadow-sm={filtroTipo === k}
        class:text-slate-500={filtroTipo !== k}
      >{l}</button>
    {/each}
  </div>

  <!-- Ações: filtros avançados + geolocation + pendentes -->
  <div class="mt-2 flex items-center gap-2 flex-wrap">
    <button
      onclick={() => (mostrarFiltros = !mostrarFiltros)}
      class="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5"
    >
      ⚙ Filtros{#if filtrosAtivos > 0}<span class="bg-primary-600 text-white text-[10px] px-1.5 rounded-full">{filtrosAtivos}</span>{/if}
    </button>
    {#if filtrosAtivos > 0}
      <button onclick={limparFiltros} class="text-xs text-slate-500 hover:underline">Limpar</button>
    {/if}
    {#if lat == null || lng == null}
      <Button variant="secondary" size="sm" onclick={usarLocalizacao} loading={carregandoGPS}>📍 Proximidade</Button>
    {:else}
      <span class="text-xs bg-green-50 border border-green-200 text-green-800 px-2 py-1 rounded">📍 GPS</span>
      <button type="button" onclick={limparGeo} class="text-xs text-red-600 hover:underline">Limpar GPS</button>
    {/if}
    {#if stats.pendentes > 0}
      <button
        type="button"
        onclick={() => (soPendentes = !soPendentes)}
        class="text-xs px-2 py-1 rounded border font-medium ml-auto"
        class:bg-amber-100={soPendentes}
        class:border-amber-500={soPendentes}
        class:text-amber-800={soPendentes}
        class:border-amber-300={!soPendentes}
        class:bg-amber-50={!soPendentes}
        class:text-amber-700={!soPendentes}
      >⏳ Pendentes ({stats.pendentes})</button>
    {/if}
  </div>

  {#if mostrarFiltros}
    <div class="mt-2 rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50">
      <div>
        <span class="block text-xs font-medium text-slate-600 mb-1">Portaria</span>
        <div class="flex gap-1 flex-wrap">
          {#each [['todos', 'Todos'], ['porteiro', '👮 Porteiro'], ['eletronica', '🔘 Eletrônica'], ['sem', '🚪 Sem'], ['sem_info', 'Sem info']] as [k, l]}
            <button
              onclick={() => (filtroPortaria = k as any)}
              class="text-xs px-2 py-1 rounded border"
              class:bg-primary-100={filtroPortaria === k}
              class:border-primary-500={filtroPortaria === k}
              class:text-primary-700={filtroPortaria === k}
              class:border-slate-300={filtroPortaria !== k}
              class:bg-white={filtroPortaria !== k}
            >{l}</button>
          {/each}
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label class="flex items-center gap-2 cursor-pointer p-2 bg-white border border-slate-200 rounded-lg">
          <input type="checkbox" bind:checked={soComIrmao} class="w-4 h-4 rounded" />
          <span class="text-sm">👤 Só com irmão</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer p-2 bg-white border border-slate-200 rounded-lg">
          <input type="checkbox" bind:checked={soComCaixas} class="w-4 h-4 rounded" />
          <span class="text-sm">📬 Só com caixas</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer p-2 bg-white border border-slate-200 rounded-lg">
          <input type="checkbox" bind:checked={soComInterfone} class="w-4 h-4 rounded" />
          <span class="text-sm">📞 Só com interfone</span>
        </label>
      </div>
    </div>
  {/if}

  <div class="mt-3 space-y-2">
    {#each filtrados as p (p.id)}
      <div class="rounded-lg border bg-white p-3 flex items-start gap-3"
        class:border-amber-400={p.pendente}
        class:bg-amber-50={p.pendente}
        class:border-slate-200={!p.pendente}
      >
        <a
          href="/predio/{p.id}"
          class="flex-1 text-left min-w-0"
        >
          <div class="font-semibold truncate flex items-center gap-1.5">
            <span title={p.tipo === 'comercio' ? 'Comercial' : 'Residencial'}>{p.tipo === 'comercio' ? '🏪' : '🏢'}</span>
            {p.nome || `${p.logradouro}, ${p.numero}`}
            {#if p.irmao_mora}<span title="Irmão mora">👤</span>{/if}
            {#if p.pendente}<span class="text-[9px] bg-amber-600 text-white px-1.5 py-0.5 rounded font-medium">⏳ pendente</span>{/if}
          </div>
          <div class="text-xs text-slate-500 truncate mt-0.5">
            {p.logradouro}, {p.numero} · {p.qtd_aptos} {p.tipo === 'comercio' ? 'unidade' : 'apto'}(s)
            {#if p.quadra_id}· Q{p.quadra_id}{/if}
            {#if p.distancia_m != null}· <strong class="text-primary-700">{Math.round(p.distancia_m)}m</strong>{/if}
          </div>
          <div class="mt-2 flex gap-1 flex-wrap">
            {#if p.tipo_entrada === 'porteiro'}<span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Porteiro</span>{/if}
            {#if p.tipo_entrada === 'eletronica'}<span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Eletrônica</span>{/if}
            {#if p.acesso_caixas}<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📬</span>{/if}
            {#if p.acesso_interfones}<span class="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📞</span>{/if}
            <span class="text-[10px] text-slate-500 ml-auto">{p.qtd_carta_entregue}/{p.qtd_aptos} entregues</span>
          </div>
          <div class="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full bg-purple-500" style:width="{pct(p.qtd_carta_entregue, p.qtd_aptos)}%"></div>
          </div>
        </a>
        <button
          type="button"
          onclick={() => compartilharWhatsApp(p.id, p.nome, p.logradouro, p.numero)}
          aria-label="Compartilhar no WhatsApp"
          class="w-10 h-10 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 flex items-center justify-center shrink-0"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1-.3-.1-1.2-.4-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.4.1-.5.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.3 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.5h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2 0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.2.7 3 .6.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.2-.2-.4-.3M12 21c-1.6 0-3.2-.4-4.6-1.3l-.3-.2-3.4.9.9-3.3-.2-.3C3.5 15.4 3 13.7 3 12c0-5 4-9 9-9s9 4 9 9-4 9-9 9m0-20C6 1 1 6 1 12c0 1.9.5 3.8 1.5 5.4L1 23l5.7-1.5c1.6.9 3.4 1.4 5.3 1.4 6 0 11-5 11-11S18 1 12 1"/></svg>
        </button>
      </div>
    {:else}
      <div class="text-center py-8">
        <div class="text-4xl mb-2 opacity-60">🏢</div>
        <div class="text-slate-500 mb-3">Nenhum prédio bate</div>
        <Button variant="primary" onclick={() => (sheetCriar = true)}>➕ Criar prédio pendente</Button>
      </div>
    {/each}
  </div>
</div>

<!-- Sheet criar prédio pendente -->
<BottomSheet bind:open={sheetCriar} title="Criar prédio pendente">
  <form
    method="POST"
    action="?/criarPredioPendente"
    use:enhance={() => { salvandoNovo = true; return async ({ result, update }) => {
      await update(); salvandoNovo = false;
      if (result.type === 'success') {
        toast.success(String((result.data as any)?.msg || 'Criado'));
        sheetCriar = false;
        const id = (result.data as any)?.id;
        if (id) goto('/predio/' + id);
      } else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
    }; }}
    class="space-y-3"
  >
    {#if lat != null}<input type="hidden" name="lat" value={lat} />{/if}
    {#if lng != null}<input type="hidden" name="lng" value={lng} />{/if}

    <div>
      <label for="nome-p" class="block text-sm font-medium mb-1">Nome do prédio</label>
      <input id="nome-p" name="nome" placeholder="Ex: Edif. Central" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>

    <div class="grid grid-cols-[1fr_100px] gap-2">
      <div>
        <label for="log-p" class="block text-sm font-medium mb-1">Logradouro *</label>
        <input id="log-p" name="logradouro" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label for="num-p" class="block text-sm font-medium mb-1">Número</label>
        <input id="num-p" name="numero" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
    </div>

    <div>
      <span class="block text-sm font-medium mb-2">Portaria</span>
      <div class="grid grid-cols-3 gap-2">
        {#each [{ v: 'porteiro', l: 'Porteiro', i: '👮' }, { v: 'eletronica', l: 'Eletrônica', i: '🔘' }, { v: 'sem', l: 'Sem', i: '🚪' }] as opt}
          <label class="cursor-pointer">
            <input type="radio" name="tipo_entrada" value={opt.v} class="peer sr-only" />
            <div class="text-center text-sm px-2 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">
              <div class="text-lg">{opt.i}</div>
              <div class="text-xs">{opt.l}</div>
            </div>
          </label>
        {/each}
      </div>
    </div>

    <div>
      <label for="qtd-p" class="block text-sm font-medium mb-1">Quantidade de aptos</label>
      <input id="qtd-p" name="qtd_aptos" type="number" min="1" max="200" value="1" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <p class="text-xs text-slate-500 mt-1">Cria APTO 1..N — renomeia depois</p>
    </div>

    <div>
      <label for="notas-p" class="block text-sm font-medium mb-1">Notas (opcional)</label>
      <textarea id="notas-p" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
    </div>

    <div class="text-xs text-amber-800 bg-amber-50 rounded p-2 border border-amber-200">
      ⚠ Fica marcado como <strong>pendente</strong>. Admin valida depois.
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetCriar = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvandoNovo} class="flex-1">Criar</Button>
    </div>
  </form>
</BottomSheet>

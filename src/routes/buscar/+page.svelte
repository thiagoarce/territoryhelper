<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';

  let { data }: { data: any } = $props();

  let q = $state(data.q);
  let lat = $state<number | null>(data.lat);
  let lng = $state<number | null>(data.lng);
  let carregandoGPS = $state(false);

  let timer: any = null;
  $effect(() => {
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
    if (!navigator.geolocation) {
      toast.warn('Geolocation não disponível');
      return;
    }
    carregandoGPS = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        carregandoGPS = false;
        toast.success('Localização OK');
      },
      (err) => {
        carregandoGPS = false;
        toast.error('Falhou GPS: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function limparGeo() { lat = null; lng = null; }

  // Sheet criar prédio pendente
  let sheetCriar = $state(false);
  let salvandoNovo = $state(false);

  function abrirCriar() { sheetCriar = true; }
</script>

<div class="p-4 max-w-4xl mx-auto">
<div>
  <h1 class="text-2xl font-bold mb-1">Buscar</h1>
  <p class="text-sm text-slate-500">Quadras, endereços, prédios</p>
</div>

<div class="mt-4 space-y-2">
  <input
    type="search"
    bind:value={q}
    placeholder="Digite ID da quadra, nome do prédio, logradouro..."
    autofocus
    class="w-full rounded-lg border border-slate-300 px-4 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
  />
  <div class="flex flex-wrap gap-2 items-center text-sm">
    {#if lat == null || lng == null}
      <Button variant="secondary" size="sm" onclick={usarLocalizacao} loading={carregandoGPS}>📍 Usar minha localização</Button>
    {:else}
      <span class="text-xs bg-green-50 border border-green-200 text-green-800 px-2 py-1 rounded">📍 GPS ativo · {lat.toFixed(4)}, {lng.toFixed(4)}</span>
      <button type="button" onclick={limparGeo} class="text-xs text-red-600 hover:underline">Limpar</button>
    {/if}
  </div>
</div>

{#if data.q || (data.lat != null && data.lng != null)}
  <div class="mt-4 space-y-6">
    {#if data.quadras.length > 0}
      <section>
        <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">Quadras ({data.quadras.length})</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {#each data.quadras as q}
            <a href="/publicador/quadra/{encodeURIComponent(q.id)}" class="p-2 rounded-lg border border-slate-200 hover:border-primary-500 hover:bg-primary-50">
              <div class="flex items-center gap-1">
                <span class="inline-block w-2 h-2 rounded" style:background-color={q.color}></span>
                <span class="font-mono font-semibold text-sm">{q.id}</span>
              </div>
              <div class="text-xs text-slate-500">{q.status}</div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    {#if data.locais.length > 0}
      <section>
        <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">
          Endereços ({data.locais.length}){#if data.lat != null} · por proximidade{/if}
        </h2>
        <div class="space-y-1">
          {#each data.locais as l}
            <a
              href={l.tipo === 'predio' ? '/predio/' + l.id : (l.quadra_id ? '/publicador/quadra/' + encodeURIComponent(l.quadra_id) : '#')}
              class="block p-2 rounded-lg border border-slate-200 hover:border-primary-500 hover:bg-primary-50"
            >
              <div class="flex items-center gap-2">
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">
                    {#if l.tipo === 'predio'}🏢{:else if l.tipo === 'comercio'}🏪{:else}🏠{/if}
                    {l.nome || `${l.logradouro}, ${l.numero}`}
                  </div>
                  <div class="text-xs text-slate-500 truncate">{l.logradouro}, {l.numero}{l.quadra_id ? ' · Q' + l.quadra_id : ''}</div>
                </div>
                {#if l.distancia_m != null}
                  <span class="text-xs font-medium text-primary-700 shrink-0">{Math.round(l.distancia_m)}m</span>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    {#if data.quadras.length === 0 && data.locais.length === 0}
      <div class="text-center py-8">
        <div class="text-slate-400 mb-3">Nada encontrado.</div>
        <Button variant="primary" onclick={abrirCriar}>➕ Criar prédio pendente</Button>
        <p class="text-xs text-slate-500 mt-2">Você cria; admin depois valida e associa à quadra correta.</p>
      </div>
    {:else}
      <div class="text-center pt-2">
        <button type="button" onclick={abrirCriar} class="text-xs text-primary-700 hover:underline">Não é nenhum deles? Criar prédio pendente</button>
      </div>
    {/if}
  </div>
{/if}
</div>

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
      <p class="text-xs text-slate-500 mt-1">Cria APTO 1, 2, 3... — você renomeia depois</p>
    </div>

    <div>
      <label for="notas-p" class="block text-sm font-medium mb-1">Notas (opcional)</label>
      <textarea id="notas-p" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
    </div>

    <div class="text-xs text-amber-800 bg-amber-50 rounded p-2 border border-amber-200">
      ⚠ Fica marcado como <strong>pendente</strong>. Admin valida depois em /admin/predios (associa quadra correta, ajusta geo).
    </div>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetCriar = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvandoNovo} class="flex-1">Criar</Button>
    </div>
  </form>
</BottomSheet>

<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';

  interface LocalProximidade {
    logradouro: string;
    numero: string;
    geo_geojson?: { coordinates: [number, number] } | null;
  }

  let {
    open = $bindable(false),
    latGps,
    lngGps,
    locaisProximidade = []
  }: {
    open?: boolean;
    latGps?: number | null;
    lngGps?: number | null;
    // A7: endereço aproximado — locais já cadastrados na mesma quadra, pra
    // sugerir logradouro/número do vizinho mais próximo após capturar GPS.
    locaisProximidade?: LocalProximidade[];
  } = $props();

  let tipo = $state<'casa' | 'predio' | 'comercio' | 'coletivo' | 'terreno'>('casa');
  let salvando = $state(false);
  let logradouroSugerido = $state('');
  let numeroSugerido = $state('');

  // Mesma fórmula haversine usada no resto do app (server-side em
  // publicador/predios, aqui client-side já que os locais da quadra já
  // estão carregados na página).
  function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function sugerirEnderecoProximo(lat: number, lng: number) {
    let maisProximo: LocalProximidade | null = null;
    let menorDist = Infinity;
    for (const l of locaisProximidade) {
      const c = l.geo_geojson?.coordinates;
      if (!c) continue;
      const d = haversine(lat, lng, c[1], c[0]);
      if (d < menorDist) { menorDist = d; maisProximo = l; }
    }
    if (maisProximo) {
      logradouroSugerido = maisProximo.logradouro;
      numeroSugerido = maisProximo.numero;
    }
  }

  // Zera a sugestão a cada abertura — senão fica presa do endereço anterior.
  $effect(() => {
    if (open) { logradouroSugerido = ''; numeroSugerido = ''; }
  });

  function tentarUsarGps() {
    if (!navigator.geolocation) {
      toast.warn('GPS não disponível');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const latInput = document.getElementById('add-lat') as HTMLInputElement;
      const lngInput = document.getElementById('add-lng') as HTMLInputElement;
      if (latInput) latInput.value = String(pos.coords.latitude);
      if (lngInput) lngInput.value = String(pos.coords.longitude);
      sugerirEnderecoProximo(pos.coords.latitude, pos.coords.longitude);
      toast.success('GPS capturado');
    }, () => toast.error('Falhou capturar GPS'));
  }
</script>

<BottomSheet bind:open title="Adicionar endereço">
  <form
    method="POST"
    action="?/criarLocal"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.msg || 'Criado');
          open = false;
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    <div>
      <span class="block text-sm font-medium mb-1">Tipo</span>
      <div class="grid grid-cols-5 gap-1">
        {#each [
          { v: 'casa', label: 'Casa' },
          { v: 'predio', label: 'Prédio' },
          { v: 'comercio', label: 'Comércio' },
          { v: 'coletivo', label: 'Coletivo' },
          { v: 'terreno', label: 'Terreno' }
        ] as opt}
          <label class="cursor-pointer">
            <input type="radio" name="tipo" value={opt.v} bind:group={tipo} class="peer sr-only" />
            <div class="text-center text-xs px-1 py-2 border border-slate-300 rounded peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700 hover:bg-slate-50">
              {opt.label}
            </div>
          </label>
        {/each}
      </div>
    </div>

    <div>
      <label for="add-logradouro" class="block text-sm font-medium mb-1">Logradouro</label>
      <input
        id="add-logradouro"
        name="logradouro"
        required
        bind:value={logradouroSugerido}
        placeholder="Ex: RUA DOS GIRASSÓIS"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {#if logradouroSugerido}<p class="text-xs text-slate-400 mt-1">Sugerido pelo endereço mais próximo — edite se estiver errado.</p>{/if}
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="add-numero" class="block text-sm font-medium mb-1">Número</label>
        <input
          id="add-numero"
          name="numero"
          bind:value={numeroSugerido}
          placeholder="123"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label for="add-face_ibge" class="block text-sm font-medium mb-1">Face IBGE</label>
        <input
          id="add-face_ibge"
          name="face_ibge"
          placeholder="1, 2, 3..."
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
    </div>

    <div>
      <label for="add-nome" class="block text-sm font-medium mb-1">Nome (opcional)</label>
      <input
        id="add-nome"
        name="nome"
        placeholder="Ex: Edif. Solar"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>

    <!-- GPS -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-medium">Coordenadas (opcional)</span>
        <button type="button" onclick={tentarUsarGps} class="text-xs text-primary-700 hover:underline"><Icon nome="map-pin" size={14} /> Usar minha localização</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <input id="add-lat" name="lat" type="number" step="any" value={latGps ?? ''} placeholder="latitude" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input id="add-lng" name="lng" type="number" step="any" value={lngGps ?? ''} placeholder="longitude" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
    </div>

    <!-- Prédio: andares × aptos -->
    {#if tipo === 'predio'}
      <div class="rounded-lg bg-slate-50 p-3 space-y-2">
        <div class="text-sm font-medium">Apartamentos (opcional)</div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="add-andares" class="block text-xs mb-1">Andares</label>
            <input
              id="add-andares"
              name="andares"
              type="number"
              min="0"
              placeholder="0 = só 1 unidade"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label for="add-aptos" class="block text-xs mb-1">Aptos por andar</label>
            <input
              id="add-aptos"
              name="aptos_por_andar"
              type="number"
              min="0"
              placeholder="0 = só 1 unidade"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p class="text-xs text-slate-500">Se preencher, gera "APARTAMENTO 101, 102, 201..." automaticamente. Deixe vazio pra criar só 1 unidade.</p>
      </div>
    {:else}
      <div>
        <label for="add-complemento" class="block text-sm font-medium mb-1">Complemento</label>
        <input
          id="add-complemento"
          name="complemento"
          placeholder="Ex: fundos, sala 2..."
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
    {/if}

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (open = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Adicionar</Button>
    </div>
  </form>
</BottomSheet>

<script lang="ts">
  // Cadastro do ponto de referência ("Banco do Brasil da Fernando").
  // Nasce de três lugares: toque longo no mapa, botão de salvar um POI
  // que o app achou, ou GPS ("estou parado no ponto agora").
  //
  // Grava por postComFila: o dirigente cadastra em campo, muitas vezes
  // sem sinal — sem a fila, o ponto se perderia justo na hora em que
  // ele descobriu o lugar.
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { postComFila } from '$lib/offline';
  import { invalidateAll } from '$app/navigation';
  import { TIPOS_PONTO, validarPonto, type TipoPonto } from '$lib/pontos-referencia';

  let {
    open = $bindable(false),
    lat = $bindable<number | null>(null),
    lng = $bindable<number | null>(null),
    nomeInicial = '',
    osmId = null,
    quadraId = null,
    territorioId = null,
    action = '?/salvarPontoReferencia'
  }: {
    open?: boolean;
    lat?: number | null;
    lng?: number | null;
    nomeInicial?: string;
    osmId?: string | null;
    quadraId?: string | null;
    territorioId?: string | null;
    action?: string;
  } = $props();

  let nome = $state('');
  let tipo = $state<TipoPonto>('estacionamento');
  let notas = $state('');
  let salvando = $state(false);

  // Cada abertura recomeça do nome sugerido (o do POI do OSM, quando
  // veio de lá) — sem isso, salvar dois pontos seguidos repetia o texto
  // do primeiro.
  let abertoAntes = false;
  $effect(() => {
    const abriu = open;
    const sugestao = nomeInicial;
    if (abriu && !abertoAntes) {
      nome = sugestao;
      notas = '';
      salvando = false;
    }
    abertoAntes = abriu;
  });

  function usarMinhaLocalizacao() {
    if (!navigator.geolocation) return toast.error('Sem GPS neste aparelho');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        toast.success('Coordenada do GPS');
      },
      () => toast.error('Não consegui pegar sua localização'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function salvar() {
    const v = validarPonto({ nome, lat, lng, tipo });
    if (!v.ok) return toast.error(v.erro);
    salvando = true;
    const fd = new FormData();
    fd.append('nome', v.nome);
    fd.append('tipo', v.tipo);
    fd.append('lat', String(v.lat));
    fd.append('lng', String(v.lng));
    if (notas.trim()) fd.append('notas', notas.trim());
    if (osmId) fd.append('osm_id', osmId);
    if (quadraId) fd.append('quadra_id', quadraId);
    if (territorioId) fd.append('territorio_id', territorioId);

    const r = await postComFila(action, fd, `Salvar ponto "${v.nome}"`);
    salvando = false;
    if (r.ok) {
      toast.success('Ponto salvo');
      open = false;
      await invalidateAll();
    } else if (r.offline) {
      toast.info('Sem rede — salvo no aparelho, sincroniza sozinho quando voltar');
      open = false;
    } else {
      toast.error(r.erro);
    }
  }
</script>

<BottomSheet bind:open title="Salvar ponto">
  <p class="text-sm text-slate-500 mb-3">
    Dê o nome que a congregação usa — é isso que vai aparecer pra todo mundo.
  </p>

  <label for="ponto-nome" class="block text-sm font-medium mb-1">Nome</label>
  <input
    id="ponto-nome"
    bind:value={nome}
    maxlength="80"
    placeholder="Ex: Banco do Brasil da Fernando"
    class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
  />

  <span class="block text-sm font-medium mb-1">Tipo</span>
  <div class="flex flex-wrap gap-2 mb-3">
    {#each TIPOS_PONTO as t}
      <button
        type="button"
        onclick={() => (tipo = t.valor)}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border {tipo === t.valor
          ? 'bg-primary-600 text-white border-primary-600'
          : 'border-slate-300 text-slate-600 hover:bg-slate-50'}"
      >
        <Icon nome={t.icone as any} size={14} /> {t.label}
      </button>
    {/each}
  </div>

  <label for="ponto-notas" class="block text-sm font-medium mb-1">Notas (opcional)</label>
  <input
    id="ponto-notas"
    bind:value={notas}
    placeholder="Ex: cabem 3 carros, sombra de manhã"
    class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
  />

  <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 mb-3">
    {#if lat != null && lng != null}
      Coordenada: {lat.toFixed(5)}, {lng.toFixed(5)}
    {:else}
      <span class="text-amber-700">Sem coordenada — toque longo no mapa ou use o GPS.</span>
    {/if}
    <button type="button" onclick={usarMinhaLocalizacao} class="block mt-1 text-primary-700 underline">
      Usar minha localização
    </button>
  </div>

  <Button variant="primary" class="w-full" loading={salvando} onclick={salvar}>
    <Icon nome="check" size={14} /> Salvar ponto
  </Button>
</BottomSheet>

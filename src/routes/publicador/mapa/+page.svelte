<script lang="ts">
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import type { PageData } from './$types';
  import { BASEMAP_CAMPO } from '$lib/mapa-estilos';

  let { data }: { data: PageData } = $props();

  let colorirPor = $state<'recencia' | 'territorio' | 'densidade_enderecos' | 'densidade_residencias'>('recencia');
</script>

<div>
  <h1 class="text-2xl font-bold">Território da congregação</h1>
  <p class="text-sm text-slate-500 mt-1">
    Visão geral, só consulta — clique numa quadra pra ver detalhes. Concluir
    quadra e repartir território ficam em Casa a casa, escopados ao seu
    território designado.
  </p>
</div>

<div class="mt-3">
  <select bind:value={colorirPor} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
    <option value="recencia">Cor por conclusão (recência)</option>
    <option value="territorio">Cor por território</option>
    <option value="densidade_enderecos">Cor por densidade (endereços)</option>
    <option value="densidade_residencias">Cor por densidade (residências)</option>
  </select>
</div>

<div class="mt-3">
  <AdminMapa quadras={data.quadras} altura={620} {colorirPor} popupDetalhe basemap={data.profile?.pref_basemap ?? BASEMAP_CAMPO} />
</div>

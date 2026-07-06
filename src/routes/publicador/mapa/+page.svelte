<script lang="ts">
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import type { QuadraGeo } from '$lib/server/queries';

  let { data }: { data: { quadras: QuadraGeo[] } } = $props();
</script>

<div>
  <h1 class="text-2xl font-bold">Território da congregação</h1>
  <p class="text-sm text-slate-500 mt-1">
    Visão geral, só consulta — colorida por recência de conclusão. Concluir
    quadra e repartir território ficam em Casa a casa, escopados ao seu
    território designado.
  </p>
</div>

<div class="mt-4">
  <AdminMapa quadras={data.quadras} altura={620} colorirPor="recencia" />
</div>

<script lang="ts">
  // Reusa view do publicador
  import Pub from '../../publicador/campanha/+page.svelte';
  let { data } = $props();
</script>

<Pub {data} />

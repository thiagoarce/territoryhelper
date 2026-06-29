<script lang="ts">
  import '../../app.css';
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<!-- Layout público sem sidebar/auth -->
{@render children()}

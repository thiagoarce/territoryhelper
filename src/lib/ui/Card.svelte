<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    padding = 'md',
    interactive = false,
    children,
    class: klass = '',
    ...rest
  }: {
    padding?: 'none' | 'sm' | 'md' | 'lg';
    interactive?: boolean;
    children?: Snippet;
    class?: string;
    [key: string]: unknown;
  } = $props();

  const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' };
</script>

<div
  {...rest}
  class="rounded-xl bg-white border border-slate-200 shadow-sm {paddings[padding]} {interactive ? 'hover:shadow-md transition-shadow cursor-pointer' : ''} {klass}"
>
  {#if children}{@render children()}{/if}
</div>

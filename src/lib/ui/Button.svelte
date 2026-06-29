<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  type Size = 'sm' | 'md' | 'lg';

  let {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    children,
    class: klass = '',
    ...rest
  }: {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    icon?: Snippet;
    children?: Snippet;
    class?: string;
  } & HTMLButtonAttributes = $props();

  const variants: Record<Variant, string> = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 disabled:bg-primary-300',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:opacity-50',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
    success: 'bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300'
  };

  const sizes: Record<Size, string> = {
    sm: 'px-2.5 py-1 text-xs gap-1',
    md: 'px-4 py-2 text-sm gap-1.5',
    lg: 'px-5 py-3 text-base gap-2'
  };
</script>

<button
  {...rest}
  disabled={loading || rest.disabled}
  class="inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:cursor-not-allowed {variants[variant]} {sizes[size]} {klass}"
>
  {#if loading}
    <span class="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"></span>
  {:else if icon}
    {@render icon()}
  {/if}
  {#if children}{@render children()}{/if}
</button>

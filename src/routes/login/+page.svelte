<script lang="ts">
  import { enhance } from '$app/forms';

  let { form, data }: { form: any; data: { msg: string | null } } = $props();
  let submetendo = $state(false);

  const msgsConhecidas: Record<string, string> = {
    desativado: 'Sua conta está desativada. Procure o admin da congregação.'
  };
</script>

<div class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
  <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
    <h1 class="mb-1 text-center text-2xl font-bold text-primary-700">Territory Helper</h1>
    <p class="mb-6 text-center text-sm text-slate-500">Entre com seu email e senha</p>

    {#if data.msg && msgsConhecidas[data.msg]}
      <div class="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-900">
        {msgsConhecidas[data.msg]}
      </div>
    {/if}

    <form
      method="POST"
      use:enhance={() => {
        submetendo = true;
        return async ({ update }) => {
          await update();
          submetendo = false;
        };
      }}
      class="space-y-4"
    >
      <div>
        <label for="email" class="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          required
          value={form?.email ?? ''}
          class="w-full rounded border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label for="senha" class="mb-1 block text-sm font-medium text-slate-700">Senha</label>
        <input
          id="senha"
          name="senha"
          type="password"
          autocomplete="current-password"
          required
          class="w-full rounded border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {#if form?.erro}
        <div class="rounded bg-red-50 p-2 text-sm text-red-700">{form.erro}</div>
      {/if}

      <button
        type="submit"
        disabled={submetendo}
        class="w-full rounded bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700 disabled:opacity-60"
      >
        {submetendo ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  </div>
</div>

<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form }: { data: any; form: any } = $props();
  let submetendo = $state(false);
</script>

<svelte:head>
  <title>Convite — Territory Helper</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
  <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
    <h1 class="mb-1 text-center text-2xl font-bold text-primary-700">Territory Helper</h1>

    {#if data.erro}
      <div class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{data.erro}</div>
    {:else}
      <p class="mb-6 text-center text-sm text-slate-600">
        Olá, <strong>{data.convite.nome}</strong>!<br>
        Defina sua senha pra entrar.
      </p>

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
          <span class="block text-xs text-slate-500 mb-1">Email</span>
          <div class="rounded bg-slate-100 px-3 py-2 text-sm">{data.convite.email}</div>
        </div>

        <div>
          <label for="senha" class="mb-1 block text-sm font-medium text-slate-700">Nova senha</label>
          <input
            id="senha"
            name="senha"
            type="password"
            autocomplete="new-password"
            minlength="6"
            required
            class="w-full rounded border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <p class="text-xs text-slate-500 mt-1">Mínimo 6 caracteres</p>
        </div>

        {#if form?.erro}
          <div class="rounded bg-red-50 p-2 text-sm text-red-700">{form.erro}</div>
        {/if}

        <button
          type="submit"
          disabled={submetendo}
          class="w-full rounded bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {submetendo ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>
    {/if}
  </div>
</div>

<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';

  let { data, form }: { data: { profile: any; email: string }; form: any } = $props();
  let salvandoNome = $state(false);
  let salvandoSenha = $state(false);
</script>

<div>
  <h1 class="text-2xl font-bold">Meu perfil</h1>
  <p class="text-sm text-slate-500 mt-1">Atualize seu nome e senha</p>
</div>

<div class="mt-4 space-y-4 max-w-md">
  <Card padding="md">
    <h2 class="font-semibold mb-3">Conta</h2>
    <div class="space-y-2 text-sm">
      <div>
        <div class="text-xs text-slate-500">Email</div>
        <div>{data.email}</div>
      </div>
      <div>
        <div class="text-xs text-slate-500">Papel</div>
        <div class="capitalize">{data.profile.role}</div>
      </div>
    </div>
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-3">Nome</h2>
    <form
      method="POST"
      action="?/atualizarNome"
      use:enhance={() => {
        salvandoNome = true;
        return async ({ result, update }) => {
          await update();
          salvandoNome = false;
          if (result.type === 'success') {
            toast.success('Nome atualizado');
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="flex gap-2"
    >
      <input
        name="nome"
        value={data.profile.nome}
        required
        class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <Button variant="primary" type="submit" loading={salvandoNome}>Salvar</Button>
    </form>
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-3">Trocar senha</h2>
    <form
      method="POST"
      action="?/trocarSenha"
      use:enhance={() => {
        salvandoSenha = true;
        return async ({ result, update }) => {
          await update();
          salvandoSenha = false;
          if (result.type === 'success') {
            toast.success('Senha trocada');
            const inp = document.getElementById('nova-senha') as HTMLInputElement;
            if (inp) inp.value = '';
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-2"
    >
      <input
        id="nova-senha"
        name="senha"
        type="password"
        minlength="6"
        placeholder="Nova senha (mín. 6)"
        required
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <Button variant="primary" type="submit" loading={salvandoSenha} class="w-full">Trocar senha</Button>
    </form>
  </Card>
</div>

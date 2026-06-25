<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { UsuarioComEmail, Role } from '$lib/types';

  let {
    data,
    form
  }: {
    data: { usuarios: UsuarioComEmail[] };
    form: any;
  } = $props();

  let abaAtiva: 'lista' | 'criar' | 'lote' = $state('lista');
  let usuarioEditando: UsuarioComEmail | null = $state(null);
  let busca = $state('');

  const usuariosFiltrados = $derived(
    !busca.trim()
      ? data.usuarios
      : data.usuarios.filter(
          (u) =>
            u.nome.toLowerCase().includes(busca.toLowerCase()) ||
            u.email.toLowerCase().includes(busca.toLowerCase())
        )
  );

  const roleClasses: Record<Role, string> = {
    admin: 'bg-purple-100 text-purple-700',
    dirigente: 'bg-blue-100 text-blue-700',
    publicador: 'bg-green-100 text-green-700'
  };
</script>

<div class="flex items-center justify-between">
  <h1 class="text-2xl font-bold">Usuários</h1>
  <div class="text-sm text-slate-500">{data.usuarios.length} cadastrado(s)</div>
</div>

<!-- Abas -->
<div class="mt-4 flex gap-2 border-b border-slate-200">
  {#each [['lista', 'Lista'], ['criar', 'Adicionar 1'], ['lote', 'Adicionar em lote']] as [k, label]}
    <button
      onclick={() => (abaAtiva = k as any)}
      class="border-b-2 px-3 py-2 text-sm font-medium"
      class:border-primary-600={abaAtiva === k}
      class:text-primary-700={abaAtiva === k}
      class:border-transparent={abaAtiva !== k}
      class:text-slate-500={abaAtiva !== k}
    >
      {label}
    </button>
  {/each}
</div>

{#if form?.erro}
  <div class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{form.erro}</div>
{/if}
{#if form?.ok && form?.msg}
  <div class="mt-4 rounded bg-green-50 p-3 text-sm text-green-700">{form.msg}</div>
{/if}

{#if abaAtiva === 'lista'}
  <input
    type="search"
    bind:value={busca}
    placeholder="Buscar por nome ou email..."
    class="mt-4 w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
  />

  <div class="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase text-slate-500">
        <tr>
          <th class="px-3 py-2">Nome</th>
          <th class="px-3 py-2">Email</th>
          <th class="px-3 py-2">Papel</th>
          <th class="px-3 py-2">Ativo</th>
          <th class="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each usuariosFiltrados as u (u.id)}
          <tr class="border-t border-slate-100">
            <td class="px-3 py-2 font-medium">{u.nome || '(sem nome)'}</td>
            <td class="px-3 py-2 text-slate-600">{u.email}</td>
            <td class="px-3 py-2">
              <span class="rounded px-2 py-0.5 text-xs {roleClasses[u.role]}">{u.role}</span>
            </td>
            <td class="px-3 py-2">
              {#if u.ativo}<span class="text-green-600">●</span>{:else}<span class="text-slate-400">○</span>{/if}
            </td>
            <td class="px-3 py-2 text-right">
              <button
                onclick={() => (usuarioEditando = u)}
                class="text-sm text-primary-700 hover:underline"
              >
                Editar
              </button>
            </td>
          </tr>
        {:else}
          <tr><td colspan="5" class="px-3 py-8 text-center text-slate-400">Nenhum usuário</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

{#if abaAtiva === 'criar'}
  <form
    method="POST"
    action="?/criar"
    use:enhance={() =>
      async ({ update }) => {
        await update();
        await invalidateAll();
      }}
    class="mt-4 max-w-md space-y-3 rounded-lg border border-slate-200 bg-white p-4"
  >
    <div>
      <label for="nome" class="mb-1 block text-sm font-medium">Nome</label>
      <input
        id="nome"
        name="nome"
        required
        class="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    </div>
    <div>
      <label for="email" class="mb-1 block text-sm font-medium">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        class="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    </div>
    <div>
      <label for="senha" class="mb-1 block text-sm font-medium">Senha (mín. 6)</label>
      <input
        id="senha"
        name="senha"
        type="text"
        minlength="6"
        required
        class="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    </div>
    <div>
      <label for="role" class="mb-1 block text-sm font-medium">Papel</label>
      <select
        id="role"
        name="role"
        class="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        <option value="publicador">Publicador</option>
        <option value="dirigente">Dirigente</option>
        <option value="admin">Admin</option>
      </select>
    </div>
    <button class="w-full rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
      Criar usuário
    </button>
  </form>
{/if}

{#if abaAtiva === 'lote'}
  <form
    method="POST"
    action="?/importarLote"
    use:enhance={() =>
      async ({ update }) => {
        await update();
        await invalidateAll();
      }}
    class="mt-4 space-y-3"
  >
    <div class="rounded-lg border border-slate-200 bg-white p-4">
      <label for="csv" class="mb-2 block text-sm font-medium">
        Cole o CSV: <code class="text-xs text-slate-500">email,senha,nome,role</code>
        — uma linha por usuário. Role opcional (default: publicador).
      </label>
      <textarea
        id="csv"
        name="csv"
        rows="10"
        placeholder={`maria@email.com,senha123,Maria Silva,publicador
joao@email.com,senha456,João Costa,dirigente
admin@cong.com,trocar123,Admin Cong,admin`}
        class="w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      ></textarea>
      <button class="mt-3 rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
        Importar todos
      </button>
    </div>

    {#if form?.lote}
      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <div class="mb-2 text-sm font-medium">
          Resultado: {form.lote.sucessos} de {form.lote.total} criados
        </div>
        <ul class="space-y-1 text-sm">
          {#each form.lote.resultados as r}
            <li class="flex gap-2">
              <span class:text-green-700={r.status === 'ok'} class:text-red-700={r.status === 'erro'}>
                {r.status === 'ok' ? '✓' : '✗'}
              </span>
              <span class="font-mono text-xs text-slate-500">L{r.linha}</span>
              <span class="font-medium">{r.email}</span>
              <span class="text-slate-600">— {r.msg}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </form>
{/if}

<!-- Modal de edição -->
{#if usuarioEditando}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onclick={() => (usuarioEditando = null)}>
    <div class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onclick={(e) => e.stopPropagation()}>
      <h2 class="mb-1 text-lg font-bold">Editar usuário</h2>
      <p class="mb-4 text-sm text-slate-500">{usuarioEditando.email}</p>

      <form
        method="POST"
        action="?/atualizar"
        use:enhance={() =>
          async ({ update }) => {
            await update();
            usuarioEditando = null;
            await invalidateAll();
          }}
        class="space-y-3"
      >
        <input type="hidden" name="id" value={usuarioEditando.id} />
        <div>
          <label for="ed-nome" class="mb-1 block text-sm font-medium">Nome</label>
          <input
            id="ed-nome"
            name="nome"
            value={usuarioEditando.nome}
            class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label for="ed-role" class="mb-1 block text-sm font-medium">Papel</label>
          <select id="ed-role" name="role" value={usuarioEditando.role} class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="publicador">Publicador</option>
            <option value="dirigente">Dirigente</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" checked={usuarioEditando.ativo} />
          Ativo (desmarque pra bloquear o login)
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" onclick={() => (usuarioEditando = null)} class="rounded px-3 py-2 text-sm hover:bg-slate-100">Cancelar</button>
          <button class="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">Salvar</button>
        </div>
      </form>

      <hr class="my-4" />

      <form
        method="POST"
        action="?/excluir"
        use:enhance={() =>
          async ({ update }) => {
            await update();
            usuarioEditando = null;
            await invalidateAll();
          }}
        onsubmit={(e) => {
          if (!confirm('Excluir esse usuário? Não tem volta.')) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={usuarioEditando.id} />
        <button class="text-sm text-red-700 hover:underline">Excluir usuário</button>
      </form>
    </div>
  </div>
{/if}

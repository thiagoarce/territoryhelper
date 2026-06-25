<script lang="ts">
  let { data }: { data: { profile: { nome: string } } } = $props();
</script>

<h1 class="text-2xl font-bold">Painel do servo de território</h1>
<p class="mt-2 text-slate-600">Olá, {data.profile.nome}.</p>

<div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <a href="/admin/usuarios" class="rounded-lg border border-slate-200 bg-white p-4 hover:shadow">
    <div class="font-semibold">Usuários</div>
    <div class="mt-1 text-sm text-slate-500">Adicionar, remover, atribuir papéis.</div>
  </a>
  <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-400">
    <div class="font-semibold">Quadras &amp; Territórios</div>
    <div class="mt-1 text-sm">Em breve</div>
  </div>
  <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-400">
    <div class="font-semibold">Designações</div>
    <div class="mt-1 text-sm">Em breve</div>
  </div>
</div>

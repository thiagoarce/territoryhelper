<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';

  let { form }: { form: any } = $props();
  let arquivosSelecionados = $state<File[]>([]);
  let dragOver = $state(false);
  let submetendo = $state(false);

  function onFilesChange(ev: Event) {
    const target = ev.target as HTMLInputElement;
    arquivosSelecionados = target.files ? Array.from(target.files) : [];
  }

  function onDrop(ev: DragEvent) {
    ev.preventDefault();
    dragOver = false;
    if (!ev.dataTransfer) return;
    const files = Array.from(ev.dataTransfer.files).filter((f) => f.name.endsWith('.sql'));
    if (files.length === 0) {
      alert('Apenas arquivos .sql');
      return;
    }
    arquivosSelecionados = files;
    // Atualiza o input nativo (não obrigatório, só pra mostrar nome)
    const input = document.getElementById('input-arquivos') as HTMLInputElement;
    if (input) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      input.files = dt.files;
    }
  }

  function tamanhoStr(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
</script>

<h1 class="text-2xl font-bold">Executar SQL (dev)</h1>
<p class="mt-1 text-sm text-slate-500">
  Upload de arquivos .sql que são executados via service_role no Postgres.
  Útil pra migração de dados sem precisar colar no Supabase SQL Editor.
</p>

<div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
  <strong>⚠️ Atenção:</strong> só admin pode usar. Roda SQL bruto no banco — verifica os arquivos antes.
  Os arquivos rodam em <strong>ordem alfabética</strong> (por isso o prefixo 01_, 02_, ...).
</div>

<form
  method="POST"
  enctype="multipart/form-data"
  use:enhance={() => {
    submetendo = true;
    return async ({ update }) => {
      await update();
      submetendo = false;
      await invalidateAll();
    };
  }}
  class="mt-4 space-y-4"
>
  <button
    type="button"
    onclick={() => (document.getElementById('input-arquivos') as HTMLInputElement)?.click()}
    ondragover={(e) => {
      e.preventDefault();
      dragOver = true;
    }}
    ondragleave={() => (dragOver = false)}
    ondrop={onDrop}
    class="block w-full rounded-lg border-2 border-dashed p-8 text-center transition-colors"
    class:border-primary-500={dragOver}
    class:bg-primary-50={dragOver}
    class:border-slate-300={!dragOver}
  >
    <div class="text-4xl mb-2">📁</div>
    <div class="font-medium">Arraste os arquivos .sql aqui</div>
    <div class="text-sm text-slate-500 mt-1">ou clique pra escolher</div>
  </button>

  <input
    id="input-arquivos"
    type="file"
    name="arquivos"
    accept=".sql"
    multiple
    onchange={onFilesChange}
    class="hidden"
  />

  {#if arquivosSelecionados.length > 0}
    <div class="rounded border border-slate-200 bg-white p-3">
      <div class="text-sm font-medium mb-2">
        {arquivosSelecionados.length} arquivo(s) selecionado(s):
      </div>
      <ol class="space-y-1 text-sm">
        {#each arquivosSelecionados.toSorted((a, b) => a.name.localeCompare(b.name)) as f, i}
          <li class="flex justify-between border-b border-slate-100 last:border-b-0 py-1">
            <span><span class="text-slate-400">{i + 1}.</span> {f.name}</span>
            <span class="text-slate-500">{tamanhoStr(f.size)}</span>
          </li>
        {/each}
      </ol>
    </div>

    <button
      type="submit"
      disabled={submetendo}
      class="w-full rounded bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700 disabled:opacity-60"
    >
      {submetendo ? 'Executando...' : `Executar ${arquivosSelecionados.length} arquivo(s)`}
    </button>
  {/if}
</form>

{#if form?.erro}
  <div class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{form.erro}</div>
{/if}

{#if form?.resultados}
  <div class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
    <h2 class="font-semibold mb-3">{form.msg}</h2>
    <ul class="space-y-2 text-sm">
      {#each form.resultados as r}
        <li class="flex items-start gap-2 border-b border-slate-100 pb-2 last:border-b-0">
          <span class="text-lg" class:text-green-600={r.status === 'ok'} class:text-red-600={r.status === 'erro'}>
            {r.status === 'ok' ? '✓' : '✗'}
          </span>
          <div class="flex-1 min-w-0">
            <div class="font-medium">{r.nome} <span class="text-xs text-slate-500">({r.tamanhoKB} KB · {r.duracaoMs}ms)</span></div>
            {#if r.status === 'erro'}
              <div class="text-xs text-red-700 mt-1 break-all font-mono">{r.msg}</div>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}

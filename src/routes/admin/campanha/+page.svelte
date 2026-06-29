<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { Campanha } from '$lib/types';

  let { data, form }: { data: { objetivos: Campanha[] }; form: any } = $props();

  let sheetOpen = $state(false);
  let editando: Campanha | null = $state(null);
  let salvando = $state(false);

  function novo() {
    editando = null;
    sheetOpen = true;
  }
  function editar(o: Campanha) {
    editando = o;
    sheetOpen = true;
  }

  const MODALIDADES = [
    { v: 'casa', label: 'Casa em casa', icon: '🏠', cor: 'bg-blue-100 text-blue-700' },
    { v: 'comercial', label: 'Comercial', icon: '🏪', cor: 'bg-emerald-100 text-emerald-700' },
    { v: 'rural', label: 'Rural', icon: '🌾', cor: 'bg-amber-100 text-amber-700' },
    { v: 'cartas', label: 'Cartas', icon: '✉', cor: 'bg-purple-100 text-purple-700' },
    { v: 'telefone', label: 'Telefone', icon: '📞', cor: 'bg-cyan-100 text-cyan-700' },
    { v: 'publico', label: 'Testemunho público', icon: '📢', cor: 'bg-pink-100 text-pink-700' }
  ];

  const porModalidade = $derived.by(() => {
    const m = new Map<string, Campanha[]>();
    for (const o of data.objetivos) {
      const arr = m.get(o.modalidade) ?? [];
      arr.push(o);
      m.set(o.modalidade, arr);
    }
    return m;
  });
</script>

<div class="flex items-end justify-between flex-wrap gap-3">
  <div>
    <h1 class="text-2xl font-bold">Campanha</h1>
    <p class="text-sm text-slate-500 mt-1">{data.objetivos.length} objetivo(s) em {porModalidade.size} modalidade(s)</p>
  </div>
  <Button variant="primary" onclick={novo}>+ Novo objetivo</Button>
</div>

{#if form?.erro}
  <div class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{form.erro}</div>
{/if}

<div class="mt-4 space-y-4">
  {#each MODALIDADES as mod}
    {@const objs = porModalidade.get(mod.v) ?? []}
    {#if objs.length > 0}
      <div>
        <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
          <span class="text-lg">{mod.icon}</span> {mod.label}
          <span class="text-xs text-slate-400 font-normal">· {objs.length}</span>
        </h2>
        <div class="space-y-2">
          {#each objs as o}
            <Card padding="md">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs px-2 py-0.5 rounded {o.tipo === 'semana' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}">{o.tipo}</span>
                    {#if o.publico}<span class="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">público</span>{/if}
                  </div>
                  <div class="font-semibold">{o.titulo}</div>
                  {#if o.descricao}<div class="text-sm text-slate-600 mt-1">{o.descricao}</div>{/if}
                  {#if o.link}<a href={o.link} target="_blank" rel="noopener" class="text-sm text-blue-600 hover:underline">🔗 {o.link}</a>{/if}
                </div>
                <button onclick={() => editar(o)} class="text-sm text-primary-700 hover:underline whitespace-nowrap">Editar</button>
              </div>
            </Card>
          {/each}
        </div>
      </div>
    {/if}
  {/each}
  {#if data.objetivos.length === 0}
    <div class="text-center text-slate-400 py-10">
      Nenhum objetivo cadastrado. Clica "+ Novo objetivo" pra criar o primeiro.
    </div>
  {/if}
</div>

<BottomSheet bind:open={sheetOpen} title={editando ? 'Editar objetivo' : 'Novo objetivo'}>
  <form
    method="POST"
    action={editando ? '?/atualizar' : '?/criar'}
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success(editando ? 'Atualizado' : 'Criado');
          sheetOpen = false;
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-4"
  >
    {#if editando}
      <input type="hidden" name="id" value={editando.id} />
    {/if}

    {#if !editando}
      <div class="grid grid-cols-2 gap-3">
        <div>
          <span class="block text-sm font-medium mb-1">Tipo</span>
          <div class="grid grid-cols-2 gap-1">
            {#each ['geral', 'semana'] as t}
              <label class="cursor-pointer">
                <input type="radio" name="tipo" value={t} checked={t === 'geral'} required class="peer sr-only" />
                <div class="text-center text-sm px-3 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">{t}</div>
              </label>
            {/each}
          </div>
        </div>
        <div>
          <label for="modalidade" class="block text-sm font-medium mb-1">Modalidade</label>
          <select name="modalidade" id="modalidade" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {#each MODALIDADES as m}
              <option value={m.v}>{m.icon} {m.label}</option>
            {/each}
          </select>
        </div>
      </div>
    {/if}

    <div>
      <label for="titulo" class="block text-sm font-medium mb-1">Título</label>
      <input
        id="titulo"
        name="titulo"
        required
        value={editando?.titulo ?? ''}
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    </div>

    <div>
      <label for="descricao" class="block text-sm font-medium mb-1">Descrição</label>
      <textarea
        id="descricao"
        name="descricao"
        rows="3"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >{editando?.descricao ?? ''}</textarea>
    </div>

    <div>
      <label for="link" class="block text-sm font-medium mb-1">Link (opcional)</label>
      <input
        id="link"
        name="link"
        type="url"
        value={editando?.link ?? ''}
        placeholder="https://..."
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    </div>

    <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
      <input type="checkbox" name="publico" checked={editando?.publico ?? false} class="w-4 h-4 rounded text-primary-600" />
      <span class="text-sm">Visível no painel público</span>
    </label>

    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetOpen = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">
        {editando ? 'Salvar' : 'Criar'}
      </Button>
    </div>

    {#if editando}
      <form
        method="POST"
        action="?/excluir"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success') {
            toast.success('Excluído');
            sheetOpen = false;
            await invalidateAll();
          }
        }}
        onsubmit={(e) => { if (!confirm('Excluir esse objetivo?')) e.preventDefault(); }}
      >
        <input type="hidden" name="id" value={editando.id} />
        <button type="submit" class="text-sm text-red-700 hover:underline">🗑 Excluir</button>
      </form>
    {/if}
  </form>
</BottomSheet>

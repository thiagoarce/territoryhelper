<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';

  let { data, form }: { data: any; form: any } = $props();

  let sheetOpen = $state(false);
  let salvando = $state(false);

  const statusClasses: Record<string, string> = {
    aberto: 'bg-blue-100 text-blue-700',
    concluido: 'bg-green-100 text-green-700',
    cancelado: 'bg-slate-100 text-slate-500'
  };
</script>

<div class="flex items-end justify-between flex-wrap gap-3">
  <div>
    <h1 class="text-2xl font-bold">TCEs</h1>
    <p class="text-sm text-slate-500 mt-1">Territórios Comerciais Especiais — agrupam endereços de quadras diferentes</p>
  </div>
  <Button variant="primary" onclick={() => (sheetOpen = true)}>+ Novo TCE</Button>
</div>

{#if form?.erro}
  <div class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{form.erro}</div>
{/if}

<div class="mt-4 space-y-3">
  {#each data.tces as t}
    {@const pub = data.publicadores.find((p: any) => p.id === t.publicador_id)}
    <Card padding="md">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="font-mono text-xs text-slate-400">{t.id}</span>
            <span class="rounded px-2 py-0.5 text-xs {statusClasses[t.status] ?? 'bg-slate-100'}">{t.status}</span>
            {#if t.prazo}<span class="text-xs text-slate-500">prazo: {t.prazo}</span>{/if}
          </div>
          <h3 class="font-semibold">{t.nome}</h3>
          <div class="text-sm text-slate-600 mt-1">
            {t.qtd_unidades} unidade(s)
            {#if pub}· publicador: <strong>{pub.nome}</strong>{/if}
          </div>
          {#if t.notas}<div class="text-sm text-slate-500 italic mt-1">{t.notas}</div>{/if}
        </div>
        <div class="flex flex-col gap-1 text-sm">
          {#if t.status === 'aberto'}
            <form method="POST" action="?/mudarStatus" use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value="concluido" />
              <button class="text-green-700 hover:underline">✓ Concluir</button>
            </form>
          {/if}
          <form
            method="POST"
            action="?/excluir"
            use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}
            onsubmit={(e) => { if (!confirm('Excluir esse TCE?')) e.preventDefault(); }}
          >
            <input type="hidden" name="id" value={t.id} />
            <button class="text-red-700 hover:underline">🗑 Excluir</button>
          </form>
        </div>
      </div>
    </Card>
  {:else}
    <div class="text-center text-slate-400 py-10">Nenhum TCE ainda.</div>
  {/each}
</div>

<BottomSheet bind:open={sheetOpen} title="Novo TCE">
  <form
    method="POST"
    action="?/criar"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.msg || 'OK');
          sheetOpen = false;
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    <div>
      <label for="nome" class="block text-sm font-medium mb-1">Nome</label>
      <input
        id="nome"
        name="nome"
        required
        placeholder="Ex: Shopping Manaíra"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
    <div>
      <label for="publicador_id" class="block text-sm font-medium mb-1">Publicador</label>
      <select name="publicador_id" id="publicador_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">— ninguém —</option>
        {#each data.publicadores as p}
          <option value={p.id}>{p.nome}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="prazo" class="block text-sm font-medium mb-1">Prazo (opcional)</label>
      <input id="prazo" name="prazo" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="unidades_ids" class="block text-sm font-medium mb-1">IDs das unidades</label>
      <textarea
        id="unidades_ids"
        name="unidades_ids"
        rows="3"
        placeholder="Cola IDs separados por vírgula ou espaço&#10;Ex: 125, 1340, 12087"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
      ></textarea>
      <p class="text-xs text-slate-500 mt-1">
        Por enquanto cola IDs manuais. Em breve: seleção visual no mapa.
      </p>
    </div>
    <div>
      <label for="notas" class="block text-sm font-medium mb-1">Notas</label>
      <textarea id="notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></textarea>
    </div>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetOpen = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Criar TCE</Button>
    </div>
  </form>
</BottomSheet>

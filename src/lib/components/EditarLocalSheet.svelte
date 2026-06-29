<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { LocalComUnidades } from '$lib/server/queries';

  let {
    open = $bindable(false),
    local
  }: {
    open?: boolean;
    local: LocalComUnidades | null;
  } = $props();

  let salvando = $state(false);

  // Estado controlado pra dar feedback visual reativo
  let irmaoMora = $state(false);
  $effect(() => { if (local) irmaoMora = local.irmao_mora; });
</script>

<BottomSheet bind:open title={local ? `Editar ${local.tipo === 'predio' ? 'prédio' : 'endereço'}` : ''}>
  {#if local}
    <form
      method="POST"
      action="?/atualizarLocal"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            toast.success('Salvo');
            open = false;
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-4"
    >
      <input type="hidden" name="id" value={local.id} />

      <div class="text-sm text-slate-500">
        {local.logradouro}, {local.numero}
        {#if local.unidades.length > 1}<span>· {local.unidades.length} unidades</span>{/if}
      </div>

      <div>
        <label for="nome" class="block text-sm font-medium text-slate-700 mb-1">
          Nome do edifício / estabelecimento
        </label>
        <input
          id="nome"
          name="nome"
          value={local.nome || ''}
          placeholder="Ex: Edif. Solar, Farmácia X"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <!-- Tipo de entrada (só pra prédios) -->
      {#if local.tipo === 'predio'}
        <div>
          <span class="block text-sm font-medium text-slate-700 mb-2">Entrada do prédio</span>
          <div class="grid grid-cols-3 gap-2">
            {#each [
              { v: 'porteiro', label: 'Porteiro' },
              { v: 'eletronica', label: 'Eletrônica' },
              { v: 'sem', label: 'Sem' }
            ] as opt}
              <label class="cursor-pointer">
                <input type="radio" name="tipo_entrada" value={opt.v} checked={local.tipo_entrada === opt.v} class="peer sr-only" />
                <div class="text-center text-sm px-3 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700 hover:bg-slate-50">
                  {opt.label}
                </div>
              </label>
            {/each}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
            <input type="checkbox" name="acesso_caixas" checked={local.acesso_caixas} class="w-4 h-4 rounded text-primary-600" />
            <span class="text-sm">Acesso às caixas</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
            <input type="checkbox" name="acesso_interfones" checked={local.acesso_interfones} class="w-4 h-4 rounded text-primary-600" />
            <span class="text-sm">Acesso aos interfones</span>
          </label>
        </div>
      {/if}

      <!-- Irmão mora -->
      <div class="rounded-lg bg-slate-50 p-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="irmao_mora" bind:checked={irmaoMora} class="w-4 h-4 rounded text-primary-600" />
          <span class="text-sm font-medium">Irmão mora aqui</span>
        </label>
        {#if irmaoMora}
          <input
            name="nome_irmao"
            value={local.nome_irmao || ''}
            placeholder="Nome do irmão"
            class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        {/if}
      </div>

      <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
        <input type="checkbox" name="nao_visitar" checked={local.nao_visitar} class="w-4 h-4 rounded text-red-600" />
        <span class="text-sm font-medium text-red-700">Não visitar</span>
      </label>

      <div>
        <label for="notas" class="block text-sm font-medium text-slate-700 mb-1">Notas</label>
        <textarea
          id="notas"
          name="notas"
          rows="2"
          placeholder="Ex: portaria fechada 12-14h"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >{local.notas || ''}</textarea>
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (open = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvando} class="flex-1">Salvar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

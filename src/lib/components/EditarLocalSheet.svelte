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
  let uploadingFoto = $state(false);

  // Estado controlado pra dar feedback visual reativo
  let irmaoMora = $state(false);
  let tipoSel = $state<'casa' | 'predio' | 'comercio' | 'coletivo' | 'terreno'>('casa');
  $effect(() => {
    if (local) {
      irmaoMora = local.irmao_mora;
      tipoSel = (local.tipo as any) ?? 'casa';
    }
  });

  const TIPOS = [
    { v: 'casa', label: 'Casa', icon: '🏠' },
    { v: 'predio', label: 'Prédio', icon: '🏢' },
    { v: 'comercio', label: 'Comércio', icon: '🏪' },
    { v: 'coletivo', label: 'Coletivo', icon: '🏨' },
    { v: 'terreno', label: 'Terreno', icon: '🟫' }
  ] as const;

  async function uploadFoto(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !local) return;
    uploadingFoto = true;
    const fd = new FormData();
    fd.append('local_id', String(local.id));
    fd.append('foto', file);
    try {
      const res = await fetch('?/uploadFoto', { method: 'POST', body: fd });
      const json = await res.json();
      const parsed = json.data ? JSON.parse(json.data) : null;
      if (json.status === 200 || parsed?.ok) {
        toast.success('Foto enviada');
        await invalidateAll();
      } else {
        toast.error(parsed?.erro || 'Falhou enviar foto');
      }
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      uploadingFoto = false;
      input.value = '';
    }
  }
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

      <!-- Foto -->
      {#if local.foto_url}
        <div class="relative">
          <img src={local.foto_url} alt="Foto do local" class="w-full h-40 object-cover rounded-lg" />
          <form
            method="POST"
            action="?/removerFoto"
            use:enhance={() => async ({ update }) => {
              await update();
              toast.info('Foto removida');
              await invalidateAll();
            }}
            class="absolute top-2 right-2"
          >
            <input type="hidden" name="local_id" value={local.id} />
            <button class="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700">Remover</button>
          </form>
        </div>
      {:else}
        <label class="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm cursor-pointer hover:bg-slate-50">
          📷 {uploadingFoto ? 'Enviando...' : 'Adicionar foto'}
          <input type="file" accept="image/*" onchange={uploadFoto} class="hidden" disabled={uploadingFoto} />
        </label>
      {/if}

      <!-- Tipo do local -->
      <div>
        <span class="block text-sm font-medium text-slate-700 mb-2">Tipo</span>
        <div class="grid grid-cols-5 gap-1">
          {#each TIPOS as t}
            <label class="cursor-pointer">
              <input type="radio" name="tipo" value={t.v} bind:group={tipoSel} class="peer sr-only" />
              <div class="text-center px-1 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">
                <div class="text-xl">{t.icon}</div>
                <div class="text-[10px]">{t.label}</div>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <div>
        <label for="nome" class="block text-sm font-medium text-slate-700 mb-1">
          {tipoSel === 'comercio' ? '🏪 Nome do estabelecimento' : '🏢 Nome do edifício'}
        </label>
        <input
          id="nome"
          name="nome"
          value={local.nome || ''}
          placeholder={tipoSel === 'comercio' ? 'Ex: Farmácia X, Bar Y' : 'Ex: Edif. Solar'}
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <!-- Tipo de entrada (só pra prédios) -->
      {#if tipoSel === 'predio'}
        <div>
          <span class="block text-sm font-medium text-slate-700 mb-2">Entrada do prédio</span>
          <div class="grid grid-cols-3 gap-2">
            {#each [
              { v: 'porteiro', label: 'Porteiro', icon: '👮' },
              { v: 'eletronica', label: 'Eletrônica', icon: '🔘' },
              { v: 'sem', label: 'Sem portaria', icon: '🚪' }
            ] as opt}
              <label class="cursor-pointer">
                <input type="radio" name="tipo_entrada" value={opt.v} checked={local.tipo_entrada === opt.v} class="peer sr-only" />
                <div class="text-center text-sm px-3 py-3 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700 hover:bg-slate-50">
                  <div class="text-xl mb-0.5">{opt.icon}</div>
                  <div class="text-xs">{opt.label}</div>
                </div>
              </label>
            {/each}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" name="acesso_caixas" checked={local.acesso_caixas} class="w-4 h-4 rounded" />
            <span class="text-sm">📬 Acesso caixas</span>
          </label>
          <label class="flex items-center gap-2 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" name="acesso_interfones" checked={local.acesso_interfones} class="w-4 h-4 rounded" />
            <span class="text-sm">📞 Interfones</span>
          </label>
        </div>
      {/if}

      <!-- Irmão mora -->
      <div class="rounded-lg bg-amber-50 border border-amber-200 p-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="irmao_mora" bind:checked={irmaoMora} class="w-4 h-4 rounded" />
          <span class="text-sm font-medium">👤 Irmão mora aqui</span>
        </label>
        {#if irmaoMora}
          <input
            name="nome_irmao"
            value={local.nome_irmao || ''}
            placeholder="Nome do irmão"
            class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        {/if}
      </div>

      <label class="flex items-center gap-2 p-3 border border-red-200 bg-red-50 rounded-lg cursor-pointer">
        <input type="checkbox" name="nao_visitar" checked={local.nao_visitar} class="w-4 h-4 rounded" />
        <span class="text-sm font-medium text-red-700">🚫 Não visitar</span>
      </label>

      <div>
        <label for="notas" class="block text-sm font-medium text-slate-700 mb-1">📝 Notas</label>
        <textarea
          id="notas"
          name="notas"
          rows="2"
          placeholder="Ex: portaria fechada 12-14h"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >{local.notas || ''}</textarea>
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (open = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvando} class="flex-1">Salvar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

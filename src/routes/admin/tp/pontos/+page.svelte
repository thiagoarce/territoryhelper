<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { TpPonto } from './$types';

  let { data }: { data: { pontos: TpPonto[] } } = $props();

  let sheetPonto = $state(false);
  let pontoEdit = $state<Partial<TpPonto> | null>(null);
  let salvandoPonto = $state(false);
  let buscandoGPS = $state(false);
  let apagandoPonto = $state(false);

  function novoPonto() { pontoEdit = null; sheetPonto = true; }
  function editarPonto(p: TpPonto) { pontoEdit = { ...p }; sheetPonto = true; }

  function usarMinhaLocalizacao() {
    if (!navigator.geolocation) { toast.error('GPS indisponível'); return; }
    buscandoGPS = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pontoEdit = { ...(pontoEdit ?? {}), lat: pos.coords.latitude, lng: pos.coords.longitude };
        buscandoGPS = false;
      },
      () => { toast.error('Falhou pegar GPS'); buscandoGPS = false; },
      { enableHighAccuracy: true }
    );
  }

  async function apagarPonto(id: number) {
    if (!confirm('Excluir esse ponto?')) return;
    apagandoPonto = true;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarPonto', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    apagandoPonto = false;
    if (parsed.type === 'success') { toast.success('Removido'); sheetPonto = false; await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
</script>

<div class="p-4 space-y-3 pb-10">
  <div class="flex justify-end">
    <Button variant="primary" onclick={novoPonto}><Icon nome="plus" size={14} /> Ponto</Button>
  </div>
  {#each data.pontos as p (p.id)}
    <Card padding="md">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-semibold">{p.nome}</span>
            {#if !p.ativo}<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">inativo</span>{/if}
          </div>
          {#if p.endereco}<div class="text-xs text-slate-500 mt-0.5"><Icon nome="map-pin" size={12} /> {p.endereco}</div>{/if}
          {#if p.notas}<div class="text-xs italic text-slate-500 mt-0.5">{p.notas}</div>{/if}
        </div>
        <button onclick={() => editarPonto(p)} class="text-xs text-primary-700 hover:underline shrink-0"><Icon nome="pencil" size={14} /> Editar</button>
      </div>
    </Card>
  {/each}
  {#if data.pontos.length === 0}
    <div class="text-center py-10 text-slate-400">
      <Icon nome="map-pin" size={40} class="mx-auto text-slate-300" />
      <p class="mt-2">Nenhum ponto cadastrado.</p>
    </div>
  {/if}
</div>

<BottomSheet bind:open={sheetPonto} title={pontoEdit?.id ? 'Editar ponto' : 'Novo ponto'}>
  <form
    method="POST"
    action={pontoEdit?.id ? '?/atualizarPonto' : '?/criarPonto'}
    use:enhance={() => {
      salvandoPonto = true;
      return async ({ result, update }) => {
        await update();
        salvandoPonto = false;
        if (result.type === 'success') { toast.success('Salvo'); sheetPonto = false; await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      };
    }}
    class="space-y-3"
  >
    {#if pontoEdit?.id}<input type="hidden" name="id" value={pontoEdit.id} />{/if}
    <div>
      <label for="nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="nome" name="nome" required value={pontoEdit?.nome ?? ''} placeholder="Ex: Praça Central" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="endereco" class="block text-sm font-medium mb-1">Endereço</label>
      <input id="endereco" name="endereco" value={pontoEdit?.endereco ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="notas" class="block text-sm font-medium mb-1">Notas (onde pega o equipamento, chave, etc.)</label>
      <textarea id="notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{pontoEdit?.notas ?? ''}</textarea>
    </div>
    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-medium">Localização</span>
        <button type="button" onclick={usarMinhaLocalizacao} disabled={buscandoGPS} class="text-xs text-primary-700 hover:underline">
          <Icon nome="map-pin" size={12} /> {buscandoGPS ? 'Buscando...' : 'Usar minha localização'}
        </button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <input name="lat" type="number" step="any" value={pontoEdit?.lat ?? ''} placeholder="Latitude" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="lng" type="number" step="any" value={pontoEdit?.lng ?? ''} placeholder="Longitude" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
    </div>
    {#if pontoEdit?.id}
      <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
        <input type="checkbox" name="ativo" checked={pontoEdit?.ativo ?? true} class="w-4 h-4 rounded" />
        <span class="text-sm">Ativo</span>
      </label>
    {/if}
    <div class="flex gap-2 pt-2">
      {#if pontoEdit?.id}
        <Button variant="secondary" type="button" loading={apagandoPonto} onclick={() => apagarPonto(pontoEdit!.id!)} class="text-red-600">Excluir</Button>
      {/if}
      <Button variant="primary" type="submit" loading={salvandoPonto} class="flex-1">Salvar</Button>
    </div>
  </form>
</BottomSheet>

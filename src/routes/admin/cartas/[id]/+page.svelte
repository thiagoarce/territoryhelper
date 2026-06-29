<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { PredioDetalhado } from '$lib/server/queries';

  let { data, form }: { data: { predio: PredioDetalhado }; form: any } = $props();

  const geo: any = data.predio.geo_geojson;
  const lat = geo?.coordinates?.[1];
  const lng = geo?.coordinates?.[0];
  const mapsHref = lat && lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.predio.logradouro + ', ' + data.predio.numero)}`;
  const svHref = lat && lng
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
    : null;

  function statusApto(u: any): 'entregue' | 'desocupado' | 'naoescrever' | 'pendente' {
    if (u.nao_escrever) return 'naoescrever';
    if (u.desocupado) return 'desocupado';
    if (u.carta_entregue) return 'entregue';
    return 'pendente';
  }
</script>

<div>
  <a href="/admin/cartas" class="text-sm text-primary-700 hover:underline">← Cartas</a>
  <h1 class="text-2xl font-bold mt-1">{data.predio.nome || `${data.predio.logradouro}, ${data.predio.numero}`}</h1>
  <p class="text-sm text-slate-500">{data.predio.logradouro}, {data.predio.numero}</p>
</div>

<!-- Hero com badges -->
<Card padding="md" class="mt-4">
  <div class="flex flex-wrap gap-2 mb-3">
    {#if data.predio.tipo_entrada === 'porteiro'}<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded text-sm">🚪 Porteiro</span>{/if}
    {#if data.predio.tipo_entrada === 'eletronica'}<span class="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">🔌 Eletrônica</span>{/if}
    {#if data.predio.tipo_entrada === 'sem'}<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-sm">🚪 Sem entrada controlada</span>{/if}
    {#if data.predio.acesso_caixas}<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-sm">📬 Acesso às caixas</span>{/if}
    {#if data.predio.acesso_interfones}<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-sm">📞 Acesso aos interfones</span>{/if}
    {#if data.predio.irmao_mora}<span class="bg-purple-100 text-purple-700 px-2 py-1 rounded text-sm">👤 Irmão{data.predio.nome_irmao ? `: ${data.predio.nome_irmao}` : ' mora aqui'}</span>{/if}
  </div>

  <div class="flex gap-3 text-sm flex-wrap">
    <a href={mapsHref} target="_blank" rel="noopener" class="text-blue-600 hover:underline">📍 Como chegar</a>
    {#if svHref}<a href={svHref} target="_blank" rel="noopener" class="text-green-600 hover:underline">🌆 Street View</a>{/if}
  </div>

  {#if data.predio.notas}
    <p class="mt-3 text-sm text-slate-600 italic border-l-2 border-slate-300 pl-3">{data.predio.notas}</p>
  {/if}

  <!-- Gerar link público pra arranjo trabalhar -->
  <form
    method="POST"
    action="?/gerarLinkPublico"
    use:enhance={() => async ({ result, update }) => {
      await update();
      if (result.type === 'success') {
        const tok = (result.data as any)?.token;
        const url = `${window.location.origin}/cartas/${tok}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success('Link copiado: ' + url, 8000);
        } catch {
          toast.success('Link: ' + url, 8000);
        }
      } else if (result.type === 'failure') {
        toast.error(String((result.data as any)?.erro || 'Falhou'));
      }
    }}
    class="mt-3"
  >
    <Button variant="secondary" size="sm" type="submit">🔗 Gerar link público (arranjo)</Button>
  </form>
</Card>

<!-- Stats -->
<div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
  <Card padding="sm">
    <div class="text-xl font-bold">{data.predio.qtd_aptos}</div>
    <div class="text-xs text-slate-500">aptos</div>
  </Card>
  <Card padding="sm">
    <div class="text-xl font-bold text-purple-600">{data.predio.qtd_carta_entregue}</div>
    <div class="text-xs text-slate-500">entregues</div>
  </Card>
  <Card padding="sm">
    <div class="text-xl font-bold text-slate-500">{data.predio.qtd_desocupado}</div>
    <div class="text-xs text-slate-500">desocupados</div>
  </Card>
  <Card padding="sm">
    <div class="text-xl font-bold text-red-500">{data.predio.qtd_nao_escrever}</div>
    <div class="text-xs text-slate-500">não escrever</div>
  </Card>
</div>

<!-- Lista de aptos -->
<div class="mt-4 space-y-1">
  {#each data.predio.unidades as u (u.id)}
    {@const st = statusApto(u)}
    <div
      class="flex items-center gap-3 p-3 rounded-lg border"
      class:bg-purple-50={st === 'entregue'}
      class:border-purple-200={st === 'entregue'}
      class:bg-slate-50={st === 'desocupado'}
      class:border-slate-200={st === 'desocupado'}
      class:bg-red-50={st === 'naoescrever'}
      class:border-red-200={st === 'naoescrever'}
      class:bg-white={st === 'pendente'}
    >
      <div class="flex-1 min-w-0">
        <div class="font-mono font-semibold text-sm">{u.complemento || `Apto ${u.id}`}</div>
        {#if u.carta_entregue}<div class="text-xs text-purple-700">entregue em {u.carta_entregue}</div>{/if}
        {#if u.nota}<div class="text-xs text-slate-500 italic">{u.nota}</div>{/if}
      </div>
      <div class="flex gap-1">
        {#each [
          { campo: 'carta_entregue', emoji: '✉', label: 'Entregue', ativo: !!u.carta_entregue, cls: 'bg-purple-600' },
          { campo: 'desocupado', emoji: '🏚', label: 'Desocupado', ativo: u.desocupado, cls: 'bg-slate-600' },
          { campo: 'nao_escrever', emoji: '🚫', label: 'Não escrever', ativo: u.nao_escrever, cls: 'bg-red-600' }
        ] as opt}
          <form
            method="POST"
            action="?/toggleApto"
            use:enhance={() => async ({ result, update }) => {
              await update();
              if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
              await invalidateAll();
            }}
          >
            <input type="hidden" name="id" value={u.id} />
            <input type="hidden" name="campo" value={opt.campo} />
            <button
              type="submit"
              title={opt.label}
              class="px-2.5 py-1.5 rounded text-sm border transition-colors {opt.ativo ? opt.cls + ' text-white border-transparent' : 'border-slate-300 hover:bg-slate-100'}"
            >{opt.emoji}</button>
          </form>
        {/each}
      </div>
    </div>
  {/each}
</div>

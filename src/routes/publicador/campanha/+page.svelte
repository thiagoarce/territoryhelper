<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import type { Campanha } from '$lib/types';

  let { data }: {
    data: {
      ativa: { id: number; nome: string; data_inicio: string; data_alvo: string; meta_semanal: number | null } | null;
      objetivos: Campanha[];
    };
  } = $props();

  const MODALIDADES = [
    { v: 'casa', icone: 'home', label: 'Casa em casa' },
    { v: 'comercial', icone: 'store', label: 'Comercial' },
    { v: 'rural', icone: 'wheat', label: 'Rural' },
    { v: 'cartas', icone: 'mail', label: 'Cartas' },
    { v: 'telefone', icone: 'phone', label: 'Telefone' },
    { v: 'publico', icone: 'megaphone', label: 'Testemunho público' }
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

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Campanha</h1>
    {#if data.ativa}
      <p class="text-sm text-slate-500">{data.ativa.nome} · {data.ativa.data_inicio} → {data.ativa.data_alvo}</p>
    {/if}
  </div>

  {#if !data.ativa}
    <Card padding="md">
      <div class="text-center py-6">
        <div class="text-4xl mb-2 opacity-50"><Icon nome="calendar" size={40} class="mx-auto text-slate-300" /></div>
        <div class="font-medium">Sem campanha ativa</div>
      </div>
    </Card>
  {:else}
    {#each MODALIDADES as mod}
      {@const objs = porModalidade.get(mod.v) ?? []}
      {#if objs.length > 0}
        <div>
          <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
            <span><Icon nome={mod.icone} size={16} /></span> {mod.label}
          </h2>
          <div class="space-y-2">
            {#each objs as o}
              <Card padding="sm">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[10px] px-1.5 py-0.5 rounded {o.tipo === 'semana' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}">{o.tipo}</span>
                </div>
                <div class="font-medium text-sm">{o.titulo}</div>
                {#if o.descricao}<div class="text-xs text-slate-600 mt-0.5">{o.descricao}</div>{/if}
                {#if o.link}<a href={o.link} target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline"><Icon nome="link" size={14} /> abrir link</a>{/if}
              </Card>
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    {#if data.objetivos.length === 0}
      <Card padding="md">
        <div class="text-sm text-slate-500 text-center py-4">Nenhum objetivo publicado ainda.</div>
      </Card>
    {/if}
  {/if}
</div>

<script lang="ts">
  import Icon, { type NomeIcone } from '$lib/ui/Icon.svelte';
  let { data }: { data: { objetivos: any[] } } = $props();

  const MOD_INFO: Record<string, { label: string; icone: NomeIcone; cor: string }> = {
    casa: { icone: 'home', label: 'Casa em casa', cor: 'from-blue-500 to-blue-700' },
    comercial: { icone: 'store', label: 'Comercial', cor: 'from-emerald-500 to-emerald-700' },
    rural: { icone: 'wheat', label: 'Rural', cor: 'from-amber-500 to-amber-700' },
    cartas: { icone: 'mail', label: 'Cartas', cor: 'from-purple-500 to-purple-700' },
    telefone: { icone: 'phone', label: 'Telefone', cor: 'from-cyan-500 to-cyan-700' },
    publico: { icone: 'megaphone', label: 'Testemunho público', cor: 'from-pink-500 to-pink-700' }
  };

  const porMod = $derived.by(() => {
    const m = new Map<string, any[]>();
    for (const o of data.objetivos) {
      const arr = m.get(o.modalidade) ?? [];
      arr.push(o);
      m.set(o.modalidade, arr);
    }
    return m;
  });
</script>

<svelte:head>
  <title>Campanha — Territory Helper</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
  <div class="max-w-4xl mx-auto">
    <header class="text-center mb-8">
      <h1 class="text-4xl font-bold text-slate-800">Campanha</h1>
      <p class="text-slate-500 mt-2">Objetivos atuais da congregação</p>
    </header>

    {#if data.objetivos.length === 0}
      <div class="text-center text-slate-400 py-20">
        Nenhum objetivo público no momento.
      </div>
    {:else}
      <div class="space-y-6">
        {#each [...porMod] as [mod, objs]}
          {@const info = MOD_INFO[mod] ?? { label: mod, icone: 'circle-dot', cor: 'from-slate-500 to-slate-700' }}
          <section>
            <h2 class="text-sm font-semibold text-slate-600 uppercase mb-3 flex items-center gap-2">
              <span><Icon nome={info.icone} size={24} /></span>
              {info.label}
            </h2>
            <div class="grid gap-3 sm:grid-cols-2">
              {#each objs as o}
                <article class="rounded-xl shadow-sm overflow-hidden bg-white">
                  <div class="bg-gradient-to-r {info.cor} h-1.5"></div>
                  <div class="p-4">
                    <h3 class="font-semibold text-lg">{o.titulo}</h3>
                    {#if o.descricao}<p class="text-sm text-slate-600 mt-1">{o.descricao}</p>{/if}
                    {#if o.link}
                      <a href={o.link} target="_blank" rel="noopener" class="text-sm text-blue-600 hover:underline mt-2 inline-block">
                        <Icon nome="link" size={14} /> Saiba mais
                      </a>
                    {/if}
                  </div>
                </article>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    {/if}

    <footer class="text-center text-xs text-slate-400 mt-12">
      Territory Helper · <a href="/login" class="hover:underline">entrar</a>
    </footer>
  </div>
</div>

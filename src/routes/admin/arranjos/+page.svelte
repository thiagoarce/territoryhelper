<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { Modalidade, Arranjo } from './$types';

  let { data }: { data: { modalidades: Modalidade[]; arranjos: Arranjo[]; dirigentes: { id: string; nome: string }[] } } = $props();

  type Aba = 'semana' | 'modalidades';
  let aba = $state<Aba>('semana');

  let sheetMod = $state(false);
  let modEditando = $state<Partial<Modalidade> | null>(null);
  let salvandoMod = $state(false);

  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function abrirNovaMod() {
    modEditando = {
      nome: '',
      tipo_territorio: 'quadras',
      default_local: '',
      default_dia_semana: null,
      default_hora: null,
      cor: '#3b82f6',
      ativo: true
    };
    sheetMod = true;
  }

  function abrirEditarMod(m: Modalidade) {
    modEditando = { ...m };
    sheetMod = true;
  }

  function tipoLabel(t: string): string {
    if (t === 'quadras') return 'Designação de quadras';
    if (t === 'cartas_lista') return 'Lista de cartas';
    if (t === 'arquivo') return 'Arquivo enviado';
    if (t === 'ponto_tp') return 'Ponto fixo (TP)';
    return t;
  }
</script>

<div class="p-4 space-y-3 max-w-5xl mx-auto">
  <div>
    <h1 class="text-2xl font-bold">Arranjos</h1>
    <p class="text-sm text-slate-500">Configure modalidades e marque saídas da semana.</p>
  </div>

  <div class="flex gap-1 border-b border-slate-200">
    <button
      type="button"
      onclick={() => (aba = 'semana')}
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
      class:border-primary-600={aba === 'semana'}
      class:text-primary-700={aba === 'semana'}
      class:border-transparent={aba !== 'semana'}
      class:text-slate-500={aba !== 'semana'}
    >Semana</button>
    <button
      type="button"
      onclick={() => (aba = 'modalidades')}
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
      class:border-primary-600={aba === 'modalidades'}
      class:text-primary-700={aba === 'modalidades'}
      class:border-transparent={aba !== 'modalidades'}
      class:text-slate-500={aba !== 'modalidades'}
    >Modalidades ({data.modalidades.length})</button>
  </div>

  {#if aba === 'semana'}
    <Card padding="md">
      <div class="text-center py-8 text-slate-500">
        <div class="text-4xl mb-2 opacity-50">📅</div>
        <div class="font-medium">Em construção</div>
        <div class="text-sm">A criação de arranjos vem no próximo incremento. Configure as modalidades primeiro.</div>
        {#if data.modalidades.length === 0}
          <Button variant="primary" class="mt-3" onclick={() => { aba = 'modalidades'; abrirNovaMod(); }}>+ Criar primeira modalidade</Button>
        {/if}
      </div>
    </Card>
  {:else}
    <div class="flex justify-end">
      <Button variant="primary" onclick={abrirNovaMod}>+ Nova modalidade</Button>
    </div>

    {#if data.modalidades.length === 0}
      <Card padding="md">
        <div class="text-center py-8">
          <div class="text-4xl mb-2 opacity-50">🏷</div>
          <div class="font-medium">Sem modalidades</div>
          <div class="text-sm text-slate-500">Crie ao menos uma (Cartas, Pregação, Testemunho Público...).</div>
        </div>
      </Card>
    {:else}
      <div class="grid gap-2">
        {#each data.modalidades as m (m.id)}
          <Card padding="md">
            <div class="flex items-start gap-3">
              <span class="w-3 h-10 rounded shrink-0" style="background:{m.cor}"></span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold">{m.nome}</span>
                  {#if !m.ativo}<span class="text-[10px] bg-slate-200 text-slate-600 px-1.5 rounded">inativa</span>{/if}
                </div>
                <div class="text-xs text-slate-500 mt-0.5">{tipoLabel(m.tipo_territorio)}</div>
                <div class="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {#if m.default_dia_semana !== null}<span>📅 {DIAS[m.default_dia_semana]}</span>{/if}
                  {#if m.default_hora}<span>🕒 {m.default_hora.substring(0, 5)}</span>{/if}
                  {#if m.default_local}<span class="truncate">📍 {m.default_local}</span>{/if}
                </div>
              </div>
              <div class="flex flex-col gap-1 items-end">
                <button type="button" onclick={() => abrirEditarMod(m)} class="text-xs text-primary-700 hover:underline">Editar</button>
                <form
                  method="POST"
                  action="?/deletarModalidade"
                  use:enhance={() => async ({ result, update }) => {
                    await update();
                    if (result.type === 'success') { toast.success('Removida'); await invalidateAll(); }
                    else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
                  }}
                  onsubmit={(e) => { if (!confirm('Apagar essa modalidade?')) e.preventDefault(); }}
                >
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" class="text-xs text-red-600 hover:underline">Apagar</button>
                </form>
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<BottomSheet bind:open={sheetMod} title={modEditando?.id ? 'Editar modalidade' : 'Nova modalidade'}>
  {#if modEditando}
    <form
      method="POST"
      action={modEditando.id ? '?/atualizarModalidade' : '?/criarModalidade'}
      use:enhance={() => {
        salvandoMod = true;
        return async ({ result, update }) => {
          await update();
          salvandoMod = false;
          if (result.type === 'success') {
            toast.success('Salvo');
            sheetMod = false;
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-3"
    >
      {#if modEditando.id}<input type="hidden" name="id" value={modEditando.id} />{/if}

      <div>
        <label for="nome" class="block text-sm font-medium mb-1">Nome</label>
        <input id="nome" name="nome" required value={modEditando.nome ?? ''} placeholder="Ex: Cartas, Pregação, TP" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label for="tipo_territorio" class="block text-sm font-medium mb-1">Tipo de território</label>
        <select id="tipo_territorio" name="tipo_territorio" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={modEditando.tipo_territorio}>
          <option value="quadras">Designação de quadras</option>
          <option value="cartas_lista">Lista de cartas</option>
          <option value="arquivo">Arquivo enviado (PDF/imagem)</option>
          <option value="ponto_tp">Ponto fixo (TP)</option>
        </select>
        <p class="text-xs text-slate-500 mt-1">Define o que o admin vai escolher ao criar um arranjo dessa modalidade.</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="default_dia_semana" class="block text-sm font-medium mb-1">Dia (padrão)</label>
          <select id="default_dia_semana" name="default_dia_semana" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={modEditando.default_dia_semana ?? ''}>
            <option value="">—</option>
            {#each DIAS as d, i}
              <option value={i}>{d}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="default_hora" class="block text-sm font-medium mb-1">Hora (padrão)</label>
          <input id="default_hora" name="default_hora" type="time" value={modEditando.default_hora ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label for="default_local" class="block text-sm font-medium mb-1">Local (padrão)</label>
        <input id="default_local" name="default_local" value={modEditando.default_local ?? ''} placeholder="Ex: em frente ao Salão" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div class="grid grid-cols-[auto_1fr] gap-3 items-end">
        <div>
          <label for="cor" class="block text-sm font-medium mb-1">Cor</label>
          <input id="cor" name="cor" type="color" value={modEditando.cor ?? '#3b82f6'} class="w-14 h-10 rounded border border-slate-300" />
        </div>
        {#if modEditando.id}
          <label class="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" name="ativo" checked={modEditando.ativo ?? true} class="w-4 h-4 rounded" />
            Ativa
          </label>
        {/if}
      </div>

      <div class="flex gap-2 pt-2">
        <Button variant="secondary" onclick={() => (sheetMod = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvandoMod} class="flex-1">Salvar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

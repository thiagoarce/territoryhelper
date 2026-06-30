<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { semanaAtual, ocorrenciasEntre, agruparPorData, rangeDoPeriodo, DIAS_SEMANA, DIAS_ORDENADOS, type Periodo } from '$lib/arranjos';
  import type { Modalidade, Arranjo, PredioLite } from './$types';

  let { data }: {
    data: {
      modalidades: Modalidade[];
      arranjos: Arranjo[];
      dirigentes: { id: string; nome: string }[];
      quadrasIds: string[];
      predios: PredioLite[];
    };
  } = $props();

  type Aba = 'semana' | 'modalidades';
  let aba = $state<Aba>('semana');

  // === Modalidade sheet ===
  let sheetMod = $state(false);
  let modEditando = $state<Partial<Modalidade> | null>(null);
  let salvandoMod = $state(false);

  // === Arranjo sheet ===
  let sheetArr = $state(false);
  let arrEditando = $state<Partial<Arranjo> | null>(null);
  let salvandoArr = $state(false);
  let arquivoFile = $state<File | null>(null);
  let uploadando = $state(false);

  const DIAS = DIAS_SEMANA;
  const diasOrdenados = DIAS_ORDENADOS;

  let periodo = $state<Periodo>('semana');
  const range = $derived(rangeDoPeriodo(periodo));
  const ocorrencias = $derived(ocorrenciasEntre(data.arranjos, range.isoIni, range.isoFim));
  const ocPorData = $derived(agruparPorData(ocorrencias));
  const datasOrdenadas = $derived(Object.keys(ocPorData).sort());

  const modalidadeById = $derived(
    Object.fromEntries(data.modalidades.map((m) => [m.id, m] as const))
  );

  const dirigenteNome = $derived((id: string | null) =>
    id ? data.dirigentes.find((d) => d.id === id)?.nome ?? '?' : null
  );

  // === Sheet de modalidade ===
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

  // === Sheet de arranjo ===
  // dataPontual: se passado, cria como NÃO recorrente nesse dia (pra feriado / data específica)
  function abrirNovoArr(modalidade?: Modalidade, dataPontual?: string) {
    const m = modalidade ?? data.modalidades.find((x) => x.ativo) ?? data.modalidades[0];
    if (!m) {
      toast.error('Crie uma modalidade antes');
      aba = 'modalidades';
      return;
    }
    const pontual = !!dataPontual;
    arrEditando = {
      modalidade_id: m.id,
      recorrente: pontual ? false : m.tipo_territorio !== 'arquivo',
      dia_semana: pontual ? null : m.default_dia_semana,
      data: pontual ? dataPontual! : null,
      hora_inicio: m.default_hora,
      hora_fim: null,
      local_endereco: m.default_local,
      local_lat: null,
      local_lng: null,
      dirigente_id: null,
      quadras_ids: null,
      cartas_locais_ids: null,
      arquivo_url: null,
      arquivo_nome: null,
      notas: null,
      data_inicio: null,
      data_fim: null,
      ativo: true
    };
    arquivoFile = null;
    sheetArr = true;
  }

  function abrirEditarArr(a: Arranjo) {
    arrEditando = { ...a };
    arquivoFile = null;
    sheetArr = true;
  }

  function tipoLabel(t: string): string {
    if (t === 'quadras') return 'Designação de quadras';
    if (t === 'cartas_lista') return 'Lista de cartas';
    if (t === 'arquivo') return 'Arquivo enviado';
    if (t === 'ponto_tp') return 'Ponto fixo (TP)';
    return t;
  }

  async function apagarArranjo() {
    if (!arrEditando?.id) return;
    if (!confirm('Apagar esse arranjo?')) return;
    const fd = new FormData();
    fd.append('id', String(arrEditando.id));
    const res = await fetch('?/deletarArranjo', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text());
    if (parsed.type === 'success') {
      toast.success('Removido');
      sheetArr = false;
      await invalidateAll();
    } else if (parsed.type === 'failure') {
      toast.error(String((parsed.data as any)?.erro || 'Falhou'));
    }
  }

  // Upload de arquivo client-side via action separada
  async function uploadArquivo() {
    if (!arquivoFile) return;
    uploadando = true;
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivoFile);
      const res = await fetch('?/uploadArquivo', { method: 'POST', body: fd });
      const parsed = deserialize(await res.text());
      if (parsed.type === 'success') {
        const d = (parsed.data ?? {}) as { url?: string; nome?: string };
        arrEditando = { ...arrEditando, arquivo_url: d.url ?? null, arquivo_nome: d.nome ?? null };
        toast.success('Arquivo enviado');
      } else if (parsed.type === 'failure') {
        toast.error(String((parsed.data as any)?.erro || 'Upload falhou'));
      }
    } finally {
      uploadando = false;
    }
  }

  function formatData(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  function modTipoSelecionado(): 'quadras' | 'cartas_lista' | 'arquivo' | 'ponto_tp' | null {
    if (!arrEditando?.modalidade_id) return null;
    return modalidadeById[arrEditando.modalidade_id]?.tipo_territorio ?? null;
  }
</script>

<div class="p-4 space-y-3 max-w-5xl mx-auto">
  <div>
    <h1 class="text-2xl font-bold">Arranjos</h1>
    <p class="text-sm text-slate-500">Saídas semanais — cartas, pregação, TP. Admin coordena, dirigente distribui aos publicadores.</p>
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
    >Agenda ({ocorrencias.length})</button>
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
    <div class="flex justify-between items-center flex-wrap gap-2">
      <div class="flex gap-1 bg-slate-100 rounded-lg p-1">
        {#each [['semana','Semana'],['mes','Mês'],['tres_meses','3 meses'],['ano','Ano']] as [p, label]}
          <button
            type="button"
            onclick={() => (periodo = p as Periodo)}
            class="px-3 py-1 text-xs font-medium rounded transition-colors"
            class:bg-white={periodo === p}
            class:shadow-sm={periodo === p}
            class:text-slate-900={periodo === p}
            class:text-slate-500={periodo !== p}
          >{label}</button>
        {/each}
      </div>
      <Button variant="primary" onclick={() => abrirNovoArr()}>+ Novo arranjo</Button>
    </div>

    <div class="text-xs text-slate-500">
      {new Date(range.isoIni + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
      — {new Date(range.isoFim + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
      · {ocorrencias.length} ocorrência(s)
    </div>

    {#if ocorrencias.length === 0}
      <Card padding="md">
        <div class="text-center py-8">
          <div class="text-4xl mb-2 opacity-50">📅</div>
          <div class="font-medium">Nenhum arranjo no período</div>
          <div class="text-sm text-slate-500">Use "+ Novo arranjo" pra marcar uma saída.</div>
        </div>
      </Card>
    {:else}
      <div class="grid gap-3">
        {#each datasOrdenadas as dataIso}
          {@const dObj = new Date(dataIso + 'T12:00:00')}
          {@const diaLabel = dObj.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold">{diaLabel}</div>
              <button
                type="button"
                onclick={() => abrirNovoArr(undefined, dataIso)}
                class="text-[10px] text-primary-700 hover:underline"
              >+ pontual neste dia</button>
            </div>
            <div class="grid gap-2">
              {#each ocPorData[dataIso] ?? [] as oc (oc.arranjo.id + '-' + oc.data)}
                {@const m = modalidadeById[oc.arranjo.modalidade_id]}
                {@const nome = oc.arranjo.nome || m?.nome || 'Arranjo'}
                <Card padding="md">
                  <div class="flex items-start gap-3">
                    <span class="w-2 self-stretch rounded shrink-0" style="background:{m?.cor ?? '#3b82f6'}"></span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold">{nome}</span>
                        {#if oc.arranjo.recorrente}<span class="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded">semanal</span>{/if}
                        {#if m}<span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 rounded">{tipoLabel(m.tipo_territorio)}</span>{/if}
                      </div>
                      <div class="text-sm text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {#if oc.arranjo.hora_inicio}<span>🕒 {oc.arranjo.hora_inicio.substring(0, 5)}{oc.arranjo.hora_fim ? `–${oc.arranjo.hora_fim.substring(0, 5)}` : ''}</span>{/if}
                        {#if oc.arranjo.local_endereco}<span class="truncate">📍 {oc.arranjo.local_endereco}</span>{/if}
                        {#if oc.arranjo.dirigente_id}<span>👤 {dirigenteNome(oc.arranjo.dirigente_id)}</span>{/if}
                      </div>
                      {#if (oc.arranjo.quadras_ids?.length ?? 0) > 0}
                        <div class="mt-1.5 flex flex-wrap gap-1">
                          {#each oc.arranjo.quadras_ids ?? [] as q}
                            <span class="text-xs font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{q}</span>
                          {/each}
                        </div>
                      {/if}
                      {#if (oc.arranjo.cartas_locais_ids?.length ?? 0) > 0}
                        <div class="mt-1 text-xs text-slate-500">{oc.arranjo.cartas_locais_ids?.length} prédio(s) na lista</div>
                      {/if}
                      {#if oc.arranjo.arquivo_url}
                        <div class="mt-1">
                          <a href={oc.arranjo.arquivo_url} target="_blank" rel="noopener" class="text-xs text-primary-700 hover:underline">📎 {oc.arranjo.arquivo_nome || 'arquivo'}</a>
                        </div>
                      {/if}
                      {#if oc.arranjo.notas}
                        <div class="mt-1 text-xs italic text-slate-500">{oc.arranjo.notas}</div>
                      {/if}
                    </div>
                    <button type="button" onclick={() => abrirEditarArr(oc.arranjo)} class="text-xs text-primary-700 hover:underline shrink-0">Editar</button>
                  </div>
                </Card>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <details class="mt-4">
      <summary class="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
        Todos os arranjos cadastrados ({data.arranjos.length})
      </summary>
      <div class="mt-2 grid gap-1.5">
        {#each data.arranjos as a (a.id)}
          {@const m = modalidadeById[a.modalidade_id]}
          <button type="button" onclick={() => abrirEditarArr(a)} class="text-left p-2 rounded border border-slate-200 hover:bg-slate-50 text-sm flex gap-2 items-center">
            <span class="w-2 h-6 rounded" style="background:{m?.cor ?? '#3b82f6'}"></span>
            <span class="flex-1 truncate">{a.nome || m?.nome || 'Arranjo'} · {a.recorrente ? `toda ${a.dia_semana !== null ? DIAS[a.dia_semana!] : '?'}` : formatData(a.data)}</span>
            {#if !a.ativo}<span class="text-[10px] bg-slate-200 text-slate-600 px-1.5 rounded">inativo</span>{/if}
          </button>
        {/each}
      </div>
    </details>
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

<!-- Sheet modalidade -->
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

<!-- Sheet arranjo -->
<BottomSheet bind:open={sheetArr} title={arrEditando?.id ? 'Editar arranjo' : 'Novo arranjo'}>
  {#if arrEditando}
    {@const tipoMod = modTipoSelecionado()}
    <form
      method="POST"
      action={arrEditando.id ? '?/atualizarArranjo' : '?/criarArranjo'}
      use:enhance={() => {
        salvandoArr = true;
        return async ({ result, update }) => {
          await update();
          salvandoArr = false;
          if (result.type === 'success') {
            toast.success('Salvo');
            sheetArr = false;
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-3"
    >
      {#if arrEditando.id}<input type="hidden" name="id" value={arrEditando.id} />{/if}

      <div>
        <label for="modalidade_id" class="block text-sm font-medium mb-1">Modalidade</label>
        <select
          id="modalidade_id"
          name="modalidade_id"
          required
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={arrEditando.modalidade_id}
          onchange={(e) => {
            const id = Number((e.target as HTMLSelectElement).value);
            arrEditando = { ...arrEditando, modalidade_id: id };
          }}
        >
          {#each data.modalidades.filter((m) => m.ativo || m.id === arrEditando.modalidade_id) as m}
            <option value={m.id}>{m.nome} · {tipoLabel(m.tipo_territorio)}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="nome" class="block text-sm font-medium mb-1">Nome (opcional)</label>
        <input id="nome" name="nome" value={arrEditando.nome ?? ''} placeholder="Default: nome da modalidade" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <!-- Recorrência -->
      <div class="space-y-2 p-3 bg-slate-50 rounded-lg">
        <label class="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="recorrente"
            checked={arrEditando.recorrente}
            onchange={(e) => arrEditando = { ...arrEditando, recorrente: (e.target as HTMLInputElement).checked }}
            class="w-4 h-4 rounded"
          />
          Recorrente (toda semana)
        </label>

        {#if arrEditando.recorrente}
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="dia_semana" class="block text-xs font-medium mb-1">Dia</label>
              <select id="dia_semana" name="dia_semana" required class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={arrEditando.dia_semana ?? ''}>
                <option value="">—</option>
                {#each DIAS as d, i}<option value={i}>{d}</option>{/each}
              </select>
            </div>
            <div>
              <label for="hora_inicio" class="block text-xs font-medium mb-1">Hora</label>
              <input id="hora_inicio" name="hora_inicio" type="time" value={arrEditando.hora_inicio ?? ''} class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label for="data_inicio" class="block text-xs font-medium mb-1">Começa em (opcional)</label>
              <input id="data_inicio" name="data_inicio" type="date" value={arrEditando.data_inicio ?? ''} class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label for="data_fim" class="block text-xs font-medium mb-1">Termina em (opcional)</label>
              <input id="data_fim" name="data_fim" type="date" value={arrEditando.data_fim ?? ''} class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          </div>
        {:else}
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="data" class="block text-xs font-medium mb-1">Data</label>
              <input id="data" name="data" type="date" required value={arrEditando.data ?? ''} class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label for="hora_inicio" class="block text-xs font-medium mb-1">Hora</label>
              <input id="hora_inicio" name="hora_inicio" type="time" value={arrEditando.hora_inicio ?? ''} class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          </div>
        {/if}

        <div>
          <label for="hora_fim" class="block text-xs font-medium mb-1">Hora fim (opcional)</label>
          <input id="hora_fim" name="hora_fim" type="time" value={arrEditando.hora_fim ?? ''} class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div>
        <label for="local_endereco" class="block text-sm font-medium mb-1">Local</label>
        <input id="local_endereco" name="local_endereco" value={arrEditando.local_endereco ?? ''} placeholder="Endereço ou ponto de encontro" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label for="dirigente_id" class="block text-sm font-medium mb-1">Dirigente</label>
        <select id="dirigente_id" name="dirigente_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={arrEditando.dirigente_id ?? ''}>
          <option value="">—</option>
          {#each data.dirigentes as d}<option value={d.id}>{d.nome}</option>{/each}
        </select>
      </div>

      <!-- Bloco por tipo de território -->
      {#if tipoMod === 'quadras'}
        <div>
          <label for="quadras_ids" class="block text-sm font-medium mb-1">Quadras designadas</label>
          <input
            id="quadras_ids"
            name="quadras_ids"
            value={(arrEditando.quadras_ids ?? []).join(', ')}
            placeholder="Q-1, Q-2, Q-3"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <p class="text-xs text-slate-500 mt-1">IDs separados por vírgula. O dirigente distribui aos publicadores depois.</p>
        </div>
      {:else if tipoMod === 'cartas_lista'}
        <div>
          <span class="block text-sm font-medium mb-1">Prédios na lista</span>
          <input id="cartas_locais_ids" name="cartas_locais_ids" type="hidden" value={(arrEditando.cartas_locais_ids ?? []).join(',')} />
          <div class="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {#each data.predios.slice(0, 200) as p}
              {@const sel = arrEditando.cartas_locais_ids?.includes(p.id)}
              <label class="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={sel}
                  onchange={(e) => {
                    const cur = new Set(arrEditando.cartas_locais_ids ?? []);
                    if ((e.target as HTMLInputElement).checked) cur.add(p.id);
                    else cur.delete(p.id);
                    arrEditando = { ...arrEditando, cartas_locais_ids: [...cur] };
                  }}
                  class="w-4 h-4 rounded"
                />
                <span class="flex-1 truncate">{p.nome_estabelecimento ?? '—'}</span>
                <span class="text-xs text-slate-400 truncate">{p.logradouro ?? ''} {p.numero ?? ''}</span>
              </label>
            {/each}
          </div>
          <p class="text-xs text-slate-500 mt-1">{(arrEditando.cartas_locais_ids ?? []).length} prédio(s) selecionados (mostra os primeiros 200).</p>
        </div>
      {:else if tipoMod === 'arquivo'}
        <div>
          <span class="block text-sm font-medium mb-1">Arquivo (PDF/imagem)</span>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onchange={(e) => arquivoFile = (e.target as HTMLInputElement).files?.[0] ?? null}
            class="w-full text-sm"
          />
          {#if arquivoFile}
            <Button variant="secondary" onclick={uploadArquivo} loading={uploadando} class="mt-2 w-full">⬆ Enviar arquivo</Button>
          {/if}
          {#if arrEditando.arquivo_url}
            <div class="mt-2 text-xs text-slate-600">
              <a href={arrEditando.arquivo_url} target="_blank" rel="noopener" class="text-primary-700 hover:underline">📎 {arrEditando.arquivo_nome || 'arquivo'}</a>
            </div>
          {/if}
          <input type="hidden" name="arquivo_url" value={arrEditando.arquivo_url ?? ''} />
          <input type="hidden" name="arquivo_nome" value={arrEditando.arquivo_nome ?? ''} />
        </div>
      {:else if tipoMod === 'ponto_tp'}
        <p class="text-xs text-slate-500 italic">Ponto fixo de TP — só o local importa.</p>
      {/if}

      <div>
        <label for="notas" class="block text-sm font-medium mb-1">Notas (opcional)</label>
        <textarea id="notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{arrEditando.notas ?? ''}</textarea>
      </div>

      {#if arrEditando.id}
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ativo" checked={arrEditando.ativo} class="w-4 h-4 rounded" />
          Ativo
        </label>
      {/if}

      <div class="flex gap-2 pt-2">
        {#if arrEditando.id}
          <Button variant="secondary" onclick={apagarArranjo} class="text-red-600">Apagar</Button>
        {/if}
        <Button variant="secondary" onclick={() => (sheetArr = false)} class="flex-1">Cancelar</Button>
        <Button variant="primary" type="submit" loading={salvandoArr} class="flex-1">Salvar</Button>
      </div>
    </form>
  {/if}
</BottomSheet>

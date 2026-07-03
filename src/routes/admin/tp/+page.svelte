<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { TpPonto, TpTurno, EscalaDoTurno } from './$types';

  let { data }: {
    data: {
      pontos: TpPonto[];
      turnos: TpTurno[];
      escalaPorTurno: Record<number, EscalaDoTurno[]>;
      datasPorDiaSemana: Record<number, string>;
      diasSemana: string[];
      diasOrdenados: number[];
    };
  } = $props();

  const turnosPorPonto = $derived.by(() => {
    const m = new Map<number, TpTurno[]>();
    for (const t of data.turnos) {
      const arr = m.get(t.ponto_id) ?? [];
      arr.push(t);
      m.set(t.ponto_id, arr);
    }
    return m;
  });

  // Sheet ponto
  let sheetPonto = $state(false);
  let pontoEdit = $state<Partial<TpPonto> | null>(null);
  let salvandoPonto = $state(false);
  let buscandoGPS = $state(false);

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

  // Sheet turno
  let sheetTurno = $state(false);
  let turnoPontoId = $state<number | null>(null);
  let turnoEdit = $state<Partial<TpTurno> | null>(null);
  let salvandoTurno = $state(false);

  function novoTurno(pontoId: number) { turnoPontoId = pontoId; turnoEdit = null; sheetTurno = true; }
  function editarTurno(t: TpTurno) { turnoPontoId = t.ponto_id; turnoEdit = { ...t }; sheetTurno = true; }

  let apagandoTurnoId = $state<number | null>(null);
  let apagandoPonto = $state(false);

  async function apagarTurno(id: number) {
    if (!confirm('Excluir esse turno? A escala dele some junto.')) return;
    apagandoTurnoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarTurno', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    apagandoTurnoId = null;
    if (parsed.type === 'success') { toast.success('Removido'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function apagarPonto(id: number) {
    if (!confirm('Excluir esse ponto? Turnos e escala dele somem junto.')) return;
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

<div class="p-4 space-y-4 pb-10">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold">Testemunho público</h1>
      <p class="text-sm text-slate-500">Pontos fixos (carrinhos) + grade semanal de turnos.</p>
    </div>
    <Button variant="primary" onclick={novoPonto}><Icon nome="plus" size={14} /> Ponto</Button>
  </div>

  <div class="space-y-3">
    {#each data.pontos as p (p.id)}
      {@const turnosDoPonto = turnosPorPonto.get(p.id) ?? []}
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

        <div class="mt-3 pt-3 border-t border-slate-100">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Turnos ({turnosDoPonto.length})</span>
            <button onclick={() => novoTurno(p.id)} class="text-xs text-primary-700 hover:underline"><Icon nome="plus" size={12} /> Turno</button>
          </div>
          {#if turnosDoPonto.length === 0}
            <p class="text-xs text-slate-400">Nenhum turno cadastrado.</p>
          {:else}
            <div class="space-y-1.5">
              {#each data.diasOrdenados as dia}
                {@const turnosDoDia = turnosDoPonto.filter((t) => t.dia_semana === dia)}
                {#each turnosDoDia as t (t.id)}
                  {@const escala = data.escalaPorTurno[t.id] ?? []}
                  {@const buraco = escala.length < t.vagas}
                  <div class="flex items-center gap-2 text-xs bg-slate-50 rounded p-2">
                    <span class="font-medium w-9 shrink-0">{data.diasSemana[t.dia_semana]}</span>
                    <span class="w-24 shrink-0"><Icon nome="clock" size={12} /> {t.hora_inicio.substring(0, 5)}–{t.hora_fim.substring(0, 5)}</span>
                    <span class="flex-1 min-w-0 {buraco ? 'text-red-600' : 'text-slate-600'}">
                      {#if escala.length > 0}
                        {escala.map((e) => e.nome).join(', ')}
                      {/if}
                      ({escala.length}/{t.vagas})
                      {#if buraco}<Icon nome="alert" size={12} />{/if}
                    </span>
                    {#if !t.ativo}<span class="text-[10px] px-1 rounded bg-slate-200 text-slate-600">inativo</span>{/if}
                    <button onclick={() => editarTurno(t)} class="text-slate-500 hover:underline shrink-0"><Icon nome="pencil" size={12} /></button>
                    <button disabled={apagandoTurnoId === t.id} onclick={() => apagarTurno(t.id)} class="text-red-600 hover:underline shrink-0 disabled:opacity-40"><Icon nome={apagandoTurnoId === t.id ? 'loader' : 'trash'} size={12} class={apagandoTurnoId === t.id && 'animate-spin'} /></button>
                  </div>
                {/each}
              {/each}
            </div>
          {/if}
        </div>
      </Card>
    {/each}
    {#if data.pontos.length === 0}
      <div class="text-center py-10 text-slate-400">
        <Icon nome="megaphone" size={40} class="mx-auto text-slate-300" />
        <p class="mt-2">Nenhum ponto de testemunho público cadastrado.</p>
      </div>
    {/if}
  </div>
</div>

<!-- Sheet ponto -->
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
      <label for="notas" class="block text-sm font-medium mb-1">Notas (onde pega o carrinho, chave, etc.)</label>
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

<!-- Sheet turno -->
<BottomSheet bind:open={sheetTurno} title={turnoEdit?.id ? 'Editar turno' : 'Novo turno'}>
  <form
    method="POST"
    action={turnoEdit?.id ? '?/atualizarTurno' : '?/criarTurno'}
    use:enhance={() => {
      salvandoTurno = true;
      return async ({ result, update }) => {
        await update();
        salvandoTurno = false;
        if (result.type === 'success') { toast.success('Salvo'); sheetTurno = false; await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      };
    }}
    class="space-y-3"
  >
    {#if turnoEdit?.id}
      <input type="hidden" name="id" value={turnoEdit.id} />
    {:else}
      <input type="hidden" name="ponto_id" value={turnoPontoId} />
      <div>
        <label for="dia_semana" class="block text-sm font-medium mb-1">Dia da semana</label>
        <select id="dia_semana" name="dia_semana" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {#each data.diasOrdenados as dia}
            <option value={dia}>{data.diasSemana[dia]}</option>
          {/each}
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="hora_inicio" class="block text-sm font-medium mb-1">Início</label>
          <input id="hora_inicio" name="hora_inicio" type="time" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label for="hora_fim" class="block text-sm font-medium mb-1">Fim</label>
          <input id="hora_fim" name="hora_fim" type="time" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
    {/if}
    <div>
      <label for="vagas" class="block text-sm font-medium mb-1">Vagas</label>
      <input id="vagas" name="vagas" type="number" min="1" value={turnoEdit?.vagas ?? 2} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    {#if turnoEdit?.id}
      <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
        <input type="checkbox" name="ativo" checked={turnoEdit?.ativo ?? true} class="w-4 h-4 rounded" />
        <span class="text-sm">Ativo</span>
      </label>
    {/if}
    <Button variant="primary" type="submit" loading={salvandoTurno} class="w-full">Salvar</Button>
  </form>
</BottomSheet>

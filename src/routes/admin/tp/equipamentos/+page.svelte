<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { TpCarrinhoTipo, TpPecaCatalogo, TpCarrinho } from './+page.server';

  let { data }: {
    data: {
      carrinhoTipos: TpCarrinhoTipo[];
      pecasCatalogo: TpPecaCatalogo[];
      carrinhos: TpCarrinho[];
      publicadores: { id: string; nome: string }[];
      publicacoes: { id: number; nome: string }[];
    };
  } = $props();

  const pecasPorTipo = $derived.by(() => {
    const m = new Map<number, TpPecaCatalogo[]>();
    for (const p of data.pecasCatalogo) {
      const arr = m.get(p.tipo_id) ?? [];
      arr.push(p);
      m.set(p.tipo_id, arr);
    }
    return m;
  });

  const STATUS_CARRINHO: Record<string, { label: string; cls: string }> = {
    disponivel: { label: 'Disponível', cls: 'bg-green-100 text-green-700' },
    manutencao: { label: 'Manutenção', cls: 'bg-amber-100 text-amber-700' },
    aposentado: { label: 'Aposentado', cls: 'bg-slate-200 text-slate-600' }
  };

  let tipoExpandidoId = $state<number | null>(null);
  function toggleTipo(id: number) { tipoExpandidoId = tipoExpandidoId === id ? null : id; }

  // Sheet tipo
  let sheetTipo = $state(false);
  let tipoEdit = $state<Partial<TpCarrinhoTipo> | null>(null);
  let salvandoTipo = $state(false);
  let apagandoTipoId = $state<number | null>(null);
  function novoTipo() { tipoEdit = null; sheetTipo = true; }
  function editarTipo(t: TpCarrinhoTipo) { tipoEdit = { ...t }; sheetTipo = true; }

  async function apagarTipo(id: number) {
    if (!confirm('Excluir esse tipo de equipamento? As peças do catálogo dele somem junto.')) return;
    apagandoTipoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarTipo', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    apagandoTipoId = null;
    if (parsed.type === 'success') { toast.success('Removido'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // Sheet peça
  let sheetPeca = $state(false);
  let pecaTipoId = $state<number | null>(null);
  let pecaEdit = $state<Partial<TpPecaCatalogo> | null>(null);
  let salvandoPeca = $state(false);
  let apagandoPecaId = $state<number | null>(null);
  function novaPeca(tipoId: number) { pecaTipoId = tipoId; pecaEdit = { categoria: 'fisica' }; sheetPeca = true; }
  function editarPeca(p: TpPecaCatalogo) { pecaTipoId = p.tipo_id; pecaEdit = { ...p }; sheetPeca = true; }

  async function apagarPeca(id: number) {
    if (!confirm('Excluir essa peça do catálogo?')) return;
    apagandoPecaId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarPeca', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    apagandoPecaId = null;
    if (parsed.type === 'success') { toast.success('Removida'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // Sheet carrinho (equipamento)
  let sheetCarrinho = $state(false);
  let carrinhoEdit = $state<Partial<TpCarrinho> | null>(null);
  let salvandoCarrinho = $state(false);
  let apagandoCarrinhoId = $state<number | null>(null);
  function novoCarrinho() { carrinhoEdit = { status: 'disponivel', cor: '#3b82f6' }; sheetCarrinho = true; }
  function editarCarrinho(c: TpCarrinho) { carrinhoEdit = { ...c }; sheetCarrinho = true; }

  async function apagarCarrinho(id: number) {
    if (!confirm('Excluir esse equipamento? Se ele tiver agendamentos, use "Arquivar" no Planner em vez disso.')) return;
    apagandoCarrinhoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/apagarCarrinho', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    apagandoCarrinhoId = null;
    if (parsed.type === 'success') { toast.success('Removido'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
</script>

<div class="p-4 space-y-5 pb-10">
  <div>
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-sm font-semibold text-slate-600 uppercase">Equipamentos</h2>
      <Button variant="primary" size="sm" onclick={novoCarrinho}><Icon nome="plus" size={14} /> Equipamento</Button>
    </div>
    <div class="space-y-2">
      {#each data.carrinhos as c (c.id)}
        {@const st = STATUS_CARRINHO[c.status] ?? STATUS_CARRINHO.disponivel}
        <Card padding="md">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background-color: {c.cor}"></span>
                <span class="font-semibold"><Icon nome="cart" size={14} /> {c.nome}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded font-medium {st.cls}">{st.label}</span>
              </div>
              <div class="text-xs text-slate-500 mt-0.5">{c.tipo_nome}</div>
              {#if c.guardado_em}<div class="text-xs text-slate-500 mt-0.5">Guardado em: {c.guardado_em}</div>{/if}
              {#if c.custodia_nome}<div class="text-xs text-slate-500 mt-0.5"><Icon nome="user" size={12} /> Com {c.custodia_nome}</div>{/if}
              {#if c.notas}<div class="text-xs italic text-slate-500 mt-0.5">{c.notas}</div>{/if}
            </div>
            <button onclick={() => editarCarrinho(c)} class="text-xs text-primary-700 hover:underline shrink-0"><Icon nome="pencil" size={14} /> Editar</button>
          </div>
        </Card>
      {/each}
      {#if data.carrinhos.length === 0}
        <p class="text-xs text-slate-400 text-center py-4">Nenhum equipamento cadastrado. Cadastre um tipo antes.</p>
      {/if}
    </div>
  </div>

  <div>
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-sm font-semibold text-slate-600 uppercase">Tipos & peças</h2>
      <Button variant="secondary" size="sm" onclick={novoTipo}><Icon nome="plus" size={14} /> Tipo</Button>
    </div>
    <div class="space-y-2">
      {#each data.carrinhoTipos as t (t.id)}
        {@const pecas = pecasPorTipo.get(t.id) ?? []}
        <Card padding="none">
          <button
            type="button"
            onclick={() => toggleTipo(t.id)}
            class="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <div class="min-w-0">
              <div class="font-semibold flex items-center gap-2">
                {t.nome}
                {#if t.codigo}<span class="text-xs font-mono text-slate-400">{t.codigo}</span>{/if}
                {#if !t.ativo}<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">inativo</span>{/if}
              </div>
              {#if t.descricao}<div class="text-xs text-slate-500 truncate">{t.descricao}</div>{/if}
            </div>
            <span class="text-xs text-slate-400 shrink-0">{pecas.length} peça(s)
              <Icon nome="chevron-down" size={14} class={tipoExpandidoId === t.id ? 'inline-block' : 'inline-block -rotate-90'} />
            </span>
          </button>
          {#if tipoExpandidoId === t.id}
            <div class="border-t border-slate-100 px-4 py-3 space-y-2">
              <div class="flex justify-end gap-3 text-xs">
                <button onclick={() => editarTipo(t)} class="text-primary-700 hover:underline"><Icon nome="pencil" size={12} /> Editar tipo</button>
                <button disabled={apagandoTipoId === t.id} onclick={() => apagarTipo(t.id)} class="text-red-600 hover:underline disabled:opacity-40"><Icon nome={apagandoTipoId === t.id ? 'loader' : 'trash'} size={12} spin={apagandoTipoId === t.id} /> Excluir tipo</button>
              </div>
              {#each pecas as p (p.id)}
                <div class="flex items-center gap-2 text-xs bg-slate-50 rounded p-2">
                  <span class="flex-1 min-w-0 truncate">
                    {p.nome}
                    <span class="text-[10px] px-1.5 py-0.5 rounded ml-1 {p.categoria === 'literatura' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}">
                      {p.categoria === 'literatura' ? 'Literatura' : 'Física'}
                    </span>
                    {#if p.codigo}<span class="font-mono text-slate-400"> · {p.codigo}</span>{/if}
                    {#if p.publicacao_nome} · {p.publicacao_nome}{/if}
                    {#if !p.ativo} · inativa{/if}
                  </span>
                  <button onclick={() => editarPeca(p)} class="text-slate-500 hover:underline shrink-0"><Icon nome="pencil" size={12} /></button>
                  <button disabled={apagandoPecaId === p.id} onclick={() => apagarPeca(p.id)} class="text-red-600 hover:underline shrink-0 disabled:opacity-40"><Icon nome={apagandoPecaId === p.id ? 'loader' : 'trash'} size={12} spin={apagandoPecaId === p.id} /></button>
                </div>
              {/each}
              {#if pecas.length === 0}
                <p class="text-xs text-slate-400">Nenhuma peça no catálogo desse tipo.</p>
              {/if}
              <button onclick={() => novaPeca(t.id)} class="text-xs text-primary-700 hover:underline"><Icon nome="plus" size={12} /> Peça</button>
            </div>
          {/if}
        </Card>
      {/each}
      {#if data.carrinhoTipos.length === 0}
        <p class="text-xs text-slate-400 text-center py-4">Nenhum tipo de equipamento cadastrado.</p>
      {/if}
    </div>
  </div>
</div>

<!-- Sheet tipo -->
<BottomSheet bind:open={sheetTipo} title={tipoEdit?.id ? 'Editar tipo' : 'Novo tipo de equipamento'}>
  <form
    method="POST"
    action={tipoEdit?.id ? '?/atualizarTipo' : '?/criarTipo'}
    use:enhance={() => {
      salvandoTipo = true;
      return async ({ result, update }) => {
        await update();
        salvandoTipo = false;
        if (result.type === 'success') { toast.success('Salvo'); sheetTipo = false; await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      };
    }}
    class="space-y-3"
  >
    {#if tipoEdit?.id}<input type="hidden" name="id" value={tipoEdit.id} />{/if}
    <div>
      <label for="tipo-nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="tipo-nome" name="nome" required value={tipoEdit?.nome ?? ''} placeholder="Ex: Carrinho padrão" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="tipo-descricao" class="block text-sm font-medium mb-1">Descrição (opcional)</label>
      <textarea id="tipo-descricao" name="descricao" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{tipoEdit?.descricao ?? ''}</textarea>
    </div>
    <div>
      <label for="tipo-codigo" class="block text-sm font-medium mb-1">Código (mnemônico do JW Hub, opcional)</label>
      <input id="tipo-codigo" name="codigo" value={tipoEdit?.codigo ?? ''} placeholder="Ex: ldcrt-1 (3516-1)" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
    </div>
    {#if tipoEdit?.id}
      <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
        <input type="checkbox" name="ativo" checked={tipoEdit?.ativo ?? true} class="w-4 h-4 rounded" />
        <span class="text-sm">Ativo</span>
      </label>
    {/if}
    <Button variant="primary" type="submit" loading={salvandoTipo} class="w-full">Salvar</Button>
  </form>
</BottomSheet>

<!-- Sheet peça do catálogo -->
<BottomSheet bind:open={sheetPeca} title={pecaEdit?.id ? 'Editar peça' : 'Nova peça'}>
  <form
    method="POST"
    action={pecaEdit?.id ? '?/atualizarPeca' : '?/criarPeca'}
    use:enhance={() => {
      salvandoPeca = true;
      return async ({ result, update }) => {
        await update();
        salvandoPeca = false;
        if (result.type === 'success') { toast.success('Salvo'); sheetPeca = false; await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      };
    }}
    class="space-y-3"
  >
    {#if pecaEdit?.id}
      <input type="hidden" name="id" value={pecaEdit.id} />
    {:else}
      <input type="hidden" name="tipo_id" value={pecaTipoId} />
    {/if}
    <div>
      <label for="peca-nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="peca-nome" name="nome" required value={pecaEdit?.nome ?? ''} placeholder="Ex: Roda dianteira, Sentinela" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <span class="block text-sm font-medium mb-1">Categoria</span>
      <div class="grid grid-cols-2 gap-1">
        {#each [['fisica', 'Física'], ['literatura', 'Literatura']] as [v, l]}
          <label class="cursor-pointer">
            <input type="radio" name="categoria" value={v} checked={(pecaEdit?.categoria ?? 'fisica') === v} onchange={() => (pecaEdit = { ...pecaEdit, categoria: v as 'fisica' | 'literatura' })} required class="peer sr-only" />
            <div class="text-center text-sm px-3 py-2 border border-slate-300 rounded-lg peer-checked:bg-primary-50 peer-checked:border-primary-500 peer-checked:text-primary-700">{l}</div>
          </label>
        {/each}
      </div>
    </div>
    {#if (pecaEdit?.categoria ?? 'fisica') === 'literatura'}
      <div>
        <label for="peca-publicacao" class="block text-sm font-medium mb-1">Publicação (opcional)</label>
        <select id="peca-publicacao" name="publicacao_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">—</option>
          {#each data.publicacoes as pub}
            <option value={pub.id} selected={pecaEdit?.publicacao_id === pub.id}>{pub.nome}</option>
          {/each}
        </select>
      </div>
    {/if}
    <div>
      <label for="peca-ordem" class="block text-sm font-medium mb-1">Ordem</label>
      <input id="peca-ordem" name="ordem" type="number" min="0" value={pecaEdit?.ordem ?? 0} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="peca-codigo" class="block text-sm font-medium mb-1">Código (mnemônico do JW Hub, opcional)</label>
      <input id="peca-codigo" name="codigo" value={pecaEdit?.codigo ?? ''} placeholder="Ex: ldcrtadp (3520)" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
    </div>
    {#if pecaEdit?.id}
      <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
        <input type="checkbox" name="ativo" checked={pecaEdit?.ativo ?? true} class="w-4 h-4 rounded" />
        <span class="text-sm">Ativa</span>
      </label>
    {/if}
    <Button variant="primary" type="submit" loading={salvandoPeca} class="w-full">Salvar</Button>
  </form>
</BottomSheet>

<!-- Sheet equipamento (carrinho) -->
<BottomSheet bind:open={sheetCarrinho} title={carrinhoEdit?.id ? 'Editar equipamento' : 'Novo equipamento'}>
  <form
    method="POST"
    action={carrinhoEdit?.id ? '?/atualizarCarrinho' : '?/criarCarrinho'}
    use:enhance={() => {
      salvandoCarrinho = true;
      return async ({ result, update }) => {
        await update();
        salvandoCarrinho = false;
        if (result.type === 'success') { toast.success('Salvo'); sheetCarrinho = false; await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      };
    }}
    class="space-y-3"
  >
    {#if carrinhoEdit?.id}<input type="hidden" name="id" value={carrinhoEdit.id} />{/if}
    <div>
      <label for="carrinho-nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="carrinho-nome" name="nome" required value={carrinhoEdit?.nome ?? ''} placeholder="Ex: Carrinho 1" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="carrinho-tipo" class="block text-sm font-medium mb-1">Tipo</label>
      <select id="carrinho-tipo" name="tipo_id" required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">— selecione —</option>
        {#each data.carrinhoTipos as t}
          <option value={t.id} selected={carrinhoEdit?.tipo_id === t.id}>{t.nome}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="carrinho-cor" class="block text-sm font-medium mb-1">Cor (usada na Visão geral)</label>
      <input id="carrinho-cor" name="cor" type="color" value={carrinhoEdit?.cor ?? '#3b82f6'} class="h-10 w-full rounded-lg border border-slate-300" />
    </div>
    <div>
      <label for="carrinho-guardado" class="block text-sm font-medium mb-1">Guardado em</label>
      <input id="carrinho-guardado" name="guardado_em" value={carrinhoEdit?.guardado_em ?? ''} placeholder="Ex: Salão, casa do irmão Fulano" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="carrinho-custodia" class="block text-sm font-medium mb-1">Custódia (com quem está)</label>
      <select id="carrinho-custodia" name="custodia_id" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">—</option>
        {#each data.publicadores as p}
          <option value={p.id} selected={carrinhoEdit?.custodia_id === p.id}>{p.nome}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="carrinho-status" class="block text-sm font-medium mb-1">Status</label>
      <select id="carrinho-status" name="status" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="disponivel" selected={(carrinhoEdit?.status ?? 'disponivel') === 'disponivel'}>Disponível</option>
        <option value="manutencao" selected={carrinhoEdit?.status === 'manutencao'}>Manutenção</option>
        <option value="aposentado" selected={carrinhoEdit?.status === 'aposentado'}>Aposentado</option>
      </select>
    </div>
    <div>
      <label for="carrinho-notas" class="block text-sm font-medium mb-1">Notas</label>
      <textarea id="carrinho-notas" name="notas" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{carrinhoEdit?.notas ?? ''}</textarea>
    </div>
    <div class="flex gap-2 pt-2">
      {#if carrinhoEdit?.id}
        <Button variant="secondary" type="button" loading={apagandoCarrinhoId === carrinhoEdit.id} onclick={() => apagarCarrinho(carrinhoEdit!.id!)} class="text-red-600">Excluir</Button>
      {/if}
      <Button variant="primary" type="submit" loading={salvandoCarrinho} class="flex-1">Salvar</Button>
    </div>
  </form>
</BottomSheet>

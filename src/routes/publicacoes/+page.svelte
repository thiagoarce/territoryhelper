<script lang="ts">
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll, goto } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { PedidoLinha, ReposicaoItem, TendenciaMes, PublicacaoCatalogo, CategoriaPublicacao, PublicadorLinha, ControleLinha } from './$types';

  let { data }: {
    data: {
      pedidos: PedidoLinha[];
      filtro: string;
      souAdmin: boolean;
      reposicao: ReposicaoItem[];
      tendencia: TendenciaMes[];
      catalogo: PublicacaoCatalogo[];
      publicadores: PublicadorLinha[];
      controlePublicacaoId: number | null;
      controle: ControleLinha[];
      erro?: string;
    };
  } = $props();

  const CATEGORIA_LABEL: Record<CategoriaPublicacao, string> = {
    biblia: 'Bíblias', livro: 'Livros', brochura: 'Brochuras e livretos',
    folheto: 'Folhetos e convites', cartao_visita: 'Cartões de visita',
    revista: 'Revistas', formulario: 'Formulários e acessórios', outro: 'Outros'
  };
  const ORDEM_CATEGORIAS: CategoriaPublicacao[] = ['biblia', 'livro', 'brochura', 'folheto', 'cartao_visita', 'revista', 'formulario', 'outro'];

  const catalogoAgrupado = $derived.by(() => {
    const m: Record<string, PublicacaoCatalogo[]> = {};
    for (const p of data.catalogo) (m[p.categoria] ??= []).push(p);
    return m;
  });

  let sheetCatalogo = $state(false);
  let pubEdit = $state<Partial<PublicacaoCatalogo> | null>(null);
  let salvandoPub = $state(false);
  let enviandoImagem = $state(false);

  function novaPublicacao() { pubEdit = { categoria: 'outro', qtd_estoque: 0, ativo: true }; sheetCatalogo = true; }
  function editarPublicacao(p: PublicacaoCatalogo) { pubEdit = { ...p }; sheetCatalogo = true; }

  async function uploadImagem(ev: Event) {
    if (!pubEdit?.id) return;
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    enviandoImagem = true;
    const fd = new FormData();
    fd.append('id', String(pubEdit.id));
    fd.append('imagem', file);
    const res = await fetch('?/uploadImagemPublicacao', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    enviandoImagem = false;
    if (parsed.type === 'success') {
      pubEdit = { ...pubEdit, imagem_url: parsed.data.imagem_url };
      toast.success('Imagem enviada');
      await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro || 'Falhou'));
    }
  }

  const ESTADO_LABEL: Record<string, string> = { acabando: 'Acabando', zerado: 'Zerado', danificado: 'Danificado' };
  const ESTADO_CLASSE: Record<string, string> = {
    acabando: 'bg-amber-100 text-amber-700',
    zerado: 'bg-red-100 text-red-700',
    danificado: 'bg-red-100 text-red-700'
  };

  const reposicaoAgrupada = $derived.by(() => {
    const m: Record<string, ReposicaoItem[]> = {};
    for (const r of data.reposicao) (m[r.carrinho_nome + ' · ' + r.ponto_nome] ??= []).push(r);
    return m;
  });

  let resolvendoId = $state<number | null>(null);
  async function resolverReposicao(id: number) {
    resolvendoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/resolverReposicao', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    resolvendoId = null;
    if (parsed.type === 'success') { toast.success('Resolvido'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  const FILTROS = [
    ['pendentes', 'Pendentes'],
    ['entregue', 'Entregues'],
    ['cancelado', 'Cancelados'],
    ['todos', 'Todos']
  ] as const;

  const STATUS_LABEL: Record<string, string> = {
    aberto: 'Aberto',
    pedido: 'Pedido feito',
    entregue: 'Entregue',
    cancelado: 'Cancelado'
  };
  const STATUS_CLASSE: Record<string, string> = {
    aberto: 'bg-slate-100 text-slate-700',
    pedido: 'bg-blue-100 text-blue-700',
    entregue: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-700'
  };

  let processandoId = $state<number | null>(null);
  let notasEmEdicao: Record<number, string> = $state({});

  function mudarFiltro(f: string) {
    goto(`?status=${f}`, { keepFocus: true });
  }

  async function atualizarStatus(id: number, status: string) {
    processandoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    fd.append('status', status);
    const res = await fetch('?/atualizarPedido', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    processandoId = null;
    if (parsed.type === 'success') { toast.success('Atualizado'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  async function salvarNotas(id: number) {
    processandoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    fd.append('notas_servo', notasEmEdicao[id] ?? '');
    const res = await fetch('?/atualizarPedido', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    processandoId = null;
    if (parsed.type === 'success') { toast.success('Notas salvas'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // Lista de controle — servo escolhe uma publicação e confirma quanto cada
  // publicador pediu/recebeu (contador independente do fluxo de
  // pedidos_publicacao, que é pra pedido especial avulso).
  function selecionarControle(id: string) {
    const usp = new URLSearchParams(window.location.search);
    if (id) usp.set('controle', id); else usp.delete('controle');
    goto(`?${usp.toString()}`, { keepFocus: true, noScroll: true });
  }

  let controleEmEdicao: Record<string, number> = $state({});
  function chaveControle(publicadorId: string, campo: 'qtd_pedida' | 'qtd_entregue') {
    return `${publicadorId}|${campo}`;
  }
  function controleAtual(publicadorId: string, campo: 'qtd_pedida' | 'qtd_entregue'): number {
    const chave = chaveControle(publicadorId, campo);
    if (chave in controleEmEdicao) return controleEmEdicao[chave];
    return data.controle.find((c) => c.publicador_id === publicadorId)?.[campo] ?? 0;
  }
  let salvandoControle = $state<string | null>(null);
  async function ajustarControle(publicadorId: string, campo: 'qtd_pedida' | 'qtd_entregue', delta: number) {
    if (!data.controlePublicacaoId) return;
    const chave = chaveControle(publicadorId, campo);
    const novoValor = Math.max(0, controleAtual(publicadorId, campo) + delta);
    controleEmEdicao[chave] = novoValor;
    salvandoControle = chave;
    const fd = new FormData();
    fd.append('publicacao_id', String(data.controlePublicacaoId));
    fd.append('publicador_id', publicadorId);
    fd.append('campo', campo);
    fd.append('valor', String(novoValor));
    const res = await fetch('?/atualizarControle', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    salvandoControle = null;
    if (parsed.type !== 'success') toast.error(String(parsed.data?.erro || 'Falhou'));
    await invalidateAll();
  }
</script>

<div class="p-4 space-y-3 pb-10 max-w-2xl mx-auto">
  <div>
    <h1 class="text-2xl font-bold">Área do servo</h1>
    <p class="text-sm text-slate-500">Pedidos de publicação da congregação</p>
  </div>

  <div class="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
    {#each FILTROS as [f, label]}
      <button
        type="button"
        onclick={() => mudarFiltro(f)}
        class="px-3 py-1 text-xs font-medium rounded transition-colors"
        class:bg-white={data.filtro === f}
        class:shadow-sm={data.filtro === f}
        class:text-slate-900={data.filtro === f}
        class:text-slate-500={data.filtro !== f}
      >{label}</button>
    {/each}
  </div>

  {#if data.pedidos.length === 0}
    <Card padding="md">
      <div class="text-center py-8">
        <Icon nome="inbox" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Nenhum pedido nesse filtro</div>
      </div>
    </Card>
  {:else}
    <div class="grid gap-2">
      {#each data.pedidos as p (p.id)}
        <Card padding="md">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">{p.publicacao_nome ?? p.descricao ?? 'Publicação'}</div>
              <div class="text-sm text-slate-600">
                <Icon nome="user" size={14} /> {p.publicador_nome} · qtd {p.qtd}
              </div>
              <div class="text-xs text-slate-400 mt-0.5">{new Date(p.criado_em).toLocaleDateString('pt-BR')}</div>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 {STATUS_CLASSE[p.status]}">{STATUS_LABEL[p.status]}</span>
          </div>

          <div class="mt-2 flex flex-wrap gap-1.5">
            {#if p.status === 'aberto'}
              <Button variant="secondary" size="sm" loading={processandoId === p.id} onclick={() => atualizarStatus(p.id, 'pedido')}>Marcar como pedido</Button>
            {/if}
            {#if p.status === 'pedido'}
              <Button variant="secondary" size="sm" loading={processandoId === p.id} onclick={() => atualizarStatus(p.id, 'entregue')}>Marcar como entregue</Button>
            {/if}
            {#if p.status === 'aberto' || p.status === 'pedido'}
              <Button variant="secondary" size="sm" loading={processandoId === p.id} onclick={() => atualizarStatus(p.id, 'cancelado')} class="text-red-600">Cancelar</Button>
            {/if}
          </div>

          <div class="mt-2 flex gap-1.5">
            <input
              value={notasEmEdicao[p.id] ?? p.notas_servo ?? ''}
              oninput={(e) => (notasEmEdicao[p.id] = (e.target as HTMLInputElement).value)}
              placeholder="Notas do servo (opcional)"
              class="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
            <Button variant="secondary" size="sm" loading={processandoId === p.id} onclick={() => salvarNotas(p.id)}>Salvar</Button>
          </div>
        </Card>
      {/each}
    </div>
  {/if}

  <div>
    <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
      <Icon nome="alert" size={14} /> Reposição
      <span class="text-xs text-slate-400 normal-case font-normal">({data.reposicao.length})</span>
    </h2>
    {#if data.reposicao.length === 0}
      <p class="text-sm text-slate-400 italic">Nada pendente de reposição.</p>
    {:else}
      <div class="space-y-3">
        {#each Object.entries(reposicaoAgrupada) as [grupo, itens]}
          <Card padding="md">
            <div class="text-sm font-semibold mb-1.5">{grupo}</div>
            <div class="space-y-1.5">
              {#each itens as item (item.id)}
                <div class="flex items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <span class="flex-1 min-w-0 truncate">
                    {item.peca_nome}
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full ml-1 {ESTADO_CLASSE[item.estado]}">{ESTADO_LABEL[item.estado]}</span>
                    {#if item.obs}<span class="text-xs text-slate-500 italic"> — {item.obs}</span>{/if}
                  </span>
                  <button
                    type="button"
                    disabled={resolvendoId === item.id}
                    onclick={() => resolverReposicao(item.id)}
                    class="text-xs text-primary-700 hover:underline shrink-0 disabled:opacity-40"
                  ><Icon nome={resolvendoId === item.id ? 'loader' : 'check'} size={12} spin={resolvendoId === item.id} /> Resolvido</button>
                </div>
              {/each}
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>

  {#if data.tendencia.length > 0}
    <Card padding="md">
      <h2 class="font-semibold mb-2">Tendência de colocações</h2>
      <div class="space-y-1 text-sm">
        {#each data.tendencia as t}
          <div class="flex items-center justify-between">
            <span class="text-slate-600">{t.mes} · {t.publicacao_nome}</span>
            <span class="font-medium">{t.qtd}</span>
          </div>
        {/each}
      </div>
    </Card>
  {/if}

  <Card padding="md">
    <h2 class="font-semibold mb-1">Suprimento de campanha</h2>
    {#if data.souAdmin}
      <a href="/admin/campanha" class="text-sm text-primary-700 hover:underline">Gerenciar em Campanha →</a>
    {:else}
      <p class="text-sm text-slate-500">O suprimento (catálogo + checklist da campanha) é gerenciado por um admin em Campanha.</p>
    {/if}
  </Card>

  <div>
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-sm font-semibold text-slate-600 uppercase flex items-center gap-2">
        <Icon nome="clipboard" size={14} /> Catálogo
        <span class="text-xs text-slate-400 normal-case font-normal">({data.catalogo.length})</span>
      </h2>
      <Button variant="primary" size="sm" onclick={novaPublicacao}><Icon nome="plus" size={14} /> Publicação</Button>
    </div>
    <div class="space-y-3">
      {#each ORDEM_CATEGORIAS as cat}
        {@const itens = catalogoAgrupado[cat] ?? []}
        {#if itens.length > 0}
          <div>
            <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">{CATEGORIA_LABEL[cat]}</div>
            <div class="grid gap-1.5">
              {#each itens as p (p.id)}
                <button type="button" onclick={() => editarPublicacao(p)} class="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-100">
                  {#if p.imagem_url}
                    <img src={p.imagem_url} alt="" class="w-8 h-8 rounded object-cover shrink-0" />
                  {:else}
                    <span class="w-8 h-8 rounded bg-slate-200 shrink-0 flex items-center justify-center text-slate-400"><Icon nome="file-text" size={14} /></span>
                  {/if}
                  <span class="flex-1 min-w-0 truncate {!p.ativo ? 'text-slate-400 line-through' : ''}">{p.nome}{#if p.codigo}<span class="text-xs text-slate-400"> ({p.codigo})</span>{/if}</span>
                  {#if p.qtd_estoque > 0}<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">{p.qtd_estoque} em estoque</span>{/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
      {#if data.catalogo.length === 0}
        <p class="text-sm text-slate-400 italic">Nenhuma publicação cadastrada.</p>
      {/if}
    </div>
  </div>

  <div>
    <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
      <Icon nome="square-check" size={14} /> Lista de controle
    </h2>
    <p class="text-xs text-slate-500 mb-2">Escolha uma publicação e confirme quanto cada publicador pediu e já recebeu.</p>
    <select
      value={data.controlePublicacaoId ?? ''}
      onchange={(e) => selecionarControle((e.target as HTMLSelectElement).value)}
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-2"
    >
      <option value="">Escolha uma publicação...</option>
      {#each ORDEM_CATEGORIAS as cat}
        {@const itens = catalogoAgrupado[cat] ?? []}
        {#if itens.length > 0}
          <optgroup label={CATEGORIA_LABEL[cat]}>
            {#each itens as p}<option value={p.id}>{p.nome}</option>{/each}
          </optgroup>
        {/if}
      {/each}
    </select>

    {#if data.controlePublicacaoId}
      {#if data.publicadores.length === 0}
        <p class="text-sm text-slate-400 italic">Nenhum publicador ativo cadastrado.</p>
      {:else}
        <div class="space-y-1">
          <div class="grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold px-2.5">
            <span>Publicador</span><span>Pedido</span><span>Entregue</span>
          </div>
          {#each data.publicadores as pub (pub.id)}
            <div class="grid grid-cols-[1fr_auto_auto] items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 text-sm">
              <span class="truncate">{pub.nome}</span>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  disabled={salvandoControle === chaveControle(pub.id, 'qtd_pedida')}
                  onclick={() => ajustarControle(pub.id, 'qtd_pedida', -1)}
                  class="w-6 h-6 rounded bg-white border border-slate-300 text-slate-600 disabled:opacity-40"
                >−</button>
                <span class="w-5 text-center font-medium">{controleAtual(pub.id, 'qtd_pedida')}</span>
                <button
                  type="button"
                  disabled={salvandoControle === chaveControle(pub.id, 'qtd_pedida')}
                  onclick={() => ajustarControle(pub.id, 'qtd_pedida', 1)}
                  class="w-6 h-6 rounded bg-white border border-slate-300 text-slate-600 disabled:opacity-40"
                >+</button>
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  disabled={salvandoControle === chaveControle(pub.id, 'qtd_entregue')}
                  onclick={() => ajustarControle(pub.id, 'qtd_entregue', -1)}
                  class="w-6 h-6 rounded bg-white border border-slate-300 text-slate-600 disabled:opacity-40"
                >−</button>
                <span class="w-5 text-center font-medium">{controleAtual(pub.id, 'qtd_entregue')}</span>
                <button
                  type="button"
                  disabled={salvandoControle === chaveControle(pub.id, 'qtd_entregue')}
                  onclick={() => ajustarControle(pub.id, 'qtd_entregue', 1)}
                  class="w-6 h-6 rounded bg-white border border-slate-300 text-slate-600 disabled:opacity-40"
                >+</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<BottomSheet bind:open={sheetCatalogo} title={pubEdit?.id ? 'Editar publicação' : 'Nova publicação'}>
  {#if pubEdit}
    <form
      method="POST"
      action="?/salvarPublicacao"
      use:enhance={() => {
        salvandoPub = true;
        return async ({ result, update }) => {
          await update();
          salvandoPub = false;
          if (result.type === 'success') { toast.success('Salvo'); sheetCatalogo = false; await invalidateAll(); }
          else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
        };
      }}
      class="space-y-3"
    >
      {#if pubEdit.id}<input type="hidden" name="id" value={pubEdit.id} />{/if}

      {#if pubEdit.id}
        <div class="flex items-center gap-3">
          {#if pubEdit.imagem_url}
            <img src={pubEdit.imagem_url} alt="" class="w-16 h-16 rounded-lg object-cover" />
          {:else}
            <span class="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300"><Icon nome="file-text" size={24} /></span>
          {/if}
          <label class="text-xs text-primary-700 hover:underline cursor-pointer">
            <Icon nome="camera" size={12} /> {enviandoImagem ? 'Enviando...' : 'Adicionar imagem de capa'}
            <input type="file" accept="image/*" onchange={uploadImagem} class="hidden" disabled={enviandoImagem} />
          </label>
        </div>
      {/if}

      <div>
        <label for="pub-nome" class="block text-sm font-medium mb-1">Nome</label>
        <input id="pub-nome" name="nome" required value={pubEdit.nome ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label for="pub-codigo" class="block text-sm font-medium mb-1">Código</label>
          <input id="pub-codigo" name="codigo" value={pubEdit.codigo ?? ''} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label for="pub-categoria" class="block text-sm font-medium mb-1">Categoria</label>
          <select id="pub-categoria" name="categoria" value={pubEdit.categoria ?? 'outro'} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {#each ORDEM_CATEGORIAS as cat}<option value={cat}>{CATEGORIA_LABEL[cat]}</option>{/each}
          </select>
        </div>
      </div>
      <div>
        <label for="pub-estoque" class="block text-sm font-medium mb-1">Estoque atual</label>
        <input id="pub-estoque" name="qtd_estoque" type="number" min="0" value={pubEdit.qtd_estoque ?? 0} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <p class="text-xs text-slate-400 mt-1">Número manual — bata com o relatório de inventário do JW Hub de vez em quando. Não controlamos entrada/saída aqui.</p>
      </div>
      {#if pubEdit.id}
        <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
          <input type="checkbox" name="ativo" checked={pubEdit.ativo ?? true} class="w-4 h-4 rounded" />
          <span class="text-sm">Ativa (aparece pro publicador pedir)</span>
        </label>
      {/if}
      <Button variant="primary" type="submit" loading={salvandoPub} class="w-full">Salvar</Button>
    </form>
  {/if}
</BottomSheet>

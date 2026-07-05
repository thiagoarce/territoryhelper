import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { exigirServoPub } from '$lib/server/guards';
import { criarNotificacao } from '$lib/server/push';

const STATUS_LABEL_NOTIF: Record<string, string> = {
  aberto: 'reaberto', pedido: 'pedido ao fornecedor', entregue: 'entregue', cancelado: 'cancelado'
};

export interface PedidoLinha {
  id: number;
  publicador_id: string;
  publicador_nome: string;
  publicacao_id: number | null;
  publicacao_nome: string | null;
  descricao: string | null;
  qtd: number;
  status: 'aberto' | 'pedido' | 'entregue' | 'cancelado';
  notas_servo: string | null;
  criado_em: string;
}

export interface ReposicaoItem {
  id: number;
  peca_nome: string;
  categoria: 'fisica' | 'literatura';
  estado: 'acabando' | 'zerado' | 'danificado';
  qtd_colocada: number | null;
  obs: string | null;
  carrinho_nome: string;
  ponto_nome: string;
  data: string;
}

export interface TendenciaMes {
  mes: string;
  publicacao_nome: string;
  qtd: number;
}

export type CategoriaPublicacao = 'biblia' | 'livro' | 'brochura' | 'folheto' | 'cartao_visita' | 'revista' | 'formulario' | 'outro';

export interface PublicacaoCatalogo {
  id: number;
  nome: string;
  codigo: string | null;
  categoria: CategoriaPublicacao;
  qtd_estoque: number;
  imagem_url: string | null;
  ativo: boolean;
}

export interface PublicadorLinha {
  id: string;
  nome: string;
}

export interface ControleLinha {
  publicador_id: string;
  qtd_pedida: number;
  qtd_entregue: number;
}

const CATEGORIAS_VALIDAS: CategoriaPublicacao[] = ['biblia', 'livro', 'brochura', 'folheto', 'cartao_visita', 'revista', 'formulario', 'outro'];

const FILTROS_VALIDOS = ['pendentes', 'entregue', 'cancelado', 'todos'] as const;
type Filtro = (typeof FILTROS_VALIDOS)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
  exigirServoPub(locals);

  const filtroParam = url.searchParams.get('status') as Filtro | null;
  const filtro: Filtro = filtroParam && FILTROS_VALIDOS.includes(filtroParam) ? filtroParam : 'pendentes';

  let query = locals.supabase
    .from('pedidos_publicacao')
    .select('id, publicador_id, publicacao_id, descricao, qtd, status, notas_servo, criado_em, profiles!inner(nome), publicacoes(nome)');

  if (filtro === 'pendentes') query = query.in('status', ['aberto', 'pedido']).order('criado_em');
  else if (filtro === 'todos') query = query.order('criado_em', { ascending: false });
  else query = query.eq('status', filtro).order('criado_em', { ascending: false });

  const { data, error } = await query;
  if (error) {
    return {
      pedidos: [] as PedidoLinha[], filtro, souAdmin: locals.profile?.role === 'admin',
      reposicao: [] as ReposicaoItem[], tendencia: [] as TendenciaMes[], erro: error.message
    };
  }

  const pedidos: PedidoLinha[] = ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    publicador_id: p.publicador_id,
    publicador_nome: p.profiles?.nome ?? '?',
    publicacao_id: p.publicacao_id,
    publicacao_nome: p.publicacoes?.nome ?? null,
    descricao: p.descricao,
    qtd: p.qtd,
    status: p.status,
    notas_servo: p.notas_servo,
    criado_em: p.criado_em
  }));

  // TP-D — Reposição: itens de relatório ainda não resolvidos (estado != ok)
  const { data: reposicaoRows } = await locals.supabase
    .from('tp_relatorio_itens')
    .select(`
      id, estado, qtd_colocada, obs,
      tp_pecas_catalogo!inner(nome, categoria),
      tp_relatorios!inner(data, tp_agendamentos!inner(ponto_avulso, tp_carrinhos(nome), tp_pontos(nome)))
    `)
    .is('resolvido_em', null)
    .neq('estado', 'ok')
    .order('id');

  const reposicao: ReposicaoItem[] = ((reposicaoRows ?? []) as any[]).map((r) => ({
    id: r.id,
    peca_nome: r.tp_pecas_catalogo?.nome ?? '?',
    categoria: r.tp_pecas_catalogo?.categoria ?? 'fisica',
    estado: r.estado,
    qtd_colocada: r.qtd_colocada,
    obs: r.obs,
    carrinho_nome: r.tp_relatorios?.tp_agendamentos?.tp_carrinhos?.nome ?? '?',
    ponto_nome: r.tp_relatorios?.tp_agendamentos?.tp_pontos?.nome ?? r.tp_relatorios?.tp_agendamentos?.ponto_avulso ?? '?',
    data: r.tp_relatorios?.data ?? ''
  }));

  // Tendência simples: soma de qtd_colocada por publicação por mês (últimos 3 meses com dado)
  const { data: tendenciaRows } = await locals.supabase
    .from('tp_relatorio_itens')
    .select('qtd_colocada, tp_pecas_catalogo!inner(publicacao_id, publicacoes(nome)), tp_relatorios!inner(data)')
    .not('qtd_colocada', 'is', null);

  const somaPorMesPublicacao = new Map<string, number>();
  for (const r of (tendenciaRows ?? []) as any[]) {
    const pubNome = r.tp_pecas_catalogo?.publicacoes?.nome;
    if (!pubNome) continue;
    const mes = String(r.tp_relatorios?.data ?? '').substring(0, 7);
    if (!mes) continue;
    const chave = mes + '|' + pubNome;
    somaPorMesPublicacao.set(chave, (somaPorMesPublicacao.get(chave) ?? 0) + (r.qtd_colocada ?? 0));
  }
  const tendencia: TendenciaMes[] = [...somaPorMesPublicacao.entries()]
    .map(([chave, qtd]) => {
      const [mes, publicacao_nome] = chave.split('|');
      return { mes, publicacao_nome, qtd };
    })
    .sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : 0))
    .slice(0, 12);

  // Catálogo completo (todas as categorias) — servo de publicações gerencia
  // aqui porque /admin/campanha é 100% admin-only (mesmo motivo da rota
  // /publicacoes existir fora do namespace /admin).
  const { data: catalogoRows } = await locals.supabase
    .from('publicacoes')
    .select('id, nome, codigo, categoria, qtd_estoque, imagem_url, ativo')
    .order('categoria')
    .order('nome');
  const catalogo = (catalogoRows ?? []) as PublicacaoCatalogo[];

  // Lista de controle: publicação escolhida via ?controle=<id>. Mostra
  // todos os publicadores ativos + o que já foi registrado pra essa
  // publicação (0 se ainda não tem linha).
  const controlePublicacaoId = Number(url.searchParams.get('controle') ?? 0) || null;
  const { data: publicadoresRows } = await locals.supabase
    .from('profiles')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome');
  const publicadores = (publicadoresRows ?? []) as PublicadorLinha[];

  let controle: ControleLinha[] = [];
  if (controlePublicacaoId) {
    const { data: controleRows } = await locals.supabase
      .from('publicacao_controle')
      .select('publicador_id, qtd_pedida, qtd_entregue')
      .eq('publicacao_id', controlePublicacaoId);
    controle = (controleRows ?? []) as ControleLinha[];
  }

  return {
    pedidos, filtro, souAdmin: locals.profile?.role === 'admin', reposicao, tendencia, catalogo,
    publicadores, controlePublicacaoId, controle
  };
};

export const actions: Actions = {
  atualizarPedido: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin' && !locals.profile?.servo_publicacoes) {
      return fail(403, { erro: 'Só o servo de publicações' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });

    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    const status = fd.get('status');
    if (status) {
      if (!['aberto', 'pedido', 'entregue', 'cancelado'].includes(String(status))) {
        return fail(400, { erro: 'Status inválido' });
      }
      patch.status = status;
    }
    const notasEnviadas = fd.has('notas_servo');
    if (notasEnviadas) patch.notas_servo = String(fd.get('notas_servo') ?? '').trim() || null;

    const { data: atualizado, error } = await locals.supabase
      .from('pedidos_publicacao')
      .update(patch)
      .eq('id', id)
      .select('publicador_id, descricao, publicacoes(nome)')
      .single();
    if (error) return fail(400, { erro: error.message });

    if (status && atualizado) {
      const nomeItem = (atualizado as any).publicacoes?.nome ?? atualizado.descricao ?? 'Publicação';
      await criarNotificacao([atualizado.publicador_id], {
        titulo: `Seu pedido foi ${STATUS_LABEL_NOTIF[String(status)] ?? String(status)}`,
        corpo: nomeItem,
        url: '/publicador'
      });
    }
    return { ok: true, msg: 'Pedido atualizado' };
  },

  // Catálogo: criar/editar (nome/código/categoria/estoque). Servo ou admin.
  salvarPublicacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin' && !locals.profile?.servo_publicacoes) {
      return fail(403, { erro: 'Só o servo de publicações' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0) || null;
    const nome = String(fd.get('nome') ?? '').trim();
    const codigo = String(fd.get('codigo') ?? '').trim() || null;
    const categoria = String(fd.get('categoria') ?? 'outro') as CategoriaPublicacao;
    const qtdEstoque = Number(fd.get('qtd_estoque') ?? 0) || 0;
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true' || id === null;
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!CATEGORIAS_VALIDAS.includes(categoria)) return fail(400, { erro: 'Categoria inválida' });

    const row = { nome, codigo, categoria, qtd_estoque: qtdEstoque, ativo };
    const { error } = id
      ? await locals.supabase.from('publicacoes').update(row).eq('id', id)
      : await locals.supabase.from('publicacoes').insert(row);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Publicação salva' };
  },

  // Upload da imagem de capa — mesmo padrão de fotos-locais (foto de prédio).
  uploadImagemPublicacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin' && !locals.profile?.servo_publicacoes) {
      return fail(403, { erro: 'Só o servo de publicações' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const file = fd.get('imagem') as File;
    if (!id || !file || file.size === 0) return fail(400, { erro: 'Arquivo obrigatório' });
    if (file.size > 5 * 1024 * 1024) return fail(400, { erro: 'Imagem > 5MB' });
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `publicacao-${id}-${Date.now()}.${ext}`;
    const { error: errUp } = await locals.supabase.storage
      .from('fotos-publicacoes')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (errUp) return fail(400, { erro: errUp.message });
    const { data: pub } = locals.supabase.storage.from('fotos-publicacoes').getPublicUrl(path);
    const { error: errPub } = await locals.supabase
      .from('publicacoes')
      .update({ imagem_url: pub.publicUrl })
      .eq('id', id);
    if (errPub) return fail(400, { erro: errPub.message });
    return { ok: true, imagem_url: pub.publicUrl };
  },

  // Lista de controle: salva o valor absoluto (o client já soma o delta
  // localmente, mesmo padrão de salvarNecessidadeRegular) pra pedida ou
  // entregue de um publicador numa publicação.
  atualizarControle: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin' && !locals.profile?.servo_publicacoes) {
      return fail(403, { erro: 'Só o servo de publicações' });
    }
    const fd = await request.formData();
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0);
    const publicadorId = String(fd.get('publicador_id') ?? '');
    const campo = String(fd.get('campo') ?? '');
    const valor = Number(fd.get('valor') ?? 0);
    if (!publicacaoId || !publicadorId) return fail(400, { erro: 'publicacao_id e publicador_id obrigatórios' });
    if (campo !== 'qtd_pedida' && campo !== 'qtd_entregue') return fail(400, { erro: 'campo inválido' });
    if (valor < 0) return fail(400, { erro: 'Quantidade inválida' });

    const { error } = await locals.supabase.from('publicacao_controle').upsert(
      { publicacao_id: publicacaoId, publicador_id: publicadorId, [campo]: valor, atualizado_em: new Date().toISOString() },
      { onConflict: 'publicacao_id,publicador_id' }
    );
    if (error) return fail(400, { erro: error.message });
    return { ok: true };
  },

  resolverReposicao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin' && !locals.profile?.servo_publicacoes) {
      return fail(403, { erro: 'Só o servo de publicações' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('tp_relatorio_itens')
      .update({ resolvido_em: new Date().toISOString(), resolvido_por: locals.user.id })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Marcado como resolvido' };
  }
};

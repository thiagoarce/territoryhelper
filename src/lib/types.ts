// Tipos compartilhados — espelha o schema do Postgres pra ter type-safety
// nas queries do Supabase. Quando o schema mudar, atualize aqui também
// (ou gere automatic com `supabase gen types`).

export type Role = 'admin' | 'dirigente' | 'publicador';

export interface Profile {
  id: string; // uuid (auth.users.id)
  nome: string;
  role: Role;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface UsuarioComEmail extends Profile {
  email: string;
}

// ----------------------------------------------------------------------------
// Geografia
// ----------------------------------------------------------------------------

export interface Territorio {
  id: string;
  nome: string;
  cor: string;
  label_pos: { lat: number; lng: number } | null;
  label_type: 'point' | 'center' | null;
  status: string;
  data_conclusao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Quadra {
  id: string;
  poly: unknown; // PostGIS geometry — chega como GeoJSON ou WKT dependendo da query
  color: string;
  territorio_id: string | null;
  ativa: boolean;
  /** @deprecated use `ativa`. Concluído/pendente são derivados de data_conclusao */
  status: string;
  data_conclusao: string | null;
  notas: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type LocalTipo = 'predio' | 'casa' | 'comercio' | 'coletivo' | 'terreno';

export interface Local {
  id: number;
  tipo: LocalTipo;
  logradouro: string;
  numero: string;
  geo: unknown; // PostGIS point
  quadra_id: string | null;
  setor: string | null;
  quadra_ibge: string | null;
  face_ibge: string | null;
  nome: string | null;
  irmao_mora: boolean;
  nome_irmao: string | null;
  notas: string | null;
  foto_url: string | null;
  tipo_entrada: 'porteiro' | 'eletronica' | 'sem' | null;
  acesso_caixas: boolean;
  acesso_interfones: boolean;
  nao_visitar: boolean;
  criado_em: string;
  atualizado_em: string;
  criado_por: string | null;
}

export interface Unidade {
  id: number;
  local_id: number;
  complemento: string | null;
  ordem: number | null;
  desocupado: boolean;
  nao_escrever: boolean;
  carta_escrita: string | null;
  carta_entregue: string | null;
  nota: string | null;
  legacy_row: number | null;
  criado_em: string;
  atualizado_em: string;
}

// ----------------------------------------------------------------------------
// Pessoas
// ----------------------------------------------------------------------------

export interface Convite {
  id: string;
  email: string;
  nome: string;
  role: Role;
  token: string;
  criado_por: string | null;
  expira_em: string;
  usado_em: string | null;
  usado_por: string | null;
  criado_em: string;
}

export interface Arranjo {
  id: number;
  nome: string;
  descricao: string | null;
  lider_id: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface ArranjoMembro {
  arranjo_id: number;
  profile_id: string;
  entrou_em: string;
}

// ----------------------------------------------------------------------------
// Designações
// ----------------------------------------------------------------------------

export interface Designacao {
  id: number;
  publicador_id: string | null;
  criada_em: string;
  prazo: string | null;
  status: 'aberta' | 'concluida' | 'cancelada';
  notas: string | null;
  criado_por: string | null;
  atualizado_em: string;
}

export interface Tce {
  id: string;
  nome: string;
  tipo: string;
  poly: unknown;
  publicador_id: string | null;
  prazo: string | null;
  status: 'aberto' | 'concluido' | 'cancelado';
  criado_em: string;
  data_conclusao: string | null;
  notas: string | null;
  atualizado_em: string;
}

// ----------------------------------------------------------------------------
// Eventos
// ----------------------------------------------------------------------------

export type TipoRegistro =
  | 'conversou'
  | 'naoAtendeu'
  | 'semConversa'
  | 'carta'
  | 'carta_undo'
  | 'interfone'
  | 'manual'
  | 'auto'
  | 'desfeito';

export interface Registro {
  id: number;
  unidade_id: number;
  publicador_id: string | null;
  tipo: TipoRegistro | string;
  ts: string;
  dados: Record<string, unknown> | null;
}

// ----------------------------------------------------------------------------
// Conteúdo
// ----------------------------------------------------------------------------

export interface Campanha {
  id: number;
  tipo: 'geral' | 'semana';
  modalidade: 'casa' | 'comercial' | 'rural' | 'cartas' | 'telefone' | 'publico';
  titulo: string;
  descricao: string | null;
  link: string | null;
  anexo_nome: string | null;
  anexo_url: string | null;
  publico: boolean;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
}

// ----------------------------------------------------------------------------
// Auditoria
// ----------------------------------------------------------------------------

export interface AuditLog {
  id: number;
  tabela: string;
  registro_id: string;
  acao: 'INSERT' | 'UPDATE' | 'DELETE';
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  autor_id: string | null;
  ts: string;
}

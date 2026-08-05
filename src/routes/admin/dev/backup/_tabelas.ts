// Tabelas do backup (T34/A25), na ORDEM DE RESTORE (respeitando FKs).
// pk = coluna(s) do onConflict do upsert. Geometria round-tripa como
// WKB hex (PostgREST serializa geometry assim e aceita de volta).
//
// FORA do backup: notificacoes/push_subscriptions (descartáveis e presas
// ao aparelho), convites (presos ao auth), spatial_ref_sys (PostGIS).
// `profiles` é EXPORTADO como referência mas PULADO no restore (FK pra
// auth.users — os usuários vivem no Auth do Supabase, não aqui).

export interface TabelaBackup {
  nome: string;
  pk: string;
  // serial = true → depois do restore, realinha a sequence do id
  serial?: boolean;
}

export const TABELAS_BACKUP: TabelaBackup[] = [
  { nome: 'profiles', pk: 'id' },
  { nome: 'territorios', pk: 'id' },
  { nome: 'quadras', pk: 'id' },
  { nome: 'quadras_conclusoes', pk: 'id', serial: true },
  // conclusão por LADO da quadra (migration 092)
  { nome: 'quadra_lados_conclusoes', pk: 'id', serial: true },
  { nome: 'locais', pk: 'id', serial: true },
  { nome: 'unidades', pk: 'id', serial: true },
  { nome: 'registros', pk: 'id', serial: true },
  { nome: 'designacoes', pk: 'id', serial: true },
  { nome: 'designacao_quadras', pk: 'designacao_id,quadra_id' },
  { nome: 'designacao_publicadores', pk: 'designacao_id,publicador_id' },
  { nome: 'designacao_locais', pk: 'designacao_id,local_id' },
  { nome: 'arranjo_modalidades', pk: 'id', serial: true },
  { nome: 'arranjos', pk: 'id', serial: true },
  { nome: 'arranjo_partes', pk: 'id', serial: true },
  { nome: 'tces', pk: 'id' },
  { nome: 'tce_unidades', pk: 'tce_id,unidade_id' },
  { nome: 'campanhas', pk: 'id', serial: true },
  { nome: 'campanha', pk: 'id', serial: true },
  { nome: 'campanha_suprimentos', pk: 'id', serial: true },
  { nome: 'publicacoes', pk: 'id', serial: true },
  { nome: 'pedidos_publicacao', pk: 'id', serial: true },
  { nome: 'publicacao_controle', pk: 'id', serial: true },
  { nome: 'publicador_necessidade_regular', pk: 'id', serial: true },
  { nome: 'cartas_ciclos', pk: 'id', serial: true },
  { nome: 'curadoria_edicoes', pk: 'id', serial: true },
  { nome: 'tp_carrinho_tipos', pk: 'id', serial: true },
  { nome: 'tp_pecas_catalogo', pk: 'id', serial: true },
  { nome: 'tp_carrinhos', pk: 'id', serial: true },
  { nome: 'tp_pontos', pk: 'id', serial: true },
  // pontos de referência nomeados pela congregação (migration 091) —
  // depois de quadras/territorios/profiles, que ele referencia
  { nome: 'pontos_referencia', pk: 'id', serial: true },
  { nome: 'tp_meses', pk: 'mes' },
  { nome: 'tp_agendamentos', pk: 'id', serial: true },
  { nome: 'tp_agendamento_excecoes', pk: 'id', serial: true },
  { nome: 'tp_agendamento_participantes', pk: 'id', serial: true },
  { nome: 'tp_preferencias', pk: 'publicador_id' },
  { nome: 'tp_disponibilidade', pk: 'id', serial: true },
  { nome: 'tp_disponibilidade_mes', pk: 'id', serial: true },
  { nome: 'tp_relatorios', pk: 'id', serial: true },
  { nome: 'tp_relatorio_itens', pk: 'id', serial: true },
  { nome: 'territorio_tokens', pk: 'token' },
  { nome: 'cartas_tokens', pk: 'token' }
];

// Restore PULA essas (dependem do Auth — restaurar num projeto com os
// mesmos usuários já resolve; num projeto novo, crie os usuários antes).
export const RESTORE_PULA = new Set(['profiles']);

export const VERSAO_BACKUP = 1;

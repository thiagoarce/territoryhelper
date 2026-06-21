// =================================================================
// MAPA DE COLUNAS — ponto único de verdade para toda a planilha.
// Se você reordenar as colunas, mude AQUI e o resto do código continua
// funcionando. Use COL.QUADRAS.STATUS_1IDX em sheet.getRange(linha, COL.X).
// Convenção: *_1IDX = 1-indexed (para getRange), *_0IDX = 0-indexed (para arrays).
// =================================================================

var COL = {
  // Aba "Quadras"
  QUADRAS: {
    ID_1IDX:        1,   // A
    SETOR_1IDX:     2,   // B
    NUMQ_1IDX:      3,   // C
    NUMF_1IDX:      4,   // D
    POLYSTRING_1IDX:5,   // E
    COLOR_1IDX:     6,   // F
    TERRITORIO_1IDX:7,   // G
    STATUS_1IDX:    8,   // H
    DATA_CONC_1IDX: 9,   // I
    // 0-indexed (uso em arrays vindos do getValues())
    ID:             0,
    POLYSTRING:     4,
    COLOR:          5,
    TERRITORIO:     6,
    STATUS:         7,
    DATA_CONC:      8
  },

  // Aba "Territorios"
  TERRITORIOS: {
    NOME_1IDX:        1, // A
    COR_1IDX:         2, // B
    IDS_QUADRAS_1IDX: 3, // C
    POLYSTRING_1IDX:  4, // D
    LABEL_POS_1IDX:   5, // E
    LABEL_TYPE_1IDX:  6, // F
    STATUS_1IDX:      7, // G
    DATA_CONC_1IDX:   8, // H
    // 0-indexed
    NOME:        0,
    COR:         1,
    IDS_QUADRAS: 2,
    POLYSTRING:  3,
    LABEL_POS:   4,
    LABEL_TYPE:  5
  },

  // Aba "Designacoes" — território pessoal: quadra(s) travadas em nome
  // de um publicador por um prazo. Fonte da verdade pra "essa quadra
  // está alocada e não pode redesignar agora".
  DESIGNACOES: {
    ID_1IDX:           1,  // A
    IDS_QUADRAS_1IDX:  2,  // B  CSV de ids
    PUBLICADOR_1IDX:   3,  // C
    CRIADA_1IDX:       4,  // D
    PRAZO_1IDX:        5,  // E
    STATUS_1IDX:       6,  // F  "aberta" | "concluida" | "cancelada"
    NOTAS_1IDX:        7,  // G
    // 0-indexed
    ID: 0, IDS_QUADRAS: 1, PUBLICADOR: 2, CRIADA: 3, PRAZO: 4, STATUS: 5, NOTAS: 6
  },

  // Aba "Predios" — overlay manual sobre os endereços brutos. Os campos
  // logradouro/numero/lat são derivados de "Dados Brutos" em runtime;
  // aqui só guardamos o que o usuário define.
  PREDIOS: {
    ID_1IDX:           1,  // A
    CHAVE_1IDX:        2,  // B  "logradouro|numero" — junção com Dados Brutos
    NOME_1IDX:         3,  // C  nome do edifício (editável)
    IRMAO_MORA_1IDX:   4,  // D  marca informativa
    ULTIMA_CARTA_1IDX: 5,  // E  data da última entrega de cartas
    NOTAS_1IDX:        6,  // F
    ATUALIZADO_1IDX:   7,  // G
    NOME_IRMAO_1IDX:   8,  // H  nome do irmão que mora ali (referência)
    ACESSO_INT_1IDX:   9,  // I  legado: "individual" | "portaria" | ""
    NAO_EH_PREDIO_1IDX:10, // J  esconde da listagem padrão
    // Novas (publicador edita inline)
    TIPO_ENTRADA_1IDX:    11, // K  "porteiro" | "eletronica" | "sem" | ""
    ACESSO_CAIXAS_1IDX:   12, // L  true/false — caixa de correio do prédio
    ACESSO_INTERFONES_1IDX:13,// M  true/false — interfone dos aptos
    // 0-indexed
    ID: 0, CHAVE: 1, NOME: 2, IRMAO_MORA: 3, ULTIMA_CARTA: 4, NOTAS: 5,
    ATUALIZADO: 6, NOME_IRMAO: 7, ACESSO_INT: 8, NAO_EH_PREDIO: 9,
    TIPO_ENTRADA: 10, ACESSO_CAIXAS: 11, ACESSO_INTERFONES: 12
  },

  // Aba "TerritoriosEspeciais" — Territórios Comerciais Especiais (TCE).
  // Atravessam fronteiras de quadras: agrupam endereços comerciais
  // avulsos de QUALQUER quadra em um território próprio com seu próprio
  // ciclo de designação/conclusão. Polígono auto via convex hull dos
  // pontos (calculado no front com Turf, persistido aqui).
  TERRITORIOS_ESP: {
    ID_1IDX:         1,  // A
    NOME_1IDX:       2,  // B
    TIPO_1IDX:       3,  // C  "comercial" (futuro: rural, telefone...)
    ROWS_1IDX:       4,  // D  CSV de rows de Dados Brutos
    POLYSTRING_1IDX: 5,  // E  convex hull dos pontos
    PUBLICADOR_1IDX: 6,  // F
    PRAZO_1IDX:      7,  // G
    STATUS_1IDX:     8,  // H  "aberto" | "concluido" | "cancelado"
    CRIADO_1IDX:     9,  // I
    DATA_CONC_1IDX: 10,  // J
    NOTAS_1IDX:     11,  // K
    // 0-indexed
    ID: 0, NOME: 1, TIPO: 2, ROWS: 3, POLYSTRING: 4, PUBLICADOR: 5,
    PRAZO: 6, STATUS: 7, CRIADO: 8, DATA_CONC: 9, NOTAS: 10
  },

  // Aba "PrediosAptos" — overlay per-apartamento dentro de um prédio.
  PREDIOS_APTOS: {
    ROW_1IDX:            1,  // A  linha do Dados Brutos
    CARTA_ESCRITA_1IDX:  2,  // B  data
    CARTA_ENTREGUE_1IDX: 3,  // C  data
    DESOCUPADO_1IDX:     4,  // D  bool
    ATUALIZADO_1IDX:     5,  // E
    NAO_ESCREVER_1IDX:   6,  // F  bool — não escrever carta pra esse apto
    // 0-indexed
    ROW: 0, CARTA_ESCRITA: 1, CARTA_ENTREGUE: 2, DESOCUPADO: 3,
    ATUALIZADO: 4, NAO_ESCREVER: 5
  },

  // NOTA: Testemunho Público (TP — pontos, horários, carrinhos,
  // agendamentos) FOI MOVIDO pra um app separado. Schema preservado
  // no histórico git (commit b86aed8) caso útil pra referência.

  // Aba "Campanha" (objetivos estruturados)
  CAMPANHA: {
    ID_1IDX:         1,  // A
    TIPO_1IDX:       2,  // B  "geral" | "semana"
    MODALIDADE_1IDX: 3,  // C  ver MODALIDADES_CAMPANHA
    TITULO_1IDX:     4,  // D
    DESCRICAO_1IDX:  5,  // E
    LINK_1IDX:       6,  // F  URL externa (Drive, Sheets, etc)
    ANEXO_NOME_1IDX: 7,  // G  nome do arquivo subido pro Drive
    ANEXO_URL_1IDX:  8,  // H  URL pública do arquivo no Drive
    PUBLICO_1IDX:    9,  // I  TRUE/FALSE — aparece no painel público
    CRIADO_1IDX:    10,  // J  timestamp
    ORDEM_1IDX:     11,  // K  ordem manual
    // 0-indexed
    ID: 0, TIPO: 1, MODALIDADE: 2, TITULO: 3, DESCRICAO: 4,
    LINK: 5, ANEXO_NOME: 6, ANEXO_URL: 7, PUBLICO: 8, CRIADO: 9, ORDEM: 10
  },

  // Aba "Dados Brutos" (endereços)
  DADOS: {
    QUADRA_1IDX:        1,  // A
    SETOR_1IDX:         2,  // B
    QUADRA_IBGE_1IDX:   3,  // C
    FACE_IBGE_1IDX:     4,  // D
    LOCALIDADE_1IDX:    5,  // E
    LOGRADOURO_1IDX:    6,  // F
    NUMERO_1IDX:        7,  // G
    COMP_NUM_1IDX:      8,  // H
    COMPLEMENTO_1IDX:   9,  // I
    LAT_1IDX:           10, // J
    LNG_1IDX:           11, // K
    TIPO_1IDX:          12, // L
    NOME_EDIF_1IDX:     13, // M
    NOTA_1IDX:          14, // N
    NAO_VISITAR_1IDX:   15, // O
    ORDEM_CUSTOM_1IDX:  16, // P
    BUSCA_APP_1IDX:     17, // Q
    ORDEM_1IDX:         18, // R
    ULT_VISITA_1IDX:    19, // S
    PEN_VISITA_1IDX:    20, // T
    // 0-indexed
    QUADRA:        0,
    QUADRA_IBGE:   2,
    FACE_IBGE:     3,
    LOGRADOURO:    5,
    NUMERO:        6,
    COMPLEMENTO:   8,
    LAT:           9,
    LNG:           10,
    TIPO:          11,
    NOME_EDIF:     12,
    NOTA:          13,
    NAO_VISITAR:   14,
    ORDEM:         17,
    ULT_VISITA:    18,
    PEN_VISITA:    19
  }
};

// Versão do app — substituída pelo workflow no momento do clasp push.
// Em dev local fica como "__VERSION__" e a UI mostra "dev".
var APP_VERSION = '__VERSION__';

function getVersaoApp() {
  var v = String(APP_VERSION || '');
  if (v.indexOf('__') === 0 || !v) return 'dev';
  return v.substring(0, 7);
}

var STATUS = {
  PENDENTE:  "Pendente",
  CONCLUIDO: "Concluído",
  // Áreas verdes / parques / quadras sem trabalho. NÃO conta na
  // contagem da campanha, no ranking de territórios, no gradiente
  // temporal do Registro. NÃO aparece pro publicador/dirigente.
  // Pode ser revertida a qualquer momento pelo editor.
  INATIVA:   "Inativa"
};

// Status do território pessoal (aba Designacoes)
var STATUS_DESIGNACAO = {
  ABERTA:     "aberta",
  CONCLUIDA:  "concluida",
  CANCELADA:  "cancelada"
};

// Status do Território Comercial Especial (aba TerritoriosEspeciais)
var STATUS_TCE = {
  ABERTO:    "aberto",
  CONCLUIDO: "concluido",
  CANCELADO: "cancelado"
};

var SHEET = {
  QUADRAS:     "Quadras",
  TERRITORIOS: "Territorios", // fallback "Territórios"
  DADOS:       "Dados Brutos",
  REGISTROS:   "Registros",
  CAMPANHA:       "Campanha",
  DESIGNACOES:    "Designacoes",
  PREDIOS:        "Predios",
  PREDIOS_APTOS:  "PrediosAptos",
  TERRITORIOS_ESP: "TerritoriosEspeciais"
};

// Desfecho de visita por endereço (gravado em Registros, tipo=desfecho)
// Hierarquia de "alcance": vazio → naoAtendeu → semConversa → conversou
var DESFECHO = {
  NAO_ATENDEU:  "naoAtendeu",   // chamei, ninguém respondeu
  SEM_CONVERSA: "semConversa",  // atendeu, sem palestra (amarelo)
  CONVERSOU:    "conversou"     // palestra real (verde)
};

// Modalidades de pregação pra classificar objetivos da campanha.
// Chave é o valor persistido (estável); label é o que aparece na UI.
var MODALIDADES_CAMPANHA = [
  { key: "casa",      label: "Casa em casa",       icone: "fa-house" },
  { key: "comercial", label: "Comercial",          icone: "fa-briefcase" },
  { key: "rural",     label: "Rural",              icone: "fa-tractor" },
  { key: "cartas",    label: "Cartas",             icone: "fa-envelope" },
  { key: "telefone",  label: "Telefone",           icone: "fa-phone" },
  { key: "publico",   label: "Testemunho público", icone: "fa-bullhorn" }
];

// Tipos residenciais para classificação de faces
var TIPOS_RESIDENCIAIS = [
  "Domicílio particular Apartamento",
  "Domicílio particular Casa",
  "Domicílio particular Casa de vila ou em condomínio",
  "Domicílio particular",
  "Domicílio coletivo"
];

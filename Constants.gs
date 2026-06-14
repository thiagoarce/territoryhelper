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

var STATUS = {
  PENDENTE:  "Pendente",
  CONCLUIDO: "Concluído"
};

var SHEET = {
  QUADRAS:     "Quadras",
  TERRITORIOS: "Territorios", // fallback "Territórios"
  DADOS:       "Dados Brutos",
  REGISTROS:   "Registros"
};

// Tipos residenciais para classificação de faces
var TIPOS_RESIDENCIAIS = [
  "Domicílio particular Apartamento",
  "Domicílio particular Casa",
  "Domicílio particular Casa de vila ou em condomínio",
  "Domicílio particular",
  "Domicílio coletivo"
];

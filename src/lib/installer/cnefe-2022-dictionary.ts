import type { CnefeDictionarySet } from "./types";

export const CNEFE_2022_DICTIONARY: CnefeDictionarySet = {
  edition: "CNEFE-2022",
  fields: {
    geocodingLevelCode: {
      "1": "Endereço — coordenada original do Censo 2022",
      "2": "Endereço — coordenada modificada",
      "3": "Endereço — coordenada estimada",
      "4": "Face de quadra",
      "5": "Localidade",
      "6": "Setor censitário",
    },
    addressTypeCode: {
      "1": "Domicílio particular",
      "2": "Domicílio coletivo",
      "3": "Estabelecimento agropecuário",
      "4": "Estabelecimento de ensino",
      "5": "Estabelecimento de saúde",
      "6": "Estabelecimento de outras finalidades",
      "7": "Edificação em construção ou reforma",
      "8": "Estabelecimento religioso",
    },
    addressSubtypeCode: {
      "101": "Casa",
      "102": "Casa de vila ou em condomínio",
      "103": "Apartamento",
      "104": "Outros",
    },
    establishmentIndicatorCode: {
      "1": "Único",
      "2": "Múltiplo, com até 10 estabelecimentos no endereço",
      "3": "Múltiplo, com mais de 10 estabelecimentos no endereço",
      "4": "Múltiplo, com quantidade de estabelecimentos desconhecida no endereço",
    },
    constructionIndicatorCode: {
      "1": "Único",
      "2": "Múltiplo, com até 10 unidades no endereço",
      "3": "Múltiplo, com mais de 10 unidades no endereço",
      "4": "Múltiplo, com quantidade de unidades desconhecida no endereço",
    },
    constructionPurposeCode: {
      "1": "Residencial",
      "2": "Não residencial",
      "3": "Misto",
      "4": "Indeterminado",
    },
  },
};

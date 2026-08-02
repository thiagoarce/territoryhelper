import { createHash } from "node:crypto";
import { CNEFE_2022_DICTIONARY } from "./cnefe-2022-dictionary";
import { parseCsvRows } from "./csv";
import {
  CNEFE_SCHEMA_VERSION,
  type CnefeColumnAliases,
  type CnefeTransformConfig,
  type CnefeTransformOptions,
  type CnefeTransformResult,
  type NormalizedCnefeAddress,
} from "./types";

export const DEFAULT_CNEFE_ALIASES: CnefeColumnAliases = {
  sourceId: ["COD_UNICO_ENDERECO", "ID", "COD_ENDERECO"],
  municipalityCode: ["COD_MUNICIPIO", "CD_MUN", "MUNICIPIO_CODIGO"],
  municipalityName: ["NOM_MUNICIPIO", "NM_MUN", "MUNICIPIO"],
  street: ["NOM_LOGRADOURO", "LOGRADOURO"],
  streetType: ["NOM_TIPO_SEGLOGR"],
  streetTitle: ["NOM_TITULO_SEGLOGR"],
  streetName: ["NOM_SEGLOGR"],
  number: ["NUM_ENDERECO", "NUMERO", "NÚMERO"],
  numberModifier: ["DSC_MODIFICADOR", "COMP. NUM."],
  complement: ["DSC_COMPLEMENTO", "COMPLEMENTO"],
  complementElement1Name: ["NOM_COMP_ELEM1"],
  complementElement1Value: ["VAL_COMP_ELEM1"],
  complementElement2Name: ["NOM_COMP_ELEM2"],
  complementElement2Value: ["VAL_COMP_ELEM2"],
  complementElement3Name: ["NOM_COMP_ELEM3"],
  complementElement3Value: ["VAL_COMP_ELEM3"],
  complementElement4Name: ["NOM_COMP_ELEM4"],
  complementElement4Value: ["VAL_COMP_ELEM4"],
  complementElement5Name: ["NOM_COMP_ELEM5"],
  complementElement5Value: ["VAL_COMP_ELEM5"],
  latitude: ["LATITUDE", "LAT"],
  longitude: ["LONGITUDE", "LON", "LNG"],
  geocodingLevelCode: ["NV_GEO_COORD"],
  addressTypeCode: ["COD_ESPECIE", "COD_TIPO", "TIPO_CODIGO"],
  addressTypeDescription: ["DSC_ESPECIE", "TIPO", "TIPO_DESCRICAO"],
  addressSubtypeCode: ["COD_TIPO_ESPECIE", "COD_TIPO_ESPECI"],
  addressSubtypeDescription: ["DSC_TIPO_ESPECIE"],
  establishmentName: ["DSC_ESTABELECIMENTO", "NOME ESTABELECIMENTO"],
  establishmentIndicatorCode: ["COD_INDICADOR_ESTAB_ENDERECO"],
  constructionIndicatorCode: ["COD_INDICADOR_CONST_ENDERECO"],
  constructionPurposeCode: ["COD_INDICADOR_FINALIDADE_CONST"],
  locality: ["DSC_LOCALIDADE", "NOM_LOCALIDADE", "LOCALIDADE", "BAIRRO"],
  postalCode: ["CEP"],
  censusSector: ["COD_SETOR", "SETOR", "SETOR IBGE"],
  censusBlock: ["NUM_QUADRA", "QUADRA IBGE", "QIBGE"],
  censusFace: ["NUM_FACE", "FACE IBGE", "FACEIBGE"],
};

export function normalizeComparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function decodeCnefeBuffer(
  buffer: Buffer,
  encoding: CnefeTransformConfig["encoding"] = "auto",
): string {
  if (encoding === "windows-1252")
    return new TextDecoder("windows-1252").decode(buffer);
  if (encoding === "utf-8") return new TextDecoder("utf-8").decode(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function mergeAliases(
  overrides?: Partial<CnefeColumnAliases>,
): CnefeColumnAliases {
  const entries = Object.entries(DEFAULT_CNEFE_ALIASES).map(
    ([key, aliases]) => [
      key,
      [...(overrides?.[key as keyof CnefeColumnAliases] ?? []), ...aliases],
    ],
  );
  return Object.fromEntries(entries) as unknown as CnefeColumnAliases;
}

function resolveColumns(headers: string[], aliases: CnefeColumnAliases) {
  const normalizedHeaders = new Map(
    headers.map((header) => [normalizeComparable(header), header]),
  );
  return Object.fromEntries(
    Object.entries(aliases).map(([field, candidates]) => [
      field,
      (candidates as string[])
        .map(normalizeComparable)
        .map((candidate) => normalizedHeaders.get(candidate))
        .find(Boolean) ?? null,
    ]),
  ) as Record<keyof CnefeColumnAliases, string | null>;
}

function value(row: Record<string, string>, column: string | null): string {
  return column ? (row[column] ?? "").trim() : "";
}

function joined(...parts: string[]): string {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function decimal(valueToParse: string): number | null {
  const normalized = valueToParse.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceId(row: Record<string, string>, explicit: string): string {
  if (explicit) return explicit;
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function recordId(row: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function dictionaryField(
  field: string,
  config: CnefeTransformConfig,
): Record<string, string> | null {
  const builtIn = /(?:^|\D)2022(?:\D|$)/.test(config.edition)
    ? CNEFE_2022_DICTIONARY.fields[field]
    : undefined;
  const configured = config.dictionaries?.fields[field];
  if (!builtIn && !configured) return null;
  return { ...builtIn, ...configured };
}

function decoded(
  field: string,
  code: string,
  config: CnefeTransformConfig,
  unknownCodes: Record<string, Set<string>>,
): string | null {
  if (!code) return null;
  const dictionary = dictionaryField(field, config);
  if (!dictionary) return null;
  const description = dictionary[code];
  if (description) return description;
  (unknownCodes[field] ??= new Set()).add(code);
  return null;
}

function rowObject(
  headers: string[],
  fields: string[],
): Record<string, string> {
  return Object.fromEntries(
    headers.map((header, index) => [header, fields[index]?.trim() ?? ""]),
  );
}

function officialComplement(
  row: Record<string, string>,
  columns: Record<keyof CnefeColumnAliases, string | null>,
): string {
  return joined(
    value(row, columns.complementElement1Name),
    value(row, columns.complementElement1Value),
    value(row, columns.complementElement2Name),
    value(row, columns.complementElement2Value),
    value(row, columns.complementElement3Name),
    value(row, columns.complementElement3Value),
    value(row, columns.complementElement4Name),
    value(row, columns.complementElement4Value),
    value(row, columns.complementElement5Name),
    value(row, columns.complementElement5Value),
  );
}

export function transformCnefeCsv(
  csvText: string,
  sourceFile: string,
  config: CnefeTransformConfig,
  options: CnefeTransformOptions = {},
): CnefeTransformResult {
  const iterator = parseCsvRows(csvText, config.delimiter);
  const headers = (iterator.next().value ?? []).map((header: string) =>
    header.trim(),
  );
  const columns = resolveColumns(headers, mergeAliases(config.aliases));
  const rejected: CnefeTransformResult["rejected"] = [];
  const records: NormalizedCnefeAddress[] = [];
  const unknownCodes: Record<string, Set<string>> = {};
  let totalRows = 0;
  let acceptedRows = 0;

  const missing: string[] = [];
  if (!columns.street && !columns.streetName) missing.push("street");
  for (const field of ["number", "latitude", "longitude"] as const) {
    if (!columns[field]) missing.push(field);
  }
  if (missing.length > 0) {
    for (const ignored of iterator) {
      void ignored;
      totalRows += 1;
    }
    return {
      records,
      rejected: [
        {
          sourceFile,
          sourceRow: 1,
          reason: "missing-required-column",
          details: `Colunas obrigatórias não reconhecidas: ${missing.join(", ")}`,
        },
      ],
      report: {
        sourceFile,
        edition: config.edition,
        totalRows,
        acceptedRows: 0,
        rejectedRows: totalRows,
        unknownCodes: {},
        resolvedColumns: columns,
      },
    };
  }

  for (const fields of iterator) {
    totalRows += 1;
    const sourceRow = totalRows + 1;
    const row = rowObject(headers, fields);
    const streetOriginal =
      value(row, columns.street) ||
      joined(
        value(row, columns.streetType),
        value(row, columns.streetTitle),
        value(row, columns.streetName),
      );
    const numberOriginal = value(row, columns.number);
    if (!streetOriginal && !numberOriginal) {
      rejected.push({
        sourceFile,
        sourceRow,
        reason: "missing-address",
        details: "Logradouro e número vazios.",
      });
      continue;
    }

    const latitude = decimal(value(row, columns.latitude));
    const longitude = decimal(value(row, columns.longitude));
    if (
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      rejected.push({
        sourceFile,
        sourceRow,
        reason: "invalid-coordinate",
        details: "Latitude/longitude ausente ou inválida.",
      });
      continue;
    }

    const addressTypeCode = value(row, columns.addressTypeCode) || null;
    const addressSubtypeCode = value(row, columns.addressSubtypeCode) || null;
    const establishmentIndicatorCode =
      value(row, columns.establishmentIndicatorCode) || null;
    const constructionIndicatorCode =
      value(row, columns.constructionIndicatorCode) || null;
    const constructionPurposeCode =
      value(row, columns.constructionPurposeCode) || null;
    const geocodingLevelCode = value(row, columns.geocodingLevelCode) || null;
    const complementOriginal =
      value(row, columns.complement) ||
      officialComplement(row, columns) ||
      null;
    const normalizedRecord: NormalizedCnefeAddress = {
      schemaVersion: CNEFE_SCHEMA_VERSION,
      sourceEdition: config.edition,
      sourceFile,
      sourceRow,
      sourceId: sourceId(row, value(row, columns.sourceId)),
      recordId: recordId(row),
      municipalityCode: value(row, columns.municipalityCode) || null,
      municipalityName: value(row, columns.municipalityName) || null,
      streetOriginal,
      streetNormalized: normalizeComparable(streetOriginal),
      numberOriginal,
      numberNormalized: normalizeComparable(numberOriginal),
      numberModifier: value(row, columns.numberModifier) || null,
      complementOriginal,
      complementNormalized: complementOriginal
        ? normalizeComparable(complementOriginal)
        : null,
      latitude,
      longitude,
      addressTypeCode,
      addressTypeDescription:
        value(row, columns.addressTypeDescription) ||
        decoded("addressTypeCode", addressTypeCode ?? "", config, unknownCodes),
      addressSubtypeCode,
      addressSubtypeDescription:
        value(row, columns.addressSubtypeDescription) ||
        decoded(
          "addressSubtypeCode",
          addressSubtypeCode ?? "",
          config,
          unknownCodes,
        ),
      establishmentName: value(row, columns.establishmentName) || null,
      establishmentIndicatorCode,
      establishmentIndicatorDescription: decoded(
        "establishmentIndicatorCode",
        establishmentIndicatorCode ?? "",
        config,
        unknownCodes,
      ),
      constructionIndicatorCode,
      constructionIndicatorDescription: decoded(
        "constructionIndicatorCode",
        constructionIndicatorCode ?? "",
        config,
        unknownCodes,
      ),
      constructionPurposeCode,
      constructionPurposeDescription: decoded(
        "constructionPurposeCode",
        constructionPurposeCode ?? "",
        config,
        unknownCodes,
      ),
      geocodingLevelCode,
      geocodingLevelDescription: decoded(
        "geocodingLevelCode",
        geocodingLevelCode ?? "",
        config,
        unknownCodes,
      ),
      locality: value(row, columns.locality) || null,
      postalCode: value(row, columns.postalCode) || null,
      censusSector: value(row, columns.censusSector) || null,
      censusBlock: value(row, columns.censusBlock) || null,
      censusFace: value(row, columns.censusFace) || null,
      raw: row,
    };
    acceptedRows += 1;
    if (!options.retainRecord || options.retainRecord(normalizedRecord))
      records.push(normalizedRecord);
  }

  return {
    records,
    rejected,
    report: {
      sourceFile,
      edition: config.edition,
      totalRows,
      acceptedRows,
      rejectedRows: rejected.length,
      unknownCodes: Object.fromEntries(
        Object.entries(unknownCodes).map(([field, codes]) => [
          field,
          [...codes].sort(),
        ]),
      ),
      resolvedColumns: columns,
    },
  };
}

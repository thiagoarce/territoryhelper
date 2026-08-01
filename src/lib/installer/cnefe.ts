import { createHash } from 'node:crypto';
import { parseCsv, rowsToObjects } from './csv';
import {
  CNEFE_SCHEMA_VERSION,
  type CnefeColumnAliases,
  type CnefeTransformConfig,
  type CnefeTransformResult,
  type NormalizedCnefeAddress
} from './types';

export const DEFAULT_CNEFE_ALIASES: CnefeColumnAliases = {
  sourceId: ['COD_UNICO_ENDERECO', 'ID', 'COD_ENDERECO'],
  municipalityCode: ['COD_MUNICIPIO', 'CD_MUN', 'MUNICIPIO_CODIGO'],
  municipalityName: ['NOM_MUNICIPIO', 'NM_MUN', 'MUNICIPIO'],
  street: ['NOM_LOGRADOURO', 'DSC_LOCALIDADE', 'LOGRADOURO'],
  number: ['NUM_ENDERECO', 'NUMERO', 'NÚMERO'],
  complement: ['DSC_COMPLEMENTO', 'COMPLEMENTO', 'COMP. NUM.'],
  latitude: ['LATITUDE', 'LAT'],
  longitude: ['LONGITUDE', 'LON', 'LNG'],
  addressTypeCode: ['COD_ESPECIE', 'COD_TIPO', 'TIPO_CODIGO'],
  addressTypeDescription: ['DSC_ESPECIE', 'TIPO', 'TIPO_DESCRICAO'],
  locality: ['NOM_LOCALIDADE', 'LOCALIDADE', 'BAIRRO'],
  postalCode: ['CEP'],
  censusSector: ['COD_SETOR', 'SETOR', 'SETOR IBGE'],
  censusBlock: ['NUM_QUADRA', 'QUADRA IBGE', 'QIBGE'],
  censusFace: ['NUM_FACE', 'FACE IBGE', 'FACEIBGE']
};

export function normalizeComparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function mergeAliases(overrides?: Partial<CnefeColumnAliases>): CnefeColumnAliases {
  const entries = Object.entries(DEFAULT_CNEFE_ALIASES).map(([key, aliases]) => [
    key,
    [...(overrides?.[key as keyof CnefeColumnAliases] ?? []), ...aliases]
  ]);
  return Object.fromEntries(entries) as unknown as CnefeColumnAliases;
}

function resolveColumns(headers: string[], aliases: CnefeColumnAliases) {
  const normalizedHeaders = new Map(headers.map((header) => [normalizeComparable(header), header]));
  return Object.fromEntries(
    Object.entries(aliases).map(([field, candidates]) => [
      field,
      (candidates as string[]).map(normalizeComparable).map((candidate: string) => normalizedHeaders.get(candidate)).find(Boolean) ?? null
    ])
  ) as Record<keyof CnefeColumnAliases, string | null>;
}

function value(row: Record<string, string>, column: string | null): string {
  return column ? (row[column] ?? '').trim() : '';
}

function decimal(valueToParse: string): number | null {
  const normalized = valueToParse.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceId(row: Record<string, string>, explicit: string): string {
  if (explicit) return explicit;
  return createHash('sha256')
    .update(JSON.stringify(row))
    .digest('hex');
}

function decoded(
  field: string,
  code: string,
  config: CnefeTransformConfig,
  unknownCodes: Record<string, Set<string>>
): string | null {
  if (!code) return null;
  const dictionary = config.dictionaries?.fields[field];
  if (!dictionary) return null;
  const description = dictionary[code];
  if (description) return description;
  (unknownCodes[field] ??= new Set()).add(code);
  return null;
}

export function transformCnefeCsv(
  csvText: string,
  sourceFile: string,
  config: CnefeTransformConfig
): CnefeTransformResult {
  const parsed = parseCsv(csvText, config.delimiter);
  const headers = parsed[0]?.map((header) => header.trim()) ?? [];
  const rows = rowsToObjects(parsed);
  const columns = resolveColumns(headers, mergeAliases(config.aliases));
  const rejected: CnefeTransformResult['rejected'] = [];
  const records: NormalizedCnefeAddress[] = [];
  const unknownCodes: Record<string, Set<string>> = {};

  const missing = (['street', 'number', 'latitude', 'longitude'] as const).filter(
    (field) => !columns[field]
  );
  if (missing.length > 0) {
    return {
      records,
      rejected: [{
        sourceFile,
        sourceRow: 1,
        reason: 'missing-required-column',
        details: `Colunas obrigatórias não reconhecidas: ${missing.join(', ')}`
      }],
      report: {
        sourceFile,
        edition: config.edition,
        totalRows: rows.length,
        acceptedRows: 0,
        rejectedRows: rows.length,
        unknownCodes: {},
        resolvedColumns: columns
      }
    };
  }

  rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const streetOriginal = value(row, columns.street);
    const numberOriginal = value(row, columns.number);
    if (!streetOriginal && !numberOriginal) {
      rejected.push({ sourceFile, sourceRow, reason: 'missing-address', details: 'Logradouro e número vazios.' });
      return;
    }

    const latitude = decimal(value(row, columns.latitude));
    const longitude = decimal(value(row, columns.longitude));
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      rejected.push({ sourceFile, sourceRow, reason: 'invalid-coordinate', details: 'Latitude/longitude ausente ou inválida.' });
      return;
    }

    const typeCode = value(row, columns.addressTypeCode) || null;
    const explicitDescription = value(row, columns.addressTypeDescription) || null;
    const complementOriginal = value(row, columns.complement) || null;
    records.push({
      schemaVersion: CNEFE_SCHEMA_VERSION,
      sourceEdition: config.edition,
      sourceFile,
      sourceRow,
      sourceId: sourceId(row, value(row, columns.sourceId)),
      municipalityCode: value(row, columns.municipalityCode) || null,
      municipalityName: value(row, columns.municipalityName) || null,
      streetOriginal,
      streetNormalized: normalizeComparable(streetOriginal),
      numberOriginal,
      numberNormalized: normalizeComparable(numberOriginal),
      complementOriginal,
      complementNormalized: complementOriginal ? normalizeComparable(complementOriginal) : null,
      latitude,
      longitude,
      addressTypeCode: typeCode,
      addressTypeDescription: explicitDescription ?? decoded('addressTypeCode', typeCode ?? '', config, unknownCodes),
      locality: value(row, columns.locality) || null,
      postalCode: value(row, columns.postalCode) || null,
      censusSector: value(row, columns.censusSector) || null,
      censusBlock: value(row, columns.censusBlock) || null,
      censusFace: value(row, columns.censusFace) || null,
      raw: row
    });
  });

  return {
    records,
    rejected,
    report: {
      sourceFile,
      edition: config.edition,
      totalRows: rows.length,
      acceptedRows: records.length,
      rejectedRows: rejected.length,
      unknownCodes: Object.fromEntries(
        Object.entries(unknownCodes).map(([field, codes]) => [field, [...codes].sort()])
      ),
      resolvedColumns: columns
    }
  };
}

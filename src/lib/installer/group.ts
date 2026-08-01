import { createHash } from 'node:crypto';
import type { NormalizedCnefeAddress, PreparedLocal } from './types';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function inferType(records: NormalizedCnefeAddress[]): PreparedLocal['type'] {
  const descriptions = records.map((record) => record.addressTypeDescription?.toLocaleLowerCase('pt-BR') ?? '').join(' ');
  if (/com[eé]rc|loja|estabelecimento/.test(descriptions)) return 'comercio';
  if (/coletiv|abrigo|alojamento/.test(descriptions)) return 'coletivo';
  if (/terreno|vago/.test(descriptions)) return 'terreno';
  if (records.length > 1 || records.some((record) => /ap|apart|bloco|torre/.test(record.complementNormalized ?? ''))) return 'predio';
  return 'casa';
}

export function groupNormalizedAddresses(records: NormalizedCnefeAddress[]): PreparedLocal[] {
  const groups = new Map<string, NormalizedCnefeAddress[]>();
  for (const record of records) {
    const key = [record.municipalityCode ?? record.municipalityName ?? '', record.streetNormalized, record.numberNormalized].join('|');
    const current = groups.get(key) ?? [];
    current.push(record);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([key, members]) => {
    const first = members[0];
    return {
      sourceId: sha256(`${first.sourceEdition}|${key}`),
      type: inferType(members),
      street: first.streetOriginal,
      number: first.numberOriginal,
      latitude: first.latitude,
      longitude: first.longitude,
      censusSector: first.censusSector,
      censusBlock: first.censusBlock,
      censusFace: first.censusFace,
      units: members.map((record) => ({
        sourceId: record.sourceId,
        complement: record.complementOriginal,
        raw: record.raw
      }))
    };
  });
}

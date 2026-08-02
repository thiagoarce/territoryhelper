import { createHash } from "node:crypto";
import type { NormalizedCnefeAddress, PreparedLocal } from "./types";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function inferType(records: NormalizedCnefeAddress[]): PreparedLocal["type"] {
  const species = new Set(records.map((record) => record.addressTypeCode));
  const domicileCount = records.filter(
    (record) => record.addressTypeCode === "1",
  ).length;
  const establishmentCount = records.filter((record) =>
    ["3", "4", "5", "6", "8"].includes(record.addressTypeCode ?? ""),
  ).length;
  const hasApartment = records.some(
    (record) =>
      record.addressSubtypeCode === "103" ||
      /\b(AP|APTO|APARTAMENTO|BLOCO|TORRE)\b/.test(
        record.complementNormalized ?? "",
      ),
  );
  const descriptions = records
    .map((record) =>
      [record.addressTypeDescription, record.addressSubtypeDescription]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR"),
    )
    .join(" ");
  if (species.has("2") || /coletiv|abrigo|alojamento/.test(descriptions))
    return "coletivo";
  if (hasApartment || domicileCount > 1) return "predio";
  if (
    establishmentCount > 0 ||
    /com[eé]rc|loja|estabelecimento/.test(descriptions)
  )
    return "comercio";
  if (
    (species.has("7") && domicileCount === 0) ||
    /terreno|vago|constru[çc][aã]o|reforma/.test(descriptions)
  )
    return domicileCount > 0 ? "casa" : "terreno";
  if (records.length > 1) return "predio";
  return "casa";
}

function normalizedKeyPart(value: string | null): string {
  return value?.toLocaleUpperCase("pt-BR").replace(/\s+/g, " ").trim() ?? "";
}

function hasConventionalNumber(record: NormalizedCnefeAddress): boolean {
  return !["", "0", "SN", "S N", "SEM NUMERO"].includes(
    record.numberNormalized,
  );
}

function groupKey(record: NormalizedCnefeAddress): string {
  const parts = [
    record.municipalityCode ?? record.municipalityName ?? "",
    normalizedKeyPart(record.locality),
    record.censusSector ?? "",
    record.streetNormalized,
    record.numberNormalized,
    normalizedKeyPart(record.numberModifier),
  ];
  if (!hasConventionalNumber(record)) parts.push(record.sourceId);
  return parts.join("|");
}

function averageCoordinate(
  records: NormalizedCnefeAddress[],
  field: "latitude" | "longitude",
): number {
  return (
    records.reduce((total, record) => total + record[field], 0) / records.length
  );
}

function stableUnits(records: NormalizedCnefeAddress[]) {
  return [...records]
    .sort((left, right) => left.recordId.localeCompare(right.recordId))
    .map((record) => ({
      sourceId: record.recordId,
      complement: record.complementOriginal,
      raw: record.raw,
    }));
}

export function groupNormalizedAddresses(
  records: NormalizedCnefeAddress[],
): PreparedLocal[] {
  const groups = new Map<string, NormalizedCnefeAddress[]>();
  for (const record of records) {
    const key = groupKey(record);
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
      numberModifier: first.numberModifier,
      latitude: averageCoordinate(members, "latitude"),
      longitude: averageCoordinate(members, "longitude"),
      censusSector: first.censusSector,
      censusBlock: first.censusBlock,
      censusFace: first.censusFace,
      workAreaId: null,
      units: stableUnits(members),
    };
  });
}

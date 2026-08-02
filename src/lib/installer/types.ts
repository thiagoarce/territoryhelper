export const CNEFE_SCHEMA_VERSION = "1.1.0" as const;
export const INSTALLER_PACKAGE_VERSION = "1.4.0" as const;
export const INSTALLER_ARTIFACT_FILES = [
  "territorio.geojson",
  "enderecos.json",
  "locais.json",
  "territorios.json",
  "areas-trabalho.json",
  "enderecos-fora.json",
  "pendencias.json",
] as const;

export type InstallerArtifactFile = (typeof INSTALLER_ARTIFACT_FILES)[number];

export interface CnefeColumnAliases {
  sourceId: string[];
  municipalityCode: string[];
  municipalityName: string[];
  street: string[];
  streetType: string[];
  streetTitle: string[];
  streetName: string[];
  number: string[];
  numberModifier: string[];
  complement: string[];
  complementElement1Name: string[];
  complementElement1Value: string[];
  complementElement2Name: string[];
  complementElement2Value: string[];
  complementElement3Name: string[];
  complementElement3Value: string[];
  complementElement4Name: string[];
  complementElement4Value: string[];
  complementElement5Name: string[];
  complementElement5Value: string[];
  latitude: string[];
  longitude: string[];
  geocodingLevelCode: string[];
  addressTypeCode: string[];
  addressTypeDescription: string[];
  addressSubtypeCode: string[];
  addressSubtypeDescription: string[];
  establishmentName: string[];
  establishmentIndicatorCode: string[];
  constructionIndicatorCode: string[];
  constructionPurposeCode: string[];
  locality: string[];
  postalCode: string[];
  censusSector: string[];
  censusBlock: string[];
  censusFace: string[];
}

export interface CnefeDictionarySet {
  edition: string;
  fields: Record<string, Record<string, string>>;
}

export interface CnefeTransformConfig {
  edition: string;
  delimiter?: "," | ";" | "\t";
  encoding?: "auto" | "utf-8" | "windows-1252";
  outsideSampleLimit?: number;
  aliases?: Partial<CnefeColumnAliases>;
  dictionaries?: CnefeDictionarySet;
}

export interface NormalizedCnefeAddress {
  schemaVersion: typeof CNEFE_SCHEMA_VERSION;
  sourceEdition: string;
  sourceFile: string;
  sourceRow: number;
  sourceId: string;
  recordId: string;
  municipalityCode: string | null;
  municipalityName: string | null;
  streetOriginal: string;
  streetNormalized: string;
  numberOriginal: string;
  numberNormalized: string;
  numberModifier: string | null;
  complementOriginal: string | null;
  complementNormalized: string | null;
  latitude: number;
  longitude: number;
  addressTypeCode: string | null;
  addressTypeDescription: string | null;
  addressSubtypeCode: string | null;
  addressSubtypeDescription: string | null;
  establishmentName: string | null;
  establishmentIndicatorCode: string | null;
  establishmentIndicatorDescription: string | null;
  constructionIndicatorCode: string | null;
  constructionIndicatorDescription: string | null;
  constructionPurposeCode: string | null;
  constructionPurposeDescription: string | null;
  geocodingLevelCode: string | null;
  geocodingLevelDescription: string | null;
  locality: string | null;
  postalCode: string | null;
  censusSector: string | null;
  censusBlock: string | null;
  censusFace: string | null;
  raw: Record<string, string>;
}

export interface RejectedCnefeRow {
  sourceFile: string;
  sourceRow: number;
  reason: "missing-required-column" | "missing-address" | "invalid-coordinate";
  details: string;
}

export interface CnefeTransformReport {
  sourceFile: string;
  edition: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  unknownCodes: Record<string, string[]>;
  resolvedColumns: Record<keyof CnefeColumnAliases, string | null>;
}

export interface CnefeTransformResult {
  records: NormalizedCnefeAddress[];
  rejected: RejectedCnefeRow[];
  report: CnefeTransformReport;
}

export interface CnefeTransformOptions {
  retainRecord?: (record: NormalizedCnefeAddress) => boolean;
}

export type Position = [longitude: number, latitude: number];

export interface TerritoryPolygon {
  outer: Position[];
  holes: Position[][];
}

export interface ParsedTerritory {
  name: string | null;
  polygons: TerritoryPolygon[];
}

export type WorkAreaPurpose = "regular-preaching" | "language-census";
export type WorkAreaType =
  | "urban-block"
  | "rural-area"
  | "route"
  | "locality"
  | "condominium"
  | "isolated-point";
export type WorkAreaSource =
  | "imported"
  | "osm-generated"
  | "cnefe-suggested"
  | "manual";
export type WorkAreaReviewStatus = "suggested" | "approved";
export type WorkAreaConfidence = "high" | "medium" | "low";

export interface ParsedTerritoryComponent extends ParsedTerritory {
  sourceType: string | null;
  environment: "urban" | "rural" | "mixed" | "unknown";
  purpose: WorkAreaPurpose;
  special: boolean;
}

export interface InstallerConfig {
  congregation: {
    name: string;
    timezone: string;
    mode: "territorial" | "language";
  };
  territory: {
    id: string;
    name: string;
    color?: string;
    areaBoundaryToleranceMeters?: number;
  };
  cnefe: CnefeTransformConfig;
}

export interface InstallerManifest {
  packageVersion: typeof INSTALLER_PACKAGE_VERSION;
  transformerVersion: typeof CNEFE_SCHEMA_VERSION;
  inputHashes: Record<string, string>;
  artifactHashes: Record<InstallerArtifactFile, string>;
  configuration: InstallerConfig;
  counts: {
    inputRows: number;
    normalizedRows: number;
    insideTerritory: number;
    outsideTerritory: number;
    rejectedRows: number;
    duplicateRows: number;
    localGroups: number;
    units: number;
    territories: number;
    workAreas: number;
    assignedLocals: number;
    unassignedLocals: number;
    ambiguousLocals: number;
  };
  approved: boolean;
  approvedAt?: string;
  approvalHash?: string;
}

export interface PreparedUnit {
  sourceId: string;
  complement: string | null;
  raw: Record<string, string>;
}

export interface PreparedLocal {
  sourceId: string;
  type: "predio" | "casa" | "comercio" | "coletivo" | "terreno";
  street: string;
  number: string;
  numberModifier: string | null;
  latitude: number;
  longitude: number;
  censusSector: string | null;
  censusBlock: string | null;
  censusFace: string | null;
  workAreaId: string | null;
  units: PreparedUnit[];
}

export interface PreparedWorkArea {
  id: string;
  territoryId: string;
  type: WorkAreaType;
  purpose: WorkAreaPurpose;
  source: WorkAreaSource;
  reviewStatus: WorkAreaReviewStatus;
  confidence: WorkAreaConfidence;
  geometry: { type: "Polygon"; coordinates: Position[][] };
  properties: Record<string, unknown>;
}

export interface PreparedTerritory {
  id: string;
  name: string;
  color: string;
  geometry: { type: "MultiPolygon"; coordinates: Position[][][] };
  labelPosition: { lat: number; lng: number } | null;
  labelType: "point" | "center";
}

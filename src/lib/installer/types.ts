export const CNEFE_SCHEMA_VERSION = '1.0.0' as const;
export const INSTALLER_PACKAGE_VERSION = '1.0.0' as const;

export interface CnefeColumnAliases {
  sourceId: string[];
  municipalityCode: string[];
  municipalityName: string[];
  street: string[];
  number: string[];
  complement: string[];
  latitude: string[];
  longitude: string[];
  addressTypeCode: string[];
  addressTypeDescription: string[];
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
  delimiter?: ',' | ';' | '\t';
  aliases?: Partial<CnefeColumnAliases>;
  dictionaries?: CnefeDictionarySet;
}

export interface NormalizedCnefeAddress {
  schemaVersion: typeof CNEFE_SCHEMA_VERSION;
  sourceEdition: string;
  sourceFile: string;
  sourceRow: number;
  sourceId: string;
  municipalityCode: string | null;
  municipalityName: string | null;
  streetOriginal: string;
  streetNormalized: string;
  numberOriginal: string;
  numberNormalized: string;
  complementOriginal: string | null;
  complementNormalized: string | null;
  latitude: number;
  longitude: number;
  addressTypeCode: string | null;
  addressTypeDescription: string | null;
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
  reason: 'missing-required-column' | 'missing-address' | 'invalid-coordinate';
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

export type Position = [longitude: number, latitude: number];

export interface TerritoryPolygon {
  outer: Position[];
  holes: Position[][];
}

export interface ParsedTerritory {
  name: string | null;
  polygons: TerritoryPolygon[];
}

export interface InstallerConfig {
  congregation: {
    name: string;
    timezone: string;
    mode: 'territorial' | 'language';
  };
  territory: {
    id: string;
    name: string;
    color?: string;
  };
  cnefe: CnefeTransformConfig;
}

export interface InstallerManifest {
  packageVersion: typeof INSTALLER_PACKAGE_VERSION;
  transformerVersion: typeof CNEFE_SCHEMA_VERSION;
  inputHashes: Record<string, string>;
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
    workAreas: number;
  };
  approved: boolean;
  approvedAt?: string;
}

export interface PreparedUnit {
  sourceId: string;
  complement: string | null;
  raw: Record<string, string>;
}

export interface PreparedLocal {
  sourceId: string;
  type: 'predio' | 'casa' | 'comercio' | 'coletivo' | 'terreno';
  street: string;
  number: string;
  latitude: number;
  longitude: number;
  censusSector: string | null;
  censusBlock: string | null;
  censusFace: string | null;
  units: PreparedUnit[];
}

export interface PreparedWorkArea {
  id: string;
  geometry: { type: 'Polygon'; coordinates: Position[][] };
  properties: Record<string, unknown>;
}

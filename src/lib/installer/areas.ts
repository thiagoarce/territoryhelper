import { pointInTerritoryWithTolerance } from "./kml";
import type {
  ParsedTerritory,
  Position,
  PreparedTerritory,
  PreparedLocal,
  PreparedWorkArea,
  WorkAreaConfidence,
  WorkAreaPurpose,
  WorkAreaReviewStatus,
  WorkAreaSource,
  WorkAreaType,
} from "./types";

interface ParsedInstallerAreas {
  territories: PreparedTerritory[];
  workAreas: PreparedWorkArea[];
}

function validRing(value: unknown): value is Position[] {
  return (
    Array.isArray(value) &&
    value.length >= 4 &&
    value.every(
      (position) =>
        Array.isArray(position) &&
        position.length >= 2 &&
        position.slice(0, 2).every(Number.isFinite),
    )
  );
}

function validatePolygon(
  coordinates: unknown,
  scope: ParsedTerritory,
  label: string,
  toleranceMeters: number,
): Position[][] {
  if (!Array.isArray(coordinates) || !validRing(coordinates[0]))
    throw new Error(`${label} não contém um anel externo válido.`);
  const rings = coordinates as Position[][];
  if (!rings.every(validRing))
    throw new Error(`${label} contém um anel inválido.`);
  if (
    !rings[0].every((position) =>
      pointInTerritoryWithTolerance(position, scope, toleranceMeters),
    )
  ) {
    throw new Error(`${label} possui vértices fora do limite territorial.`);
  }
  return rings;
}

function polygonsFromGeometry(
  geometry: any,
  scope: ParsedTerritory,
  label: string,
  toleranceMeters: number,
): Position[][][] {
  const polygons =
    geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates
        : null;
  if (!polygons)
    throw new Error(`${label} precisa ser Polygon ou MultiPolygon.`);
  return polygons.map((coordinates: unknown, index: number) =>
    validatePolygon(
      coordinates,
      scope,
      polygons.length === 1 ? label : `${label}-${index + 1}`,
      toleranceMeters,
    ),
  );
}

function identifier(feature: any, featureIndex: number): string {
  return String(
    feature.id ??
      feature.properties?.id ??
      feature.properties?.nome ??
      featureIndex + 1,
  );
}

function labelPosition(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { lat?: unknown; lng?: unknown };
  return typeof candidate.lat === "number" && typeof candidate.lng === "number"
    ? { lat: candidate.lat, lng: candidate.lng }
    : null;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");
  return allowed.includes(normalized as T) ? (normalized as T) : fallback;
}

const workAreaTypes = [
  "urban-block",
  "rural-area",
  "route",
  "locality",
  "condominium",
  "isolated-point",
] as const satisfies readonly WorkAreaType[];
const workAreaPurposes = [
  "regular-preaching",
  "language-census",
] as const satisfies readonly WorkAreaPurpose[];
const workAreaSources = [
  "imported",
  "osm-generated",
  "cnefe-suggested",
  "manual",
] as const satisfies readonly WorkAreaSource[];
const reviewStatuses = [
  "suggested",
  "approved",
] as const satisfies readonly WorkAreaReviewStatus[];
const confidenceLevels = [
  "high",
  "medium",
  "low",
] as const satisfies readonly WorkAreaConfidence[];

export function parseInstallerAreasGeoJson(
  raw: string,
  scope: ParsedTerritory,
  fallbackTerritoryId: string,
  toleranceMeters = 0,
): ParsedInstallerAreas {
  const parsed = JSON.parse(raw) as any;
  const features =
    parsed.type === "FeatureCollection"
      ? parsed.features
      : parsed.type === "Feature"
        ? [parsed]
        : [];
  if (!Array.isArray(features) || features.length === 0)
    throw new Error("O GeoJSON de áreas não contém nenhuma Feature.");

  const territories: PreparedTerritory[] = [];
  const workAreas: PreparedWorkArea[] = [];
  const territoryIds = new Set<string>();
  const areaIds = new Set<string>();

  features.forEach((feature: any, featureIndex: number) => {
    const properties = feature.properties ?? {};
    const kind = String(
      properties.kind ?? properties.tipo ?? "work-area",
    ).toLocaleLowerCase("pt-BR");
    const baseId = identifier(feature, featureIndex);
    const polygons = polygonsFromGeometry(
      feature.geometry,
      scope,
      kind === "territory" || kind === "territorio"
        ? `Território ${baseId}`
        : `Área ${baseId}`,
      toleranceMeters,
    );

    if (kind === "territory" || kind === "territorio") {
      if (territoryIds.has(baseId))
        throw new Error(`Identificador de território duplicado: ${baseId}.`);
      territoryIds.add(baseId);
      territories.push({
        id: baseId,
        name: String(properties.name ?? properties.nome ?? baseId),
        color: String(properties.color ?? properties.cor ?? "#3388ff"),
        geometry: { type: "MultiPolygon", coordinates: polygons },
        labelPosition: labelPosition(
          properties.labelPosition ?? properties.label_pos,
        ),
        labelType:
          properties.labelType === "point" || properties.label_type === "point"
            ? "point"
            : "center",
      });
      return;
    }

    polygons.forEach((coordinates, polygonIndex) => {
      const id =
        polygons.length === 1 ? baseId : `${baseId}-${polygonIndex + 1}`;
      if (areaIds.has(id))
        throw new Error(`Identificador de área duplicado: ${id}.`);
      areaIds.add(id);
      workAreas.push({
        id,
        territoryId: String(
          properties.territoryId ??
            properties.territorioId ??
            properties.territory ??
            properties.territorio ??
            fallbackTerritoryId,
        ),
        type: enumValue(
          properties.areaType ?? properties.area_type ?? properties.tipoArea,
          workAreaTypes,
          "urban-block",
        ),
        purpose: enumValue(
          properties.purpose ?? properties.finalidade,
          workAreaPurposes,
          "regular-preaching",
        ),
        source: enumValue(
          properties.source ?? properties.origem,
          workAreaSources,
          "imported",
        ),
        reviewStatus: enumValue(
          properties.reviewStatus ??
            properties.review_status ??
            properties.revisao,
          reviewStatuses,
          "approved",
        ),
        confidence: enumValue(
          properties.confidence ?? properties.confianca,
          confidenceLevels,
          "high",
        ),
        geometry: { type: "Polygon", coordinates },
        properties,
      });
    });
  });

  if (territories.length > 0) {
    const unknown = workAreas
      .map((area) => area.territoryId)
      .filter((id) => !territoryIds.has(id));
    if (unknown.length > 0)
      throw new Error(
        `Áreas referenciam territórios ausentes: ${[...new Set(unknown)].join(", ")}.`,
      );
  }
  return { territories, workAreas };
}

export function parseWorkAreasGeoJson(
  raw: string,
  territory: ParsedTerritory,
): PreparedWorkArea[] {
  return parseInstallerAreasGeoJson(raw, territory, "principal", 0).workAreas;
}

function pointOnSegment(
  point: Position,
  start: Position,
  end: Position,
  epsilon = 1e-10,
): boolean {
  const squaredLength = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  if (squaredLength <= epsilon ** 2)
    return (
      (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2 <= epsilon ** 2
    );
  const length = Math.sqrt(squaredLength);
  const cross =
    (point[1] - start[1]) * (end[0] - start[0]) -
    (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > epsilon * length) return false;
  const dot =
    (point[0] - start[0]) * (end[0] - start[0]) +
    (point[1] - start[1]) * (end[1] - start[1]);
  return dot >= -epsilon * length && dot <= squaredLength + epsilon * length;
}

function inRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (
    let current = 0, previous = ring.length - 1;
    current < ring.length;
    previous = current++
  ) {
    const start = ring[previous];
    const end = ring[current];
    if (pointOnSegment(point, start, end)) return true;
    const intersects =
      start[1] > point[1] !== end[1] > point[1] &&
      point[0] <
        ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) +
          start[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInWorkArea(point: Position, area: PreparedWorkArea): boolean {
  const [outer, ...holes] = area.geometry.coordinates;
  return inRing(point, outer) && !holes.some((hole) => inRing(point, hole));
}

export function matchingWorkAreaIds(
  point: Position,
  workAreas: PreparedWorkArea[],
): string[] {
  return workAreas
    .filter((area) => pointInWorkArea(point, area))
    .map((area) => area.id);
}

export function assignLocalsToWorkAreas(
  locals: PreparedLocal[],
  workAreas: PreparedWorkArea[],
): {
  assigned: number;
  unassigned: number;
  ambiguous: number;
  unassignedLocalIds: string[];
  ambiguousLocalIds: string[];
} {
  const operationalAreas = workAreas.filter(
    (area) =>
      area.purpose === "regular-preaching" && area.reviewStatus === "approved",
  );
  let assigned = 0;
  let unassigned = 0;
  let ambiguous = 0;
  const unassignedLocalIds: string[] = [];
  const ambiguousLocalIds: string[] = [];
  for (const local of locals) {
    const point: Position = [local.longitude, local.latitude];
    const matches = matchingWorkAreaIds(point, operationalAreas);
    local.workAreaId = matches.length === 1 ? matches[0] : null;
    if (matches.length === 1) assigned += 1;
    else if (matches.length === 0) {
      unassigned += 1;
      unassignedLocalIds.push(local.sourceId);
    } else {
      ambiguous += 1;
      ambiguousLocalIds.push(local.sourceId);
    }
  }
  return {
    assigned,
    unassigned,
    ambiguous,
    unassignedLocalIds,
    ambiguousLocalIds,
  };
}

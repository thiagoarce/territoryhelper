import type {
  ParsedTerritory,
  ParsedTerritoryComponent,
  Position,
  TerritoryPolygon,
} from "./types";

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseCoordinates(raw: string): Position[] {
  const positions = decodeXml(raw)
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(",").slice(0, 2).map(Number))
    .filter((tuple) => tuple.length === 2 && tuple.every(Number.isFinite))
    .map(([longitude, latitude]) => [longitude, latitude] as Position);

  if (positions.length < 3) return [];
  const [firstLongitude, firstLatitude] = positions[0];
  const [lastLongitude, lastLatitude] = positions[positions.length - 1];
  if (firstLongitude !== lastLongitude || firstLatitude !== lastLatitude) {
    positions.push([firstLongitude, firstLatitude]);
  }
  return positions;
}

function ringFromBoundary(block: string): Position[] {
  const coordinates = block.match(
    /<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/i,
  )?.[1];
  return coordinates ? parseCoordinates(coordinates) : [];
}

function polygonsFromBlock(block: string): TerritoryPolygon[] {
  const polygons: TerritoryPolygon[] = [];
  const polygonPattern = /<Polygon\b[^>]*>([\s\S]*?)<\/Polygon>/gi;
  let match: RegExpExecArray | null;
  while ((match = polygonPattern.exec(block))) {
    const polygonBlock = match[1];
    const outerBlock =
      polygonBlock.match(
        /<outerBoundaryIs\b[^>]*>([\s\S]*?)<\/outerBoundaryIs>/i,
      )?.[1] ?? polygonBlock;
    const outer = ringFromBoundary(outerBlock);
    if (outer.length < 4) continue;
    const holes = [
      ...polygonBlock.matchAll(
        /<innerBoundaryIs\b[^>]*>([\s\S]*?)<\/innerBoundaryIs>/gi,
      ),
    ]
      .map((hole) => ringFromBoundary(hole[1]))
      .filter((ring) => ring.length >= 4);
    polygons.push({ outer, holes });
  }
  return polygons;
}

function placemarkType(block: string): string | null {
  const raw = block.match(
    /<Data\b[^>]*\bname=["']Type["'][^>]*>[\s\S]*?<value\b[^>]*>([\s\S]*?)<\/value>/i,
  )?.[1];
  if (!raw) return null;
  return decodeXml(
    raw
      .replace(/<!\[CDATA\[/gi, "")
      .replace(/\]\]>/g, "")
      .trim(),
  );
}

function elementName(block: string): string | null {
  const raw = block.match(/<name\b[^>]*>([\s\S]*?)<\/name>/i)?.[1];
  return raw ? decodeXml(raw.trim()) : null;
}

function normalizedType(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function componentClassification(
  type: string | null,
): Pick<ParsedTerritoryComponent, "environment" | "purpose" | "special"> {
  const normalized = normalizedType(type ?? "");
  if (normalized.includes("presidio"))
    return {
      environment: "unknown",
      purpose: "regular-preaching",
      special: true,
    };
  if (normalized.includes("idioma") || normalized.includes("language"))
    return {
      environment: "mixed",
      purpose: "language-census",
      special: false,
    };
  if (normalized.includes("rural"))
    return {
      environment: "rural",
      purpose: "regular-preaching",
      special: false,
    };
  if (normalized.includes("territorio de congregacao"))
    return {
      environment: "urban",
      purpose: "regular-preaching",
      special: false,
    };
  return {
    environment: "unknown",
    purpose: "regular-preaching",
    special: false,
  };
}

export function parseKmlComponents(kml: string): ParsedTerritoryComponent[] {
  const documentName =
    kml.match(
      /<Document\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i,
    )?.[1] ?? null;
  const placemarks = [
    ...kml.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi),
  ];
  const blocks =
    placemarks.length > 0 ? placemarks.map((match) => match[1]) : [kml];
  return blocks.flatMap((block) => {
    const polygons = polygonsFromBlock(block);
    if (polygons.length === 0) return [];
    const sourceType = placemarkType(block);
    return [
      {
        name:
          elementName(block) ??
          (documentName ? decodeXml(documentName.trim()) : null),
        polygons,
        sourceType,
        ...componentClassification(sourceType),
      },
    ];
  });
}

export function parseKmlTerritory(
  kml: string,
  options: { mode?: "territorial" | "language" } = {},
): ParsedTerritory {
  const name =
    kml.match(
      /<Document\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i,
    )?.[1] ??
    kml.match(
      /<Placemark\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i,
    )?.[1] ??
    null;
  const components = parseKmlComponents(kml);
  const polygons = components
    .filter((component) => {
      if (!options.mode) return true;
      if (!component.sourceType) return true;
      if (component.special) return false;
      return options.mode === "language"
        ? component.purpose === "language-census"
        : component.purpose === "regular-preaching";
    })
    .flatMap((component) => component.polygons);

  if (polygons.length === 0) {
    if (options.mode && components.length > 0)
      throw new Error(
        `O KML não contém polígonos compatíveis com o modo ${options.mode}.`,
      );
    throw new Error("O KML não contém nenhum polígono válido.");
  }
  return { name: name ? decodeXml(name.trim()) : null, polygons };
}

function pointOnSegment(
  point: Position,
  start: Position,
  end: Position,
  epsilon = 1e-10,
): boolean {
  const squaredLength = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  if (squaredLength <= epsilon ** 2) {
    return (
      (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2 <= epsilon ** 2
    );
  }
  const length = Math.sqrt(squaredLength);
  const cross =
    (point[1] - start[1]) * (end[0] - start[0]) -
    (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > epsilon * length) return false;
  const dot =
    (point[0] - start[0]) * (end[0] - start[0]) +
    (point[1] - start[1]) * (end[1] - start[1]);
  if (dot < -epsilon * length) return false;
  return dot <= squaredLength + epsilon * length;
}

function inRing(
  point: Position,
  ring: Position[],
  includeBoundary: boolean,
): boolean {
  let inside = false;
  for (
    let current = 0, previous = ring.length - 1;
    current < ring.length;
    previous = current++
  ) {
    const a = ring[previous];
    const b = ring[current];
    if (pointOnSegment(point, a, b)) return includeBoundary;
    const intersects =
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInTerritory(
  point: Position,
  territory: ParsedTerritory,
  includeBoundary = true,
): boolean {
  return territory.polygons.some(
    (polygon) =>
      inRing(point, polygon.outer, includeBoundary) &&
      !polygon.holes.some((hole) => inRing(point, hole, !includeBoundary)),
  );
}

function pointToSegmentDistanceMeters(
  point: Position,
  start: Position,
  end: Position,
): number {
  const latitudeRadians = (point[1] * Math.PI) / 180;
  const longitudeScale = 111_320 * Math.cos(latitudeRadians);
  const latitudeScale = 110_540;
  const projectedPoint = [point[0] * longitudeScale, point[1] * latitudeScale];
  const projectedStart = [start[0] * longitudeScale, start[1] * latitudeScale];
  const projectedEnd = [end[0] * longitudeScale, end[1] * latitudeScale];
  const deltaX = projectedEnd[0] - projectedStart[0];
  const deltaY = projectedEnd[1] - projectedStart[1];
  const squaredLength = deltaX ** 2 + deltaY ** 2;
  if (squaredLength === 0)
    return Math.hypot(
      projectedPoint[0] - projectedStart[0],
      projectedPoint[1] - projectedStart[1],
    );
  const factor = Math.max(
    0,
    Math.min(
      1,
      ((projectedPoint[0] - projectedStart[0]) * deltaX +
        (projectedPoint[1] - projectedStart[1]) * deltaY) /
        squaredLength,
    ),
  );
  return Math.hypot(
    projectedPoint[0] - (projectedStart[0] + factor * deltaX),
    projectedPoint[1] - (projectedStart[1] + factor * deltaY),
  );
}

export function pointInTerritoryWithTolerance(
  point: Position,
  territory: ParsedTerritory,
  toleranceMeters: number,
): boolean {
  if (pointInTerritory(point, territory, true)) return true;
  if (toleranceMeters <= 0) return false;
  return territory.polygons.some((polygon) =>
    polygon.outer.some(
      (end, index) =>
        pointToSegmentDistanceMeters(
          point,
          polygon.outer[index - 1] ?? polygon.outer[polygon.outer.length - 1],
          end,
        ) <= toleranceMeters,
    ),
  );
}

export function territoryToGeoJson(territory: ParsedTerritory) {
  return {
    type: "Feature" as const,
    properties: { name: territory.name },
    geometry:
      territory.polygons.length === 1
        ? {
            type: "Polygon" as const,
            coordinates: [
              territory.polygons[0].outer,
              ...territory.polygons[0].holes,
            ],
          }
        : {
            type: "MultiPolygon" as const,
            coordinates: territory.polygons.map((polygon) => [
              polygon.outer,
              ...polygon.holes,
            ]),
          },
  };
}

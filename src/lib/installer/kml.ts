import type { ParsedTerritory, Position, TerritoryPolygon } from './types';

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseCoordinates(raw: string): Position[] {
  const positions = decodeXml(raw)
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(',').slice(0, 2).map(Number))
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
  const coordinates = block.match(/<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/i)?.[1];
  return coordinates ? parseCoordinates(coordinates) : [];
}

export function parseKmlTerritory(kml: string): ParsedTerritory {
  const name = kml.match(/<Document\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i)?.[1]
    ?? kml.match(/<Placemark\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i)?.[1]
    ?? null;
  const polygons: TerritoryPolygon[] = [];
  const polygonPattern = /<Polygon\b[^>]*>([\s\S]*?)<\/Polygon>/gi;
  let match: RegExpExecArray | null;

  while ((match = polygonPattern.exec(kml))) {
    const block = match[1];
    const outerBlock = block.match(/<outerBoundaryIs\b[^>]*>([\s\S]*?)<\/outerBoundaryIs>/i)?.[1] ?? block;
    const outer = ringFromBoundary(outerBlock);
    if (outer.length < 4) continue;
    const holes = [...block.matchAll(/<innerBoundaryIs\b[^>]*>([\s\S]*?)<\/innerBoundaryIs>/gi)]
      .map((hole) => ringFromBoundary(hole[1]))
      .filter((ring) => ring.length >= 4);
    polygons.push({ outer, holes });
  }

  if (polygons.length === 0) throw new Error('O KML não contém nenhum polígono válido.');
  return { name: name ? decodeXml(name.trim()) : null, polygons };
}

function pointOnSegment(point: Position, start: Position, end: Position, epsilon = 1e-10): boolean {
  const squaredLength = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
  if (squaredLength <= epsilon ** 2) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2 <= epsilon ** 2;
  }
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1]);
  if (dot < -epsilon) return false;
  return dot <= squaredLength + epsilon;
}

function inRing(point: Position, ring: Position[], includeBoundary: boolean): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[previous];
    const b = ring[current];
    if (pointOnSegment(point, a, b)) return includeBoundary;
    const intersects = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInTerritory(
  point: Position,
  territory: ParsedTerritory,
  includeBoundary = true
): boolean {
  return territory.polygons.some(
    (polygon) => inRing(point, polygon.outer, includeBoundary)
      && !polygon.holes.some((hole) => inRing(point, hole, !includeBoundary))
  );
}

export function territoryToGeoJson(territory: ParsedTerritory) {
  return {
    type: 'Feature' as const,
    properties: { name: territory.name },
    geometry: territory.polygons.length === 1
      ? {
          type: 'Polygon' as const,
          coordinates: [territory.polygons[0].outer, ...territory.polygons[0].holes]
        }
      : {
          type: 'MultiPolygon' as const,
          coordinates: territory.polygons.map((polygon) => [polygon.outer, ...polygon.holes])
        }
  };
}

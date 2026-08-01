import { pointInTerritory } from './kml';
import type { ParsedTerritory, Position, PreparedWorkArea } from './types';

function validRing(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= 4 && value.every((position) =>
    Array.isArray(position) && position.length >= 2 && position.slice(0, 2).every(Number.isFinite)
  );
}

function validatePolygon(coordinates: unknown, territory: ParsedTerritory, label: string): Position[][] {
  if (!Array.isArray(coordinates) || !validRing(coordinates[0])) throw new Error(`${label} não contém um anel externo válido.`);
  const rings = coordinates as Position[][];
  if (!rings.every(validRing)) throw new Error(`${label} contém um anel inválido.`);
  if (!rings[0].every((position) => pointInTerritory(position, territory, true))) {
    throw new Error(`${label} possui vértices fora do limite territorial.`);
  }
  return rings;
}

export function parseWorkAreasGeoJson(raw: string, territory: ParsedTerritory): PreparedWorkArea[] {
  const parsed = JSON.parse(raw) as any;
  const features = parsed.type === 'FeatureCollection' ? parsed.features : parsed.type === 'Feature' ? [parsed] : [];
  if (!Array.isArray(features) || features.length === 0) throw new Error('O GeoJSON de áreas não contém nenhuma Feature.');
  const result: PreparedWorkArea[] = [];
  const ids = new Set<string>();

  features.forEach((feature: any, featureIndex: number) => {
    const baseId = String(feature.id ?? feature.properties?.id ?? feature.properties?.nome ?? featureIndex + 1);
    const geometry = feature.geometry;
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
    if (!polygons) throw new Error(`Área ${baseId} precisa ser Polygon ou MultiPolygon.`);
    polygons.forEach((coordinates: unknown, polygonIndex: number) => {
      const id = polygons.length === 1 ? baseId : `${baseId}-${polygonIndex + 1}`;
      if (ids.has(id)) throw new Error(`Identificador de área duplicado: ${id}.`);
      ids.add(id);
      result.push({
        id,
        geometry: { type: 'Polygon', coordinates: validatePolygon(coordinates, territory, `Área ${id}`) },
        properties: feature.properties ?? {}
      });
    });
  });
  return result;
}

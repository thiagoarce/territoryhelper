import { assertEq, assertTrue, test } from './harness';
import { parseWorkAreasGeoJson } from '../src/lib/installer/areas';
import { parseKmlTerritory } from '../src/lib/installer/kml';

const territory = parseKmlTerritory('<kml><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 10,0 10,10 0,10 0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></kml>');

test('áreas GeoJSON válidas recebem identificadores estáveis', () => {
  const areas = parseWorkAreasGeoJson(JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { id: 'Q1' }, geometry: { type: 'Polygon', coordinates: [[[1,1],[2,1],[2,2],[1,2],[1,1]]] } }]
  }), territory);
  assertEq(areas.length, 1);
  assertEq(areas[0].id, 'Q1');
});

test('área com vértice fora do território é recusada antes da publicação', () => {
  let failed = false;
  try {
    parseWorkAreasGeoJson(JSON.stringify({
      type: 'Feature', properties: { id: 'Q2' }, geometry: { type: 'Polygon', coordinates: [[[1,1],[12,1],[2,2],[1,1]]] }
    }), territory);
  } catch (error) {
    failed = String(error).includes('fora do limite');
  }
  assertTrue(failed);
});

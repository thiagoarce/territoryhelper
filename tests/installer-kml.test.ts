import { assertEq, assertFalse, assertTrue, test } from './harness';
import { parseKmlTerritory, pointInTerritory, territoryToGeoJson } from '../src/lib/installer/kml';

const kml = `<?xml version="1.0"?><kml><Document><name>Território Teste</name><Placemark><MultiGeometry>
<Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 10,0 10,10 0,10</coordinates></LinearRing></outerBoundaryIs>
<innerBoundaryIs><LinearRing><coordinates>4,4 6,4 6,6 4,6</coordinates></LinearRing></innerBoundaryIs></Polygon>
<Polygon><outerBoundaryIs><LinearRing><coordinates>20,20 21,20 21,21 20,21 20,20</coordinates></LinearRing></outerBoundaryIs></Polygon>
</MultiGeometry></Placemark></Document></kml>`;

test('KML aceita multipolígono, fecha anéis e preserva nome', () => {
  const territory = parseKmlTerritory(kml);
  assertEq(territory.name, 'Território Teste');
  assertEq(territory.polygons.length, 2);
  assertEq(territory.polygons[0].outer[0], territory.polygons[0].outer.at(-1));
  assertEq(territoryToGeoJson(territory).geometry.type, 'MultiPolygon');
});

test('filtro territorial inclui fronteira e exclui buraco', () => {
  const territory = parseKmlTerritory(kml);
  assertTrue(pointInTerritory([0, 5], territory));
  assertTrue(pointInTerritory([2, 2], territory));
  assertFalse(pointInTerritory([5, 5], territory));
  assertFalse(pointInTerritory([15, 15], territory));
});

test('KML sem polígono falha com mensagem de domínio', () => {
  let failed = false;
  try { parseKmlTerritory('<kml><Point><coordinates>1,2</coordinates></Point></kml>'); }
  catch (error) { failed = String(error).includes('polígono válido'); }
  assertTrue(failed);
});

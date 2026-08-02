import { assertEq, assertFalse, assertTrue, test } from "./harness";
import {
  parseKmlComponents,
  parseKmlTerritory,
  pointInTerritory,
  territoryToGeoJson,
} from "../src/lib/installer/kml";

const kml = `<?xml version="1.0"?><kml><Document><name>Território Teste</name><Placemark><MultiGeometry>
<Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 10,0 10,10 0,10</coordinates></LinearRing></outerBoundaryIs>
<innerBoundaryIs><LinearRing><coordinates>4,4 6,4 6,6 4,6</coordinates></LinearRing></innerBoundaryIs></Polygon>
<Polygon><outerBoundaryIs><LinearRing><coordinates>20,20 21,20 21,21 20,21 20,20</coordinates></LinearRing></outerBoundaryIs></Polygon>
</MultiGeometry></Placemark></Document></kml>`;

test("KML aceita multipolígono, fecha anéis e preserva nome", () => {
  const territory = parseKmlTerritory(kml);
  assertEq(territory.name, "Território Teste");
  assertEq(territory.polygons.length, 2);
  assertEq(territory.polygons[0].outer[0], territory.polygons[0].outer.at(-1));
  assertEq(territoryToGeoJson(territory).geometry.type, "MultiPolygon");
});

test("filtro territorial inclui fronteira e exclui buraco", () => {
  const territory = parseKmlTerritory(kml);
  assertTrue(pointInTerritory([0, 5], territory));
  assertTrue(pointInTerritory([2, 2], territory));
  assertFalse(pointInTerritory([5, 5], territory));
  assertFalse(pointInTerritory([15, 15], territory));
});

test("KML sem polígono falha com mensagem de domínio", () => {
  let failed = false;
  try {
    parseKmlTerritory(
      "<kml><Point><coordinates>1,2</coordinates></Point></kml>",
    );
  } catch (error) {
    failed = String(error).includes("polígono válido");
  }
  assertTrue(failed);
});

const typedKml = `<kml><Document>
<Placemark><ExtendedData><Data name="Type"><value><![CDATA[ Território de congregação ]]></value></Data></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 1,0 1,1 0,1</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><ExtendedData><Data name="Type"><value><![CDATA[ Território rural ]]></value></Data></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>2,2 3,2 3,3 2,3</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><ExtendedData><Data name="Type"><value><![CDATA[ Idiomas ]]></value></Data></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>4,4 5,4 5,5 4,5</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><ExtendedData><Data name="Type"><value><![CDATA[ Presídio ]]></value></Data></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>6,6 7,6 7,7 6,7</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Document></kml>`;

test("modo territorial mantém áreas urbana e rural sem fundir idioma e presídio", () => {
  const territory = parseKmlTerritory(typedKml, { mode: "territorial" });
  assertEq(territory.polygons.length, 2);
  assertTrue(pointInTerritory([0.5, 0.5], territory));
  assertTrue(pointInTerritory([2.5, 2.5], territory));
  assertFalse(pointInTerritory([4.5, 4.5], territory));
  assertFalse(pointInTerritory([6.5, 6.5], territory));
});

test("modo de idioma seleciona somente o polígono do grupo linguístico", () => {
  const territory = parseKmlTerritory(typedKml, { mode: "language" });
  assertEq(territory.polygons.length, 1);
  assertTrue(pointInTerritory([4.5, 4.5], territory));
  assertFalse(pointInTerritory([0.5, 0.5], territory));
});

test("KML preserva finalidade e ambiente de cada componente", () => {
  const components = parseKmlComponents(typedKml);
  assertEq(
    components.map(({ environment, purpose, special }) => ({
      environment,
      purpose,
      special,
    })),
    [
      { environment: "urban", purpose: "regular-preaching", special: false },
      { environment: "rural", purpose: "regular-preaching", special: false },
      { environment: "mixed", purpose: "language-census", special: false },
      { environment: "unknown", purpose: "regular-preaching", special: true },
    ],
  );
});

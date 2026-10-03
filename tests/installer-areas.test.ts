import { assertEq, assertTrue, test } from "./harness";
import {
  assignLocalsToWorkAreas,
  parseInstallerAreasGeoJson,
  parseWorkAreasGeoJson,
} from "../src/lib/installer/areas";
import { parseKmlTerritory } from "../src/lib/installer/kml";
import type { PreparedLocal } from "../src/lib/installer/types";

const territory = parseKmlTerritory(
  "<kml><Polygon><outerBoundaryIs><LinearRing><coordinates>0,0 10,0 10,10 0,10 0,0</coordinates></LinearRing></outerBoundaryIs></Polygon></kml>",
);

test("áreas GeoJSON válidas recebem identificadores estáveis", () => {
  const areas = parseWorkAreasGeoJson(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "Q1" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [1, 1],
                [2, 1],
                [2, 2],
                [1, 2],
                [1, 1],
              ],
            ],
          },
        },
      ],
    }),
    territory,
  );
  assertEq(areas.length, 1);
  assertEq(areas[0].id, "Q1");
});

test("área com vértice fora do território é recusada antes da publicação", () => {
  let failed = false;
  try {
    parseWorkAreasGeoJson(
      JSON.stringify({
        type: "Feature",
        properties: { id: "Q2" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [1, 1],
              [12, 1],
              [2, 2],
              [1, 1],
            ],
          ],
        },
      }),
      territory,
    );
  } catch (error) {
    failed = String(error).includes("fora do limite");
  }
  assertTrue(failed);
});

test("estrutura geográfica preserva múltiplos territórios e suas quadras", () => {
  const parsed = parseInstallerAreasGeoJson(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "T1",
          properties: { kind: "territory", name: "1", color: "#abcdef" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [1, 1],
                [5, 1],
                [5, 5],
                [1, 5],
                [1, 1],
              ],
            ],
          },
        },
        {
          type: "Feature",
          id: "Q1",
          properties: { kind: "work-area", territoryId: "T1" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [2, 2],
                [3, 2],
                [3, 3],
                [2, 3],
                [2, 2],
              ],
            ],
          },
        },
      ],
    }),
    territory,
    "principal",
  );
  assertEq(parsed.territories.length, 1);
  assertEq(parsed.territories[0].id, "T1");
  assertEq(parsed.workAreas[0].territoryId, "T1");
});

test("tolerância métrica aceita apenas pequenas diferenças de borda declaradas", () => {
  const closeToBoundary = JSON.stringify({
    type: "Feature",
    properties: { id: "Q3" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-0.00005, 1],
          [1, 1],
          [1, 2],
          [-0.00005, 1],
        ],
      ],
    },
  });
  let strictFailed = false;
  try {
    parseInstallerAreasGeoJson(closeToBoundary, territory, "principal", 0);
  } catch {
    strictFailed = true;
  }
  assertTrue(strictFailed);
  assertEq(
    parseInstallerAreasGeoJson(closeToBoundary, territory, "principal", 10)
      .workAreas.length,
    1,
  );
});

test("vínculo de quadra não escolhe arbitrariamente quando polígonos se sobrepõem", () => {
  const areas = parseWorkAreasGeoJson(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "Q1" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [1, 1],
                [4, 1],
                [4, 4],
                [1, 4],
                [1, 1],
              ],
            ],
          },
        },
        {
          type: "Feature",
          properties: { id: "Q2" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [2, 2],
                [5, 2],
                [5, 5],
                [2, 5],
                [2, 2],
              ],
            ],
          },
        },
      ],
    }),
    territory,
  );
  const local = {
    sourceId: "L1",
    latitude: 3,
    longitude: 3,
    workAreaId: null,
  } as PreparedLocal;
  const result = assignLocalsToWorkAreas([local], areas);
  assertEq(result, {
    assigned: 0,
    unassigned: 0,
    ambiguous: 1,
    unassignedLocalIds: [],
    ambiguousLocalIds: ["L1"],
  });
  assertEq(local.workAreaId, null);
});

test("segmento de fechamento microscópico não captura ponto distante", () => {
  const areas = parseWorkAreasGeoJson(
    JSON.stringify({
      type: "Feature",
      properties: { id: "Q4" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [1, 1],
            [2, 1],
            [2, 2],
            [1.00000001, 1.00000001],
            [1, 1],
          ],
        ],
      },
    }),
    territory,
  );
  const local = {
    sourceId: "L2",
    latitude: 8,
    longitude: 8,
    workAreaId: null,
  } as PreparedLocal;
  assertEq(assignLocalsToWorkAreas([local], areas), {
    assigned: 0,
    unassigned: 1,
    ambiguous: 0,
    unassignedLocalIds: ["L2"],
    ambiguousLocalIds: [],
  });
});

test("quadra de censo pode sobrepor quadra regular sem tornar o local ambíguo", () => {
  const parsed = parseInstallerAreasGeoJson(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { id: "R1", purpose: "regular-preaching" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [1, 1],
                [4, 1],
                [4, 4],
                [1, 4],
                [1, 1],
              ],
            ],
          },
        },
        {
          type: "Feature",
          properties: { id: "C1", purpose: "language-census" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [1, 1],
                [4, 1],
                [4, 4],
                [1, 4],
                [1, 1],
              ],
            ],
          },
        },
      ],
    }),
    territory,
    "principal",
  );
  const local = {
    sourceId: "L3",
    latitude: 2,
    longitude: 2,
    workAreaId: null,
  } as PreparedLocal;
  assertEq(assignLocalsToWorkAreas([local], parsed.workAreas).assigned, 1);
  assertEq(local.workAreaId, "R1");
  assertEq(parsed.workAreas[1].purpose, "language-census");
});

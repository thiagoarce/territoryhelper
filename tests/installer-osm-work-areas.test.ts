import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertEq, assertTrue, test } from "./harness";
import { parseKmlComponents } from "../src/lib/installer/kml";
import {
  generateWorkAreasFromOsm,
  downloadOsmRoadNetwork,
  type OsmRoadNetwork,
} from "../src/lib/installer/osm-work-areas";

const components = parseKmlComponents(`<kml><Placemark><ExtendedData>
<Data name="Type"><value>Território de congregação</value></Data>
</ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>
0,0 2,0 2,2 0,2 0,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`);

test("gerador OSM transforma anel viário em quadra sugerida clicável", () => {
  const network: OsmRoadNetwork = {
    nodes: new Map([
      [1, [0.5, 0.5]],
      [2, [1.5, 0.5]],
      [3, [1.5, 1.5]],
      [4, [0.5, 1.5]],
    ]),
    ways: new Map([
      [10, { type: "way", id: 10, nodes: [1, 2] }],
      [11, { type: "way", id: 11, nodes: [2, 3] }],
      [12, { type: "way", id: 12, nodes: [3, 4] }],
      [13, { type: "way", id: 13, nodes: [4, 1] }],
    ]),
  };
  const areas = generateWorkAreasFromOsm(components, network, {
    territoryId: "principal",
    minimumAreaSquareMeters: 1,
  });
  assertEq(areas.length, 1);
  assertEq(areas[0].type, "urban-block");
  assertEq(areas[0].purpose, "regular-preaching");
  assertEq(areas[0].reviewStatus, "suggested");
  assertTrue(Number(areas[0].properties.areaSquareMeters) > 0);
});

test("download OSM usa servidor alternativo depois de timeout", async () => {
  const directory = mkdtempSync(join(tmpdir(), "territory-osm-test-"));
  let attempts = 0;
  try {
    const network = await downloadOsmRoadNetwork(components, {
      cacheDirectory: directory,
      tileSizeDegrees: 5,
      bufferDegrees: 0,
      requestDelayMs: 0,
      requestTimeoutMs: 1_000,
      fetcher: async () => {
        attempts += 1;
        if (attempts === 1) return new Response("", { status: 504 });
        return new Response(
          JSON.stringify({
            elements: [
              { type: "node", id: 1, lat: 0, lon: 0 },
              { type: "node", id: 2, lat: 1, lon: 1 },
              { type: "way", id: 10, nodes: [1, 2] },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    assertEq(attempts, 2);
    assertEq(network.ways.size, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

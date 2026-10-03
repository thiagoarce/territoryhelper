import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import {
  discoverCnefeMunicipalities,
  downloadCnefeMunicipalities,
  findIntersectingAreaCodes,
  type DiscoveredCnefeMunicipality,
} from "../src/lib/installer/cnefe-download";
import { parseKmlTerritory } from "../src/lib/installer/kml";
import { assertEq, assertTrue, test } from "./harness";

const territory = parseKmlTerritory(`
  <kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
    0,0 10,0 10,10 0,10 0,0
  </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>
`);

function feature(code: string, coordinates: number[][]) {
  return {
    type: "Feature",
    properties: { codarea: code },
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

test("cruzamento municipal detecta contenção e interseção de arestas", () => {
  const collection = {
    type: "FeatureCollection",
    features: [
      feature("dentro", [
        [-1, -1],
        [11, -1],
        [11, 11],
        [-1, 11],
        [-1, -1],
      ]),
      feature("cruza", [
        [-1, 4],
        [11, 4],
        [11, 6],
        [-1, 6],
        [-1, 4],
      ]),
      feature("fora", [
        [20, 20],
        [21, 20],
        [21, 21],
        [20, 21],
        [20, 20],
      ]),
    ],
  };
  assertEq(findIntersectingAreaCodes(territory, collection as any), [
    "cruza",
    "dentro",
  ]);
});

test("descoberta consulta só a UF interceptada e resolve arquivos oficiais", async () => {
  const stateCollection = {
    type: "FeatureCollection",
    features: [
      feature("50", [
        [-5, -5],
        [15, -5],
        [15, 15],
        [-5, 15],
        [-5, -5],
      ]),
    ],
  };
  const municipalityCollection = {
    type: "FeatureCollection",
    features: [
      feature("5002704", [
        [0, 0],
        [6, 0],
        [6, 10],
        [0, 10],
        [0, 0],
      ]),
      feature("5004908", [
        [6, 0],
        [10, 0],
        [10, 10],
        [6, 10],
        [6, 0],
      ]),
    ],
  };
  const requested: string[] = [];
  const fetcher = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    requested.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.method === "HEAD")
      return new Response(null, {
        status: 200,
        headers: { "content-length": "1234" },
      });
    if (url.includes("/paises/BR")) return Response.json(stateCollection);
    if (url.includes("/estados/50"))
      return Response.json(municipalityCollection);
    if (url.endsWith("/50_MS/"))
      return new Response(
        '<a href="5002704_CAMPO_GRANDE.zip">Campo</a><a href="5004908_JARAGUARI.zip">Jaraguari</a>',
      );
    if (url.endsWith("/5002704"))
      return Response.json({ nome: "Campo Grande" });
    if (url.endsWith("/5004908")) return Response.json({ nome: "Jaraguari" });
    return new Response("não encontrado", { status: 404 });
  }) as typeof fetch;

  const result = await discoverCnefeMunicipalities(territory, fetcher);
  assertEq(
    result.map(({ code, name, compressedBytes }) => ({
      code,
      name,
      compressedBytes,
    })),
    [
      { code: "5002704", name: "Campo Grande", compressedBytes: 1234 },
      { code: "5004908", name: "Jaraguari", compressedBytes: 1234 },
    ],
  );
  assertEq(
    requested.filter((request) => request.includes("/estados/")).length,
    1,
  );
});

test("download extrai o CSV esperado e depois reutiliza o cache", async () => {
  const directory = mkdtempSync(join(tmpdir(), "territory-installer-cnefe-"));
  const municipality: DiscoveredCnefeMunicipality = {
    code: "5002704",
    name: "Campo Grande",
    stateCode: "50",
    stateAbbreviation: "MS",
    zipFilename: "5002704_CAMPO_GRANDE.zip",
    csvFilename: "5002704_CAMPO_GRANDE.csv",
    downloadUrl: "https://example.test/5002704_CAMPO_GRANDE.zip",
    compressedBytes: null,
  };
  const csv =
    "COD_UNICO_ENDERECO;COD_MUNICIPIO;LATITUDE;LONGITUDE\r\n1;5002704;-20.4;-54.6\r\n";
  const archive = zipSync({
    [municipality.csvFilename]: strToU8(csv),
  });
  let downloads = 0;
  const fetcher = (async () => {
    downloads += 1;
    return new Response(archive, { status: 200 });
  }) as typeof fetch;

  try {
    const first = await downloadCnefeMunicipalities(
      [municipality],
      directory,
      fetcher,
    );
    assertEq(first[0].status, "downloaded");
    assertEq(readFileSync(first[0].csvPath, "utf8"), csv);
    assertTrue(first[0].csvSha256.length === 64);

    const second = await downloadCnefeMunicipalities(
      [municipality],
      directory,
      (async () => {
        throw new Error("não deveria baixar novamente");
      }) as typeof fetch,
    );
    assertEq(second[0].status, "cached");
    assertEq(downloads, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

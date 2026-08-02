import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Unzip, UnzipInflate } from "fflate";
import { pointInTerritory } from "./kml";
import type { ParsedTerritory, Position, TerritoryPolygon } from "./types";

const IBGE_MESH_API = "https://servicodados.ibge.gov.br/api/v3/malhas";
const IBGE_LOCALITIES_API =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";
const IBGE_CNEFE_BASE =
  "https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio";

const STATE_ABBREVIATIONS: Record<string, string> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};

interface IbgeGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: Position[][] | Position[][][];
}

interface IbgeAreaFeature {
  type: "Feature";
  geometry: IbgeGeometry;
  properties: { codarea: string };
}

interface IbgeFeatureCollection {
  type: "FeatureCollection";
  features: IbgeAreaFeature[];
}

export interface DiscoveredCnefeMunicipality {
  code: string;
  name: string;
  stateCode: string;
  stateAbbreviation: string;
  zipFilename: string;
  csvFilename: string;
  downloadUrl: string;
  compressedBytes: number | null;
}

export interface DownloadedCnefeMunicipality {
  municipality: DiscoveredCnefeMunicipality;
  csvPath: string;
  csvSha256: string;
  zipPath: string | null;
  zipSha256: string | null;
  status: "cached" | "downloaded";
}

type FetchLike = typeof fetch;

function geometryPolygons(geometry: IbgeGeometry): Position[][][] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates as Position[][]]
    : (geometry.coordinates as Position[][][]);
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

function pointInRing(point: Position, ring: Position[]): boolean {
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

function pointInPolygon(point: Position, polygon: Position[][]): boolean {
  const [outer, ...holes] = polygon;
  return (
    pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole))
  );
}

function orientation(a: Position, b: Position, c: Position): number {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 1e-12) return 0;
  return value > 0 ? 1 : 2;
}

function segmentsIntersect(
  firstStart: Position,
  firstEnd: Position,
  secondStart: Position,
  secondEnd: Position,
): boolean {
  const firstA = orientation(firstStart, firstEnd, secondStart);
  const firstB = orientation(firstStart, firstEnd, secondEnd);
  const secondA = orientation(secondStart, secondEnd, firstStart);
  const secondB = orientation(secondStart, secondEnd, firstEnd);
  if (firstA !== firstB && secondA !== secondB) return true;
  return (
    (firstA === 0 && pointOnSegment(secondStart, firstStart, firstEnd)) ||
    (firstB === 0 && pointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (secondA === 0 && pointOnSegment(firstStart, secondStart, secondEnd)) ||
    (secondB === 0 && pointOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function ringEdgesIntersect(left: Position[], right: Position[]): boolean {
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const leftStart = left[leftIndex];
    const leftEnd = left[(leftIndex + 1) % left.length];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const rightStart = right[rightIndex];
      const rightEnd = right[(rightIndex + 1) % right.length];
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd))
        return true;
    }
  }
  return false;
}

function territoryPolygonContainsPoint(
  point: Position,
  polygon: TerritoryPolygon,
): boolean {
  return (
    pointInRing(point, polygon.outer) &&
    !polygon.holes.some((hole) => pointInRing(point, hole))
  );
}

function areaIntersectsTerritory(
  territory: ParsedTerritory,
  areaPolygons: Position[][][],
): boolean {
  for (const areaPolygon of areaPolygons) {
    const [areaOuter, ...areaHoles] = areaPolygon;
    if (
      territory.polygons.some((polygon) =>
        polygon.outer.some((point) => pointInPolygon(point, areaPolygon)),
      )
    )
      return true;
    if (areaOuter.some((point) => pointInTerritory(point, territory, true)))
      return true;
    for (const territoryPolygon of territory.polygons) {
      const territoryRings = [
        territoryPolygon.outer,
        ...territoryPolygon.holes,
      ];
      const areaRings = [areaOuter, ...areaHoles];
      if (
        territoryRings.some((territoryRing) =>
          areaRings.some((areaRing) =>
            ringEdgesIntersect(territoryRing, areaRing),
          ),
        )
      )
        return true;
      if (
        areaOuter.length > 0 &&
        territoryPolygonContainsPoint(areaOuter[0], territoryPolygon)
      )
        return true;
    }
  }
  return false;
}

export function findIntersectingAreaCodes(
  territory: ParsedTerritory,
  collection: IbgeFeatureCollection,
): string[] {
  if (
    collection.type !== "FeatureCollection" ||
    !Array.isArray(collection.features)
  )
    throw new Error(
      "A malha do IBGE não retornou uma FeatureCollection válida.",
    );
  return collection.features
    .filter(
      (feature) =>
        feature.geometry &&
        (feature.geometry.type === "Polygon" ||
          feature.geometry.type === "MultiPolygon") &&
        areaIntersectsTerritory(territory, geometryPolygons(feature.geometry)),
    )
    .map((feature) => String(feature.properties.codarea))
    .sort();
}

async function requireResponse(
  fetcher: FetchLike,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetcher(url, init);
  if (!response.ok)
    throw new Error(
      `O IBGE respondeu ${response.status} ao consultar ${new URL(url).pathname}.`,
    );
  return response;
}

async function fetchMesh(
  fetcher: FetchLike,
  url: string,
): Promise<IbgeFeatureCollection> {
  const response = await requireResponse(fetcher, url);
  return (await response.json()) as IbgeFeatureCollection;
}

function stateDirectory(stateCode: string): string {
  const abbreviation = STATE_ABBREVIATIONS[stateCode];
  if (!abbreviation)
    throw new Error(`UF desconhecida na malha do IBGE: ${stateCode}.`);
  return `${IBGE_CNEFE_BASE}/${stateCode}_${abbreviation}/`;
}

function filenameFromDirectory(html: string, municipalityCode: string): string {
  const pattern = new RegExp(
    `href=["']([^"']*${municipalityCode}_[^"']+\\.zip)["']`,
    "i",
  );
  const filename = pattern.exec(html)?.[1]?.replace(/&amp;/g, "&");
  if (!filename)
    throw new Error(
      `O arquivo CNEFE do município ${municipalityCode} não foi encontrado no diretório oficial.`,
    );
  const safeName = basename(decodeURIComponent(filename));
  if (
    !safeName.startsWith(`${municipalityCode}_`) ||
    !safeName.endsWith(".zip")
  )
    throw new Error(`Nome de arquivo CNEFE inesperado: ${safeName}.`);
  return safeName;
}

function nameFromFilename(filename: string, municipalityCode: string): string {
  return filename
    .replace(new RegExp(`^${municipalityCode}_`), "")
    .replace(/\.zip$/i, "")
    .replace(/_/g, " ")
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

async function municipalityName(
  fetcher: FetchLike,
  code: string,
  fallback: string,
): Promise<string> {
  try {
    const response = await requireResponse(
      fetcher,
      `${IBGE_LOCALITIES_API}/${code}`,
    );
    const payload = (await response.json()) as { nome?: unknown };
    return typeof payload.nome === "string" ? payload.nome : fallback;
  } catch {
    return fallback;
  }
}

async function compressedSize(
  fetcher: FetchLike,
  url: string,
): Promise<number | null> {
  try {
    const response = await requireResponse(fetcher, url, { method: "HEAD" });
    const value = Number(response.headers.get("content-length"));
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export async function discoverCnefeMunicipalities(
  territory: ParsedTerritory,
  fetcher: FetchLike = fetch,
): Promise<DiscoveredCnefeMunicipality[]> {
  const stateMeshUrl = `${IBGE_MESH_API}/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF`;
  const stateCodes = findIntersectingAreaCodes(
    territory,
    await fetchMesh(fetcher, stateMeshUrl),
  );
  if (stateCodes.length === 0)
    throw new Error(
      "O KML não intercepta nenhuma UF na malha oficial do IBGE.",
    );

  const municipalityCodesByState = new Map<string, string[]>();
  await Promise.all(
    stateCodes.map(async (stateCode) => {
      const municipalityMeshUrl = `${IBGE_MESH_API}/estados/${stateCode}?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio`;
      const codes = findIntersectingAreaCodes(
        territory,
        await fetchMesh(fetcher, municipalityMeshUrl),
      );
      municipalityCodesByState.set(stateCode, codes);
    }),
  );

  const discovered: DiscoveredCnefeMunicipality[] = [];
  for (const stateCode of stateCodes) {
    const directoryUrl = stateDirectory(stateCode);
    const directoryHtml = await (
      await requireResponse(fetcher, directoryUrl)
    ).text();
    for (const code of municipalityCodesByState.get(stateCode) ?? []) {
      const zipFilename = filenameFromDirectory(directoryHtml, code);
      const downloadUrl = new URL(
        encodeURI(zipFilename),
        directoryUrl,
      ).toString();
      const fallbackName = nameFromFilename(zipFilename, code);
      const [name, bytes] = await Promise.all([
        municipalityName(fetcher, code, fallbackName),
        compressedSize(fetcher, downloadUrl),
      ]);
      discovered.push({
        code,
        name,
        stateCode,
        stateAbbreviation: STATE_ABBREVIATIONS[stateCode],
        zipFilename,
        csvFilename: zipFilename.replace(/\.zip$/i, ".csv"),
        downloadUrl,
        compressedBytes: bytes,
      });
    }
  }
  return discovered.sort((left, right) => left.code.localeCompare(right.code));
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function validateCnefeCsv(path: string, municipalityCode: string): void {
  const descriptor = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(256 * 1024);
    const length = readSync(descriptor, buffer, 0, buffer.length, 0);
    const [header = "", firstRow = ""] = buffer
      .subarray(0, length)
      .toString("latin1")
      .split(/\r?\n/, 2);
    const columns = header.replace(/^\uFEFF/, "").split(";");
    const municipalityIndex = columns.indexOf("COD_MUNICIPIO");
    if (municipalityIndex < 0)
      throw new Error(`O arquivo ${basename(path)} não possui COD_MUNICIPIO.`);
    const firstMunicipality = firstRow.split(";")[municipalityIndex];
    if (firstMunicipality !== municipalityCode)
      throw new Error(
        `O arquivo ${basename(path)} contém município ${firstMunicipality || "vazio"}, esperado ${municipalityCode}.`,
      );
  } finally {
    closeSync(descriptor);
  }
}

async function downloadFile(
  fetcher: FetchLike,
  url: string,
  destination: string,
): Promise<void> {
  const partial = `${destination}.part`;
  rmSync(partial, { force: true });
  const response = await requireResponse(fetcher, url);
  if (!response.body)
    throw new Error("O download do IBGE não retornou conteúdo.");
  try {
    await pipeline(
      response.body as any,
      createWriteStream(partial, { flags: "wx" }),
    );
    renameSync(partial, destination);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
}

async function extractExpectedCsv(
  zipPath: string,
  csvPath: string,
  municipality: DiscoveredCnefeMunicipality,
): Promise<void> {
  const partial = `${csvPath}.part`;
  rmSync(partial, { force: true });
  let found = false;
  let descriptor: number | null = null;
  let resolveExtraction: (() => void) | null = null;
  let rejectExtraction: ((error: unknown) => void) | null = null;
  const extraction = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveExtraction = resolvePromise;
    rejectExtraction = rejectPromise;
  });
  const unzip = new Unzip((file) => {
    if (file.name !== municipality.csvFilename) return;
    if (found) {
      rejectExtraction?.(
        new Error(`CSV duplicado dentro de ${basename(zipPath)}.`),
      );
      return;
    }
    found = true;
    descriptor = openSync(partial, "wx");
    file.ondata = (error, data, final) => {
      if (error) {
        if (descriptor !== null) closeSync(descriptor);
        descriptor = null;
        rejectExtraction?.(error);
        return;
      }
      if (descriptor !== null && data.length > 0) writeSync(descriptor, data);
      if (final) {
        if (descriptor !== null) closeSync(descriptor);
        descriptor = null;
        resolveExtraction?.();
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  try {
    for await (const chunk of createReadStream(zipPath))
      unzip.push(new Uint8Array(chunk), false);
    unzip.push(new Uint8Array(), true);
    if (!found)
      throw new Error(
        `${municipality.csvFilename} não foi encontrado dentro do ZIP oficial.`,
      );
    await extraction;
    validateCnefeCsv(partial, municipality.code);
    renameSync(partial, csvPath);
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    rmSync(partial, { force: true });
    throw error;
  }
}

export async function downloadCnefeMunicipalities(
  municipalities: DiscoveredCnefeMunicipality[],
  directory: string,
  fetcher: FetchLike = fetch,
  onProgress: (message: string) => void = () => {},
): Promise<DownloadedCnefeMunicipality[]> {
  const targetDirectory = resolve(directory);
  mkdirSync(targetDirectory, { recursive: true });
  const results: DownloadedCnefeMunicipality[] = [];

  for (const municipality of municipalities) {
    const zipPath = join(targetDirectory, municipality.zipFilename);
    const csvPath = join(targetDirectory, municipality.csvFilename);
    let status: "cached" | "downloaded" = "cached";
    if (!existsSync(csvPath)) {
      if (!existsSync(zipPath)) {
        onProgress(
          `Baixando ${municipality.name}/${municipality.stateAbbreviation}…`,
        );
        await downloadFile(fetcher, municipality.downloadUrl, zipPath);
        status = "downloaded";
      } else {
        onProgress(`Extraindo ZIP em cache de ${municipality.name}…`);
      }
      await extractExpectedCsv(zipPath, csvPath, municipality);
    } else {
      onProgress(`Reutilizando ${municipality.csvFilename} do cache.`);
      validateCnefeCsv(csvPath, municipality.code);
    }
    results.push({
      municipality,
      csvPath,
      csvSha256: await sha256File(csvPath),
      zipPath: existsSync(zipPath) ? zipPath : null,
      zipSha256: existsSync(zipPath) ? await sha256File(zipPath) : null,
      status,
    });
  }
  return results;
}

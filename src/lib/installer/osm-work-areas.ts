import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import area from "@turf/area";
import bbox from "@turf/bbox";
import intersect from "@turf/intersect";
import polygonize from "@turf/polygonize";
import {
  featureCollection,
  lineString,
  multiPolygon,
  polygon,
} from "@turf/helpers";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type {
  ParsedTerritoryComponent,
  Position,
  PreparedWorkArea,
} from "./types";

const DEFAULT_OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
] as const;
const BLOCK_FORMING_HIGHWAYS =
  "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|pedestrian|road";

interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}

interface OsmWay {
  type: "way";
  id: number;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: Array<OsmNode | OsmWay | { type: string; id: number }>;
}

export interface OsmRoadNetwork {
  nodes: Map<number, Position>;
  ways: Map<number, OsmWay>;
}

export interface DownloadOsmOptions {
  cacheDirectory: string;
  fetcher?: typeof fetch;
  endpoint?: string;
  tileSizeDegrees?: number;
  bufferDegrees?: number;
  requestDelayMs?: number;
  requestTimeoutMs?: number;
  onProgress?: (message: string) => void;
}

export interface GenerateOsmAreasOptions {
  territoryId: string;
  minimumAreaSquareMeters?: number;
  maximumHighConfidenceAreaSquareMeters?: number;
}

function componentFeature(
  component: ParsedTerritoryComponent,
): Feature<Polygon | MultiPolygon> {
  if (component.polygons.length === 1)
    return polygon([
      component.polygons[0].outer,
      ...component.polygons[0].holes,
    ]);
  return multiPolygon(
    component.polygons.map((item) => [item.outer, ...item.holes]),
  );
}

function tilesForComponent(
  component: ParsedTerritoryComponent,
  tileSize: number,
  buffer: number,
): Array<[number, number, number, number]> {
  const [west, south, east, north] = bbox(componentFeature(component));
  const startWest = west - buffer;
  const startSouth = south - buffer;
  const endEast = east + buffer;
  const endNorth = north + buffer;
  const tiles: Array<[number, number, number, number]> = [];
  for (
    let tileSouth = startSouth;
    tileSouth < endNorth;
    tileSouth += tileSize
  ) {
    for (let tileWest = startWest; tileWest < endEast; tileWest += tileSize) {
      tiles.push([
        tileSouth,
        tileWest,
        Math.min(tileSouth + tileSize, endNorth),
        Math.min(tileWest + tileSize, endEast),
      ]);
    }
  }
  return tiles;
}

function tileKey(tile: [number, number, number, number]): string {
  return createHash("sha256")
    .update(tile.map((value) => value.toFixed(6)).join(","))
    .digest("hex")
    .slice(0, 16);
}

function osmTiles(
  components: ParsedTerritoryComponent[],
  tileSize: number,
  buffer: number,
): Map<string, [number, number, number, number]> {
  const tiles = new Map<string, [number, number, number, number]>();
  for (const component of components)
    for (const tile of tilesForComponent(component, tileSize, buffer))
      tiles.set(tileKey(tile), tile);
  return tiles;
}

export function estimateOsmDownload(
  components: ParsedTerritoryComponent[],
  tileSizeDegrees = 0.04,
  bufferDegrees = 0.01,
): { tiles: number } {
  return {
    tiles: osmTiles(components, tileSizeDegrees, bufferDegrees).size,
  };
}

function overpassQuery([south, west, north, east]: [
  number,
  number,
  number,
  number,
]): string {
  return `[out:json][timeout:60];way["highway"~"^(${BLOCK_FORMING_HIGHWAYS})$"](${south},${west},${north},${east});out geom;`;
}

function mergeResponse(
  network: OsmRoadNetwork,
  response: OverpassResponse,
): void {
  for (const element of response.elements) {
    if (element.type === "node") {
      const node = element as OsmNode;
      if (Number.isFinite(node.lon) && Number.isFinite(node.lat))
        network.nodes.set(node.id, [node.lon, node.lat]);
    } else if (element.type === "way") {
      const way = element as OsmWay;
      if (
        (Array.isArray(way.nodes) && way.nodes.length >= 2) ||
        (Array.isArray(way.geometry) && way.geometry.length >= 2)
      )
        network.ways.set(way.id, way);
    }
  }
}

export async function downloadOsmRoadNetwork(
  components: ParsedTerritoryComponent[],
  options: DownloadOsmOptions,
): Promise<OsmRoadNetwork> {
  const fetcher = options.fetcher ?? fetch;
  const endpoints = options.endpoint
    ? [options.endpoint]
    : [...DEFAULT_OVERPASS_ENDPOINTS];
  const tileSize = options.tileSizeDegrees ?? 0.04;
  const buffer = options.bufferDegrees ?? 0.01;
  const requestDelayMs = options.requestDelayMs ?? 750;
  const requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
  const cacheDirectory = resolve(options.cacheDirectory);
  mkdirSync(cacheDirectory, { recursive: true });
  const tiles = osmTiles(components, tileSize, buffer);

  const network: OsmRoadNetwork = { nodes: new Map(), ways: new Map() };
  const rateLimitedEndpoints = new Set<string>();
  const splitTile = ([south, west, north, east]: [
    number,
    number,
    number,
    number,
  ]): Array<[number, number, number, number]> => {
    const middleLatitude = (south + north) / 2;
    const middleLongitude = (west + east) / 2;
    return [
      [south, west, middleLatitude, middleLongitude],
      [south, middleLongitude, middleLatitude, east],
      [middleLatitude, west, north, middleLongitude],
      [middleLatitude, middleLongitude, north, east],
    ];
  };

  const downloadTile = async (
    tile: [number, number, number, number],
    label: string,
    depth = 0,
  ): Promise<OverpassResponse> => {
    const cachePath = join(
      cacheDirectory,
      `osm-roads-${tileKey(tile)}.json`,
    );
    if (existsSync(cachePath)) {
      options.onProgress?.(`OSM ${label}: cache local`);
      return JSON.parse(readFileSync(cachePath, "utf8")) as OverpassResponse;
    }

    const failures: string[] = [];
    const childTiles = depth < 2 ? splitTile(tile) : [];
    const resumingSubdivision = childTiles.some((child) =>
      existsSync(join(cacheDirectory, `osm-roads-${tileKey(child)}.json`)),
    );
    if (!resumingSubdivision) {
      for (const endpoint of endpoints.filter(
        (candidate) => !rateLimitedEndpoints.has(candidate),
      )) {
        const server = new URL(endpoint).hostname;
        options.onProgress?.(`OSM ${label}: baixando ruas via ${server}`);
        try {
          const request = await fetcher(endpoint, {
            method: "POST",
            headers: {
              "content-type":
                "application/x-www-form-urlencoded;charset=UTF-8",
              "user-agent": "TerritoryInstaller/0.1",
            },
            body: new URLSearchParams({ data: overpassQuery(tile) }),
            signal: AbortSignal.timeout(requestTimeoutMs),
          });
          if (!request.ok) {
            failures.push(`${server}: HTTP ${request.status}`);
            if (request.status === 429) rateLimitedEndpoints.add(endpoint);
            continue;
          }
          const response = (await request.json()) as OverpassResponse;
          writeFileSync(cachePath, JSON.stringify(response));
          if (requestDelayMs > 0)
            await new Promise((resolveDelay) =>
              setTimeout(resolveDelay, requestDelayMs),
            );
          return response;
        } catch (error) {
          failures.push(
            `${server}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    if (depth >= 2)
      throw new Error(
        `Nenhum servidor Overpass respondeu ao bloco ${label} (${failures.join("; ")}). Tente novamente; os blocos já baixados ficaram no cache.`,
      );
    options.onProgress?.(`OSM ${label}: subdividindo consulta pesada`);
    const parts: OverpassResponse[] = [];
    let partIndex = 0;
    for (const child of childTiles) {
      partIndex += 1;
      parts.push(await downloadTile(child, `${label}.${partIndex}`, depth + 1));
    }
    const combined = { elements: parts.flatMap((part) => part.elements) };
    writeFileSync(cachePath, JSON.stringify(combined));
    return combined;
  };

  let current = 0;
  for (const tile of tiles.values()) {
    current += 1;
    const response = await downloadTile(tile, `${current}/${tiles.size}`);
    mergeResponse(network, response);
  }
  return network;
}

function roadLines(network: OsmRoadNetwork) {
  return featureCollection(
    [...network.ways.values()].flatMap((way) => {
      const coordinates =
        way.geometry && way.geometry.length >= 2
          ? way.geometry.map(
              (position) => [position.lon, position.lat] as Position,
            )
          : (way.nodes ?? [])
              .map((nodeId) => network.nodes.get(nodeId))
              .filter((position): position is Position => Boolean(position));
      return coordinates.length >= 2
        ? [lineString(coordinates, { osmWayId: way.id })]
        : [];
    }),
  );
}

function polygonParts(
  feature: Feature<Polygon | MultiPolygon>,
): Position[][][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as Position[][]]
    : (feature.geometry.coordinates as Position[][][]);
}

export function generateWorkAreasFromOsm(
  components: ParsedTerritoryComponent[],
  network: OsmRoadNetwork,
  options: GenerateOsmAreasOptions,
): PreparedWorkArea[] {
  const lines = roadLines(network);
  if (lines.features.length === 0) return [];
  const candidates = polygonize(lines);
  const minimumArea = options.minimumAreaSquareMeters ?? 300;
  const maximumHighConfidenceArea =
    options.maximumHighConfidenceAreaSquareMeters ?? 250_000;
  const result: PreparedWorkArea[] = [];

  components.forEach((component, componentIndex) => {
    const scope = componentFeature(component);
    let sequence = 0;
    for (const candidate of candidates.features) {
      const clipped = intersect(featureCollection([candidate, scope]));
      if (!clipped) continue;
      for (const coordinates of polygonParts(clipped)) {
        const geometry = polygon(coordinates);
        const squareMeters = area(geometry);
        if (squareMeters < minimumArea) continue;
        sequence += 1;
        const purposePrefix =
          component.purpose === "language-census" ? "C" : "Q";
        const confidence =
          squareMeters <= maximumHighConfidenceArea
            ? "high"
            : squareMeters <= maximumHighConfidenceArea * 3
              ? "medium"
              : "low";
        result.push({
          id: `${purposePrefix}${componentIndex + 1}-${sequence}`,
          territoryId: options.territoryId,
          type:
            component.environment === "rural" ? "rural-area" : "urban-block",
          purpose: component.purpose,
          source: "osm-generated",
          reviewStatus: "suggested",
          confidence,
          geometry: {
            type: "Polygon",
            coordinates: geometry.geometry.coordinates as Position[][],
          },
          properties: {
            kind: "work-area",
            componentName: component.name,
            componentType: component.sourceType,
            areaSquareMeters: Math.round(squareMeters),
          },
        });
      }
    }
  });
  return result;
}

export function workAreasToGeoJson(workAreas: PreparedWorkArea[]) {
  return featureCollection(
    workAreas.map((area) =>
      polygon(area.geometry.coordinates, {
        ...area.properties,
        id: area.id,
        territoryId: area.territoryId,
        kind: "work-area",
        areaType: area.type,
        purpose: area.purpose,
        source: area.source,
        reviewStatus: area.reviewStatus,
        confidence: area.confidence,
      }),
    ),
  );
}

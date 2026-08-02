import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { decodeCnefeBuffer, transformCnefeCsv } from "./cnefe";
import { groupNormalizedAddresses } from "./group";
import {
  parseKmlComponents,
  parseKmlTerritory,
  pointInTerritory,
  territoryToGeoJson,
} from "./kml";
import { assignLocalsToWorkAreas, parseInstallerAreasGeoJson } from "./areas";
import { calculateArtifactHashes } from "./integrity";
import {
  INSTALLER_PACKAGE_VERSION,
  CNEFE_SCHEMA_VERSION,
  type InstallerConfig,
  type InstallerManifest,
  type NormalizedCnefeAddress,
  type PreparedTerritory,
} from "./types";

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function fallbackTerritory(
  config: InstallerConfig,
  parsed: ReturnType<typeof territoryToGeoJson>,
): PreparedTerritory {
  const coordinates =
    parsed.geometry.type === "Polygon"
      ? [parsed.geometry.coordinates]
      : parsed.geometry.coordinates;
  return {
    id: config.territory.id,
    name: config.territory.name,
    color: config.territory.color ?? "#3388ff",
    geometry: { type: "MultiPolygon", coordinates },
    labelPosition: null,
    labelType: "center",
  };
}

function classificationReview(
  locals: ReturnType<typeof groupNormalizedAddresses>,
) {
  const mixedSpecies = [];
  const largeGroups = [];
  for (const local of locals) {
    const species = local.units.reduce<Record<string, number>>(
      (counts, unit) => {
        const code = unit.raw.COD_ESPECIE ?? "";
        if (code) counts[code] = (counts[code] ?? 0) + 1;
        return counts;
      },
      {},
    );
    if (Object.keys(species).length > 1)
      mixedSpecies.push({
        localId: local.sourceId,
        suggestedType: local.type,
        units: local.units.length,
        species,
      });
    if (local.units.length > 100)
      largeGroups.push({
        localId: local.sourceId,
        suggestedType: local.type,
        units: local.units.length,
      });
  }
  return { mixedSpecies, largeGroups };
}

export interface PreparePackageInput {
  config: InstallerConfig;
  kmlPath: string;
  cnefePaths: string[];
  outputDirectory: string;
  areasPath?: string;
}

export function prepareInstallerPackage(
  input: PreparePackageInput,
): InstallerManifest {
  if (input.cnefePaths.length === 0)
    throw new Error("Informe ao menos um CSV CNEFE.");
  const outputDirectory = resolve(input.outputDirectory);
  mkdirSync(outputDirectory, { recursive: true });

  const kmlBuffer = readFileSync(input.kmlPath);
  const territory = parseKmlTerritory(kmlBuffer.toString("utf8"), {
    mode: input.config.congregation.mode,
  });
  const areaScope = {
    name: territory.name,
    polygons: parseKmlComponents(kmlBuffer.toString("utf8"))
      .filter((component) => !component.special)
      .flatMap((component) => component.polygons),
  };
  const inputHashes: Record<string, string> = {
    [basename(input.kmlPath)]: sha256(kmlBuffer),
  };
  const seenFiles = new Set<string>();
  const seenRecords = new Set<string>();
  const inside: NormalizedCnefeAddress[] = [];
  const outside: NormalizedCnefeAddress[] = [];
  const outsideSampleLimit = Math.max(
    0,
    Math.trunc(input.config.cnefe.outsideSampleLimit ?? 100),
  );
  const rejected: unknown[] = [];
  const reports: unknown[] = [];
  let duplicateRows = 0;
  let inputRows = 0;
  let outsideRows = 0;

  for (const csvPath of input.cnefePaths) {
    const buffer = readFileSync(csvPath);
    const hash = sha256(buffer);
    if (seenFiles.has(hash))
      throw new Error(`Arquivo CNEFE duplicado: ${basename(csvPath)}`);
    seenFiles.add(hash);
    inputHashes[basename(csvPath)] = hash;
    const result = transformCnefeCsv(
      decodeCnefeBuffer(buffer, input.config.cnefe.encoding),
      basename(csvPath),
      input.config.cnefe,
      {
        retainRecord: (record) => {
          const identity = `${record.sourceEdition}:${record.recordId}`;
          if (seenRecords.has(identity)) {
            duplicateRows += 1;
            return false;
          }
          seenRecords.add(identity);
          if (
            pointInTerritory(
              [record.longitude, record.latitude],
              territory,
              true,
            )
          )
            return true;
          outsideRows += 1;
          if (outside.length < outsideSampleLimit) outside.push(record);
          return false;
        },
      },
    );
    inputRows += result.report.totalRows;
    for (const item of result.rejected) rejected.push(item);
    reports.push(result.report);
    for (const record of result.records) inside.push(record);
  }

  const localGroups = groupNormalizedAddresses(inside);
  const scopeGeoJson = territoryToGeoJson(territory);
  let workAreas = [] as ReturnType<
    typeof parseInstallerAreasGeoJson
  >["workAreas"];
  let territories: PreparedTerritory[] = [];
  if (input.areasPath) {
    const areasBuffer = readFileSync(input.areasPath);
    const structure = parseInstallerAreasGeoJson(
      areasBuffer.toString("utf8"),
      areaScope,
      input.config.territory.id,
      input.config.territory.areaBoundaryToleranceMeters ?? 0,
    );
    workAreas = structure.workAreas;
    territories = structure.territories;
    inputHashes[basename(input.areasPath)] = sha256(areasBuffer);
  }
  if (territories.length === 0)
    territories = [fallbackTerritory(input.config, scopeGeoJson)];
  const workAreaAssignment = assignLocalsToWorkAreas(localGroups, workAreas);
  const classifications = classificationReview(localGroups);

  writeFileSync(
    join(outputDirectory, "territorio.geojson"),
    JSON.stringify(scopeGeoJson, null, 2),
  );
  writeFileSync(
    join(outputDirectory, "enderecos.json"),
    JSON.stringify(inside, null, 2),
  );
  writeFileSync(
    join(outputDirectory, "locais.json"),
    JSON.stringify(localGroups, null, 2),
  );
  writeFileSync(
    join(outputDirectory, "territorios.json"),
    JSON.stringify(territories, null, 2),
  );
  writeFileSync(
    join(outputDirectory, "areas-trabalho.json"),
    JSON.stringify(workAreas, null, 2),
  );
  writeFileSync(
    join(outputDirectory, "enderecos-fora.json"),
    JSON.stringify(outside, null, 2),
  );
  writeFileSync(
    join(outputDirectory, "pendencias.json"),
    JSON.stringify(
      {
        rejected,
        reports,
        outsideTerritory: {
          total: outsideRows,
          sampleSize: outside.length,
          sampleLimit: outsideSampleLimit,
        },
        workAreaAssignment,
        classificationReview: classifications,
      },
      null,
      2,
    ),
  );

  const manifest: InstallerManifest = {
    packageVersion: INSTALLER_PACKAGE_VERSION,
    transformerVersion: CNEFE_SCHEMA_VERSION,
    inputHashes,
    artifactHashes: calculateArtifactHashes(outputDirectory),
    configuration: input.config,
    counts: {
      inputRows,
      normalizedRows: inside.length + outsideRows,
      insideTerritory: inside.length,
      outsideTerritory: outsideRows,
      rejectedRows: rejected.length,
      duplicateRows,
      localGroups: localGroups.length,
      units: localGroups.reduce(
        (total, local) => total + local.units.length,
        0,
      ),
      territories: territories.length,
      workAreas: workAreas.length,
      assignedLocals: workAreaAssignment.assigned,
      unassignedLocals: workAreaAssignment.unassigned,
      ambiguousLocals: workAreaAssignment.ambiguous,
    },
    approved: false,
  };

  writeFileSync(
    join(outputDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
}

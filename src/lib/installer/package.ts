import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { transformCnefeCsv } from './cnefe';
import { groupNormalizedAddresses } from './group';
import { parseKmlTerritory, pointInTerritory, territoryToGeoJson } from './kml';
import { parseWorkAreasGeoJson } from './areas';
import {
  INSTALLER_PACKAGE_VERSION,
  CNEFE_SCHEMA_VERSION,
  type InstallerConfig,
  type InstallerManifest,
  type NormalizedCnefeAddress
} from './types';

function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface PreparePackageInput {
  config: InstallerConfig;
  kmlPath: string;
  cnefePaths: string[];
  outputDirectory: string;
  areasPath?: string;
}

export function prepareInstallerPackage(input: PreparePackageInput): InstallerManifest {
  if (input.cnefePaths.length === 0) throw new Error('Informe ao menos um CSV CNEFE.');
  const outputDirectory = resolve(input.outputDirectory);
  mkdirSync(outputDirectory, { recursive: true });

  const kmlBuffer = readFileSync(input.kmlPath);
  const territory = parseKmlTerritory(kmlBuffer.toString('utf8'));
  const inputHashes: Record<string, string> = { [basename(input.kmlPath)]: sha256(kmlBuffer) };
  const seenFiles = new Set<string>();
  const seenRecords = new Set<string>();
  const normalized: NormalizedCnefeAddress[] = [];
  const rejected: unknown[] = [];
  const reports: unknown[] = [];
  let duplicateRows = 0;
  let inputRows = 0;

  for (const csvPath of input.cnefePaths) {
    const buffer = readFileSync(csvPath);
    const hash = sha256(buffer);
    if (seenFiles.has(hash)) throw new Error(`Arquivo CNEFE duplicado: ${basename(csvPath)}`);
    seenFiles.add(hash);
    inputHashes[basename(csvPath)] = hash;
    const result = transformCnefeCsv(buffer.toString('utf8'), basename(csvPath), input.config.cnefe);
    inputRows += result.report.totalRows;
    rejected.push(...result.rejected);
    reports.push(result.report);
    for (const record of result.records) {
      const identity = `${record.sourceEdition}:${record.sourceId}`;
      if (seenRecords.has(identity)) {
        duplicateRows += 1;
        continue;
      }
      seenRecords.add(identity);
      normalized.push(record);
    }
  }

  const inside = normalized.filter((record) =>
    pointInTerritory([record.longitude, record.latitude], territory, true)
  );
  const outside = normalized.filter((record) =>
    !pointInTerritory([record.longitude, record.latitude], territory, true)
  );
  const localGroups = groupNormalizedAddresses(inside);
  const workAreas = input.areasPath
    ? parseWorkAreasGeoJson(readFileSync(input.areasPath, 'utf8'), territory)
    : [];
  if (input.areasPath) inputHashes[basename(input.areasPath)] = sha256(readFileSync(input.areasPath));

  const manifest: InstallerManifest = {
    packageVersion: INSTALLER_PACKAGE_VERSION,
    transformerVersion: CNEFE_SCHEMA_VERSION,
    inputHashes,
    configuration: input.config,
    counts: {
      inputRows,
      normalizedRows: normalized.length,
      insideTerritory: inside.length,
      outsideTerritory: outside.length,
      rejectedRows: rejected.length,
      duplicateRows,
      localGroups: localGroups.length,
      units: localGroups.reduce((total, local) => total + local.units.length, 0),
      workAreas: workAreas.length
    },
    approved: false
  };

  writeFileSync(join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(outputDirectory, 'territorio.geojson'), JSON.stringify(territoryToGeoJson(territory), null, 2));
  writeFileSync(join(outputDirectory, 'enderecos.json'), JSON.stringify(inside, null, 2));
  writeFileSync(join(outputDirectory, 'locais.json'), JSON.stringify(localGroups, null, 2));
  writeFileSync(join(outputDirectory, 'areas-trabalho.json'), JSON.stringify(workAreas, null, 2));
  writeFileSync(join(outputDirectory, 'enderecos-fora.json'), JSON.stringify(outside, null, 2));
  writeFileSync(join(outputDirectory, 'pendencias.json'), JSON.stringify({ rejected, reports }, null, 2));
  return manifest;
}

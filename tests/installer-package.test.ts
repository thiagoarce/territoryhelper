import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEq, assertTrue, test } from './harness';
import { prepareInstallerPackage } from '../src/lib/installer/package';
import type { InstallerConfig } from '../src/lib/installer/types';

const fixture = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'installer');

test('pacote intermediário é revisável e não nasce aprovado', () => {
  const output = mkdtempSync(join(tmpdir(), 'territory-installer-'));
  try {
    const config = JSON.parse(readFileSync(join(fixture, 'config.json'), 'utf8')) as InstallerConfig;
    const manifest = prepareInstallerPackage({
      config,
      kmlPath: join(fixture, 'territorio.kml'),
      cnefePaths: [join(fixture, 'cnefe.csv')],
      outputDirectory: output
    });
    assertEq(manifest.counts.insideTerritory, 2);
    assertEq(manifest.counts.outsideTerritory, 1);
    assertEq(manifest.counts.localGroups, 1);
    assertEq(manifest.counts.units, 2);
    assertEq(manifest.counts.workAreas, 0);
    assertEq(manifest.approved, false);
    assertTrue(existsSync(join(output, 'manifest.json')));
    assertTrue(existsSync(join(output, 'territorio.geojson')));
    assertTrue(existsSync(join(output, 'locais.json')));
    assertTrue(existsSync(join(output, 'areas-trabalho.json')));
    assertTrue(existsSync(join(output, 'pendencias.json')));
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

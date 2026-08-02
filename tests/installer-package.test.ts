import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertEq, assertTrue, test } from "./harness";
import {
  approveInstallerPackage,
  assertApprovedPackage,
  calculateArtifactHashes,
} from "../src/lib/installer/integrity";
import { prepareInstallerPackage } from "../src/lib/installer/package";
import {
  INSTALLER_ARTIFACT_FILES,
  type InstallerConfig,
  type InstallerManifest,
} from "../src/lib/installer/types";

const fixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "installer",
);

test("pacote intermediário é revisável e não nasce aprovado", () => {
  const output = mkdtempSync(join(tmpdir(), "territory-installer-"));
  try {
    const config = JSON.parse(
      readFileSync(join(fixture, "config.json"), "utf8"),
    ) as InstallerConfig;
    const manifest = prepareInstallerPackage({
      config,
      kmlPath: join(fixture, "territorio.kml"),
      cnefePaths: [join(fixture, "cnefe.csv")],
      outputDirectory: output,
    });
    assertEq(manifest.counts.insideTerritory, 2);
    assertEq(manifest.counts.outsideTerritory, 1);
    assertEq(manifest.counts.localGroups, 1);
    assertEq(manifest.counts.units, 2);
    assertEq(manifest.counts.territories, 1);
    assertEq(manifest.counts.workAreas, 0);
    assertEq(manifest.counts.assignedLocals, 0);
    assertEq(manifest.counts.unassignedLocals, 1);
    assertEq(manifest.counts.ambiguousLocals, 0);
    assertEq(manifest.approved, false);
    assertEq(manifest.artifactHashes, calculateArtifactHashes(output));
    assertEq(
      Object.keys(manifest.artifactHashes).sort(),
      [...INSTALLER_ARTIFACT_FILES].sort(),
    );
    assertTrue(existsSync(join(output, "manifest.json")));
    assertTrue(existsSync(join(output, "territorio.geojson")));
    assertTrue(existsSync(join(output, "locais.json")));
    assertTrue(existsSync(join(output, "territorios.json")));
    assertTrue(existsSync(join(output, "areas-trabalho.json")));
    assertTrue(existsSync(join(output, "pendencias.json")));
    assertEq(
      JSON.parse(readFileSync(join(output, "enderecos-fora.json"), "utf8"))
        .length,
      1,
    );
    const pending = JSON.parse(
      readFileSync(join(output, "pendencias.json"), "utf8"),
    );
    assertEq(pending.outsideTerritory, {
      total: 1,
      sampleSize: 1,
      sampleLimit: 100,
    });
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

function prepareFixturePackage(output: string): void {
  const config = JSON.parse(
    readFileSync(join(fixture, "config.json"), "utf8"),
  ) as InstallerConfig;
  prepareInstallerPackage({
    config,
    kmlPath: join(fixture, "territorio.kml"),
    cnefePaths: [join(fixture, "cnefe.csv")],
    outputDirectory: output,
  });
}

function expectError(action: () => void, expectedMessage: string): void {
  let message = "";
  try {
    action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assertTrue(
    message.includes(expectedMessage),
    `erro esperado contendo "${expectedMessage}", recebido "${message}"`,
  );
}

test("aprovação sela manifesto e artefatos revisados", () => {
  const output = mkdtempSync(join(tmpdir(), "territory-installer-"));
  try {
    prepareFixturePackage(output);
    const manifest = approveInstallerPackage(
      output,
      new Date("2026-08-01T12:00:00.000Z"),
    );
    assertEq(manifest.approved, true);
    assertEq(manifest.approvedAt, "2026-08-01T12:00:00.000Z");
    assertTrue(Boolean(manifest.approvalHash));
    assertApprovedPackage(output, manifest);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("arquivo alterado depois da preparação bloqueia aprovação", () => {
  const output = mkdtempSync(join(tmpdir(), "territory-installer-"));
  try {
    prepareFixturePackage(output);
    writeFileSync(join(output, "locais.json"), "[]");
    expectError(
      () => approveInstallerPackage(output),
      "locais.json mudou depois da preparação",
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("arquivo ou manifesto alterado depois da aprovação bloqueia publicação", () => {
  const output = mkdtempSync(join(tmpdir(), "territory-installer-"));
  try {
    prepareFixturePackage(output);
    const approved = approveInstallerPackage(
      output,
      new Date("2026-08-01T12:00:00.000Z"),
    );
    writeFileSync(join(output, "locais.json"), "[]");
    expectError(
      () => assertApprovedPackage(output, approved),
      "locais.json mudou depois da preparação",
    );

    prepareFixturePackage(output);
    approveInstallerPackage(output, new Date("2026-08-01T12:00:00.000Z"));
    const manifestPath = join(output, "manifest.json");
    const changed = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as InstallerManifest;
    changed.configuration.congregation.name = "Nome alterado";
    writeFileSync(manifestPath, JSON.stringify(changed, null, 2));
    expectError(
      () => assertApprovedPackage(output, changed),
      "manifesto mudou depois da aprovação",
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

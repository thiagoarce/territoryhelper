import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  INSTALLER_ARTIFACT_FILES,
  INSTALLER_PACKAGE_VERSION,
  type InstallerArtifactFile,
  type InstallerManifest,
} from "./types";

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function readManifest(directory: string): InstallerManifest {
  const manifestPath = join(directory, "manifest.json");
  if (!existsSync(manifestPath))
    throw new Error(`Manifesto não encontrado em ${manifestPath}.`);
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as InstallerManifest;
  } catch (error) {
    throw new Error(
      `O manifesto do pacote não é um JSON válido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function calculateArtifactHashes(
  packageDirectory: string,
): Record<InstallerArtifactFile, string> {
  const directory = resolve(packageDirectory);
  return Object.fromEntries(
    INSTALLER_ARTIFACT_FILES.map((file) => {
      const path = join(directory, file);
      if (!existsSync(path))
        throw new Error(
          `O pacote está incompleto: ${file} não foi encontrado.`,
        );
      return [file, sha256(readFileSync(path))];
    }),
  ) as Record<InstallerArtifactFile, string>;
}

export function calculateApprovalHash(manifest: InstallerManifest): string {
  const { approvalHash: _approvalHash, ...approvedPackage } = manifest;
  return sha256(JSON.stringify(canonicalize(approvedPackage)));
}

export function assertArtifactIntegrity(
  packageDirectory: string,
  manifest: InstallerManifest,
): void {
  if (manifest.packageVersion !== INSTALLER_PACKAGE_VERSION) {
    throw new Error(
      `Versão de pacote incompatível (${String(manifest.packageVersion)}). Execute prepare novamente com o Installer ${INSTALLER_PACKAGE_VERSION}.`,
    );
  }
  if (!manifest.artifactHashes) {
    throw new Error(
      "O manifesto não contém hashes dos artefatos. Execute prepare novamente e revise o novo pacote.",
    );
  }

  const actualHashes = calculateArtifactHashes(packageDirectory);
  for (const file of INSTALLER_ARTIFACT_FILES) {
    const expected = manifest.artifactHashes[file];
    if (!expected || actualHashes[file] !== expected) {
      throw new Error(
        `O arquivo ${file} mudou depois da preparação. Execute prepare novamente e repita a revisão.`,
      );
    }
  }
}

export function assertApprovedPackage(
  packageDirectory: string,
  manifest: InstallerManifest,
): void {
  if (!manifest.approved || !manifest.approvedAt || !manifest.approvalHash) {
    throw new Error(
      "O pacote ainda não foi aprovado. Execute o comando approve após revisar os arquivos.",
    );
  }
  if (calculateApprovalHash(manifest) !== manifest.approvalHash) {
    throw new Error(
      "O manifesto mudou depois da aprovação. Revise o pacote e execute approve novamente.",
    );
  }
  assertArtifactIntegrity(packageDirectory, manifest);
}

export function approveInstallerPackage(
  packageDirectory: string,
  approvedAt = new Date(),
): InstallerManifest {
  const directory = resolve(packageDirectory);
  const manifest = readManifest(directory);
  assertArtifactIntegrity(directory, manifest);

  const approvedManifest: InstallerManifest = {
    ...manifest,
    approved: true,
    approvedAt: approvedAt.toISOString(),
    approvalHash: undefined,
  };
  approvedManifest.approvalHash = calculateApprovalHash(approvedManifest);
  writeFileSync(
    join(directory, "manifest.json"),
    JSON.stringify(approvedManifest, null, 2),
  );
  return approvedManifest;
}

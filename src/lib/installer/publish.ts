import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertApprovedPackage } from "./integrity";
import type {
  InstallerManifest,
  PreparedLocal,
  PreparedTerritory,
  PreparedWorkArea,
} from "./types";

const BATCH_SIZE = 500;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function chunks<T>(items: T[], size = BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

async function requireSuccess<T>(
  request: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  context: string,
): Promise<T | null> {
  const { data, error } = await request;
  if (error) throw new Error(`${context}: ${error.message}`);
  return data;
}

async function publishLocals(
  client: SupabaseClient,
  locals: PreparedLocal[],
  edition: string,
): Promise<void> {
  for (const batch of chunks(locals)) {
    await requireSuccess(
      client.from("locais").upsert(
        batch.map((local) => ({
          tipo: local.type,
          logradouro: local.street,
          numero: [local.number, local.numberModifier]
            .filter(Boolean)
            .join(" "),
          geo: {
            type: "Point",
            coordinates: [local.longitude, local.latitude],
          },
          setor: local.censusSector,
          quadra_ibge: local.censusBlock,
          face_ibge: local.censusFace,
          quadra_id: local.workAreaId,
          pendente: true,
          origem: `IBGE_CNEFE_${edition}`,
          origem_id: local.sourceId,
          origem_edicao: edition,
          origem_raw: { unitCount: local.units.length },
        })),
        { onConflict: "origem,origem_id" },
      ),
      "Não foi possível publicar os locais",
    );
  }

  const sourceIds = locals.map((local) => local.sourceId);
  const localIdBySource = new Map<string, number>();
  for (const batch of chunks(sourceIds, 200)) {
    const rows = await requireSuccess(
      client.from("locais").select("id,origem_id").in("origem_id", batch),
      "Não foi possível reconciliar os locais",
    );
    for (const row of (rows ?? []) as Array<{ id: number; origem_id: string }>)
      localIdBySource.set(row.origem_id, row.id);
  }

  const units = locals.flatMap((local) =>
    local.units.map((unit, index) => ({
      local_id: localIdBySource.get(local.sourceId),
      complemento: unit.complement,
      ordem: index + 1,
      origem: `IBGE_CNEFE_${edition}`,
      origem_id: unit.sourceId,
      origem_raw: unit.raw,
    })),
  );
  if (units.some((unit) => unit.local_id == null))
    throw new Error(
      "A publicação não conseguiu associar todas as unidades aos locais.",
    );
  for (const batch of chunks(units)) {
    await requireSuccess(
      client.from("unidades").upsert(batch, { onConflict: "origem,origem_id" }),
      "Não foi possível publicar as unidades",
    );
  }
}

export interface PublishPackageInput {
  packageDirectory: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}

export async function publishInstallerPackage(
  input: PublishPackageInput,
): Promise<InstallerManifest> {
  const directory = resolve(input.packageDirectory);
  const manifestText = readFileSync(join(directory, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText) as InstallerManifest;
  assertApprovedPackage(directory, manifest);

  const client = createClient(input.supabaseUrl, input.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const manifestHash = hash(manifestText);
  const existing = await requireSuccess(
    client
      .from("import_runs")
      .select("status")
      .eq("manifest_hash", manifestHash)
      .maybeSingle(),
    "Não foi possível verificar importações anteriores",
  );
  if ((existing as { status?: string } | null)?.status === "published")
    return manifest;

  await requireSuccess(
    client.from("import_runs").upsert(
      {
        package_version: manifest.packageVersion,
        manifest_hash: manifestHash,
        input_hashes: manifest.inputHashes,
        status: "publishing",
        report: { counts: manifest.counts },
      },
      { onConflict: "manifest_hash" },
    ),
    "Não foi possível iniciar a importação",
  );

  try {
    const locals = readJson<PreparedLocal[]>(join(directory, "locais.json"));
    const territories = readJson<PreparedTerritory[]>(
      join(directory, "territorios.json"),
    );
    const workAreas = readJson<PreparedWorkArea[]>(
      join(directory, "areas-trabalho.json"),
    );
    const territoryById = new Map(
      territories.map((territory) => [territory.id, territory]),
    );
    await requireSuccess(
      client.from("installation_config").upsert(
        {
          singleton: true,
          congregation_name: manifest.configuration.congregation.name,
          timezone: manifest.configuration.congregation.timezone,
          operation_mode: manifest.configuration.congregation.mode,
          modules: {
            installerPilot: true,
            campaigns: false,
            publicWitnessing: false,
            publications: false,
          },
        },
        { onConflict: "singleton" },
      ),
      "Não foi possível salvar a configuração da congregação",
    );
    for (const batch of chunks(territories)) {
      await requireSuccess(
        client.from("territorios").upsert(
          batch.map((territory) => ({
            id: territory.id,
            nome: territory.name,
            cor: territory.color,
            label_pos: territory.labelPosition,
            label_type: territory.labelType,
          })),
          { onConflict: "id" },
        ),
        "Não foi possível publicar os territórios",
      );
      await requireSuccess(
        client.from("territorio_limites").upsert(
          batch.map((territory) => ({
            territorio_id: territory.id,
            geometria: territory.geometry,
            source_hash: Object.values(manifest.inputHashes)[0],
          })),
          { onConflict: "territorio_id" },
        ),
        "Não foi possível publicar os limites territoriais",
      );
    }
    for (const batch of chunks(workAreas)) {
      await requireSuccess(
        client.from("quadras").upsert(
          batch.map((area) => {
            const importedName = area.properties.nome ?? area.properties.name;
            return {
              id: area.id,
              poly: area.geometry,
              color: String(
                area.properties.color ??
                  area.properties.cor ??
                  territoryById.get(area.territoryId)?.color ??
                  "#3388ff",
              ),
              territorio_id: area.territoryId,
              tipo_area: area.type ?? "urban-block",
              finalidade: area.purpose ?? "regular-preaching",
              origem_geografica: area.source ?? "imported",
              revisao_status: area.reviewStatus ?? "approved",
              confianca: area.confidence ?? "high",
              ativa: (area.reviewStatus ?? "approved") === "approved",
              notas: importedName
                ? `Importado como ${String(importedName)}`
                : null,
            };
          }),
          { onConflict: "id" },
        ),
        "Não foi possível publicar as áreas de trabalho",
      );
    }
    await publishLocals(client, locals, manifest.configuration.cnefe.edition);
    await requireSuccess(
      client
        .from("import_runs")
        .update({
          status: "published",
          finished_at: new Date().toISOString(),
          report: { counts: manifest.counts },
        })
        .eq("manifest_hash", manifestHash),
      "Não foi possível concluir o relatório da importação",
    );
    writeFileSync(
      join(directory, "relatorio-instalacao.json"),
      JSON.stringify(
        {
          congregation: manifest.configuration.congregation,
          territories: territories.map((territory) => territory.id),
          baselineVersion: "1.0.0",
          packageVersion: manifest.packageVersion,
          manifestHash,
          counts: manifest.counts,
          publishedAt: new Date().toISOString(),
          pendingReview:
            readJson<{ rejected?: unknown[] }>(
              join(directory, "pendencias.json"),
            ).rejected?.length ?? manifest.counts.rejectedRows,
        },
        null,
        2,
      ),
    );
    return manifest;
  } catch (error) {
    await client
      .from("import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        report: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
      .eq("manifest_hash", manifestHash);
    throw error;
  }
}

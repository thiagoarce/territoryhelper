import "dotenv/config";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import postgres from "postgres";
import {
  createCloudflareDeploymentCommands,
  createTemporarySecretsFile,
  findDeploymentUrl,
  runDeploymentCommand,
} from "../src/lib/installer/cloudflare-deploy";
import {
  discoverCnefeMunicipalities,
  downloadCnefeMunicipalities,
  type DiscoveredCnefeMunicipality,
} from "../src/lib/installer/cnefe-download";
import { approveInstallerPackage } from "../src/lib/installer/integrity";
import {
  loadInfrastructureState,
  recordInfrastructureDeployment,
  runInfrastructurePreflight,
  saveInfrastructureArtifacts,
  verifyCloudflareToken,
  type InfrastructureCredentials,
} from "../src/lib/installer/infrastructure";
import {
  parseKmlComponents,
  parseKmlTerritory,
} from "../src/lib/installer/kml";
import {
  downloadOsmRoadNetwork,
  estimateOsmDownload,
  generateWorkAreasFromOsm,
  workAreasToGeoJson,
} from "../src/lib/installer/osm-work-areas";
import { prepareInstallerPackage } from "../src/lib/installer/package";
import { publishInstallerPackage } from "../src/lib/installer/publish";
import type { InstallerConfig } from "../src/lib/installer/types";

function option(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function options(name: string): string[] {
  const values: string[] = [];
  process.argv.forEach((argument, index) => {
    if (argument === `--${name}` && process.argv[index + 1])
      values.push(process.argv[index + 1]);
  });
  return values;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function help(): void {
  console.log(`Territory Installer — piloto guiado

Comandos:
  npm run installer -- check
  npm run installer -- configure --worker-name territorios-congregacao
  npm run installer -- discover --kml territorio.kml [--download --directory cnefe-cache --confirm]
  npm run installer -- generate-areas --config installer.config.json --kml territorio.kml --output areas-sugeridas.geojson --confirm-download
  npm run installer -- prepare --config installer.config.json --kml territorio.kml --cnefe municipio.csv [--cnefe outro.csv] [--areas quadras.geojson] --output installer-output
  npm run installer -- prepare --config installer.config.json --kml territorio.kml --auto-cnefe --cnefe-dir cnefe-cache --confirm-download [--areas quadras.geojson] --output installer-output
  npm run installer -- approve --package installer-output --confirm
  npm run installer -- baseline --confirm
  npm run installer -- admin --email usuario@exemplo.com --confirm
  npm run installer -- publish --package installer-output --confirm
  npm run installer -- deploy --confirm

O comando prepare nunca escreve no Supabase. Revise manifest.json, territorio.geojson,
enderecos.json, locais.json e pendencias.json antes de aprovar e publicar.

O comando configure lê credenciais apenas do .env/ambiente, valida Supabase e Cloudflare
e grava artefatos locais ignorados pelo Git em .territory-installer/.`);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "tamanho não informado";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function showDiscovery(municipalities: DiscoveredCnefeMunicipality[]): void {
  console.log(`✓ ${municipalities.length} município(s) encontrado(s):`);
  for (const municipality of municipalities)
    console.log(
      `  ${municipality.code} — ${municipality.name}/${municipality.stateAbbreviation} (${formatBytes(municipality.compressedBytes)})`,
    );
}

async function discoverFromKml(
  kmlPath: string,
): Promise<DiscoveredCnefeMunicipality[]> {
  if (!existsSync(kmlPath))
    throw new Error(`Arquivo não encontrado: ${kmlPath}`);
  const territory = parseKmlTerritory(readFileSync(kmlPath, "utf8"));
  return await discoverCnefeMunicipalities(territory);
}

async function discover(): Promise<number> {
  const kmlPath = option("kml");
  if (!kmlPath) {
    console.error("Use --kml para informar o território.");
    return 1;
  }
  const municipalities = await discoverFromKml(kmlPath);
  showDiscovery(municipalities);
  if (!has("download")) return 0;
  if (!has("confirm")) {
    console.error(
      "A descoberta não baixou arquivos. Execute novamente com --download --confirm.",
    );
    return 2;
  }
  const directory = option("directory") ?? "cnefe-cache";
  const downloaded = await downloadCnefeMunicipalities(
    municipalities,
    directory,
    fetch,
    (message) => console.log(`→ ${message}`),
  );
  for (const item of downloaded)
    console.log(
      `  ${item.status === "cached" ? "cache" : "baixado"}: ${item.csvPath} (SHA-256 ${item.csvSha256})`,
    );
  return 0;
}

async function generateAreas(): Promise<number> {
  const configPath = option("config");
  const kmlPath = option("kml");
  const outputPath = option("output") ?? "areas-sugeridas.geojson";
  if (!configPath || !kmlPath)
    throw new Error("Use --config e --kml para gerar as áreas.");
  if (!existsSync(configPath) || !existsSync(kmlPath))
    throw new Error("Configuração ou KML não encontrado.");

  const requestedPurpose = option("purpose");
  if (
    requestedPurpose &&
    requestedPurpose !== "regular-preaching" &&
    requestedPurpose !== "language-census"
  )
    throw new Error(
      "--purpose precisa ser regular-preaching ou language-census.",
    );
  const components = parseKmlComponents(readFileSync(kmlPath, "utf8")).filter(
    (component) =>
      !component.special &&
      (!requestedPurpose || component.purpose === requestedPurpose),
  );
  if (components.length === 0)
    throw new Error(
      "O KML não contém componentes compatíveis para gerar áreas.",
    );

  console.log(
    `✓ ${components.length} componente(s) geográfico(s) identificado(s):`,
  );
  for (const component of components)
    console.log(
      `  ${component.name ?? "sem nome"} — ${component.environment}, ${component.purpose}`,
    );
  const estimate = estimateOsmDownload(components);
  console.log(
    `  Consulta estimada: ${estimate.tiles} bloco(s) do OpenStreetMap.`,
  );
  if (!has("confirm-download")) {
    console.error(
      "A geração consulta as ruas do OpenStreetMap. Revise a lista e execute novamente com --confirm-download.",
    );
    return 2;
  }

  const config = loadConfig(configPath);
  const network = await downloadOsmRoadNetwork(components, {
    cacheDirectory: option("osm-cache") ?? "osm-cache",
    onProgress: (message) => console.log(`→ ${message}`),
  });
  console.log(
    `✓ Rede viária reunida: ${network.ways.size} vias e ${network.nodes.size} nós.`,
  );
  const areas = generateWorkAreasFromOsm(components, network, {
    territoryId: config.territory.id,
  });
  writeFileSync(outputPath, JSON.stringify(workAreasToGeoJson(areas), null, 2));
  const byPurpose = areas.reduce<Record<string, number>>((counts, area) => {
    counts[area.purpose] = (counts[area.purpose] ?? 0) + 1;
    return counts;
  }, {});
  console.log(
    `✓ ${areas.length} área(s) sugerida(s) em ${resolve(outputPath)}.`,
  );
  for (const [purpose, count] of Object.entries(byPurpose))
    console.log(`  ${purpose}: ${count}`);
  console.log(
    "As áreas estão marcadas como suggested e precisam de revisão antes do uso operacional.",
  );
  return 0;
}

function check(): number {
  const checks = [
    ["Node.js 20+", Number(process.versions.node.split(".")[0]) >= 20],
    [
      "Baseline local encontrada",
      existsSync(resolve("supabase/baseline/080_storage.sql")),
    ],
    [
      "Wrangler disponível para deploy",
      existsSync(resolve("node_modules/wrangler/package.json")),
    ],
  ] as const;
  for (const [label, passed] of checks)
    console.log(`${passed ? "✓" : "⚠"} ${label}`);
  return checks.every(([, passed]) => passed) ? 0 : 1;
}

function loadConfig(path: string): InstallerConfig {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as InstallerConfig;
  if (
    !parsed.congregation?.name ||
    !parsed.congregation?.timezone ||
    !parsed.territory?.id ||
    !parsed.cnefe?.edition
  ) {
    throw new Error(
      "Configuração incompleta: congregation.name/timezone, territory.id e cnefe.edition são obrigatórios.",
    );
  }
  return parsed;
}

async function prepare(): Promise<number> {
  const configPath = option("config");
  const kmlPath = option("kml");
  let cnefePaths = options("cnefe");
  const outputDirectory = option("output") ?? "installer-output";
  const areasPath = option("areas");
  const autoCnefe = has("auto-cnefe");
  if (!configPath || !kmlPath || (!autoCnefe && cnefePaths.length === 0)) {
    console.error(
      "Use --config, --kml e pelo menos um --cnefe, ou ative --auto-cnefe.",
    );
    return 1;
  }
  if (autoCnefe && cnefePaths.length > 0)
    throw new Error("Não combine --auto-cnefe com caminhos --cnefe manuais.");
  if (autoCnefe) {
    const municipalities = await discoverFromKml(kmlPath);
    showDiscovery(municipalities);
    const directory = option("cnefe-dir") ?? "cnefe-cache";
    const missing = municipalities.filter(
      (municipality) =>
        !existsSync(resolve(directory, municipality.csvFilename)),
    );
    if (missing.length > 0 && !has("confirm-download")) {
      console.error(
        `${missing.length} CSV(s) ainda precisam ser baixados. Revise a lista e execute novamente com --confirm-download.`,
      );
      return 2;
    }
    const downloaded = await downloadCnefeMunicipalities(
      municipalities,
      directory,
      fetch,
      (message) => console.log(`→ ${message}`),
    );
    cnefePaths = downloaded.map((item) => item.csvPath);
  }
  const missing = [
    configPath,
    kmlPath,
    ...cnefePaths,
    ...(areasPath ? [areasPath] : []),
  ].filter((path) => !existsSync(path));
  if (missing.length > 0)
    throw new Error(`Arquivo não encontrado: ${missing.join(", ")}`);

  const manifest = prepareInstallerPackage({
    config: loadConfig(configPath),
    kmlPath,
    cnefePaths,
    outputDirectory,
    areasPath: areasPath ?? undefined,
  });
  console.log(`✓ Pacote preparado em ${resolve(outputDirectory)}`);
  console.log(
    `  ${manifest.counts.insideTerritory} endereços dentro do território`,
  );
  console.log(`  ${manifest.counts.outsideTerritory} fora do território`);
  console.log(`  ${manifest.counts.rejectedRows} linhas rejeitadas`);
  console.log(
    `  ${manifest.counts.territories} territórios e ${manifest.counts.workAreas} quadras`,
  );
  console.log(
    `  ${manifest.counts.assignedLocals} locais vinculados; ${manifest.counts.unassignedLocals} sem quadra; ${manifest.counts.ambiguousLocals} ambíguos`,
  );
  console.log("Revise o pacote antes de aprová-lo. Nenhum dado foi publicado.");
  return 0;
}

function approvePackage(): number {
  const directory = resolve(option("package") ?? "installer-output");
  if (!has("confirm")) {
    console.error(
      "A aprovação libera a publicação. Revise o pacote e execute novamente com --confirm.",
    );
    return 2;
  }
  const manifest = approveInstallerPackage(directory);
  console.log(`✓ Pacote aprovado em ${manifest.approvedAt}.`);
  return 0;
}

async function applyBaseline(): Promise<number> {
  if (has("db-url"))
    throw new Error(
      "Não passe a connection string no comando. Preencha SUPABASE_DB_URL no .env ou ambiente.",
    );
  const databaseUrl = process.env.SUPABASE_DB_URL ?? null;
  if (!databaseUrl)
    throw new Error("Preencha SUPABASE_DB_URL no .env ou ambiente.");
  if (!has("confirm")) {
    console.error(
      "A baseline altera o banco informado. Revise a URL e execute novamente com --confirm.",
    );
    return 2;
  }
  const baselineDirectory = resolve("supabase/baseline");
  const files = readdirSync(baselineDirectory)
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .sort();
  if (files.length === 0)
    throw new Error("Nenhum arquivo da baseline foi encontrado.");

  const localDatabase = /(?:localhost|127\.0\.0\.1)/i.test(databaseUrl);
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: localDatabase ? false : "require",
  });
  try {
    for (const file of files) {
      console.log(`→ Aplicando ${file}`);
      const contents = readFileSync(join(baselineDirectory, file), "utf8");
      try {
        await sql.begin(async (transaction) => {
          await transaction.unsafe(contents);
        });
      } catch (error) {
        throw new Error(
          `A baseline parou em ${basename(file)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log(
    "✓ Baseline aplicada. Crie o primeiro usuário pelo painel Auth e promova-o conforme QUICKSTART.md.",
  );
  return 0;
}

async function promoteFirstAdmin(): Promise<number> {
  if (has("db-url"))
    throw new Error(
      "Não passe a connection string no comando. Preencha SUPABASE_DB_URL no .env ou ambiente.",
    );
  const email = option("email")?.trim().toLowerCase() ?? null;
  if (!email || !email.includes("@"))
    throw new Error("Informe um email válido com --email.");
  const databaseUrl = process.env.SUPABASE_DB_URL ?? null;
  if (!databaseUrl)
    throw new Error("Preencha SUPABASE_DB_URL no .env ou ambiente.");
  if (!has("confirm")) {
    console.error(
      `A promoção concede acesso administrativo a ${email}. Execute novamente com --confirm.`,
    );
    return 2;
  }

  const localDatabase = /(?:localhost|127\.0\.0\.1)/i.test(databaseUrl);
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: localDatabase ? false : "require",
  });
  try {
    const rows = await sql<Array<{ id: string; email: string; role: string }>>`
      update public.profiles as profile
      set role = 'admin'
      from auth.users as auth_user
      where profile.id = auth_user.id
        and lower(auth_user.email) = ${email}
      returning profile.id, auth_user.email, profile.role
    `;
    if (rows.length === 0)
      throw new Error(
        "Usuário não encontrado ou perfil ainda não criado. Confirme o email no painel Auth.",
      );
    if (rows.length > 1)
      throw new Error("Mais de um usuário foi encontrado para esse email.");
    console.log(`✓ ${rows[0].email} promovido para administrador.`);
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function environment(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function infrastructureCredentials(): InfrastructureCredentials {
  const environmentNames = {
    supabaseUrl: "PUBLIC_SUPABASE_URL",
    supabasePublicKey: "PUBLIC_SUPABASE_ANON_KEY",
    supabaseAdminKey: "SUPABASE_SERVICE_ROLE_KEY",
    databaseUrl: "SUPABASE_DB_URL",
    cloudflareAccountId: "CLOUDFLARE_ACCOUNT_ID",
    cloudflareApiToken: "CLOUDFLARE_API_TOKEN",
    workerName: "TERRITORY_WORKER_NAME ou --worker-name",
  } as const;
  const values = {
    supabaseUrl: environment("PUBLIC_SUPABASE_URL"),
    supabasePublicKey: environment("PUBLIC_SUPABASE_ANON_KEY"),
    supabaseAdminKey: environment("SUPABASE_SERVICE_ROLE_KEY"),
    databaseUrl: environment("SUPABASE_DB_URL"),
    cloudflareAccountId: environment("CLOUDFLARE_ACCOUNT_ID"),
    cloudflareApiToken: environment("CLOUDFLARE_API_TOKEN"),
    workerName: option("worker-name") ?? environment("TERRITORY_WORKER_NAME"),
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => environmentNames[name as keyof typeof environmentNames]);
  if (missing.length > 0)
    throw new Error(
      `Configuração de infraestrutura incompleta: ${missing.join(", ")}. Preencha o .env; segredos não são aceitos como argumentos.`,
    );
  return {
    ...(values as Record<keyof typeof values, string>),
    vapidPublicKey: environment("PUBLIC_VAPID_PUBLIC_KEY") ?? undefined,
    vapidPrivateKey: environment("VAPID_PRIVATE_KEY") ?? undefined,
  };
}

async function configureInfrastructure(): Promise<number> {
  const credentials = infrastructureCredentials();
  console.log("→ Validando API pública e acesso administrativo do Supabase");
  console.log("→ Validando PostgreSQL e disponibilidade do PostGIS");
  console.log("→ Validando o API Token da Cloudflare");
  const result = await runInfrastructurePreflight(credentials);
  const directory = option("directory") ?? ".territory-installer";
  const artifacts = saveInfrastructureArtifacts(directory, credentials, result);
  console.log(`✓ Supabase ${result.supabase.projectRef} conectado.`);
  console.log(
    `✓ PostgreSQL conectado; PostGIS ${result.supabase.database.postgisInstalled ? "já instalado" : "disponível para a baseline"}.`,
  );
  console.log(
    `✓ Cloudflare conectada; Worker preparado como ${result.cloudflare.workerName}.`,
  );
  console.log(`✓ Configuração local salva em ${artifacts.directory}.`);
  console.log(
    "  Chave administrativa, token Cloudflare e connection string não foram gravados nesse estado.",
  );
  return 0;
}

async function deployInfrastructure(): Promise<number> {
  if (!has("confirm")) {
    console.error(
      "O deploy publica uma nova versão na Cloudflare. Execute novamente com --confirm.",
    );
    return 2;
  }
  const cloudflareApiToken = environment("CLOUDFLARE_API_TOKEN");
  const supabaseAdminKey = environment("SUPABASE_SERVICE_ROLE_KEY");
  if (!cloudflareApiToken)
    throw new Error("Preencha CLOUDFLARE_API_TOKEN no .env ou ambiente.");
  if (!supabaseAdminKey)
    throw new Error("Preencha SUPABASE_SERVICE_ROLE_KEY no .env ou ambiente.");
  const directory = option("directory") ?? ".territory-installer";
  const artifacts = loadInfrastructureState(directory);
  await verifyCloudflareToken(
    artifacts.state.cloudflare.accountId,
    cloudflareApiToken,
  );
  const temporarySecrets = createTemporarySecretsFile({
    supabaseAdminKey,
    vapidPrivateKey: environment("VAPID_PRIVATE_KEY") ?? undefined,
  });
  try {
    const commands = createCloudflareDeploymentCommands(
      artifacts,
      cloudflareApiToken,
      temporarySecrets.path,
    );
    console.log("→ Gerando o build de produção");
    await runDeploymentCommand(commands.build, resolve("."));
    console.log("→ Publicando o Worker e seus secrets na Cloudflare");
    const output = await runDeploymentCommand(commands.deploy, resolve("."));
    const url = findDeploymentUrl(output);
    if (url) {
      console.log(`→ Testando ${url}`);
      const response = await fetch(url, { redirect: "follow" });
      if (response.status >= 500)
        throw new Error(
          "A Cloudflare publicou o Worker, mas o teste da URL retornou uma falha do servidor.",
        );
    }
    recordInfrastructureDeployment(artifacts, url);
    console.log(
      `✓ Aplicação publicada${url ? ` em ${url}` : " na Cloudflare"}.`,
    );
  } finally {
    temporarySecrets.cleanup();
  }
  return 0;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (!command || command === "help" || has("help")) {
    help();
    return 0;
  }
  if (command === "check") return check();
  if (command === "configure") return await configureInfrastructure();
  if (command === "discover") return await discover();
  if (command === "generate-areas") return await generateAreas();
  if (command === "prepare") return await prepare();
  if (command === "approve") return approvePackage();
  if (command === "baseline") return await applyBaseline();
  if (command === "admin") return await promoteFirstAdmin();
  if (command === "deploy") return await deployInfrastructure();
  if (command === "publish") {
    if (!has("confirm")) {
      console.error(
        "A publicação altera o Supabase. Execute novamente com --confirm.",
      );
      return 2;
    }
    if (has("service-key"))
      throw new Error(
        "Não passe a chave administrativa no comando. Preencha SUPABASE_SERVICE_ROLE_KEY no .env ou ambiente.",
      );
    const packageDirectory = option("package") ?? "installer-output";
    const supabaseUrl =
      option("supabase-url") ?? process.env.PUBLIC_SUPABASE_URL ?? null;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
    if (!supabaseUrl || !serviceRoleKey)
      throw new Error(
        "Preencha PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou ambiente.",
      );
    const manifest = await publishInstallerPackage({
      packageDirectory,
      supabaseUrl,
      serviceRoleKey,
    });
    console.log(
      `✓ Publicação concluída: ${manifest.counts.localGroups} locais e ${manifest.counts.units} unidades.`,
    );
    return 0;
  }
  console.error(`Comando desconhecido: ${command}`);
  help();
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(
      `✗ ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });

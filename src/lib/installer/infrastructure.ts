import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import postgres from "postgres";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

export interface InfrastructureCredentials {
  supabaseUrl: string;
  supabasePublicKey: string;
  supabaseAdminKey: string;
  databaseUrl: string;
  cloudflareAccountId: string;
  cloudflareApiToken: string;
  workerName: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
}

export interface DatabaseProbeResult {
  host: string;
  database: string;
  user: string;
  postgisAvailable: boolean;
  postgisInstalled: boolean;
}

export interface InfrastructurePreflightResult {
  checkedAt: string;
  supabase: {
    url: string;
    projectRef: string;
    publicKeyType: "publishable" | "legacy";
    adminKeyType: "secret" | "legacy";
    apiReachable: true;
    adminAccess: true;
    database: DatabaseProbeResult;
  };
  cloudflare: {
    accountId: string;
    tokenStatus: "active";
    workerName: string;
  };
}

export interface InfrastructureState {
  version: 1;
  configuredAt: string;
  checkedAt: string;
  supabase: {
    url: string;
    projectRef: string;
    publicKey: string;
    publicKeyType: "publishable" | "legacy";
    adminKeyType: "secret" | "legacy";
    database: DatabaseProbeResult;
  };
  cloudflare: {
    accountId: string;
    workerName: string;
    tokenStatus: "active";
  };
  files: {
    wranglerConfig: string;
  };
  lastDeployment?: {
    deployedAt: string;
    url?: string;
  };
}

export interface InfrastructureArtifacts {
  directory: string;
  statePath: string;
  wranglerConfigPath: string;
  state: InfrastructureState;
}

type FetchImplementation = typeof fetch;
type DatabaseProbe = (databaseUrl: string) => Promise<DatabaseProbeResult>;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} não foi informado.`);
  return normalized;
}

function normalizeSupabaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(required(value, "A URL do Supabase"));
  } catch {
    throw new Error("A URL do Supabase não é válida.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("A URL do Supabase não é válida.");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function projectRef(url: URL): string {
  const firstLabel = url.hostname.split(".")[0] ?? "";
  return firstLabel || url.hostname;
}

function validateCloudflareAccountId(value: string): string {
  const accountId = required(value, "O Account ID da Cloudflare");
  if (!/^[a-f0-9]{32}$/i.test(accountId))
    throw new Error(
      "O Account ID da Cloudflare deve ter 32 caracteres hexadecimais.",
    );
  return accountId;
}

export function validateWorkerName(value: string): string {
  const workerName = required(value, "O nome do Worker").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(workerName))
    throw new Error(
      "O nome do Worker deve usar apenas letras minúsculas, números e hífens, sem hífen no início ou no fim.",
    );
  return workerName;
}

function publicKeyType(key: string): "publishable" | "legacy" {
  return key.startsWith("sb_publishable_") ? "publishable" : "legacy";
}

function adminKeyType(key: string): "secret" | "legacy" {
  return key.startsWith("sb_secret_") ? "secret" : "legacy";
}

async function requireOk(response: Response, message: string): Promise<void> {
  if (!response.ok) throw new Error(message);
}

async function fetchOrExplain(
  fetchImplementation: FetchImplementation,
  input: string | URL,
  init: RequestInit,
  message: string,
): Promise<Response> {
  try {
    return await fetchImplementation(input, init);
  } catch {
    throw new Error(message);
  }
}

export async function verifySupabaseApi(
  supabaseUrl: string,
  publicKey: string,
  adminKey: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<void> {
  const base = normalizeSupabaseUrl(supabaseUrl);
  const publicCredential = required(publicKey, "A chave pública do Supabase");
  const adminCredential = required(
    adminKey,
    "A chave administrativa do Supabase",
  );

  const publicResponse = await fetchOrExplain(
    fetchImplementation,
    new URL("auth/v1/settings", base),
    {
      headers: {
        apikey: publicCredential,
        "User-Agent": "territory-installer/1",
      },
    },
    "Não foi possível conectar à API do Supabase. Confira a URL e sua conexão com a internet.",
  );
  await requireOk(
    publicResponse,
    "O Supabase respondeu, mas recusou a chave pública. Confira Project URL e Publishable/anon key.",
  );

  const adminResponse = await fetchOrExplain(
    fetchImplementation,
    new URL("auth/v1/admin/users?page=1&per_page=1", base),
    {
      headers: {
        apikey: adminCredential,
        Authorization: `Bearer ${adminCredential}`,
        "User-Agent": "territory-installer/1",
      },
    },
    "Não foi possível validar o acesso administrativo do Supabase agora.",
  );
  await requireOk(
    adminResponse,
    "O Supabase respondeu, mas a chave administrativa não possui acesso ao Auth Admin. Use uma Secret key ou service_role.",
  );
}

export async function verifyCloudflareToken(
  accountIdValue: string,
  apiTokenValue: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<"active"> {
  const accountId = validateCloudflareAccountId(accountIdValue);
  const apiToken = required(apiTokenValue, "O API Token da Cloudflare");
  const request = {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "User-Agent": "territory-installer/1",
    },
  } satisfies RequestInit;
  let active = false;
  for (const verificationUrl of [
    `${CLOUDFLARE_API_BASE}/user/tokens/verify`,
    `${CLOUDFLARE_API_BASE}/accounts/${accountId}/tokens/verify`,
  ]) {
    const response = await fetchOrExplain(
      fetchImplementation,
      verificationUrl,
      request,
      "Não foi possível conectar à Cloudflare. Confira sua conexão com a internet.",
    );
    if (!response.ok) continue;
    const payload = (await response.json()) as {
      success?: boolean;
      result?: { status?: string };
    };
    if (payload.success === true && payload.result?.status === "active") {
      active = true;
      break;
    }
  }
  if (!active)
    throw new Error(
      "A Cloudflare recusou o API Token. Confira se ele foi copiado inteiro e ainda está ativo.",
    );

  const workersResponse = await fetchOrExplain(
    fetchImplementation,
    `${CLOUDFLARE_API_BASE}/accounts/${accountId}/workers/scripts`,
    request,
    "Não foi possível testar o acesso aos Workers da Cloudflare agora.",
  );
  if (!workersResponse.ok)
    throw new Error(
      "O token está ativo, mas não consegue acessar os Workers dessa conta. Confira o Account ID, o escopo da conta e a permissão Workers Scripts: Edit.",
    );
  const workersPayload = (await workersResponse.json()) as {
    success?: boolean;
  };
  if (workersPayload.success !== true)
    throw new Error(
      "A Cloudflare não confirmou o acesso do token aos Workers dessa conta.",
    );
  return "active";
}

export async function probeSupabaseDatabase(
  databaseUrl: string,
): Promise<DatabaseProbeResult> {
  const connection = required(databaseUrl, "A connection string do Supabase");
  let parsed: URL;
  try {
    parsed = new URL(connection);
  } catch {
    throw new Error("A connection string do Supabase não é válida.");
  }
  const localDatabase = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  const sql = postgres(connection, {
    max: 1,
    prepare: false,
    ssl: localDatabase ? false : "require",
  });
  try {
    const rows = await sql<
      Array<{
        database: string;
        database_user: string;
        postgis_available: boolean;
        postgis_installed: boolean;
      }>
    >`
      select
        current_database() as database,
        current_user as database_user,
        exists(select 1 from pg_available_extensions where name = 'postgis') as postgis_available,
        exists(select 1 from pg_extension where extname = 'postgis') as postgis_installed
    `;
    const row = rows[0];
    if (!row) throw new Error("O banco não retornou o diagnóstico esperado.");
    if (!row.postgis_available)
      throw new Error("O projeto informado não oferece a extensão PostGIS.");
    return {
      host: parsed.hostname,
      database: row.database,
      user: row.database_user,
      postgisAvailable: row.postgis_available,
      postgisInstalled: row.postgis_installed,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("PostGIS"))
      throw error;
    throw new Error(
      "Não foi possível conectar ao PostgreSQL do Supabase. Confira a connection string, a senha e a rede.",
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function runInfrastructurePreflight(
  input: InfrastructureCredentials,
  dependencies: {
    fetch?: FetchImplementation;
    databaseProbe?: DatabaseProbe;
    now?: () => Date;
  } = {},
): Promise<InfrastructurePreflightResult> {
  const supabaseUrl = normalizeSupabaseUrl(input.supabaseUrl);
  const publicKey = required(
    input.supabasePublicKey,
    "A chave pública do Supabase",
  );
  const adminKey = required(
    input.supabaseAdminKey,
    "A chave administrativa do Supabase",
  );
  const accountId = validateCloudflareAccountId(input.cloudflareAccountId);
  const workerName = validateWorkerName(input.workerName);
  const fetchImplementation = dependencies.fetch ?? fetch;

  await verifySupabaseApi(
    supabaseUrl.toString(),
    publicKey,
    adminKey,
    fetchImplementation,
  );
  const database = await (dependencies.databaseProbe ?? probeSupabaseDatabase)(
    input.databaseUrl,
  );
  const tokenStatus = await verifyCloudflareToken(
    accountId,
    input.cloudflareApiToken,
    fetchImplementation,
  );

  return {
    checkedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    supabase: {
      url: supabaseUrl.toString().replace(/\/$/, ""),
      projectRef: projectRef(supabaseUrl),
      publicKeyType: publicKeyType(publicKey),
      adminKeyType: adminKeyType(adminKey),
      apiReachable: true,
      adminAccess: true,
      database,
    },
    cloudflare: { accountId, tokenStatus, workerName },
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function generateWranglerConfig(
  result: InfrastructurePreflightResult,
  publicKey: string,
  vapidPublicKey?: string,
): string {
  const publicVariables = [
    `PUBLIC_SUPABASE_URL = ${tomlString(result.supabase.url)}`,
    `PUBLIC_SUPABASE_ANON_KEY = ${tomlString(publicKey)}`,
  ];
  if (vapidPublicKey?.trim())
    publicVariables.push(
      `PUBLIC_VAPID_PUBLIC_KEY = ${tomlString(vapidPublicKey.trim())}`,
    );
  return `#:schema ../node_modules/wrangler/config-schema.json
name = ${tomlString(result.cloudflare.workerName)}
account_id = ${tomlString(result.cloudflare.accountId)}
main = "../.svelte-kit/cloudflare/_worker.js"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[assets]
binding = "ASSETS"
directory = "../.svelte-kit/cloudflare"

[observability]
enabled = true

[vars]
${publicVariables.join("\n")}
`;
}

export function saveInfrastructureArtifacts(
  directoryValue: string,
  input: InfrastructureCredentials,
  result: InfrastructurePreflightResult,
  now: () => Date = () => new Date(),
): InfrastructureArtifacts {
  const directory = resolve(directoryValue);
  mkdirSync(directory, { recursive: true });
  const wranglerConfigPath = join(directory, "wrangler.toml");
  const statePath = join(directory, "infrastructure.json");
  writeFileSync(
    wranglerConfigPath,
    generateWranglerConfig(
      result,
      input.supabasePublicKey,
      input.vapidPublicKey,
    ),
    { mode: 0o600 },
  );
  const state: InfrastructureState = {
    version: 1,
    configuredAt: now().toISOString(),
    checkedAt: result.checkedAt,
    supabase: {
      url: result.supabase.url,
      projectRef: result.supabase.projectRef,
      publicKey: input.supabasePublicKey,
      publicKeyType: result.supabase.publicKeyType,
      adminKeyType: result.supabase.adminKeyType,
      database: result.supabase.database,
    },
    cloudflare: {
      accountId: result.cloudflare.accountId,
      workerName: result.cloudflare.workerName,
      tokenStatus: result.cloudflare.tokenStatus,
    },
    files: {
      wranglerConfig: basename(wranglerConfigPath),
    },
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  return { directory, statePath, wranglerConfigPath, state };
}

export function loadInfrastructureState(
  directoryValue: string,
): InfrastructureArtifacts {
  const directory = resolve(directoryValue);
  const statePath = join(directory, "infrastructure.json");
  const state = JSON.parse(
    readFileSync(statePath, "utf8"),
  ) as InfrastructureState;
  if (state.version !== 1)
    throw new Error(
      "A configuração de infraestrutura usa uma versão não suportada.",
    );
  return {
    directory,
    statePath,
    wranglerConfigPath: join(directory, state.files.wranglerConfig),
    state,
  };
}

export function recordInfrastructureDeployment(
  artifacts: InfrastructureArtifacts,
  url?: string,
  now: () => Date = () => new Date(),
): InfrastructureState {
  const next: InfrastructureState = {
    ...artifacts.state,
    lastDeployment: {
      deployedAt: now().toISOString(),
      ...(url ? { url } : {}),
    },
  };
  writeFileSync(artifacts.statePath, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateWranglerConfig,
  runInfrastructurePreflight,
  saveInfrastructureArtifacts,
  validateWorkerName,
  type DatabaseProbeResult,
  type InfrastructureCredentials,
} from "../src/lib/installer/infrastructure";
import {
  createCloudflareDeploymentCommands,
  createTemporarySecretsFile,
  findDeploymentUrl,
} from "../src/lib/installer/cloudflare-deploy";
import { assertEq, assertFalse, assertTrue, test } from "./harness";

const credentials: InfrastructureCredentials = {
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  supabasePublicKey: "sb_publishable_public-value",
  supabaseAdminKey: "sb_secret_admin-value",
  databaseUrl: "postgresql://postgres:secret@db.example.test/postgres",
  cloudflareAccountId: "0123456789abcdef0123456789abcdef",
  cloudflareApiToken: "cloudflare-sensitive-token",
  workerName: "territorios-monte-castelo",
};

const database: DatabaseProbeResult = {
  host: "db.example.test",
  database: "postgres",
  user: "postgres",
  postgisAvailable: true,
  postgisInstalled: false,
};

function successfulFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input);
  if (url.includes("cloudflare.com"))
    return Promise.resolve(
      new Response(
        JSON.stringify({ success: true, result: { status: "active" } }),
        { status: 200 },
      ),
    );
  return Promise.resolve(new Response("{}", { status: 200 }));
}

test("pré-voo valida Supabase, banco e token Cloudflare sem devolver segredos", async () => {
  const result = await runInfrastructurePreflight(credentials, {
    fetch: successfulFetch as typeof fetch,
    databaseProbe: async () => database,
    now: () => new Date("2026-08-01T12:00:00.000Z"),
  });
  assertEq(result.supabase.projectRef, "abcdefghijklmnopqrst");
  assertEq(result.supabase.publicKeyType, "publishable");
  assertEq(result.supabase.adminKeyType, "secret");
  assertEq(result.cloudflare.tokenStatus, "active");
  const serialized = JSON.stringify(result);
  assertFalse(serialized.includes(credentials.supabaseAdminKey));
  assertFalse(serialized.includes(credentials.cloudflareApiToken));
  assertFalse(serialized.includes("postgresql://"));
});

test("token de usuário Cloudflare é validado no endpoint correto e na conta escolhida", async () => {
  const requests: string[] = [];
  const fetchImplementation = async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (!url.includes("cloudflare.com"))
      return new Response("{}", { status: 200 });
    if (url.endsWith("/user/tokens/verify"))
      return new Response(
        JSON.stringify({ success: true, result: { status: "active" } }),
        { status: 200 },
      );
    if (url.endsWith("/workers/scripts"))
      return new Response(JSON.stringify({ success: true, result: [] }), {
        status: 200,
      });
    return new Response("{}", { status: 404 });
  };
  const result = await runInfrastructurePreflight(credentials, {
    fetch: fetchImplementation as typeof fetch,
    databaseProbe: async () => database,
  });
  assertEq(result.cloudflare.tokenStatus, "active");
  assertTrue(requests.some((url) => url.endsWith("/user/tokens/verify")));
  assertTrue(requests.some((url) => url.endsWith("/workers/scripts")));
  assertFalse(
    requests.some((url) =>
      url.includes("/accounts/0123456789abcdef0123456789abcdef/tokens/verify"),
    ),
  );
});

test("token Cloudflare pertencente à conta usa o endpoint alternativo", async () => {
  const requests: string[] = [];
  const fetchImplementation = async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (!url.includes("cloudflare.com"))
      return new Response("{}", { status: 200 });
    if (url.endsWith("/user/tokens/verify"))
      return new Response("{}", { status: 403 });
    if (url.endsWith("/tokens/verify"))
      return new Response(
        JSON.stringify({ success: true, result: { status: "active" } }),
        { status: 200 },
      );
    if (url.endsWith("/workers/scripts"))
      return new Response(JSON.stringify({ success: true, result: [] }), {
        status: 200,
      });
    return new Response("{}", { status: 404 });
  };
  const result = await runInfrastructurePreflight(credentials, {
    fetch: fetchImplementation as typeof fetch,
    databaseProbe: async () => database,
  });
  assertEq(result.cloudflare.tokenStatus, "active");
  assertTrue(
    requests.some((url) =>
      url.includes("/accounts/0123456789abcdef0123456789abcdef/tokens/verify"),
    ),
  );
});

test("artefatos persistentes não duplicam segredos e deploy usa arquivo temporário", async () => {
  const directory = mkdtempSync(join(tmpdir(), "territory-infra-"));
  try {
    const result = await runInfrastructurePreflight(credentials, {
      fetch: successfulFetch as typeof fetch,
      databaseProbe: async () => database,
      now: () => new Date("2026-08-01T12:00:00.000Z"),
    });
    const artifacts = saveInfrastructureArtifacts(
      directory,
      credentials,
      result,
      () => new Date("2026-08-01T12:01:00.000Z"),
    );
    const state = readFileSync(artifacts.statePath, "utf8");
    const wrangler = readFileSync(artifacts.wranglerConfigPath, "utf8");
    assertTrue(existsSync(artifacts.statePath));
    assertTrue(wrangler.includes("PUBLIC_SUPABASE_URL"));
    assertTrue(wrangler.includes(credentials.supabasePublicKey));
    assertFalse(wrangler.includes(credentials.supabaseAdminKey));
    assertFalse(state.includes(credentials.supabaseAdminKey));
    assertFalse(state.includes(credentials.cloudflareApiToken));
    assertFalse(state.includes(credentials.databaseUrl));

    const temporarySecrets = createTemporarySecretsFile({
      supabaseAdminKey: credentials.supabaseAdminKey,
    });
    try {
      const secrets = readFileSync(temporarySecrets.path, "utf8");
      assertTrue(secrets.includes(credentials.supabaseAdminKey));
      const commands = createCloudflareDeploymentCommands(
        artifacts,
        credentials.cloudflareApiToken,
        temporarySecrets.path,
      );
      assertEq(commands.build.arguments, ["run", "build"]);
      assertTrue(commands.deploy.arguments.includes("--secrets-file"));
      assertFalse(
        commands.deploy.arguments.includes(credentials.supabaseAdminKey),
      );
      assertFalse(
        commands.deploy.arguments.includes(credentials.cloudflareApiToken),
      );
      assertEq(
        commands.deploy.environment.CLOUDFLARE_API_TOKEN,
        credentials.cloudflareApiToken,
      );
    } finally {
      const path = temporarySecrets.path;
      temporarySecrets.cleanup();
      assertFalse(existsSync(path));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("configuração Wrangler escapa valores e não contém chave administrativa", async () => {
  const result = await runInfrastructurePreflight(credentials, {
    fetch: successfulFetch as typeof fetch,
    databaseProbe: async () => database,
  });
  const config = generateWranglerConfig(result, credentials.supabasePublicKey);
  assertTrue(config.includes('name = "territorios-monte-castelo"'));
  assertTrue(config.includes("../.svelte-kit/cloudflare/_worker.js"));
  assertFalse(config.includes(credentials.supabaseAdminKey));
});

test("nomes inválidos de Worker são recusados", () => {
  assertEq(validateWorkerName("Territorios-01"), "territorios-01");
  let message = "";
  try {
    validateWorkerName("nome com espaços");
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assertTrue(message.includes("letras minúsculas"));
});

test("URL de produção é extraída da saída do Wrangler", () => {
  assertEq(
    findDeploymentUrl("Published territory\nhttps://territorios.workers.dev\n"),
    "https://territorios.workers.dev",
  );
});

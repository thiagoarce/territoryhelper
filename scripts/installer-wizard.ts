import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { createInitialAdmin } from "../src/lib/installer/initial-admin";
import { loadInfrastructureState } from "../src/lib/installer/infrastructure";
import { parseKmlComponents } from "../src/lib/installer/kml";
import type { InstallerConfig, InstallerManifest } from "../src/lib/installer/types";

const ROOT = resolve(".");
const WORK_DIRECTORY = resolve(".territory-installer", "wizard");
const INFRA_DIRECTORY = resolve(".territory-installer");
const STATE_PATH = join(WORK_DIRECTORY, "state.json");
const KML_PATH = join(WORK_DIRECTORY, "territorio.kml");
const CONFIG_PATH = join(WORK_DIRECTORY, "installer.config.json");
const AREAS_PATH = join(WORK_DIRECTORY, "areas-sugeridas.geojson");
const CNEFE_DIRECTORY = join(WORK_DIRECTORY, "cnefe-cache");
const OSM_DIRECTORY = join(WORK_DIRECTORY, "osm-cache");
const PACKAGE_DIRECTORY = join(WORK_DIRECTORY, "installer-output");
const HTML_PATH = resolve("src", "lib", "installer", "wizard-ui.html");
const TOKEN = randomBytes(24).toString("hex");
const PORT = Number(process.env.INSTALLER_WIZARD_PORT ?? "4174");

type ActionName =
  | "configure"
  | "baseline"
  | "discover"
  | "generate"
  | "prepare"
  | "approve"
  | "publish"
  | "admin"
  | "deploy";

interface WizardTask {
  id: string;
  action: ActionName;
  status: "running" | "success" | "error";
  startedAt: string;
  finishedAt?: string;
  logs: string[];
  error?: string;
}

interface WizardState {
  version: 1;
  completed: string[];
  task?: WizardTask;
  infrastructure?: {
    projectRef: string;
    workerName: string;
  };
  territory?: {
    congregationName: string;
    territoryName: string;
    components: Array<{
      name: string;
      environment: string;
      purpose: string;
      special: boolean;
    }>;
  };
  package?: {
    counts: InstallerManifest["counts"];
    approved: boolean;
  };
  generatedAreas?: number;
  admin?: { email: string };
  deployment?: { url?: string };
}

interface WizardSecrets {
  supabaseUrl: string;
  supabasePublicKey: string;
  supabaseAdminKey: string;
  databaseUrl: string;
  cloudflareAccountId: string;
  cloudflareApiToken: string;
  workerName: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

mkdirSync(WORK_DIRECTORY, { recursive: true });

function initialState(): WizardState {
  return { version: 1, completed: [] };
}

function loadState(): WizardState {
  if (!existsSync(STATE_PATH)) return initialState();
  try {
    const loaded = JSON.parse(readFileSync(STATE_PATH, "utf8")) as WizardState;
    if (loaded.version !== 1) return initialState();
    if (loaded.task?.status === "running") {
      loaded.task.status = "error";
      loaded.task.error = "O assistente foi encerrado durante esta etapa. Execute-a novamente.";
      loaded.task.finishedAt = new Date().toISOString();
    }
    return loaded;
  } catch {
    return initialState();
  }
}

let state = loadState();
let secrets: WizardSecrets | null = null;

function saveState(): void {
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
}

function publicState() {
  return { ...state, secretsReady: secrets !== null };
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readJsonBody(request: IncomingMessage, limit = 12_000_000): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error("Os dados enviados são grandes demais.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Os dados enviados não são válidos.");
  }
}

function b64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function generateVapidPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });
  if (!publicJwk.x || !publicJwk.y || !privateJwk.d)
    throw new Error("Não foi possível gerar as chaves de notificação.");
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(publicJwk.x, "base64url"),
    Buffer.from(publicJwk.y, "base64url"),
  ]);
  return { publicKey: b64url(point), privateKey: privateJwk.d };
}

function credentialsFrom(payload: any): WizardSecrets {
  const vapid = generateVapidPair();
  return {
    supabaseUrl: String(payload.supabaseUrl ?? "").trim(),
    supabasePublicKey: String(payload.supabasePublicKey ?? "").trim(),
    supabaseAdminKey: String(payload.supabaseAdminKey ?? "").trim(),
    databaseUrl: String(payload.databaseUrl ?? "").trim(),
    cloudflareAccountId: String(payload.cloudflareAccountId ?? "").trim(),
    cloudflareApiToken: String(payload.cloudflareApiToken ?? "").trim(),
    workerName: String(payload.workerName ?? "territorios-congregacao").trim(),
    vapidPublicKey: vapid.publicKey,
    vapidPrivateKey: vapid.privateKey,
  };
}

function secretEnvironment(current: WizardSecrets): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PUBLIC_SUPABASE_URL: current.supabaseUrl,
    PUBLIC_SUPABASE_ANON_KEY: current.supabasePublicKey,
    SUPABASE_SERVICE_ROLE_KEY: current.supabaseAdminKey,
    SUPABASE_DB_URL: current.databaseUrl,
    CLOUDFLARE_ACCOUNT_ID: current.cloudflareAccountId,
    CLOUDFLARE_API_TOKEN: current.cloudflareApiToken,
    TERRITORY_WORKER_NAME: current.workerName,
    PUBLIC_VAPID_PUBLIC_KEY: current.vapidPublicKey,
    VAPID_PRIVATE_KEY: current.vapidPrivateKey,
  };
}

function sanitizeLog(value: string): string {
  let sanitized = value;
  if (secrets) {
    for (const secret of [
      secrets.supabaseAdminKey,
      secrets.databaseUrl,
      secrets.cloudflareApiToken,
      secrets.vapidPrivateKey,
    ]) {
      if (secret) sanitized = sanitized.split(secret).join("[segredo protegido]");
    }
  }
  return sanitized;
}

function appendLog(task: WizardTask, chunk: string): void {
  const lines = sanitizeLog(chunk).replace(/\r/g, "").split("\n");
  for (const line of lines) if (line.trim()) task.logs.push(line);
  task.logs = task.logs.slice(-240);
  saveState();
}

async function runInstaller(args: string[], task: WizardTask): Promise<void> {
  if (!secrets) throw new Error("Conecte novamente as contas antes de continuar.");
  const tsxCli = resolve("node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(tsxCli))
    throw new Error("Dependências não instaladas. Execute npm install e abra o assistente novamente.");
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [tsxCli, resolve("scripts", "installer.ts"), ...args],
      {
        cwd: ROOT,
        env: secretEnvironment(secrets!),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk: Buffer) => appendLog(task, chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => appendLog(task, chunk.toString()));
    child.on("error", () => reject(new Error("Não foi possível iniciar esta etapa.")));
    child.on("close", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`A etapa terminou sem concluir (código ${code}).`)),
    );
  });
}

function completed(step: string): boolean {
  return state.completed.includes(step);
}

function requireCompleted(...steps: string[]): void {
  const missing = steps.find((step) => !completed(step));
  if (missing) throw new Error("Conclua as etapas anteriores antes de continuar.");
}

function markCompleted(action: string): void {
  if (!state.completed.includes(action)) state.completed.push(action);
}

function readManifest(): InstallerManifest {
  return JSON.parse(
    readFileSync(join(PACKAGE_DIRECTORY, "manifest.json"), "utf8"),
  ) as InstallerManifest;
}

async function executeAction(action: ActionName, payload: any, task: WizardTask): Promise<void> {
  if (action === "configure") {
    secrets = credentialsFrom(payload);
    appendLog(task, "Validando Supabase, banco e Cloudflare…");
    await runInstaller(["configure", "--directory", INFRA_DIRECTORY], task);
    const infrastructure = loadInfrastructureState(INFRA_DIRECTORY).state;
    const previous = state.infrastructure;
    if (previous && previous.projectRef !== infrastructure.supabase.projectRef) {
      state.completed = state.completed.filter(
        (item) => !["baseline", "publish", "admin", "deploy"].includes(item),
      );
      state.admin = undefined;
      state.deployment = undefined;
    } else if (previous && previous.workerName !== infrastructure.cloudflare.workerName) {
      state.completed = state.completed.filter((item) => item !== "deploy");
      state.deployment = undefined;
    }
    state.infrastructure = {
      projectRef: infrastructure.supabase.projectRef,
      workerName: infrastructure.cloudflare.workerName,
    };
  } else if (action === "baseline") {
    requireCompleted("configure");
    await runInstaller(["baseline", "--confirm"], task);
  } else if (action === "discover") {
    requireCompleted("territory");
    await runInstaller(["discover", "--kml", KML_PATH], task);
  } else if (action === "generate") {
    requireCompleted("territory", "discover");
    await runInstaller([
      "generate-areas",
      "--config", CONFIG_PATH,
      "--kml", KML_PATH,
      "--output", AREAS_PATH,
      "--osm-cache", OSM_DIRECTORY,
      "--confirm-download",
    ], task);
    const geojson = JSON.parse(readFileSync(AREAS_PATH, "utf8"));
    state.generatedAreas = Array.isArray(geojson.features) ? geojson.features.length : 0;
  } else if (action === "prepare") {
    requireCompleted("generate");
    await runInstaller([
      "prepare",
      "--config", CONFIG_PATH,
      "--kml", KML_PATH,
      "--auto-cnefe",
      "--cnefe-dir", CNEFE_DIRECTORY,
      "--confirm-download",
      "--areas", AREAS_PATH,
      "--output", PACKAGE_DIRECTORY,
    ], task);
    const manifest = readManifest();
    state.package = { counts: manifest.counts, approved: manifest.approved };
  } else if (action === "approve") {
    requireCompleted("prepare");
    await runInstaller(["approve", "--package", PACKAGE_DIRECTORY, "--confirm"], task);
    const manifest = readManifest();
    state.package = { counts: manifest.counts, approved: manifest.approved };
  } else if (action === "publish") {
    requireCompleted("baseline", "approve");
    await runInstaller(["publish", "--package", PACKAGE_DIRECTORY, "--confirm"], task);
  } else if (action === "admin") {
    requireCompleted("baseline", "publish");
    if (!secrets) throw new Error("Conecte novamente as contas antes de continuar.");
    appendLog(task, "Criando e promovendo o primeiro administrador…");
    const result = await createInitialAdmin({
      supabaseUrl: secrets.supabaseUrl,
      serviceRoleKey: secrets.supabaseAdminKey,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      password: String(payload.password ?? ""),
    });
    state.admin = { email: result.email };
    appendLog(task, `✓ Administrador ${result.email} criado.`);
  } else if (action === "deploy") {
    requireCompleted("publish", "admin");
    await runInstaller(["deploy", "--directory", INFRA_DIRECTORY, "--confirm"], task);
    const infrastructure = loadInfrastructureState(INFRA_DIRECTORY).state;
    state.deployment = { url: infrastructure.lastDeployment?.url };
  }
  markCompleted(action);
}

function startAction(action: ActionName, payload: any): WizardTask {
  if (state.task?.status === "running")
    throw new Error("Já existe uma etapa em andamento. Aguarde a conclusão.");
  const task: WizardTask = {
    id: randomUUID(),
    action,
    status: "running",
    startedAt: new Date().toISOString(),
    logs: [],
  };
  state.task = task;
  saveState();
  void executeAction(action, payload, task)
    .then(() => {
      task.status = "success";
      task.finishedAt = new Date().toISOString();
      saveState();
    })
    .catch((error) => {
      task.status = "error";
      task.error = message(error);
      task.finishedAt = new Date().toISOString();
      appendLog(task, `✗ ${task.error}`);
      saveState();
    });
  return task;
}

function validText(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} é obrigatório.`);
  return text;
}

function saveTerritory(payload: any): void {
  if (state.task?.status === "running")
    throw new Error("Aguarde a etapa atual terminar.");
  const kml = validText(payload.kml, "O arquivo KML");
  const components = parseKmlComponents(kml);
  if (components.length === 0)
    throw new Error("O KML não contém nenhum território reconhecível.");
  const territoryId = validText(payload.territoryId, "O identificador do território");
  if (!/^[A-Za-z0-9_-]+$/.test(territoryId))
    throw new Error("O identificador usa apenas letras, números, hífen e sublinhado.");
  const mode = payload.mode === "language" ? "language" : "territorial";
  const config: InstallerConfig = {
    congregation: {
      name: validText(payload.congregationName, "O nome da congregação"),
      timezone: validText(payload.timezone, "O fuso horário"),
      mode,
    },
    territory: {
      id: territoryId,
      name: validText(payload.territoryName, "O nome do território"),
      color: /^#[0-9a-f]{6}$/i.test(String(payload.color ?? ""))
        ? String(payload.color)
        : "#3388ff",
      areaBoundaryToleranceMeters: Math.max(
        0,
        Math.min(100, Number(payload.tolerance ?? 15) || 0),
      ),
    },
    cnefe: {
      edition: validText(payload.cnefeEdition || "CNEFE-2022", "A edição do CNEFE"),
      encoding: "windows-1252",
      outsideSampleLimit: 100,
    },
  };
  writeFileSync(KML_PATH, kml, { mode: 0o600 });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  state.territory = {
    congregationName: config.congregation.name,
    territoryName: config.territory.name,
    components: components.map((component) => ({
      name: component.name ?? "Sem nome",
      environment: component.environment,
      purpose: component.purpose,
      special: component.special,
    })),
  };
  for (const later of ["territory", "discover", "generate", "prepare", "approve", "publish", "deploy"])
    state.completed = state.completed.filter((item) => item !== later);
  markCompleted("territory");
  state.package = undefined;
  state.generatedAreas = undefined;
  state.deployment = undefined;
  saveState();
}

function authorized(request: IncomingMessage): boolean {
  return request.headers["x-wizard-token"] === TOKEN;
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (request.method === "GET" && url.pathname === "/") {
    const html = readFileSync(HTML_PATH, "utf8").replaceAll("__WIZARD_TOKEN__", TOKEN);
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    response.end(html);
    return;
  }
  if (!url.pathname.startsWith("/api/") || !authorized(request)) {
    json(response, 404, { error: "Não encontrado" });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/state") {
    json(response, 200, publicState());
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/territory") {
    saveTerritory(await readJsonBody(request));
    json(response, 200, publicState());
    return;
  }
  const actionMatch = url.pathname.match(/^\/api\/action\/([a-z-]+)$/);
  if (request.method === "POST" && actionMatch) {
    const action = actionMatch[1] as ActionName;
    if (!["configure", "baseline", "discover", "generate", "prepare", "approve", "publish", "admin", "deploy"].includes(action)) {
      json(response, 404, { error: "Etapa desconhecida" });
      return;
    }
    const payload = await readJsonBody(request, 100_000);
    const task = startAction(action, payload);
    json(response, 202, { taskId: task.id });
    return;
  }
  json(response, 404, { error: "Não encontrado" });
}

const server = createServer((request, response) => {
  void route(request, response).catch((error) => json(response, 400, { error: message(error) }));
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`O assistente já parece estar aberto em http://127.0.0.1:${PORT}.`);
    process.exitCode = 1;
    return;
  }
  console.error(`Não foi possível abrir o assistente: ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n✓ Assistente do Territory Installer aberto em ${url}`);
  console.log("  Mantenha esta janela aberta até concluir a instalação.\n");
  if (process.argv.includes("--no-open")) return;
  const command =
    process.platform === "win32"
      ? { file: "cmd.exe", args: ["/c", "start", "", url] }
      : process.platform === "darwin"
        ? { file: "open", args: [url] }
        : { file: "xdg-open", args: [url] };
  try {
    const child = spawn(command.file, command.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    console.log(`Abra ${url} no navegador.`);
  }
});

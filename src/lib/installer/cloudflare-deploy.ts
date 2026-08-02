import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InfrastructureArtifacts } from "./infrastructure";

export interface DeploymentCommand {
  executable: string;
  arguments: string[];
  environment: Record<string, string>;
}

export function createCloudflareDeploymentCommands(
  artifacts: InfrastructureArtifacts,
  cloudflareApiToken: string,
  secretsPath: string,
): { build: DeploymentCommand; deploy: DeploymentCommand } {
  if (!cloudflareApiToken.trim())
    throw new Error("O API Token da Cloudflare não foi informado.");
  if (!existsSync(artifacts.wranglerConfigPath))
    throw new Error("A configuração do Wrangler não foi encontrada.");
  if (!existsSync(secretsPath))
    throw new Error("O arquivo temporário de secrets não foi encontrado.");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return {
    build: {
      executable: npm,
      arguments: ["run", "build"],
      environment: {
        PUBLIC_SUPABASE_URL: artifacts.state.supabase.url,
        PUBLIC_SUPABASE_ANON_KEY: artifacts.state.supabase.publicKey,
      },
    },
    deploy: {
      executable: npm,
      arguments: [
        "exec",
        "--",
        "wrangler",
        "deploy",
        "--config",
        artifacts.wranglerConfigPath,
        "--secrets-file",
        secretsPath,
      ],
      environment: {
        CLOUDFLARE_ACCOUNT_ID: artifacts.state.cloudflare.accountId,
        CLOUDFLARE_API_TOKEN: cloudflareApiToken,
      },
    },
  };
}

export interface TemporarySecretsFile {
  path: string;
  cleanup: () => void;
}

export function createTemporarySecretsFile(input: {
  supabaseAdminKey: string;
  vapidPrivateKey?: string;
}): TemporarySecretsFile {
  if (!input.supabaseAdminKey.trim())
    throw new Error("A chave administrativa do Supabase não foi informada.");
  const directory = mkdtempSync(join(tmpdir(), "territory-deploy-"));
  const path = join(directory, "secrets.env");
  const lines = [
    `SUPABASE_SERVICE_ROLE_KEY=${JSON.stringify(input.supabaseAdminKey)}`,
  ];
  if (input.vapidPrivateKey?.trim())
    lines.push(
      `VAPID_PRIVATE_KEY=${JSON.stringify(input.vapidPrivateKey.trim())}`,
    );
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
  return {
    path,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

export async function runDeploymentCommand(
  command: DeploymentCommand,
  workingDirectory: string,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.arguments, {
      cwd: workingDirectory,
      env: { ...process.env, ...command.environment },
      // Node 24 no Windows não inicia wrappers .cmd diretamente com
      // shell:false (spawn EINVAL). npm/npm exec recebem apenas argumentos
      // montados pelo instalador, então o shell do sistema é seguro aqui.
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const forward = (chunk: Buffer, target: NodeJS.WriteStream) => {
      const text = chunk.toString();
      output += text;
      target.write(text);
    };
    child.stdout.on("data", (chunk: Buffer) => forward(chunk, process.stdout));
    child.stderr.on("data", (chunk: Buffer) => forward(chunk, process.stderr));
    child.on("error", () =>
      reject(new Error("Não foi possível iniciar uma etapa do deploy.")),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else
        reject(new Error(`Uma etapa do deploy terminou com código ${code}.`));
    });
  });
}

export function findDeploymentUrl(output: string): string | undefined {
  return output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\/?/i)?.[0];
}

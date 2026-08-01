import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import postgres from 'postgres';
import { prepareInstallerPackage } from '../src/lib/installer/package';
import { publishInstallerPackage } from '../src/lib/installer/publish';
import type { InstallerConfig, InstallerManifest } from '../src/lib/installer/types';

function option(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function options(name: string): string[] {
  const values: string[] = [];
  process.argv.forEach((argument, index) => {
    if (argument === `--${name}` && process.argv[index + 1]) values.push(process.argv[index + 1]);
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
  npm run installer -- prepare --config installer.config.json --kml territorio.kml --cnefe municipio.csv [--cnefe outro.csv] [--areas quadras.geojson] --output installer-output
  npm run installer -- approve --package installer-output --confirm
  npm run installer -- baseline --db-url postgresql://... --confirm
  npm run installer -- publish --package installer-output --supabase-url https://....supabase.co --service-key ... --confirm

O comando prepare nunca escreve no Supabase. Revise manifest.json, territorio.geojson,
enderecos.json, locais.json e pendencias.json antes de aprovar e publicar.`);
}

function check(): number {
  const checks = [
    ['Node.js 20+', Number(process.versions.node.split('.')[0]) >= 20],
    ['Baseline local encontrada', existsSync(resolve('supabase/baseline/080_storage.sql'))]
  ] as const;
  for (const [label, passed] of checks) console.log(`${passed ? '✓' : '⚠'} ${label}`);
  return checks.every(([, passed]) => passed) ? 0 : 1;
}

function loadConfig(path: string): InstallerConfig {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as InstallerConfig;
  if (!parsed.congregation?.name || !parsed.congregation?.timezone || !parsed.territory?.id || !parsed.cnefe?.edition) {
    throw new Error('Configuração incompleta: congregation.name/timezone, territory.id e cnefe.edition são obrigatórios.');
  }
  return parsed;
}

function prepare(): number {
  const configPath = option('config');
  const kmlPath = option('kml');
  const cnefePaths = options('cnefe');
  const outputDirectory = option('output') ?? 'installer-output';
  const areasPath = option('areas');
  if (!configPath || !kmlPath || cnefePaths.length === 0) {
    console.error('Use --config, --kml e pelo menos um --cnefe.');
    return 1;
  }
  const missing = [configPath, kmlPath, ...cnefePaths, ...(areasPath ? [areasPath] : [])].filter((path) => !existsSync(path));
  if (missing.length > 0) throw new Error(`Arquivo não encontrado: ${missing.join(', ')}`);

  const manifest = prepareInstallerPackage({
    config: loadConfig(configPath),
    kmlPath,
    cnefePaths,
    outputDirectory,
    areasPath: areasPath ?? undefined
  });
  console.log(`✓ Pacote preparado em ${resolve(outputDirectory)}`);
  console.log(`  ${manifest.counts.insideTerritory} endereços dentro do território`);
  console.log(`  ${manifest.counts.outsideTerritory} fora do território`);
  console.log(`  ${manifest.counts.rejectedRows} linhas rejeitadas`);
  console.log('Revise o pacote antes de alterar approved para true. Nenhum dado foi publicado.');
  return 0;
}

function approvePackage(): number {
  const directory = resolve(option('package') ?? 'installer-output');
  const manifestPath = join(directory, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Manifesto não encontrado em ${manifestPath}.`);
  if (!has('confirm')) {
    console.error('A aprovação libera a publicação. Revise o pacote e execute novamente com --confirm.');
    return 2;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as InstallerManifest;
  manifest.approved = true;
  manifest.approvedAt = new Date().toISOString();
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`✓ Pacote aprovado em ${manifest.approvedAt}.`);
  return 0;
}

async function applyBaseline(): Promise<number> {
  const databaseUrl = option('db-url') ?? process.env.SUPABASE_DB_URL ?? null;
  if (!databaseUrl) throw new Error('Informe --db-url ou SUPABASE_DB_URL.');
  if (!has('confirm')) {
    console.error('A baseline altera o banco informado. Revise a URL e execute novamente com --confirm.');
    return 2;
  }
  const baselineDirectory = resolve('supabase/baseline');
  const files = readdirSync(baselineDirectory).filter((file) => /^\d{3}_.+\.sql$/.test(file)).sort();
  if (files.length === 0) throw new Error('Nenhum arquivo da baseline foi encontrado.');

  const localDatabase = /(?:localhost|127\.0\.0\.1)/i.test(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: localDatabase ? false : 'require' });
  try {
    for (const file of files) {
      console.log(`→ Aplicando ${file}`);
      const contents = readFileSync(join(baselineDirectory, file), 'utf8');
      try {
        await sql.begin(async (transaction) => { await transaction.unsafe(contents); });
      } catch (error) {
        throw new Error(`A baseline parou em ${basename(file)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log('✓ Baseline aplicada. Crie o primeiro usuário pelo painel Auth e promova-o conforme QUICKSTART.md.');
  return 0;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (!command || command === 'help' || has('help')) { help(); return 0; }
  if (command === 'check') return check();
  if (command === 'prepare') return prepare();
  if (command === 'approve') return approvePackage();
  if (command === 'baseline') return await applyBaseline();
  if (command === 'publish') {
    if (!has('confirm')) {
      console.error('A publicação altera o Supabase. Execute novamente com --confirm.');
      return 2;
    }
    const packageDirectory = option('package') ?? 'installer-output';
    const supabaseUrl = option('supabase-url') ?? process.env.PUBLIC_SUPABASE_URL ?? null;
    const serviceRoleKey = option('service-key') ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Informe URL e service role por argumentos ou variáveis locais.');
    const manifest = await publishInstallerPackage({ packageDirectory, supabaseUrl, serviceRoleKey });
    console.log(`✓ Publicação concluída: ${manifest.counts.localGroups} locais e ${manifest.counts.units} unidades.`);
    return 0;
  }
  console.error(`Comando desconhecido: ${command}`);
  help();
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

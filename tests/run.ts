// Runner que carrega todos os *.test.ts e roda.
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { run } from './harness';

const dir = path.dirname(fileURLToPath(import.meta.url));
const arquivos = readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort();

for (const f of arquivos) {
  console.log('\n## ' + f);
  await import(pathToFileURL(path.join(dir, f)).href);
}

await run();

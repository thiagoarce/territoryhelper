import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEq, test } from './harness';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function markdownFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (entry === 'node_modules' || entry === '.git') return [];
    return statSync(path).isDirectory() ? markdownFiles(path) : extname(path) === '.md' ? [path] : [];
  });
}

test('links relativos da documentação pública apontam para arquivos existentes', () => {
  const entrypoints = [join(root, 'README.md'), join(root, 'QUICKSTART.md'), join(root, 'CONTRIBUTING.md'), join(root, 'SECURITY.md'), ...markdownFiles(join(root, 'docs'))];
  const broken: string[] = [];
  for (const file of entrypoints) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0].trim();
      if (!target || /^(https?:|mailto:|chatgpt-conversation:)/.test(target)) continue;
      const decoded = decodeURIComponent(target.replace(/^<|>$/g, ''));
      if (!existsSync(resolve(dirname(file), decoded))) broken.push(`${file.slice(root.length + 1)} -> ${target}`);
    }
  }
  assertEq(broken, []);
});

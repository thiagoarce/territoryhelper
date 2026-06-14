// Verifica que todos os arquivos .gs e blocos <script> dos .html são
// JavaScript sintaticamente válido. Catches obvious typos antes de chegar
// no Apps Script (que reporta erros mal formatados).

const fs = require('fs');
const path = require('path');
const { test, assertTrue } = require('./harness');

const ROOT = path.join(__dirname, '..');

function checkGs(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  try { new Function(code); return null; }
  catch(e) { return e.message; }
}

function checkHtmlScripts(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const tags = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
  let i = 0;
  for (const tag of tags) {
    i++;
    const code = tag.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    if (!code.trim()) continue;
    try { new Function(code); }
    catch(e) { return 'script #' + i + ': ' + e.message; }
  }
  return null;
}

// --- Backend ---
['Code.gs', 'Constants.gs', 'Utils.gs', 'ObterQuadrasTurf.gs', 'ObterRuas.gs'].forEach(f => {
  test('sintaxe: ' + f, () => {
    const err = checkGs(f);
    assertTrue(err === null, err || '');
  });
});

// --- Frontend ---
['Index.html', 'JS_App.html', 'Publico.html', 'Dirigente.html', 'CampanhaPublica.html', 'CSS.html'].forEach(f => {
  test('sintaxe: ' + f, () => {
    const err = checkHtmlScripts(f);
    assertTrue(err === null, err || '');
  });
});

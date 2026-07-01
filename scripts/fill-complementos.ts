// ============================================================================
// fill-complementos.ts — patch NÃO-destrutivo pros complementos zerados.
//
// Motivação: o migrate-from-csv.ts antigo priorizava a coluna "Comp. Num."
// do CSV Dados Brutos, que veio VAZIA em toda a base — ficando complemento
// null em todas as unidades. Este script lê o CSV, casa cada linha à
// unidade correspondente no DB e faz APENAS UPDATE dos campos complemento
// e ordem. Não trunca, não muda ids, não mexe em carta_entregue, nada.
//
// Matching:
//   1. Agrupa CSV por (logradouro, numero, quadra_id) — chave natural
//   2. Pra cada local no DB com essa chave, lista unidades ordenadas por id
//   3. Casa POR POSIÇÃO — csv[i] ↔ db[i]
//   4. Só atualiza se qtd unidades bater (segurança) E se complemento tá null
//      no DB (não sobrescreve trabalho feito na app)
//
// USO:
//   1. Confirme migration-data/Dados Brutos.csv existe (mesmo do último import)
//   2. Confira .env: PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   3. npm run fill-complementos
//   4. Confere: select count(*) from unidades where complemento is null;
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import 'dotenv/config';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY === 'placeholder') {
  console.error('❌ Configure PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DATA_DIR = join(process.cwd(), 'migration-data');
const CSV_FILE = 'Dados Brutos.csv';

// ------- CSV parser (mesmo do migrate-from-csv.ts) -----------------
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += c; i++;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

function colIdx(headers: string[], ...nomes: string[]): number {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const headersNorm = headers.map(norm);
  for (const nome of nomes) {
    const idx = headersNorm.indexOf(norm(nome));
    if (idx >= 0) return idx;
  }
  return -1;
}

const toStr = (v: unknown): string => (v == null ? '' : String(v).trim());
const toStrOrNull = (v: unknown): string | null => {
  const s = toStr(v);
  return s === '' ? null : s;
};
const toInt = (v: unknown): number | null => {
  const s = toStr(v).replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? Math.trunc(n) : null;
};

function chaveLocal(logradouro: string, numero: string, quadra: string | null): string {
  return logradouro.trim().toLowerCase() + '|' + numero.trim().toLowerCase() + '|' + (quadra || '_');
}

// ============================================================================
async function main() {
  const path = join(DATA_DIR, CSV_FILE);
  if (!existsSync(path)) {
    console.error(`❌ ${path} não existe.`);
    process.exit(1);
  }
  console.log(`📄 Lendo ${CSV_FILE}...`);
  const text = readFileSync(path, 'utf8');
  const all = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''));
  const headers = all[0].map((h) => h.trim());
  const rows = all.slice(1);
  console.log(`   ${rows.length} linhas`);

  const c = {
    quadra: colIdx(headers, 'Quadra'),
    logradouro: colIdx(headers, 'Logradouro'),
    numero: colIdx(headers, 'Numero', 'Número'),
    complementoNum: colIdx(headers, 'Comp. Num.', 'Comp Num', 'Comp'),
    complementoTxt: colIdx(headers, 'Complemento'),
    ordem: colIdx(headers, 'Ordem Personalizada', 'OrdemPersonalizada', 'Ordem')
  };
  if (c.logradouro < 0 || c.numero < 0) {
    console.error(`❌ Colunas Logradouro/Número não achadas. Headers: ${headers.join(', ')}`);
    process.exit(1);
  }
  if (c.complementoNum < 0 && c.complementoTxt < 0) {
    console.error(`❌ Nenhuma coluna de complemento encontrada.`);
    process.exit(1);
  }

  // Agrupa CSV por chave natural (logradouro, numero, quadra) — mesma
  // estratégia do import; cada grupo vira 1 local com N unidades ordenadas
  // pela ordem que aparecem no CSV.
  const grupos = new Map<string, { complemento: string | null; ordem: number | null }[]>();
  for (const r of rows) {
    const logradouro = toStr(r[c.logradouro]);
    const numero = toStr(r[c.numero]);
    if (!logradouro && !numero) continue;
    const quadra = toStrOrNull(r[c.quadra]);
    const compNum = c.complementoNum >= 0 ? toStrOrNull(r[c.complementoNum]) : null;
    const compTxt = c.complementoTxt >= 0 ? toStrOrNull(r[c.complementoTxt]) : null;
    const k = chaveLocal(logradouro, numero, quadra);
    let g = grupos.get(k);
    if (!g) { g = []; grupos.set(k, g); }
    g.push({ complemento: compNum ?? compTxt, ordem: toInt(r[c.ordem]) });
  }
  console.log(`   ${grupos.size} locais únicos no CSV`);

  // Carrega TODOS os locais do DB (paginado) + suas unidades ordenadas por id
  console.log(`🔗 Carregando locais + unidades do banco...`);
  const locaisDb: { id: number; logradouro: string; numero: string; quadra_id: string | null }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await db
      .from('locais')
      .select('id, logradouro, numero, quadra_id')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    locaisDb.push(...data as any);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`   ${locaisDb.length} locais no DB`);

  const unidadesDb: { id: number; local_id: number; complemento: string | null }[] = [];
  from = 0;
  while (true) {
    const { data, error } = await db
      .from('unidades')
      .select('id, local_id, complemento')
      .order('local_id')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    unidadesDb.push(...data as any);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`   ${unidadesDb.length} unidades no DB`);

  // Agrupa unidades por local_id
  const unidadesPorLocal = new Map<number, typeof unidadesDb>();
  for (const u of unidadesDb) {
    let arr = unidadesPorLocal.get(u.local_id);
    if (!arr) { arr = []; unidadesPorLocal.set(u.local_id, arr); }
    arr.push(u);
  }

  // Matcheia CSV → DB
  let matched = 0;
  let skippedDivergencia = 0;
  let skippedSemMatch = 0;
  let jaTemComp = 0;
  const updates: { id: number; complemento: string | null; ordem: number | null }[] = [];

  for (const local of locaisDb) {
    const k = chaveLocal(local.logradouro, local.numero, local.quadra_id);
    const csvUnidades = grupos.get(k);
    if (!csvUnidades) { skippedSemMatch++; continue; }
    const dbUnidades = unidadesPorLocal.get(local.id) ?? [];
    if (csvUnidades.length !== dbUnidades.length) {
      skippedDivergencia++;
      console.warn(`   ⚠ ${local.logradouro}, ${local.numero} (q=${local.quadra_id}): csv=${csvUnidades.length} db=${dbUnidades.length} — pulando`);
      continue;
    }
    for (let i = 0; i < dbUnidades.length; i++) {
      const dbU = dbUnidades[i];
      const csvU = csvUnidades[i];
      if (dbU.complemento != null && dbU.complemento !== '') {
        jaTemComp++;
        continue; // preserva o que já tá preenchido (trabalho na app)
      }
      if (csvU.complemento == null && csvU.ordem == null) continue;
      updates.push({ id: dbU.id, complemento: csvU.complemento, ordem: csvU.ordem });
      matched++;
    }
  }

  console.log(`\n📊 Resumo:`);
  console.log(`   ${matched} unidades pra atualizar`);
  console.log(`   ${jaTemComp} já tinham complemento (preservadas)`);
  console.log(`   ${skippedDivergencia} locais com contagem divergente (puladas — checar manualmente)`);
  console.log(`   ${skippedSemMatch} locais no DB sem match no CSV (ok se você criou pela app)`);

  if (updates.length === 0) {
    console.log(`\n✅ Nada a fazer.`);
    return;
  }

  console.log(`\n🚀 Executando ${updates.length} UPDATEs...`);
  const chunk = 200;
  for (let i = 0; i < updates.length; i += chunk) {
    const batch = updates.slice(i, i + chunk);
    // Faz cada UPDATE independente (não dá pra bulk update com valores
    // diferentes via PostgREST fácil). Poderia usar exec_sql com CASE,
    // mas com 200 por vez direto tá rápido o suficiente.
    await Promise.all(
      batch.map((u) =>
        db.from('unidades').update({ complemento: u.complemento, ordem: u.ordem }).eq('id', u.id)
      )
    );
    process.stdout.write(`\r   ${Math.min(i + chunk, updates.length)}/${updates.length}...`);
  }
  console.log(`\n\n🎉 Feito!`);
  console.log(`\nConfere: select count(*) from unidades where complemento is null;`);
}

main().catch((e) => {
  console.error('\n💥 Erro fatal:', e);
  process.exit(1);
});

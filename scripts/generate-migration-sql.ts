// ============================================================================
// Gera arquivos SQL com INSERTs prontos pra colar no Supabase SQL Editor.
// Não faz network call — só lê CSVs locais e escreve .sql em ./migration-data/sql/.
//
// USO: npx tsx scripts/generate-migration-sql.ts
// Output: migration-data/sql/01_territorios.sql ... 08_campanha.sql
//
// Cada arquivo:
//   - TRUNCATE (limpa antes de inserir; pode rodar várias vezes sem dor)
//   - INSERTs em chunks de ~500 linhas (SQL Editor aceita statements grandes)
//   - SETVAL ajusta sequence pra próximos inserts não colidirem
//
// IDs gerados explicitamente pra locais e unidades (pra resolver FK no SQL
// sem precisar de RETURNING que requer round-trip).
// ============================================================================

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(process.cwd(), 'migration-data');
const SQL_DIR = join(DATA_DIR, 'sql');
mkdirSync(SQL_DIR, { recursive: true });

// ============================================================================
// CSV parser
// ============================================================================
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

function readCSV(filename: string, withHeader = true): { headers: string[]; rows: string[][] } | null {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) { console.warn(`⚠️  ${filename} não encontrado`); return null; }
  const text = readFileSync(path, 'utf8');
  const all = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (all.length === 0) return { headers: [], rows: [] };
  const headers = withHeader ? all[0].map((h) => h.trim()) : [];
  const rows = withHeader ? all.slice(1) : all;
  console.log(`📄 ${filename}: ${rows.length} linhas`);
  return { headers, rows };
}

// ============================================================================
// Helpers de coerção
// ============================================================================
const toStr = (v: unknown) => (v == null ? '' : String(v).trim());
const toNum = (v: unknown): number | null => {
  const s = toStr(v).replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
};
const toInt = (v: unknown): number | null => {
  const n = toNum(v);
  return n == null ? null : Math.trunc(n);
};
const toBool = (v: unknown): boolean => {
  const s = toStr(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'sim' || s === 'yes' || s === 'verdadeiro';
};
const toDate = (v: unknown): string | null => {
  const s = toStr(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
};
const toTs = (v: unknown): string | null => {
  const s = toStr(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.substring(0, 19);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5].padStart(2, '0')}:${m[6].padStart(2, '0')}`;
  }
  return null;
};

function colIdx(headers: string[], ...nomes: string[]): number {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const headersNorm = headers.map(norm);
  for (const nome of nomes) {
    const idx = headersNorm.indexOf(norm(nome));
    if (idx >= 0) return idx;
  }
  return -1;
}

function chaveLocal(log: string, num: string): string {
  return log.trim().toLowerCase() + '|' + num.trim().toLowerCase();
}

function normalizarStatus(s: string): string {
  const norm = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return norm || 'pendente';
}

function polyStringToWKT(polyString: string): string | null {
  if (!polyString) return null;
  const pts = polyString.split('|').map((s) => s.trim()).filter(Boolean).map((p) => {
    const parts = p.split(',').map((x) => parseFloat(x.trim()));
    if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) return null;
    return [parts[0], parts[1]] as [number, number];
  }).filter((p): p is [number, number] => p !== null);
  if (pts.length < 3) return null;
  const first = pts[0], last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);
  const wkt = pts.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
  return `SRID=4326;POLYGON((${wkt}))`;
}

function decidirTipoLocal(tipoUnidade: string, qtdUnidades: number, marcadoComoPredio: boolean): string {
  if (marcadoComoPredio) return 'predio';
  if (qtdUnidades >= 2) return 'predio';
  const t = tipoUnidade.toLowerCase();
  if (t.includes('apartamento')) return 'predio';
  if (t.includes('comercio') || t.includes('comércio') || t.includes('comercial')) return 'comercio';
  if (t.includes('coletivo') || t.includes('alojamento') || t.includes('asilo')) return 'coletivo';
  if (t.includes('terreno') || t.includes('lote')) return 'terreno';
  return 'casa';
}

// ============================================================================
// SQL escaping
// ============================================================================
function sqlStr(v: string | null | undefined): string {
  if (v == null) return 'NULL';
  return "'" + v.replace(/'/g, "''") + "'";
}
function sqlNum(v: number | null | undefined): string {
  return v == null ? 'NULL' : String(v);
}
function sqlBool(v: boolean | null | undefined): string {
  return v == null ? 'NULL' : (v ? 'TRUE' : 'FALSE');
}
function sqlDate(v: string | null | undefined): string {
  return v == null ? 'NULL' : `'${v}'::date`;
}
function sqlTs(v: string | null | undefined): string {
  return v == null ? 'NULL' : `'${v}'::timestamptz`;
}
function sqlGeom(wkt: string | null): string {
  return wkt == null ? 'NULL' : `${sqlStr(wkt)}::geometry`;
}
function sqlArrText(arr: string[]): string {
  return `ARRAY[${arr.map(sqlStr).join(', ')}]::text[]`;
}

// Insere em chunks (cada chunk = um statement INSERT)
function chunkedInsert(table: string, cols: string[], rows: string[][], chunkSize = 500): string {
  if (rows.length === 0) return '';
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    out.push(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n` +
      slice.map((r) => '  (' + r.join(', ') + ')').join(',\n') +
      ';\n'
    );
  }
  return out.join('\n');
}

function writeSQL(name: string, content: string) {
  const path = join(SQL_DIR, name);
  writeFileSync(path, content);
  console.log(`✏️  Gerado: sql/${name} (${(content.length / 1024).toFixed(1)} KB)`);
}

// ============================================================================
// 1. Territorios
// ============================================================================
function genTerritorios(): string {
  const csv = readCSV('Territorios.csv');
  if (!csv) return '';
  const { headers, rows } = csv;
  const c = {
    nome: colIdx(headers, 'Nome'),
    cor: colIdx(headers, 'Cor'),
    labelType: colIdx(headers, 'label_type', 'labelType', 'labelVisibility'),
    status: colIdx(headers, 'Status', 'Situação', 'Situacao'),
    dataConc: colIdx(headers, 'Data conclusao', 'dataConclusao', 'data_conclusao', 'Data de Conclusão', 'Data de Conclusao')
  };
  const cols = ['id', 'nome', 'cor', 'label_type', 'status', 'data_conclusao'];
  const linhas: string[][] = [];
  for (const r of rows) {
    const nome = toStr(r[c.nome]);
    if (!nome) continue;
    linhas.push([
      sqlStr(nome),
      sqlStr(nome),
      sqlStr(toStr(r[c.cor]) || '#3388ff'),
      sqlStr(toStr(r[c.labelType]) || null),
      sqlStr(normalizarStatus(toStr(r[c.status]))),
      sqlDate(toDate(r[c.dataConc]))
    ]);
  }
  return `-- ====================\n-- Territorios (${linhas.length})\n-- ====================\nTRUNCATE TABLE territorios RESTART IDENTITY CASCADE;\n\n${chunkedInsert('territorios', cols, linhas)}`;
}

// ============================================================================
// 2. Quadras (com PostGIS)
// ============================================================================
function genQuadras(): string {
  const csv = readCSV('Quadras.csv');
  if (!csv) return '';
  const { headers, rows } = csv;
  const c = {
    id: colIdx(headers, 'ID', 'Id', 'id', 'ID Quadra'),
    poly: colIdx(headers, 'polyString', 'poly_string', 'poly', 'Polígono', 'Poligono'),
    color: colIdx(headers, 'Color', 'Cor'),
    territorio: colIdx(headers, 'Territorio', 'Território', 'territorio'),
    status: colIdx(headers, 'Status', 'Situação', 'Situacao'),
    dataConc: colIdx(headers, 'Data conclusao', 'dataConclusao', 'data_conclusao', 'Data de Conclusão', 'Data de Conclusao')
  };
  const cols = ['id', 'poly', 'color', 'territorio_id', 'status', 'data_conclusao'];
  const linhas: string[][] = [];
  let semPoly = 0;
  for (const r of rows) {
    const qid = toStr(r[c.id]);
    if (!qid) continue;
    const wkt = polyStringToWKT(toStr(r[c.poly]));
    if (!wkt) { semPoly++; continue; }
    linhas.push([
      sqlStr(qid),
      sqlGeom(wkt),
      sqlStr(toStr(r[c.color]) || '#3388ff'),
      sqlStr(toStr(r[c.territorio]) || null),
      sqlStr(normalizarStatus(toStr(r[c.status]))),
      sqlDate(toDate(r[c.dataConc]))
    ]);
  }
  if (semPoly > 0) console.log(`  ⚠️  ${semPoly} quadras sem polígono — descartadas`);
  return `-- ====================\n-- Quadras (${linhas.length})\n-- ====================\nTRUNCATE TABLE quadras RESTART IDENTITY CASCADE;\n\n${chunkedInsert('quadras', cols, linhas)}`;
}

// ============================================================================
// 3 + 4: Locais + Unidades (agrupados por logradouro+numero+quadra)
// IDs gerados em sequência (1, 2, 3, ...) pra resolver FK no SQL.
// ============================================================================
interface LocalAggregator {
  chave: string;
  logradouro: string;
  numero: string;
  quadra_id: string | null;
  setor: string | null;
  quadra_ibge: string | null;
  face_ibge: string | null;
  lat: number | null;
  lng: number | null;
  unidades: {
    legacy_row: number;
    complemento: string | null;
    ordem: number | null;
    nota: string | null;
    nao_visitar: boolean;
    tipo_unidade: string;
  }[];
}

const mapaLocalIdPorChave = new Map<string, number>();
const mapaUnidadeIdPorLegacyRow = new Map<number, number>();

function genLocaisEUnidades(): { sqlLocais: string; sqlUnidades: string } {
  const csv = readCSV('Dados Brutos.csv');
  if (!csv) return { sqlLocais: '', sqlUnidades: '' };
  const { headers, rows } = csv;
  const c = {
    quadra: colIdx(headers, 'Quadra'),
    setor: colIdx(headers, 'Setor', 'Setor IBGE'),
    qIbge: colIdx(headers, 'QIBGE', 'Quadra IBGE', 'Quadra-IBGE'),
    faceIbge: colIdx(headers, 'FaceIBGE', 'Face IBGE', 'Face-IBGE'),
    logradouro: colIdx(headers, 'Logradouro'),
    numero: colIdx(headers, 'Numero', 'Número'),
    complemento: colIdx(headers, 'Comp', 'Complemento'),
    lat: colIdx(headers, 'Lat', 'Latitude'),
    lng: colIdx(headers, 'Lng', 'Lon', 'Long', 'Longitude'),
    tipo: colIdx(headers, 'Tipo'),
    nome: colIdx(headers, 'Nome', 'Nome Estabelecimento'),
    nota: colIdx(headers, 'Nota'),
    naoVisitar: colIdx(headers, 'NaoVisitar', 'Não Visitar', 'Não visitar', 'nao_visitar'),
    ordem: colIdx(headers, 'Ordem')
  };

  // Agrupa
  const locaisAgrupados = new Map<string, LocalAggregator>();
  const nomeEdifPorChave = new Map<string, string>();
  rows.forEach((r, i) => {
    const legacyRow = i + 2;
    const logradouro = toStr(r[c.logradouro]);
    const numero = toStr(r[c.numero]);
    if (!logradouro && !numero) return;
    const quadraId = toStr(r[c.quadra]) || null;
    const chaveBase = chaveLocal(logradouro, numero);
    const chaveCompleta = chaveBase + '@' + (quadraId || '_');

    let agg = locaisAgrupados.get(chaveCompleta);
    if (!agg) {
      agg = {
        chave: chaveBase,
        logradouro,
        numero,
        quadra_id: quadraId,
        setor: toStr(r[c.setor]) || null,
        quadra_ibge: toStr(r[c.qIbge]) || null,
        face_ibge: toStr(r[c.faceIbge]) || null,
        lat: toNum(r[c.lat]),
        lng: toNum(r[c.lng]),
        unidades: []
      };
      locaisAgrupados.set(chaveCompleta, agg);
    }
    agg.unidades.push({
      legacy_row: legacyRow,
      complemento: toStr(r[c.complemento]) || null,
      ordem: toInt(r[c.ordem]),
      nota: toStr(r[c.nota]) || null,
      nao_visitar: toBool(r[c.naoVisitar]),
      tipo_unidade: toStr(r[c.tipo])
    });
    const nomeEdif = toStr(r[c.nome]);
    if (nomeEdif && !nomeEdifPorChave.has(chaveBase)) nomeEdifPorChave.set(chaveBase, nomeEdif);
  });

  // Overlay de Predios.csv
  type Overlay = {
    nome?: string;
    irmao_mora?: boolean;
    nome_irmao?: string;
    notas?: string;
    tipo_entrada?: string;
    acesso_caixas?: boolean;
    acesso_interfones?: boolean;
    nao_eh_predio?: boolean;
  };
  const overlayPredios = new Map<string, Overlay>();
  const predCsv = readCSV('Predios.csv');
  if (predCsv) {
    const pc = {
      chave: colIdx(predCsv.headers, 'chave', 'Chave'),
      nome: colIdx(predCsv.headers, 'nome'),
      irmaoMora: colIdx(predCsv.headers, 'irmaoMora', 'irmao_mora'),
      nomeIrmao: colIdx(predCsv.headers, 'nomeIrmao', 'nome_irmao'),
      notas: colIdx(predCsv.headers, 'notas'),
      tipoEntrada: colIdx(predCsv.headers, 'tipoEntrada', 'tipo_entrada'),
      acessoCaixas: colIdx(predCsv.headers, 'acessoCaixas', 'acesso_caixas'),
      acessoInterfones: colIdx(predCsv.headers, 'acessoInterfones', 'acesso_interfones'),
      naoEhPredio: colIdx(predCsv.headers, 'naoEhPredio', 'nao_eh_predio')
    };
    for (const r of predCsv.rows) {
      const k = toStr(r[pc.chave]).toLowerCase();
      if (!k) continue;
      overlayPredios.set(k, {
        nome: toStr(r[pc.nome]) || undefined,
        irmao_mora: toBool(r[pc.irmaoMora]),
        nome_irmao: toStr(r[pc.nomeIrmao]) || undefined,
        notas: toStr(r[pc.notas]) || undefined,
        tipo_entrada: toStr(r[pc.tipoEntrada]) || undefined,
        acesso_caixas: toBool(r[pc.acessoCaixas]),
        acesso_interfones: toBool(r[pc.acessoInterfones]),
        nao_eh_predio: toBool(r[pc.naoEhPredio])
      });
    }
  }

  // Overlay de PrediosAptos.csv por legacy_row
  const aptoOverlayPorRow = new Map<number, { carta_escrita?: string; carta_entregue?: string; desocupado?: boolean; nao_escrever?: boolean }>();
  const aptosCsv = readCSV('PrediosAptos.csv');
  if (aptosCsv) {
    const ac = {
      row: colIdx(aptosCsv.headers, 'row', 'ROW'),
      cartaEscrita: colIdx(aptosCsv.headers, 'cartaEscrita', 'carta_escrita'),
      cartaEntregue: colIdx(aptosCsv.headers, 'cartaEntregue', 'carta_entregue'),
      desocupado: colIdx(aptosCsv.headers, 'desocupado'),
      naoEscrever: colIdx(aptosCsv.headers, 'naoEscrever', 'nao_escrever')
    };
    for (const r of aptosCsv.rows) {
      const oldRow = toInt(r[ac.row]);
      if (oldRow == null) continue;
      aptoOverlayPorRow.set(oldRow, {
        carta_escrita: toDate(r[ac.cartaEscrita]) || undefined,
        carta_entregue: toDate(r[ac.cartaEntregue]) || undefined,
        desocupado: toBool(r[ac.desocupado]),
        nao_escrever: toBool(r[ac.naoEscrever])
      });
    }
  }

  // Gera IDs e linhas pra locais
  const colsLocais = [
    'id', 'tipo', 'logradouro', 'numero', 'geo', 'quadra_id', 'setor', 'quadra_ibge',
    'face_ibge', 'nome', 'irmao_mora', 'nome_irmao', 'notas', 'tipo_entrada',
    'acesso_caixas', 'acesso_interfones', 'nao_visitar'
  ];
  const linhasLocais: string[][] = [];
  let nextLocalId = 1;
  for (const [chaveCompleta, agg] of locaisAgrupados) {
    const id = nextLocalId++;
    mapaLocalIdPorChave.set(chaveCompleta, id);
    const overlay = overlayPredios.get(agg.chave) ?? {};
    const tipo = decidirTipoLocal(agg.unidades[0]?.tipo_unidade || '', agg.unidades.length, false);
    const nomeEdif = overlay.nome ?? nomeEdifPorChave.get(agg.chave) ?? null;
    const geoWkt = agg.lat != null && agg.lng != null
      ? `SRID=4326;POINT(${agg.lng} ${agg.lat})`
      : null;
    linhasLocais.push([
      sqlNum(id),
      sqlStr(tipo),
      sqlStr(agg.logradouro || '(sem nome)'),
      sqlStr(agg.numero || 's/n'),
      sqlGeom(geoWkt),
      sqlStr(agg.quadra_id),
      sqlStr(agg.setor),
      sqlStr(agg.quadra_ibge),
      sqlStr(agg.face_ibge),
      sqlStr(nomeEdif),
      sqlBool(overlay.irmao_mora ?? false),
      sqlStr(overlay.nome_irmao ?? null),
      sqlStr(overlay.notas ?? null),
      sqlStr(overlay.tipo_entrada ?? null),
      sqlBool(overlay.acesso_caixas ?? false),
      sqlBool(overlay.acesso_interfones ?? false),
      sqlBool(overlay.nao_eh_predio ?? false)
    ]);
  }

  // Unidades
  const colsUnidades = [
    'id', 'local_id', 'complemento', 'ordem', 'nota', 'legacy_row',
    'carta_escrita', 'carta_entregue', 'desocupado', 'nao_escrever'
  ];
  const linhasUnidades: string[][] = [];
  let nextUnidadeId = 1;
  for (const [chaveCompleta, agg] of locaisAgrupados) {
    const localId = mapaLocalIdPorChave.get(chaveCompleta)!;
    for (const u of agg.unidades) {
      const id = nextUnidadeId++;
      mapaUnidadeIdPorLegacyRow.set(u.legacy_row, id);
      const overlay = aptoOverlayPorRow.get(u.legacy_row) ?? {};
      linhasUnidades.push([
        sqlNum(id),
        sqlNum(localId),
        sqlStr(u.complemento),
        sqlNum(u.ordem),
        sqlStr(u.nota),
        sqlNum(u.legacy_row),
        sqlDate(overlay.carta_escrita ?? null),
        sqlDate(overlay.carta_entregue ?? null),
        sqlBool(overlay.desocupado ?? false),
        sqlBool(overlay.nao_escrever ?? false)
      ]);
    }
  }

  const sqlLocais = `-- ====================\n-- Locais (${linhasLocais.length} agrupados de Dados Brutos)\n-- ====================\nTRUNCATE TABLE locais RESTART IDENTITY CASCADE;\n\n${chunkedInsert('locais', colsLocais, linhasLocais, 300)}\n\nSELECT setval('locais_id_seq', GREATEST(1, (SELECT MAX(id) FROM locais)), true);\n`;
  const sqlUnidades = `-- ====================\n-- Unidades (${linhasUnidades.length})\n-- ====================\nTRUNCATE TABLE unidades RESTART IDENTITY CASCADE;\n\n${chunkedInsert('unidades', colsUnidades, linhasUnidades, 500)}\n\nSELECT setval('unidades_id_seq', GREATEST(1, (SELECT MAX(id) FROM unidades)), true);\n`;
  return { sqlLocais, sqlUnidades };
}

// ============================================================================
// 5. Registros
// ============================================================================
function genRegistros(): string {
  const csv = readCSV('Registros.csv', false);
  if (!csv) return '';
  const headers = ['ID', 'Data', 'Tipo', 'TS'];
  const c = { id: 0, data: 1, tipo: 2, ts: 3 };
  void headers;
  const cols = ['unidade_id', 'tipo', 'ts', 'dados'];
  const linhas: string[][] = [];
  let semFk = 0;
  for (const r of csv.rows) {
    const oldRow = toInt(r[c.id]);
    if (oldRow == null) { semFk++; continue; }
    const unidadeId = mapaUnidadeIdPorLegacyRow.get(oldRow);
    if (unidadeId == null) { semFk++; continue; }
    linhas.push([
      sqlNum(unidadeId),
      sqlStr(toStr(r[c.tipo]) || 'manual'),
      sqlTs(toTs(r[c.ts]) || new Date(2026, 0, 1).toISOString()),
      'NULL'
    ]);
  }
  if (semFk > 0) console.log(`  ⚠️  Registros: ${semFk} pulados (ID não bate com unidade)`);
  return `-- ====================\n-- Registros (${linhas.length})\n-- ====================\nTRUNCATE TABLE registros RESTART IDENTITY CASCADE;\n\n${chunkedInsert('registros', cols, linhas, 500)}\n\nSELECT setval('registros_id_seq', GREATEST(1, (SELECT MAX(id) FROM registros)), true);\n`;
}

// ============================================================================
// 6. TCEs + junção
// ============================================================================
function genTCEs(): string {
  const csv = readCSV('TerritoriosEspeciais.csv');
  if (!csv) return '';
  const { headers, rows } = csv;
  const c = {
    id: colIdx(headers, 'ID', 'Id', 'id'),
    nome: colIdx(headers, 'nome'),
    tipo: colIdx(headers, 'tipo'),
    rows: colIdx(headers, 'rows'),
    poly: colIdx(headers, 'polyString', 'poly_string'),
    prazo: colIdx(headers, 'prazo'),
    status: colIdx(headers, 'status'),
    criado: colIdx(headers, 'criado'),
    dataConc: colIdx(headers, 'dataConclusao', 'data_conclusao'),
    notas: colIdx(headers, 'notas')
  };
  const colsTces = [
    'id', 'nome', 'tipo', 'poly', 'publicador_id', 'prazo',
    'status', 'criado_em', 'data_conclusao', 'notas'
  ];
  const linhasTces: string[][] = [];
  const junctions: { tce_id: string; unidade_id: number }[] = [];
  for (const r of rows) {
    const id = toStr(r[c.id]);
    if (!id) continue;
    const oldRows = toStr(r[c.rows]).split(',').map((s) => toInt(s.trim())).filter((n): n is number => n != null);
    const unidadeIds = oldRows.map((or) => mapaUnidadeIdPorLegacyRow.get(or)).filter((x): x is number => x != null);
    linhasTces.push([
      sqlStr(id),
      sqlStr(toStr(r[c.nome]) || id),
      sqlStr(toStr(r[c.tipo]) || 'comercial'),
      sqlGeom(polyStringToWKT(toStr(r[c.poly]))),
      'NULL',
      sqlDate(toDate(r[c.prazo])),
      sqlStr(toStr(r[c.status]) || 'aberto'),
      sqlTs(toTs(r[c.criado]) || new Date(2026, 0, 1).toISOString()),
      sqlDate(toDate(r[c.dataConc])),
      sqlStr(toStr(r[c.notas]) || null)
    ]);
    for (const uid of unidadeIds) junctions.push({ tce_id: id, unidade_id: uid });
  }
  const sqlTces = `-- ====================\n-- TCEs (${linhasTces.length}) + tce_unidades (${junctions.length})\n-- ====================\nTRUNCATE TABLE tces RESTART IDENTITY CASCADE;\n\n${chunkedInsert('tces', colsTces, linhasTces)}\n${junctions.length > 0 ? chunkedInsert('tce_unidades', ['tce_id', 'unidade_id'], junctions.map((j) => [sqlStr(j.tce_id), sqlNum(j.unidade_id)])) : ''}`;
  return sqlTces;
}

// ============================================================================
// 7. Designacoes + junção
// (publicador era nome string — vira NULL, admin re-atribui no app novo)
// ============================================================================
function genDesignacoes(): string {
  const csv = readCSV('Designacoes.csv');
  if (!csv) return '';
  const { headers, rows } = csv;
  const c = {
    ids: colIdx(headers, 'ids_quadras', 'idsQuadras', 'IDs Quadras', 'ids'),
    publicador: colIdx(headers, 'publicador'),
    criada: colIdx(headers, 'criada'),
    prazo: colIdx(headers, 'prazo'),
    status: colIdx(headers, 'status'),
    notas: colIdx(headers, 'notas')
  };

  let parts: string[] = [
    '-- ====================',
    '-- Designacoes + designacao_quadras',
    '-- (publicador antigo era nome string — fica NULL; admin reatribui no app novo)',
    '-- ====================',
    'TRUNCATE TABLE designacoes RESTART IDENTITY CASCADE;',
    ''
  ];
  let designacaoId = 1;
  const designacoesLinhas: string[][] = [];
  const juncoes: { designacao_id: number; quadra_id: string }[] = [];
  for (const r of rows) {
    const idsTxt = toStr(r[c.ids]);
    if (!idsTxt) continue;
    const quadras = idsTxt.split(',').map((s) => s.trim()).filter(Boolean);
    if (quadras.length === 0) continue;
    designacoesLinhas.push([
      sqlNum(designacaoId),
      'NULL', // publicador_id (era nome string)
      sqlTs(toTs(r[c.criada]) || new Date(2026, 0, 1).toISOString()),
      sqlDate(toDate(r[c.prazo])),
      sqlStr(toStr(r[c.status]) || 'aberta'),
      sqlStr(toStr(r[c.notas]) || null)
    ]);
    for (const qid of quadras) juncoes.push({ designacao_id: designacaoId, quadra_id: qid });
    designacaoId++;
  }
  parts.push(chunkedInsert(
    'designacoes',
    ['id', 'publicador_id', 'criada_em', 'prazo', 'status', 'notas'],
    designacoesLinhas
  ));
  parts.push("SELECT setval('designacoes_id_seq', GREATEST(1, (SELECT MAX(id) FROM designacoes)), true);");
  parts.push('');
  if (juncoes.length > 0) {
    parts.push(chunkedInsert(
      'designacao_quadras',
      ['designacao_id', 'quadra_id'],
      juncoes.map((j) => [sqlNum(j.designacao_id), sqlStr(j.quadra_id)])
    ));
  }
  return parts.join('\n');
}

// ============================================================================
// 8. Campanha
// ============================================================================
function genCampanha(): string {
  const csv = readCSV('Campanha.csv');
  if (!csv) return '';
  const { headers, rows } = csv;
  const c = {
    tipo: colIdx(headers, 'tipo'),
    modalidade: colIdx(headers, 'modalidade'),
    titulo: colIdx(headers, 'titulo'),
    descricao: colIdx(headers, 'descricao'),
    link: colIdx(headers, 'link'),
    anexoNome: colIdx(headers, 'anexoNome', 'anexo_nome'),
    anexoUrl: colIdx(headers, 'anexoUrl', 'anexo_url'),
    publico: colIdx(headers, 'publico'),
    ordem: colIdx(headers, 'ordem'),
    criado: colIdx(headers, 'criado')
  };
  const cols = [
    'tipo', 'modalidade', 'titulo', 'descricao', 'link',
    'anexo_nome', 'anexo_url', 'publico', 'ordem', 'criado_em'
  ];
  const linhas: string[][] = [];
  for (const r of rows) {
    const titulo = toStr(r[c.titulo]);
    if (!titulo) continue;
    linhas.push([
      sqlStr(toStr(r[c.tipo]) || 'geral'),
      sqlStr(toStr(r[c.modalidade]) || 'casa'),
      sqlStr(titulo),
      sqlStr(toStr(r[c.descricao]) || null),
      sqlStr(toStr(r[c.link]) || null),
      sqlStr(toStr(r[c.anexoNome]) || null),
      sqlStr(toStr(r[c.anexoUrl]) || null),
      sqlBool(toBool(r[c.publico])),
      sqlNum(toInt(r[c.ordem]) ?? 0),
      sqlTs(toTs(r[c.criado]) || new Date(2026, 0, 1).toISOString())
    ]);
  }
  return `-- ====================\n-- Campanha (${linhas.length})\n-- ====================\nTRUNCATE TABLE campanha RESTART IDENTITY CASCADE;\n\n${chunkedInsert('campanha', cols, linhas)}`;
}

// ============================================================================
// Main
// ============================================================================
console.log('🚀 Gerando SQL files…\n');
writeSQL('01_territorios.sql', genTerritorios());
writeSQL('02_quadras.sql', genQuadras());
const { sqlLocais, sqlUnidades } = genLocaisEUnidades();
writeSQL('03_locais.sql', sqlLocais);
writeSQL('04_unidades.sql', sqlUnidades);
writeSQL('05_registros.sql', genRegistros());
writeSQL('06_tces.sql', genTCEs());
writeSQL('07_designacoes.sql', genDesignacoes());
writeSQL('08_campanha.sql', genCampanha());

console.log('\n🎉 Pronto! Arquivos em migration-data/sql/');
console.log('   Cole cada um no Supabase SQL Editor na ordem (01 → 08).');

// ============================================================================
// Migração one-shot: CSVs exportados do Google Sheets (app antigo) → Postgres.
//
// Modelo novo (branch pwa-rewrite, após redesign):
//   - Dados Brutos é AGRUPADO por (logradouro, numero) → cada grupo vira
//     1 local + N unidades. Não há mais 30 linhas duplicadas pra 1 prédio.
//   - Predios.csv mescla em locais (overlay: nome, irmão mora, portaria...)
//   - PrediosAptos.csv mescla em unidades (overlay: carta, desocupado...)
//   - Registros aponta pra unidades via legacy_row → unidade_id
//   - Quadras.poly_string ("lat,lng | lat,lng") vira PostGIS Polygon
//   - TCEs.endereco_ids (CSV de rows) vira tabela junção tce_unidades
//
// USO:
//   1. Exporte cada aba do Sheets como CSV (Arquivo → Download → .csv)
//   2. Coloque em ./migration-data/ com nomes:
//        Quadras.csv, Territorios.csv, Dados Brutos.csv, Registros.csv,
//        Predios.csv, PrediosAptos.csv, Designacoes.csv, Campanha.csv,
//        TerritoriosEspeciais.csv
//   3. Configure .env (PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//   4. Rode as migrations 001..008 no Supabase SQL Editor
//   5. npm run migrate
//
// IDEMPOTÊNCIA: limpa cada tabela antes de inserir. Roda quantas vezes quiser.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, statSync } from 'node:fs';
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

// ============================================================================
// CSV parser — RFC 4180. Suporta quote-escape ("") + BOM + CRLF.
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

function readCSV(filename: string): { headers: string[]; rows: string[][] } | null {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) {
    console.warn(`⚠️  ${filename} não encontrado — pulando.`);
    return null;
  }
  const text = readFileSync(path, 'utf8');
  const all = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (all.length === 0) return { headers: [], rows: [] };
  const headers = all[0].map((h) => h.trim());
  const rows = all.slice(1);
  console.log(`📄 ${filename}: ${rows.length} linhas`);
  return { headers, rows };
}

// Registros.csv do GAS antigo NÃO tem header — primeira linha já é dado.
// Colunas conhecidas: ID, Data, Tipo, TS.
function readRegistrosCSV(filename: string): { headers: string[]; rows: string[][] } | null {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) {
    console.warn(`⚠️  ${filename} não encontrado — pulando.`);
    return null;
  }
  const text = readFileSync(path, 'utf8');
  const rows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''));
  const headers = ['ID', 'Data', 'Tipo', 'TS'];
  console.log(`📄 ${filename}: ${rows.length} linhas (sem header)`);
  return { headers, rows };
}

// Normaliza status PT-BR ("Concluído", "Pendente", "Inativa") pra slug minúsculo
function normalizarStatus(s: string): string {
  const norm = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return norm || 'pendente';
}

// ============================================================================
// Helpers de coerção
// ============================================================================
const toStr = (v: unknown): string => (v == null ? '' : String(v).trim());
const toStrOrNull = (v: unknown): string | null => {
  const s = toStr(v);
  return s === '' ? null : s;
};
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
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
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

// Chave do prédio: igual ao backend antigo (logradouro|numero, lowercase, trim)
function chaveLocal(logradouro: string, numero: string): string {
  return logradouro.trim().toLowerCase() + '|' + numero.trim().toLowerCase();
}

// Decide tipo do local usando 3 sinais (em ordem de prioridade):
//   1. Predios.csv (overlay manual marcando como prédio)
//   2. ≥2 unidades no mesmo logradouro+numero → predio
//   3. Coluna "Tipo" IBGE (col L)
//   4. Coluna "Nota" IBGE (col N) — refina quando Tipo for ambíguo
function decidirTipoLocal(
  tipoUnidade: string,
  notaIbge: string,
  qtdUnidades: number,
  marcadoComoPredio: boolean
): string {
  if (marcadoComoPredio) return 'predio';
  const t = tipoUnidade.toLowerCase();
  const n = (notaIbge || '').toLowerCase();

  // 1. Sinais inequívocos da col Tipo
  if (t.includes('apartamento')) return 'predio';
  if (t.includes('estabelecimento') || t.includes('comercio') || t.includes('comércio') || t.includes('comercial')) {
    return 'comercio';
  }
  if (t.includes('coletivo') || t.includes('alojamento') || t.includes('asilo')) return 'coletivo';
  if (t.includes('construção') || t.includes('construcao') || t.includes('reforma')) return 'terreno';
  if (t.includes('terreno') || t.includes('lote')) return 'terreno';

  // 2. Nota IBGE vence o heuristic "qtdUnidades>=2 = predio" — galerias comerciais
  //    têm múltiplas unidades mas são comércio.
  if (n.includes('múltiplos estabelecimentos') || n.includes('multiplos estabelecimentos')) return 'comercio';
  if (n.includes('único estabelecimento') || n.includes('unico estabelecimento')) return 'comercio';
  const naoResidencial = n.includes('não residencial') || n.includes('nao residencial');
  if (n.includes('construção múltipla') || n.includes('construcao multipla') || n.includes('múltiplas construções')) {
    if (naoResidencial) return 'comercio';
    return 'predio'; // Residencial ou Misto → predio
  }
  if (n.includes('única construção') || n.includes('unica construcao')) {
    if (naoResidencial) return 'comercio';
    // Residencial: deixa o fallback de qtdUnidades decidir
  }

  // 3. Fallback estrutural: >= 2 unidades sem nota contrária → predio
  if (qtdUnidades >= 2) return 'predio';
  // Default = casa
  return 'casa';
}

// Tipo de entrada inferido da Nota IBGE
function decidirTipoEntrada(notaIbge: string): string | null {
  const n = (notaIbge || '').toLowerCase();
  if (n.includes('portaria presencial')) return 'porteiro';
  if (n.includes('interfone individual') || n.includes('interfone')) return 'eletronica';
  return null;
}

// Converte "lat,lng | lat,lng | ..." pra WKT Polygon WGS84.
// Postgres aceita: SELECT ST_GeomFromText('POLYGON((lng lat, lng lat, ...))', 4326)
// IMPORTANTE: WKT é lng lat (não lat lng). Fechar o anel se não fechado.
function polyStringToWKT(polyString: string): string | null {
  if (!polyString) return null;
  const pts = polyString.split('|').map((s) => s.trim()).filter(Boolean).map((p) => {
    const parts = p.split(',').map((x) => parseFloat(x.trim()));
    if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) return null;
    return [parts[0], parts[1]] as [number, number]; // [lat, lng]
  }).filter((p): p is [number, number] => p !== null);
  if (pts.length < 3) return null;
  // Fecha anel (PostGIS exige)
  const first = pts[0], last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);
  const wkt = pts.map(([lat, lng]) => `${lng} ${lat}`).join(', ');
  return `SRID=4326;POLYGON((${wkt}))`;
}

function latLngToGeo(lat: number | null, lng: number | null): any {
  if (lat == null || lng == null) return null;
  // PostGIS via PostgREST aceita GeoJSON em colunas geometry — WKT plain
  // não passa o coerce. Formato: { type, coordinates: [lng, lat] }.
  return { type: 'Point', coordinates: [lng, lat] };
}

// ============================================================================
// Insert em lote
// ============================================================================
async function insertBatch(table: string, rows: Record<string, unknown>[], chunkSize = 500) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await db.from(table).insert(chunk as any);
    if (error) {
      console.error(`❌ Erro inserindo ${table} chunk ${i}-${i + chunk.length}: ${error.message}`);
      throw error;
    }
  }
  console.log(`✅ ${table}: ${rows.length} linhas`);
}

async function clearTable(table: string, _pkCol = 'id') {
  // Usa TRUNCATE via exec_sql (migration 011) — mais rápido e funciona pra
  // qualquer tipo de PK. CASCADE pra resetar FKs.
  const sql = `truncate table ${table} restart identity cascade`;
  const { error } = await db.rpc('exec_sql' as any, { query: sql } as any);
  if (error) {
    // Fallback: DELETE pra casos onde exec_sql não existe / sem permissão
    const { error: errDel } = await db.from(table).delete().gte('id', '0');
    if (errDel) console.warn(`⚠️  ${table}: ${error.message} / ${errDel.message} — continuando.`);
  }
}

// Junction tables: deletam tudo via filtro sempre-verdadeiro numa coluna any
async function clearJunctionTable(table: string, anyCol: string) {
  const { error } = await db.from(table).delete().not(anyCol, 'is', null);
  if (error) console.warn(`⚠️  ${table}: ${error.message}`);
}

// ============================================================================
// 1. Territorios
// ============================================================================
async function importTerritorios() {
  const csv = readCSV('Territorios.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const c = {
    nome: colIdx(headers, 'Nome'),
    cor: colIdx(headers, 'Cor'),
    labelPos: colIdx(headers, 'label_pos', 'labelPos'),
    labelType: colIdx(headers, 'label_type', 'labelType', 'labelVisibility'),
    status: colIdx(headers, 'Status', 'Situação', 'Situacao'),
    dataConc: colIdx(headers, 'Data conclusao', 'dataConclusao', 'data_conclusao', 'Data de Conclusão', 'Data de Conclusao')
  };

  const dados = rows
    .map((r) => {
      const id = toStr(r[c.nome]);
      if (!id) return null;
      let labelPosObj = null;
      try {
        const lp = toStr(r[c.labelPos]);
        if (lp) labelPosObj = JSON.parse(lp);
      } catch { /* ignora */ }
      return {
        id,
        nome: id,
        cor: toStr(r[c.cor]) || '#3388ff',
        label_pos: labelPosObj,
        label_type: toStrOrNull(r[c.labelType]),
        status: normalizarStatus(toStr(r[c.status])),
        data_conclusao: toDate(r[c.dataConc])
      };
    })
    .filter(Boolean);

  await clearTable('territorios');
  await insertBatch('territorios', dados as any[]);
}

// ============================================================================
// 2. Quadras (poly_string → PostGIS)
// ============================================================================
async function importQuadras() {
  const csv = readCSV('Quadras.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const c = {
    id: colIdx(headers, 'ID', 'Id', 'id', 'ID Quadra'),
    poly: colIdx(headers, 'polyString', 'poly_string', 'poly', 'Polígono', 'Poligono'),
    color: colIdx(headers, 'Color', 'Cor'),
    territorio: colIdx(headers, 'Territorio', 'Território', 'territorio'),
    status: colIdx(headers, 'Status', 'Situação', 'Situacao'),
    dataConc: colIdx(headers, 'Data conclusao', 'dataConclusao', 'data_conclusao', 'Data de Conclusão', 'Data de Conclusao')
  };

  const dados: Record<string, unknown>[] = [];
  let semPoly = 0;
  for (const r of rows) {
    const qid = toStr(r[c.id]);
    if (!qid) continue;
    const wkt = polyStringToWKT(toStr(r[c.poly]));
    if (!wkt) { semPoly++; continue; }
    dados.push({
      id: qid,
      poly: wkt,
      color: toStr(r[c.color]) || '#3388ff',
      territorio_id: toStrOrNull(r[c.territorio]),
      status: normalizarStatus(toStr(r[c.status])),
      data_conclusao: toDate(r[c.dataConc])
    });
  }
  if (semPoly > 0) console.warn(`⚠️  Quadras: ${semPoly} sem polígono válido — descartadas`);

  await clearTable('quadras');
  await insertBatch('quadras', dados);

  // Backfill quadras_conclusoes: cria 1 entrada de histórico por quadra
  // que tem data_conclusao. Necessário pra Reverter conseguir restaurar
  // a "penúltima" (se houver) em vez de zerar.
  const conclusoes = dados
    .filter((d) => d.data_conclusao)
    .map((d) => ({ quadra_id: d.id, data_conclusao: d.data_conclusao }));
  if (conclusoes.length > 0) {
    await clearTable('quadras_conclusoes');
    await insertBatch('quadras_conclusoes', conclusoes);
  }
}

// ============================================================================
// 3. Locais + Unidades (agrupa Dados Brutos por logradouro+numero+quadra)
// + mescla overlay de Predios.csv e PrediosAptos.csv
// ============================================================================
interface UnidadeStaged {
  legacy_row: number;
  complemento: string | null;
  ordem: number | null;
  nota: string | null;
  nao_visitar: boolean;
  tipo_unidade: string;
}

interface LocalStaged {
  chave: string;                       // logradouro|numero
  logradouro: string;
  numero: string;
  quadra_id: string | null;
  setor: string | null;
  quadra_ibge: string | null;
  face_ibge: string | null;
  lat: number | null;
  lng: number | null;
  unidades: UnidadeStaged[];
}

async function importLocaisEUnidades() {
  const csv = readCSV('Dados Brutos.csv');
  if (!csv) return { mapaUnidades: new Map<number, number>() };

  const { headers, rows } = csv;
  const c = {
    quadra: colIdx(headers, 'Quadra'),
    setor: colIdx(headers, 'Setor', 'Setor IBGE'),
    qIbge: colIdx(headers, 'QIBGE', 'Quadra IBGE', 'Quadra-IBGE'),
    faceIbge: colIdx(headers, 'FaceIBGE', 'Face IBGE', 'Face-IBGE'),
    logradouro: colIdx(headers, 'Logradouro'),
    numero: colIdx(headers, 'Numero', 'Número'),
    // "Comp. Num." (número do apto) tem prioridade sobre "Complemento" (texto livre)
    complemento: colIdx(headers, 'Comp. Num.', 'Comp Num', 'Comp', 'Complemento'),
    lat: colIdx(headers, 'Lat', 'Latitude', 'latitude', 'LAT'),
    lng: colIdx(headers, 'Lng', 'Lon', 'Long', 'Longitude', 'longitude', 'LNG'),
    tipo: colIdx(headers, 'Tipo'),
    // Coluna IBGE com o nome (KASA DECOR / RESIDENCIAL FRIDA KAHLO / etc)
    nome: colIdx(headers, 'Nome Estabelecimento', 'NomeEstabelecimento', 'Nome'),
    // Coluna IBGE com a classificação detalhada (Único Estabelecimento /
    // Construção Múltipla com X unidades / Interfone individual / Portaria presencial...)
    nota: colIdx(headers, 'Nota'),
    naoVisitar: colIdx(headers, 'NaoVisitar', 'Não Visitar', 'Nao Visitar', 'nao_visitar'),
    // Ordem Personalizada (manualmente setada) ganha; Ordem é fallback
    ordem: colIdx(headers, 'Ordem Personalizada', 'OrdemPersonalizada', 'Ordem')
  };
  if (c.lat < 0 || c.lng < 0) {
    console.warn(`⚠️  Lat/Lng não encontrados! Cabeçalhos: ${headers.join(', ')}`);
  } else {
    console.log(`📍 Lat coluna ${c.lat} (${headers[c.lat]}), Lng coluna ${c.lng} (${headers[c.lng]})`);
  }

  // -------- AGRUPA por (logradouro|numero, quadra) ---------
  // Mesmo prédio em quadras diferentes (improvável mas possível) vira locais
  // distintos por causa da unique(logradouro, numero, quadra_id).
  const localPorChave = new Map<string, LocalStaged>();
  const nomeEdifPorChave = new Map<string, string>();

  rows.forEach((r, i) => {
    const legacyRow = i + 2;  // linha 1 do sheet é header, dado começa em 2
    const logradouro = toStr(r[c.logradouro]);
    const numero = toStr(r[c.numero]);
    if (!logradouro && !numero) return; // linha vazia

    const quadraId = toStrOrNull(r[c.quadra]);
    const chaveBase = chaveLocal(logradouro, numero);
    const chaveCompleta = chaveBase + '@' + (quadraId || '_');

    let local = localPorChave.get(chaveCompleta);
    if (!local) {
      local = {
        chave: chaveBase,
        logradouro,
        numero,
        quadra_id: quadraId,
        setor: toStrOrNull(r[c.setor]),
        quadra_ibge: toStrOrNull(r[c.qIbge]),
        face_ibge: toStrOrNull(r[c.faceIbge]),
        lat: toNum(r[c.lat]),
        lng: toNum(r[c.lng]),
        unidades: []
      };
      localPorChave.set(chaveCompleta, local);
    }

    local.unidades.push({
      legacy_row: legacyRow,
      complemento: toStrOrNull(r[c.complemento]),
      ordem: toInt(r[c.ordem]),
      nota: toStrOrNull(r[c.nota]),
      nao_visitar: toBool(r[c.naoVisitar]),
      tipo_unidade: toStr(r[c.tipo])
    });

    const nomeEdif = toStr(r[c.nome]);
    if (nomeEdif && !nomeEdifPorChave.has(chaveBase)) nomeEdifPorChave.set(chaveBase, nomeEdif);
  });

  // -------- Lê Predios.csv (overlay manual) ---------
  type PredioOverlay = {
    nome?: string;
    irmao_mora?: boolean;
    nome_irmao?: string;
    notas?: string;
    tipo_entrada?: string;
    acesso_caixas?: boolean;
    acesso_interfones?: boolean;
    nao_eh_predio?: boolean;
    ultima_carta?: string;
  };
  const overlayPredios = new Map<string, PredioOverlay>();
  const predCsv = readCSV('Predios.csv');
  if (predCsv) {
    const pc = {
      chave: colIdx(predCsv.headers, 'chave', 'Chave'),
      nome: colIdx(predCsv.headers, 'nome', 'Nome'),
      irmaoMora: colIdx(predCsv.headers, 'irmaoMora', 'irmao_mora'),
      nomeIrmao: colIdx(predCsv.headers, 'nomeIrmao', 'nome_irmao'),
      notas: colIdx(predCsv.headers, 'notas', 'Notas'),
      tipoEntrada: colIdx(predCsv.headers, 'tipoEntrada', 'tipo_entrada'),
      acessoCaixas: colIdx(predCsv.headers, 'acessoCaixas', 'acesso_caixas'),
      acessoInterfones: colIdx(predCsv.headers, 'acessoInterfones', 'acesso_interfones'),
      naoEhPredio: colIdx(predCsv.headers, 'naoEhPredio', 'nao_eh_predio'),
      ultimaCarta: colIdx(predCsv.headers, 'ultimaCarta', 'ultima_carta')
    };
    for (const r of predCsv.rows) {
      const k = toStr(r[pc.chave]).toLowerCase();
      if (!k) continue;
      overlayPredios.set(k, {
        nome: toStrOrNull(r[pc.nome]) ?? undefined,
        irmao_mora: toBool(r[pc.irmaoMora]),
        nome_irmao: toStrOrNull(r[pc.nomeIrmao]) ?? undefined,
        notas: toStrOrNull(r[pc.notas]) ?? undefined,
        tipo_entrada: toStrOrNull(r[pc.tipoEntrada]) ?? undefined,
        acesso_caixas: toBool(r[pc.acessoCaixas]),
        acesso_interfones: toBool(r[pc.acessoInterfones]),
        nao_eh_predio: toBool(r[pc.naoEhPredio]),
        ultima_carta: toDate(r[pc.ultimaCarta]) ?? undefined
      });
    }
  }

  // -------- Insere LOCAIS ---------
  // Estratégia: insere um-a-um por enquanto pra capturar o id retornado
  // (bigserial). Otimização futura: batch insert + returning id.
  await clearTable('locais');

  const locaisParaInserir: any[] = [];
  const ordemLocais: { chaveCompleta: string; chaveBase: string }[] = [];
  for (const [chaveCompleta, local] of localPorChave) {
    const overlay = overlayPredios.get(local.chave) ?? {};
    // Pega a Nota mais informativa do grupo (a maioria das unidades repete)
    const notaIbge = local.unidades.find((u) => u.nota)?.nota || '';
    const tipo = decidirTipoLocal(
      local.unidades[0]?.tipo_unidade || '',
      notaIbge,
      local.unidades.length,
      false
    );
    const nomeEdif = overlay.nome ?? nomeEdifPorChave.get(local.chave) ?? null;
    // tipo_entrada do overlay manual ganha; senão deriva da Nota IBGE
    const tipoEntrada = overlay.tipo_entrada ?? decidirTipoEntrada(notaIbge);
    locaisParaInserir.push({
      tipo,
      logradouro: local.logradouro || '(sem nome)',
      numero: local.numero || 's/n',
      geo: latLngToGeo(local.lat, local.lng),
      quadra_id: local.quadra_id,
      setor: local.setor,
      quadra_ibge: local.quadra_ibge,
      face_ibge: local.face_ibge,
      nome: nomeEdif,
      irmao_mora: overlay.irmao_mora ?? false,
      nome_irmao: overlay.nome_irmao ?? null,
      notas: overlay.notas ?? null,
      tipo_entrada: tipoEntrada,
      acesso_caixas: overlay.acesso_caixas ?? false,
      acesso_interfones: overlay.acesso_interfones ?? false,
      nao_visitar: overlay.nao_eh_predio ?? false  // "naoEhPredio" → "nao_visitar" no novo modelo
    });
    ordemLocais.push({ chaveCompleta, chaveBase: local.chave });
  }

  // Insert + capture IDs via select pós-insert (mais simples que .insert().select()
  // em chunks). Aqui usamos batch normal e depois fazemos um SELECT pra mapear.
  await insertBatch('locais', locaisParaInserir);

  // Mapeia chaveCompleta → local_id buscando pelo conjunto (logradouro, numero, quadra_id)
  // PAGINADO — passa de 1000 locais facilmente, default do PostgREST cortaria.
  console.log('🔗 Carregando local_ids...');
  const localIdPorUnique = new Map<string, number>();
  let pgFrom = 0;
  const pgSize = 1000;
  while (true) {
    const { data, error: errLoc } = await db
      .from('locais')
      .select('id, logradouro, numero, quadra_id')
      .range(pgFrom, pgFrom + pgSize - 1);
    if (errLoc) throw errLoc;
    if (!data || data.length === 0) break;
    for (const l of data) {
      const key = chaveLocal(l.logradouro, l.numero) + '@' + (l.quadra_id || '_');
      localIdPorUnique.set(key, l.id);
    }
    if (data.length < pgSize) break;
    pgFrom += pgSize;
  }
  console.log(`🔗 ${localIdPorUnique.size} locais mapeados`);

  // -------- Insere UNIDADES + overlay PrediosAptos ---------
  const aptoOverlayPorRow = new Map<number, { carta_escrita?: string; carta_entregue?: string; desocupado?: boolean; nao_escrever?: boolean }>();
  const aptosCsv = readCSV('PrediosAptos.csv');
  if (aptosCsv) {
    const ac = {
      row: colIdx(aptosCsv.headers, 'row', 'ROW', 'Row'),
      cartaEscrita: colIdx(aptosCsv.headers, 'cartaEscrita', 'carta_escrita'),
      cartaEntregue: colIdx(aptosCsv.headers, 'cartaEntregue', 'carta_entregue'),
      desocupado: colIdx(aptosCsv.headers, 'desocupado'),
      naoEscrever: colIdx(aptosCsv.headers, 'naoEscrever', 'nao_escrever')
    };
    for (const r of aptosCsv.rows) {
      const oldRow = toInt(r[ac.row]);
      if (oldRow == null) continue;
      aptoOverlayPorRow.set(oldRow, {
        carta_escrita: toDate(r[ac.cartaEscrita]) ?? undefined,
        carta_entregue: toDate(r[ac.cartaEntregue]) ?? undefined,
        desocupado: toBool(r[ac.desocupado]),
        nao_escrever: toBool(r[ac.naoEscrever])
      });
    }
  }

  const unidadesParaInserir: any[] = [];
  for (const { chaveCompleta } of ordemLocais) {
    const local = localPorChave.get(chaveCompleta)!;
    const localId = localIdPorUnique.get(chaveCompleta);
    if (!localId) { console.warn(`⚠️  local sem id: ${chaveCompleta}`); continue; }

    for (const u of local.unidades) {
      const overlay = aptoOverlayPorRow.get(u.legacy_row) ?? {};
      unidadesParaInserir.push({
        local_id: localId,
        complemento: u.complemento,
        ordem: u.ordem,
        nota: u.nota,
        legacy_row: u.legacy_row,
        carta_escrita: overlay.carta_escrita ?? null,
        carta_entregue: overlay.carta_entregue ?? null,
        desocupado: overlay.desocupado ?? false,
        nao_escrever: overlay.nao_escrever ?? false
      });
    }
  }

  await clearTable('unidades');
  await insertBatch('unidades', unidadesParaInserir);

  // -------- Mapa legacy_row → unidade_id pra Registros e TCEs ---------
  console.log('🔗 Carregando mapa legacy_row → unidade_id...');
  const mapaUnidades = new Map<number, number>();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await db
      .from('unidades')
      .select('id, legacy_row')
      .not('legacy_row', 'is', null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const u of data) {
      if (u.legacy_row != null) mapaUnidades.set(u.legacy_row, u.id);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`🔗 Mapa: ${mapaUnidades.size} unidades`);
  return { mapaUnidades };
}

// ============================================================================
// 4. Registros (FK: unidade_id via legacy_row)
// ============================================================================
async function importRegistros(mapaUnidades: Map<number, number>) {
  const csv = readRegistrosCSV('Registros.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const c = {
    id: colIdx(headers, 'ID', 'Id'),
    data: colIdx(headers, 'Data'),
    tipo: colIdx(headers, 'Tipo'),
    ts: colIdx(headers, 'TS', 'Timestamp')
  };

  let semFk = 0;
  const dados = rows
    .map((r) => {
      const oldRow = toInt(r[c.id]);
      if (oldRow == null) return null;
      const unidadeId = mapaUnidades.get(oldRow);
      if (unidadeId == null) { semFk++; return null; }
      return {
        unidade_id: unidadeId,
        tipo: toStr(r[c.tipo]) || 'manual',
        ts: toTs(r[c.ts]) || new Date().toISOString(),
        dados: c.data >= 0 && toDate(r[c.data]) ? { data: toDate(r[c.data]) } : null
      };
    })
    .filter(Boolean);

  if (semFk > 0) console.warn(`⚠️  Registros: ${semFk} linhas sem FK válido (unidade apagada?)`);
  await clearTable('registros');
  await insertBatch('registros', dados as any[]);
}

// ============================================================================
// 5. TCEs + tce_unidades (FK via legacy_row)
// ============================================================================
async function importTCEs(mapaUnidades: Map<number, number>) {
  const csv = readCSV('TerritoriosEspeciais.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const c = {
    id: colIdx(headers, 'ID', 'Id', 'id'),
    nome: colIdx(headers, 'nome', 'Nome'),
    tipo: colIdx(headers, 'tipo', 'Tipo'),
    rows: colIdx(headers, 'rows', 'ROWS'),
    poly: colIdx(headers, 'polyString', 'poly_string'),
    publicador: colIdx(headers, 'publicador'),
    prazo: colIdx(headers, 'prazo'),
    status: colIdx(headers, 'status', 'Status'),
    criado: colIdx(headers, 'criado'),
    dataConc: colIdx(headers, 'dataConclusao', 'data_conclusao'),
    notas: colIdx(headers, 'notas')
  };

  const tces: any[] = [];
  const junctions: { tce_id: string; unidade_id: number }[] = [];

  for (const r of rows) {
    const id = toStr(r[c.id]);
    if (!id) continue;
    const oldRows = toStr(r[c.rows]).split(',').map((s) => toInt(s.trim())).filter((n): n is number => n != null);
    const unidadeIds = oldRows.map((or) => mapaUnidades.get(or)).filter((x): x is number => x != null);

    tces.push({
      id,
      nome: toStr(r[c.nome]) || id,
      tipo: toStr(r[c.tipo]) || 'comercial',
      poly: polyStringToWKT(toStr(r[c.poly])),
      publicador_id: null,  // publicador era nome livre — não mapeia pra uuid
      prazo: toDate(r[c.prazo]),
      status: toStr(r[c.status]) || 'aberto',
      criado_em: toTs(r[c.criado]) || new Date().toISOString(),
      data_conclusao: toDate(r[c.dataConc]),
      notas: toStrOrNull(r[c.notas])
    });
    for (const uid of unidadeIds) junctions.push({ tce_id: id, unidade_id: uid });
  }

  await clearJunctionTable('tce_unidades', 'tce_id');
  await clearTable('tces');
  await insertBatch('tces', tces);
  await insertBatch('tce_unidades', junctions as any[]);
}

// ============================================================================
// 6. Designações + junção
// ============================================================================
async function importDesignacoes() {
  const csv = readCSV('Designacoes.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const c = {
    id: colIdx(headers, 'ID', 'Id', 'id'),
    ids: colIdx(headers, 'ids_quadras', 'IDs Quadras', 'ids'),
    publicador: colIdx(headers, 'publicador'),
    criada: colIdx(headers, 'criada'),
    prazo: colIdx(headers, 'prazo'),
    status: colIdx(headers, 'status', 'Status'),
    notas: colIdx(headers, 'notas')
  };

  await clearJunctionTable('designacao_quadras', 'designacao_id');
  await clearTable('designacoes');

  // Insert designações uma por vez pra capturar o id retornado
  let inseridas = 0;
  for (const r of rows) {
    const idsTxt = toStr(r[c.ids]);
    if (!idsTxt) continue;
    const idsQuadras = idsTxt.split(',').map((s) => s.trim()).filter(Boolean);
    if (idsQuadras.length === 0) continue;

    const { data, error } = await db
      .from('designacoes')
      .insert({
        publicador_id: null,
        criada_em: toTs(r[c.criada]) || new Date().toISOString(),
        prazo: toDate(r[c.prazo]),
        status: toStr(r[c.status]) || 'aberta',
        notas: toStrOrNull(r[c.notas])
      } as any)
      .select('id')
      .single();
    if (error || !data) {
      console.warn(`⚠️  Designação não inserida: ${error?.message}`);
      continue;
    }
    const junctions = idsQuadras.map((q) => ({ designacao_id: data.id, quadra_id: q }));
    await insertBatch('designacao_quadras', junctions);
    inseridas++;
  }
  console.log(`✅ designacoes: ${inseridas}`);
}

// ============================================================================
// 7. Campanha
// ============================================================================
async function importCampanha() {
  const csv = readCSV('Campanha.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const c = {
    tipo: colIdx(headers, 'tipo'),
    modalidade: colIdx(headers, 'modalidade'),
    titulo: colIdx(headers, 'titulo', 'Título'),
    descricao: colIdx(headers, 'descricao', 'Descrição'),
    link: colIdx(headers, 'link'),
    anexoNome: colIdx(headers, 'anexoNome', 'anexo_nome'),
    anexoUrl: colIdx(headers, 'anexoUrl', 'anexo_url'),
    publico: colIdx(headers, 'publico', 'Público'),
    ordem: colIdx(headers, 'ordem'),
    criado: colIdx(headers, 'criado')
  };

  const dados = rows
    .map((r) => {
      const titulo = toStr(r[c.titulo]);
      if (!titulo) return null;
      return {
        tipo: toStr(r[c.tipo]) || 'geral',
        modalidade: toStr(r[c.modalidade]) || 'casa',
        titulo,
        descricao: toStrOrNull(r[c.descricao]),
        link: toStrOrNull(r[c.link]),
        anexo_nome: toStrOrNull(r[c.anexoNome]),
        anexo_url: toStrOrNull(r[c.anexoUrl]),
        publico: toBool(r[c.publico]),
        ordem: toInt(r[c.ordem]) ?? 0,
        criado_em: toTs(r[c.criado]) || new Date().toISOString()
      };
    })
    .filter(Boolean);

  await clearTable('campanha');
  await insertBatch('campanha', dados as any[]);
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  if (!existsSync(DATA_DIR) || !statSync(DATA_DIR).isDirectory()) {
    console.error(`❌ Diretório ${DATA_DIR} não existe.`);
    console.error('Crie e coloque os CSVs exportados do Google Sheets.');
    process.exit(1);
  }

  console.log('🚀 Iniciando migração CSV → Postgres (modelo locais+unidades)');
  console.log(`📁 Lendo de: ${DATA_DIR}\n`);

  await importTerritorios();
  await importQuadras();
  const { mapaUnidades } = await importLocaisEUnidades();
  await importRegistros(mapaUnidades);
  await importTCEs(mapaUnidades);
  await importDesignacoes();
  await importCampanha();

  console.log('\n🎉 Migração concluída!');
  console.log('\nVerificação sugerida (rode no SQL Editor):');
  console.log(`  select tipo, count(*) from locais group by tipo;`);
  console.log(`  select count(*) from unidades;`);
  console.log(`  select count(*) from registros where unidade_id is null;  -- deve ser 0`);
  console.log(`  select count(*) from audit_log where tabela='locais' and acao='INSERT';`);
}

main().catch((e) => {
  console.error('💥 Erro fatal:', e);
  process.exit(1);
});

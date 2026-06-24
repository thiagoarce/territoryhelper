// ============================================================================
// Migração one-shot: CSVs exportados do Google Sheets (app antigo) → Postgres.
//
// USO:
//   1. Baixe cada aba do Sheets como CSV (Arquivo → Download → .csv)
//   2. Coloque em ./migration-data/ com os nomes:
//        Quadras.csv, Territorios.csv, Dados Brutos.csv, Registros.csv,
//        Predios.csv, PrediosAptos.csv, Designacoes.csv, Campanha.csv,
//        TerritoriosEspeciais.csv
//   3. Configure .env com PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   4. npm run migrate
//
// ORDEM dos inserts (respeita FKs):
//   territorios → quadras → enderecos → predios → predios_aptos
//   → registros → tces → designacoes → campanha
//
// IDEMPOTÊNCIA: deleta tudo de cada tabela antes de inserir. Roda quantas
// vezes quiser. Profiles NÃO são tocados.
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
// CSV parser — suporta quote-escaping standard (RFC 4180). Google Sheets
// exporta em UTF-8 com aspas duplas em campos com vírgula/quebra/aspas.
// ============================================================================
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  // Remove BOM se houver
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } // escape ""
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
  // última célula/linha
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
  // Aceita "yyyy-MM-dd", "dd/MM/yyyy", ISO completo
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

// Tenta achar coluna por vários nomes possíveis (case-insensitive,
// tolerante a acento/espaço extra).
function colIdx(headers: string[], ...nomes: string[]): number {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const headersNorm = headers.map(norm);
  for (const nome of nomes) {
    const idx = headersNorm.indexOf(norm(nome));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ============================================================================
// Insert em lote — Postgres tem limite de parameters por query, então
// quebramos em chunks. 500 linhas é seguro pra ~20 colunas.
// ============================================================================
async function insertBatch(table: string, rows: Record<string, unknown>[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await db.from(table).insert(chunk as any);
    if (error) {
      console.error(`❌ Erro inserindo ${table} chunk ${i}-${i + chunk.length}: ${error.message}`);
      throw error;
    }
  }
  console.log(`✅ ${table}: ${rows.length} linhas inseridas`);
}

async function clearTable(table: string) {
  // .neq com id sempre verdadeiro pra "delete all" via REST. Service role bypassa RLS.
  const { error } = await db.from(table).delete().neq('id', '__never__');
  // Se ID for bigint o filtro acima falha; tenta alternativa
  if (error) {
    const r2 = await db.from(table).delete().gt('criado_em', '1900-01-01');
    if (r2.error) console.warn(`⚠️  Não consegui limpar ${table}: ${error.message}`);
  }
}

// ============================================================================
// Importadores por tabela
// ============================================================================

async function importTerritorios() {
  const csv = readCSV('Territorios.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const nome = colIdx(headers, 'Nome');
  const cor = colIdx(headers, 'Cor');
  const ids = colIdx(headers, 'ids_quadras', 'IDs Quadras', 'ids');
  const poly = colIdx(headers, 'polyString', 'poly');
  const labelPos = colIdx(headers, 'label_pos', 'labelPos');
  const labelType = colIdx(headers, 'label_type', 'labelType');
  const status = colIdx(headers, 'Status');
  const dataConc = colIdx(headers, 'Data conclusao', 'dataConclusao', 'data_conclusao');

  const dados = rows
    .map((r) => {
      const id = toStr(r[nome]);
      if (!id) return null;
      let labelPosObj = null;
      try {
        const lp = toStr(r[labelPos]);
        if (lp) labelPosObj = JSON.parse(lp);
      } catch {
        // ignora — não é JSON válido
      }
      return {
        id,
        nome: id,
        cor: toStr(r[cor]) || '#3388ff',
        ids_quadras: toStr(r[ids]).split(',').map((s) => s.trim()).filter(Boolean),
        poly_string: toStrOrNull(r[poly]),
        label_pos: labelPosObj,
        label_type: toStrOrNull(r[labelType]),
        status: toStr(r[status]) || 'pendente',
        data_conclusao: toDate(r[dataConc])
      };
    })
    .filter(Boolean);

  await clearTable('territorios');
  if (dados.length) await insertBatch('territorios', dados as any[]);
}

async function importQuadras() {
  const csv = readCSV('Quadras.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const id = colIdx(headers, 'ID', 'Id', 'id');
  const poly = colIdx(headers, 'polyString', 'poly_string', 'poly');
  const color = colIdx(headers, 'Color', 'Cor');
  const territorio = colIdx(headers, 'Territorio', 'Território', 'territorio');
  const status = colIdx(headers, 'Status');
  const dataConc = colIdx(headers, 'Data conclusao', 'dataConclusao', 'data_conclusao');

  const dados = rows
    .map((r) => {
      const qid = toStr(r[id]);
      if (!qid) return null;
      return {
        id: qid,
        poly_string: toStr(r[poly]) || '',
        color: toStr(r[color]) || '#3388ff',
        territorio_id: toStrOrNull(r[territorio]),
        status: toStr(r[status]) || 'pendente',
        data_conclusao: toDate(r[dataConc])
      };
    })
    .filter((q) => q && q.poly_string);

  await clearTable('quadras');
  if (dados.length) await insertBatch('quadras', dados as any[]);
}

async function importEnderecos() {
  const csv = readCSV('Dados Brutos.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const c = {
    quadra: colIdx(headers, 'Quadra'),
    setor: colIdx(headers, 'Setor'),
    qIbge: colIdx(headers, 'QIBGE', 'Quadra IBGE'),
    faceIbge: colIdx(headers, 'FaceIBGE', 'Face IBGE'),
    logradouro: colIdx(headers, 'Logradouro'),
    numero: colIdx(headers, 'Numero', 'Número'),
    complemento: colIdx(headers, 'Comp', 'Complemento'),
    lat: colIdx(headers, 'Lat'),
    lng: colIdx(headers, 'Lng', 'Lon', 'Long'),
    tipo: colIdx(headers, 'Tipo'),
    nome: colIdx(headers, 'Nome'),
    nota: colIdx(headers, 'Nota'),
    naoVisitar: colIdx(headers, 'NaoVisitar', 'Não Visitar', 'nao_visitar'),
    ordem: colIdx(headers, 'Ordem')
  };

  // legacy_row = índice 1-based no Sheets (linha 1 é header, dado começa em 2)
  const dados = rows.map((r, i) => ({
    legacy_row: i + 2,
    quadra_id: toStrOrNull(r[c.quadra]),
    setor: toStrOrNull(r[c.setor]),
    quadra_ibge: toStrOrNull(r[c.qIbge]),
    face_ibge: toStrOrNull(r[c.faceIbge]),
    logradouro: toStr(r[c.logradouro]),
    numero: toStr(r[c.numero]),
    complemento: toStrOrNull(r[c.complemento]),
    lat: toNum(r[c.lat]),
    lng: toNum(r[c.lng]),
    tipo: toStrOrNull(r[c.tipo]),
    nome: toStrOrNull(r[c.nome]),
    nota: toStrOrNull(r[c.nota]),
    nao_visitar: toBool(r[c.naoVisitar]),
    ordem: toInt(r[c.ordem])
  }));

  await clearTable('enderecos');
  if (dados.length) await insertBatch('enderecos', dados);
}

// Carrega { legacy_row → id } pra resolver FKs das tabelas seguintes
async function carregarMapaEnderecos(): Promise<Map<number, number>> {
  console.log('🔗 Carregando mapa legacy_row → endereco_id...');
  const mapa = new Map<number, number>();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await db
      .from('enderecos')
      .select('id, legacy_row')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.legacy_row != null) mapa.set(row.legacy_row, row.id);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`🔗 Mapa: ${mapa.size} endereços`);
  return mapa;
}

async function importRegistros(mapa: Map<number, number>) {
  const csv = readCSV('Registros.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const id = colIdx(headers, 'ID', 'Id');  // row de Dados Brutos
  const data = colIdx(headers, 'Data');
  const tipo = colIdx(headers, 'Tipo');
  const ts = colIdx(headers, 'TS', 'Timestamp');

  let semFk = 0;
  const dados = rows
    .map((r) => {
      const oldRow = toInt(r[id]);
      if (oldRow == null) return null;
      const newId = mapa.get(oldRow);
      if (newId == null) { semFk++; return null; }
      return {
        endereco_id: newId,
        tipo: toStr(r[tipo]) || 'manual',
        data: toDate(r[data]),
        ts: toTs(r[ts]) || new Date().toISOString()
      };
    })
    .filter(Boolean);

  if (semFk > 0) console.warn(`⚠️  Registros: ${semFk} linhas sem FK válido (endereço apagado?)`);
  await clearTable('registros');
  if (dados.length) await insertBatch('registros', dados as any[]);
}

async function importPredios() {
  const csv = readCSV('Predios.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const c = {
    chave: colIdx(headers, 'chave', 'Chave'),
    nome: colIdx(headers, 'nome', 'Nome'),
    irmaoMora: colIdx(headers, 'irmaoMora', 'irmao_mora'),
    nomeIrmao: colIdx(headers, 'nomeIrmao', 'nome_irmao'),
    ultimaCarta: colIdx(headers, 'ultimaCarta', 'ultima_carta'),
    notas: colIdx(headers, 'notas', 'Notas'),
    acessoInterfone: colIdx(headers, 'acessoInterfone', 'acesso_interfone'),
    naoEhPredio: colIdx(headers, 'naoEhPredio', 'nao_eh_predio'),
    tipoEntrada: colIdx(headers, 'tipoEntrada', 'tipo_entrada'),
    acessoCaixas: colIdx(headers, 'acessoCaixas', 'acesso_caixas'),
    acessoInterfones: colIdx(headers, 'acessoInterfones', 'acesso_interfones'),
    atualizado: colIdx(headers, 'atualizado')
  };

  const dados = rows
    .map((r) => {
      const chave = toStr(r[c.chave]).toLowerCase();
      if (!chave) return null;
      return {
        chave,
        nome: toStrOrNull(r[c.nome]),
        irmao_mora: toBool(r[c.irmaoMora]),
        nome_irmao: toStrOrNull(r[c.nomeIrmao]),
        ultima_carta: toDate(r[c.ultimaCarta]),
        notas: toStrOrNull(r[c.notas]),
        acesso_interfone: toStrOrNull(r[c.acessoInterfone]),
        nao_eh_predio: toBool(r[c.naoEhPredio]),
        tipo_entrada: toStrOrNull(r[c.tipoEntrada]),
        acesso_caixas: toBool(r[c.acessoCaixas]),
        acesso_interfones: toBool(r[c.acessoInterfones]),
        atualizado_em: toTs(r[c.atualizado]) || new Date().toISOString()
      };
    })
    .filter(Boolean);

  await clearTable('predios');
  if (dados.length) await insertBatch('predios', dados as any[]);
}

async function importPrediosAptos(mapa: Map<number, number>) {
  const csv = readCSV('PrediosAptos.csv');
  if (!csv) return;
  const { headers, rows } = csv;
  const c = {
    row: colIdx(headers, 'row', 'ROW', 'Row'),
    cartaEscrita: colIdx(headers, 'cartaEscrita', 'carta_escrita'),
    cartaEntregue: colIdx(headers, 'cartaEntregue', 'carta_entregue'),
    desocupado: colIdx(headers, 'desocupado'),
    naoEscrever: colIdx(headers, 'naoEscrever', 'nao_escrever'),
    atualizado: colIdx(headers, 'atualizado')
  };

  let semFk = 0;
  const dados = rows
    .map((r) => {
      const oldRow = toInt(r[c.row]);
      if (oldRow == null) return null;
      const newId = mapa.get(oldRow);
      if (newId == null) { semFk++; return null; }
      return {
        endereco_id: newId,
        carta_escrita: toDate(r[c.cartaEscrita]),
        carta_entregue: toDate(r[c.cartaEntregue]),
        desocupado: toBool(r[c.desocupado]),
        nao_escrever: toBool(r[c.naoEscrever]),
        atualizado_em: toTs(r[c.atualizado]) || new Date().toISOString()
      };
    })
    .filter(Boolean);

  if (semFk > 0) console.warn(`⚠️  PrediosAptos: ${semFk} linhas sem FK válido`);
  await clearTable('predios_aptos');
  if (dados.length) await insertBatch('predios_aptos', dados as any[]);
}

async function importTCEs(mapa: Map<number, number>) {
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

  const dados = rows
    .map((r) => {
      const id = toStr(r[c.id]);
      if (!id) return null;
      const oldRows = toStr(r[c.rows]).split(',').map((s) => toInt(s.trim())).filter((n): n is number => n != null);
      const endereco_ids = oldRows.map((or) => mapa.get(or)).filter((x): x is number => x != null);
      return {
        id,
        nome: toStr(r[c.nome]) || id,
        tipo: toStr(r[c.tipo]) || 'comercial',
        endereco_ids,
        poly_string: toStrOrNull(r[c.poly]),
        publicador_id: null,  // publicador era nome livre — não mapeia pra uuid
        prazo: toDate(r[c.prazo]),
        status: toStr(r[c.status]) || 'aberto',
        criado_em: toTs(r[c.criado]) || new Date().toISOString(),
        data_conclusao: toDate(r[c.dataConc]),
        notas: toStrOrNull(r[c.notas])
      };
    })
    .filter(Boolean);

  await clearTable('tces');
  if (dados.length) await insertBatch('tces', dados as any[]);
}

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

  // publicador era nome livre — não mapeia pra uuid. Deixamos null
  // e admin re-atribui no app novo, ou descartamos histórico de designações
  // antigas (geralmente OK porque designações antigas já encerraram).
  const dados = rows
    .map((r) => {
      const idsTxt = toStr(r[c.ids]);
      if (!idsTxt) return null;
      return {
        publicador_id: null,
        quadras_ids: idsTxt.split(',').map((s) => s.trim()).filter(Boolean),
        criada_em: toTs(r[c.criada]) || new Date().toISOString(),
        prazo: toDate(r[c.prazo]),
        status: toStr(r[c.status]) || 'aberta',
        notas: toStrOrNull(r[c.notas])
      };
    })
    .filter(Boolean);

  await clearTable('designacoes');
  if (dados.length) await insertBatch('designacoes', dados as any[]);
}

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
  if (dados.length) await insertBatch('campanha', dados as any[]);
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

  console.log('🚀 Iniciando migração CSV → Postgres');
  console.log(`📁 Lendo de: ${DATA_DIR}\n`);

  await importTerritorios();
  await importQuadras();
  await importEnderecos();
  const mapaEnderecos = await carregarMapaEnderecos();
  await importPredios();
  await importPrediosAptos(mapaEnderecos);
  await importRegistros(mapaEnderecos);
  await importTCEs(mapaEnderecos);
  await importDesignacoes();
  await importCampanha();

  console.log('\n🎉 Migração concluída!');
}

main().catch((e) => {
  console.error('💥 Erro fatal:', e);
  process.exit(1);
});

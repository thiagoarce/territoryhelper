const { loadGsFiles, test, assertEq, assertTrue, assertFalse } = require('./harness');
const { makeSheet, installMocks } = require('./mocks');

function setup(sheets) {
  const ctx = loadGsFiles(false);
  installMocks(ctx, sheets);
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  vm.runInContext(code, ctx);
  return ctx;
}

// =================================================================
// ensureSheetPredios_ — migração de schema (Col K/L/M novas)
// =================================================================
test('ensureSheetPredios_ cria sheet com 13 colunas em sheet zero', () => {
  const ctx = setup([]);
  const sh = ctx.ensureSheetPredios_();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  assertEq(headers.length, 13);
  assertEq(headers[10], 'tipoEntrada');
  assertEq(headers[11], 'acessoCaixas');
  assertEq(headers[12], 'acessoInterfones');
});

test('ensureSheetPredios_ migra sheet antiga (10 cols → 13 cols)', () => {
  const sh = makeSheet('Predios', [
    ['id', 'chave', 'nome', 'irmaoMora', 'ultimaCarta', 'notas',
     'atualizado', 'nomeIrmao', 'acessoInterfone', 'naoEhPredio']
  ]);
  const ctx = setup([sh]);
  ctx.ensureSheetPredios_();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  assertEq(headers.length, 13);
  assertEq(headers[10], 'tipoEntrada');
});

// =================================================================
// atualizarPredioPublico — whitelist de campos públicos
// =================================================================
test('atualizarPredioPublico rejeita chave inexistente', () => {
  const dados = makeSheet('Dados Brutos', [
    ['Quadra','Setor','QIBGE','FaceIBGE','Localidade','Logradouro','Numero',
     'CompNum','Comp','Lat','Lng','Tipo','Nome','Nota'],
    // sem nenhuma linha de dado
  ]);
  const predios = makeSheet('Predios', [
    ['id','chave','nome','irmaoMora','ultimaCarta','notas','atualizado',
     'nomeIrmao','acessoInterfone','naoEhPredio','tipoEntrada','acessoCaixas','acessoInterfones']
  ]);
  const ctx = setup([dados, predios]);
  const r = ctx.atualizarPredioPublico('chave|qualquer', { tipoEntrada: 'porteiro' });
  assertFalse(r.ok);
  assertEq(r.erro, 'Prédio não encontrado');
});

test('atualizarPredioPublico só aceita campos permitidos (whitelist)', () => {
  // Cria prédio com 2 endereços no mesmo logradouro+numero
  const dados = makeSheet('Dados Brutos', [
    ['Quadra','Setor','QIBGE','FaceIBGE','Localidade','Logradouro','Numero',
     'CompNum','Comp','Lat','Lng','Tipo','Nome','Nota'],
    ['Q1','1','01','1','Centro','Rua A','100','100','Apt 101',-7,-34,'Apartamento','',''],
    ['Q1','1','01','1','Centro','Rua A','100','100','Apt 102',-7,-34,'Apartamento','','']
  ]);
  const predios = makeSheet('Predios', [
    ['id','chave','nome','irmaoMora','ultimaCarta','notas','atualizado',
     'nomeIrmao','acessoInterfone','naoEhPredio','tipoEntrada','acessoCaixas','acessoInterfones']
  ]);
  const ctx = setup([dados, predios]);
  // Tenta passar campos NÃO permitidos (notas, irmaoMora) + permitidos
  const r = ctx.atualizarPredioPublico('rua a|100', {
    tipoEntrada: 'porteiro',
    acessoCaixas: true,
    acessoInterfones: false,
    notas: 'HACK',           // não permitido
    irmaoMora: true,         // não permitido
    naoEhPredio: true        // não permitido
  });
  assertTrue(r.ok);
  // Lê do sheet pra confirmar — só os 3 permitidos passaram
  const overlay = ctx._mapaOverlaysPredios_()['rua a|100'];
  assertEq(overlay.tipoEntrada, 'porteiro');
  assertEq(overlay.acessoCaixas, true);
  assertEq(overlay.acessoInterfones, false);
  // Não permitidos não foram alterados (default false/'')
  assertEq(overlay.notas, '');
  assertEq(overlay.irmaoMora, false);
  assertEq(overlay.naoEhPredio, false);
});

test('atualizarPredio normaliza tipoEntrada inválido pra string vazia', () => {
  const dados = makeSheet('Dados Brutos', [
    ['Quadra','Setor','QIBGE','FaceIBGE','Localidade','Logradouro','Numero',
     'CompNum','Comp','Lat','Lng','Tipo','Nome','Nota'],
    ['Q1','1','01','1','Centro','Rua A','100','100','Apt 101',-7,-34,'Apartamento','',''],
    ['Q1','1','01','1','Centro','Rua A','100','100','Apt 102',-7,-34,'Apartamento','','']
  ]);
  const predios = makeSheet('Predios', [
    ['id','chave','nome','irmaoMora','ultimaCarta','notas','atualizado',
     'nomeIrmao','acessoInterfone','naoEhPredio','tipoEntrada','acessoCaixas','acessoInterfones']
  ]);
  const ctx = setup([dados, predios]);
  ctx.atualizarPredio('rua a|100', { tipoEntrada: 'xxxx_invalido' });
  const overlay = ctx._mapaOverlaysPredios_()['rua a|100'];
  assertEq(overlay.tipoEntrada, '');
});

// =================================================================
// registrarDesfechoEndereco — aceita undo (tipo vazio)
// =================================================================
test('registrarDesfechoEndereco aceita undo (tipo vazio) e registra como desfeito', () => {
  const dados = makeSheet('Dados Brutos', [
    ['Quadra','Setor','QIBGE','FaceIBGE','Localidade','Logradouro','Numero',
     'CompNum','Comp','Lat','Lng','Tipo','Nome','Nota'],
    ['Q1','1','01','1','Centro','Rua A','100','100','Apt 101',-7,-34,'Apartamento','','']
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const ctx = setup([dados, registros]);
  const r = ctx.registrarDesfechoEndereco(2, '');
  assertTrue(r.ok || r.status === 'SUCESSO');
  // Última linha do Registros deve ter Tipo='desfeito'
  const ult = registros.getLastRow();
  const linha = registros.getRange(ult, 1, 1, 4).getValues()[0];
  assertEq(linha[2], 'desfeito');
});

test('registrarDesfechoEndereco rejeita tipo inválido', () => {
  const dados = makeSheet('Dados Brutos', [
    ['Quadra','Setor','QIBGE','FaceIBGE','Localidade','Logradouro','Numero',
     'CompNum','Comp','Lat','Lng','Tipo','Nome','Nota'],
    ['Q1','1','01','1','Centro','Rua A','100','100','Apt 101',-7,-34,'Apartamento','','']
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const ctx = setup([dados, registros]);
  const r = ctx.registrarDesfechoEndereco(2, 'tipoQuePapagaiou');
  assertFalse(r.ok);
});

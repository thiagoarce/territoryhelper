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
// Sync cartas unificado: publicador ↔ link cartas
// =================================================================
test('registrarCartaEndereco escreve em Registros E PrediosAptos', () => {
  const dados = makeSheet('Dados Brutos', [
    ['Quadra','Setor','QIBGE','FaceIBGE','Localidade','Logradouro','Numero',
     'CompNum','Comp','Lat','Lng','Tipo','Nome','Nota'],
    ['Q1','1','01','1','Centro','Rua A','100','100','Apt 101',-7,-34,'Apartamento','','']
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const aptos = makeSheet('PrediosAptos', [
    ['row','cartaEscrita','cartaEntregue','desocupado','atualizado','naoEscrever']
  ]);
  const ctx = setup([dados, registros, aptos]);
  const r = ctx.registrarCartaEndereco(2);
  assertTrue(r.ok);
  // Registros: appendou 1 linha com tipo='carta'
  assertEq(registros.getLastRow(), 2);
  const reg = registros.getRange(2, 1, 1, 4).getValues()[0];
  assertEq(reg[2], 'carta');
  // PrediosAptos: appendou 1 linha com cartaEntregue setado
  assertEq(aptos.getLastRow(), 2);
  const ap = aptos.getRange(2, 1, 1, 6).getValues()[0];
  assertEq(ap[0], 2); // row
  assertTrue(ap[2] instanceof Date); // cartaEntregue
});

test('registrarCartaEndereco com undo limpa cartaEntregue e grava carta_undo', () => {
  const dados = makeSheet('Dados Brutos', [
    ['Quadra','Setor','QIBGE','FaceIBGE','Localidade','Logradouro','Numero',
     'CompNum','Comp','Lat','Lng','Tipo','Nome','Nota'],
    ['Q1','1','01','1','Centro','Rua A','100','100','Apt 101',-7,-34,'Apartamento','','']
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const aptos = makeSheet('PrediosAptos', [
    ['row','cartaEscrita','cartaEntregue','desocupado','atualizado','naoEscrever'],
    [2, '', new Date(), false, new Date(), false]
  ]);
  const ctx = setup([dados, registros, aptos]);
  const r = ctx.registrarCartaEndereco(2, true);
  assertTrue(r.ok);
  // Registros: tipo='carta_undo'
  const reg = registros.getRange(2, 1, 1, 4).getValues()[0];
  assertEq(reg[2], 'carta_undo');
  // PrediosAptos.cartaEntregue limpo
  const ap = aptos.getRange(2, 1, 1, 6).getValues()[0];
  assertEq(ap[2], '');
});

test('atualizarAptoStatus.cartaEntregue espelha em Registros', () => {
  const aptos = makeSheet('PrediosAptos', [
    ['row','cartaEscrita','cartaEntregue','desocupado','atualizado','naoEscrever']
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const ctx = setup([aptos, registros]);
  const r = ctx.atualizarAptoStatus(5, { cartaEntregue: true });
  assertTrue(r.ok);
  // Linha de carta appendada em Registros
  const reg = registros.getRange(2, 1, 1, 4).getValues()[0];
  assertEq(reg[0], 'endereco:5');
  assertEq(reg[2], 'carta');
});

// =================================================================
// Schema TP (Testemunho Público)
// =================================================================
test('ensureSheetTpPontos_ cria com 7 colunas', () => {
  const ctx = setup([]);
  const sh = ctx.ensureSheetTpPontos_();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  assertEq(headers.length, 7);
  assertEq(headers[0], 'id');
  assertEq(headers[5], 'ativo');
});

test('criarPontoTP appenda e devolve id', () => {
  const ctx = setup([]);
  const r = ctx.criarPontoTP({ nome: 'Praça Central', lat: -7.1, lng: -34.8, endereco: 'Av X' });
  assertTrue(r.ok);
  assertTrue(r.id && r.id.indexOf('tpp_') === 0);
});

test('criarPontoTP rejeita sem nome', () => {
  const ctx = setup([]);
  const r = ctx.criarPontoTP({ lat: -7, lng: -34 });
  assertFalse(r.ok);
});

test('listarPontosTP filtra por somenteAtivos', () => {
  const sh = makeSheet('TpPontos', [
    ['id','nome','lat','lng','endereco','ativo','notas'],
    ['tpp1', 'Praça', -7, -34, '', true, ''],
    ['tpp2', 'Velho', -7, -34, '', false, '']
  ]);
  const ctx = setup([sh]);
  const todos = ctx.listarPontosTP();
  assertEq(todos.length, 2);
  const ativos = ctx.listarPontosTP(true);
  assertEq(ativos.length, 1);
  assertEq(ativos[0].id, 'tpp1');
});

test('agendarTP rejeita data inválida', () => {
  const ctx = setup([]);
  const r = ctx.agendarTP({ horarioId: 'tph1', publicador: 'João', data: 'asdf' });
  assertFalse(r.ok);
});

test('checkInTP marca status=presente + checkin', () => {
  const sh = makeSheet('TpAgendamentos', [
    ['id','horarioId','data','publicador','carrinhoId','status',
     'checkin','checkout','revistas','notas','criado'],
    ['tpa1','tph1','2026-06-21','João','','agendado','','',0,'',new Date()]
  ]);
  const ctx = setup([sh]);
  const r = ctx.checkInTP('tpa1');
  assertTrue(r.ok);
  const linha = sh.getRange(2, 1, 1, 11).getValues()[0];
  assertEq(linha[5], 'presente');
  assertTrue(linha[6] instanceof Date);
});

test('checkOutTP atualiza revistas distribuídas', () => {
  const sh = makeSheet('TpAgendamentos', [
    ['id','horarioId','data','publicador','carrinhoId','status',
     'checkin','checkout','revistas','notas','criado'],
    ['tpa1','tph1','2026-06-21','João','','presente',new Date(),'',0,'',new Date()]
  ]);
  const ctx = setup([sh]);
  const r = ctx.checkOutTP('tpa1', 12);
  assertTrue(r.ok);
  const linha = sh.getRange(2, 1, 1, 11).getValues()[0];
  assertEq(linha[5], 'concluido');
  assertEq(linha[8], 12);
});

test('cancelarAgendamentoTP muda status', () => {
  const sh = makeSheet('TpAgendamentos', [
    ['id','horarioId','data','publicador','carrinhoId','status',
     'checkin','checkout','revistas','notas','criado'],
    ['tpa1','tph1','2026-06-21','João','','agendado','','',0,'',new Date()]
  ]);
  const ctx = setup([sh]);
  const r = ctx.cancelarAgendamentoTP('tpa1');
  assertTrue(r.ok);
  assertEq(sh.getRange(2, 6).getValue(), 'cancelado');
});

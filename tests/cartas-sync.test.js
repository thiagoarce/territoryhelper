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


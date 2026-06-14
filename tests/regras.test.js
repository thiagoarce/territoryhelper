const { loadGsFiles, test, assertEq, assertTrue, assertFalse } = require('./harness');
const { makeSheet, installMocks } = require('./mocks');

function setup(sheets) {
  const ctx = loadGsFiles(false);
  installMocks(ctx, sheets);
  // Carrega Code.gs DEPOIS dos mocks estarem instalados
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  vm.runInContext(code, ctx);
  return ctx;
}

// =================================================================
// designarQuadras
// =================================================================
test('designarQuadras marca as quadras certas como Pendente', () => {
  const quadras = makeSheet('Quadras', [
    ['ID','Setor','NumQ','NumF','Poly','Cor','Terr','Status','Data'],
    ['Q1', 1, '', '', '-7,-34|-7.1,-34|-7,-34.1', '#fff', 'A', 'Concluído', new Date('2026-05-01')],
    ['Q2', 1, '', '', '-7,-34|-7.1,-34|-7,-34.1', '#fff', 'A', 'Pendente', ''],
    ['Q3', 1, '', '', '-7,-34|-7.1,-34|-7,-34.1', '#fff', 'B', 'Concluído', new Date('2026-04-01')]
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const ctx = setup([quadras, registros]);

  const r = ctx.designarQuadras(['Q1', 'Q3']);
  assertEq(r.status, 'SUCESSO');
  assertEq(r.atualizadas, 2);
  assertEq(quadras._data[1][7], 'Pendente'); // Q1 virou Pendente
  assertEq(quadras._data[2][7], 'Pendente'); // Q2 já era Pendente
  assertEq(quadras._data[3][7], 'Pendente'); // Q3 virou Pendente
});

test('designarQuadras registra histórico "Designada" para cada quadra', () => {
  const quadras = makeSheet('Quadras', [
    ['ID','Setor','NumQ','NumF','Poly','Cor','Terr','Status','Data'],
    ['Q1', 1, '', '', '', '#fff', 'A', 'Pendente', '']
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const ctx = setup([quadras, registros]);

  ctx.designarQuadras(['Q1']);
  assertEq(registros._data.length, 2); // header + 1
  assertEq(registros._data[1][0], 'Q1');
  assertEq(registros._data[1][2], 'Designada');
});

test('designarQuadras rejeita lista vazia', () => {
  const ctx = setup([
    makeSheet('Quadras', [['ID']]),
    makeSheet('Registros', [['ID','Data','Tipo','TS']])
  ]);
  let erro = null;
  try { ctx.designarQuadras([]); } catch(e) { erro = e; }
  assertTrue(erro !== null, 'deveria lançar');
});

// =================================================================
// salvarEdicaoQuadra
// =================================================================
test('salvarEdicaoQuadra rejeita polyString inválida', () => {
  const ctx = setup([makeSheet('Quadras', [['ID','Setor','NumQ','NumF','Poly','Cor','Terr','Status','Data']])]);
  let erro = null;
  try {
    ctx.salvarEdicaoQuadra({ idOriginal: 'X', idNovo: 'Y', polyString: 'lixo', color: '#fff', territory: '' });
  } catch(e) { erro = e; }
  assertTrue(erro !== null);
});

test('salvarEdicaoQuadra atualiza linha existente quando ID encontrado', () => {
  const quadras = makeSheet('Quadras', [
    ['ID','Setor','NumQ','NumF','Poly','Cor','Terr','Status','Data'],
    ['Q1', 1, '', '', 'oldpoly', '#000', 'A', 'Pendente', '']
  ]);
  const ctx = setup([quadras]);

  const r = ctx.salvarEdicaoQuadra({
    idOriginal: 'Q1', idNovo: 'Q1-novo',
    polyString: '-7.1,-34.8 | -7.2,-34.9 | -7.3,-34.7',
    color: '#ff0000', territory: 'B'
  });
  assertEq(r, 'Salvo');
  assertEq(quadras._data[1][0], 'Q1-novo');
  assertEq(quadras._data[1][5], '#ff0000');
  assertEq(quadras._data[1][6], 'B');
});

test('salvarEdicaoQuadra sanitiza tentativa de fórmula-injection', () => {
  const quadras = makeSheet('Quadras', [
    ['ID','Setor','NumQ','NumF','Poly','Cor','Terr','Status','Data'],
    ['Q1', 1, '', '', 'old', '#000', 'A', 'Pendente', '']
  ]);
  const ctx = setup([quadras]);

  // Tenta injetar fórmula no território
  ctx.salvarEdicaoQuadra({
    idOriginal: 'Q1', idNovo: 'Q1',
    polyString: '-7.1,-34.8 | -7.2,-34.9 | -7.3,-34.7',
    color: '#fff', territory: '=A1*999'
  });
  assertEq(quadras._data[1][6], "'=A1*999", 'fórmula deve vir prefixada com aspas');
});

// =================================================================
// excluirQuadra
// =================================================================
test('excluirQuadra remove a linha correta', () => {
  const quadras = makeSheet('Quadras', [
    ['ID','...'],
    ['Q1', 'a'],
    ['Q2', 'b'],
    ['Q3', 'c']
  ]);
  const ctx = setup([quadras]);
  assertEq(ctx.excluirQuadra('Q2'), 'Excluída');
  assertEq(quadras._data.length, 3); // header + 2
  assertEq(quadras._data[1][0], 'Q1');
  assertEq(quadras._data[2][0], 'Q3');
});

test('excluirQuadra devolve "Não encontrada" se ID inexistente', () => {
  const ctx = setup([makeSheet('Quadras', [['ID'], ['Q1']])]);
  assertEq(ctx.excluirQuadra('Q999'), 'Não encontrada');
});

// =================================================================
// salvarConclusaoQuadras — conflito de data
// =================================================================
test('salvarConclusaoQuadras detecta conflito quando data nova < antiga', () => {
  const quadras = makeSheet('Quadras', [
    ['ID','Setor','NumQ','NumF','Poly','Cor','Terr','Status','Data'],
    ['Q1', 1, '', '', '', '', '', 'Concluído', new Date('2026-05-01')]
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const ctx = setup([quadras, registros]);

  const r = ctx.salvarConclusaoQuadras({ ids: ['Q1'], data: '2026-04-01', modo: 'auto' });
  assertEq(r.status, 'CONFLITO');
  assertEq(r.ids[0], 'Q1');
});

test('salvarConclusaoQuadras grava Concluído quando data nova é válida', () => {
  const quadras = makeSheet('Quadras', [
    ['ID','Setor','NumQ','NumF','Poly','Cor','Terr','Status','Data'],
    ['Q1', 1, '', '', '', '', '', 'Pendente', '']
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const ctx = setup([quadras, registros]);

  const r = ctx.salvarConclusaoQuadras({ ids: ['Q1'], data: '2026-06-10', modo: 'auto' });
  assertEq(r.status, 'SUCESSO');
  assertEq(quadras._data[1][7], 'Concluído');
});

// =================================================================
// enviarEmailDesignacao
// =================================================================
test('enviarEmailDesignacao envia para email válido', () => {
  const ctx = setup([]);
  const r = ctx.enviarEmailDesignacao('test@example.com', 'João', 'https://x.y/z', 3);
  assertEq(r.status, 'SUCESSO');
  assertEq(ctx.MailApp._sent.length, 1);
  assertEq(ctx.MailApp._sent[0].to, 'test@example.com');
  assertTrue(ctx.MailApp._sent[0].body.indexOf('João') > -1);
  assertTrue(ctx.MailApp._sent[0].body.indexOf('3 quadra') > -1);
});

test('enviarEmailDesignacao rejeita email inválido', () => {
  const ctx = setup([]);
  const r = ctx.enviarEmailDesignacao('email-sem-arroba', 'X', 'link', 1);
  assertEq(r.status, 'ERRO');
});

test('enviarEmailDesignacao rejeita email vazio', () => {
  const ctx = setup([]);
  const r = ctx.enviarEmailDesignacao('', '', '', 0);
  assertEq(r.status, 'ERRO');
});

// =================================================================
// getDadosPublicos / getDadosDirigente
// =================================================================
test('getDadosPublicos devolve apenas quadras pedidas', () => {
  const dados = makeSheet('Dados Brutos', [
    ['Quadra','Setor','NumQ','NumF','Localidade','Logradouro','Numero','CompNum','Compl','Lat','Lng','Tipo','NomeEdif','Nota','NaoVisitar','OrdemCustom','BuscaApp','Ordem','UltVisita','PenVisita'],
    ['Q1', 1,'',  '', '', 'Rua A', '100', '', '', -7.1, -34.8, 'Casa', '', '', false, '', '', 1, '', ''],
    ['Q2', 1,'',  '', '', 'Rua B', '200', '', '', -7.2, -34.9, 'Casa', '', '', false, '', '', 1, '', '']
  ]);
  const quadras = makeSheet('Quadras', [
    ['ID','...','...','...','Poly','...','...','Status','Data'],
    ['Q1', '', '', '', 'poly1', '', '', '', ''],
    ['Q2', '', '', '', 'poly2', '', '', '', '']
  ]);
  const ctx = setup([dados, quadras]);
  const r = ctx.getDadosPublicos('Q1');
  assertEq(r.length, 1);
  assertEq(r[0].id, 'Q1');
  assertEq(r[0].itens.length, 1);
});

// =================================================================
// Configurações de campanha
// =================================================================
test('salvarConfiguracoesCampanhaCompleta persiste campos novos', () => {
  const ctx = setup([]);
  ctx.salvarConfiguracoesCampanhaCompleta({
    nome: 'X', data: '2026-01-01', dataFim: '2026-12-01',
    objetivo: 'Cobrir', estrategia: 'Sábados', metaSemanal: 5
  });
  const lido = ctx.obterConfiguracoesCampanha();
  assertEq(lido.nome, 'X');
  assertEq(lido.metaSemanal, 5);
  assertEq(lido.objetivo, 'Cobrir');
  assertEq(lido.dataFim, '2026-12-01');
});

// =================================================================
// getHistoricoQuadra
// =================================================================
test('getHistoricoQuadra devolve eventos da quadra do mais recente para o mais antigo', () => {
  const registros = makeSheet('Registros', [
    ['ID','Data','Tipo','TS'],
    ['Q1', new Date('2026-05-01'), 'Designada', new Date('2026-05-01T10:00:00')],
    ['Q2', new Date('2026-06-01'), 'Designada', new Date('2026-06-01T10:00:00')],
    ['Q1', new Date('2026-06-10'), 'Concluído', new Date('2026-06-10T15:30:00')],
    ['Q1', new Date('2026-04-01'), 'Designada', new Date('2026-04-01T09:00:00')]
  ]);
  const ctx = setup([makeSheet('Quadras', [['ID']]), registros]);
  const r = ctx.getHistoricoQuadra('Q1');
  assertEq(r.length, 3);
  assertEq(r[0].tipo, 'Concluído'); // mais recente primeiro
  assertEq(r[2].tipo, 'Designada'); // mais antigo no fim
});

test('getHistoricoQuadra retorna [] para ID inexistente', () => {
  const ctx = setup([makeSheet('Quadras', [['ID']]), makeSheet('Registros', [['ID','Data','Tipo','TS'], ['Q1', new Date(), 'Concluído', new Date()]])]);
  assertEq(ctx.getHistoricoQuadra('Q999'), []);
});

test('getHistoricoQuadra limita a 50 eventos', () => {
  const rows = [['ID','Data','Tipo','TS']];
  for (let i = 0; i < 80; i++) {
    rows.push(['Q1', new Date(2026, 0, 1 + i), 'Concluído', new Date(2026, 0, 1 + i, 12, 0)]);
  }
  const ctx = setup([makeSheet('Quadras', [['ID']]), makeSheet('Registros', rows)]);
  const r = ctx.getHistoricoQuadra('Q1');
  assertEq(r.length, 50);
});

// =================================================================
// healthCheck
// =================================================================
test('healthCheck retorna ok=true quando abas críticas existem', () => {
  const ctx = setup([
    makeSheet('Quadras', [['ID']]),
    makeSheet('Dados Brutos', [['Quadra']])
  ]);
  const r = ctx.healthCheck();
  assertEq(r.ok, true);
  assertEq(r.sheetQuadras, true);
  assertEq(r.sheetDados, true);
});

test('healthCheck retorna ok=false sem aba Quadras', () => {
  const ctx = setup([makeSheet('Dados Brutos', [['Quadra']])]);
  const r = ctx.healthCheck();
  assertEq(r.ok, false);
  assertEq(r.sheetQuadras, false);
});

// =================================================================
// getDadosDashboard
// =================================================================
test('getDadosDashboard computa KPIs e ranking corretamente', () => {
  const dataInicio = new Date('2026-01-01');
  const dataDentro = new Date('2026-03-15');
  const dataAntes = new Date('2025-11-01');

  const quadras = makeSheet('Quadras', [
    ['ID','Setor','NumQ','NumF','Poly','Cor','Terr','Status','Data'],
    ['Q1', 1, '', '', '', '', 'A', 'Concluído', dataDentro],
    ['Q2', 1, '', '', '', '', 'A', 'Concluído', dataDentro],
    ['Q3', 1, '', '', '', '', 'A', 'Pendente', ''],
    ['Q4', 1, '', '', '', '', 'B', 'Concluído', dataDentro],
    ['Q5', 1, '', '', '', '', 'B', 'Pendente', ''],
    ['Q6', 1, '', '', '', '', 'B', 'Pendente', ''],
    ['Q7', 1, '', '', '', '', 'C', 'Concluído', dataAntes] // antes da campanha
  ]);
  const registros = makeSheet('Registros', [['ID','Data','Tipo','TS']]);
  const ctx = setup([quadras, registros]);
  ctx.salvarConfiguracoesCampanhaCompleta({ nome: 'X', data: '2026-01-01' });

  const r = ctx.getDadosDashboard();
  assertEq(r.kpis.totalQuadras, 7);
  assertEq(r.kpis.completasCampanha, 3); // Q1, Q2, Q4 (Q7 antes do início)
  assertEq(r.kpis.restantes, 4);

  // Ranking: A tem 2/3 = 67%, B tem 1/3 = 33%, C tem 0/1 = 0%
  const ranking = r.ranking;
  assertEq(ranking[0].nome, 'A');
  assertEq(ranking[0].porcentagem, 67);
  assertEq(ranking[1].nome, 'B');
  assertEq(ranking[2].nome, 'C');
});

test('getDadosDashboard porSemana e porMes têm 12 entradas', () => {
  const ctx = setup([
    makeSheet('Quadras', [['ID']]),
    makeSheet('Registros', [['ID','Data','Tipo','TS']])
  ]);
  ctx.salvarConfiguracoesCampanhaCompleta({ nome: 'X', data: '2026-01-01' });
  const r = ctx.getDadosDashboard();
  assertEq(r.porSemana.length, 12);
  assertEq(r.porMes.length, 12);
});

const { loadGsFiles, test, assertEq, assertTrue, assertFalse } = require('./harness');
const ctx = loadGsFiles();

// === validarPolyString_ ===
test('validarPolyString_ aceita polígono válido de 3+ pontos', () => {
  const r = ctx.validarPolyString_('-7.1,-34.8 | -7.2,-34.9 | -7.3,-34.7');
  assertTrue(r.ok, 'deveria aceitar; msg=' + r.msg);
});

test('validarPolyString_ rejeita polígono com menos de 3 pontos', () => {
  const r = ctx.validarPolyString_('-7.1,-34.8 | -7.2,-34.9');
  assertFalse(r.ok);
});

test('validarPolyString_ rejeita coordenada fora do globo', () => {
  const r = ctx.validarPolyString_('-95,0 | 0,0 | 10,10');
  assertFalse(r.ok);
});

test('validarPolyString_ rejeita string vazia', () => {
  assertFalse(ctx.validarPolyString_('').ok);
  assertFalse(ctx.validarPolyString_(null).ok);
  assertFalse(ctx.validarPolyString_(undefined).ok);
});

test('validarPolyString_ aceita polígono com quebras de linha em vez de pipe', () => {
  const r = ctx.validarPolyString_('-7.1,-34.8\n-7.2,-34.9\n-7.3,-34.7');
  assertTrue(r.ok);
});

// === validarId_ ===
test('validarId_ aceita IDs comuns', () => {
  assertTrue(ctx.validarId_('Q-123').ok);
  assertTrue(ctx.validarId_('0457P').ok);
  assertTrue(ctx.validarId_('Quadra 5').ok);
});

test('validarId_ rejeita ID vazio', () => {
  assertFalse(ctx.validarId_('').ok);
  assertFalse(ctx.validarId_('   ').ok);
});

test('validarId_ rejeita ID com caracteres perigosos', () => {
  assertFalse(ctx.validarId_('Q<script>').ok);
  assertFalse(ctx.validarId_('=CMD()').ok);
  assertFalse(ctx.validarId_("q'; DROP").ok);
});

test('validarId_ rejeita ID muito longo', () => {
  assertFalse(ctx.validarId_('a'.repeat(51)).ok);
});

// === validarData_ ===
test('validarData_ aceita yyyy-MM-dd', () => {
  assertTrue(ctx.validarData_('2026-06-13').ok);
});

test('validarData_ aceita ISO completo', () => {
  assertTrue(ctx.validarData_('2026-06-13T15:30:00.000Z').ok);
});

test('validarData_ rejeita string inválida', () => {
  assertFalse(ctx.validarData_('xyz').ok);
  assertFalse(ctx.validarData_('').ok);
  assertFalse(ctx.validarData_(null).ok);
});

// === validarCor_ ===
test('validarCor_ aceita hex válido e devolve igual', () => {
  assertEq(ctx.validarCor_('#FF0000'), '#FF0000');
  assertEq(ctx.validarCor_('#abc'), '#abc');
});

test('validarCor_ devolve cor padrão para inválido', () => {
  assertEq(ctx.validarCor_(''), '#3388ff');
  assertEq(ctx.validarCor_('vermelho'), '#3388ff');
  assertEq(ctx.validarCor_(null), '#3388ff');
});

// === sanitizar_ ===
test('sanitizar_ prefixa fórmulas com aspas simples', () => {
  assertEq(ctx.sanitizar_('=A1*2'), "'=A1*2");
  assertEq(ctx.sanitizar_('+CMD'), "'+CMD");
  assertEq(ctx.sanitizar_('@func'), "'@func");
});

test('sanitizar_ deixa strings normais intactas', () => {
  assertEq(ctx.sanitizar_('texto normal'), 'texto normal');
  assertEq(ctx.sanitizar_('Q-123'), 'Q-123');
});

test('sanitizar_ trata null/undefined como string vazia', () => {
  assertEq(ctx.sanitizar_(null), '');
  assertEq(ctx.sanitizar_(undefined), '');
});

// === acharLinhaQuadra_ ===
test('acharLinhaQuadra_ retorna linha 1-indexed quando encontra', () => {
  const data = [
    ['ID','outras_cols'],
    ['Q1','x'],
    ['Q2','y'],
    ['Q3','z']
  ];
  assertEq(ctx.acharLinhaQuadra_(data, 'Q2'), 3); // linha 1-indexed
});

test('acharLinhaQuadra_ retorna -1 quando não encontra', () => {
  const data = [['ID'], ['Q1'], ['Q2']];
  assertEq(ctx.acharLinhaQuadra_(data, 'Q999'), -1);
});

// === Constantes ===
test('COL.QUADRAS tem mapeamento consistente 0idx/1idx', () => {
  assertEq(ctx.COL.QUADRAS.ID_1IDX, ctx.COL.QUADRAS.ID + 1);
  assertEq(ctx.COL.QUADRAS.STATUS_1IDX, ctx.COL.QUADRAS.STATUS + 1);
  assertEq(ctx.COL.QUADRAS.DATA_CONC_1IDX, ctx.COL.QUADRAS.DATA_CONC + 1);
});

test('STATUS enum tem valores esperados', () => {
  assertEq(ctx.STATUS.PENDENTE, 'Pendente');
  assertEq(ctx.STATUS.CONCLUIDO, 'Concluído');
});

test('SHEET enum tem nomes esperados', () => {
  assertEq(ctx.SHEET.QUADRAS, 'Quadras');
  assertEq(ctx.SHEET.DADOS, 'Dados Brutos');
  assertEq(ctx.SHEET.REGISTROS, 'Registros');
});

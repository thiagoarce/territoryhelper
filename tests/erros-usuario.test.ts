import { assertEq, assertFalse, assertTrue, test } from './harness';
import { domainMessage, friendlyError } from '../src/lib/erros-usuario';

test('404 e 405 nunca aparecem crus para o usuário', () => {
  const missing = friendlyError(new Error('404 Not Found'), 404);
  const method = friendlyError(new Error('405 Method Not Allowed'), 405);
  assertFalse(missing.message.includes('404'));
  assertFalse(method.message.includes('405'));
  assertEq(missing.diagnosticCode, 'RESOURCE_NOT_FOUND');
  assertTrue(method.retryable);
});

test('mensagem de validação escrita para o usuário é preservada', () => {
  assertEq(domainMessage('Informe o número do endereço.', 400), 'Informe o número do endereço.');
  assertFalse(domainMessage('new row violates check constraint locais_tipo_check', 400).includes('constraint'));
});

test('erro de RLS vira mensagem curta de autorização', () => {
  const result = friendlyError(new Error('new row violates row-level security policy'), 403);
  assertEq(result.diagnosticCode, 'ACTION_NOT_ALLOWED');
  assertFalse(result.message.toLowerCase().includes('policy'));
});

test('códigos internos da baseline viram instruções de domínio', () => {
  const assignment = friendlyError(new Error('QUADRA_NOT_ASSIGNED'));
  const structure = friendlyError(new Error('LOCAL_STRUCTURAL_CHANGE_NOT_ALLOWED'));
  assertEq(assignment.diagnosticCode, 'ITEM_NOT_ASSIGNED');
  assertFalse(assignment.message.includes('QUADRA'));
  assertEq(structure.diagnosticCode, 'STRUCTURAL_CHANGE_NOT_ALLOWED');
  assertFalse(structure.message.includes('LOCAL'));
});

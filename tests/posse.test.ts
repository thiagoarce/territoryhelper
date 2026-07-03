// Testa o helper único de posse de quadra ($lib/server/posse.ts), que
// centraliza a mesma decisão que existe em SQL na função pode_editar_local
// (RLS) — ver comentário no topo de posse.ts. Guard exigirQuadraDesignada
// só junta os booleans (via queries reais) e delega a decisão pra cá.
import { test, assertTrue, assertFalse } from './harness';
import { podeTrabalharQuadra, type PosseQuadraInput } from '../src/lib/server/posse';

const NINGUEM: PosseQuadraInput = {
  ehAdminOuDirigente: false,
  ehLiderDeDesignacaoAberta: false,
  ehParticipanteDeDesignacaoAberta: false,
  ehIncluidoEmParteDeArranjoAtiva: false,
  quadraEmArranjoAtivo: false
};

test('publicador sem nenhum vínculo é bloqueado', () => {
  assertFalse(podeTrabalharQuadra(NINGUEM));
});

test('admin/dirigente sempre passa, mesmo sem designação', () => {
  assertTrue(podeTrabalharQuadra({ ...NINGUEM, ehAdminOuDirigente: true }));
});

test('líder de designação pessoal aberta passa', () => {
  assertTrue(podeTrabalharQuadra({ ...NINGUEM, ehLiderDeDesignacaoAberta: true }));
});

test('participante (dupla/trio) de designação passa — não só o líder', () => {
  assertTrue(podeTrabalharQuadra({ ...NINGUEM, ehParticipanteDeDesignacaoAberta: true }));
});

test('incluído numa parte de arranjo ativa passa', () => {
  assertTrue(podeTrabalharQuadra({ ...NINGUEM, ehIncluidoEmParteDeArranjoAtiva: true }));
});

test('quadra em arranjo ativo (saída de grupo) passa pra qualquer publicador', () => {
  assertTrue(podeTrabalharQuadra({ ...NINGUEM, quadraEmArranjoAtivo: true }));
});

test('qualquer combinação com pelo menos 1 vínculo verdadeiro passa', () => {
  assertTrue(podeTrabalharQuadra({ ...NINGUEM, ehLiderDeDesignacaoAberta: true, quadraEmArranjoAtivo: true }));
});

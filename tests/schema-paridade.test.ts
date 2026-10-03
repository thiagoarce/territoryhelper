// O MESMO código do app roda em dois tipos de banco:
//   - a instância original, montada pelo histórico supabase/migrations/;
//   - instalações novas (Territory Installer), montadas por supabase/baseline/.
// Toda RPC e toda tabela/view que o app consulta precisa existir nos dois.
// Foi exatamente essa divergência que a migration 096 fechou (colunas de
// área, installation_config, RPCs de conclusão/censo) — sem ela, juntar a
// branch do instalador derrubava a congregação original no deploy.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, assertTrue } from './harness';

const raiz = new URL('..', import.meta.url).pathname;

function arquivosDoApp(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return p.includes('installer') ? [] : arquivosDoApp(p);
    return /\.(ts|svelte)$/.test(f) ? [p] : [];
  });
}

const app = arquivosDoApp(join(raiz, 'src'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
const sqlDe = (d: string) =>
  readdirSync(join(raiz, d))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(raiz, d, f), 'utf8').toLowerCase())
    .join('\n');
const migrations = sqlDe('supabase/migrations');
const baseline = sqlDe('supabase/baseline');

const rpcs = [...new Set([...app.matchAll(/\.rpc\(\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]))].sort();
const relacoes = [...new Set([...app.matchAll(/\.from\(\s*['"]([a-z_]+)['"]\s*\)/g)].map((m) => m[1]))].sort();

const temFuncao = (sql: string, n: string) => new RegExp(`function\\s+(public\\.)?${n}\\s*\\(`).test(sql);
const temRelacao = (sql: string, n: string) =>
  new RegExp(`(table|view)\\s+(if\\s+not\\s+exists\\s+)?(public\\.)?${n}\\b`).test(sql);

// Fora da baseline DE PROPÓSITO:
// - exec_sql: SQL arbitrário pela tela /admin/dev/sql — instalação nova
//   não ganha essa porta;
// - módulos que a baseline ainda não traz (supabase/baseline/modules/):
//   o Installer publica a instalação com campaigns/publicWitnessing/
//   publications = false e o root layout bloqueia as rotas. Ao portar um
//   módulo pra baseline, TIRE as tabelas dele daqui.
const SO_NO_HISTORICO_RPC = new Set(['exec_sql']);
const MODULO_FORA_DA_BASELINE = /^(tp_|campanha|pedidos_publicacao|publicacao|publicacoes|publicador_necessidade_regular)/;

test('paridade: toda RPC usada pelo app existe no histórico E na baseline', () => {
  assertTrue(rpcs.length > 5, 'a varredura não achou RPCs — regex quebrou?');
  for (const n of rpcs) {
    assertTrue(temFuncao(migrations, n), `RPC ${n} falta em supabase/migrations (instância original)`);
    if (!SO_NO_HISTORICO_RPC.has(n)) {
      assertTrue(temFuncao(baseline, n), `RPC ${n} falta em supabase/baseline (instalações novas)`);
    }
  }
});

test('paridade: toda tabela/view usada pelo app existe no histórico E na baseline (fora módulos)', () => {
  assertTrue(relacoes.length > 20, 'a varredura não achou tabelas — regex quebrou?');
  for (const n of relacoes) {
    assertTrue(temRelacao(migrations, n), `tabela/view ${n} falta em supabase/migrations (instância original)`);
    if (!MODULO_FORA_DA_BASELINE.test(n)) {
      assertTrue(temRelacao(baseline, n), `tabela/view ${n} falta em supabase/baseline (instalações novas)`);
    }
  }
});

test('paridade: colunas de área que o app filtra existem nos dois caminhos', () => {
  for (const col of ['tipo_area', 'finalidade', 'origem_geografica', 'revisao_status', 'confianca']) {
    assertTrue(migrations.includes(`add column if not exists ${col}`), `${col} falta no histórico`);
    assertTrue(baseline.includes(`add column if not exists ${col}`), `${col} falta na baseline`);
  }
  assertTrue(migrations.includes('add column if not exists entidade'), 'curadoria_edicoes.entidade falta no histórico');
});

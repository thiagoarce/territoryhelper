import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertEq, assertFalse, assertTrue, test } from './harness';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(testsDir, '../supabase/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => /^\d{3}_.+\.sql$/.test(file))
  .sort();

function migrationNumber(file: string): number {
  return Number(file.slice(0, 3));
}

function readMigration(number: number): string {
  const prefix = String(number).padStart(3, '0') + '_';
  const matches = migrationFiles.filter((file) => file.startsWith(prefix));
  assertEq(matches.length, 1, `migration ${prefix} deve existir uma única vez`);
  return readFileSync(path.join(migrationsDir, matches[0]), 'utf8');
}

function executableSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function containsSql(sql: string, fragment: string, message: string): void {
  assertTrue(executableSql(sql).includes(executableSql(fragment)), message);
}

test('histórico 001–092 é contínuo, exceto pela lacuna documentada 021', () => {
  const numbers = migrationFiles.map(migrationNumber).filter((number) => number <= 92);
  const unique = [...new Set(numbers)];
  const expected = Array.from({ length: 92 }, (_, index) => index + 1).filter(
    (number) => number !== 21
  );

  assertEq(numbers, unique, 'não deve haver numeração duplicada até 092');
  assertEq(unique, expected, 'a única lacuna histórica permitida até 092 é 021');
});

test('083 impede enumeração anônima direta dos tokens públicos', () => {
  const sql = readMigration(83);
  const normalized = executableSql(sql);

  containsSql(
    sql,
    'create policy territorio_tokens_select on territorio_tokens for select to authenticated using (true)',
    'territorio_tokens deve ser legível diretamente apenas por authenticated'
  );
  containsSql(
    sql,
    'create policy cartas_tokens_select on cartas_tokens for select to authenticated using (true)',
    'cartas_tokens deve ser legível diretamente apenas por authenticated'
  );
  assertFalse(
    normalized.includes('for select to anon'),
    '083 não pode recriar SELECT direto para anon'
  );
});

test('082 permanece como a última definição de territorio_publico até 092', () => {
  const sql082 = executableSql(readMigration(82));
  assertTrue(
    sql082.includes('create or replace function territorio_publico'),
    '082 deve definir territorio_publico'
  );
  assertTrue(sql082.includes('tce_comercios'), '082 deve incluir o contexto de comércios de TCE');

  const laterRedefinitions = migrationFiles
    .filter((file) => {
      const number = migrationNumber(file);
      return number >= 83 && number <= 92;
    })
    .filter((file) =>
      executableSql(readFileSync(path.join(migrationsDir, file), 'utf8')).includes(
        'create or replace function territorio_publico'
      )
    );

  assertEq(laterRedefinitions, [], 'nenhuma migration 083–092 deve substituir territorio_publico');
});

test('089 exige autoria própria e limita o payload de erros_client', () => {
  const sql = readMigration(89);

  containsSql(
    sql,
    'create policy erros_client_insert on erros_client for insert to authenticated with check (publicador_id = auth.uid())',
    'erros_client deve exigir autoria do usuário autenticado'
  );
  containsSql(sql, 'length(mensagem) <= 2000', 'mensagem deve possuir limite no banco');
  containsSql(sql, 'length(stack) <= 4000', 'stack deve possuir limite no banco');
  containsSql(sql, 'length(url) <= 1000', 'URL deve possuir limite no banco');
  containsSql(sql, 'length(user_agent) <= 500', 'user agent deve possuir limite no banco');
});

test('090 limita o dirigente à conclusão da quadra e ao histórico correspondente', () => {
  const sql = readMigration(90);

  containsSql(
    sql,
    "(to_jsonb(new) - 'data_conclusao' - 'atualizado_em') is distinct from (to_jsonb(old) - 'data_conclusao' - 'atualizado_em')",
    'a guarda deve proteger automaticamente todas as outras colunas da quadra'
  );
  containsSql(
    sql,
    'create policy quadras_dirigente_conclusao on quadras for update to authenticated using (is_dirigente_or_admin()) with check (is_dirigente_or_admin())',
    'UPDATE de quadra deve ser limitado a dirigente ou admin'
  );
  containsSql(
    sql,
    'create policy qc_delete_dirigente on quadras_conclusoes for delete to authenticated using (is_dirigente_or_admin())',
    'desfazer conclusão deve possuir policy explícita para dirigente ou admin'
  );
});

test('091 protege todos os privilégios atuais de profiles sem usar current_user', () => {
  const sql = readMigration(91);
  const normalized = executableSql(sql);

  containsSql(
    sql,
    'if auth.uid() is null then return new; end if',
    'contextos administrativos devem ser identificados pelo UID de autenticação'
  );
  containsSql(sql, 'new.role is distinct from old.role', 'role deve permanecer protegida');
  containsSql(sql, 'new.ativo is distinct from old.ativo', 'ativo deve permanecer protegido');
  containsSql(
    sql,
    'new.servo_publicacoes is distinct from old.servo_publicacoes',
    'servo_publicacoes deve permanecer protegido'
  );
  containsSql(
    sql,
    'new.tp_aprovado is distinct from old.tp_aprovado',
    'tp_aprovado deve ser protegido pela guarda'
  );
  assertFalse(
    normalized.includes('current_user'),
    'a guarda final não pode inferir o chamador por current_user dentro de SECURITY DEFINER'
  );
});

test('092 restringe INSERT no histórico de conclusões a dirigente ou admin', () => {
  const sql = readMigration(92);
  const normalized = executableSql(sql);

  containsSql(
    sql,
    'drop policy if exists qc_insert_auth on quadras_conclusoes',
    'a policy permissiva histórica deve ser removida'
  );
  containsSql(
    sql,
    'create policy qc_insert_dirigente on quadras_conclusoes for insert to authenticated with check (is_dirigente_or_admin())',
    'o histórico deve aceitar INSERT somente de dirigente ou admin'
  );
  assertFalse(
    normalized.includes('with check (true)'),
    '092 não pode manter INSERT irrestrito para qualquer autenticado'
  );
});

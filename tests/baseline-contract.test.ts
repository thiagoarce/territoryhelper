import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEq, assertFalse, assertTrue, test } from './harness';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = join(root, 'supabase', 'baseline');
const files = readdirSync(baseline).filter((file) => /^\d{3}_.+\.sql$/.test(file)).sort();
const sql = files.map((file) => readFileSync(join(baseline, file), 'utf8')).join('\n').toLowerCase();

test('baseline curta tem sequência própria e não reproduz 001–090', () => {
  assertEq(files, [
    '000_extensions.sql', '010_schema_metadata.sql', '020_identity.sql',
    '030_geographic_core.sql', '035_work_area_metadata.sql', '040_operational_core.sql', '045_platform_support.sql',
    '050_views_and_indexes.sql', '060_functions_and_triggers.sql',
    '065_spatial_and_public_functions.sql', '070_rls.sql', '080_storage.sql'
  ]);
  assertFalse(sql.includes('truncate '));
  assertFalse(/\bdelete from public\.\w+\s*;/.test(sql));
  assertFalse(sql.includes('backfill'));
});

test('baseline inclui o suporte transversal carregado pelo shell do aplicativo', () => {
  for (const table of ['territorio_tokens', 'cartas_tokens', 'notificacoes', 'push_subscriptions', 'erros_client']) {
    assertTrue(sql.includes(`create table if not exists public.${table}`), `faltou ${table}`);
  }
  assertTrue(sql.includes('function public.territorio_publico'));
  assertTrue(sql.includes('function public.carta_publica_dados'));
  assertTrue(sql.includes('function public.buscar_locais_proximos'));
});

test('baseline centraliza conclusão contextual de quadra', () => {
  assertTrue(sql.includes('function public.pode_concluir_quadra'));
  assertTrue(sql.includes("d.tipo = 'pessoal'"));
  assertTrue(sql.includes('public.participa_designacao'));
  assertTrue(sql.includes('function public.registrar_conclusao_quadra'));
  assertTrue(sql.includes("raise exception 'quadra_not_assigned'"));
});

test('RLS mantém edição operacional livre e protege estrutura por trigger', () => {
  assertTrue(sql.includes('policy "locais_update_authenticated"'));
  assertTrue(sql.includes('policy "unidades_update_authenticated"'));
  assertTrue(sql.includes('function public.guard_locais_update'));
  assertTrue(sql.includes("raise exception 'local_structural_change_not_allowed'"));
  assertTrue(sql.includes("'unidades', coalesce((select jsonb_agg"));
  assertTrue(sql.includes("auth.uid(), 'exclusao'"));
});

test('baseline isola a malha de idioma das operações de território', () => {
  // Vínculo automático de endereço do CNEFE: só pregação regular aprovada.
  assertTrue(sql.includes("q.finalidade = 'regular-preaching' and q.revisao_status = 'approved'"));
  // Dividir uma área herda os metadados: sem isso a metade nova nascia
  // 'urban-block'/'regular-preaching' e passava a receber endereço do CNEFE.
  assertTrue(sql.includes('v_original.tipo_area, v_original.finalidade, v_original.origem_geografica'));
  // Juntar áreas de finalidades diferentes criaria área ambígua.
  assertTrue(sql.includes('não é possível juntar áreas de finalidades diferentes'));
});

test('baseline consulta a malha de idioma pela região visível', () => {
  assertTrue(sql.includes('function public.resumo_censo_idioma'));
  assertTrue(sql.includes('function public.areas_censo_viewport'));
  assertTrue(sql.includes("q.finalidade = 'language-census'"));
  assertTrue(sql.includes('q.poly && st_makeenvelope'));
  assertTrue(sql.includes('st_intersects(q.poly, st_makeenvelope'));
  assertTrue(sql.includes('limit greatest(1, least(coalesce(p_limite, 1500), 2000))'));
});

test('baseline registra versão, configuração e importações idempotentes', () => {
  assertTrue(sql.includes('create table if not exists public.schema_versions'));
  assertTrue(sql.includes('create table if not exists public.installation_config'));
  assertTrue(sql.includes('manifest_hash text not null unique'));
});

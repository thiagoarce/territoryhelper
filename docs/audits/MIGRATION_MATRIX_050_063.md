# Migration Matrix — 050–063

Status: audited from the SQL files on `main`.

This block spans invitations, publications, public witnessing, letters, curation, map preferences and view maintenance. Several migrations are transitional and must not be copied verbatim into a future clean baseline.

## Classification

| Migration | Main responsibility | Classification | Baseline treatment |
|---|---|---|---|
| `050_convites_provisorios.sql` | Links invitations to a provisionally created publisher through `convites.publicador_id`. | Canonical schema evolution | Include the final column and FK only if provisional invitations remain part of the supported onboarding flow. |
| `051_publicacoes_catalogo.sql` | Expands publication catalog, adds cover-image Storage bucket and creates `publicador_necessidade_regular`. | Canonical optional module, with security review required | Include in the publications module. Storage write/delete policies are too broad for a clean baseline and should be restricted to admin. |
| `052_publicacoes_seed.sql` | Seeds the official publication catalog. | Seed | Keep separate from schema. Make optional, versioned and rerunnable. Do not place congregation-specific inventory values in the seed. |
| `053_publicacao_controle.sql` | Creates manual publication-by-publisher control records. | Canonical optional module | Include only when the publications module is enabled. Current access is effectively admin-only after migration 060. |
| `054_tp_disponibilidade_confirmacao.sql` | Monthly confirmation of weekly public-witnessing availability. | Obsolete / absorbed by 058 | Exclude. `tp_disponibilidade_mes` in 058 replaces the functional use of this table. Decide separately whether to drop the orphan table in existing installations. |
| `055_carta_escrita_por.sql` | Records who marked a letter as written. | Canonical | Fold `unidades.carta_escrita_por` into the final `unidades` definition. |
| `056_ciclos_casa_e_cartas.sql` | Introduces global letter cycles and redefines `carta_publica_toggle`. | Transitional, absorbed by 062 | Keep the `cartas_ciclos` concept, but not the global-only RPC version. Baseline must use the final per-building cycle model. |
| `057_edicao_livre_curadoria.sql` | Introduces public overlay editing, curation queue, structural-column guards and broad authenticated UPDATE policies. | Canonical architecture with high security sensitivity | Include final columns, curation table, final trigger versions and deliberately tested RLS. Do not copy the migration blindly because `guard_locais_update()` is later replaced by 075. |
| `058_tp_mensal.sql` | Replaces weekly confirmation with per-month availability and monthly planning phases. | Canonical optional module; absorbs 054 | Include in the public-witnessing module. Treat `tp_disponibilidade_confirmacoes` as historical/obsolete. |
| `059_pref_basemap.sql` | Adds per-user global basemap preference. | Canonical UI preference | Include in `profiles` if the same basemap options remain supported. |
| `060_fim_servo_publicacoes.sql` | Retires the `servo_publicacoes` capability by redefining `is_servo_pub()` as admin-only. | Transitional compatibility shim | Baseline should not preserve a misleading capability. Prefer direct admin policies and remove the unused column/function after compatibility analysis. |
| `061_locais_geo_colunas_novas.sql` | Recreates `locais_geo` so later columns appear in the view. | Corrective, absorbed into final view | Baseline should create the final view once, with explicit column order. |
| `062_ciclo_cartas_por_predio.sql` | Evolves letter cycles from global-only to per-building plus global fallback; replaces public toggle RPC. | Canonical final evolution of 056 | Include `cartas_ciclos.local_id`, index and the final RPC logic, subject to later migrations that may redefine the RPC. |
| `063_revistas_mensais.sql` | Adds monthly periodicity and publication-need variants. | Canonical optional module plus data migration | Include final columns and final unique constraint. Move the `UPDATE` that marks seed rows into the publications seed/versioning process. |

## Object evolution

### Publications

- `publicacoes` is expanded in 051 and 063.
- `publicador_necessidade_regular` is created in 051 and its uniqueness model is replaced in 063.
- `052` is content, not schema.
- `053` is a distinct manual control workflow.
- `060` changes the authorization meaning of all policies that call `is_servo_pub()` without rewriting those policies.

**Baseline consequence:** publications should be an optional module with explicit admin authorization. A clean baseline should not retain the old `servo_publicacoes` semantic merely as a compatibility alias.

### Public witnessing

- `054` creates monthly confirmation for a weekly template.
- `058` explicitly states that monthly availability rows replace that confirmation model and leave the old table unused.

**Baseline consequence:** exclude `tp_disponibilidade_confirmacoes`; create only the final monthly planning model.

### Letters

- `055` adds attribution for letter writing.
- `056` introduces a global cycle and public toggle behavior.
- `062` replaces the global-only design with per-building cycles plus global fallback.

**Baseline consequence:** the global-only implementation is historical. New installations should begin with the 062 data model and final RPC behavior.

### Local editing and curation

`057` is a major architectural change:

- authenticated users receive broad UPDATE policies on `locais` and `unidades`;
- triggers become the real column-level authorization boundary;
- non-admin overlay edits are tracked in `curadoria_edicoes`;
- structural and work-specific fields are protected inside trigger functions.

This means RLS alone does not describe the authorization model. Contract tests must cover RLS and trigger behavior together.

`guard_locais_update()` from 057 is not the final version because migration 075 adds a transaction-local exception for the controlled position-correction RPC.

### Views

`061` demonstrates a recurring risk: a view originally created with `l.*` did not automatically expose columns added later. The final baseline should always define operational views with explicit columns and tests that compare expected view columns against the table model.

## Security findings

1. The Storage policies in 051 allow every authenticated user to insert and delete publication cover images. The future baseline should restrict writes to admin unless the product intentionally supports community-managed covers.
2. Migration 057 deliberately uses permissive authenticated UPDATE policies and relies on triggers for field-level control. Disabling, bypassing or incorrectly redefining those triggers would expose structural data.
3. `carta_publica_toggle` is `SECURITY DEFINER` and callable by `anon`; its token-to-local and unit-to-local checks are security-critical and require negative tests.
4. `is_servo_pub()` after 060 is a compatibility indirection whose name no longer matches its meaning. This is maintainability and authorization debt.
5. Public read access to `cartas_ciclos` exposes only cycle dates, but this should still be documented as intentional anonymous metadata.

## Baseline decisions proposed

- Separate publications and public witnessing into optional feature modules.
- Keep seeds outside schema migrations.
- Exclude 054 from new installations.
- Absorb 056 into the final 062 model.
- Absorb 061 into one final `locais_geo` definition.
- Replace the 060 compatibility shim with explicit final authorization rules after all dependent policies are inventoried.
- Treat 057/075 trigger behavior as part of the RLS contract test suite.
- Preserve original and normalized CNEFE fields independently; the curation model should never overwrite source provenance silently.

## Required dependency follow-up

Before final consolidation, inspect:

- migrations that originally create `convites`, `publicacoes`, `tp_disponibilidade`, `tp_agendamentos`, `cartas_tokens`, `locais_geo`, `is_servo_pub()` and `pode_editar_local()`;
- all later redefinitions of `carta_publica_toggle`;
- application code that still reads `profiles.servo_publicacoes` or `tp_disponibilidade_confirmacoes`;
- Storage policies modified after 051;
- RLS and trigger tests for editing `locais` and `unidades`.

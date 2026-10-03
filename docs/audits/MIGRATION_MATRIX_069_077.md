# Migration Matrix — 069 through 077

## Scope

This document classifies migrations `069..077` from `main` for consolidation into a future installer baseline.

Legend:

- **Canonical** — final-state schema or behavior that should exist in new installations.
- **Absorbed** — useful intent, but historical SQL should be merged into a later/final definition.
- **Optional module** — not required for the minimum territorial core.
- **Infrastructure option** — deployment/operations capability that should be configurable.
- **Corrective** — fixes a defect introduced or exposed by an earlier migration.

## Matrix

| Migration | Domain | Classification | Objects / behavior | Baseline treatment |
|---|---|---|---|---|
| `069_tp_reserva.sql` | Public witnessing | Optional module, canonical policies | Adds RLS rules allowing an approved publisher to create and manage a one-off reservation and participants | Include only when the public-witnessing module is enabled; consolidate with final `tp_agendamentos` policies |
| `070_tces_com_quadras_view.sql` | TCE / performance | Canonical optimization | Creates `tces_com_quadras` as a `security_invoker` aggregate view | Include in the TCE module unless later replaced; test RLS propagation and query plan |
| `071_quadras_contagens_view.sql` | Geographic core / performance | Absorbed by `073` | Creates first version of `quadras_contagens` | Do not reproduce; use the corrected definition from `073` |
| `072_tce_via_parte_arranjo.sql` | TCE / authorization | Canonical intent, security-sensitive | Adds read paths for TCE and TCE units received through an active arrangement part | Consolidate into canonical authorization helpers/policies and test all possession paths |
| `073_quadras_contagens_int.sql` | Geographic core / performance | Corrective and canonical | Recreates `quadras_contagens` with integer counts for PostgREST/MapLibre compatibility | Include only this final view definition |
| `074_backups_auto_bucket.sql` | Backup / Storage | Infrastructure option, absorbed by `076` operational model | Creates private `backups-auto` bucket; comments describe initial server/service-role model | Create bucket only when automatic backups are enabled; do not preserve obsolete execution assumptions |
| `075_reportar_posicao_incorreta.sql` | Data quality / geospatial correction | Canonical intent, high-risk | Creates privileged correction RPC and modifies `guard_locais_update` to permit transaction-scoped structural corrections | Include only after dedicated security tests; consolidate guard function with its final definition |
| `076_backups_auto_policies_admin.sql` | Backup / Storage | Infrastructure option, canonical current model | Lets authenticated admins list, insert and delete snapshots in private backup bucket | Include with optional backup module and explicit threat model |
| `077_audit_log_ts_idx.sql` | Audit / performance | Canonical | Adds descending timestamp index for recent audit queries | Include in core audit schema |

## Detailed findings

### 069 — public-witnessing reservation

This migration depends on the public-witnessing schema introduced earlier, especially `tp_agendamentos`, `tp_agendamento_participantes`, the `origem` model, and `profiles.tp_aprovado`.

It is not part of the minimum Territory Helper installation. In a modular baseline it belongs to a `public_witnessing` capability. Its policies should not be copied independently; they must be evaluated together with all other policies on the same tables because PostgreSQL combines permissive policies with `OR`.

Required tests:

- unapproved publisher cannot create a reservation;
- approved publisher can create only `origem = 'reserva'` with `criado_por = auth.uid()`;
- reservation owner cannot use the update policy to mutate protected scheduling fields unexpectedly;
- invited participant IDs are valid and approved if that is a business requirement.

### 070 — TCE-to-block aggregate view

`tces_com_quadras` moves an expensive client/Worker aggregation into PostgreSQL. The design is appropriate for large datasets and Cloudflare Worker CPU constraints.

Because the view uses `security_invoker = on`, access depends on RLS over `tces`, `tce_unidades`, `unidades`, and `locais`. The baseline must retain this property and must test that a publisher cannot infer TCEs or blocks outside their authorized scope through the aggregate.

### 071 and 073 — block counts

`071` created the useful aggregate view, but returned PostgreSQL `bigint`/`numeric` values that PostgREST serialized as strings. `073` drops and recreates the view with `::int` casts.

Baseline rule:

> `071` is fully absorbed by `073`; only the corrected final definition is canonical.

The integer cast is safe under the domain assumption that a single work area cannot exceed the 32-bit count range. This assumption should be documented in a schema test.

### 072 — authorization through arrangement parts

This migration closes a missing possession path for TCEs distributed through `arranjo_partes.tces_ids`.

The logic intentionally allows a participant with any part in an active arrangement to access TCEs attached either to their own part or to the arrangement as a whole. That is a business rule, not merely a technical fix, and must be preserved explicitly in domain documentation.

The baseline should preferably avoid duplicating complex `exists` expressions across tables. A canonical helper such as `pode_acessar_tce(tce_id)` would reduce policy drift between `tces`, `tce_unidades`, public sharing, and application queries.

### 074 and 076 — automatic backups

These two migrations record an architectural transition:

1. `074` created a private bucket assuming server/service-role orchestration.
2. `076` added admin browser access because the Worker-based snapshot generation exceeded free-tier CPU limits.

The bucket remains useful, but the original orchestration described in `074` is obsolete. For new installations, backup support should be a configurable infrastructure capability rather than an unconditional part of the territorial domain.

Security requirements:

- bucket remains private;
- only admins can use authenticated policies;
- object names must not permit cross-instance confusion;
- restore operations remain server-side and separately authorized;
- retention and storage quota are configurable.

### 075 — incorrect-position reporting

This is the most security-sensitive migration in this block.

`reportar_posicao_incorreta` is a `SECURITY DEFINER` RPC that can alter structural columns after checking `pode_editar_local`. It temporarily sets a transaction-local GUC so `guard_locais_update` allows the change.

The pattern is deliberate and narrow, but baseline consolidation must test:

- caller cannot target a local they do not possess;
- supplied GeoJSON is a valid point in SRID 4326;
- destination block exists and is itself an allowed destination;
- arbitrary structural changes cannot be smuggled through the GUC;
- the GUC cannot remain effective outside the transaction;
- `service_role` and admin behavior remain predictable;
- the function cannot copy IBGE face metadata from an unrelated or unsuitable local;
- correction creates a review/audit record rather than silently becoming authoritative source data.

For the Installer architecture, this function supports the principle of preserving official CNEFE values separately from human overrides. A future schema should model the correction as an override with provenance instead of overwriting the only copy of source-derived fields.

### 077 — audit index

This is a straightforward final-state performance index and belongs in the baseline audit module. It prevents global recent-audit queries from scanning the full table.

The baseline should also verify whether the audit table needs retention or partitioning for installations that import and update tens of thousands of addresses.

## Dependencies into 078–090

This block connects directly to later migrations:

- `072` completes TCE access paths used by the TCE public-sharing enhancements in `082`.
- `073` provides the canonical block-count view consumed by map density features.
- `075` redefines `guard_locais_update`; any later definition of that function must absorb its transaction-scoped exception or intentionally replace it.
- `076` establishes the current authenticated-admin backup model.
- `077` is a final-state audit performance requirement.
- `078`, `080`, and `082` continue redefining `territorio_publico`; none of the earlier function bodies should survive independently in the baseline.

## Baseline decisions from this block

1. Public-witnessing features remain an optional module.
2. TCE aggregate views and access paths belong to the TCE module.
3. Only the `073` definition of `quadras_contagens` is retained.
4. Backup Storage is optional infrastructure, with the `076` access model superseding the original assumptions in `074`.
5. `reportar_posicao_incorreta` requires a dedicated RLS/security contract before inclusion.
6. `audit_log_ts_idx` belongs to the canonical audit schema.

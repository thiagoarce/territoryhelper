# Migration Matrix — 030–035

## Scope

This document audits migrations `030` through `035` from `supabase/migrations` on `main` and classifies how each one should influence a future consolidated baseline.

These files contain a major domain pivot: the project separates personal territory assignments from scheduled arrangements, introduces arrangement parts, and creates public territory links. They also contain destructive pre-production cleanup that must never be replayed by the Installer.

## Classification legend

- **Canonical** — active concept that belongs in the final schema.
- **Absorbed** — historical implementation superseded by a later version; preserve the final intent, not the original SQL.
- **Partially absorbed** — some objects remain canonical while other statements became obsolete.
- **Historical cleanup** — destructive data operation for the original pre-production database; never part of a fresh-install baseline.
- **Security corrective required** — concept remains valid, but the final implementation must incorporate later hardening.

## Migration matrix

| Migration | Domain | Main objects / changes | Classification | Baseline treatment |
|---|---|---|---|---|
| `030_partes_e_limpeza.sql` | Designações, arranjos and public links | Deletes test assignments; narrows `designacoes.tipo`; adds `arranjos.tce_id`; creates `arranjo_partes`; drops `delegacoes_temp`; creates `territorio_tokens`; defines `pode_editar_local()` and `territorio_publico()` | **Major pivot, partially absorbed, plus historical cleanup** | Preserve the final domain split and final tables. Exclude every destructive statement. Do not use the function/RPC versions from this file: possession is redefined in `031`, `038` and `040`, while public territory output is redefined in `078`, `080` and `082` and token security is hardened in `083`. |
| `031_partes_data_null.sql` | Possession / arrangements | Redefines `pode_editar_local()` so an arrangement part can remain valid when `arranjos.data` is null | **Absorbed corrective** | Include the intended null-date semantics only if the final recurring-arrangement model still requires it. Do not include this intermediate function version. |
| `032_limpar_designacoes_teste.sql` | Test-data cleanup | Deletes all `arranjo_partes` and `designacoes`; clears territory fields from every arrangement | **Historical cleanup** | Never include in baseline, Installer, reset or upgrade workflows. Keep only as historical evidence of pre-production cleanup. |
| `033_limpar_arranjos_teste.sql` | Test-data cleanup | Deletes every arrangement event while preserving arrangement modalities | **Historical cleanup** | Never include in baseline or automated installation. |
| `034_reserva_campanha.sql` | Campaigns | Adds `quadras.reservada_campanha_id`, partial index and exposes the field through `quadras_geo` | **Canonical additive, view change absorbed** | Create the column, foreign key and index directly in the final `quadras` definition. Create `quadras_geo` only once with its final complete column set. |
| `035_arranjo_interessados.sql` | Arrangements / participation | Adds `arranjos.interessados uuid[]`; creates `toggle_interesse_arranjo(bigint)` with row locking | **Canonical intent, data-model review required** | Preserve the interest-registration feature. Prefer a normalized junction table for referential integrity, uniqueness, indexing and auditability; otherwise retain the array with explicit cleanup and validation rules. Harden the RPC before baseline use. |

## Domain pivot established by migration 030

Migration `030` formalizes four separate concepts:

```text
DESIGNAÇÃO
Personal assignment for one or more publishers

ARRANJO
Scheduled field-service event with a conductor and mixed territory

PARTE
Subset of an arrangement assigned to one or more publishers

TOKEN
Public read-only link for an arrangement or assignment
```

This distinction is still useful for the multicongregation architecture. A fresh installation should create the final representation directly, without reproducing the previous `delegacoes_temp` or the old assignment type `arranjo`.

## Object evolution chains

### Arrangement territory and parts

```text
025: arrangement model
030: arrangement parts + mixed territory + initial TCE field
035: interested publishers
066: multiple TCEs per arrangement/part
072: TCE access through arrangement parts
```

The baseline should model the final cardinalities from the beginning. In particular, it should not create a scalar `tce_id`, backfill an array later and leave both as ambiguous sources of truth without an explicit compatibility decision.

### Possession helper

```text
030: pode_editar_local v4
031: tolerates null arrangement date
038: includes multi-publisher assignments
040: closes arrangement authorization holes
057: broad update policies rely on guards and possession
075: controlled structural-position correction path
090: adds conductor completion capability at quadra level
```

The baseline must contain one reviewed final authorization contract, not successive function replacements.

### Public territory links

```text
030: territorio_tokens + initial territorio_publico()
078: adds card context
080: adds neighboring blocks
082: adds TCE commercial context
083: closes token-enumeration paths
```

Only the final RPC and final token-access rules belong in the baseline.

## Destructive operations that must be excluded

The following statements are historical and unsafe outside the original pre-production context:

- `delete from designacoes` in `030`;
- `drop table if exists delegacoes_temp` as an installation-time assumption;
- all statements in `032`;
- all statements in `033`.

A new Installer must distinguish explicitly between:

1. creating an empty schema;
2. importing initial territory data;
3. upgrading an existing instance;
4. intentionally resetting a disposable development environment.

No normal installation or upgrade command may silently delete operational data.

## Security and integrity findings

### 1. Initial token RLS permits table enumeration

Migration `030` creates a `SELECT` policy on `territorio_tokens` with `using (true)` for `anon` and `authenticated`. Possession of the UUID should be the capability; clients should not be able to list token rows through PostgREST.

Migration `083` later addresses token enumeration. The baseline must expose public data only through validated RPCs and deny direct anonymous token-table reads.

### 2. Initial `territorio_publico()` is historical

The RPC in `030` embeds an explicit JSON response, but later migrations expand and replace that response. Reusing the initial function would omit current context and could undo later privacy decisions.

The baseline must use the final response allowlist and contract tests for expired, invalid and valid tokens.

### 3. Constraint errors are swallowed

The `designacoes_tipo_check` replacement in `030` is wrapped in `exception when others then null`. That can silently leave the database in an unexpected state.

A consolidated baseline should fail loudly and transactionally when a required constraint cannot be created.

### 4. `arranjo_partes` uses arrays for relational identities

`quadras_ids`, `locais_ids` and `publicadores` are arrays. This simplifies mixed territory, but PostgreSQL foreign keys cannot validate each array element. Deleted profiles, blocks or locations can therefore leave stale identifiers.

Before baseline design, decide whether to:

- keep arrays and add validation/cleanup triggers plus GIN indexes; or
- normalize them into junction tables while preserving the application contract.

The same decision applies to later `tces_ids` arrays.

### 5. Arrangement-part write policy is role-broad

The initial `arranjo_partes_write` policy permits every user whose profile role is `dirigente` to write every arrangement part, without verifying that the user conducts or owns the specific arrangement.

The final contract must decide whether dirigentes are global managers or only manage their own arrangements. RLS tests should include an unrelated dirigente.

### 6. Interest RPC lacks arrangement-state validation

`toggle_interesse_arranjo()` correctly uses `FOR UPDATE`, preventing lost updates to the array. However, it does not verify that the arrangement is active, visible, upcoming or open for interest. Any authenticated user who knows an arrangement ID can toggle their UID.

The final RPC should validate the business state, active profile and visibility rules. It should also revoke default `PUBLIC` execution explicitly before granting the intended role.

### 7. `interessados uuid[]` has no referential integrity

A profile deletion cannot cascade into an array element. The array is also less convenient for per-user indexes, timestamps and audit history.

A normalized model is preferable for a general-purpose Installer:

```text
arranjo_interessados
- arranjo_id FK
- publicador_id FK
- criado_em
- primary key (arranjo_id, publicador_id)
```

This is a proposed baseline improvement, not a change to apply to the stable production schema before compatibility analysis.

## Baseline decisions from this block

1. Preserve the assignment/arrangement/part distinction established in `030`.
2. Exclude all test cleanup and destructive transformations.
3. Create the final arrangement and public-link schema directly.
4. Use only the final `pode_editar_local()` and `territorio_publico()` contracts.
5. Deny direct anonymous reads of token tables.
6. Review global dirigente authority versus per-arrangement authority.
7. Prefer normalized interest membership for new installations, subject to application compatibility.
8. Fold campaign-reservation columns into the initial `quadras` schema and create the final GeoJSON view once.

## Dependencies to later blocks

- `038` adds assignment participants to possession.
- `040` repairs arrangement possession security.
- `057` makes possession and guard functions central to update authorization.
- `066` expands arrangement TCE cardinality.
- `072` adds TCE access through parts.
- `078`, `080` and `082` successively replace the public territory RPC.
- `083` hardens public token access.
- `089` must be treated as the final RLS sanitation layer when determining baseline policies.

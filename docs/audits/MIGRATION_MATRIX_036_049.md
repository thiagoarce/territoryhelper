# Migration Matrix — 036–049

## Scope

This document audits migrations `036` through `049` from `supabase/migrations` on `main` and classifies how each one should influence a future consolidated baseline.

The historical files must remain untouched for the existing installation. The classifications below describe how their **final intent** should be represented for new installations.

## Classification legend

- **Canonical** — active concept that belongs in the final schema.
- **Absorbed** — historical implementation superseded by a later version; preserve the final intent, not the original SQL.
- **Partially absorbed** — some objects remain canonical while other parts became obsolete.
- **Optional module** — valid feature, but not part of the minimum territory-management core.
- **Seed** — initial content, separate from structural schema.
- **Security corrective** — closes an authorization or integrity defect and must be born fixed in the baseline.

## Migration matrix

| Migration | Domain | Main objects / changes | Classification | Baseline treatment |
|---|---|---|---|---|
| `036_testemunho_publico.sql` | Testemunho público | Creates `tp_pontos`, `tp_turnos`, `tp_escala`, indexes, RLS and `tp_pontos_geo` | **Partially absorbed / optional module** | Keep `tp_pontos`. Do not recreate `tp_turnos` or `tp_escala`, because `043` explicitly drops and replaces them. Create only the final `tp_pontos_geo` shape from `049`. |
| `037_publicacoes.sql` | Publicações / campanhas | Creates `publicacoes`, `campanha_suprimentos`; adds `campanhas.publicacao_id`; initial RLS | **Canonical base, later extended** | Create tables directly with final columns from `051` and `063`, final indexes and final authorization semantics after `060`. Do not replay intermediate policies. |
| `038_designacao_multi_publicador.sql` | Posse / autorização | Redefines `pode_editar_local()` to include `designacao_publicadores` | **Absorbed** | Do not include this function version. Its correction is incorporated into the later definition in `040`. |
| `039_carta_publica_leitura_anon.sql` | Links públicos de cartas | Creates `carta_publica_dados(uuid)` as `SECURITY DEFINER` RPC for anonymous reads | **Canonical intent, later security review required** | Keep a public RPC with an explicit response allowlist. Reconcile its token/error behavior with the later token-enumeration hardening in `083`; do not copy this version in isolation. |
| `040_fix_posse_seguranca.sql` | Posse / segurança | Redefines `pode_editar_local()`; fixes unrelated-arrangement access; hardens `tp_escala_insert` | **Security corrective, partially absorbed** | Use the final possession logic as the starting point. The `tp_escala` policy portion is obsolete because `043` drops `tp_escala`. Add contract tests for every access path. |
| `041_tp_equipamentos.sql` | Testemunho público | Creates equipment types, part catalog and carts; adds pending-point fields and suggestion policy | **Canonical / optional module** | Create these objects only when the TP module is enabled. Include final columns from `047` and later inventory changes such as `064`. |
| `042_tp_disponibilidade.sql` | Testemunho público | Creates weekly preferences and availability templates | **Canonical but semantics changed** | Preserve `tp_preferencias` and weekly `tp_disponibilidade` as templates. `058` makes monthly/day-specific availability the operational source of truth. |
| `043_tp_agendamentos.sql` | Testemunho público | Drops old turn/scale model; creates appointments, recurrence exceptions and participants | **Canonical pivot / optional module** | This is the base of the final scheduling model. Create it directly with later additions from `058`, `069` and related policies. Never create and then drop the `036` scheduling tables in a new install. |
| `044_servo_publicacoes.sql` | Publicações / authorization | Adds `profiles.servo_publicacoes`, `is_servo_pub()`, sensitive-profile guard, `pedidos_publicacao`, and capability-based policies | **Partially obsolete** | Keep the publication-request data model if the module remains supported. Do not expose a separate servo capability by default: `060` retires it and makes the area admin-only. The legacy column may be omitted from a clean baseline after code compatibility is confirmed. |
| `045_tp_relatorios.sql` | Testemunho público | Creates end-of-appointment reports and item condition/replenishment rows | **Canonical / optional module** | Include final tables and indexes when TP is enabled. Replace policies that rely only on application validation with database-enforced membership checks. |
| `046_notificacoes.sql` | Notifications | Creates `notificacoes`, `push_subscriptions`, indexes and initial RLS | **Canonical base** | Create with final RLS, including the owner-delete policy added in `088` and any reminder-related extensions from `086`. Restrict which notification columns an owner may modify. |
| `047_tp_pecas_codigo.sql` | Testemunho público | Adds official ordering codes to equipment types and parts | **Canonical additive / optional module** | Fold the columns directly into the table definitions from `041`. |
| `048_tp_equipamentos_seed.sql` | Testemunho público | Inserts equipment and part catalog from S-80-T | **Non-idempotent optional seed** | Never include in the structural baseline. Convert to a versioned, idempotent seed with stable natural keys or explicit identifiers before Installer use. |
| `049_tp_pontos_geo_pendente.sql` | Testemunho público | Recreates `tp_pontos_geo` with `pendente` and `criado_por` | **Absorbed corrective** | Create the final view once. Do not create the narrower `036` version first. |

## Object evolution chains

### Public testimony scheduling

```text
036: tp_turnos + tp_escala
  ↓ explicitly dropped
043: tp_agendamentos + excecoes + participantes
  ↓ extended
058: monthly phases, monthly availability, participant response, origin
  ↓ extended
069: publicador-created reservations
```

The baseline must begin at the final `tp_agendamentos` model. The original weekly-turn tables are historical only.

### Public testimony points

```text
036: tp_pontos + initial tp_pontos_geo
041: adds pendente + criado_por and suggestion policy
049: exposes the new fields in tp_pontos_geo
```

The final baseline should create the table with all fields and create the view only once.

### Publication authorization

```text
037: admin writes catalog and campaign supplies
044: servo_publicacoes capability + is_servo_pub()
060: capability retired; is_servo_pub() becomes admin-only compatibility alias
```

A clean baseline should express the current admin-only rule directly. Keeping a misleading capability function only for historical compatibility would make new installations harder to understand.

### Local possession helper

```text
038: multi-publicador support
040: closes arrangement authorization holes
```

`pode_editar_local()` is a security boundary. Its baseline version must be tested against leader, participant, arrangement part, arrangement leader, unrelated user, dirigente and admin scenarios.

## Security and integrity findings

### 1. `profiles_guard_sensitive()` requires verification

Migration `044` defines the trigger function as `SECURITY DEFINER` and checks `current_user` for `postgres` or `service_role`. In PostgreSQL, `current_user` inside a security-definer function is normally the function owner. If the owner is `postgres`, the early return may bypass the guard for every caller.

This must be verified with an executable RLS/trigger test. The baseline should identify privileged execution through trusted claims or explicit authorization logic rather than relying on `current_user` inside a security-definer function.

### 2. Appointment conflicts are application-only

Migration `043` deliberately validates overlapping cart appointments in the application because recurrence expansion is complex. Two concurrent requests can therefore both pass a read-before-write check unless the operation is serialized.

The implementation audit should verify whether appointment creation uses a transaction, advisory lock or another concurrency control. The Installer baseline must not imply that the database itself prevents all schedule collisions.

### 3. TP report membership is not enforced by RLS

Migration `045` states that the application action validates whether the author participated in the appointment. Its insert policy only verifies that `publicador_id = auth.uid()`; a direct PostgREST caller can potentially create a report for an unrelated `agendamento_id` under their own identity.

The final policy should include an `exists` check against `tp_agendamento_participantes`, or all writes should go through a validated RPC with direct table writes revoked.

### 4. Publication request status can be manipulated by its owner

In `044`, the owner may update a request while its old status is `aberto`, but the `WITH CHECK` clause only verifies ownership. A direct API request may change status or servo-managed fields beyond the intended user workflow.

The baseline should use column-level privileges, a guard trigger or separate RPCs for user edits and administrative state transitions.

### 5. Notification owner updates are too broad

The `046` owner-update policy allows an owner to update any column in their own notification row, not only `lida_em`. That does not expose another user’s data, but it weakens audit integrity because title, body, URL and timestamps can be altered through the API.

Prefer an RPC such as `marcar_notificacao_lida(id)` or column-level update grants restricted to read-state fields.

### 6. Participant deletion conflicts with the later accept/refuse workflow

Migration `043` permits a user to delete their own participant row, including a row created as a designation. Migration `058` later adds `aceito`/`recusado` status. The product contract must decide whether a designation may still be deleted or must remain as a historical refused assignment.

The baseline should implement one consistent rule rather than inheriting both behaviors accidentally.

### 7. The equipment seed is not Installer-safe

Migration `048` explicitly says it is not idempotent. Re-running it duplicates equipment types and parts. Before an Installer can enable the TP module, this content must be converted into a versioned seed using stable codes and conflict handling.

## Baseline decisions from this block

1. Keep the territory core independent from TP and publications modules.
2. Treat TP as an optional module with its own schema and seed phases.
3. Start TP scheduling from the `043` appointment model, not the `036` turn model.
4. Create final views once instead of replaying `036 → 049` corrections.
5. Represent current publication authorization directly as admin-only after `060`.
6. Move non-idempotent content from migrations into explicit Installer seeds.
7. Add database tests for possession, public-token RPCs, profile privilege protection, appointment membership and notification mutation.

## Dependencies to later blocks

- `057` changes the local/unit update security model and later `075` changes the final guard function.
- `058` supersedes monthly TP confirmation concepts and extends the `043` appointment model.
- `060` retires the publication-servo capability introduced in `044`.
- `064` adds per-cart inventory.
- `068` adds TP approval.
- `069` adds reservation writes.
- `083` hardens public token enumeration and must be checked against `039`.
- `086` extends notifications with reminders.
- `088` adds notification-owner deletion.
- `089` performs final RLS/security sanitation.

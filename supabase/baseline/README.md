# Baseline para novas instalações

Esta é a única sequência SQL destinada a um Supabase vazio:

1. `000_extensions.sql`
2. `010_schema_metadata.sql`
3. `020_identity.sql`
4. `030_geographic_core.sql`
5. `040_operational_core.sql`
6. `045_platform_support.sql`
7. `050_views_and_indexes.sql`
8. `060_functions_and_triggers.sql`
9. `065_spatial_and_public_functions.sql`
10. `070_rls.sql`
11. `080_storage.sql`

Os arquivos são ordenados e aplicados por `npm run installer -- baseline`. Eles não contêm territórios, endereços, usuários ou backfills da congregação original.

`supabase/migrations/001–090` permanece como registro da evolução da instância original e não faz parte deste fluxo.

## Módulos

O piloto cria o núcleo necessário para território, locais, unidades, designações, arranjos, TCE, curadoria e recursos transversais carregados pelo shell (links públicos, notificações, push, telemetria e lembretes). Campanhas, testemunho público e publicações nascem desabilitados em `installation_config.modules`; a navegação e o carregamento da carteira respeitam essa configuração. Novos módulos entram em `modules/` somente quando puderem ser habilitados sem deixar rotas quebradas.

## Seeds

Seeds ficam fora da baseline, são opcionais, versionados e idempotentes. Nunca inclua dados reais de uma congregação.

# Documentação do Territory Helper

Esta pasta reúne a visão do produto, o conhecimento do domínio, a arquitetura, o pipeline de instalação, as decisões técnicas e a engenharia reversa do banco atual.

## Ordem recomendada de leitura

1. [`vision/VISION.md`](vision/VISION.md)
2. [`vision/PRINCIPLES.md`](vision/PRINCIPLES.md)
3. [`domain/CNEFE.md`](domain/CNEFE.md)
4. [`domain/WORK_AREAS.md`](domain/WORK_AREAS.md)
5. [`domain/DATA_QUALITY.md`](domain/DATA_QUALITY.md)
6. [`pipeline/CNEFE_TRANSFORMATION.md`](pipeline/CNEFE_TRANSFORMATION.md)
7. [`pipeline/GEOPROCESSING.md`](pipeline/GEOPROCESSING.md)
8. [`pipeline/INSTALLER.md`](pipeline/INSTALLER.md)
9. [`architecture/DATA_MODEL.md`](architecture/DATA_MODEL.md)
10. [`audits/CONSOLIDATED_SCHEMA_STATE.md`](audits/CONSOLIDATED_SCHEMA_STATE.md)
11. [`audits/MIGRATION_091_SECURITY_ADDENDUM.md`](audits/MIGRATION_091_SECURITY_ADDENDUM.md)
12. [`audits/RLS_TEST_PLAN.md`](audits/RLS_TEST_PLAN.md)
13. [`development/LOCAL_DATABASE_TESTING.md`](development/LOCAL_DATABASE_TESTING.md)
14. [`agents/AGENT_GUIDE.md`](agents/AGENT_GUIDE.md)

## Estrutura

- `vision/`: missão, objetivos de longo prazo, princípios e roadmap.
- `domain/`: regras do domínio territorial, sem dependência de tecnologia.
- `pipeline/`: transformação, geoprocessamento, revisão e publicação.
- `architecture/`: módulos e modelo de dados.
- `adr/`: decisões arquiteturais registradas e justificadas.
- `audits/`: engenharia reversa das migrations, estado consolidado do schema e contratos de segurança.
- `development/`: execução local, testes e práticas de desenvolvimento.
- `agents/`: instruções para agentes de desenvolvimento.
- `installer/`: documentos históricos e especificações iniciais do branch.

## Auditoria do banco

A engenharia reversa principal cobre a sequência histórica `001–090` de `supabase/migrations`, com registro da ausência do número `021`.

O documento canônico desse levantamento é:

- [`audits/CONSOLIDATED_SCHEMA_STATE.md`](audits/CONSOLIDATED_SCHEMA_STATE.md)

A migration corretiva `091`, criada como consequência direta dos testes de segurança, está documentada separadamente em:

- [`audits/MIGRATION_091_SECURITY_ADDENDUM.md`](audits/MIGRATION_091_SECURITY_ADDENDUM.md)

As matrizes por intervalo permanecem disponíveis em `audits/` como evidência detalhada da classificação migration por migration.

## Testes do banco

A configuração do Supabase local, os comandos de reconstrução e os contratos pgTAP estão descritos em:

- [`development/LOCAL_DATABASE_TESTING.md`](development/LOCAL_DATABASE_TESTING.md)

Os testes estáticos das migrations ficam em `tests/`. Os testes comportamentais do PostgreSQL ficam em `supabase/tests/database/`.

## Documentos canônicos

Os documentos fora de `installer/` passam a ser a referência principal para novas decisões e implementações. Os arquivos em `installer/` permanecem como histórico e material de apoio até serem totalmente consolidados.

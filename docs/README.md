# Documentação do Territory Helper

Esta documentação orienta a evolução do Territory Helper como projeto open source, self-hosted e reutilizável por outras congregações.

## Estado atual

O aplicativo operacional foi construído gradualmente para a instância original. O branch `feat/territory-installer` documenta e prepara um caminho de instalação genérico sem alterar a `main`.

Há dois caminhos de banco distintos:

| Caminho | Finalidade | Estado |
|---|---|---|
| `supabase/migrations/001–090` | histórico legado e manutenção da instância original | auditado; não usar para novas congregações |
| `supabase/baseline/` | instalação curta e limpa de uma nova congregação | implementado para piloto; validação remota pendente |

A lacuna histórica `021` é conhecida. Os números `091` e `092` não fazem parte do contrato deste branch: seus achados foram incorporados como requisitos e testes da baseline separada, sem continuar a sequência legada.

O fluxo guiado já prepara e publica um pacote revisado, mas continua experimental até passar por um Supabase vazio descartável e por uma instalação acompanhada de outra congregação.

## Entrada pública

- [`../QUICKSTART.md`](../QUICKSTART.md): instalação do piloto;
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md): contribuições e validação;
- [`../SECURITY.md`](../SECURITY.md): relato responsável e responsabilidades;
- [`UPGRADING.md`](UPGRADING.md): atualização sem misturar legado e baseline;
- [`../supabase/baseline/README.md`](../supabase/baseline/README.md): sequência curta do banco.

## Ordem recomendada de leitura

1. [`vision/VISION.md`](vision/VISION.md)
2. [`vision/PRINCIPLES.md`](vision/PRINCIPLES.md)
3. [`adr/0001-self-hosted-single-tenant.md`](adr/0001-self-hosted-single-tenant.md)
4. [`adr/0005-separate-installation-baseline.md`](adr/0005-separate-installation-baseline.md)
5. [`architecture/AUTHORIZATION_AND_USABILITY.md`](architecture/AUTHORIZATION_AND_USABILITY.md)
6. [`installer/INSTALLER_SPEC.md`](installer/INSTALLER_SPEC.md)
7. [`domain/CNEFE.md`](domain/CNEFE.md)
8. [`domain/WORK_AREAS.md`](domain/WORK_AREAS.md)
9. [`pipeline/CNEFE_TRANSFORMATION.md`](pipeline/CNEFE_TRANSFORMATION.md)
10. [`pipeline/GEOPROCESSING.md`](pipeline/GEOPROCESSING.md)
11. [`architecture/DATA_MODEL.md`](architecture/DATA_MODEL.md)
12. [`audits/BASELINE_AUDIT.md`](audits/BASELINE_AUDIT.md)
13. [`audits/CONSOLIDATED_SCHEMA_STATE.md`](audits/CONSOLIDATED_SCHEMA_STATE.md)
14. [`audits/RLS_TEST_PLAN.md`](audits/RLS_TEST_PLAN.md)
15. [`agents/AGENT_GUIDE.md`](agents/AGENT_GUIDE.md)

## Estrutura

- `vision/`: missão e princípios duradouros do produto;
- `domain/`: regras territoriais independentes de tecnologia;
- `architecture/`: módulos, modelo de dados e contratos transversais;
- `pipeline/`: transformação, geoprocessamento e orquestração do Installer;
- `installer/`: especificações históricas detalhadas; os documentos canônicos são os apontados neste índice;
- `adr/`: decisões arquiteturais aceitas e suas consequências;
- `audits/`: engenharia reversa do legado `001–090` e requisitos da baseline;
- `development/`: execução local e testes;
- `agents/`: instruções para agentes de desenvolvimento.

## Princípios de reutilização

- uma instância independente por congregação;
- configuração no lugar de forks divergentes sempre que possível;
- schema separado de KML, CNEFE, seeds e dados locais;
- alterações operacionais de campo com efeito imediato e curadoria posterior;
- autorização contextual para designações pessoais;
- dirigente/admin com escopo global de coordenação;
- mensagens de domínio no lugar de erros técnicos crus;
- revisão humana antes de importações e transformações em massa.

## Auditoria e baseline

A engenharia reversa completa está em [`audits/CONSOLIDATED_SCHEMA_STATE.md`](audits/CONSOLIDATED_SCHEMA_STATE.md). As matrizes por intervalo permanecem em `audits/` como evidência migration por migration.

A estratégia de separação foi registrada no [`ADR 0005`](adr/0005-separate-installation-baseline.md). O contrato de autorização e experiência do usuário foi registrado no [`ADR 0006`](adr/0006-usability-first-authorization.md).

## Testes do banco

O ambiente local e os contratos existentes estão descritos em [`development/LOCAL_DATABASE_TESTING.md`](development/LOCAL_DATABASE_TESTING.md).

Os testes do legado continuam caracterizando `001–090`. A baseline possui contratos próprios e pode ser deliberadamente diferente quando corrige segurança, usabilidade ou ideias substituídas. A validação SQL real deve ocorrer num Supabase vazio antes de declarar uma versão pronta.

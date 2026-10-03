# ADR 0001 — Modelo self-hosted single-tenant

- Status: aceito
- Data: 2026-08-01

## Contexto

O projeto precisa atender outras congregações sem centralizar todos os dados em uma única aplicação compartilhada.

## Decisão

Cada congregação terá sua própria instância do Territory Helper, com Supabase, autenticação, armazenamento e deploy independentes.

## Consequências

- isolamento total entre congregações;
- menor complexidade de RLS e multitenancy;
- menor responsabilidade operacional central;
- necessidade de um instalador e processo de atualização confiáveis;
- personalizações devem preferir configuração em vez de forks divergentes.

## Alternativas rejeitadas

- SaaS multi-tenant com banco compartilhado;
- branch permanente por congregação;
- repositório separado para cada instalação.

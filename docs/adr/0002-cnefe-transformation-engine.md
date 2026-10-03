# ADR 0002 — CNEFE Transformation Engine

- Status: aceito
- Data: 2026-08-01

## Contexto

Os CSVs do CNEFE possuem colunas extensas, códigos que dependem de dicionários oficiais e informações que precisam ser normalizadas antes de uso operacional.

A primeira instalação funcional do Territory Helper utilizou Power Query para selecionar colunas, traduzir códigos e tornar a tabela legível.

## Decisão

Nenhum CSV do CNEFE será importado diretamente para as tabelas operacionais.

Todo arquivo suportado passará por um módulo versionado chamado CNEFE Transformation Engine.

Esse módulo deve:

- reconhecer a versão do esquema;
- aplicar dicionários oficiais;
- preservar os códigos e valores originais relevantes;
- gerar valores legíveis e normalizados;
- produzir relatório de qualidade;
- gerar saída independente de Supabase e da interface.

## Consequências

- o conhecimento antes escondido no Power Query vira regra testável;
- mudanças futuras do CNEFE ficam isoladas;
- a saída pode ser comparada com fixtures conhecidas;
- aumenta o trabalho inicial de formalização;
- importações passam a ser reproduzíveis e auditáveis.

## Referência funcional

A planilha resultante do Power Query original é a referência de comportamento para a primeira versão do transformador.

# ADR 0003 — Revisão humana antes da publicação

- Status: aceito
- Data: 2026-08-01

## Contexto

Geração de quadras, classificação de locais, identificação de condomínios e reconciliação de endereços podem produzir resultados ambíguos.

## Decisão

Nenhuma alteração territorial em massa será publicada diretamente pelo pipeline.

Todo processamento deve produzir uma proposta revisável, com relatório, confiança e pendências explícitas.

## Consequências

- reduz risco de corrupção de dados;
- aumenta segurança operacional;
- exige interface de revisão;
- permite usar agentes e ferramentas probabilísticas sem dar a eles autoridade final.

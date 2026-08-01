# ADR 0004 — Área de trabalho como abstração territorial

- Status: aceito
- Data: 2026-08-01

## Contexto

A aplicação atual foi concebida principalmente em torno de quadras urbanas. Congregações de idioma e territórios rurais exigem unidades operacionais diferentes.

## Decisão

O domínio futuro usará a abstração `area_trabalho` para representar unidades como:

- quadra urbana;
- condomínio;
- área rural;
- rota;
- localidade;
- ponto isolado;
- área especial.

A interface pode continuar exibindo “quadra” quando esse for o tipo relevante.

## Consequências

- o modelo passa a atender urbano e rural sem duplicação conceitual;
- ciclos de trabalho podem ser aplicados a diferentes geometrias;
- a evolução a partir da tabela atual de quadras deve ser incremental;
- não será feita uma grande migração antes de a necessidade técnica estar comprovada.

# Pipeline de Geoprocessamento

## Objetivo

Transformar o KML oficial, os registros CNEFE já normalizados e dados auxiliares em propostas de áreas de trabalho e vínculos espaciais.

## Entradas

- KML oficial do território;
- registros CNEFE normalizados;
- malha viária e outros elementos do OpenStreetMap;
- dados complementares opcionais;
- configurações do modo de operação.

## Estágios

1. Validar e normalizar o KML.
2. Unir ou preservar partes conforme a estrutura oficial.
3. Filtrar espacialmente os endereços dentro do território.
4. Obter e recortar a malha viária.
5. Gerar candidatos a quadras urbanas quando possível.
6. Identificar áreas rurais, rotas, localidades e pontos isolados.
7. Associar endereços às áreas propostas.
8. Detectar anomalias e pendências.
9. Gerar artefatos intermediários para revisão.

## Regras

- resultados automáticos são propostas;
- geometrias inválidas devem ser corrigidas ou sinalizadas;
- nenhuma área deve ultrapassar o limite territorial sem justificativa explícita;
- sobreposições relevantes devem gerar pendência;
- endereços sem área devem permanecer visíveis;
- a biblioteca usada é substituível desde que respeite os contratos de entrada e saída.

## Saída

```text
territorio.geojson
areas-propostas.geojson
enderecos.parquet
associacoes.json
pendencias.json
relatorio.html
```

## Revisão

A interface deve permitir:

- unir;
- dividir;
- redesenhar;
- excluir;
- renomear;
- reclassificar;
- mover endereços;
- confirmar ou rejeitar propostas.

## Desempenho

O app operacional não deve carregar a cidade inteira de uma vez. Consultas e renderização devem ocorrer por viewport, nível de zoom ou recorte operacional.

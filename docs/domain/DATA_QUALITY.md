# Qualidade de Dados

## Objetivo

A camada de qualidade de dados cria valores consistentes para comparação, busca, agrupamento e reconciliação sem destruir os valores originais recebidos.

## Regra fundamental

Todo campo relevante pode possuir:

- valor original para exibição e auditoria;
- valor normalizado para comparação;
- metadados sobre a transformação aplicada.

## Normalizações iniciais

### Logradouro

- remover espaços extras;
- normalizar caixa para comparação;
- remover acentos apenas na versão de busca;
- padronizar abreviações conhecidas;
- conservar o nome original para exibição.

### Número

- preservar valores como `SN`, `123A`, `Lote 4` e intervalos;
- remover espaços e pontuação sem significado na versão normalizada;
- não forçar conversão numérica.

### Complemento

- normalizar bloco, torre, apartamento e unidade;
- preservar detalhes originais;
- evitar unir unidades diferentes por normalização excessiva.

### Coordenadas

- validar faixas de latitude e longitude;
- usar SRID 4326;
- sinalizar coordenadas duplicadas ou suspeitas;
- nunca inverter latitude e longitude silenciosamente.

## Deduplicação e reconciliação

A igualdade exata não é suficiente para todos os casos. O sistema pode usar:

1. identificador de origem;
2. logradouro, número e complemento normalizados;
3. código municipal e setor censitário;
4. proximidade espacial;
5. comparação aproximada;
6. confirmação humana.

Toda correspondência aproximada deve registrar confiança e motivos.

## Correções humanas

Correções feitas no aplicativo devem ser armazenadas separadamente do valor importado sempre que isso for necessário para reprocessamento.

Exemplo:

```text
nome_importado: Residencial Jardim Azul
nome_confirmado: Condomínio Jardim Azul
```

## Relatório

Cada execução deve informar:

- registros válidos e inválidos;
- campos ausentes;
- valores não reconhecidos;
- possíveis duplicidades;
- agrupamentos sugeridos;
- correspondências aproximadas;
- transformações aplicadas.

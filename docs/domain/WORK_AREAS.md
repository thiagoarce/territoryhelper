# Áreas de Trabalho

## Conceito

O Territory Helper não deve depender exclusivamente do conceito de quadra urbana.

A entidade operacional mais geral é a área de trabalho: um recorte geográfico ou lógico usado para organizar, designar, acompanhar e concluir o trabalho de campo.

## Tipos iniciais

- quadra urbana;
- condomínio;
- prédio;
- área rural;
- rota;
- localidade ou povoado;
- trecho de estrada;
- área especial;
- ponto isolado.

## Regras

1. Toda área pode possuir geometria, mas nem toda geometria precisa ser um polígono.
2. Uma área pode ser representada por polígono, linha, ponto ou agrupamento lógico.
3. Endereços podem ser vinculados a uma área de trabalho.
4. Uma área pode possuir ciclos de trabalho independentes.
5. A interface pode usar nomes específicos como “Quadra”, mas o modelo interno deve permanecer genérico.
6. Áreas geradas automaticamente são propostas até confirmação humana.

## Ciclos de trabalho

Uma mesma área pode participar de diferentes ciclos:

- trabalho territorial regular;
- censo de idioma;
- campanha;
- revisão;
- cartas;
- levantamento rural.

Concluir um ciclo não deve sobrescrever o histórico de outro.

## Território rural

No rural, a divisão pode considerar:

- proximidade entre endereços;
- acesso por vias;
- localidades conhecidas;
- distância estimada;
- limites naturais;
- conhecimento local.

O sistema deve permitir criação, união, divisão e correção manual das propostas.

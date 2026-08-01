# Domínio CNEFE

## Papel no Territory Helper

O CNEFE é a principal fonte inicial de endereços. Ele fornece uma fotografia oficial do território em determinado momento, mas não é a fonte permanente da verdade operacional.

Depois da instalação, a base viva passa a ser mantida pelos usuários por meio de correções, novos endereços, alterações de unidades, nomes de prédios e informações de campo.

## Entradas esperadas

- CSV oficial do município ou dos municípios abrangidos;
- dicionário de códigos da mesma edição;
- metadados da edição, quando disponíveis;
- KML oficial usado para delimitar o território.

## Regras de domínio

1. Cada registro importado deve permanecer rastreável até sua origem.
2. Códigos e descrições devem ser preservados quando relevantes.
3. O valor original e o valor normalizado não são a mesma coisa.
4. Campos sem utilidade operacional não devem ocupar a tabela principal.
5. A edição do CNEFE deve ser tratada como versionada.
6. Identificadores e códigos com zeros à esquerda devem ser tratados como texto.
7. Coordenadas inválidas ou ausentes devem gerar pendência explícita.

## Saída operacional

Os registros brutos podem ser consolidados em uma estrutura de local e unidades.

```text
local
  -> unidade 1
  -> unidade 2
  -> unidade 3
```

Um prédio com vários apartamentos não deve virar vários locais duplicados. Cada unidade mantém o vínculo com o registro CNEFE correspondente.

## Classificação

A classificação operacional pode usar vários sinais:

- tipo da unidade;
- notas e códigos do IBGE;
- quantidade de unidades no mesmo logradouro e número;
- dados complementares de prédios;
- revisão humana.

Categorias iniciais:

- casa;
- prédio;
- comércio;
- coletivo;
- terreno;
- construção;
- outro.

Toda classificação automática deve poder informar seus motivos e nível de confiança.

## Limites

O CNEFE pode estar desatualizado, incompleto ou representar endereços de forma diferente da realidade operacional. Por isso:

- novos endereços podem ser adicionados no app;
- registros podem ser corrigidos;
- nomes de condomínios e prédios podem vir de fontes externas ou conhecimento local;
- reimportações não podem apagar correções humanas silenciosamente.

## Referência funcional

A planilha tratada por Power Query usada na primeira implantação é a referência funcional inicial para:

- colunas mantidas;
- colunas removidas;
- nomes finais;
- traduções de códigos;
- tipos de dados;
- ordem e legibilidade da tabela resultante.

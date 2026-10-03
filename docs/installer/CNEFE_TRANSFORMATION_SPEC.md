# Especificação de Transformação do CNEFE

## Objetivo

O instalador não deve importar o CSV bruto do CNEFE diretamente para a tabela operacional. Ele deve executar uma etapa explícita de seleção, tradução e normalização dos dados, equivalente ao tratamento anteriormente feito no Power Query.

O objetivo é transformar uma base estatística extensa e codificada em uma estrutura legível, enxuta e apropriada ao trabalho territorial, sem perder a rastreabilidade até o registro de origem.

## Princípios

1. Preservar o identificador original do CNEFE em cada endereço importado.
2. Manter os códigos de origem quando forem relevantes para auditoria ou reprocessamento.
3. Exibir descrições legíveis na aplicação, usando o dicionário de códigos oficial do IBGE.
4. Não carregar colunas que não tenham utilidade operacional, analítica ou de rastreabilidade.
5. Não substituir o arquivo bruto silenciosamente: registrar versão, município, nome do arquivo, hash e data da importação.
6. Tratar o esquema de entrada como versionado, porque futuras edições do CNEFE podem alterar nomes, códigos ou colunas.

## Etapas da transformação

### 1. Inspeção do arquivo

O importador deve identificar:

- encoding;
- delimitador;
- presença de BOM;
- cabeçalhos;
- município e código municipal;
- quantidade total de linhas;
- versão ou edição do CNEFE, quando disponível;
- colunas reconhecidas, desconhecidas e obrigatórias ausentes.

A importação deve ser interrompida quando coordenadas, identificador de origem ou campos mínimos de endereço não puderem ser reconhecidos.

### 2. Seleção de colunas

As colunas do CNEFE devem ser classificadas em quatro grupos:

#### Operacionais

Campos utilizados diretamente pelo Territory Helper, por exemplo:

- identificador de origem;
- logradouro;
- número;
- modificador ou complemento;
- localidade, bairro ou distrito quando disponível;
- CEP;
- município e UF;
- latitude e longitude;
- setor censitário;
- espécie ou tipo da unidade/endereço;
- campos usados para distinguir casa, prédio, comércio, coletivo, terreno e construção.

#### Rastreabilidade

Campos necessários para reencontrar o registro no arquivo original ou explicar uma transformação.

#### Auxiliares de transformação

Códigos usados apenas durante o processamento, por exemplo para traduzir classificações por meio do dicionário do IBGE. Eles podem ser preservados em metadados de origem sem aparecer nas telas comuns.

#### Descartáveis

Campos sem uso no produto, que não devem ocupar a tabela operacional. A lista exata deve ser definida após comparar o Power Query original, o dicionário da edição utilizada e o script atual.

## 3. Aplicação do dicionário de códigos

O importador deve possuir uma camada versionada de dicionários, independente da interface e do banco.

Estrutura sugerida:

```text
packages/cnefe/
  dictionaries/
    2022/
      schema.json
      codebooks.json
```

Cada tradução deve preservar:

```text
codigo_original
valor_legivel
versao_dicionario
```

Exemplo conceitual:

```text
codigo: 2
valor exibido: Apartamento
```

O sistema não deve espalhar traduções codificadas em condicionais por vários arquivos. A regra deve estar concentrada no módulo de transformação do CNEFE.

## 4. Normalização

A transformação deve:

- aparar espaços;
- normalizar campos vazios e valores sentinela;
- conservar acentuação para exibição;
- gerar versões normalizadas separadas para busca e reconciliação;
- validar latitude e longitude;
- converter coordenadas para `Point` SRID 4326;
- normalizar logradouro sem destruir o valor original;
- preservar números não convencionais, como `SN`, lotes e intervalos;
- evitar converter identificadores e códigos com zeros à esquerda em números;
- traduzir códigos apenas quando o dicionário da versão for conhecido.

Campos sugeridos para reconciliação:

```text
logradouro_original
logradouro_normalizado
numero_original
numero_normalizado
complemento_original
complemento_normalizado
```

## 5. Classificação operacional

A classificação de casa, prédio, comércio, coletivo, terreno ou outro tipo não deve depender de um único campo.

O código atual já usa múltiplos sinais, incluindo:

- tipo da unidade;
- nota/classificação do IBGE;
- quantidade de unidades no mesmo logradouro e número;
- marcação manual de prédio.

Essa abordagem deve ser preservada e formalizada como uma regra versionada, com explicação do motivo da classificação e possibilidade de correção humana.

Exemplo de saída:

```json
{
  "tipo_sugerido": "predio",
  "confianca": "alta",
  "motivos": [
    "mais de uma unidade no mesmo endereço",
    "tipo CNEFE traduzido como apartamento"
  ]
}
```

## 6. Modelo de saída

O pipeline deve produzir ao menos dois níveis de saída.

### Registro normalizado

Mantém correspondência individual com o registro do CNEFE e serve para auditoria e associação espacial.

### Modelo operacional

Agrupa registros quando necessário em:

```text
local
  -> unidades
```

Por exemplo, diversos apartamentos no mesmo logradouro e número não devem virar dezenas de prédios duplicados. Devem formar um local com várias unidades, preservando o vínculo entre cada unidade e seu registro de origem.

## 7. Pré-visualização

Antes da publicação, a interface deve mostrar:

- total de registros lidos;
- total dentro e fora do KML;
- linhas inválidas;
- colunas descartadas;
- códigos sem tradução;
- tipos sugeridos;
- quantidade de locais e unidades gerados;
- amostra da tabela final legível;
- comparação entre valor bruto e valor transformado.

O usuário deve conseguir exportar um relatório das transformações e pendências.

## 8. Idempotência e reprocessamento

Uma nova execução com o mesmo arquivo e a mesma versão do transformador deve produzir o mesmo resultado.

A chave de origem deve permitir:

- atualizar um endereço importado anteriormente;
- detectar registros removidos ou alterados numa nova edição;
- preservar correções manuais;
- distinguir dados importados de dados criados pelos usuários.

Correções humanas nunca devem ser sobrescritas silenciosamente por uma reimportação.

## 9. Critérios de aceite

- O importador reconhece os CSVs oficiais suportados.
- As descrições exibidas usam o dicionário correto do IBGE.
- Códigos com zeros à esquerda permanecem íntegros.
- A tabela operacional contém apenas os campos necessários.
- O registro original continua rastreável.
- O processo informa colunas e códigos desconhecidos.
- Prédios com várias unidades não são duplicados como locais independentes.
- O usuário revisa classificações ambíguas antes da publicação.
- O resultado pode ser reprocessado sem duplicação ou perda de correções manuais.

## Auditoria concluída para o piloto CNEFE 2022

O Power Query, o dicionário XLS, a planilha operacional, os dois CSVs municipais e o KML foram comparados localmente em 2026-08-01. As regras reproduzíveis foram incorporadas ao transformador e a uma fixture anônima de 34 colunas.

O filtro retangular do Power Query antigo não foi mantido: ele processava somente parte de Cabedelo e não representava o território conurbado. O KML é a autoridade espacial. Colunas de operação adicionadas posteriormente na planilha também não fazem parte da transformação CNEFE.

Resultado da rodada de referência: 465.105 linhas lidas, 19.236 dentro do KML, nenhuma rejeitada, nenhum código desconhecido, 2.988 locais e 19.236 unidades. A geografia histórica contém 27 territórios e 242 quadras; 2.964 locais foram associados a exatamente uma quadra, 24 ficaram sem quadra e nenhum ficou ambíguo por sobreposição.

As 22 linhas de diferença para a tabela operacional histórica foram confirmadas pelo responsável como cadastros legítimos posteriores no sistema antigo e não são mais uma pendência. A aprovação continua dependente de revisar as classificações sugeridas, os 24 locais sem quadra, os 111 grupos com espécies CNEFE mistas e os 15 grupos com mais de 100 unidades.

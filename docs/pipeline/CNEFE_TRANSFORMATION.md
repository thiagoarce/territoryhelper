# Pipeline de Transformação do CNEFE

## Objetivo

Reproduzir de forma automática, testável e versionada o tratamento que antes era feito no Power Query.

## Estágios

1. Inspecionar o arquivo.
2. Identificar versão, município, delimitador, encoding e colunas.
3. Selecionar apenas campos relevantes.
4. Aplicar o dicionário oficial da edição.
5. Preservar códigos e descrições.
6. Normalizar valores para busca e reconciliação.
7. Validar coordenadas e campos mínimos.
8. Classificar registros operacionais.
9. Gerar locais e unidades.
10. Produzir relatório e artefato intermediário.

## Artefatos

```text
manifest.json
territorio.geojson
territorios.json
enderecos.json
enderecos-fora.json
locais.json
areas-trabalho.json
pendencias.json
```

## Contrato de saída

O restante do sistema não deve depender da estrutura bruta do CSV. Ele recebe objetos estáveis e versionados.

Exemplo conceitual:

```json
{
  "source_id": "...",
  "municipio_codigo": "...",
  "logradouro_original": "...",
  "logradouro_normalizado": "...",
  "numero_original": "...",
  "numero_normalizado": "...",
  "complemento_original": "...",
  "complemento_normalizado": "...",
  "latitude": -7.0,
  "longitude": -34.0,
  "tipo_codigo": "...",
  "tipo_descricao": "...",
  "transformer_version": "1.1.0"
}
```

## Dicionários

Os dicionários devem ser versionados por edição do CNEFE e carregados como dados, não espalhados em condicionais pela aplicação.

O piloto inclui o dicionário oficial CNEFE 2022 para nível de geocodificação, espécie, tipo da edificação, indicadores de estabelecimento/construção e finalidade. A implementação aceita tanto `COD_TIPO_ESPECIE`, documentado no XLS, quanto `COD_TIPO_ESPECI`, encontrado nos CSVs distribuídos.

## Regras validadas para 2022

- decodificar o CSV oficial em Windows-1252 (com detecção automática quando não configurado);
- formar o logradouro com `NOM_TIPO_SEGLOGR`, `NOM_TITULO_SEGLOGR` e `NOM_SEGLOGR`;
- preservar `DSC_LOCALIDADE` como localidade, nunca como substituto do logradouro;
- manter `NUM_ENDERECO` e `DSC_MODIFICADOR` separados;
- concatenar, na ordem, os cinco pares `NOM_COMP_ELEMn`/`VAL_COMP_ELEMn`;
- preservar zeros à esquerda em códigos, quadra, face, CEP e número;
- usar um hash estável da linha como identidade da unidade, pois `COD_UNICO_ENDERECO` pode se repetir em registros distintos do mesmo endereço;
- agrupar pelo município, localidade, setor censitário, logradouro, número e modificador; endereços sem número também preservam a identidade oficial da origem;
- priorizar sinais de domicílio coletivo e apartamento sobre comércio incidental, e só classificar construção como terreno quando não houver domicílio no grupo;
- aplicar o KML como único filtro espacial do pacote.

## Descoberta e aquisição automáticas

O instalador pode cruzar o KML com as malhas oficiais de UFs e municípios, listar os códigos municipais interceptados e resolver seus ZIPs no diretório oficial do CNEFE 2022. Downloads exigem confirmação explícita. Cada ZIP é extraído de forma incremental, somente o CSV municipal esperado é aceito, `COD_MUNICIPIO` é validado e os hashes SHA-256 são calculados. Arquivos válidos já presentes no cache são reutilizados.

O piloto Monte Castelo confirmou que um KML rural/de idioma pode exigir mais de um município: Campo Grande (`5002704`) e Jaraguari (`5004908`). Com os dois CSVs, 469.100 linhas foram lidas, 164.183 ficaram dentro do KML, nenhuma foi rejeitada e 113.760 locais foram gerados. O caso também validou o processamento sem `spread` de lotes que excedem o limite da pilha do JavaScript.

Para limitar memória e tamanho do pacote, todas as linhas fora do KML são contadas, mas `enderecos-fora.json` guarda apenas uma amostra. O limite padrão é 100 e pode ser ajustado por `cnefe.outsideSampleLimit`.

## Testes

A primeira tabela tratada por Power Query deve originar fixtures de referência:

```text
fixtures/cnefe-2022/input.csv
fixtures/cnefe-2022/expected.json
```

O transformador só pode ser considerado compatível quando reproduzir a saída esperada nos campos definidos.

## Idempotência

A mesma entrada, versão de dicionário e versão do transformador devem produzir a mesma saída.

## Auditoria do piloto Aeroclube

Auditoria local realizada em 2026-08-01, sem copiar os arquivos reais para o repositório:

- os dois arquivos Power Query fornecidos são duplicatas exatas;
- o query histórico lia somente Cabedelo e aplicava um retângulo manual, não o KML;
- a planilha operacional histórica tem 19.214 linhas e colunas manuais posteriores, portanto não é uma saída canônica reproduzível;
- os CSVs brutos somam 465.105 linhas;
- o KML seleciona 19.236 linhas: 164 de Cabedelo e 19.072 de João Pessoa;
- o transformador aceitou todas as linhas, sem códigos desconhecidos;
- o agrupamento corrigido gerou 2.988 locais e 19.236 unidades;
- a geografia histórica forneceu 27 territórios e 242 quadras;
- 2.964 locais foram associados a uma única quadra, 24 ficaram sem quadra e nenhum ficou ambíguo por sobreposição;
- as 22 linhas de diferença para a planilha histórica foram confirmadas pelo responsável como cadastros legítimos posteriores no sistema antigo.

A fixture anônima em `tests/fixtures/installer/cnefe-2022.csv` reproduz as 34 colunas oficiais e cobre segmentos de logradouro, complementos, zeros à esquerda, dicionário e código desconhecido.

Pendências restantes: revisar os 24 locais sem quadra, os 111 grupos que combinam espécies CNEFE e os 15 grupos com mais de 100 unidades, além de validar as classificações sugeridas antes de aprovar/publicar o pacote.

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
  "transformer_version": "1.0.0"
}
```

## Dicionários

Os dicionários devem ser versionados por edição do CNEFE e carregados como dados, não espalhados em condicionais pela aplicação.

## Testes

A primeira tabela tratada por Power Query deve originar fixtures de referência:

```text
fixtures/cnefe-2022/input.csv
fixtures/cnefe-2022/expected.json
```

O transformador só pode ser considerado compatível quando reproduzir a saída esperada nos campos definidos.

## Idempotência

A mesma entrada, versão de dicionário e versão do transformador devem produzir a mesma saída.

## Pendências atuais

- extrair da planilha histórica a lista exata de colunas finais;
- identificar renomeações e tipos;
- documentar os joins do dicionário;
- capturar amostras representativas de casa, prédio, comércio, coletivo e terreno;
- substituir as aliases provisórias pelas regras exatas do Power Query validado.

Já existe uma fixture sintética em `tests/fixtures/installer/`. Ela valida o contrato técnico, mas não substitui a equivalência com a planilha real anonimizada.

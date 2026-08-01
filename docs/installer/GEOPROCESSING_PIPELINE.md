# Pipeline de Geoprocessamento

## Objetivo

Converter KML oficial, CSVs CNEFE/IBGE e dados geográficos auxiliares em uma proposta revisável de território, áreas de trabalho e endereços associados.

O pipeline deve ser independente da biblioteca escolhida. As implementações podem usar Python, JavaScript, PostGIS ou uma combinação, desde que respeitem os contratos de entrada, saída e validação.

## Entradas

### KML

Esperado:

- um ou mais polígonos do território;
- coordenadas WGS84 ou conversíveis;
- nomes e metadados opcionais.

Tratamentos:

- converter para geometria interna padronizada;
- corrigir orientação de anéis;
- reparar geometrias quando possível;
- unir partes quando representarem o mesmo território;
- preservar componentes separados quando forem operacionalmente relevantes.

### CSV CNEFE/IBGE

Esperado:

- arquivos dos municípios abrangidos;
- coordenadas por registro;
- campos de endereço e identificadores de origem.

Tratamentos:

- detectar delimitador e codificação;
- mapear colunas por versão conhecida;
- normalizar latitude e longitude;
- descartar ou colocar em quarentena registros sem coordenadas válidas;
- manter somente colunas necessárias ao produto;
- preservar o identificador original.

### Dados auxiliares

Possíveis fontes:

- OpenStreetMap/Overpass;
- arquivos GeoJSON locais;
- limites administrativos;
- dados fornecidos manualmente.

O uso de APIs deve respeitar limites, políticas de uso e cache. Processamentos grandes não devem depender de chamadas repetidas a endpoints públicos durante cada reexecução.

## Fases

### 1. Ingestão e fingerprint

- calcular hash dos arquivos;
- registrar tamanho, versão e data;
- impedir importação acidental do mesmo arquivo duas vezes;
- criar diretório de trabalho isolado.

### 2. Normalização territorial

- converter KML para GeoJSON/GeoPackage interno;
- validar geometria;
- calcular bounding box e área;
- identificar municípios prováveis;
- produzir pré-visualização do limite.

### 3. Ingestão do CNEFE

- ler arquivos de forma streaming ou colunar;
- evitar carregar arquivos municipais grandes integralmente em memória quando desnecessário;
- normalizar texto e coordenadas;
- deduplicar por identificador de origem ou chave estável;
- gerar relatório de qualidade.

### 4. Filtro espacial

- aplicar `point-in-polygon` para manter endereços dentro do território;
- definir explicitamente o tratamento de pontos na borda;
- registrar endereços próximos da fronteira para possível revisão;
- manter contagem por município e setor censitário.

### 5. Aquisição da malha

- consultar ou carregar vias e outras feições relevantes;
- recortar os dados por bounding box com margem;
- persistir cache local;
- normalizar e projetar para um CRS métrico apropriado antes de operações de distância e buffer.

### 6. Preparação topológica

- recortar vias pelo território;
- conectar segmentos com tolerância controlada;
- remover ou classificar vias que não devem formar limites de quadras;
- tratar vias duplicadas, canteiros centrais e segmentos desconectados;
- manter rastreabilidade das correções automáticas.

### 7. Geração de áreas urbanas

- polygonizar a malha preparada;
- recortar polígonos pelo limite territorial;
- remover artefatos por regras configuráveis de área e forma;
- simplificar geometrias sem destruir topologia;
- classificar nível de confiança.

Sinais de baixa confiança:

- polígono muito pequeno ou muito grande;
- razão perímetro/área anormal;
- sobreposição relevante;
- ausência de endereços;
- número excessivo de endereços;
- interseção estranha com vias;
- múltiplas partes desconectadas.

### 8. Áreas rurais

Em áreas onde quadras urbanas não fazem sentido:

- agrupar endereços por proximidade, localidade e acesso viário;
- identificar pontos isolados;
- propor corredores ou rotas;
- permitir áreas manuais;
- evitar inventar polígonos urbanos artificiais.

O resultado rural deve ser apresentado como proposta de unidade operacional, não como verdade cartográfica oficial.

### 9. Associação endereço–área

- associar cada endereço a no máximo uma área principal;
- sinalizar pontos em sobreposição;
- sinalizar pontos sem área;
- permitir associação manual;
- guardar método e confiança da associação.

### 10. Detecção de prédios e condomínios

Gerar candidatos a partir de:

- mesmo logradouro e número com muitos complementos;
- coordenadas iguais ou muito próximas;
- termos como bloco, torre, apartamento e unidade;
- geometrias e nomes auxiliares;
- agrupamentos espaciais com entrada comum provável.

O nome sugerido deve conter fonte, distância e confiança. Nomes não confirmados não podem ser tratados como definitivos.

### 11. Validação final

Bloquear publicação quando houver:

- geometrias inválidas não reparadas;
- sobreposições acima do limite configurado;
- áreas fora do território;
- duplicidade de identificadores de origem;
- inconsistência referencial;
- falha na geração do pacote intermediário.

Pendências não bloqueantes devem ser explicitamente listadas.

## Saídas e contratos

### `territorio.geojson`

FeatureCollection com uma ou mais feições territoriais validadas.

### `areas_trabalho.geojson`

Cada feature deve conter ao menos:

- `temp_id`;
- `tipo`;
- `status_revisao`;
- `confidence`;
- `source`;
- `address_count`;
- geometria.

### `enderecos.parquet`

Campos mínimos previstos:

- identificador temporário;
- identificador de origem;
- logradouro;
- número;
- complemento;
- bairro/localidade quando disponível;
- município;
- coordenadas;
- fonte;
- flags de qualidade.

### `associacoes.parquet`

- `endereco_temp_id`;
- `area_temp_id`;
- método;
- confiança;
- revisão manual.

### `pendencias.json`

Lista estruturada com código, severidade, entidade, mensagem e ação sugerida.

## Métricas mínimas

- registros lidos;
- registros válidos;
- registros dentro do território;
- registros próximos da borda;
- áreas propostas por tipo;
- áreas válidas;
- áreas suspeitas;
- endereços associados;
- endereços sem área;
- candidatos a condomínio;
- tempo por etapa;
- pico de memória quando mensurável.

## Estratégia de tecnologia

A primeira investigação deve comparar pelo menos:

- Python com GeoPandas, Shapely/GEOS, pyogrio e OSMnx;
- JavaScript/TypeScript com Turf e bibliotecas auxiliares;
- PostGIS para validação e associação espacial.

A decisão deve ser baseada em qualidade da polygonização, desempenho, facilidade de empacotamento e manutenção — não em preferência prévia por biblioteca.

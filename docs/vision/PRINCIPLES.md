# Princípios do Territory Helper

Estes princípios orientam decisões de produto, arquitetura, dados e implementação.

## 1. Uma instância por congregação

O modelo inicial é single-tenant e self-hosted. Cada congregação controla sua própria infraestrutura, seus usuários e seus dados.

## 2. Os dados pertencem à congregação

O projeto não deve criar dependência desnecessária de um serviço central operado pelo mantenedor do código.

## 3. O dado original é preservado

Transformações não substituem silenciosamente os valores recebidos. Valores brutos, valores normalizados, versão da fonte e identificadores de origem devem permanecer rastreáveis.

## 4. O CNEFE não entra diretamente no banco operacional

Todo arquivo CNEFE deve passar por uma camada explícita de inspeção, tradução, normalização, validação e classificação.

## 5. A revisão humana precede alterações em massa

Geração de quadras, classificação de prédios, reconciliação de endereços e outras decisões ambíguas produzem propostas. O usuário confirma antes da publicação.

## 6. Importações são idempotentes

Executar novamente o mesmo pipeline com os mesmos arquivos e a mesma versão deve produzir o mesmo resultado, sem duplicações.

## 7. Correções humanas têm precedência

Reimportações não podem apagar silenciosamente nomes de condomínios, novos endereços, classificações ou ajustes feitos pelos usuários.

## 8. O núcleo não depende de uma biblioteca específica

Turf, Shapely, GeoPandas, OSMnx, PostGIS e outras ferramentas são detalhes substituíveis. Os contratos de entrada e saída são mais importantes que a implementação.

## 9. O domínio é mais amplo que quadras urbanas

A unidade operacional é uma área de trabalho. Ela pode representar quadra, condomínio, área rural, rota, localidade ou outro recorte útil.

## 10. Endereço e informação de idioma são entidades diferentes

Um imóvel não é permanentemente “de idioma”. Registros de idioma possuem histórico, estado e vínculo próprio com local ou unidade.

## 11. Processamento pesado não deve prejudicar o app operacional

Geoprocessamento e transformação em massa devem ocorrer no instalador local, em pipeline dedicado ou em serviço especializado.

## 12. Todo estágio importante produz diagnóstico

Cada etapa deve gerar métricas, pendências e artefatos que permitam explicar o que aconteceu e retomar o processo.

## 13. Schema e dados de instalação são separados

Migrations definem estrutura e comportamento do banco. KML, CNEFE, usuários, territórios e dados locais entram por importação ou seed explícito.

## 14. A aplicação atual permanece estável durante a evolução

Novos módulos devem ser desenvolvidos no branch dedicado, com integração incremental e compatibilidade com a instância existente.

## 15. Documentação é parte da implementação

Mudanças relevantes de domínio, arquitetura ou pipeline devem atualizar a documentação e, quando necessário, registrar uma decisão arquitetural.

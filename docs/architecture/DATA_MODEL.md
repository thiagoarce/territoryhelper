# Modelo de Dados Canônico

## Objetivo

Definir conceitos estáveis do domínio sem antecipar detalhes finais de migrations.

## Fonte e rastreabilidade

### importacoes

Representa uma execução de importação.

Campos conceituais:

- `id`
- `tipo`
- `versao_pipeline`
- `arquivo_origem`
- `hash_arquivo`
- `municipio_codigo`
- `iniciada_em`
- `concluida_em`
- `status`
- `relatorio`

### registros_origem

Representa cada linha normalizada do CNEFE ou de outra fonte oficial.

Deve preservar:

- identificador original;
- versão da fonte;
- códigos originais relevantes;
- valores originais;
- valores normalizados;
- geometria pontual;
- vínculo com a importação.

## Modelo operacional

### territorios

Limite geral recebido do KML e confirmado pelo usuário.

### areas_trabalho

Unidade operacional genérica.

Tipos iniciais:

- `quadra_urbana`
- `condominio`
- `area_rural`
- `rota`
- `localidade`
- `ponto_isolado`
- `especial`

Campos conceituais:

- `id`
- `territorio_id`
- `tipo`
- `nome`
- `codigo_exibicao`
- `geom`
- `origem`
- `status_revisao`
- `ativa`

A tabela atual de quadras pode permanecer durante a evolução. A migração para uma abstração geral deve ser incremental e justificada por necessidade real.

### locais

Representa o ponto ou conjunto físico visitável, como casa, prédio, comércio, coletivo ou terreno.

Campos conceituais:

- `id`
- `area_trabalho_id`
- `logradouro_original`
- `logradouro_normalizado`
- `numero_original`
- `numero_normalizado`
- `tipo`
- `nome`
- `geom`
- `origem`
- `confirmado_por_usuario`

### unidades

Representa apartamento, casa interna, sala, lote ou outra subdivisão de um local.

Cada unidade pode manter vínculo com um ou mais registros de origem, conforme as regras de deduplicação e atualização.

### condominios

Conceito operacional para agrupamentos com identidade e acesso compartilhados.

Pode referenciar um local principal e conter metadados como:

- nome confirmado;
- nomes alternativos;
- portaria;
- blocos;
- observações de acesso;
- fonte do nome;
- nível de confiança.

## Congregações de idioma

### registros_idioma

O idioma não é propriedade permanente do imóvel.

Campos conceituais:

- `id`
- `unidade_id` ou `local_id`
- `idioma`
- `status`
- `origem`
- `identificado_em`
- `ultima_verificacao`
- `observacoes`

Possíveis status:

- `conhecido`
- `confirmar`
- `ativo`
- `mudou`
- `nao_localizado`
- `inativo`

## Ciclos e conclusão

### ciclos_trabalho

Representa um objetivo independente aplicado a uma área, como:

- trabalho territorial regular;
- censo de idioma;
- campanha;
- revisão periódica.

### conclusoes_area

Histórico append-only de conclusões por área e ciclo.

Não deve existir apenas uma data mutável quando o histórico for relevante.

## Correções humanas

Correções feitas na aplicação devem ter precedência sobre sugestões futuras do pipeline.

O modelo precisa distinguir:

- valor importado;
- valor sugerido;
- valor confirmado;
- autor e data da confirmação.

## Restrições conceituais

- Um registro de origem não pode ser duplicado silenciosamente na mesma versão da importação.
- Um endereço pode permanecer sem área até revisão.
- Uma unidade pode possuir histórico de idioma sem alterar a identidade geográfica do local.
- Uma reimportação não pode apagar registros manuais.
- Alterações de geometria em massa precisam ser auditáveis.

## Pendências de modelagem

Antes de criar migrations novas, auditar:

- `territorios`;
- `quadras`;
- `locais`;
- `unidades`;
- histórico de conclusões;
- tabelas de designação;
- scripts de importação.

O objetivo inicial é reaproveitar o modelo existente e adicionar apenas as lacunas comprovadas.

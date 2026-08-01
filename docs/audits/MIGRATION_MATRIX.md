# Matriz das migrations atuais

## Objetivo

Este documento classifica as migrations existentes em `supabase/migrations/` para orientar a criação de uma baseline consolidada para novas instalações do Territory Helper.

A matriz não substitui o histórico. As migrations atuais devem permanecer disponíveis para instâncias existentes até existir um processo de atualização validado. A baseline futura deve representar o estado final do schema, incorporando correções posteriores sem reproduzir todos os passos históricos.

## Classificações

- **Incorporar** — o comportamento final pertence à baseline.
- **Consolidar** — incorporar o estado final, não executar literalmente a migration histórica.
- **Opcional** — módulo válido, mas pode ser ativado separadamente.
- **Legado/transição** — necessário para a instalação atual ou migração antiga, mas não deve compor o caminho padrão do Installer.
- **Revisar** — existe valor funcional, porém há risco ou inconsistência a resolver antes da baseline.

## Matriz

| Nº | Arquivo | Papel atual | Dependências principais | Destino na baseline | Observações |
|---|---|---|---|---|---|
| 001 | `001_profiles_and_auth.sql` | Perfis, roles, trigger de novo usuário e helpers de autorização | Supabase Auth | **Consolidar** | Incorporar o modelo de perfis, mas usar as versões corrigidas de RLS e `search_path` resultantes de 009 e 010. |
| 002 | `002_geografia.sql` | Núcleo territorial: territórios, quadras, locais, unidades e PostGIS | 001, PostGIS | **Consolidar** | É o núcleo reaproveitável. A baseline deve refletir colunas posteriores como `ativa`, `nao_eh_predio`, `pendente` e o modelo final de status. |
| 003 | `003_pessoas.sql` | Convites e primeira versão de arranjos | 001 | **Consolidar** | Preservar convites. A definição inicial de `arranjos` foi superada por 025 e não deve ser repetida literalmente. |
| 004 | `004_designacoes.sql` | Designações, quadras designadas, TCEs e unidades de TCE | 001, 002 | **Incorporar** | Núcleo operacional válido. Deve incorporar tipos e vínculos posteriores de 017 e 029. |
| 005 | `005_eventos.sql` | Registros históricos de visitas e eventos por unidade | 001, 002 | **Incorporar** | Modelo append-only adequado. Validar políticas finais e índices para grandes volumes. |
| 006 | `006_conteudo.sql` | Itens de campanha | 001 | **Consolidar** | Manter o conteúdo, integrado ao modelo de períodos criado em 016. |
| 007 | `007_auditoria.sql` | Audit log e triggers automáticos | 001–006 | **Revisar** | Reutilizável, mas revisar funções `SECURITY DEFINER`, `search_path`, volume de logs e cobertura das tabelas novas. |
| 008 | `008_rls.sql` | Primeira política geral de RLS | 001–007 | **Consolidar** | Não executar como fonte final isolada. A baseline deve conter diretamente as políticas resultantes de 009, 010, 026–029 e demais módulos. |
| 009 | `009_fix_profiles_rls.sql` | Corrige recursão nas policies de perfis | 001, 008 | **Absorver** | A correção deve estar embutida na definição inicial da baseline; não precisa existir como passo separado. |
| 010 | `010_fix_search_path_e_service_role.sql` | Endurece `search_path` e comportamento de service role | 001, 008, 009 | **Absorver** | Todas as funções finais devem nascer com configuração segura. |
| 011 | `011_exec_sql.sql` | Execução de SQL arbitrário via RPC para migração/admin dev | 001 | **Legado/transição** | Não deve ser o mecanismo padrão do Installer. Excluir da baseline pública ou manter apenas em ferramenta local administrativa explicitamente habilitada. |
| 012 | `012_geojson_views.sql` | Views GeoJSON para mapa | 002 | **Consolidar** | Criar diretamente as views finais, incluindo colunas acrescentadas posteriormente, como `ativa`. |
| 013 | `013_auto_vincular.sql` | Vinculação espacial de locais a quadras com PostGIS | 002 | **Incorporar** | Regra valiosa para o Installer. Deve preservar associações manuais e registrar resultado/pendências. |
| 014 | `014_link_publico_cartas.sql` | Links públicos por token para trabalho de cartas | 004 | **Opcional/revisar** | Funcionalidade válida, mas exige revisão de expiração, revogação, escopo de dados expostos e políticas públicas. |
| 015 | `015_storage_fotos.sql` | Bucket e policies para fotos de locais | 001, 002, Storage | **Revisar** | Incorporar o bucket se fotos fizerem parte da instalação padrão. Restringir escrita e exclusão; evitar policy ampla para qualquer autenticado. |
| 016 | `016_campanhas.sql` | Períodos de campanha e vínculo com itens | 006 | **Consolidar** | Integrar diretamente a estrutura final de campanhas e conteúdo. |
| 017 | `017_arranjo_multi_publicador.sql` | Tipos de designação e junção com vários publicadores | 004 | **Consolidar/revisar** | Preservar `designacao_publicadores`. Revisar todas as consultas/RLS que ainda verificam apenas `designacoes.publicador_id`. |
| 018 | `018_nao_eh_predio.sql` | Override manual para falso positivo de prédio | 002 | **Incorporar** | Essencial para o Transformation Engine: inferência automatizada nunca deve vencer uma decisão humana explícita. |
| 019 | `019_quadras_conclusoes.sql` | Histórico append-only de conclusões de quadra | 001, 002 | **Incorporar** | Generalizar futuramente para conclusão de `work_areas`, mantendo compatibilidade com quadras. |
| 020 | `020_quadras_ativa.sql` | Substitui status operacional por `ativa`; atualiza view | 002, 012 | **Consolidar** | Na baseline, `ativa` deve nascer na tabela. Decidir se `status` será removido ou mantido temporariamente apenas para compatibilidade. |
| 021 | — | Não existe arquivo numerado 021 no repositório | — | **Lacuna histórica** | Não criar uma migration vazia apenas para preencher a sequência. Documentar que a numeração pulou de 020 para 022. |
| 022 | `022_criar_tce.sql` | Cria TCE a partir de locais usando `ST_ConvexHull` | 002, 004 | **Incorporar/revisar** | Útil, mas o convex hull é aproximação visual e pode incluir áreas indevidas. Registrar a natureza da geometria e permitir edição posterior. |
| 023 | `023_quadra_geometria.sql` | Criar/editar/juntar polígonos de quadra | 002, 004 | **Incorporar/revisar** | Reutilizar operações PostGIS. Validar transações, conflitos nas junções e atualização de todos os vínculos dependentes. |
| 024 | `024_dividir_quadra.sql` | Divide quadra com `ST_Split` e reassocia locais | 002, 004, 020 | **Incorporar/revisar** | Operação deve ser atômica e produzir relatório de reassociação. Pontos sobre fronteira exigem regra explícita. |
| 025 | `025_arranjos.sql` | Modelo final atual de modalidades e eventos/arranjos, com Storage | 001, 002, 003 | **Consolidar** | Substitui a forma inicial de `arranjos` de 003. Arrays de IDs são aceitáveis para protótipo, mas devem ser avaliados para integridade referencial e escala. |
| 026 | `026_rls_hardening.sql` | Restringe edição de locais/unidades ao escopo operacional | 002, 004, 025 | **Consolidar/revisar** | É base para a política final, porém não considera de modo consistente todos os membros de `designacao_publicadores`. |
| 027 | `027_delegacoes_temp.sql` | Delegação temporária de quadras e extensão de `pode_editar_local` | 001, 002, 026 | **Incorporar/revisar** | A tabela é válida. `quadras_ids` sem FK é decisão deliberada, mas deve haver validação na gravação. O default de fim do dia depende do timezone do banco, não necessariamente do usuário. |
| 028 | `028_locais_pendente.sql` | Permite criação de local pendente no campo e busca por proximidade | 002, 026 | **Incorporar/revisar** | Alinha-se ao princípio de preservar contribuições de campo. Definir workflow formal de revisão, proveniência e proteção contra abuso/spam. |
| 029 | `029_designacao_locais.sql` | Designações de cartas por local e extensão de escopo de edição | 004, 026, 027 | **Consolidar/revisar** | Incorporar a junção. Atualizar RLS e `pode_editar_local` para usar tanto `publicador_id` quanto `designacao_publicadores`. |

## Estado final recomendado para novas instalações

### Baseline obrigatória

A baseline inicial deve criar, já em sua forma final:

1. extensões necessárias, especialmente PostGIS;
2. perfis, roles, helpers e trigger de usuário com `search_path` seguro;
3. território, quadras/áreas, locais, unidades e índices espaciais;
4. designações, vínculos com quadras, locais e múltiplos publicadores;
5. registros históricos;
6. histórico de conclusões;
7. views GeoJSON finais;
8. funções espaciais de vincular, salvar, unir e dividir;
9. políticas RLS finais, sem aplicar primeiro versões permissivas;
10. metadados de versão da instalação e do schema.

### Módulos que podem ser opcionais

- campanhas;
- links públicos de cartas;
- armazenamento de fotos;
- modalidades e arranjos;
- delegações temporárias;
- TCEs.

Eles podem continuar no mesmo schema, mas o Installer deve conseguir declarar quais módulos foram ativados e qual versão foi aplicada.

## Riscos estruturais encontrados

### 1. Autoridade duplicada em designações

O schema mantém `designacoes.publicador_id` e também `designacao_publicadores`. Diversas policies e funções posteriores consultam somente `publicador_id`, o que pode excluir coparticipantes do escopo de leitura ou edição.

**Ação:** definir uma função canônica de pertencimento à designação e fazer todas as policies utilizarem essa função.

### 2. Função `pode_editar_local` redefinida em sequência

As migrations 026, 027 e 029 substituem integralmente a mesma função. Isso aumenta o risco de uma migration futura esquecer um dos casos anteriores.

**Ação:** decompor a autorização em helpers menores ou manter uma única definição canônica testada, criada na baseline final.

### 3. Arrays de identificadores

`arranjos.quadras_ids`, `arranjos.cartas_locais_ids` e `delegacoes_temp.quadras_ids` simplificam fluxos, mas não oferecem FKs, cascatas nem validação automática.

**Ação:** manter arrays apenas onde a vida curta e o custo de junção justificarem. Para relações persistentes, preferir tabelas de junção.

### 4. Timezone na delegação temporária

O default de `data_fim` usa o timezone da sessão/banco. Uma instância deve registrar seu timezone operacional e calcular explicitamente o fim do dia local.

### 5. Geometrias e fronteiras

`ST_Contains` não inclui ponto exatamente na fronteira. Operações de split podem deixar endereços sem reassociação quando o ponto estiver sobre a linha.

**Ação:** definir regra canônica (`ST_Covers`, tolerância ou fila de revisão) e gerar pendências em vez de decidir silenciosamente.

### 6. SQL arbitrário

`exec_sql` foi útil para evolução manual, mas amplia a superfície de risco e acopla instalação a comandos arbitrários.

**Ação:** o Installer deve usar migrations versionadas, APIs administrativas específicas ou conexão direta controlada; `exec_sql` não entra no fluxo padrão.

## Ordem de implementação da baseline

1. criar testes de schema e RLS que reproduzam o comportamento atual;
2. definir o modelo final de designação e pertencimento;
3. escrever uma baseline limpa em diretório separado, sem substituir ainda as migrations históricas;
4. aplicar a baseline em um projeto Supabase vazio;
5. executar testes de contrato do app atual contra essa base;
6. importar uma amostra do conjunto atual e comparar contagens, vínculos e permissões;
7. somente depois apontar o Installer para a baseline consolidada.

## Critério de conclusão

A baseline será considerada válida quando um projeto Supabase vazio puder ser preparado automaticamente e o aplicativo atual passar nos testes de autenticação, leitura, edição, RLS, mapas e operações espaciais sem executar a sequência histórica `001..029`.

# Migration Matrix — 078–090

## Escopo

Este documento registra o bloco final das migrations atualmente existentes em `supabase/migrations`. Ele complementa a matriz inicial `001–029` e será incorporado à matriz canônica quando os blocos intermediários forem concluídos.

## Matriz

| Migration | Responsabilidade | Objetos afetados | Classificação para baseline | Riscos e observações |
|---|---|---|---|---|
| `078_territorio_publico_contexto_cartao.sql` | Amplia o RPC público de território com contexto para o cartão S-12. | Redefine `territorio_publico(uuid)`; lê `territorio_tokens`, `arranjos`, `designacoes`, `quadras`, `territorios`, `locais`, `tces`. | **Absorver apenas o estado final do RPC.** | É substituída por `080` e depois `082`. Não deve ser reaplicada isoladamente na baseline. Expõe geometrias e datas de conclusão por token público de forma consciente. |
| `079_mapa_offline_bucket.sql` | Cria bucket público para arquivo PMTiles do mapa offline. | `storage.buckets`: `mapa-offline`. | **Incluir como infraestrutura opcional/configurável.** | Bucket público contém dados OSM, não dados congregacionais. Upload permanece administrativo/manual. |
| `080_territorio_publico_quadras_vizinhas.sql` | Acrescenta quadras geograficamente vizinhas ao contexto público. | Redefine `territorio_publico(uuid)`; usa `ST_DWithin`, `ST_Union`, geography. | **Absorver apenas no estado final de `082`.** | Substitui `078`. Raio fixo de 250 m deve virar configuração ou constante documentada. Consulta espacial precisa de teste de desempenho e comportamento com conjunto vazio. |
| `081_tem_algo_em_casa_a_casa.sql` | RPC leve para decidir se a navegação “Casa a casa” deve aparecer. | Cria/redefine `tem_algo_em_casa_a_casa(uuid)`; consulta arranjos, partes, designações, quadras e TCEs. | **Incluir como função de conveniência, não núcleo do schema.** | `security invoker`; depende das RLS das tabelas consultadas. O parâmetro não deve permitir inferência indevida de dados de outro usuário. Testar chamada com UUID alheio. |
| `082_territorio_publico_tce_comercios.sql` | Corrige e completa compartilhamento público de TCE, incluindo comércios individuais. | Redefine `territorio_publico(uuid)`; adiciona `designacao_tces`, `tce_unidades`, `unidades` e `tce_comercios` ao JSON. | **Esta é a versão canônica atual do RPC público.** | Deve ser a única definição de `territorio_publico` na baseline, salvo migrations posteriores. Função `SECURITY DEFINER` exige contrato de exposição e testes contra enumeração e vazamento. |
| `083_fecha_enumeracao_tokens.sql` | Fecha enumeração anônima direta de tokens públicos. | Policies de SELECT em `territorio_tokens` e `cartas_tokens`. | **Obrigatória no estado final de RLS.** | Correção de segurança crítica. Links públicos devem acessar dados exclusivamente por RPCs `SECURITY DEFINER`, não por SELECT anônimo nas tabelas de tokens. |
| `084_backfill_quadras_conclusoes.sql` | Preenche histórico ausente a partir de `quadras.data_conclusao`. | Dados em `quadras_conclusoes`; não altera schema. | **Não incluir na baseline limpa. Manter como data migration histórica.** | É backfill específico para instâncias existentes. Não deve executar em instalação nova sem necessidade. Registra apenas uma conclusão quando não existe histórico algum. |
| `085_erros_client.sql` | Introduz telemetria interna de erros do cliente. | Cria `erros_client`, índice e policies. | **Opcional; incluir se telemetria fizer parte do produto padrão.** | Policy inicial aceitava autoria nula; `089` endurece. A baseline deve usar diretamente a versão final com limites de tamanho. Dados podem conter URL, stack e user agent; definir retenção e privacidade. |
| `086_lembretes.sql` | Infraestrutura para execução diária idempotente e deduplicação de lembretes. | Cria `job_execucoes` e `lembretes_enviados`; RLS somente `service_role`. | **Incluir como módulo operacional opcional.** | Implementa “cron preguiçoso” acionado por requests administrativos. Precisa de teste de corrida, timezone e recuperação após falha entre aquisição da trava e execução do job. |
| `087_hora_informada_backfill.sql` | Distingue hora real de hora estimada e preenche estimativas históricas. | Adiciona `quadras_conclusoes.hora_informada`; atualiza `marcado_em`. | **Coluna entra na baseline; backfill não.** | O backfill contém horários e UTC−3 específicos da instância original. Esses valores não podem entrar numa baseline genérica. O Installer deve configurar timezone e, se necessário, regras locais. |
| `088_notificacoes_delete_propria.sql` | Permite ao usuário apagar as próprias notificações. | Policy DELETE em `notificacoes`. | **Absorver no estado final de RLS.** | Regra é por propriedade da linha; “apenas lidas” fica como UX, não segurança. Testar tentativa de apagar notificação de terceiro. |
| `089_rls_saneamento.sql` | Saneia tabelas públicas sem RLS e endurece `erros_client`. | Varredura de `pg_tables`; policy e constraint em `erros_client`. | **Absorver resultados finais; não copiar cegamente a varredura para toda instalação.** | O loop pode habilitar RLS deny-all em tabelas esquecidas, o que é seguro mas pode mascarar falta de policy. A baseline deve declarar RLS explicitamente por tabela. Constraint `NOT VALID` precisa ser validada em banco novo. |
| `090_dirigente_conclui_quadra.sql` | Corrige conclusão/desfazer de quadra por dirigente sem permitir alteração estrutural. | Cria `quadras_guard_nao_admin()`, trigger em `quadras`, policy UPDATE em `quadras`, policy DELETE em `quadras_conclusoes`. | **Obrigatória no estado final de autorização.** | Padrão policy ampla + trigger de guarda. A baseline deve testar alteração exclusiva de `data_conclusao`, proteção automática de colunas futuras, comportamento de `service_role` e divergência entre tabela atual e histórico. |

## Cadeias de substituição identificadas

### `territorio_publico(uuid)`

```text
078 — contexto S-12
  ↓
080 — acrescenta quadras vizinhas
  ↓
082 — acrescenta TCEs e comércios
```

A baseline não deve executar as três versões. Deve conter somente a definição final, preservando em testes todos os contratos acumulados.

### `erros_client`

```text
085 — cria tabela e policies iniciais
  ↓
089 — exige autoria e limita payload
```

A baseline deve criar a tabela já com a policy e constraints finais.

### conclusão de quadras

```text
019 — histórico append-only
084 — corrige dados históricos ausentes
087 — distingue hora real/estimada e executa backfill
090 — corrige autorização do dirigente e desfazer
```

Na baseline nova entram o schema e a autorização final. Os backfills `084` e a parte de dados de `087` permanecem migrations históricas para upgrades.

## Achados para o Installer

1. A baseline deve separar **schema**, **segurança**, **storage** e **data migrations**.
2. Timezone não pode continuar implícito em UTC−3; deve ser configuração da instância.
3. Buckets públicos e privados precisam ser declarados em um manifesto de instalação.
4. RPCs públicas `SECURITY DEFINER` precisam de testes negativos de enumeração e vazamento.
5. Funções redefinidas várias vezes devem aparecer uma única vez na baseline final.
6. Backfills históricos não devem rodar automaticamente em uma congregação nova.

## Próximos blocos

A auditoria continuará pelos blocos intermediários, priorizando migrations que são referenciadas diretamente neste bloco:

- `030` — tokens de território;
- `057` — guarda de colunas em `locais`;
- `067` — designações de TCE;
- migrations que criam `arranjo_partes`, `notificacoes`, `designacao_tces` e a versão anterior de `territorio_publico`.

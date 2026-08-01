# Plano de testes de autorização e RLS

## Objetivo

Provar que a futura baseline protege os limites estruturais sem bloquear o trabalho legítimo. O contrato canônico está em [`../architecture/AUTHORIZATION_AND_USABILITY.md`](../architecture/AUTHORIZATION_AND_USABILITY.md).

O foco não é maximizar negações. O foco é evitar perda grave, exposição pública, elevação de privilégio e sucesso falso, preservando a usabilidade para uma instância congregacional pequena.

## Limite histórico

`supabase/migrations/001–090` é o legado da instância original, com a lacuna conhecida `021`. Os testes estáticos atuais caracterizam esse histórico.

A baseline será um caminho separado e curto. Achados que não devem ser corrigidos dentro do histórico legado viram requisitos e testes da baseline. Por isso, equivalência significa compatibilidade com o aplicativo e com o domínio, não reprodução literal de toda policy histórica.

## Perfis de teste

- **Admin:** escopo global e manutenção estrutural.
- **Dirigente:** escopo global de coordenação e conclusão, sem poderes de infraestrutura.
- **Publicador líder:** líder de uma designação pessoal ativa com `Q-A`.
- **Publicador participante:** participante da mesma designação por `designacao_publicadores`.
- **Publicador sem vínculo:** usuário ativo sem designação para `Q-A`.
- **Usuário inativo:** sessão existente com perfil desativado.
- **Anônimo:** somente fluxos públicos por token.
- **Service role/execução administrativa:** instalação, backup e manutenção controlada.

## Fixtures mínimas

- duas quadras, `Q-A` e `Q-B`;
- locais e unidades nas duas quadras;
- uma designação pessoal aberta contendo `Q-A`, com líder e participante;
- uma designação encerrada contendo `Q-B`;
- histórico de visitas;
- fila de curadoria;
- histórico de conclusões;
- token público válido, expirado e inexistente;
- perfis admin, dirigente, publicadores ativo/inativo.

## Matriz principal

| Operação | Admin | Dirigente | Publicador com designação ativa | Publicador sem vínculo | Anon |
|---|---:|---:|---:|---:|---:|
| Registrar visita/histórico operacional | ALLOW | ALLOW | ALLOW | ALLOW no fluxo operacional disponível | DENY |
| Adicionar/editar/excluir dados operacionais | ALLOW | ALLOW global | ALLOW com efeito imediato e curadoria | ALLOW no fluxo operacional disponível | DENY |
| Alterar geometria ou vínculo estrutural diretamente | ALLOW | DENY salvo fluxo específico | DENY | DENY | DENY |
| Confirmar/reverter curadoria | ALLOW | CONTRACT futuro | DENY | DENY | DENY |
| Concluir `Q-A` | ALLOW | ALLOW | ALLOW para líder e participante | DENY | DENY |
| Concluir `Q-B` sem designação ativa | ALLOW | ALLOW | DENY | DENY | DENY |
| Alterar role/estado/capacidade do próprio perfil | ALLOW por fluxo administrativo | DENY | DENY | DENY | DENY |
| Enumerar tabelas de tokens | ALLOW administrativo | conforme necessidade interna | DENY direto | DENY direto | DENY |

## Cenários obrigatórios

### Trabalho operacional e curadoria

- publicador cria local/unidade e o dado aparece imediatamente;
- publicador edita informação operacional e a leitura seguinte retorna a mudança;
- publicador exclui pelo fluxo de campo e a interface reflete o resultado;
- cada operação relevante registra autoria, antes/depois e estado pendente em `curadoria_edicoes`;
- admin confirma sem reaplicar a mudança;
- admin reverte e restaura o estado anterior, inclusive após exclusão;
- campo estrutural não pode ser alterado escondido no mesmo payload operacional;
- falha de auditoria/curadoria não pode produzir sucesso silencioso com alteração parcial.

### Conclusão por contexto

- admin conclui qualquer quadra;
- dirigente conclui qualquer quadra;
- líder de designação pessoal aberta conclui `Q-A`;
- participante da mesma designação também conclui `Q-A`;
- publicador sem vínculo não conclui `Q-A`;
- designação encerrada ou expirada deixa de autorizar conclusão;
- trocar `quadra_id` no payload não amplia o escopo;
- conclusão atualiza estado e histórico na mesma operação lógica;
- `marcado_por` representa o usuário real;
- update que afeta zero linhas não é tratado como sucesso;
- desfazer conclusão permanece global para dirigente/admin até decisão específica.

### Perfis privilegiados

- usuário mantém campos comuns permitidos do próprio perfil;
- usuário comum não muda `role`, `ativo`, `tp_aprovado` ou capacidade equivalente;
- admin consegue realizar essas alterações;
- execução administrativa controlada continua possível;
- função `SECURITY DEFINER` usa `search_path` seguro;
- a identificação do chamador não depende de `current_user` dentro da função;
- uma coluna privilegiada nova exige atualização explícita do contrato e do teste.

### Links públicos

- token válido expõe somente o payload previsto;
- token inválido e expirado retornam resposta segura e uniforme;
- anônimo não lê diretamente tabelas de tokens;
- token de um contexto não altera recursos de outro;
- RPC pública possui grants mínimos, validação interna e `search_path` seguro.

### Campos estruturais e operações em massa

- geometria inválida ou SRID incorreto é rejeitado sem alteração parcial;
- associação a outra quadra só ocorre por fluxo controlado;
- importação, divisão, união e correção espacial são transacionais;
- arquivos e IDs manipulados não permitem acesso fora do escopo;
- operações em massa produzem pré-visualização, confirmação e relatório.

## Experiência de erro

Testes de rota/action devem cobrir a tradução de erros:

- sessão expirada gera convite para entrar novamente;
- mudança de designação entre load e action atualiza a tela e explica que a quadra não pertence mais ao usuário;
- recurso removido não exibe `404` cru;
- action ou método desatualizado não exibe `405` cru;
- erro de policy, SQL ou PostgREST não é mostrado ao publicador;
- falha inesperada gera mensagem curta e identificador técnico nos logs;
- a interface não mantém estado otimista quando o banco rejeita a operação.

## Estratégia de execução

### 1. Caracterização do legado

Aplicar `001–090` em banco descartável e executar os contratos que descrevem o estado histórico. Esses testes servem como inventário e detecção de mudanças acidentais.

### 2. Aceitação da baseline

Aplicar apenas `supabase/baseline/` e as migrations posteriores ao marco da baseline. Executar os cenários deste documento com usuários autenticados reais de fixture.

### 3. Comparação

Comparar tabelas, views, funções, triggers, grants, RLS e comportamento usado pelo aplicativo. Diferenças são permitidas quando:

- removem uma ideia obsoleta;
- corrigem um risco documentado;
- implementam o contrato de usabilidade e autorização aceito;
- são registradas em ADR e cobertas por teste.

## Critérios de aceite

- todos os fluxos permitidos funcionam para o perfil e contexto corretos;
- cenários negados falham sem vazar dados;
- não existe sucesso visual com zero linhas alteradas;
- alterações operacionais são imediatas, auditáveis e reversíveis;
- conclusão pessoal funciona para líder e participante de designação ativa;
- dirigente/admin mantêm escopo global;
- campos privilegiados não permitem autoelevação;
- `404`, `405` e mensagens internas não chegam crus ao usuário.

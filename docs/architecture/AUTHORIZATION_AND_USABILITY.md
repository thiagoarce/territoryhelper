# Autorização e usabilidade

Este documento define o contrato de produto que a futura baseline deve implementar. Ele é canônico para novas instalações e prevalece sobre inferências feitas apenas a partir das policies históricas.

## Contexto

Cada instância atende uma congregação, com um grupo pequeno de usuários conhecidos e sua própria infraestrutura. Nesse cenário, autorização existe principalmente para evitar erros acidentais, alterações estruturais indevidas, exposição pública e perda de dados.

RLS continua obrigatória como cinto de segurança, mas não deve transformar o trabalho de campo em uma sequência de bloqueios difíceis de compreender. Uma restrição só deve existir quando protege um limite real do domínio.

## Dados operacionais e estruturais

### Dados operacionais

São informações mantidas durante o trabalho normal, por exemplo:

- locais, unidades e informações práticas de endereço;
- registros de visitas e outros históricos de campo;
- criação de um local ou unidade encontrado em campo;
- indicação de que um local não existe mais;
- correções cotidianas que não redesenham a estrutura territorial.

Publicadores ativos podem adicionar, editar e excluir dados operacionais pelos fluxos disponibilizados no aplicativo. A alteração tem efeito imediato; não fica aguardando aprovação para aparecer.

Cada mudança relevante deve gerar autoria e uma entrada em `curadoria_edicoes`, com dados suficientes para o administrador confirmar ou reverter. Quando “excluir” precisar ser reversível, a implementação deve usar marcação lógica ou preservar um snapshot, em vez de depender apenas de exclusão física em cascata.

### Dados estruturais

São informações capazes de reorganizar o território ou ampliar privilégios, por exemplo:

- geometria e vínculo de uma quadra;
- associação estrutural de um local a outra quadra;
- identificadores e valores brutos de origem do IBGE;
- papéis, estado ativo e capacidades administrativas de perfis;
- operações destrutivas em massa;
- configuração da instância e módulos.

Esses campos usam guardas, RPCs controladas ou ações administrativas. Uma proposta feita em campo pode aparecer imediatamente quando o produto assim definir, mas precisa manter origem, autoria e caminho de reversão.

## Matriz de capacidades

| Operação | Publicador ativo | Dirigente | Admin |
|---|---|---|---|
| Registrar visitas e históricos de campo | Sim | Sim | Sim |
| Adicionar, editar ou excluir dados operacionais | Sim, com efeito imediato e curadoria | Sim, com escopo global | Sim |
| Confirmar ou reverter curadoria | Não | Conforme configuração futura | Sim |
| Alterar geometria e outros campos estruturais diretamente | Não; usar fluxo controlado quando existir | Somente quando o fluxo autorizar | Sim |
| Concluir quadra de designação pessoal ativa | Sim | Sim | Sim |
| Concluir qualquer quadra da instância | Não | Sim | Sim |
| Administrar usuários, módulos e importações em massa | Não | Não | Sim |

“Escopo global” significa que dirigente e admin não dependem de uma designação pessoal para coordenar ou concluir uma quadra.

## Designação pessoal e conclusão de quadra

Um publicador pode concluir uma quadra quando:

1. a designação está ativa/aberta e ainda válida;
2. a quadra pertence à designação;
3. o usuário é o líder em `designacoes.publicador_id` ou participante em `designacao_publicadores`.

A checagem deve ser centralizada em um contrato reutilizável, em vez de repetir consultas diferentes na interface, nas actions e nas policies.

Ao concluir:

- `quadras.data_conclusao` representa o estado atual;
- `quadras_conclusoes` recebe o histórico correspondente;
- a autoria deve representar o usuário que realizou a ação;
- nenhum outro campo estrutural da quadra pode ser alterado como efeito colateral;
- uma mudança de designação entre a abertura da tela e o envio deve resultar em atualização amigável da interface, nunca em sucesso falso.

Desfazer uma conclusão é uma capacidade separada. Até nova decisão de domínio, dirigente e admin mantêm o escopo global para desfazer; conceder a mesma ação ao publicador exige requisito e teste próprios.

## Perfis e elevação de privilégio

A baseline deve permitir que o usuário mantenha campos comuns do próprio perfil sem permitir autoelevação.

Campos como `role`, `ativo`, `tp_aprovado` e qualquer capacidade administrativa remanescente só podem ser alterados pelo fluxo administrativo. Uma função `SECURITY DEFINER` não pode inferir o chamador por `current_user`; deve usar contexto explícito e testável, como `auth.uid()` e um helper de autorização seguro.

O comportamento esperado precisa ser provado por testes de usuário comum, admin e execução administrativa sem sessão de usuário final.

## Erros voltados ao usuário

Códigos HTTP, mensagens SQL e nomes de policies pertencem aos logs técnicos. Eles não devem chegar crus à interface.

| Situação técnica | Mensagem de domínio esperada |
|---|---|
| sessão ausente ou expirada | “Sua sessão expirou. Entre novamente para continuar.” |
| permissão contextual mudou | “Esta quadra não faz mais parte da sua designação. Atualizamos os dados para você.” |
| recurso removido ou alterado | “Este item não está mais disponível.” |
| action/rota antiga ou método não aceito (`404`/`405`) | “Esta ação mudou ou não está disponível. Atualize a página e tente novamente.” |
| conflito de atualização | “Os dados foram alterados por outra pessoa. Revise a versão atual antes de continuar.” |
| falha temporária | “Não foi possível salvar agora. Tente novamente.” |

A interface deve esconder ações sabidamente indisponíveis, mas servidor e banco continuam validando chamadas diretas. Erros inesperados devem registrar o código técnico e um identificador de diagnóstico sem expor detalhes internos ao publicador.

## Critérios de aceite

- o trabalho de campo comum não depende de aprovação prévia;
- toda alteração operacional relevante é rastreável e reversível;
- líder e participante de designação pessoal ativa conseguem concluir suas quadras;
- dirigente e admin conseguem concluir qualquer quadra;
- usuário comum não eleva o próprio privilégio;
- alterações estruturais permanecem protegidas;
- uma operação bloqueada não retorna sucesso com zero linhas alteradas;
- `404`, `405`, erros SQL e nomes de policies não aparecem crus na interface.

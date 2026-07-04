-- ============================================================================
-- 052_publicacoes_seed.sql — catálogo real transcrito do formulário oficial
-- S-14-T (pedido de publicações) + S-28-T (movimento mensal), pra não
-- exigir cadastro manual de ~70 itens. Idempotente via ON CONFLICT
-- (codigo) — o unique index parcial vem da 051. Equipamentos de TP
-- (carrinho/display/quiosque/mesa) NÃO entram aqui — já têm catálogo
-- próprio (tp_carrinho_tipos/tp_pecas_catalogo, migration 041/048).
-- Revistas (Despertai/Sentinela) entram como item genérico, não por
-- edição — o que importa aqui é a necessidade regular, não o número
-- específico.
-- ============================================================================

insert into publicacoes (nome, codigo, categoria) values
  -- Bíblias
  ('Tradução do Novo Mundo da Bíblia Sagrada', 'nwt', 'biblia'),
  ('Tradução do Novo Mundo da Bíblia Sagrada (tamanho grande)', 'nwtls', 'biblia'),
  ('Tradução do Novo Mundo da Bíblia Sagrada (tamanho de bolso)', 'nwtpkt', 'biblia'),
  ('Tradução do Novo Mundo da Bíblia Sagrada — Edição de estudo (Mateus a Atos)', 'nwtsty1-E', 'biblia'),

  -- Livros
  ('Seja Feliz para Sempre! — Um Curso da Bíblia para Você (livro)', 'lff', 'livro'),
  ('‘Dê Testemunho Cabal’ sobre o Reino de Deus', 'bt', 'livro'),
  ('Achegue-se a Jeová', 'cl', 'livro'),
  ('Imite a Sua Fé!', 'ia', 'livro'),
  ('Estudo Perspicaz das Escrituras (conjunto completo)', 'it', 'livro'),
  ('Testemunhas de Jeová — Proclamadores do Reino de Deus', 'jv', 'livro'),
  ('Jesus — o Caminho, a Verdade e a Vida', 'jy', 'livro'),
  ('O Reino de Deus já Governa!', 'kr', 'livro'),
  ('Aprenda com as Histórias da Bíblia', 'lfb', 'livro'),
  ('Aprenda do Grande Instrutor', 'lr', 'livro'),
  ('Organizados para Fazer a Vontade de Jeová', 'od', 'livro'),
  ('A Adoração Pura de Jeová É Restaurada!', 'rr', 'livro'),
  ('Cante de Coração para Jeová', 'sjj', 'livro'),
  ('Cante de Coração para Jeová (tamanho grande)', 'sjjls', 'livro'),
  ('Cante de Coração para Jeová — apenas letras', 'sjjyls', 'livro'),
  ('Os Jovens Perguntam — Respostas Práticas, Volume 1', 'yp1', 'livro'),
  ('Os Jovens Perguntam — Respostas Práticas, Volume 2', 'yp2', 'livro'),
  ('Beneficie-se da Educação da Escola de Deus', 'be', 'livro'),
  ('Entenda a Bíblia', 'bhs', 'livro'),
  ('‘Meu Seguidor’', 'cf', 'livro'),
  ('Princípios Bíblicos para a Vida Cristã', 'scl', 'livro'),
  ('Coragem', 'wcg', 'livro'),
  ('Continue Progredindo', 'lvs', 'livro'),

  -- Brochuras e livretos
  ('Você Pode Ter uma Família Feliz!', 'hf', 'brochura'),
  ('Como Você Pode Ter uma Vida Feliz? (para judeus)', 'hl', 'brochura'),
  ('Como Ter uma Vida Satisfatória', 'la', 'brochura'),
  ('Escute a Deus', 'ld', 'brochura'),
  ('Minhas Primeiras Lições da Bíblia', 'mb', 'brochura'),
  ('O Caminho para a Vida Eterna — Já o Encontrou? (para africanos)', 'ol', 'brochura'),
  ('Como Ter Verdadeira Paz e Felicidade (para chineses)', 'pc', 'brochura'),
  ('O Caminho para a Paz e Felicidade (para budistas)', 'ph', 'brochura'),
  ('Volte para Jeová', 'rj', 'brochura'),
  ('Verdadeira Fé — O Segredo de uma Vida Feliz (para muçulmanos)', 'rk', 'brochura'),
  ('Espíritos dos Mortos — Ajudam? Ou Prejudicam? Existem realmente?', 'sp', 'brochura'),
  ('Melhore Sua Leitura e Seu Ensino', 'th', 'brochura'),
  ('Aprenda com a Sabedoria de Jesus (para muçulmanos)', 'wfg', 'brochura'),
  ('10 Perguntas Que os Jovens se Fazem e as Melhores Respostas', 'ypq', 'brochura'),
  ('A Vida — Teve um Criador?', 'lc', 'brochura'),
  ('A Origem da Vida — Cinco Perguntas Que Merecem Resposta', 'lf', 'brochura'),
  ('Seja Feliz para Sempre! — Comece a Aprender sobre a Bíblia (brochura)', 'lffi', 'brochura'),
  ('Escute a Deus e Viva para Sempre', 'll', 'brochura'),
  ('Leitura e Escrita', 'ay', 'brochura'),
  ('Boas Notícias de Deus', 'fg', 'brochura'),
  ('Ame as Pessoas', 'lmd', 'brochura'),

  -- Folhetos e convites
  ('Convite para Reuniões Cristãs', 'inv', 'folheto'),
  ('O Que Você Acha da Bíblia?', 'T-30', 'folheto'),
  ('O Que Você Espera do Futuro?', 'T-31', 'folheto'),
  ('Qual o Segredo para Ter uma Família Feliz?', 'T-32', 'folheto'),
  ('Quem Controla o Mundo?', 'T-33', 'folheto'),
  ('O Sofrimento Vai Acabar Algum Dia?', 'T-34', 'folheto'),
  ('Será Que os Mortos Podem Voltar a Viver?', 'T-35', 'folheto'),
  ('O Que É o Reino de Deus?', 'T-36', 'folheto'),
  ('Onde Encontrar as Respostas mais Importantes da Vida?', 'T-37', 'folheto'),

  -- Cartões de visita
  ('Cartão de visita do jw.org (Bíblia aberta)', 'jwcd1', 'cartao_visita'),
  ('Cartão de visita do jw.org (somente logo jw.org)', 'jwcd4', 'cartao_visita'),
  ('Cartão de visita para curso bíblico gratuito (presencial)', 'jwcd9', 'cartao_visita'),
  ('Cartão de visita para curso bíblico gratuito (pela internet)', 'jwcd10', 'cartao_visita'),

  -- Revistas para o público (genérico, não por edição)
  ('Despertai!', 'g', 'revista'),
  ('A Sentinela (público)', 'wp', 'revista'),

  -- Formulários e acessórios
  ('Porta-crachá (plástico)', 'bdg', 'formulario'),
  ('Etiquetas para caixas de donativos do Salão do Reino', 'cblkh1', 'formulario'),
  ('Diretivas Antecipadas e Procuração para Tratamento de Saúde', 'dpa', 'formulario'),
  ('Envelope Plástico para Cartão de Território', 'pte', 'formulario'),
  ('Relatório de Serviço de Campo (S-4)', 'S-4', 'formulario'),
  ('Registro de Casa em Casa (S-8)', 'S-8', 'formulario'),
  ('Cartão de Mapa de Território (S-12)', 'S-12', 'formulario'),
  ('Registro de Designação de Território (S-13)', 'S-13', 'formulario'),
  ('Recibo (S-24)', 'S-24', 'formulario'),
  ('Designação para a Reunião Nossa Vida e Ministério Cristão (S-89)', 'S-89', 'formulario'),
  ('Petição para o Serviço de Pioneiro Auxiliar (S-205b)', 'S-205b', 'formulario')
on conflict (codigo) where codigo is not null do nothing;

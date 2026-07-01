# Especificações e Fases de Implementação - Territory Helper

## 1. Objetivo e Arquitetura
Aplicativo PWA map-driven para gestão de territórios.
* **Stack:** SvelteKit 2 + Svelte 5 (runes), Tailwind 3, Supabase (Postgres, Auth, RLS), MapLibre GL. Deploy no Cloudflare Workers.
* **Paradigma de UI:** A interface no modo campo deve ser centralizada no mapa. O mapa é o principal controlador das ações.

## Fase 1: Endurecimento e Segurança (Prioridade Crítica)
* **Correção RLS (Urgente):** Habilitar e configurar o Row-Level Security em TODAS as tabelas do Supabase. Um publicador não pode alterar locais/unidades fora da sua designação atual.
* **Validação de Rota (Server-side):** Em `/publicador/quadra/[id]/+page.server.ts`, criar um helper (ex: `exigirQuadraDesignada`) para garantir que o usuário logado realmente possui acesso àquela quadra antes de permitir qualquer *Action* de edição ou conclusão.
* **Bug Fix de UI:** Ao abrir a tela de Perfil no modo Publicador/Dirigente, o menu lateral (sanduíche) está "vazando" funcionalidades de Admin. Esconder esses links condicionais corretamente.
* **Limpeza do Menu Admin:** Remover "Auditoria" e "SQL (dev)", pois caíram em desuso.
* **Ajuste Visual:** Adicionar padding lateral adequado na tela de Usuários e Convites.

## Fase 2: Modo "Campo" (Interface Base do Publicador)
* **Navegação:** O menu "Perfil" deve sair da barra inferior de navegação e virar apenas um ícone discreto no topo.
* **Ponto de Entrada (Campanha):** Se houver uma campanha ativa, a tela inicial do app no campo deve ser a visualização das metas e progresso da campanha.
* **Designações (A Carteira):** Ao entrar em designações, o publicador visualiza suas quadras recebidas. Elas são divididas entre:
  1. *Território Pessoal:* Designado diretamente pelo Admin.
  2. *Pregação:* Designação temporária feita pelo Dirigente no momento do campo.
* **Visualização de Arranjos:** Publicadores podem apenas ver a lista de arranjos de campo para planejamento pessoal.
* **Busca e Criação de Prédios:** 
  * Permitir busca global de prédios por endereço ou proximidade (localização atual).
  * Se não encontrar, o publicador pode criar um novo prédio (nome, portaria, qtd cartas). Esse registro fica "pendente" para o Admin validar e associar geograficamente depois.

## Fase 3: Superpoderes do Dirigente (Condicional na Interface de Campo)
O Dirigente usa exatamente a mesma interface do Modo Campo, mas com "poderes" habilitados via flag na role do usuário:
* **Mapa Estratégico e Delegação:** Pode ver territórios próximos no mapa. Quadras inativas ou recém-concluídas aparecem em cinza/vermelho para evitar sobreposição. Pode selecionar um subconjunto de suas quadras e delegar (designação temporária) para um publicador do grupo.
* **Ações de Quadra:** Habilitar o botão "Marcar como Concluída" ao selecionar uma quadra no mapa.
* **POIs e Estacionamento:** No mapa da quadra, habilitar um botão "P" (Parking) para buscar e renderizar no mapa pontos de interesse próximos (estacionamentos, praças, farmácias, padarias, postos). Ao clicar num POI, gerar rota externa via Google Maps.
* **Cartão de Território (Exportação):** Opção para exportar a visualização da quadra selecionada como uma imagem PNG (Cartão de Território) para enviar aos publicadores, especialmente os mais idosos. Suporte a compartilhamento em lote.
* **Assumir Arranjo:** Na lista de arranjos, o dirigente pode clicar em um território/arranjo aberto e o app deve perguntar: *"Deseja assumir a dirigência deste arranjo?"*. Ao aceitar, ele substitui o dirigente anterior e as designações daquele arranjo passam para sua carteira.

## Regras Inflexíveis de Código
* NUNCA use `Turf.js` no frontend para operações de polígonos. Use sempre RPCs do PostGIS no Supabase (`ST_Union`, etc).
* Com Svelte 5 runes, NUNCA faça *early-returns* dentro de um `$effect` antes de declarar as dependências reativas.
* Use os componentes unificados da pasta `$lib/ui` em vez de criar botões e cards do zero. Modais devem usar `BottomSheet`.
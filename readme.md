# 📂 Gestor de Territórios Inteligente

Uma aplicação web baseada em **Google Apps Script** e **Leaflet.js** para gestão geográfica de pregação, permitindo o mapeamento de endereços, organização de quadras e territórios, e acompanhamento de registros de campo em tempo real.

---

## 🚀 Funcionalidades Principais

### 1. 🏃 Visão de Campo (Pregação)
* **Visualização Consolidada:** Mapa unificado com polígonos de quadras, territórios e pontos de endereços (heatmap).
* **Geolocalização (GPS):** Identificação em tempo real da posição do usuário (bolinha azul) para facilitar a orientação nas ruas.
* **Rotas Inteligentes:** Botão dedicado para traçar rotas automáticas do ponto atual até a quadra ou endereço selecionado via Google Maps.

### 2. ✍️ Editor de Territórios (Escritório)
* **Gestão de Polígonos:** Criação, edição e exclusão de quadras diretamente no mapa.
* **Rótulos Fixos:** Visualização imediata do nome das quadras de forma permanente (sem precisar clicar).
* **Seleção Múltipla & Fusão:** Ferramenta para selecionar várias quadras e "juntá-las" em uma única quadra maior ou agrupar em um território.
* **Estilo CSV Limpo:** Identificadores de território com badges circulares de alta visibilidade e contraste.

### 3. 📊 Registro e Gestão Visual
* **Status por Cores:** Sistema visual que identifica quadras concluídas recentemente (Verde), quadras em progresso (Cinza) e áreas que precisam de atenção (Vermelho).
* **Histórico Automático:** Registro de datas de conclusão integrando automaticamente com as planilhas do Google.
* **Filtros de Visualização:** Alternância rápida entre visão de quadras, territórios ou camadas híbridas.

---

## 🛠️ Tecnologias Utilizadas

* **Backend:** [Google Apps Script](https://developers.google.com/apps-script) (Google Sheets como Banco de Dados).
* **Frontend:** HTML5, CSS3 (Bootstrap 5).
* **Mapas:** [Leaflet.js](https://leafletjs.com/) & [Leaflet Geoman](https://geoman.io/) (para edição geométrica).
* **Processamento Geográfico:** [Turf.js](https://turfjs.org/) (para cálculos de união e fusão de polígonos).
* **Ícones:** Font Awesome 6.

---

## 📋 Estrutura da Planilha Google

Para o funcionamento correto, a planilha vinculada deve possuir as seguintes abas:

1.  **Dados Brutos:** Contendo coordenadas lat/lng e nomes das faces/quadras.
2.  **Quadras:** Onde são armazenados os polígonos individuais.
3.  **Territorios:** Onde são armazenados os agrupamentos de quadras.

---

## 📖 Instalação e Configuração

1.  No Google Sheets, vá em **Extensões** > **Apps Script**.
2.  Crie os arquivos conforme a estrutura do projeto: `Code.gs`, `Index.html`, `Styles.html`, `JS-Mapas.html` e `JS-App.html`.
3.  No menu superior, clique em **Implantar** > **Nova Implantação**.
4.  Escolha **App da Web** e defina o acesso para "Qualquer pessoa" (ou conforme sua política de privacidade).
5.  Copie a URL gerada e acesse pelo navegador do seu smartphone ou PC.

---

## 📝 Licença

Este projeto está sob a licença MIT. Sinta-se à vontade para clonar e adaptar para as necessidades da sua comunidade ou congregação local.

---
**Desenvolvido para otimizar a organização e o zelo no trabalho de campo.** 🌍

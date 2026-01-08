📂 Gestor de Territórios Inteligente
Uma aplicação web baseada em Google Apps Script e Leaflet.js para gestão geográfica de pregação, permitindo o mapeamento de endereços, organização de quadras e territórios, e acompanhamento de registros de campo em tempo real.

🚀 Funcionalidades Principais
1. 🏃 Visão de Campo (Pregação)
Visualização Consolidada: Mapa unificado com polígonos de quadras, territórios e pontos de endereços (heatmap).

Geolocalização (GPS): Identificação em tempo real da posição do usuário (bolinha azul) para facilitar a orientação nas ruas.

Rotas Inteligentes: Botão dedicado para traçar rotas automáticas do ponto atual até a quadra ou endereço selecionado via Google Maps.

2. ✍️ Editor de Territórios (Escritório)
Gestão de Polígonos: Criação, edição e exclusão de quadras diretamente no mapa.

Rótulos Fixos: Visualização imediata do nome das quadras sem necessidade de clique.

Seleção Múltipla & Fusão: Ferramenta para selecionar várias quadras e "juntá-las" em um único território ou uma única quadra maior.

Estilo CSV: Identificadores de território em formato de badges circulares de alta visibilidade.

3. 📊 Registro e Gestão Visual
Status por Cores: Sistema visual que identifica quadras concluídas recentemente, quadras que precisam de atenção e territórios vencidos.

Histórico: Registro de datas de conclusão integrando automaticamente com a planilha do Google.

Filtros de Visualização: Alternância rápida entre visão de quadras, territórios ou ambos.

🛠️ Tecnologias Utilizadas
Backend: Google Apps Script (integração direta com Google Sheets).

Frontend: HTML5, CSS3 (Bootstrap 5).

Mapas: Leaflet.js & Leaflet Geoman (para edição de geometrias).

Processamento Geográfico: Turf.js (para fusão e união de polígonos).

Ícones: Font Awesome 6.

📋 Pré-requisitos e Instalação
Crie uma Planilha Google.

Nomeie as abas principais como: Dados Brutos, Quadras e Territorios.

Acesse Extensões > Apps Script.

Cole os arquivos fornecidos no projeto (Code.gs, Index.html, etc.).

Clique em Implantar > Nova Implantação > App da Web.

Configure o acesso para "Qualquer pessoa" (ou conforme sua necessidade de privacidade).

📖 Como Usar
Modo Campo: Use ao sair para a pregação. Toque em qualquer lugar do mapa para saber onde você está e peça para o app traçar a rota até a próxima quadra.

Modo Editor: Use para organizar o mapa. Ative a "Seleção Múltipla" para agrupar quadras e criar um novo Território. Defina cores para diferenciar as áreas.

Modo Registro: Após trabalhar uma área, selecione as quadras no mapa de registro e clique em "Concluir" para atualizar as datas automaticamente.

📝 Licença
Este projeto está sob a licença MIT. Sinta-se à vontade para clonar e adaptar para as necessidades da sua congregação local.

Desenvolvido para facilitar a organização e o zelo no território. 🌍

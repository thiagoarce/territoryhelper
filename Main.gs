// Main.gs
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Território Digital - Gestor')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Função mágica para incluir arquivos HTML dentro de outros
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
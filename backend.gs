function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Território Digital - Aeroclube')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * RETORNA O RESUMO DE TODAS AS QUADRAS (Para o Mapa Geral)
 */
function getVisaoGeral() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues(); // Lê colunas A até K
  
  const quadras = {};

  data.forEach(row => {
    const faceId = row[0]; // Ex: 1718P-Q4-F4
    if (!faceId) return;

    // Extrai ID da Quadra (Remove a parte da Face)
    const partes = faceId.split('-');
    if (partes.length < 2) return;
    const quadraId = partes[0] + '-' + partes[1]; // Ex: 1718P-Q4

    // Inicializa objeto da quadra se não existir
    if (!quadras[quadraId]) {
      quadras[quadraId] = {
        id: quadraId,
        lat: 0,
        lng: 0,
        totalEnderecos: 0, // Contagem simples de linhas por enquanto
        countCoords: 0
      };
    }

    // Soma coordenadas para fazer uma média (Centróide da quadra)
    // Coluna J (9) e K (10)
    const lat = limparCoord(row[9]);
    const lng = limparCoord(row[10]);

    if (lat && lng) {
      quadras[quadraId].lat += lat;
      quadras[quadraId].lng += lng;
      quadras[quadraId].countCoords++;
    }
    
    quadras[quadraId].totalEnderecos++;
  });

  // Calcula médias e formata saída
  const resultado = Object.values(quadras).map(q => {
    return {
      id: q.id,
      lat: q.countCoords > 0 ? q.lat / q.countCoords : null,
      lng: q.countCoords > 0 ? q.lng / q.countCoords : null,
      total: q.totalEnderecos
    };
  });

  return resultado;
}

// --- FUNÇÕES JÁ EXISTENTES (MANTENHA IGUAL) ---

function getListaQuadras() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const quadrasUnicas = new Set();
  data.forEach(r => {
    if(r[0]) {
      let partes = r[0].split('-');
      if (partes.length >= 2) quadrasUnicas.add(partes[0] + '-' + partes[1]);
    }
  });
  return Array.from(quadrasUnicas).sort();
}

function getDadosDaQuadra(quadraId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
  const dadosFiltrados = range.filter(row => row[0] && row[0].startsWith(quadraId));
  return dadosFiltrados.map(row => {
    return {
      logradouro: row[5],
      numero: row[6],
      complemento: row[8],
      lat: limparCoord(row[9]),
      lng: limparCoord(row[10]),
      tipo: row[11],
      nomeEdificio: row[17] || ""
    };
  });
}

function limparCoord(coord) {
  if (typeof coord === 'number') return coord;
  if (typeof coord === 'string') return parseFloat(coord.replace(',', '.'));
  return null;
}

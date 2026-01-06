// Database.gs

// --- LEITURA DE DADOS ---

function getVisaoGeral() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  if (!sheet) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues(); 
  
  const quadras = {};
  data.forEach(row => {
    const faceId = row[0]; 
    if (!faceId) return;
    const partes = faceId.split('-');
    if (partes.length < 2) return;
    const quadraId = partes[0] + '-' + partes[1]; 

    if (!quadras[quadraId]) {
      quadras[quadraId] = { id: quadraId, lat: 0, lng: 0, totalEnderecos: 0, countCoords: 0 };
    }

    const lat = limparCoord(row[9]);
    const lng = limparCoord(row[10]);

    if (lat && lng) {
      quadras[quadraId].lat += lat;
      quadras[quadraId].lng += lng;
      quadras[quadraId].countCoords++;
    }
    quadras[quadraId].totalEnderecos++;
  });

  return Object.values(quadras).map(q => ({
    id: q.id,
    lat: q.countCoords > 0 ? q.lat / q.countCoords : null,
    lng: q.countCoords > 0 ? q.lng / q.countCoords : null,
    total: q.totalEnderecos
  }));
}

function getListaQuadras() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  if (!sheet) return [];
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
  return range.filter(row => row[0] && row[0].startsWith(quadraId)).map(row => ({
    logradouro: row[5],
    numero: row[6],
    complemento: row[8],
    lat: limparCoord(row[9]),
    lng: limparCoord(row[10]),
    tipo: row[11],
    nomeEdificio: row[17] || ""
  }));
}

function getPoligonosQuadras() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  if (!sheet || sheet.getLastRow() < 2) return [];
  
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  return range.map(row => ({
    id: row[0],
    area: row[1],
    lat: row[2],
    lng: row[3],
    polyString: row[4],
    color: row[5] || "#3388ff",
    territory: row[6] || "Geral"
  }));
}

// --- ESCRITA DE DADOS ---

function salvarEdicaoQuadra(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  if (!sheet) return { erro: "Planilha 'Quadras' não encontrada." };
  
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  let rowIndex = ids.indexOf(dados.idOriginal);
  
  if (rowIndex === -1) return { erro: "Quadra original não encontrada." };
  
  const linha = rowIndex + 2;
  sheet.getRange(linha, 1).setValue(dados.idNovo);
  sheet.getRange(linha, 2).setValue(dados.area);
  sheet.getRange(linha, 3).setValue(dados.centro[0]);
  sheet.getRange(linha, 4).setValue(dados.centro[1]);
  sheet.getRange(linha, 5).setValue(dados.polyString);
  sheet.getRange(linha, 6).setValue(dados.color);
  sheet.getRange(linha, 7).setValue(dados.territory);
  
  return { sucesso: true };
}

function excluirQuadra(idQuadra) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  if (!sheet) return { erro: "Erro ao acessar planilha." };

  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  const rowIndex = ids.indexOf(idQuadra);

  if (rowIndex > -1) {
    sheet.deleteRow(rowIndex + 2);
    return { sucesso: true };
  }
  return { erro: "Quadra não encontrada." };
}

// --- UTILITÁRIOS ---
function limparCoord(coord) {
  if (typeof coord === 'number') return coord;
  if (typeof coord === 'string') return parseFloat(coord.replace(',', '.'));
  return null;
}

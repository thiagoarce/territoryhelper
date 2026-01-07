// --- LEITURA DE DADOS ---

function getVisaoGeral() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  if (!sheet) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues(); 
  const quadras = {};
  data.forEach(row => {
    const faceId = row[0]; if (!faceId) return;
    const partes = faceId.split('-'); if (partes.length < 2) return;
    const quadraId = partes[0] + '-' + partes[1]; 
    if (!quadras[quadraId]) quadras[quadraId] = { id: quadraId, lat: 0, lng: 0, totalEnderecos: 0, countCoords: 0 };
    const lat = limparCoord(row[9]); const lng = limparCoord(row[10]);
    if (lat && lng) { quadras[quadraId].lat += lat; quadras[quadraId].lng += lng; quadras[quadraId].countCoords++; }
    quadras[quadraId].totalEnderecos++;
  });
  return Object.values(quadras).map(q => ({ id: q.id, lat: q.countCoords > 0 ? q.lat / q.countCoords : null, lng: q.countCoords > 0 ? q.lng / q.countCoords : null, total: q.totalEnderecos }));
}

function getListaQuadras() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  if (!sheet) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const quadrasUnicas = new Set();
  data.forEach(r => { if(r[0]) { let partes = r[0].split('-'); if (partes.length >= 2) quadrasUnicas.add(partes[0] + '-' + partes[1]); } });
  return Array.from(quadrasUnicas).sort();
}

function getDadosDaQuadra(quadraId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(2, 1, lastRow - 1, 18).getValues();
  return range.filter(row => row[0] && row[0].startsWith(quadraId)).map(row => ({
    logradouro: row[5], numero: row[6], complemento: row[8], lat: limparCoord(row[9]), lng: limparCoord(row[10]), tipo: row[11], nomeEdificio: row[17] || ""
  }));
}

function getPoligonosQuadras() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  if (!sheet || sheet.getLastRow() < 2) return [];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  return range.map(row => ({
    id: row[0], area: row[1], lat: row[2], lng: row[3], polyString: row[4], color: row[5] || "#3388ff", territory: row[6] || ""
  }));
}

function getDadosTerritorios() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Territorios");
  if (!sheet) { sheet = ss.insertSheet("Territorios"); sheet.appendRow(["Nome", "Cor", "Lista de Quadras", "Polígono (Union)"]); return []; }
  if (sheet.getLastRow() < 2) return [];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  return range.map(row => ({ name: row[0], color: row[1], quadras: row[2], polyString: row[3] }));
}

// --- ESCRITA ---

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

function salvarCriacaoTerritorio(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQuadras = ss.getSheetByName("Quadras");
  let sheetTerritorios = ss.getSheetByName("Territorios");
  if (!sheetQuadras) return { erro: "Aba 'Quadras' não encontrada." };
  if (!sheetTerritorios) { sheetTerritorios = ss.insertSheet("Territorios"); sheetTerritorios.appendRow(["Nome", "Cor", "Lista de Quadras", "Polígono (Union)"]); }
  
  const ids = sheetQuadras.getRange(2, 1, sheetQuadras.getLastRow() - 1, 1).getValues().flat();
  dados.idsQuadras.forEach(id => {
    const idx = ids.indexOf(id);
    if (idx > -1) {
      sheetQuadras.getRange(idx + 2, 6).setValue(dados.color);
      sheetQuadras.getRange(idx + 2, 7).setValue(dados.name);
    }
  });
  sheetTerritorios.appendRow([dados.name, dados.color, dados.idsQuadras.join(","), dados.polyString]);
  return { sucesso: true };
}

// NOVO: EDITA UM TERRITÓRIO EXISTENTE
function editarTerritorio(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQuadras = ss.getSheetByName("Quadras");
  const sheetTerritorios = ss.getSheetByName("Territorios");
  
  if (!sheetQuadras || !sheetTerritorios) return { erro: "Planilhas não encontradas." };
  
  // 1. Achar e atualizar a linha do Território
  const nomesTerritorios = sheetTerritorios.getRange(2, 1, sheetTerritorios.getLastRow()-1, 1).getValues().flat();
  const tIndex = nomesTerritorios.indexOf(dados.originalName);
  
  if (tIndex === -1) return { erro: "Território original não encontrado." };
  
  const rowT = tIndex + 2;
  sheetTerritorios.getRange(rowT, 1).setValue(dados.newName);
  sheetTerritorios.getRange(rowT, 2).setValue(dados.newColor);
  sheetTerritorios.getRange(rowT, 3).setValue(dados.idsQuadras.join(","));
  sheetTerritorios.getRange(rowT, 4).setValue(dados.polyString);

  // 2. Atualizar as Quadras (Limpar as antigas e setar as novas)
  const qData = sheetQuadras.getRange(2, 1, sheetQuadras.getLastRow()-1, 7).getValues(); // Pega tudo pra ser rápido
  
  for (let i = 0; i < qData.length; i++) {
    const qId = qData[i][0];
    const qTerritory = qData[i][6];
    
    let mudou = false;
    let novaCor = qData[i][5];
    let novoTerritorio = qData[i][6];

    // Se a quadra pertencia a esse território (pelo nome antigo), limpamos primeiro
    if (qTerritory === dados.originalName) {
      novaCor = "#3388ff"; // Volta pro azul padrão
      novoTerritorio = "";
      mudou = true;
    }

    // Se a quadra está na NOVA lista, aplicamos os dados novos
    if (dados.idsQuadras.includes(qId)) {
      novaCor = dados.newColor;
      novoTerritorio = dados.newName;
      mudou = true;
    }

    if (mudou) {
      sheetQuadras.getRange(i + 2, 6).setValue(novaCor);
      sheetQuadras.getRange(i + 2, 7).setValue(novoTerritorio);
    }
  }

  return { sucesso: true };
}

// NOVO: EXCLUIR TERRITÓRIO
function excluirTerritorio(nomeTerritorio) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQuadras = ss.getSheetByName("Quadras");
  const sheetTerritorios = ss.getSheetByName("Territorios");

  // 1. Remove da aba Territorios
  const nomes = sheetTerritorios.getRange(2, 1, sheetTerritorios.getLastRow()-1, 1).getValues().flat();
  const idx = nomes.indexOf(nomeTerritorio);
  if (idx > -1) {
    sheetTerritorios.deleteRow(idx + 2);
  } else {
    return { erro: "Território não encontrado." };
  }

  // 2. Limpa nas Quadras
  const qData = sheetQuadras.getRange(2, 7, sheetQuadras.getLastRow()-1, 1).getValues().flat(); // Só coluna Territorio
  qData.forEach((val, i) => {
    if (val === nomeTerritorio) {
      sheetQuadras.getRange(i + 2, 6).setValue("#3388ff"); // Reset cor
      sheetQuadras.getRange(i + 2, 7).setValue("");        // Reset nome
    }
  });

  return { sucesso: true };
}

function processarGeometriaEmLote(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  if (payload.toRemove && payload.toRemove.length > 0) {
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
    const rowsToDelete = [];
    payload.toRemove.forEach(id => { const idx = ids.indexOf(id); if (idx > -1) rowsToDelete.push(idx + 2); });
    rowsToDelete.sort((a, b) => b - a);
    rowsToDelete.forEach(row => sheet.deleteRow(row));
  }
  if (payload.toAdd && payload.toAdd.length > 0) {
    payload.toAdd.forEach(q => { sheet.appendRow([q.id, q.area || 0, q.centro[0], q.centro[1], q.polyString, q.color || "#3388ff", q.territory || ""]); });
  }
  return { sucesso: true };
}

function excluirQuadra(idQuadra) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  const rowIndex = ids.indexOf(idQuadra);
  if (rowIndex > -1) { sheet.deleteRow(rowIndex + 2); return { sucesso: true }; }
  return { erro: "Quadra não encontrada." };
}

function limparCoord(coord) {
  if (typeof coord === 'number') return coord;
  if (typeof coord === 'string') return parseFloat(coord.replace(',', '.'));
  return null;
}
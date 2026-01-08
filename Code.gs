function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate().setTitle('Gestor de Territórios').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}
function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }

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
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getValues();
  return range.filter(row => row[0] && row[0].startsWith(quadraId)).map(row => ({
    logradouro: row[5], numero: row[6], complemento: row[8], lat: limparCoord(row[9]), lng: limparCoord(row[10]), tipo: row[11], nomeEdificio: row[17] || ""
  }));
}
function getPoligonosQuadras() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Quadras");
  if (!sheet) { sheet = ss.insertSheet("Quadras"); sheet.appendRow(["ID", "Area", "Lat", "Lng", "PolyString", "Cor", "Territorio", "Status", "Data Conclusão"]); return []; }
  if (sheet.getLastRow() < 2) return [];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  return range.map(row => ({
    id: row[0], area: row[1], lat: row[2], lng: row[3], polyString: row[4], color: row[5] || "#3388ff", territory: row[6] || "",
    status: row[7] || "Pendente", dataConclusao: row[8] ? Utilities.formatDate(new Date(row[8]), Session.getScriptTimeZone(), "yyyy-MM-dd") : ""
  }));
}
function getDadosTerritorios() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Territorios");
  if (!sheet) { sheet = ss.insertSheet("Territorios"); sheet.appendRow(["Nome", "Cor", "Lista de Quadras", "Polígono (Union)", "Posição Rótulo", "Tipo Rótulo", "Status", "Data Conclusão"]); return []; }
  if (sheet.getLastRow() < 2) return [];
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  return range.map(row => ({ 
    name: row[0], color: row[1], quadras: row[2], polyString: row[3], labelPos: row[4], labelType: row[5] || "visible",
    status: row[6] || "Pendente", dataConclusao: row[7] ? Utilities.formatDate(new Date(row[7]), Session.getScriptTimeZone(), "yyyy-MM-dd") : ""
  }));
}
function salvarEdicaoQuadra(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  let rowIndex = ids.indexOf(dados.idOriginal);
  if (rowIndex === -1) return { erro: "Quadra não encontrada." };
  const linha = rowIndex + 2;
  sheet.getRange(linha, 1, 1, 7).setValues([[dados.idNovo, dados.area, dados.centro[0], dados.centro[1], dados.polyString, dados.color, dados.territory]]);
  return { sucesso: true };
}
function salvarLoteTerritorios(listaUpdates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQuadras = ss.getSheetByName("Quadras");
  let sheetTerritorios = ss.getSheetByName("Territorios");
  if (!sheetTerritorios) { sheetTerritorios = ss.insertSheet("Territorios"); sheetTerritorios.appendRow(["Nome", "Cor", "Lista de Quadras", "Polígono (Union)", "Posição Rótulo", "Tipo Rótulo", "Status", "Data Conclusão"]); }
  const nomesTerritorios = sheetTerritorios.getLastRow() > 1 ? sheetTerritorios.getRange(2, 1, sheetTerritorios.getLastRow()-1, 1).getValues().flat() : [];
  const idsQuadras = sheetQuadras.getLastRow() > 1 ? sheetQuadras.getRange(2, 1, sheetQuadras.getLastRow()-1, 1).getValues().flat() : [];
  listaUpdates.forEach(update => {
    const nomeBusca = update.originalName || update.name;
    const tIndex = nomesTerritorios.indexOf(nomeBusca);
    if (tIndex > -1) {
      const rowT = tIndex + 2;
      sheetTerritorios.getRange(rowT, 1, 1, 6).setValues([[update.name, update.color, update.idsQuadras.join(","), update.polyString, update.labelPos || "", update.labelType || "visible"]]);
    } else {
      sheetTerritorios.appendRow([update.name, update.color, update.idsQuadras.join(","), update.polyString, update.labelPos || "", update.labelType || "visible", "Pendente", ""]);
      nomesTerritorios.push(update.name);
    }
    update.idsQuadras.forEach(qId => {
      const qIndex = idsQuadras.indexOf(qId);
      if (qIndex > -1) { sheetQuadras.getRange(qIndex + 2, 6, 1, 2).setValues([[update.color, update.name]]); }
    });
  });
  return { sucesso: true };
}
function salvarConclusaoQuadras(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQuadras = ss.getSheetByName("Quadras");
  const sheetTerritorios = ss.getSheetByName("Territorios");
  const qValues = sheetQuadras.getRange(2, 1, sheetQuadras.getLastRow() - 1, 9).getValues();
  const territoriosAfetados = new Set();
  for (let i = 0; i < qValues.length; i++) {
    if (payload.ids.includes(qValues[i][0])) {
      sheetQuadras.getRange(i + 2, 8).setValue("Concluído");
      sheetQuadras.getRange(i + 2, 9).setValue(payload.data);
      if (qValues[i][6]) territoriosAfetados.add(qValues[i][6]);
    }
  }
  if (territoriosAfetados.size > 0) {
    const qDataAtualizado = sheetQuadras.getRange(2, 1, sheetQuadras.getLastRow() - 1, 9).getValues();
    const tData = sheetTerritorios.getRange(2, 1, sheetTerritorios.getLastRow() - 1, 8).getValues();
    territoriosAfetados.forEach(nomeTerritorio => {
      const quadrasDoTerritorio = qDataAtualizado.filter(r => r[6] === nomeTerritorio);
      if (quadrasDoTerritorio.length > 0 && quadrasDoTerritorio.every(r => r[7] === "Concluído")) {
          const datas = quadrasDoTerritorio.map(r => new Date(r[8])).filter(d => !isNaN(d.getTime()));
          const maxDate = datas.length > 0 ? new Date(Math.max.apply(null, datas)) : new Date();
          const dataFinal = Utilities.formatDate(maxDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
          for(let k=0; k<tData.length; k++) {
            if(tData[k][0] === nomeTerritorio) {
              sheetTerritorios.getRange(k+2, 7, 1, 2).setValues([["Concluído", dataFinal]]);
              break;
            }
          }
      }
    });
  }
  return { sucesso: true };
}
function excluirTerritorio(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetT = ss.getSheetByName("Territorios");
  const sheetQ = ss.getSheetByName("Quadras");
  const nomes = sheetT.getRange(2, 1, sheetT.getLastRow()-1, 1).getValues().flat();
  const idx = nomes.indexOf(nome);
  if (idx > -1) sheetT.deleteRow(idx + 2); else return { erro: "Não encontrado" };
  const qData = sheetQ.getRange(2, 7, sheetQ.getLastRow()-1, 1).getValues().flat();
  qData.forEach((val, i) => { if (val === nome) sheetQ.getRange(i + 2, 6, 1, 2).setValues([["#3388ff", ""]]); });
  return { sucesso: true };
}
function processarGeometriaEmLote(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Quadras");
  if (payload.toRemove && payload.toRemove.length > 0) {
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
    const rows = [];
    payload.toRemove.forEach(id => { const i = ids.indexOf(id); if (i > -1) rows.push(i + 2); });
    rows.sort((a,b)=>b-a).forEach(r => sheet.deleteRow(r));
  }
  if (payload.toAdd && payload.toAdd.length > 0) {
    payload.toAdd.forEach(q => sheet.appendRow([q.id, q.area||0, q.centro[0], q.centro[1], q.polyString, "#3388ff", "", "Pendente", ""]));
  }
  return { sucesso: true };
}
function excluirQuadra(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Quadras");
  const ids = sheet.getRange(2, 1, sheet.getLastRow()-1, 1).getValues().flat();
  const idx = ids.indexOf(id);
  if (idx > -1) { sheet.deleteRow(idx + 2); return { sucesso: true }; }
  return { erro: "Erro ao excluir." };
}
function limparCoord(c) {
  if (typeof c === 'number') return c;
  if (typeof c === 'string') return parseFloat(c.replace(',', '.'));
  return null;
}
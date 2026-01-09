// =================================================================
// 1. INICIALIZAÇÃO
// =================================================================
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Mapa de Territórios').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}
function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }

// =================================================================
// 2. LEITURA: QUADRAS
// =================================================================
function getPoligonosQuadras() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Quadras");
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return []; 
    const rows = data.slice(1);
    
    return rows.map(function(r) {
      // A[0]:ID, B[1]:Area, C[2]:Lat, D[3]:Lng, E[4]:Poly, F[5]:Cor, G[6]:Terr, H[7]:Status, I[8]:Data
      var id = String(r[0] || "");
      if (!id) return null;

      var polyString = String(r[4] || ""); 
      var cor = String(r[5] || "#3388ff");
      var terr = String(r[6] || "");

      var dataFormatada = "";
      try {
        if (r[8]) {
           var d = new Date(r[8]);
           if(!isNaN(d.getTime())) dataFormatada = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
        }
      } catch(e) {}

      var centroFormatado = "";
      if (r[2] && r[3]) {
         centroFormatado = String(r[2]).replace(',', '.') + "," + String(r[3]).replace(',', '.');
      }

      return {
        id: id,
        polyString: polyString, 
        territory: terr,
        color: cor,
        area: r[1],
        centro: centroFormatado,
        dataConclusao: dataFormatada, 
        status: String(r[7] || "Pendente") 
      };
    }).filter(function(i){ return i !== null && i.polyString.length > 5; });
  } catch (err) { return []; }
}

// =================================================================
// 3. LEITURA: TERRITÓRIOS
// =================================================================
function getDadosTerritorios() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Territorios");
    if (!sheet) sheet = ss.getSheetByName("Territórios");
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    const rows = data.slice(1);
    return rows.map(function(r) {
      return {
        name: String(r[0] || ""),
        color: String(r[1] || "#3388ff"),
        quadras: String(r[2] || ""),
        polyString: String(r[3] || ""),
        labelPos: String(r[4] || ""),
        labelType: String(r[5] || 'visible') // visible ou optional
      };
    });
  } catch (e) { return []; }
}
function getListaQuadras() { return getPoligonosQuadras().map(function(d) { return d.id; }).sort(); }

// =================================================================
// 4. LEITURA: DADOS BRUTOS (Faces e Detalhes)
// =================================================================
function getDadosFaces() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Dados Brutos"); 
  if(!sheet) return { residencial: [], comercial: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { residencial: [], comercial: [] };

  const rows = data.slice(1);
  const facesRes = {};
  const facesCom = {};

  const tiposResidenciais = [ "Domicílio particular Apartamento", "Domicílio particular Casa", "Domicílio particular Casa de vila ou em condomínio", "Domicílio particular", "Domicílio coletivo" ];

  rows.forEach(function(row, index) {
    if (!row[9] || !row[10]) return; 
    
    var setor = row[1] || "";
    var numQuadra = row[2] || ""; // IBGE Quadra
    var numFace = row[3] || "";
    
    var lat = parseFloat(String(row[9]).replace(',', '.'));
    var lng = parseFloat(String(row[10]).replace(',', '.'));
    var tipo = String(row[11] || "").trim();
    
    if (isNaN(lat) || isNaN(lng)) return;

    var faceKey = setor + "_" + numQuadra + "_" + numFace;
    var isResidencial = tiposResidenciais.includes(tipo);
    var targetObj = isResidencial ? facesRes : facesCom;

    if (!targetObj[faceKey]) {
      // AJUSTE SOLICITADO: Rótulo com Quadra e Face
      var labelFull = (numQuadra ? "Q"+numQuadra+"-" : "") + "F" + numFace;
      targetObj[faceKey] = {
        key: faceKey,
        label: labelFull, 
        latSum: 0, lngSum: 0, count: 0, ids: []
      };
    }
    targetObj[faceKey].latSum += lat;
    targetObj[faceKey].lngSum += lng;
    targetObj[faceKey].count++;
    targetObj[faceKey].ids.push(index + 2);
  });

  var formatar = function(obj) {
    return Object.values(obj).map(function(f) {
      return { key: f.key, label: f.label, lat: f.latSum / f.count, lng: f.lngSum / f.count, total: f.count, rows: f.ids };
    });
  };

  return { residencial: formatar(facesRes), comercial: formatar(facesCom) };
}

function getDadosDaQuadra(idQuadra) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Dados Brutos");
  if(!sheet) return [];
  const data = sheet.getDataRange().getValues();
  // Filtra pelo ID da Quadra na Coluna A (Index 0)
  return data.filter(function(r) { return String(r[0]) === String(idQuadra); }).map(function(r) {
    // Trata Lat/Lng para evitar erros de soma no frontend
    var l = parseFloat(String(r[9]).replace(',','.'));
    var g = parseFloat(String(r[10]).replace(',','.'));
    return {
      logradouro: r[5], numero: r[6], desc: r[7], complemento: r[8], tipo: r[11], nota: r[13], naoVisitar: r[16],
      lat: isNaN(l) ? 0 : l, 
      lng: isNaN(g) ? 0 : g
    };
  });
}

// =================================================================
// 5. ESCRITA
// =================================================================
function salvarAssociacaoFaces(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Dados Brutos");
  if(!sheet) return "Erro DB";
  dados.linhas.forEach(function(r) { sheet.getRange(r, 1).setValue(dados.quadraId); });
  return "Associado!";
}

function salvarConclusaoQuadras(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQ = ss.getSheetByName("Quadras");
  var sheetReg = ss.getSheetByName("Registros");
  if(!sheetReg) { sheetReg = ss.insertSheet("Registros"); sheetReg.appendRow(["ID", "Data", "Tipo", "TS"]); }
  
  const dataQ = sheetQ.getDataRange().getValues();
  const mapIndex = {};
  for(let i=1; i<dataQ.length; i++) { mapIndex[String(dataQ[i][0])] = i + 1; }

  if(payload.modo === "auto") {
      var conflitos = [];
      var novaData = new Date(payload.data + "T00:00:00");
      payload.ids.forEach(function(id) {
         var idx = mapIndex[id];
         if(idx && dataQ[idx-1][8]) {
            if(novaData < new Date(dataQ[idx-1][8])) conflitos.push(id);
         }
      });
      if(conflitos.length > 0) return {status: "CONFLITO", ids: conflitos};
  }

  payload.ids.forEach(function(id){
      var row = mapIndex[id];
      if(row) {
          if(payload.modo !== "apenas_historico") {
              sheetQ.getRange(row, 8).setValue("Concluído");
              sheetQ.getRange(row, 9).setValue(payload.data);
              var nmTerr = dataQ[row-1][6];
              if(nmTerr) verificarStatusTerritorio(nmTerr, payload.data);
          }
          sheetReg.appendRow([id, payload.data, payload.modo, new Date()]);
      }
  });
  return {status: "SUCESSO"};
}

function verificarStatusTerritorio(nomeTerr, dataRef) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQ = ss.getSheetByName("Quadras");
  var sheetT = ss.getSheetByName("Territorios"); if(!sheetT) sheetT = ss.getSheetByName("Territórios");
  if(!sheetT) return;

  const dadosQ = sheetQ.getDataRange().getValues();
  let total = 0; let concluidas = 0;

  for(let i=1; i<dadosQ.length; i++) {
    if(String(dadosQ[i][6]) === nomeTerr) {
      total++;
      if(String(dadosQ[i][7]).toLowerCase() === "concluído" || String(dadosQ[i][7]).toLowerCase() === "concluido") concluidas++;
    }
  }

  if (total > 0 && total === concluidas) {
    const dadosT = sheetT.getDataRange().getValues();
    for(let j=1; j<dadosT.length; j++) {
      if(String(dadosT[j][0]) === nomeTerr) {
        sheetT.getRange(j+1, 7).setValue("Concluído");
        sheetT.getRange(j+1, 8).setValue(dataRef);
        break;
      }
    }
  }
}

function salvarEdicaoQuadra(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const data = sheet.getDataRange().getValues();
  let row = -1;
  for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(dados.idOriginal)) { row = i+1; break; }}
  
  if(row !== -1) {
     sheet.getRange(row, 1).setValue(dados.idNovo);
     sheet.getRange(row, 5).setValue(dados.polyString);
     sheet.getRange(row, 6).setValue(dados.color);
     sheet.getRange(row, 7).setValue(dados.territory);
  } else {
     sheet.appendRow([dados.idNovo, 0, "", "", dados.polyString, dados.color, dados.territory]);
  }
  return "Salvo";
}

function salvarLoteTerritorios(updates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetT = ss.getSheetByName("Territorios"); if(!sheetT) sheetT = ss.getSheetByName("Territórios");
  const sheetQ = ss.getSheetByName("Quadras");
  
  updates.forEach(function(up) {
    let row = -1;
    const dataT = sheetT.getDataRange().getValues();
    const busca = up.originalName || up.name;
    for(let i=1; i<dataT.length; i++) { if(dataT[i][0] === busca) { row = i+1; break; }}
    
    const vals = [up.name, up.color, up.idsQuadras.join(','), up.polyString, up.labelPos||"", up.labelType||"visible"];
    if(row === -1) sheetT.appendRow(vals); 
    else sheetT.getRange(row, 1, 1, 6).setValues([vals]);

    const dataQ = sheetQ.getDataRange().getValues();
    for(let i=1; i<dataQ.length; i++) {
       const qId = String(dataQ[i][0]);
       if(up.idsQuadras.includes(qId)) {
          sheetQ.getRange(i+1, 7).setValue(up.name);
          sheetQ.getRange(i+1, 6).setValue(up.color);
       }
    }
  });
  return "Atualizado";
}

function processarGeometriaEmLote(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const data = sheet.getDataRange().getValues();
  for(let i=data.length-1; i>=1; i--) { 
    if(dados.toRemove.includes(String(data[i][0]))) sheet.deleteRow(i+1); 
  }
  dados.toAdd.forEach(function(n) { sheet.appendRow([n.id, 0, "", "", n.polyString, "#3388ff", ""]); });
  return "Processado";
}

function excluirQuadra(id) {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
   const sheet = ss.getSheetByName("Quadras");
   const data = sheet.getDataRange().getValues();
   for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(id)) { sheet.deleteRow(i+1); return "Excluída"; }}
   return "Não encontrada";
}
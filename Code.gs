// =================================================================
// 1. INICIALIZAÇÃO E ROTAS
// =================================================================
function doGet(e) {
  if (e.parameter.v === 'publico') {
    var tmpl = HtmlService.createTemplateFromFile('Publico');
    tmpl.ids = e.parameter.ids || ""; 
    return tmpl.evaluate().setTitle('Território Digital').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Gestão de Territórios').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}
function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }
function getScriptUrl() { return ScriptApp.getService().getUrl(); }

// =================================================================
// 2. LEITURA DE DADOS (ROBUSTA)
// =================================================================
function getPoligonosQuadras() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  // Pega valores brutos e trata erros
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  
  return data.map(r => {
    var id = String(r[0]);
    if (!id || id === "") return null;
    
    var poly = String(r[4] || "");
    if (poly.length < 5) return null; // Sem polígono não serve

    // Tratamento de data seguro
    var dataF = "";
    if (r[8] && r[8] instanceof Date) {
       try { dataF = Utilities.formatDate(r[8], Session.getScriptTimeZone(), "yyyy-MM-dd"); } catch(e){}
    }

    return {
      id: id,
      polyString: poly,
      territory: String(r[6] || ""),
      color: String(r[5] || "#3388ff"),
      dataConclusao: dataF,
      status: String(r[7] || "Pendente")
    };
  }).filter(x => x !== null);
}

function getDadosTerritorios() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetT = ss.getSheetByName("Territorios") || ss.getSheetByName("Territórios");
    const sheetQ = ss.getSheetByName("Quadras");
    
    if (!sheetT || !sheetQ) return [];

    const dataT = sheetT.getDataRange().getValues();
    const dataQ = sheetQ.getDataRange().getValues();
    
    // Cria um Set com todos os IDs de quadras que realmente existem hoje
    const quadrasExistentes = new Set(dataQ.slice(1).map(r => String(r[0]).trim()));

    return dataT.slice(1).map(r => {
      if (!r[0]) return null;
      
      // Limpa a lista de IDs: remove IDs que não existem mais na aba Quadras
      let idsValidos = String(r[2] || "").split(',')
        .map(id => id.trim())
        .filter(id => id !== "" && quadrasExistentes.has(id));

      return {
        name: String(r[0]),
        color: String(r[1] || "#3388ff"),
        idsQuadras: idsValidos, // Retorna apenas o que é real
        polyString: String(r[3] || ""),
        labelPos: String(r[4] || ""),
        labelType: String(r[5] || 'visible')
      };
    }).filter(x => x !== null);
  } catch (e) { 
    console.error("Erro ao carregar territórios: " + e);
    return []; 
  }
}

function getDadosFaces() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Dados Brutos");
  if (!sheet) return { residencial: [], comercial: [] };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { residencial: [], comercial: [] };
  
  // Pega valores e garante que as linhas vazias não parem a leitura
  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  const facesRes = {};
  const facesCom = {};
  
  const tiposResidenciais = [
    "Domicílio particular Apartamento", 
    "Domicílio particular Casa", 
    "Domicílio particular Casa de vila ou em condomínio", 
    "Domicílio particular", 
    "Domicílio coletivo"
  ];

  function parseCoord(val) {
    if (typeof val === 'number') return val;
    if (!val) return null;
    let s = String(val).replace(',', '.').trim();
    if (s === "") return null;
    let n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    // Validação de Coordenada
    let lat = parseCoord(row[9]);
    let lng = parseCoord(row[10]);
    if (lat === null || lng === null || lat === 0 || lng === 0) continue;

    let idQuadraVinculada = String(row[0] || "").trim();
    let setor = String(row[1] || "0").trim();
    let numQuadra = String(row[2] || "S/Q").trim();
    let numFace = String(row[3] || "S/F").trim();
    let tipo = String(row[11] || "").trim();
    
    let isRes = tiposResidenciais.includes(tipo);
    
    // --- CORREÇÃO DA CHAVE ÚNICA ---
    // Adicionamos o sufixo _RES ou _COM para diferenciar tipos na mesma face
    let sufixo = isRes ? "_RES" : "_COM";
    let key = setor + "_" + numQuadra + "_" + numFace + sufixo;
    // -------------------------------

    let targetObj = isRes ? facesRes : facesCom;

    if (!targetObj[key]) {
      targetObj[key] = {
        key: key,
        label: setor +"-Q" + numQuadra + "-F" + numFace, // O rótulo visual pode ser igual
        latSum: 0,
        lngSum: 0,
        count: 0,
        ids: [], // ARRAY QUE GUARDA TODAS AS LINHAS
        isAssigned: (idQuadraVinculada !== "") 
      };
    }

    targetObj[key].latSum += lat;
    targetObj[key].lngSum += lng;
    targetObj[key].count++;
    
    // Guarda o índice real da linha (i + 2 porque começou na linha 2)
    targetObj[key].ids.push(i + 2); 
  }

  const formatar = (obj) => {
    return Object.values(obj).map(f => ({
      key: f.key,
      label: f.label,
      lat: f.latSum / f.count,
      lng: f.lngSum / f.count,
      total: f.count,
      isAssigned: f.isAssigned,
      rows: f.ids // Envia o array completo de linhas para o frontend
    }));
  };

  return {
    residencial: formatar(facesRes),
    comercial: formatar(facesCom)
  };
}

// =================================================================
// 3. SALVAMENTO E EDIÇÃO
// =================================================================
function salvarLoteTerritorios(updates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetT = ss.getSheetByName("Territorios"); if(!sheetT) sheetT = ss.getSheetByName("Territórios");
  const sheetQ = ss.getSheetByName("Quadras");
  
  if(!sheetT) return "Erro: Aba Territorios não encontrada";

  const dataT = sheetT.getDataRange().getValues();
  const dataQ = sheetQ.getDataRange().getValues();

  updates.forEach(up => {
    let rowT = -1;
    // IMPORTANTE: Busca pelo nome ORIGINAL para editar, não pelo novo
    let busca = String(up.originalName).trim(); 

    // 1. Localiza a linha do território existente
    for(let i=1; i<dataT.length; i++) {
      if(String(dataT[i][0]).trim() === busca) { rowT = i+1; break; }
    }

    // Dados para salvar: [Nome, Cor, IDs, Poly, LabelPos, LabelType]
    // Se IDs vier vazio (edição simples), tentamos manter o que já existia na planilha se não for informado
    let currentIds = (rowT > -1) ? String(dataT[rowT-1][2]) : "";
    let idsParaSalvar = (up.idsQuadras && up.idsQuadras.length > 0) ? up.idsQuadras.join(',') : currentIds;
    
    // Se o usuário limpou todas as quadras intencionalmente, o front deve mandar um array vazio explicito?
    // Vamos assumir: se up.idsQuadras é null/undefined, mantém. Se é array (mesmo vazio), usa ele.
    if(up.idsQuadras !== undefined) idsParaSalvar = up.idsQuadras.join(',');

    const newRow = [up.name, up.color, idsParaSalvar, up.polyString, up.labelPos, up.labelType];

    if(rowT > 0) {
      sheetT.getRange(rowT, 1, 1, 6).setValues([newRow]);
    } else {
      sheetT.appendRow(newRow);
    }

    // 2. Sincronizar Quadras (CRÍTICO: Renomear e Atualizar Vínculos)
    // Se mudou de nome (busca != up.name), atualiza as quadras antigas primeiro
    if(rowT > 0 && busca !== String(up.name).trim()) {
        for(let i=1; i<dataQ.length; i++) {
            if(String(dataQ[i][6]).trim() === busca) {
                sheetQ.getRange(i+1, 7).setValue(up.name);
            }
        }
    }

    // 3. Aplicar lista de IDs (Adicionar/Remover explícito)
    if(up.idsQuadras && up.idsQuadras.length > 0) {
      for(let i=1; i<dataQ.length; i++) {
        let qId = String(dataQ[i][0]);
        // Se está na lista, aplica o NOVO nome e NOVA cor
        if(up.idsQuadras.includes(qId)) {
          sheetQ.getRange(i+1, 7).setValue(up.name);
          sheetQ.getRange(i+1, 6).setValue(up.color);
        } 
        // Se a quadra tinha o nome NOVO ou ANTIGO, mas não está na lista atual, remove o vínculo
        else {
           let terrAtual = String(dataQ[i][6]).trim();
           if((terrAtual === busca || terrAtual === String(up.name).trim()) && !up.idsQuadras.includes(qId)) {
               sheetQ.getRange(i+1, 7).setValue("");
           }
        }
      }
    }
  });
  return "Atualizado";
}

function salvarNovaQuadraDividida(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const data = sheet.getDataRange().getValues();
  
  let rowA = -1;
  // Localiza Quadra A
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(dados.idA)) { rowA = i+1; break; }
  }
  
  if(rowA === -1) return "Erro: Quadra original não encontrada.";

  // Atualiza A
  sheet.getRange(rowA, 5).setValue(dados.polyA);
  
  // Pega atributos para clonar na B
  var cor = sheet.getRange(rowA, 6).getValue();
  var terr = sheet.getRange(rowA, 7).getValue();
  
  // Cria B
  sheet.appendRow([dados.idB, 0, "", "", dados.polyB, cor, terr, "Pendente", ""]);
  
  return "Divisão Concluída";
}

function salvarEdicaoQuadra(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const data = sheet.getDataRange().getValues();
  
  let row = -1;
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(dados.idOriginal)) { row = i+1; break; }
  }
  
  if(row !== -1) {
    sheet.getRange(row, 1).setValue(dados.idNovo);
    sheet.getRange(row, 5).setValue(dados.polyString);
    sheet.getRange(row, 6).setValue(dados.color);
    sheet.getRange(row, 7).setValue(dados.territory);
  } else {
    // Se não achou (ex: id mudou e não achou original), cria nova
    sheet.appendRow([dados.idNovo, 0, "", "", dados.polyString, dados.color, dados.territory]);
  }
  return "Salvo";
}

function excluirQuadra(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const data = sheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(id)) {
      sheet.deleteRow(i+1);
      return "Excluída";
    }
  }
  return "Não encontrada";
}

function salvarJuncaoQuadras(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const data = sheet.getDataRange().getValues();

  // 1. Remove as linhas das quadras antigas
  // Loop reverso para deletar sem bagunçar os índices
  for (let i = data.length - 1; i >= 1; i--) {
    let idRow = String(data[i][0]);
    if (dados.idsRemover.includes(idRow)) {
      sheet.deleteRow(i + 1);
    }
  }

  // 2. Adiciona a nova quadra unificada
  // Ordem: [ID, 0, "", "", PolyString, Cor, Territorio, Status, Data]
  sheet.appendRow([
    dados.novoId,
    0, 
    "", 
    "", 
    dados.polyString,
    dados.cor,
    dados.territorio,
    "Pendente",
    ""
  ]);

  return "Sucesso";
}

function excluirTerritorio(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetT = ss.getSheetByName("Territorios"); if(!sheetT) sheetT = ss.getSheetByName("Territórios");
  const sheetQ = ss.getSheetByName("Quadras");
  
  // Remove T
  const dataT = sheetT.getDataRange().getValues();
  for(let i=1; i<dataT.length; i++) {
    if(String(dataT[i][0]) === nome) {
      sheetT.deleteRow(i+1);
      break;
    }
  }
  
  // Limpa Q
  const dataQ = sheetQ.getDataRange().getValues();
  for(let i=1; i<dataQ.length; i++) {
    if(String(dataQ[i][6]) === nome) {
      sheetQ.getRange(i+1, 7).setValue("");
    }
  }
  return "Excluído";
}

// =================================================================
// 4. FUNÇÕES PÚBLICAS E REGISTRO
// =================================================================
function getDadosPublicos(idsString) {
  // Mesma lógica robusta do anterior
  if(!idsString) return { quadras: [], enderecos: [] };
  var ids = idsString.split(",");
  var qAll = getPoligonosQuadras();
  var qFilt = qAll.filter(q => ids.includes(q.id));
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Dados Brutos");
  var end = [];
  
  if(sheet && sheet.getLastRow() >= 2) {
    const data = sheet.getRange(2, 1, sheet.getLastRow()-1, sheet.getLastColumn()).getValues();
    data.forEach((r, i) => {
      if(ids.includes(String(r[0]))) {
         end.push({
           row: i+2, quadra: r[0], logradouro: r[5], numero: r[6], descNum: r[7], complemento: r[8],
           lat: r[9], lng: r[10], tipo: r[11], nome: r[12], nota: r[13], naoVisitar: r[14], ordem: r[17]
         });
      }
    });
  }
  
  // Ordenação Simples
  end.sort((a,b) => {
     if(a.ordem && !b.ordem) return -1;
     if(!a.ordem && b.ordem) return 1;
     if(a.ordem && b.ordem) return a.ordem - b.ordem;
     return String(a.logradouro).localeCompare(String(b.logradouro));
  });

  return { quadras: qFilt, enderecos: end };
}

function salvarEndereco(d){
  const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  s.getRange(d.row,13).setValue(d.nome);
  s.getRange(d.row,14).setValue(d.nota);
  s.getRange(d.row,15).setValue(d.naoVisitar);
  s.getRange(d.row,12).setValue(d.tipo);
  return "Salvo";
}

function salvarNotaEmMassa(d){
  const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  // Otimização: ler apenas colunas chave
  const data = s.getDataRange().getValues();
  const alvo = data[d.row-1];
  const q=alvo[0], l=alvo[5], n=alvo[6];
  
  for(let i=1; i<data.length; i++) {
    if(data[i][0]==q && data[i][5]==l && data[i][6]==n) {
      s.getRange(i+1, 14).setValue(d.nota);
    }
  }
  return "Notas Atualizadas";
}

function salvarConclusaoQuadras(payload) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const sheetQ=ss.getSheetByName("Quadras");
  var sheetReg=ss.getSheetByName("Registros");
  if(!sheetReg){sheetReg=ss.insertSheet("Registros");sheetReg.appendRow(["ID","Data","Tipo","TS"]);}
  
  const dataQ=sheetQ.getDataRange().getValues();
  const mapIndex={};
  for(let i=1;i<dataQ.length;i++) mapIndex[String(dataQ[i][0])] = i+1;

  // Verificação de Conflito de Data
  if(payload.modo==="auto"){
     var conflitos=[];
     var novaData=new Date(payload.data+"T00:00:00");
     payload.ids.forEach(id => {
       var idx = mapIndex[id];
       if(idx && dataQ[idx-1][8]) {
          var dtAntiga = new Date(dataQ[idx-1][8]);
          if(novaData < dtAntiga) conflitos.push(id);
       }
     });
     if(conflitos.length>0) return {status: "CONFLITO", ids: conflitos};
  }

  payload.ids.forEach(id => {
     var row = mapIndex[id];
     if(row) {
        if(payload.modo !== "apenas_historico") {
           sheetQ.getRange(row, 8).setValue("Concluído");
           sheetQ.getRange(row, 9).setValue(payload.data);
           // Atualiza Território se necessário
           var nmTerr = dataQ[row-1][6];
           if(nmTerr) verificarStatusTerritorio(nmTerr, payload.data);
        }
        sheetReg.appendRow([id, payload.data, payload.modo, new Date()]);
     }
  });
  return {status: "SUCESSO"};
}

function verificarStatusTerritorio(nome, dataRef) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheetT = ss.getSheetByName("Territorios") || ss.getSheetByName("Territórios");
  const sheetQ = ss.getSheetByName("Quadras");
  if(!sheetT) return;
  
  const dataQ = sheetQ.getDataRange().getValues();
  let total=0, concluidas=0;
  
  for(let i=1; i<dataQ.length; i++) {
     if(String(dataQ[i][6]) === nome) {
        total++;
        if(String(dataQ[i][7]).toLowerCase().includes("conclu")) concluidas++;
     }
  }
  
  if(total > 0 && total === concluidas) {
     const dataT = sheetT.getDataRange().getValues();
     for(let j=1; j<dataT.length; j++) {
        if(String(dataT[j][0]) === nome) {
           sheetT.getRange(j+1, 7).setValue("Concluído");
           sheetT.getRange(j+1, 8).setValue(dataRef);
           break;
        }
     }
  }
}

function salvarAssociacaoFaces(d) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  
  // d.linhas deve ser um array de números [2, 3, 4, 10, 11...]
  // Vamos escrever um por um. Em grandes volumes pode ser lento, mas é seguro.
  
  d.linhas.forEach(linha => {
     // Coluna 1 (A) é o ID da Quadra
     sheet.getRange(linha, 1).setValue(d.quadraId);
  });
  
  return "Vinculado com sucesso!";
}
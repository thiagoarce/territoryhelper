// =================================================================
// 1. INICIALIZAÇÃO E ROTAS
// =================================================================
function doGet(e) {
  var view = (e && e.parameter && e.parameter.v) ? e.parameter.v : '';
  var viewport = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

  if (view === 'publico') {
    var tmplP = HtmlService.createTemplateFromFile('Publico');
    tmplP.ids = e.parameter.ids || "";
    return tmplP.evaluate().setTitle('Território Digital').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', viewport);
  }

  if (view === 'dirigente') {
    var tmplD = HtmlService.createTemplateFromFile('Dirigente');
    tmplD.ids = e.parameter.ids || "";
    return tmplD.evaluate().setTitle('Dirigente — Território').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', viewport);
  }

  if (view === 'campanha') {
    var tmplC = HtmlService.createTemplateFromFile('CampanhaPublica');
    return tmplC.evaluate().setTitle('Campanha — Progresso').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', viewport);
  }

  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Gestão de Territórios').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', viewport);
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
      try { dataF = Utilities.formatDate(r[8], Session.getScriptTimeZone(), "yyyy-MM-dd"); } catch (e) { }
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

// Função inteligente: Salva a data OU Limpa a célula
function gerenciarVisitaEndereco(row, status) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  // Coluna 19 é a Coluna S (Data da Última Visita)

  if (status === true) {
    // Se marcou: Salva a data de hoje
    sheet.getRange(row, 19).setValue(new Date());
  } else {
    // Se desmarcou: pega a anterior
    var anterior = sheet.getRange(row, 20).getValue()
    sheet.getRange(row, 19).setValue(anterior);
  }
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
        label: setor + "-Q" + numQuadra + "-F" + numFace, // O rótulo visual pode ser igual
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
  let sheetT = ss.getSheetByName("Territorios"); if (!sheetT) sheetT = ss.getSheetByName("Territórios");
  const sheetQ = ss.getSheetByName("Quadras");

  if (!sheetT) return "Erro: Aba Territorios não encontrada";

  const dataT = sheetT.getDataRange().getValues();
  const dataQ = sheetQ.getDataRange().getValues();

  updates.forEach(up => {
    let rowT = -1;
    // IMPORTANTE: Busca pelo nome ORIGINAL para editar, não pelo novo
    let busca = String(up.originalName).trim();

    // 1. Localiza a linha do território existente
    for (let i = 1; i < dataT.length; i++) {
      if (String(dataT[i][0]).trim() === busca) { rowT = i + 1; break; }
    }

    // Dados para salvar: [Nome, Cor, IDs, Poly, LabelPos, LabelType]
    // Se IDs vier vazio (edição simples), tentamos manter o que já existia na planilha se não for informado
    let currentIds = (rowT > -1) ? String(dataT[rowT - 1][2]) : "";
    let idsParaSalvar = (up.idsQuadras && up.idsQuadras.length > 0) ? up.idsQuadras.join(',') : currentIds;

    // Se o usuário limpou todas as quadras intencionalmente, o front deve mandar um array vazio explicito?
    // Vamos assumir: se up.idsQuadras é null/undefined, mantém. Se é array (mesmo vazio), usa ele.
    if (up.idsQuadras !== undefined) idsParaSalvar = up.idsQuadras.join(',');

    const newRow = [up.name, up.color, idsParaSalvar, up.polyString, up.labelPos, up.labelType];

    if (rowT > 0) {
      sheetT.getRange(rowT, 1, 1, 6).setValues([newRow]);
    } else {
      sheetT.appendRow(newRow);
    }
    _invalidar();

    // 2. Sincronizar Quadras (CRÍTICO: Renomear e Atualizar Vínculos)
    // Se mudou de nome (busca != up.name), atualiza as quadras antigas primeiro
    if (rowT > 0 && busca !== String(up.name).trim()) {
      for (let i = 1; i < dataQ.length; i++) {
        if (String(dataQ[i][6]).trim() === busca) {
          sheetQ.getRange(i + 1, 7).setValue(up.name);
        }
      }
    }

    // 3. Aplicar lista de IDs (Adicionar/Remover explícito)
    if (up.idsQuadras && up.idsQuadras.length > 0) {
      for (let i = 1; i < dataQ.length; i++) {
        let qId = String(dataQ[i][0]);
        // Se está na lista, aplica o NOVO nome e NOVA cor
        if (up.idsQuadras.includes(qId)) {
          sheetQ.getRange(i + 1, 7).setValue(up.name);
          sheetQ.getRange(i + 1, 6).setValue(up.color);
        }
        // Se a quadra tinha o nome NOVO ou ANTIGO, mas não está na lista atual, remove o vínculo
        else {
          let terrAtual = String(dataQ[i][6]).trim();
          if ((terrAtual === busca || terrAtual === String(up.name).trim()) && !up.idsQuadras.includes(qId)) {
            sheetQ.getRange(i + 1, 7).setValue("");
          }
        }
      }
    }
  });
  return "Atualizado";
}

function salvarInicioQuadras(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQ = ss.getSheetByName("Quadras");
  let sheetReg = ss.getSheetByName("Registros");

  if (!sheetReg) { sheetReg = ss.insertSheet("Registros"); sheetReg.appendRow(["ID", "Data", "Tipo", "Timestamp"]); }

  const data = sheetQ.getDataRange().getValues();
  const idsParaSalvar = e.ids;

  // Converte a string recebida de volta para Data, ou usa new Date() se falhar
  const dataEvento = e.data ? new Date(e.data) : new Date();
  const timestamp = new Date(); // Data exata do registro

  for (let i = 1; i < data.length; i++) {
    let idAtual = String(data[i][0]);

    if (idsParaSalvar.indexOf(idAtual) > -1) {
      // Atualiza Status (Col H)
      sheetQ.getRange(i + 1, 8).setValue("Iniciado");

      // Histórico
      sheetReg.appendRow([idAtual, dataEvento, "Iniciado", timestamp]);
    }
  }
  _invalidar();
  return { status: "SUCESSO" };
}

function salvarNovaQuadraDividida(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const data = sheet.getDataRange().getValues();

  let rowA = -1;
  // Localiza Quadra A
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(dados.idA)) { rowA = i + 1; break; }
  }

  if (rowA === -1) return "Erro: Quadra original não encontrada.";

  // Atualiza A
  sheet.getRange(rowA, 5).setValue(dados.polyA);

  // Pega atributos para clonar na B
  var cor = sheet.getRange(rowA, 6).getValue();
  var terr = sheet.getRange(rowA, 7).getValue();

  // Cria B
  sheet.appendRow([dados.idB, 0, "", "", dados.polyB, cor, terr, "Pendente", ""]);
  _invalidar();
  return "Divisão Concluída";
}

function salvarEdicaoQuadra(dados) {
  return withLock_(function() {
    if (!dados) throw new Error("Dados ausentes.");
    var vId = validarId_(dados.idNovo); if (!vId.ok) throw new Error(vId.msg);
    var vPoly = validarPolyString_(dados.polyString); if (!vPoly.ok) throw new Error(vPoly.msg);
    var cor = validarCor_(dados.color);

    var sheet = getSheetByName_(SHEET.QUADRAS);
    if (!sheet) throw new Error("Aba Quadras não encontrada.");
    var data = sheet.getDataRange().getValues();
    var row = acharLinhaQuadra_(data, dados.idOriginal);

    if (row !== -1) {
      sheet.getRange(row, COL.QUADRAS.ID_1IDX).setValue(sanitizar_(dados.idNovo));
      sheet.getRange(row, COL.QUADRAS.POLYSTRING_1IDX).setValue(dados.polyString);
      sheet.getRange(row, COL.QUADRAS.COLOR_1IDX).setValue(cor);
      sheet.getRange(row, COL.QUADRAS.TERRITORIO_1IDX).setValue(sanitizar_(dados.territory));
    } else {
      sheet.appendRow([sanitizar_(dados.idNovo), 0, "", "", dados.polyString, cor, sanitizar_(dados.territory), STATUS.PENDENTE, ""]);
    }
    _invalidar();
    return "Salvo";
  });
}

function excluirQuadra(id) {
  return withLock_(function() {
    if (!id) throw new Error("ID ausente.");
    var sheet = getSheetByName_(SHEET.QUADRAS);
    if (!sheet) throw new Error("Aba Quadras não encontrada.");
    var data = sheet.getDataRange().getValues();
    var row = acharLinhaQuadra_(data, id);
    if (row === -1) return "Não encontrada";
    sheet.deleteRow(row);
    _invalidar();
    return "Excluída";
  });
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
  _invalidar();
  return "Sucesso";
}

function excluirTerritorio(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetT = ss.getSheetByName("Territorios"); if (!sheetT) sheetT = ss.getSheetByName("Territórios");
  const sheetQ = ss.getSheetByName("Quadras");

  // Remove T
  const dataT = sheetT.getDataRange().getValues();
  for (let i = 1; i < dataT.length; i++) {
    if (String(dataT[i][0]) === nome) {
      sheetT.deleteRow(i + 1);
      break;
    }
  }

  // Limpa Q
  const dataQ = sheetQ.getDataRange().getValues();
  for (let i = 1; i < dataQ.length; i++) {
    if (String(dataQ[i][6]) === nome) {
      sheetQ.getRange(i + 1, 7).setValue("");
    }
  }
  _invalidar();
  return "Excluído";
}

// =================================================================
// 4. FUNÇÕES PÚBLICAS E REGISTRO
// =================================================================
function getDadosPublicos(idsString) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Dados Brutos");
  const sheetQ = ss.getSheetByName("Quadras"); // Necessário para o mapa e data

  if (!sheet || !idsString) return [];

  // 1. Prepara Mapa de Dados das Quadras (Polígono e Data)
  const mapQuadras = {};
  if (sheetQ) {
    const dataQ = sheetQ.getDataRange().getValues();
    // Pula cabeçalho
    for (let i = 1; i < dataQ.length; i++) {
      let id = String(dataQ[i][0]).trim();
      mapQuadras[id] = {
        polyString: dataQ[i][4],       // Col E: Polígono
        ultimaData: dataQ[i][8]        // Col I: Data Conclusão
      };
    }
  }

  // 2. Busca Endereços
  const idsDesejados = idsString.split(',').map(s => s.trim());
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  let resultado = [];

  idsDesejados.forEach(id => {
    let qInfo = mapQuadras[id] || { polyString: "", ultimaData: "" };

    // Filtra endereços desta quadra
    let itensQuadra = data
      .map((r, i) => ({
        row: i + 2,
        quadra: String(r[0]),
        face: String(r[2]),       // Col C
        logradouro: String(r[5]), // Col F
        numero: String(r[6]),     // Col G
        complemento: String(r[8]),// Col I
        lat: r[9],                // Col J (Necessário para os pontinhos no mapa)
        lng: r[10],               // Col K
        tipo: String(r[11]),      // Col L
        nome: String(r[12]),      // Col M
        nota: String(r[13]),      // Col N
        naoVisitar: String(r[14]) === "true" || r[14] === true, // Col O
        ordem: r[17],             // Col R
        // NOVO: Coluna 19 (S) - Índice 18
        ultimaVisita: r[18] ? Utilities.formatDate(new Date(r[18]), "GMT-3", "dd/MM/yy") : ""
      }))
      .filter(item => item.quadra.toUpperCase().trim() === id.toUpperCase().trim());

    // Ordenação
    itensQuadra.sort((a, b) => {
      if (a.ordem && b.ordem) return a.ordem - b.ordem;
      if (a.ordem) return -1;
      if (b.ordem) return 1;
      if (a.logradouro !== b.logradouro) return a.logradouro.localeCompare(b.logradouro);
      let numA = parseInt(String(a.numero).replace(/\D/g, '')) || 0;
      let numB = parseInt(String(b.numero).replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    if (itensQuadra.length > 0 || qInfo.polyString) {
      resultado.push({
        id: id,
        polyString: qInfo.polyString,
        ultimaData: qInfo.ultimaData ? Utilities.formatDate(new Date(qInfo.ultimaData), "GMT-3", "dd/MM/yyyy") : "Nunca",
        itens: itensQuadra
      });
    }
  });

  return resultado;
}

// Salva a data de hoje na Coluna S (19) quando o publicador marca o check
function registrarVisitaEndereco(row) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  // row é a linha da planilha. Coluna 19 é a S. 20 é o anterior. Registra o anterior e salva o novo.
  sheet.getRange(row, 20).setValue(sheet.getRange(row, 19).getValue())
  sheet.getRange(row, 19).setValue(new Date());
}

// Atualiza o status da quadra (Coluna H)
function definirStatusQuadra(id, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQ = ss.getSheetByName("Quadras");
  let sheetReg = ss.getSheetByName("Registros");

  // Garante que a aba Registros existe
  if (!sheetReg) {
    sheetReg = ss.insertSheet("Registros");
    sheetReg.appendRow(["ID", "Data", "Tipo", "Timestamp"]);
  }

  // 1. Atualiza o status atual na aba Quadras (para o mapa saber a cor)
  // Assumindo: Col A = ID, Col H = Status, Col I = Data
  const data = sheetQ.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheetQ.getRange(i + 1, 8).setValue(status); // Coluna H

      // Se for "Iniciado", registra a data de hoje na coluna de data também?
      // Geralmente sim, para saber "desde quando" está iniciado.
      sheetQ.getRange(i + 1, 9).setValue(new Date());
      break;
    }
  }

  // 2. Cria o log histórico na aba Registros
  sheetReg.appendRow([
    id,           // ID
    new Date(),   // Data
    status,       // "Iniciado" ou "Concluído"
    new Date()    // Timestamp
  ]);
  _invalidar();
  return "Quadra " + id + " marcada como " + status;
}

function definirStatusEmMassa(ids, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQ = ss.getSheetByName("Quadras");
  let sheetReg = ss.getSheetByName("Registros");

  if (!sheetReg) { sheetReg = ss.insertSheet("Registros"); sheetReg.appendRow(["ID", "Data", "Tipo", "Timestamp"]); }

  const data = sheetQ.getDataRange().getValues();
  const hoje = new Date();

  // Varre a planilha e atualiza quem estiver na lista de IDs
  for (let i = 1; i < data.length; i++) {
    let idAtual = String(data[i][0]);

    if (ids.includes(idAtual)) {
      // Atualiza Status (Col H / Index 7)
      sheetQ.getRange(i + 1, 8).setValue(status);

      // Grava no Histórico
      sheetReg.appendRow([idAtual, hoje, status, new Date()]);
    }
  }
  _invalidar();
  return "Atualizado";
}

function salvarEndereco(d) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  s.getRange(d.row, 13).setValue(d.nome);
  s.getRange(d.row, 14).setValue(d.nota);
  s.getRange(d.row, 15).setValue(d.naoVisitar);
  s.getRange(d.row, 12).setValue(d.tipo);
  return "Salvo";
}

function salvarNotaEmMassa(d) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  const data = s.getDataRange().getValues();

  // d.row é o índice visual (linha do excel), array é linha-1
  // Para segurança, usamos a chave de agrupamento (Rua + Numero) do item original
  const linhaRef = d.row - 1; // índice do array
  if (linhaRef < 0 || linhaRef >= data.length) return "Erro de referência";

  const alvoQuadra = data[linhaRef][0]; // Col A
  const alvoLog = String(data[linhaRef][5]).trim().toLowerCase(); // Col F (Logradouro)
  const alvoNum = String(data[linhaRef][6]).trim().toLowerCase(); // Col G (Numero)

  // Varre a planilha procurando irmãos do mesmo prédio
  for (let i = 1; i < data.length; i++) {
    let logAtual = String(data[i][5]).trim().toLowerCase();
    let numAtual = String(data[i][6]).trim().toLowerCase();

    if (data[i][0] == alvoQuadra && logAtual == alvoLog && numAtual == alvoNum) {
      // Atualiza Nota (Col N - índice 13)
      if (d.nota !== undefined) s.getRange(i + 1, 14).setValue(d.nota);

      // Atualiza Nome do Edifício (Col M - índice 12)
      if (d.nome !== undefined) s.getRange(i + 1, 13).setValue(d.nome);

      // Se quiser atualizar "Não Visitar" em massa também:
      if (d.naoVisitar !== undefined) s.getRange(i + 1, 15).setValue(d.naoVisitar);
    }
  }
  return "Prédio atualizado!";
}

function salvarConclusaoQuadras(payload) {
  if (!payload || !Array.isArray(payload.ids) || payload.ids.length === 0) {
    throw new Error("Sem IDs para concluir.");
  }
  var vData = validarData_(payload.data); if (!vData.ok) throw new Error(vData.msg);

  return withLock_(function() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetQ = getSheetByName_(SHEET.QUADRAS);
  if (!sheetQ) throw new Error("Aba Quadras não encontrada.");
  var sheetReg = getSheetByName_(SHEET.REGISTROS);
  if (!sheetReg) { sheetReg = ss.insertSheet(SHEET.REGISTROS); sheetReg.appendRow(["ID", "Data", "Tipo", "TS"]); }

  const dataQ = sheetQ.getDataRange().getValues();
  const mapIndex = {};
  for (let i = 1; i < dataQ.length; i++) mapIndex[String(dataQ[i][0])] = i + 1;

  // Verificação de Conflito de Data
  if (payload.modo === "auto") {
    var conflitos = [];
    var novaData = new Date(payload.data + "T00:00:00");
    payload.ids.forEach(id => {
      var idx = mapIndex[id];
      if (idx && dataQ[idx - 1][8]) {
        var dtAntiga = new Date(dataQ[idx - 1][8]);
        if (novaData < dtAntiga) conflitos.push(id);
      }
    });
    if (conflitos.length > 0) return { status: "CONFLITO", ids: conflitos };
  }

  payload.ids.forEach(id => {
    var row = mapIndex[id];
    if (row) {
      if (payload.modo !== "apenas_historico") {
        sheetQ.getRange(row, COL.QUADRAS.STATUS_1IDX).setValue(STATUS.CONCLUIDO);
        sheetQ.getRange(row, COL.QUADRAS.DATA_CONC_1IDX).setValue(payload.data);
        var nmTerr = dataQ[row - 1][COL.QUADRAS.TERRITORIO];
        if (nmTerr) verificarStatusTerritorio(nmTerr, payload.data);
      }
      sheetReg.appendRow([id, payload.data, payload.modo, new Date()]);
    }
  });
  _invalidar();
  return { status: "SUCESSO" };
  });
}

function verificarStatusTerritorio(nome, dataRef) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetT = ss.getSheetByName("Territorios") || ss.getSheetByName("Territórios");
  const sheetQ = ss.getSheetByName("Quadras");
  if (!sheetT) return;

  const dataQ = sheetQ.getDataRange().getValues();
  let total = 0, concluidas = 0;

  for (let i = 1; i < dataQ.length; i++) {
    if (String(dataQ[i][6]) === nome) {
      total++;
      if (String(dataQ[i][7]).toLowerCase().includes("conclu")) concluidas++;
    }
  }

  if (total > 0 && total === concluidas) {
    const dataT = sheetT.getDataRange().getValues();
    for (let j = 1; j < dataT.length; j++) {
      if (String(dataT[j][0]) === nome) {
        sheetT.getRange(j + 1, 7).setValue("Concluído");
        sheetT.getRange(j + 1, 8).setValue(dataRef);
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
  _invalidar();
  return "Vinculado com sucesso!";
}

// Salva a nova ordem quando você arrasta os itens no celular
function salvarOrdemEmMassa(listaOrdenada) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  listaOrdenada.forEach(function (item) {
    // Escreve na Coluna R (Coluna 18) que corresponde ao índice 17 do seu código
    sheet.getRange(item.row, 18).setValue(item.ordem);
  });
  return "Ordem atualizada!";
}

// Cria novo endereço respeitando sua estrutura de colunas
function salvarNovoEnderecoPublico(dados) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");

  var novaLinha = new Array(18).fill("");

  novaLinha[0] = dados.quadraId;  // A
  novaLinha[1] = dados.setor || "";
  novaLinha[2] = dados.face;      // C (Face herdada do vizinho)

  novaLinha[5] = dados.logradouro;// F
  novaLinha[6] = dados.numero;    // G
  novaLinha[8] = dados.complemento;// I

  // Coordenadas (IMPORTANTE PARA O MAPA)
  novaLinha[9] = dados.lat;       // J (Latitude)
  novaLinha[10] = dados.lng;      // K (Longitude)

  novaLinha[11] = dados.tipo;     // L
  novaLinha[12] = dados.nome;     // M (Nome Estabelecimento/Edificio)
  novaLinha[13] = dados.nota;     // N
  novaLinha[14] = dados.naoVisitar;// O
  novaLinha[17] = dados.ordem;    // R (Ordem calculada)

  sheet.appendRow(novaLinha);
  return "Criado";
}

/**
 * Health-check leve: rota chamável para verificar se backend está vivo
 * e se as abas críticas existem. Útil para debugging.
 */
function healthCheck() {
  var checks = {};
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    checks.spreadsheet = !!ss;
    checks.sheetQuadras = !!ss.getSheetByName(SHEET.QUADRAS);
    checks.sheetTerritorios = !!getSheetByName_(SHEET.TERRITORIOS);
    checks.sheetDados = !!ss.getSheetByName(SHEET.DADOS);
    checks.sheetRegistros = !!ss.getSheetByName(SHEET.REGISTROS);
    checks.timestamp = new Date().toISOString();
    checks.timezone = Session.getScriptTimeZone();
    checks.ok = checks.spreadsheet && checks.sheetQuadras && checks.sheetDados;
  } catch (e) {
    checks.ok = false;
    checks.error = String(e && e.message ? e.message : e);
  }
  return checks;
}

// =================================================================
// OTIMIZAÇÃO: BUSCA MESTRA COM CACHE
// =================================================================
function getDadosIniciaisMaster() {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'DADOS_MAPA_CACHE';
  var dadosEmCache = cache.get(cacheKey);

  if (dadosEmCache) {
    return JSON.parse(dadosEmCache);
  }

  var pacoteMaster = {
    territorios: getDadosTerritorios(),
    quadras: getPoligonosQuadras(),
    version: new Date().getTime()
  };

  try {
    cache.put(cacheKey, JSON.stringify(pacoteMaster), 900);
  } catch (e) { }

  return pacoteMaster;
}

function limparCacheServidor() {
  var cache = CacheService.getScriptCache();
  cache.remove('DADOS_MAPA_CACHE');
}

// Marca toda escrita: invalida o cache para que a próxima leitura puxe fresco
function _invalidar() {
  try { limparCacheServidor(); } catch (e) { }
}

// =================================================================
// DADOS PÚBLICOS DA CAMPANHA (tela motivacional)
// =================================================================
function getDadosCampanhaPublico() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetQ = ss.getSheetByName("Quadras");
  var cfg = obterConfiguracoesCampanha();

  var dataInicio = cfg.data ? new Date(cfg.data + "T00:00:00") : null;
  var dataFim = cfg.dataFim ? new Date(cfg.dataFim + "T00:00:00") : null;

  var quadras = [];
  var completas = 0, restantes = 0, completasSemana = 0;
  var hoje = new Date();
  var seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (sheetQ && sheetQ.getLastRow() > 1) {
    var data = sheetQ.getRange(2, 1, sheetQ.getLastRow() - 1, sheetQ.getLastColumn()).getValues();
    data.forEach(function (r) {
      var id = String(r[0] || "").trim();
      if (!id) return;
      var poly = String(r[4] || "");
      var color = String(r[5] || "#3388ff");
      var territory = String(r[6] || "");
      var dataConc = (r[8] instanceof Date) ? r[8] : null;
      var dataConcStr = dataConc ? Utilities.formatDate(dataConc, Session.getScriptTimeZone(), "yyyy-MM-dd") : "";

      var estado = 'restante';
      if (dataConc && dataInicio && dataConc >= dataInicio) {
        estado = 'completa'; completas++;
        if (dataConc >= seteDiasAtras) completasSemana++;
      } else {
        restantes++;
      }

      quadras.push({
        id: id,
        polyString: poly,
        color: color,
        territory: territory,
        dataConclusao: dataConcStr,
        estado: estado
      });
    });
  }

  var total = completas + restantes;
  var pct = total > 0 ? Math.round((completas / total) * 100) : 0;

  // Calcula ritmo necessário para bater a data alvo
  var ritmoNecessario = null;
  if (dataFim && total > 0 && (dataFim - hoje) > 0) {
    var diasRestantes = Math.ceil((dataFim - hoje) / (1000*60*60*24));
    var semanasRestantes = Math.max(1, diasRestantes / 7);
    ritmoNecessario = Math.ceil(restantes / semanasRestantes);
  }

  return {
    nome: cfg.nome || "Campanha",
    dataInicio: cfg.data || "",
    dataFim: cfg.dataFim || "",
    objetivo: cfg.objetivo || "",
    estrategia: cfg.estrategia || "",
    metaSemanal: cfg.metaSemanal || 0,
    totalQuadras: total,
    completas: completas,
    restantes: restantes,
    completasSemana: completasSemana,
    porcentagem: pct,
    ritmoNecessario: ritmoNecessario,
    quadras: quadras,
    geradoEm: new Date().getTime()
  };
}

// =================================================================
// DADOS DO DIRIGENTE (mesma estrutura do público + estado da quadra)
// =================================================================
function getDadosDirigente(idsString) {
  var publico = getDadosPublicos(idsString);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetQ = ss.getSheetByName("Quadras");

  var mapStatus = {};
  if (sheetQ) {
    var dataQ = sheetQ.getDataRange().getValues();
    for (var i = 1; i < dataQ.length; i++) {
      var id = String(dataQ[i][0]).trim();
      mapStatus[id] = {
        status: String(dataQ[i][7] || "Pendente"),
        territory: String(dataQ[i][6] || ""),
        color: String(dataQ[i][5] || "#3388ff")
      };
    }
  }

  publico.forEach(function (q) {
    var info = mapStatus[String(q.id).trim()] || { status: "Pendente", territory: "", color: "#3388ff" };
    q.status = info.status;
    q.territory = info.territory;
    q.color = info.color;
  });

  return publico;
}

// Quadras designadas + contexto (outras quadras "próximas") usado pra
// desenhar o território inteiro no mapa. Estratégia em camadas:
//   (1) tenta resolver por território explícito (coluna TERRITORIO da
//       Quadras ou aba Territorios.IDS_QUADRAS)
//   (2) se não achar nenhum, fallback geográfico: bounding box das
//       designadas expandido em 60%, pega todas as quadras cujo centro
//       cai dentro (até COTA_FALLBACK pra não estourar payload)
// Retorna também `territorios` (nomes únicos) pro cabeçalho do cartão.
function getDadosComContexto(idsString) {
  var COTA_FALLBACK = 80;

  var designadas = getDadosDirigente(idsString);

  var idsSet = {};
  designadas.forEach(function(q){ idsSet[String(q.id).trim()] = true; });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetQ = ss.getSheetByName(SHEET.QUADRAS);
  var dataQ = sheetQ ? sheetQ.getDataRange().getValues() : [];

  // (1a) territórios diretos da aba Quadras
  var territoriosSet = {};
  designadas.forEach(function(q){
    if (q.territory) territoriosSet[String(q.territory).trim()] = true;
  });

  // (1b) territórios via aba Territorios.IDS_QUADRAS
  var sheetT = ss.getSheetByName(SHEET.TERRITORIOS)
            || ss.getSheetByName("Territórios"); // fallback com acento
  var dataT = sheetT ? sheetT.getDataRange().getValues() : [];
  for (var i = 1; i < dataT.length; i++) {
    var nome = String(dataT[i][COL.TERRITORIOS.NOME] || "").trim();
    if (!nome) continue;
    var ids = String(dataT[i][COL.TERRITORIOS.IDS_QUADRAS] || "")
      .split(/[,;\n]/).map(function(s){ return s.trim(); }).filter(Boolean);
    for (var j = 0; j < ids.length; j++) {
      if (idsSet[ids[j]]) { territoriosSet[nome] = true; break; }
    }
  }

  // Limite de "concluída recente" — quadra concluída há ≤30 dias não
  // deve ser revisitada (regra padrão de descanso de território)
  var limite = Date.now() - 30 * 24 * 60 * 60 * 1000;

  function montarItem(linha) {
    var id = String(linha[COL.QUADRAS.ID]).trim();
    var poly = linha[COL.QUADRAS.POLYSTRING];
    if (!id || !poly) return null;
    var status = String(linha[COL.QUADRAS.STATUS] || STATUS.PENDENTE);
    var dataConc = linha[COL.QUADRAS.DATA_CONC];
    var recente = false;
    var dataConcStr = "";
    if (status === STATUS.CONCLUIDO && dataConc) {
      var t = new Date(dataConc).getTime();
      recente = !isNaN(t) && t >= limite;
      if (!isNaN(t)) {
        dataConcStr = Utilities.formatDate(new Date(dataConc), "GMT-3", "dd/MM/yyyy");
      }
    }
    return {
      id: id,
      polyString: poly,
      status: status,
      ultimaData: dataConcStr,
      concluidaRecente: recente
    };
  }

  var contexto = [];

  // (1) Caminho preferido: contexto via território identificado
  if (Object.keys(territoriosSet).length > 0) {
    // Coleta IDs que pertencem aos territórios (CSV + coluna direta)
    var idsContexto = {};
    for (var k = 1; k < dataT.length; k++) {
      var nome2 = String(dataT[k][COL.TERRITORIOS.NOME] || "").trim();
      if (!territoriosSet[nome2]) continue;
      var ids2 = String(dataT[k][COL.TERRITORIOS.IDS_QUADRAS] || "")
        .split(/[,;\n]/).map(function(s){ return s.trim(); }).filter(Boolean);
      ids2.forEach(function(id){ if (!idsSet[id]) idsContexto[id] = true; });
    }

    for (var m = 1; m < dataQ.length; m++) {
      var idM = String(dataQ[m][COL.QUADRAS.ID]).trim();
      if (!idM || idsSet[idM]) continue;
      var territ = String(dataQ[m][COL.QUADRAS.TERRITORIO] || "").trim();
      if (!idsContexto[idM] && !territoriosSet[territ]) continue;
      var item = montarItem(dataQ[m]);
      if (item) contexto.push(item);
    }
  }

  // (2) Fallback geográfico: ninguém marcou território, mas a gente
  // ainda quer dar contexto visual. Usa bounding box das designadas.
  if (contexto.length === 0) {
    var bbox = bboxDasDesignadas_(designadas);
    if (bbox) {
      // expande 60% pra cada lado pra capturar quadras vizinhas
      var dlat = (bbox.maxLat - bbox.minLat) * 0.6;
      var dlng = (bbox.maxLng - bbox.minLng) * 0.6;
      bbox.minLat -= dlat; bbox.maxLat += dlat;
      bbox.minLng -= dlng; bbox.maxLng += dlng;

      var candidatos = [];
      for (var n = 1; n < dataQ.length; n++) {
        var idN = String(dataQ[n][COL.QUADRAS.ID]).trim();
        if (!idN || idsSet[idN]) continue;
        var polyN = dataQ[n][COL.QUADRAS.POLYSTRING];
        if (!polyN) continue;
        var centro = centroPoly_(polyN);
        if (!centro) continue;
        if (centro.lat < bbox.minLat || centro.lat > bbox.maxLat) continue;
        if (centro.lng < bbox.minLng || centro.lng > bbox.maxLng) continue;
        var item2 = montarItem(dataQ[n]);
        if (item2) candidatos.push(item2);
      }

      contexto = candidatos.slice(0, COTA_FALLBACK);
    }
  }

  return {
    designadas: designadas,
    contexto: contexto,
    territorios: Object.keys(territoriosSet)
  };
}

function bboxDasDesignadas_(designadas) {
  var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  var algumPonto = false;
  designadas.forEach(function(q){
    if (!q.polyString) return;
    var pts = String(q.polyString).split('|');
    pts.forEach(function(p){
      var c = p.trim().split(',');
      var lat = parseFloat(c[0]), lng = parseFloat(c[1]);
      if (isNaN(lat) || isNaN(lng)) return;
      algumPonto = true;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });
  });
  return algumPonto ? { minLat: minLat, maxLat: maxLat, minLng: minLng, maxLng: maxLng } : null;
}

function centroPoly_(polyString) {
  var pts = String(polyString).split('|');
  var sumLat = 0, sumLng = 0, n = 0;
  for (var i = 0; i < pts.length; i++) {
    var c = pts[i].trim().split(',');
    var lat = parseFloat(c[0]), lng = parseFloat(c[1]);
    if (isNaN(lat) || isNaN(lng)) continue;
    sumLat += lat; sumLng += lng; n++;
  }
  return n > 0 ? { lat: sumLat / n, lng: sumLng / n } : null;
}

// Função restrita usada pelo dirigente — só aceita IDs que foram passados via link
function dirigenteMarcarStatus(ids, status, data) {
  if (!Array.isArray(ids) || ids.length === 0) return { status: "ERRO", msg: "Sem IDs" };
  if (status !== "Concluído" && status !== "Pendente") return { status: "ERRO", msg: "Status inválido" };

  if (status === "Concluído") {
    var dataFinal = data || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    return salvarConclusaoQuadras({ ids: ids, data: dataFinal, modo: 'auto' });
  }

  // Pendente = reabrir quadra (mantém histórico, mas status volta a "Pendente")
  return designarQuadras(ids);
}

/**
 * Retorna estatísticas agregadas para o dashboard interno da campanha.
 * - kpis: totais e percentuais
 * - porSemana: array com {label, completas} das últimas 12 semanas
 * - porTerritorio: ranking dos territórios com mais conclusões na campanha
 * - porMes: array com últimos 12 meses (label, completas) para gráfico
 */
function getDadosDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetQ = getSheetByName_(SHEET.QUADRAS);
  var sheetReg = getSheetByName_(SHEET.REGISTROS);
  var cfg = obterConfiguracoesCampanha();

  var dataInicio = cfg.data ? new Date(cfg.data + "T00:00:00") : null;

  var totalQuadras = 0, completasCampanha = 0;
  var porTerritorio = {}; // nome -> { total, completas }
  var ritmoSemana = {};   // 'YYYY-WW' -> count
  var ritmoMes = {};      // 'YYYY-MM' -> count

  function chaveSemana(d) {
    var oneJan = new Date(d.getFullYear(), 0, 1);
    var dias = Math.floor((d - oneJan) / (1000*60*60*24));
    var semana = Math.ceil((dias + oneJan.getDay() + 1) / 7);
    return d.getFullYear() + '-' + (semana < 10 ? '0' + semana : semana);
  }
  function chaveMes(d) {
    var m = d.getMonth() + 1;
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m);
  }

  if (sheetQ && sheetQ.getLastRow() > 1) {
    var dataQ = sheetQ.getRange(2, 1, sheetQ.getLastRow() - 1, sheetQ.getLastColumn()).getValues();
    dataQ.forEach(function(r) {
      var id = String(r[COL.QUADRAS.ID] || '').trim();
      if (!id) return;
      totalQuadras++;
      var terr = String(r[COL.QUADRAS.TERRITORIO] || 'Sem território');
      if (!porTerritorio[terr]) porTerritorio[terr] = { total: 0, completas: 0 };
      porTerritorio[terr].total++;

      var dataConc = (r[COL.QUADRAS.DATA_CONC] instanceof Date) ? r[COL.QUADRAS.DATA_CONC] : null;
      if (dataConc && dataInicio && dataConc >= dataInicio) {
        completasCampanha++;
        porTerritorio[terr].completas++;
      }
    });
  }

  // Ritmo semanal/mensal — busca aba Registros
  if (sheetReg && sheetReg.getLastRow() > 1) {
    var dataR = sheetReg.getRange(2, 1, sheetReg.getLastRow() - 1, sheetReg.getLastColumn()).getValues();
    dataR.forEach(function(r) {
      var tipo = String(r[2] || '').toLowerCase();
      if (tipo.indexOf('conclu') === -1 && tipo !== 'auto' && tipo !== 'apenas_historico') return;
      var d = r[1];
      if (!(d instanceof Date)) {
        if (typeof r[1] === 'string') { d = new Date(r[1].indexOf('T') > -1 ? r[1] : r[1] + 'T00:00:00'); }
        if (!d || isNaN(d.getTime())) return;
      }
      if (dataInicio && d < dataInicio) return; // só dentro da campanha

      var ks = chaveSemana(d);
      ritmoSemana[ks] = (ritmoSemana[ks] || 0) + 1;
      var km = chaveMes(d);
      ritmoMes[km] = (ritmoMes[km] || 0) + 1;
    });
  }

  // Pega últimas 12 semanas (em ordem cronológica)
  var hoje = new Date();
  var porSemana = [];
  for (var i = 11; i >= 0; i--) {
    var d = new Date(hoje.getTime() - i * 7 * 24*60*60*1000);
    var k = chaveSemana(d);
    porSemana.push({ label: 'S' + k.split('-')[1], completas: ritmoSemana[k] || 0 });
  }

  // Últimos 12 meses
  var porMes = [];
  for (var j = 11; j >= 0; j--) {
    var dm = new Date(hoje.getFullYear(), hoje.getMonth() - j, 1);
    var km2 = chaveMes(dm);
    var mes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][dm.getMonth()];
    porMes.push({ label: mes, completas: ritmoMes[km2] || 0 });
  }

  // Ranking
  var ranking = Object.keys(porTerritorio).map(function(nome) {
    var t = porTerritorio[nome];
    var pct = t.total > 0 ? Math.round((t.completas / t.total) * 100) : 0;
    return { nome: nome, total: t.total, completas: t.completas, porcentagem: pct };
  }).sort(function(a, b) { return b.porcentagem - a.porcentagem || b.completas - a.completas; });

  // Média/semana
  var ultimas4 = porSemana.slice(-4).reduce(function(s, x) { return s + x.completas; }, 0) / 4;

  return {
    kpis: {
      totalQuadras: totalQuadras,
      completasCampanha: completasCampanha,
      restantes: totalQuadras - completasCampanha,
      porcentagem: totalQuadras > 0 ? Math.round((completasCampanha / totalQuadras) * 100) : 0,
      mediaSemana4: Math.round(ultimas4 * 10) / 10
    },
    porSemana: porSemana,
    porMes: porMes,
    ranking: ranking.slice(0, 10)
  };
}

/**
 * Retorna o histórico de eventos (designação, conclusão, etc) de uma quadra,
 * ordenado do mais recente para o mais antigo. Limita a 50 eventos.
 */
function getHistoricoQuadra(id) {
  if (!id) return [];
  var sheetReg = getSheetByName_(SHEET.REGISTROS);
  if (!sheetReg || sheetReg.getLastRow() < 2) return [];

  var data = sheetReg.getRange(2, 1, sheetReg.getLastRow() - 1, sheetReg.getLastColumn()).getValues();
  var alvo = String(id).trim();
  var tz = Session.getScriptTimeZone();

  var eventos = [];
  for (var i = 0; i < data.length; i++) {
    var rowId = String(data[i][0] || '').trim();
    if (rowId !== alvo) continue;

    var dataEvt = data[i][1];
    var tipo = String(data[i][2] || '');
    var ts = data[i][3];

    eventos.push({
      data: (dataEvt instanceof Date) ? Utilities.formatDate(dataEvt, tz, "yyyy-MM-dd") : String(dataEvt),
      tipo: tipo,
      timestamp: (ts instanceof Date) ? Utilities.formatDate(ts, tz, "yyyy-MM-dd HH:mm") : String(ts)
    });
  }

  // mais recente primeiro
  eventos.sort(function(a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
  return eventos.slice(0, 50);
}

/**
 * Envia email com o link de designação ao dirigente.
 * Retorna { status: 'SUCESSO' } ou { status: 'ERRO', msg }.
 */
function enviarEmailDesignacao(emailDestino, nomeDirigente, link, totalQuadras) {
  try {
    if (!emailDestino) return { status: 'ERRO', msg: 'Email vazio' };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(emailDestino).trim())) {
      return { status: 'ERRO', msg: 'Email inválido' };
    }

    var nome = (nomeDirigente && nomeDirigente.trim()) ? nomeDirigente.trim() : 'irmão(ã)';
    var assunto = 'Designação de território — ' + totalQuadras + ' quadra(s)';
    var corpo =
      'Olá, ' + nome + '!\n\n' +
      'Você foi designado(a) a coordenar ' + totalQuadras + ' quadra(s).\n\n' +
      'Acesse o painel com o link abaixo para ver as quadras, marcar como concluídas\n' +
      'e enviar os endereços aos publicadores:\n\n' +
      link + '\n\n' +
      '— Gestor de Territórios';

    MailApp.sendEmail({ to: String(emailDestino).trim(), subject: assunto, body: corpo });
    return { status: 'SUCESSO' };
  } catch (e) {
    logErro_('enviarEmailDesignacao', e);
    return { status: 'ERRO', msg: String(e && e.message ? e.message : e) };
  }
}

// Marca as quadras designadas como Pendente — não apaga histórico de conclusão.
// Usada pelo servo de território quando designa quadras a um dirigente.
function designarQuadras(ids) {
  return withLock_(function() {
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("Sem IDs para designar.");
    var sheetQ = getSheetByName_(SHEET.QUADRAS);
    if (!sheetQ) throw new Error("Aba Quadras não encontrada.");
    var sheetReg = getSheetByName_(SHEET.REGISTROS);
    if (!sheetReg) {
      sheetReg = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET.REGISTROS);
      sheetReg.appendRow(["ID", "Data", "Tipo", "Timestamp"]);
    }

    var data = sheetQ.getDataRange().getValues();
    var hoje = new Date();
    var atualizadas = 0;

    for (var i = 1; i < data.length; i++) {
      var id = String(data[i][COL.QUADRAS.ID]);
      if (ids.indexOf(id) > -1) {
        sheetQ.getRange(i + 1, COL.QUADRAS.STATUS_1IDX).setValue(STATUS.PENDENTE);
        sheetReg.appendRow([id, hoje, "Designada", new Date()]);
        atualizadas++;
      }
    }
    _invalidar();
    return { status: "SUCESSO", atualizadas: atualizadas };
  });
}

function salvarConfiguracoesCampanha(nome, data) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CAMPANHA_NOME', nome);
  props.setProperty('CAMPANHA_DATA', data);
  return true;
}

function salvarConfiguracoesCampanhaCompleta(cfg) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CAMPANHA_NOME', cfg.nome || "");
  props.setProperty('CAMPANHA_DATA', cfg.data || "");
  props.setProperty('CAMPANHA_DATA_FIM', cfg.dataFim || "");
  props.setProperty('CAMPANHA_OBJETIVO', cfg.objetivo || "");
  props.setProperty('CAMPANHA_ESTRATEGIA', cfg.estrategia || "");
  props.setProperty('CAMPANHA_META_SEMANAL', String(cfg.metaSemanal || 0));
  return true;
}

function obterConfiguracoesCampanha() {
  var props = PropertiesService.getScriptProperties();
  return {
    nome: props.getProperty('CAMPANHA_NOME') || "",
    data: props.getProperty('CAMPANHA_DATA') || "",
    dataFim: props.getProperty('CAMPANHA_DATA_FIM') || "",
    objetivo: props.getProperty('CAMPANHA_OBJETIVO') || "",
    estrategia: props.getProperty('CAMPANHA_ESTRATEGIA') || "",
    metaSemanal: parseInt(props.getProperty('CAMPANHA_META_SEMANAL') || "0", 10) || 0
  };
}
// =================================================================
// OBJETIVOS DA CAMPANHA (aba "Campanha")
// CRUD + upload de anexos pro Drive
// =================================================================

// Garante que a aba existe com os headers corretos. Idempotente:
// pode ser chamado em todas as leituras/escritas sem custo.
function ensureSheetCampanha_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.CAMPANHA);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET.CAMPANHA);
  sh.appendRow([
    'id', 'tipo', 'modalidade', 'titulo', 'descricao',
    'link', 'anexoNome', 'anexoUrl', 'publico', 'criado', 'ordem'
  ]);
  sh.setFrozenRows(1);
  return sh;
}

function _gerarIdObjetivo_() {
  return 'obj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function _linhaParaObjetivo_(linha) {
  return {
    id:         String(linha[COL.CAMPANHA.ID] || ''),
    tipo:       String(linha[COL.CAMPANHA.TIPO] || 'geral'),
    modalidade: String(linha[COL.CAMPANHA.MODALIDADE] || ''),
    titulo:     String(linha[COL.CAMPANHA.TITULO] || ''),
    descricao:  String(linha[COL.CAMPANHA.DESCRICAO] || ''),
    link:       String(linha[COL.CAMPANHA.LINK] || ''),
    anexoNome:  String(linha[COL.CAMPANHA.ANEXO_NOME] || ''),
    anexoUrl:   String(linha[COL.CAMPANHA.ANEXO_URL] || ''),
    publico:    linha[COL.CAMPANHA.PUBLICO] === true || String(linha[COL.CAMPANHA.PUBLICO]).toUpperCase() === 'TRUE',
    criado:     linha[COL.CAMPANHA.CRIADO] ? new Date(linha[COL.CAMPANHA.CRIADO]).getTime() : 0,
    ordem:      Number(linha[COL.CAMPANHA.ORDEM]) || 0
  };
}

// Listagem para o admin (Gestão): todos os objetivos
function listarObjetivosCampanha() {
  var sh = ensureSheetCampanha_();
  var ult = sh.getLastRow();
  if (ult < 2) return [];
  var dados = sh.getRange(2, 1, ult - 1, 11).getValues();
  return dados.map(_linhaParaObjetivo_).filter(function(o){ return o.id; });
}

// Listagem para o público: só os com publico=true
function listarObjetivosCampanhaPublicos() {
  return listarObjetivosCampanha().filter(function(o){ return o.publico; });
}

function _acharLinhaObjetivo_(sh, id) {
  var ult = sh.getLastRow();
  if (ult < 2) return -1;
  var col = sh.getRange(2, 1, ult - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(id)) return i + 2; // 1-idx + header
  }
  return -1;
}

// Cria um objetivo novo. obj: { tipo, modalidade, titulo, descricao,
// link, anexoNome, anexoUrl, publico, ordem }
function criarObjetivoCampanha(obj) {
  return withLock_(function(){
    var sh = ensureSheetCampanha_();
    var id = _gerarIdObjetivo_();
    sh.appendRow([
      id,
      sanitizar_(obj.tipo || 'geral'),
      sanitizar_(obj.modalidade || ''),
      sanitizar_(obj.titulo || ''),
      sanitizar_(obj.descricao || ''),
      sanitizar_(obj.link || ''),
      sanitizar_(obj.anexoNome || ''),
      sanitizar_(obj.anexoUrl || ''),
      obj.publico === true,
      new Date(),
      Number(obj.ordem) || 0
    ]);
    return { ok: true, id: id };
  });
}

// Atualiza campos do objetivo (parcial — só envia o que muda)
function atualizarObjetivoCampanha(id, patch) {
  return withLock_(function(){
    var sh = ensureSheetCampanha_();
    var linha = _acharLinhaObjetivo_(sh, id);
    if (linha < 0) return { ok: false, erro: 'Objetivo não encontrado' };

    var mapa = {
      tipo:       COL.CAMPANHA.TIPO_1IDX,
      modalidade: COL.CAMPANHA.MODALIDADE_1IDX,
      titulo:     COL.CAMPANHA.TITULO_1IDX,
      descricao:  COL.CAMPANHA.DESCRICAO_1IDX,
      link:       COL.CAMPANHA.LINK_1IDX,
      anexoNome:  COL.CAMPANHA.ANEXO_NOME_1IDX,
      anexoUrl:   COL.CAMPANHA.ANEXO_URL_1IDX,
      publico:    COL.CAMPANHA.PUBLICO_1IDX,
      ordem:      COL.CAMPANHA.ORDEM_1IDX
    };
    Object.keys(patch || {}).forEach(function(k){
      if (!(k in mapa)) return;
      var valor = patch[k];
      if (k === 'publico') valor = valor === true;
      else if (k === 'ordem') valor = Number(valor) || 0;
      else valor = sanitizar_(valor);
      sh.getRange(linha, mapa[k]).setValue(valor);
    });
    return { ok: true };
  });
}

function removerObjetivoCampanha(id) {
  return withLock_(function(){
    var sh = ensureSheetCampanha_();
    var linha = _acharLinhaObjetivo_(sh, id);
    if (linha < 0) return { ok: false, erro: 'Objetivo não encontrado' };
    sh.deleteRow(linha);
    return { ok: true };
  });
}

// Recebe arquivo do front (base64 + nome + mime) e salva numa pasta
// dedicada do Drive. Retorna URL pública (acessível com link).
// O usuário precisa autorizar o escopo drive.file na primeira chamada.
function uploadAnexoCampanha(payload) {
  if (!payload || !payload.base64 || !payload.nome) {
    return { ok: false, erro: 'Payload inválido' };
  }
  try {
    var pasta = _pastaAnexosCampanha_();
    var bytes = Utilities.base64Decode(payload.base64);
    var blob = Utilities.newBlob(bytes, payload.mime || 'application/octet-stream', payload.nome);
    var arq = pasta.createFile(blob);
    arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return {
      ok: true,
      nome: arq.getName(),
      url:  arq.getUrl()
    };
  } catch (e) {
    logErro_('uploadAnexoCampanha', e);
    return { ok: false, erro: String(e && e.message || e) };
  }
}

function _pastaAnexosCampanha_() {
  var nome = 'Territory Helper — Anexos Campanha';
  var iter = DriveApp.getFoldersByName(nome);
  if (iter.hasNext()) return iter.next();
  return DriveApp.createFolder(nome);
}

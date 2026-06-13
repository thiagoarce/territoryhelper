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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const data = sheet.getDataRange().getValues();

  let row = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(dados.idOriginal)) { row = i + 1; break; }
  }

  if (row !== -1) {
    sheet.getRange(row, 1).setValue(dados.idNovo);
    sheet.getRange(row, 5).setValue(dados.polyString);
    sheet.getRange(row, 6).setValue(dados.color);
    sheet.getRange(row, 7).setValue(dados.territory);
  } else {
    // Se não achou (ex: id mudou e não achou original), cria nova
    sheet.appendRow([dados.idNovo, 0, "", "", dados.polyString, dados.color, dados.territory]);
  }
  _invalidar();
  return "Salvo";
}

function excluirQuadra(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      _invalidar();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQ = ss.getSheetByName("Quadras");
  var sheetReg = ss.getSheetByName("Registros");
  if (!sheetReg) { sheetReg = ss.insertSheet("Registros"); sheetReg.appendRow(["ID", "Data", "Tipo", "TS"]); }

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
        sheetQ.getRange(row, 8).setValue("Concluído");
        sheetQ.getRange(row, 9).setValue(payload.data);
        // Atualiza Território se necessário
        var nmTerr = dataQ[row - 1][6];
        if (nmTerr) verificarStatusTerritorio(nmTerr, payload.data);
      }
      sheetReg.appendRow([id, payload.data, payload.modo, new Date()]);
    }
  });
  _invalidar();
  return { status: "SUCESSO" };
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
  var props = PropertiesService.getScriptProperties();

  var nome = props.getProperty('CAMPANHA_NOME') || "Campanha";
  var dataIni = props.getProperty('CAMPANHA_DATA') || "";

  var dataInicio = dataIni ? new Date(dataIni + "T00:00:00") : null;

  var quadras = [];
  var completas = 0, andamento = 0, restantes = 0, completasSemana = 0;
  var hoje = new Date();
  var seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (sheetQ && sheetQ.getLastRow() > 1) {
    var data = sheetQ.getRange(2, 1, sheetQ.getLastRow() - 1, sheetQ.getLastColumn()).getValues();
    data.forEach(function (r) {
      var id = String(r[0] || "").trim();
      if (!id) return;
      var poly = String(r[4] || "");
      var status = String(r[7] || "");
      var color = String(r[5] || "#3388ff");
      var territory = String(r[6] || "");
      var dataConc = (r[8] instanceof Date) ? r[8] : null;
      var dataConcStr = dataConc ? Utilities.formatDate(dataConc, Session.getScriptTimeZone(), "yyyy-MM-dd") : "";

      var estado = 'restante';
      if (status && status.toLowerCase().indexOf('iniciado') > -1) {
        estado = 'andamento'; andamento++;
      } else if (dataConc && dataInicio && dataConc >= dataInicio) {
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
        status: status,
        dataConclusao: dataConcStr,
        estado: estado
      });
    });
  }

  var total = completas + andamento + restantes;
  var pct = total > 0 ? Math.round((completas / total) * 100) : 0;

  return {
    nome: nome,
    dataInicio: dataIni,
    totalQuadras: total,
    completas: completas,
    andamento: andamento,
    restantes: restantes,
    completasSemana: completasSemana,
    porcentagem: pct,
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

// Função restrita usada pelo dirigente — só aceita IDs que foram passados via link
function dirigenteMarcarStatus(ids, status, data) {
  if (!Array.isArray(ids) || ids.length === 0) return { status: "ERRO", msg: "Sem IDs" };
  if (status !== "Iniciado" && status !== "Concluído") return { status: "ERRO", msg: "Status inválido" };

  if (status === "Concluído") {
    var dataFinal = data || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    return salvarConclusaoQuadras({ ids: ids, data: dataFinal, modo: 'auto' });
  } else {
    return salvarInicioQuadras({ ids: ids, data: new Date().toISOString() });
  }
}

function salvarConfiguracoesCampanha(nome, data) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CAMPANHA_NOME', nome);
  props.setProperty('CAMPANHA_DATA', data);
  return true;
}

function obterConfiguracoesCampanha() {
  var props = PropertiesService.getScriptProperties();
  return {
    nome: props.getProperty('CAMPANHA_NOME') || "",
    data: props.getProperty('CAMPANHA_DATA') || ""
  };
}
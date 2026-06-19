// =================================================================
// 1. INICIALIZAÇÃO E ROTAS
// =================================================================
function doGet(e) {
  var view = (e && e.parameter && e.parameter.v) ? e.parameter.v : '';
  var viewport = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

  if (view === 'publico') {
    var tmplP = HtmlService.createTemplateFromFile('Publico');
    tmplP.ids = e.parameter.ids || "";
    tmplP.te  = e.parameter.te  || "";
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

  if (view === 'cartas') {
    var tmplCt = HtmlService.createTemplateFromFile('Cartas');
    return tmplCt.evaluate().setTitle('Trabalho de Cartas').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', viewport);
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

    var idOriginal = String(dados.idOriginal || '').trim();
    var idNovo = sanitizar_(dados.idNovo);

    // Se o ID mudou, garante que o novo não colide com outra quadra
    if (row !== -1 && idOriginal !== idNovo) {
      var rowConflito = acharLinhaQuadra_(data, idNovo);
      if (rowConflito !== -1) {
        throw new Error('Já existe uma quadra com ID "' + idNovo + '"');
      }
    }

    if (row !== -1) {
      sheet.getRange(row, COL.QUADRAS.ID_1IDX).setValue(idNovo);
      sheet.getRange(row, COL.QUADRAS.POLYSTRING_1IDX).setValue(dados.polyString);
      sheet.getRange(row, COL.QUADRAS.COLOR_1IDX).setValue(cor);
      sheet.getRange(row, COL.QUADRAS.TERRITORIO_1IDX).setValue(sanitizar_(dados.territory));

      // Status: editor pode marcar como Inativa (área verde/parque).
      // null preserva o status atual (não força Pendente). Voltar de
      // Inativa pra ativa usa o radio "Ativa" que envia "Pendente".
      if (dados.status === STATUS.INATIVA) {
        sheet.getRange(row, COL.QUADRAS.STATUS_1IDX).setValue(STATUS.INATIVA);
        sheet.getRange(row, COL.QUADRAS.DATA_CONC_1IDX).setValue(''); // limpa data
      } else if (dados.status === STATUS.PENDENTE) {
        // Saiu de Inativa pra ativa — só restaura Pendente se estava Inativa
        var stAtual = String(data[row - 1][COL.QUADRAS.STATUS] || '');
        if (stAtual === STATUS.INATIVA) {
          sheet.getRange(row, COL.QUADRAS.STATUS_1IDX).setValue(STATUS.PENDENTE);
        }
      }

      // Cascata: se o ID mudou, propaga pras outras abas pra não deixar
      // endereços/designações/registros órfãos referenciando o id antigo.
      if (idOriginal && idOriginal !== idNovo) {
        var mapa = {};
        mapa[idOriginal] = idNovo;
        _propagarRenomeacaoIds_(mapa);
      }
    } else {
      sheet.appendRow([idNovo, 0, "", "", dados.polyString, cor, sanitizar_(dados.territory), STATUS.PENDENTE, ""]);
    }
    _invalidar();
    return "Salvo";
  });
}

// Conta refs a esse id em outras abas, pra UI poder avisar antes de
// excluir. Lê só — não modifica nada.
function _contarRefsQuadra_(id) {
  if (!id) return null;
  var idTrim = String(id).trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = { enderecos: 0, designacoesAbertas: 0, registros: 0 };

  var sheetD = ss.getSheetByName(SHEET.DADOS);
  if (sheetD && sheetD.getLastRow() > 1) {
    var dataD = sheetD.getRange(2, COL.DADOS.QUADRA_1IDX, sheetD.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < dataD.length; i++) if (String(dataD[i][0] || '').trim() === idTrim) res.enderecos++;
  }
  var sheetDes = ss.getSheetByName(SHEET.DESIGNACOES);
  if (sheetDes && sheetDes.getLastRow() > 1) {
    var dataDes = sheetDes.getRange(2, 1, sheetDes.getLastRow() - 1, 7).getValues();
    for (var d = 0; d < dataDes.length; d++) {
      var status = String(dataDes[d][COL.DESIGNACOES.STATUS] || '');
      if (status !== STATUS_DESIGNACAO.ABERTA) continue;
      var ids = String(dataDes[d][COL.DESIGNACOES.IDS_QUADRAS] || '')
        .split(',').map(function(s){ return s.trim(); });
      if (ids.indexOf(idTrim) >= 0) res.designacoesAbertas++;
    }
  }
  var sheetReg = ss.getSheetByName(SHEET.REGISTROS);
  if (sheetReg && sheetReg.getLastRow() > 1) {
    var dataReg = sheetReg.getRange(2, 1, sheetReg.getLastRow() - 1, 1).getValues();
    for (var r = 0; r < dataReg.length; r++) if (String(dataReg[r][0] || '').trim() === idTrim) res.registros++;
  }
  return res;
}

function excluirQuadra(id) {
  return withLock_(function() {
    if (!id) throw new Error("ID ausente.");
    var sheet = getSheetByName_(SHEET.QUADRAS);
    if (!sheet) throw new Error("Aba Quadras não encontrada.");
    var data = sheet.getDataRange().getValues();
    var row = acharLinhaQuadra_(data, id);
    if (row === -1) return "Não encontrada";

    var idTrim = String(id).trim();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Limpeza em cascata: tira o ID dos CSVs das outras abas pra não
    // deixar refs órfãs (cadeado fantasma, território "fantasma", etc).
    var sheetT = ss.getSheetByName(SHEET.TERRITORIOS)
              || ss.getSheetByName('Territórios');
    if (sheetT && sheetT.getLastRow() > 1) {
      var dataT = sheetT.getDataRange().getValues();
      for (var t = 1; t < dataT.length; t++) {
        var csv = String(dataT[t][COL.TERRITORIOS.IDS_QUADRAS] || '');
        if (!csv) continue;
        var ids = csv.split(',').map(function(s){ return s.trim(); });
        var novo = ids.filter(function(x){ return x && x !== idTrim; });
        if (novo.length !== ids.length) {
          sheetT.getRange(t + 1, COL.TERRITORIOS.IDS_QUADRAS_1IDX).setValue(novo.join(','));
        }
      }
    }

    var sheetDes = ss.getSheetByName(SHEET.DESIGNACOES);
    if (sheetDes && sheetDes.getLastRow() > 1) {
      var dataDes = sheetDes.getRange(2, 1, sheetDes.getLastRow() - 1, 7).getValues();
      for (var d = 0; d < dataDes.length; d++) {
        var csvD = String(dataDes[d][COL.DESIGNACOES.IDS_QUADRAS] || '');
        if (!csvD) continue;
        var idsD = csvD.split(',').map(function(s){ return s.trim(); });
        var novoD = idsD.filter(function(x){ return x && x !== idTrim; });
        if (novoD.length !== idsD.length) {
          sheetDes.getRange(d + 2, COL.DESIGNACOES.IDS_QUADRAS_1IDX).setValue(novoD.join(','));
          // Designação vazia (única quadra removida) → fecha como cancelada
          if (novoD.length === 0) {
            sheetDes.getRange(d + 2, COL.DESIGNACOES.STATUS_1IDX).setValue(STATUS_DESIGNACAO.CANCELADA);
          }
        }
      }
    }

    // Endereços em Dados Brutos: NÃO renomear (não há pra onde). Deixa
    // o ID antigo lá. Vai aparecer como "sem quadra" no editor — o
    // user pode revincular. Comportamento intencional: não perdemos
    // dado IBGE só porque a quadra foi removida.
    sheet.deleteRow(row);
    _invalidar();
    return "Excluída";
  });
}

function salvarJuncaoQuadras(dados) {
  if (!dados || !Array.isArray(dados.idsRemover) || dados.idsRemover.length === 0) {
    throw new Error('idsRemover obrigatório');
  }
  var vId = validarId_(dados.novoId); if (!vId.ok) throw new Error(vId.msg);
  var vPoly = validarPolyString_(dados.polyString); if (!vPoly.ok) throw new Error(vPoly.msg);

  return withLock_(function(){
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getSheetByName_(SHEET.QUADRAS);
    if (!sheet) throw new Error('Aba Quadras não encontrada');

    var data = sheet.getDataRange().getValues();
    var novoIdLimpo = sanitizar_(dados.novoId);

    // Detecta conflito: o novo ID já existe fora das que vão ser removidas?
    for (var i = 1; i < data.length; i++) {
      var id = String(data[i][COL.QUADRAS.ID]).trim();
      if (id === novoIdLimpo && dados.idsRemover.indexOf(id) < 0) {
        return { status: 'CONFLITO', erro: 'Já existe outra quadra com ID "' + novoIdLimpo + '"' };
      }
    }

    // Preserva o "melhor" status entre as juntadas: se alguma estava
    // Concluído, herda Concluído com a data mais recente. Senão Pendente.
    var melhorStatus = STATUS.PENDENTE;
    var melhorData = '';
    for (var j = 1; j < data.length; j++) {
      var idJ = String(data[j][COL.QUADRAS.ID]).trim();
      if (dados.idsRemover.indexOf(idJ) < 0) continue;
      var st = String(data[j][COL.QUADRAS.STATUS] || '');
      var dt = data[j][COL.QUADRAS.DATA_CONC];
      if (st === STATUS.CONCLUIDO) {
        melhorStatus = STATUS.CONCLUIDO;
        if (dt && (!melhorData || new Date(dt) > new Date(melhorData))) melhorData = dt;
      }
    }

    // 1. Remove as linhas das quadras antigas (loop reverso)
    for (var r = data.length - 1; r >= 1; r--) {
      var idRow = String(data[r][COL.QUADRAS.ID]);
      if (dados.idsRemover.indexOf(idRow) >= 0) sheet.deleteRow(r + 1);
    }

    // 2. Adiciona a nova quadra unificada
    sheet.appendRow([
      novoIdLimpo, 0, '', '',
      dados.polyString,
      validarCor_(dados.cor),
      sanitizar_(dados.territorio || ''),
      melhorStatus,
      melhorData
    ]);

    // 3. Cascata: redireciona endereços, designações, registros e
    // refs em Territorios pras quadras antigas pra apontarem pra nova.
    var mapa = {};
    dados.idsRemover.forEach(function(antigo){
      var a = String(antigo).trim();
      if (a && a !== novoIdLimpo) mapa[a] = novoIdLimpo;
    });
    _propagarRenomeacaoIds_(mapa);

    _invalidar();
    return { status: 'SUCESSO', id: novoIdLimpo };
  });
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

  // 1. Prepara Mapa de Dados das Quadras (Polígono e Data).
  // Inativas (área verde) NÃO entram — mesmo se o servo passou o id
  // no link, o publicador não vê elas.
  const mapQuadras = {};
  if (sheetQ) {
    const dataQ = sheetQ.getDataRange().getValues();
    for (let i = 1; i < dataQ.length; i++) {
      let id = String(dataQ[i][0]).trim();
      if (String(dataQ[i][7] || '') === STATUS.INATIVA) continue;
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
        face: String(r[2]),       // Col C (legado — na verdade é QUADRA_IBGE)
        faceIBGE: String(r[3]),   // Col D — FACE_IBGE de verdade (F1, F2, F3, F4)
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

  // Enriquece cada item com o ÚLTIMO desfecho registrado (badge "antes"
  // pro publicador novo ver memória do território). Lê Registros 1 vez.
  try {
    var ultimos = _ultimoDesfechoPorRow_();
    var emTCE = {};
    try { emTCE = getEnderecosEmTCE(); } catch (e) {}
    var tz = "GMT-3";
    resultado.forEach(function(q){
      (q.itens || []).forEach(function(it){
        var u = ultimos[it.row];
        if (u && u.dataMs) {
          it.ultimoTipo = u.tipo;
          it.ultimoDataStr = Utilities.formatDate(new Date(u.dataMs), tz, 'dd/MM/yy');
        }
        // Endereço já está num Território Comercial Especial?
        // Frontend esmaece + mostra badge com aviso.
        if (emTCE[it.row]) {
          it.emTCE = {
            nome: emTCE[it.row].nome,
            publicador: emTCE[it.row].publicador
          };
        }
      });
    });
  } catch (e) { /* enriquecimento é opcional — não derruba a leitura */ }

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
  // Auto-fecha designações cujas quadras todas viraram Concluído.
  // Try/catch porque é efeito colateral — falha aqui não deve quebrar
  // o salvamento principal.
  try { _fecharDesignacoesCompletas_(); } catch (e) { logErro_('fecharDesignacoes', e); }
  _invalidar();
  return { status: "SUCESSO" };
  });
}

// Desfaz a conclusão MAIS RECENTE de uma quadra. Restaura o estado
// imediatamente anterior:
//   - se havia uma conclusão antiga no histórico → volta data para ela
//   - se essa era a primeira conclusão → status volta pra Pendente
// Registra a operação na aba Registros como tipo "desfeito" pra
// preservar trilha de auditoria.
function desfazerConclusaoQuadra(id) {
  if (!id) throw new Error("ID obrigatório");
  return withLock_(function(){
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetQ = getSheetByName_(SHEET.QUADRAS);
    var sheetReg = getSheetByName_(SHEET.REGISTROS);
    if (!sheetQ) throw new Error("Aba Quadras não encontrada.");

    var linhaQ = acharLinhaQuadra_(sheetQ, id);
    if (linhaQ < 0) return { ok: false, erro: "Quadra não encontrada" };

    // Histórico: filtra por id, ignora linhas já marcadas como "desfeito".
    // O registro do topo (mais recente) é a conclusão atual; o de baixo
    // dele é o estado pra onde queremos voltar.
    var historico = [];
    if (sheetReg && sheetReg.getLastRow() > 1) {
      var dadosReg = sheetReg.getRange(2, 1, sheetReg.getLastRow() - 1, 4).getValues();
      dadosReg.forEach(function(r, i){
        if (String(r[0]) !== String(id)) return;
        var tipo = String(r[2] || '');
        if (tipo === 'desfeito') return;
        historico.push({ linha: i + 2, data: r[1], tipo: tipo, ts: r[3] });
      });
      // Ordena por timestamp desc; quando ts vier vazio/inválido (linhas
      // legadas de versões antigas), usa o número da linha como fallback
      // determinístico (linhas mais novas têm índice maior).
      historico.sort(function(a, b){
        var ta = a.ts ? new Date(a.ts).getTime() : NaN;
        var tb = b.ts ? new Date(b.ts).getTime() : NaN;
        if (isNaN(ta) && isNaN(tb)) return b.linha - a.linha;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        return tb - ta;
      });
    }

    if (historico.length === 0) return { ok: false, erro: "Sem histórico de conclusão pra desfazer" };

    var anterior = historico[1]; // pode ser undefined se só houve 1
    var novaData = anterior ? anterior.data : "";
    var novoStatus = anterior ? STATUS.CONCLUIDO : STATUS.PENDENTE;

    sheetQ.getRange(linhaQ, COL.QUADRAS.STATUS_1IDX).setValue(novoStatus);
    sheetQ.getRange(linhaQ, COL.QUADRAS.DATA_CONC_1IDX).setValue(novaData);

    if (sheetReg) {
      sheetReg.appendRow([id, novaData || '', 'desfeito', new Date()]);
    }

    _invalidar();
    return {
      ok: true,
      novoStatus: novoStatus,
      novaData: novaData ? Utilities.formatDate(new Date(novaData), Session.getScriptTimeZone(), "yyyy-MM-dd") : ""
    };
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
  cache.removeAll(['DADOS_MAPA_CACHE', 'PREDIOS_LISTA_V1', 'DENSIDADE_PREDIOS_V1']);
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
      // Quadras Inativas (área verde / parque) ficam de FORA da campanha:
      // não contam, não aparecem no mapa motivacional.
      if (String(r[7] || '') === STATUS.INATIVA) return;
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
    ativa: cfg.ativa,
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

  // (2) Vizinhança geográfica: SEMPRE adiciona quadras próximas que
  // ainda não estejam na lista (territorial). Dá referência visual de
  // ruas e quadras de OUTROS territórios em volta — útil pro dirigente
  // saber onde tá no bairro. Dedupe por ID, cap em COTA_FALLBACK.
  var bbox = bboxDasDesignadas_(designadas);
  if (bbox) {
    // Expansão menor quando já temos contexto territorial (não enche
    // demais a tela); maior quando não temos nada ainda.
    var fator = contexto.length > 0 ? 0.35 : 0.6;
    var MIN_DELTA = 0.001;
    var dlat = Math.max((bbox.maxLat - bbox.minLat) * fator, MIN_DELTA);
    var dlng = Math.max((bbox.maxLng - bbox.minLng) * fator, MIN_DELTA);
    bbox.minLat -= dlat; bbox.maxLat += dlat;
    bbox.minLng -= dlng; bbox.maxLng += dlng;

    var jaTem = {};
    contexto.forEach(function(q){ jaTem[q.id] = true; });

    for (var n = 1; n < dataQ.length; n++) {
      var idN = String(dataQ[n][COL.QUADRAS.ID]).trim();
      if (!idN || idsSet[idN] || jaTem[idN]) continue;
      var polyN = dataQ[n][COL.QUADRAS.POLYSTRING];
      if (!polyN) continue;
      var centro = centroPoly_(polyN);
      if (!centro) continue;
      if (centro.lat < bbox.minLat || centro.lat > bbox.maxLat) continue;
      if (centro.lng < bbox.minLng || centro.lng > bbox.maxLng) continue;
      var item2 = montarItem(dataQ[n]);
      if (item2) {
        contexto.push(item2);
        jaTem[idN] = true;
        if (contexto.length >= COTA_FALLBACK) break;
      }
    }
  }

  // Enriquece com densidade de prédios por quadra (numero de prédios,
  // não de endereços — aptos mascaram a contagem real). Frontend usa
  // pra colorir quadras na visualização do dirigente.
  var densidade = {};
  try { densidade = getDensidadePredios(); } catch (e) {}
  designadas.forEach(function(q){ q.qtdPredios = densidade[q.id] || 0; });
  contexto.forEach(function(q){ q.qtdPredios = densidade[q.id] || 0; });

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
      // Quadras Inativas (área verde) ficam de fora do dashboard
      if (String(r[COL.QUADRAS.STATUS] || '') === STATUS.INATIVA) return;
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
  // Toggle explícito — quando false, o painel público mostra mensagem
  // "sem campanha ativa" e o cálculo de "concluídas na campanha" usa
  // o gradiente normal em vez de cortar pela dataInicio.
  props.setProperty('CAMPANHA_ATIVA', cfg.ativa === false ? 'false' : 'true');
  return true;
}

function obterConfiguracoesCampanha() {
  var props = PropertiesService.getScriptProperties();
  var ativaStr = props.getProperty('CAMPANHA_ATIVA');
  // Default: ativa se tem datas configuradas (compat com config antiga)
  var temData = !!props.getProperty('CAMPANHA_DATA');
  var ativa = ativaStr === null ? temData : ativaStr !== 'false';
  return {
    nome: props.getProperty('CAMPANHA_NOME') || "",
    data: props.getProperty('CAMPANHA_DATA') || "",
    dataFim: props.getProperty('CAMPANHA_DATA_FIM') || "",
    objetivo: props.getProperty('CAMPANHA_OBJETIVO') || "",
    estrategia: props.getProperty('CAMPANHA_ESTRATEGIA') || "",
    metaSemanal: parseInt(props.getProperty('CAMPANHA_META_SEMANAL') || "0", 10) || 0,
    ativa: ativa
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

// Só aceita esquemas seguros pra URL persistida em objetivo (link e
// anexoUrl). Bloqueia javascript:, data:, vbscript:, file:. Vazio é
// permitido (campo opcional).
function _sanitizarUrl_(url) {
  var s = String(url || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s) && !/^mailto:/i.test(s)) return '';
  return s;
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
      _sanitizarUrl_(obj.link),
      sanitizar_(obj.anexoNome || ''),
      _sanitizarUrl_(obj.anexoUrl),
      obj.publico === true,
      new Date(),
      Number(obj.ordem) || 0
    ]);
    _invalidar();
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
      else if (k === 'link' || k === 'anexoUrl') valor = _sanitizarUrl_(valor);
      else valor = sanitizar_(valor);
      sh.getRange(linha, mapa[k]).setValue(valor);
    });
    _invalidar();
    return { ok: true };
  });
}

function removerObjetivoCampanha(id) {
  return withLock_(function(){
    var sh = ensureSheetCampanha_();
    var linha = _acharLinhaObjetivo_(sh, id);
    if (linha < 0) return { ok: false, erro: 'Objetivo não encontrado' };
    sh.deleteRow(linha);
    _invalidar();
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
  // Lock serializa _pastaAnexosCampanha_ — sem isso, 2 uploads
  // concorrentes na 1ª vez criariam 2 pastas com o mesmo nome.
  return withLock_(function(){
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
  });
}

function _pastaAnexosCampanha_() {
  // Cache o ID em ScriptProperties pra evitar getFoldersByName em
  // toda chamada — também fecha a race "pasta criada 2x" depois da 1ª.
  var props = PropertiesService.getScriptProperties();
  var idCached = props.getProperty('PASTA_ANEXOS_CAMPANHA_ID');
  if (idCached) {
    try { return DriveApp.getFolderById(idCached); } catch (e) {}
  }
  var nome = 'Territory Helper — Anexos Campanha';
  var iter = DriveApp.getFoldersByName(nome);
  var pasta = iter.hasNext() ? iter.next() : DriveApp.createFolder(nome);
  props.setProperty('PASTA_ANEXOS_CAMPANHA_ID', pasta.getId());
  return pasta;
}

// =================================================================
// DESIGNAÇÕES PESSOAIS (aba "Designacoes")
// Quando o dirigente envia link com quadras pro publicador, registra
// uma designação aberta. Outras telas mostram que essas quadras estão
// "em uso". Quando o dirigente marca alguma dessas quadras como
// concluída, a designação fecha automaticamente se todas as quadras
// dela foram concluídas.
// =================================================================

function ensureSheetDesignacoes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.DESIGNACOES);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET.DESIGNACOES);
  sh.appendRow(['id', 'idsQuadras', 'publicador', 'criada', 'prazo', 'status', 'notas']);
  sh.setFrozenRows(1);
  return sh;
}

function _gerarIdDesignacao_() {
  return 'des_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _linhaParaDesignacao_(linha) {
  var ids = String(linha[COL.DESIGNACOES.IDS_QUADRAS] || '')
    .split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  return {
    id:         String(linha[COL.DESIGNACOES.ID] || ''),
    idsQuadras: ids,
    publicador: String(linha[COL.DESIGNACOES.PUBLICADOR] || ''),
    criada:     linha[COL.DESIGNACOES.CRIADA] ? new Date(linha[COL.DESIGNACOES.CRIADA]).getTime() : 0,
    prazo:      linha[COL.DESIGNACOES.PRAZO] ? new Date(linha[COL.DESIGNACOES.PRAZO]).getTime() : 0,
    status:     String(linha[COL.DESIGNACOES.STATUS] || STATUS_DESIGNACAO.ABERTA),
    notas:      String(linha[COL.DESIGNACOES.NOTAS] || '')
  };
}

function criarDesignacao(payload) {
  if (!payload || !Array.isArray(payload.ids) || payload.ids.length === 0) {
    return { ok: false, erro: 'Sem quadras pra designar' };
  }
  var publicador = sanitizar_(payload.publicador || '');
  if (!publicador) return { ok: false, erro: 'Nome do publicador é obrigatório' };

  // Valida prazo: se vier preenchido, precisa ser yyyy-MM-dd válido.
  // Sem isso, "abc" geraria new Date(Invalid) → NaN persistido → UI mente.
  var prazoDate;
  if (payload.prazo) {
    var v = validarData_(payload.prazo);
    if (!v.ok) return { ok: false, erro: 'Prazo inválido: ' + v.msg };
    prazoDate = new Date(payload.prazo + 'T00:00:00');
  } else {
    prazoDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  return withLock_(function(){
    var sh = ensureSheetDesignacoes_();
    // Aviso (não-bloqueante) se alguma quadra já está em designação aberta
    var jaDesignadas = getQuadrasDesignadas();
    var conflito = payload.ids
      .map(function(s){ return String(s).trim(); })
      .filter(function(qId){ return qId && jaDesignadas[qId]; });
    var id = _gerarIdDesignacao_();
    sh.appendRow([
      id,
      payload.ids.map(function(s){ return String(s).trim(); }).filter(Boolean).join(','),
      publicador,
      new Date(),
      prazoDate,
      STATUS_DESIGNACAO.ABERTA,
      sanitizar_(payload.notas || '')
    ]);
    _invalidar();
    return { ok: true, id: id, conflitos: conflito };
  });
}

// Designações com status='aberta' e que ainda não venceram.
// Vencidas são separadas no retorno pra UI poder destacar.
function listarDesignacoes() {
  var sh = ensureSheetDesignacoes_();
  if (sh.getLastRow() < 2) return { abertas: [], vencidas: [], fechadas: [] };
  var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var agora = Date.now();
  var abertas = [], vencidas = [], fechadas = [];
  dados.forEach(function(linha){
    var d = _linhaParaDesignacao_(linha);
    if (!d.id) return;
    if (d.status === STATUS_DESIGNACAO.ABERTA) {
      if (d.prazo && d.prazo < agora) vencidas.push(d);
      else abertas.push(d);
    } else {
      fechadas.push(d);
    }
  });
  return { abertas: abertas, vencidas: vencidas, fechadas: fechadas };
}

// Mapa { quadraId -> {designacaoId, publicador, prazo, vencida} } para
// designações ainda abertas. Usado pelo painel admin pra desenhar borda
// especial nas quadras travadas.
function getQuadrasDesignadas() {
  var info = listarDesignacoes();
  var mapa = {};
  function add(d, vencida){
    d.idsQuadras.forEach(function(qId){
      mapa[qId] = {
        designacaoId: d.id,
        publicador: d.publicador,
        prazo: d.prazo,
        vencida: vencida
      };
    });
  }
  info.abertas.forEach(function(d){ add(d, false); });
  info.vencidas.forEach(function(d){ add(d, true); });
  return mapa;
}

// Contagem rápida pra header da Visão Geral (badge + alerta).
// Lê só os status sem montar payload completo.
function getResumoDesignacoes() {
  var sh = ensureSheetDesignacoes_();
  if (sh.getLastRow() < 2) return { abertas: 0, vencidas: 0 };
  var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var agora = Date.now();
  var abertas = 0, vencidas = 0;
  dados.forEach(function(r){
    var st = String(r[COL.DESIGNACOES.STATUS] || '');
    if (st !== STATUS_DESIGNACAO.ABERTA) return;
    var prazo = r[COL.DESIGNACOES.PRAZO];
    var prazoMs = prazo ? new Date(prazo).getTime() : 0;
    if (prazoMs && prazoMs < agora) vencidas++;
    else abertas++;
  });
  return { abertas: abertas, vencidas: vencidas };
}

function _acharLinhaDesignacao_(sh, id) {
  var ult = sh.getLastRow();
  if (ult < 2) return -1;
  var col = sh.getRange(2, 1, ult - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// Estende prazo de uma designação aberta (ou reativa vencida com prazo
// novo). Usado pelo botão "+30 dias" no modal Designações.
function estenderPrazoDesignacao(id, novoPrazoYmd) {
  if (!id) return { ok: false, erro: 'id obrigatório' };
  var v = validarData_(novoPrazoYmd);
  if (!v.ok) return { ok: false, erro: v.msg };
  return withLock_(function(){
    var sh = ensureSheetDesignacoes_();
    var linha = _acharLinhaDesignacao_(sh, id);
    if (linha < 0) return { ok: false, erro: 'Designação não encontrada' };
    sh.getRange(linha, COL.DESIGNACOES.PRAZO_1IDX).setValue(new Date(novoPrazoYmd + 'T00:00:00'));
    sh.getRange(linha, COL.DESIGNACOES.STATUS_1IDX).setValue(STATUS_DESIGNACAO.ABERTA);
    _invalidar();
    return { ok: true };
  });
}

function cancelarDesignacao(id) {
  return withLock_(function(){
    var sh = ensureSheetDesignacoes_();
    var linha = _acharLinhaDesignacao_(sh, id);
    if (linha < 0) return { ok: false, erro: 'Designação não encontrada' };
    sh.getRange(linha, COL.DESIGNACOES.STATUS_1IDX).setValue(STATUS_DESIGNACAO.CANCELADA);
    _invalidar();
    return { ok: true };
  });
}

// Chamado depois de salvarConclusaoQuadras: pra cada designação aberta,
// REMOVE da lista as quadras que viraram Concluído (libera o cadeado
// no mapa). Se a designação ficar vazia, fecha como concluída.
// Roda fora do caminho crítico — try/catch no caller.
function _fecharDesignacoesCompletas_() {
  var sh = ensureSheetDesignacoes_();
  if (sh.getLastRow() < 2) return;
  var sheetQ = getSheetByName_(SHEET.QUADRAS);
  if (!sheetQ) return;

  // Mapa de status atual das quadras
  var dataQ = sheetQ.getDataRange().getValues();
  var statusPorId = {};
  for (var i = 1; i < dataQ.length; i++) {
    statusPorId[String(dataQ[i][COL.QUADRAS.ID]).trim()] = String(dataQ[i][COL.QUADRAS.STATUS] || '');
  }

  var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  for (var k = 0; k < dados.length; k++) {
    var d = _linhaParaDesignacao_(dados[k]);
    if (d.status !== STATUS_DESIGNACAO.ABERTA) continue;

    // Filtra mantendo só quadras AINDA pendentes. Quadras removidas
    // da aba Quadras (statusPorId undefined) também saem da lista.
    var aindaPendentes = d.idsQuadras.filter(function(qId){
      var st = statusPorId[qId];
      return st !== undefined && st !== STATUS.CONCLUIDO;
    });

    if (aindaPendentes.length === 0) {
      // Todas concluídas — fecha a designação inteira
      sh.getRange(k + 2, COL.DESIGNACOES.STATUS_1IDX).setValue(STATUS_DESIGNACAO.CONCLUIDA);
    } else if (aindaPendentes.length < d.idsQuadras.length) {
      // Reduziu a lista — alguma quadra concluiu, mas ainda há restantes.
      // Atualiza a célula com a lista filtrada (CSV) pro cadeado sumir
      // do mapa pra quadra que foi concluída.
      sh.getRange(k + 2, COL.DESIGNACOES.IDS_QUADRAS_1IDX).setValue(aindaPendentes.join(','));
    }
  }
}

// =================================================================
// PRÉDIOS / TRABALHO DE CARTAS (aba "Predios")
// Detecção automática: agrupa Dados Brutos por (logradouro + numero),
// retorna grupos com ≥ 2 endereços. Overlay manual fica na aba Predios
// (nome do edifício, marca "irmão mora", última carta entregue, notas).
// =================================================================

function ensureSheetPredios_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.PREDIOS);
  if (sh) {
    // Migração: se a aba já existe mas com schema antigo, completa o
    // cabeçalho com as colunas novas (idempotente, sem perda de dados).
    var ult = sh.getLastColumn();
    if (ult < 13) {
      var faltam = [];
      if (ult < 8)  faltam.push('nomeIrmao');
      if (ult < 9)  faltam.push('acessoInterfone');
      if (ult < 10) faltam.push('naoEhPredio');
      if (ult < 11) faltam.push('tipoEntrada');
      if (ult < 12) faltam.push('acessoCaixas');
      if (ult < 13) faltam.push('acessoInterfones');
      if (faltam.length > 0) {
        sh.getRange(1, ult + 1, 1, faltam.length).setValues([faltam]);
      }
    }
    return sh;
  }
  sh = ss.insertSheet(SHEET.PREDIOS);
  sh.appendRow([
    'id', 'chave', 'nome', 'irmaoMora', 'ultimaCarta', 'notas', 'atualizado',
    'nomeIrmao', 'acessoInterfone', 'naoEhPredio',
    'tipoEntrada', 'acessoCaixas', 'acessoInterfones'
  ]);
  sh.setFrozenRows(1);
  return sh;
}

function ensureSheetPrediosAptos_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.PREDIOS_APTOS);
  if (sh) {
    // Migração: completa a coluna naoEscrever se aba antiga
    if (sh.getLastColumn() < 6) sh.getRange(1, 6).setValue('naoEscrever');
    return sh;
  }
  sh = ss.insertSheet(SHEET.PREDIOS_APTOS);
  sh.appendRow(['row', 'cartaEscrita', 'cartaEntregue', 'desocupado', 'atualizado', 'naoEscrever']);
  sh.setFrozenRows(1);
  return sh;
}

function _chavePredio_(logradouro, numero) {
  return String(logradouro || '').trim().toLowerCase()
       + '|'
       + String(numero || '').trim().toLowerCase();
}

// Lê overlays da aba Predios indexado por chave
function _mapaOverlaysPredios_() {
  var sh = ensureSheetPredios_();
  var ult = sh.getLastRow();
  if (ult < 2) return {};
  var nCols = Math.max(sh.getLastColumn(), 13);
  var dados = sh.getRange(2, 1, ult - 1, nCols).getValues();
  var mapa = {};
  function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
  dados.forEach(function(r){
    var chave = String(r[COL.PREDIOS.CHAVE] || '');
    if (!chave) return;
    mapa[chave] = {
      id: String(r[COL.PREDIOS.ID] || ''),
      nome: String(r[COL.PREDIOS.NOME] || ''),
      irmaoMora: bool_(r[COL.PREDIOS.IRMAO_MORA]),
      ultimaCarta: r[COL.PREDIOS.ULTIMA_CARTA] ? new Date(r[COL.PREDIOS.ULTIMA_CARTA]).getTime() : 0,
      notas: String(r[COL.PREDIOS.NOTAS] || ''),
      nomeIrmao: String(r[COL.PREDIOS.NOME_IRMAO] || ''),
      acessoInterfone: String(r[COL.PREDIOS.ACESSO_INT] || ''),
      naoEhPredio: bool_(r[COL.PREDIOS.NAO_EH_PREDIO]),
      tipoEntrada: String(r[COL.PREDIOS.TIPO_ENTRADA] || ''),
      acessoCaixas: bool_(r[COL.PREDIOS.ACESSO_CAIXAS]),
      acessoInterfones: bool_(r[COL.PREDIOS.ACESSO_INTERFONES])
    };
  });
  return mapa;
}

// Lista prédios: agrupa Dados Brutos por (logradouro+numero) com
// ≥ MIN_ENDERECOS endereços, junta com overlays manuais. Cada prédio
// tem: chave, logradouro, numero, qtdEnderecos, lat/lng médios,
// nome (do overlay), irmaoMora, ultimaCarta, quadras (lista única
// de quadras que cobrem o prédio), enderecos[].
function listarPredios() {
  // Cache de 5 minutos pra evitar varrer Dados Brutos a cada toque na
  // aba Prédios. Cache é invalidado por _invalidar() em qualquer write
  // que afete o que vem aqui (atualizarPredio, marcarCartaEntregue, etc).
  var cache = CacheService.getScriptCache();
  var cachedJson = cache.get('PREDIOS_LISTA_V1');
  if (cachedJson) {
    try { return JSON.parse(cachedJson); } catch (e) {}
  }
  var MIN_ENDERECOS = 2;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetD = ss.getSheetByName(SHEET.DADOS);
  if (!sheetD || sheetD.getLastRow() < 2) return [];

  var dados = sheetD.getRange(2, 1, sheetD.getLastRow() - 1, sheetD.getLastColumn()).getValues();
  var grupos = {};
  dados.forEach(function(r, i){
    var log = String(r[COL.DADOS.LOGRADOURO] || '').trim();
    var num = String(r[COL.DADOS.NUMERO] || '').trim();
    if (!log || !num) return;
    var chave = _chavePredio_(log, num);
    if (!grupos[chave]) {
      grupos[chave] = {
        chave: chave,
        logradouro: log,
        numero: num,
        enderecos: [],
        quadras: {},
        latSum: 0, lngSum: 0, latCount: 0
      };
    }
    var g = grupos[chave];
    g.enderecos.push({
      row: i + 2,
      quadra: String(r[COL.DADOS.QUADRA] || ''),
      complemento: String(r[COL.DADOS.COMPLEMENTO] || ''),
      tipo: String(r[COL.DADOS.TIPO] || ''),
      nome: String(r[COL.DADOS.NOME_EDIF] || ''),
      lat: r[COL.DADOS.LAT], lng: r[COL.DADOS.LNG]
    });
    g.quadras[String(r[COL.DADOS.QUADRA] || '')] = true;
    if (typeof r[COL.DADOS.LAT] === 'number' && typeof r[COL.DADOS.LNG] === 'number') {
      g.latSum += r[COL.DADOS.LAT]; g.lngSum += r[COL.DADOS.LNG]; g.latCount++;
    }
  });

  var overlays = _mapaOverlaysPredios_();

  var resultado = [];
  Object.keys(grupos).forEach(function(chave){
    var g = grupos[chave];
    if (g.enderecos.length < MIN_ENDERECOS) return;
    var ov = overlays[chave] || {};
    var nomeAuto = '';
    // Pega o primeiro nome de edificação encontrado como default
    for (var i = 0; i < g.enderecos.length; i++) {
      if (g.enderecos[i].nome) { nomeAuto = g.enderecos[i].nome; break; }
    }
    resultado.push({
      chave: chave,
      logradouro: g.logradouro,
      numero: g.numero,
      qtdEnderecos: g.enderecos.length,
      quadras: Object.keys(g.quadras).filter(Boolean),
      lat: g.latCount > 0 ? g.latSum / g.latCount : null,
      lng: g.latCount > 0 ? g.lngSum / g.latCount : null,
      nome: ov.nome || nomeAuto || (g.logradouro + ', ' + g.numero),
      nomeEditado: !!ov.nome,
      irmaoMora: !!ov.irmaoMora,
      nomeIrmao: ov.nomeIrmao || '',
      acessoInterfone: ov.acessoInterfone || '',
      tipoEntrada: ov.tipoEntrada || '',
      acessoCaixas: !!ov.acessoCaixas,
      acessoInterfones: !!ov.acessoInterfones,
      naoEhPredio: !!ov.naoEhPredio,
      ultimaCarta: ov.ultimaCarta || 0,
      ultimaCartaStr: ov.ultimaCarta
        ? Utilities.formatDate(new Date(ov.ultimaCarta), Session.getScriptTimeZone(), "dd/MM/yyyy")
        : '',
      notas: ov.notas || ''
    });
  });

  // Ordena por logradouro depois número
  resultado.sort(function(a, b){
    var c = a.logradouro.localeCompare(b.logradouro);
    return c !== 0 ? c : (parseInt(a.numero, 10) || 0) - (parseInt(b.numero, 10) || 0);
  });

  // Cache de 5min — invalidado por _invalidar() nos writes
  try { cache.put('PREDIOS_LISTA_V1', JSON.stringify(resultado), 300); } catch (e) {}
  return resultado;
}

function _acharLinhaPredioPorChave_(sh, chave) {
  var ult = sh.getLastRow();
  if (ult < 2) return -1;
  var col = sh.getRange(2, 2, ult - 1, 1).getValues(); // coluna B (chave)
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(chave)) return i + 2;
  }
  return -1;
}

// Cria ou atualiza o overlay manual de um prédio. patch pode conter:
// nome, irmaoMora, ultimaCarta, notas, nomeIrmao, acessoInterfone,
// naoEhPredio.
function atualizarPredio(chave, patch) {
  if (!chave) return { ok: false, erro: 'chave obrigatória' };
  return withLock_(function(){
    var sh = ensureSheetPredios_();
    var linha = _acharLinhaPredioPorChave_(sh, chave);
    if (linha < 0) {
      var id = 'pr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      sh.appendRow([id, chave, '', false, '', '', new Date(), '', '', false, '', false, false]);
      linha = sh.getLastRow();
    }
    var mapa = {
      nome:             COL.PREDIOS.NOME_1IDX,
      irmaoMora:        COL.PREDIOS.IRMAO_MORA_1IDX,
      ultimaCarta:      COL.PREDIOS.ULTIMA_CARTA_1IDX,
      notas:            COL.PREDIOS.NOTAS_1IDX,
      nomeIrmao:        COL.PREDIOS.NOME_IRMAO_1IDX,
      acessoInterfone:  COL.PREDIOS.ACESSO_INT_1IDX,
      naoEhPredio:      COL.PREDIOS.NAO_EH_PREDIO_1IDX,
      tipoEntrada:      COL.PREDIOS.TIPO_ENTRADA_1IDX,
      acessoCaixas:     COL.PREDIOS.ACESSO_CAIXAS_1IDX,
      acessoInterfones: COL.PREDIOS.ACESSO_INTERFONES_1IDX
    };
    Object.keys(patch || {}).forEach(function(k){
      if (!(k in mapa)) return;
      var valor = patch[k];
      if (k === 'irmaoMora' || k === 'naoEhPredio' ||
          k === 'acessoCaixas' || k === 'acessoInterfones') {
        valor = valor === true;
      }
      else if (k === 'acessoInterfone') {
        if (valor !== 'individual' && valor !== 'portaria') valor = '';
      }
      else if (k === 'tipoEntrada') {
        if (valor !== 'porteiro' && valor !== 'eletronica' && valor !== 'sem') valor = '';
      }
      else if (k === 'ultimaCarta') {
        if (valor === true) valor = new Date();
        else if (valor) valor = new Date(valor + 'T00:00:00');
        else valor = '';
      }
      else valor = sanitizar_(valor);
      sh.getRange(linha, mapa[k]).setValue(valor);
    });
    sh.getRange(linha, COL.PREDIOS.ATUALIZADO_1IDX).setValue(new Date());
    _invalidar();
    return { ok: true };
  });
}

// Marca carta entregue (timestamp atual) — atalho usado pelo link
// público de cartas. Valida que a chave corresponde a um prédio detectado
// em Dados Brutos pra evitar que um cliente malicioso polua a aba
// Predios chamando com chaves aleatórias.
function marcarCartaEntregue(chave) {
  if (!chave) return { ok: false, erro: 'chave obrigatória' };
  var lista = listarPredios();
  var existe = lista.some(function(p){ return p.chave === chave; });
  if (!existe) return { ok: false, erro: 'Prédio não encontrado' };
  return atualizarPredio(chave, { ultimaCarta: true });
}

// Endpoint público: lê overlay de UM prédio pra popular o modal de edição
// no painel do publicador. Retorna só os campos que o publicador edita.
function getOverlayPredioPublico(chave) {
  if (!chave) return { ok: false, erro: 'chave obrigatória' };
  var lista = listarPredios();
  var p = lista.find(function(x){ return x.chave === chave; });
  if (!p) return { ok: false, erro: 'Prédio não encontrado' };
  var ov = _mapaOverlaysPredios_()[chave] || {};
  return {
    ok: true,
    chave: chave,
    nome: p.nome || '',
    tipoEntrada: ov.tipoEntrada || '',
    acessoCaixas: !!ov.acessoCaixas,
    acessoInterfones: !!ov.acessoInterfones
  };
}

// Endpoint público pro publicador editar metadados do prédio (interfone,
// portaria, caixa de correio). Só aceita campos seguros — não expõe
// notas, irmaoMora ou outros campos administrativos.
function atualizarPredioPublico(chave, patch) {
  if (!chave) return { ok: false, erro: 'chave obrigatória' };
  var lista = listarPredios();
  var existe = lista.some(function(p){ return p.chave === chave; });
  if (!existe) return { ok: false, erro: 'Prédio não encontrado' };
  var permitidos = ['tipoEntrada', 'acessoCaixas', 'acessoInterfones'];
  var seguro = {};
  permitidos.forEach(function(k){ if (k in (patch || {})) seguro[k] = patch[k]; });
  return atualizarPredio(chave, seguro);
}

// Versão pública (read-only) pra link compartilhado — não expõe notas
// internas, só o que o irmão precisa pra escrever/entregar.
function listarPrediosPublico() {
  return listarPredios().map(function(p){
    return {
      chave: p.chave,
      nome: p.nome,
      logradouro: p.logradouro,
      numero: p.numero,
      qtdEnderecos: p.qtdEnderecos,
      lat: p.lat, lng: p.lng,
      ultimaCartaStr: p.ultimaCartaStr,
      irmaoMora: p.irmaoMora,
      acessoInterfone: p.acessoInterfone,
      naoEhPredio: p.naoEhPredio
    };
  });
}

// Registra "deixei carta" num endereço específico (linha de Dados Brutos)
// na aba Registros. Usado pelo painel do publicador.
function registrarCartaEndereco(row) {
  var rowNum = parseInt(row, 10);
  if (!rowNum || rowNum < 2) return { ok: false, erro: 'row inválida' };
  return withLock_(function(){
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetD = getSheetByName_(SHEET.DADOS);
    // Limite superior pra evitar registro de lixo via row absurdo
    if (sheetD && rowNum > sheetD.getLastRow()) {
      return { ok: false, erro: 'row fora do range' };
    }
    var sheetReg = getSheetByName_(SHEET.REGISTROS);
    if (!sheetReg) {
      sheetReg = ss.insertSheet(SHEET.REGISTROS);
      sheetReg.appendRow(["ID", "Data", "Tipo", "TS"]);
    }
    sheetReg.appendRow(['endereco:' + rowNum, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), 'carta', new Date()]);
    _invalidar();
    return { ok: true };
  });
}

// =================================================================
// APTOS DENTRO DE PRÉDIOS (aba "PrediosAptos")
// Overlay por endereço usado pelo trabalho de cartas focado num
// prédio: marcar carta escrita, carta entregue, apto desocupado.
// =================================================================

function _acharLinhaAptoPorRow_(sh, row) {
  var ult = sh.getLastRow();
  if (ult < 2) return -1;
  var col = sh.getRange(2, 1, ult - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (Number(col[i][0]) === Number(row)) return i + 2;
  }
  return -1;
}

function _mapaAptosStatus_() {
  var sh = ensureSheetPrediosAptos_();
  var ult = sh.getLastRow();
  if (ult < 2) return {};
  var nCols = Math.max(sh.getLastColumn(), 6);
  var dados = sh.getRange(2, 1, ult - 1, nCols).getValues();
  var mapa = {};
  dados.forEach(function(r){
    var row = Number(r[COL.PREDIOS_APTOS.ROW] || 0);
    if (!row) return;
    mapa[row] = {
      cartaEscrita: r[COL.PREDIOS_APTOS.CARTA_ESCRITA]
        ? new Date(r[COL.PREDIOS_APTOS.CARTA_ESCRITA]).getTime() : 0,
      cartaEntregue: r[COL.PREDIOS_APTOS.CARTA_ENTREGUE]
        ? new Date(r[COL.PREDIOS_APTOS.CARTA_ENTREGUE]).getTime() : 0,
      desocupado: r[COL.PREDIOS_APTOS.DESOCUPADO] === true
                  || String(r[COL.PREDIOS_APTOS.DESOCUPADO]).toUpperCase() === 'TRUE',
      naoEscrever: r[COL.PREDIOS_APTOS.NAO_ESCREVER] === true
                  || String(r[COL.PREDIOS_APTOS.NAO_ESCREVER]).toUpperCase() === 'TRUE'
    };
  });
  return mapa;
}

// Mapa { row -> {tipo, dataMs} } com o ÚLTIMO desfecho registrado por
// endereço. Lê a aba Registros e indexa por endereço:row. Usado pra
// mostrar "antes" tanto no painel do publicador quanto na lista de
// aptos do trabalho de cartas.
function _ultimoDesfechoPorRow_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetReg = ss.getSheetByName(SHEET.REGISTROS);
  if (!sheetReg || sheetReg.getLastRow() < 2) return {};
  var dados = sheetReg.getRange(2, 1, sheetReg.getLastRow() - 1, 4).getValues();
  var mapa = {};
  // Tipos que contam como "desfecho" do publicador (Pacote F).
  // 'carta' fica de fora — é flag separada.
  var TIPOS_DESFECHO = { naoAtendeu: 1, semConversa: 1, conversou: 1, interfone: 1 };
  dados.forEach(function(r){
    var id = String(r[0] || '');
    if (id.indexOf('endereco:') !== 0) return;
    var row = Number(id.slice(9));
    if (!row) return;
    var tipo = String(r[2] || '');
    if (!TIPOS_DESFECHO[tipo]) return;
    var ts = r[3] ? new Date(r[3]).getTime() : 0;
    if (!mapa[row] || ts > mapa[row].dataMs) {
      mapa[row] = { tipo: tipo, dataMs: ts };
    }
  });
  return mapa;
}

// Lista os aptos (endereços) de UM prédio específico, enriquecidos com
// status individual (carta escrita/entregue/desocupado) e último
// desfecho. Usado pelo link público focado num prédio.
function listarAptosDoPredio(chave) {
  if (!chave) return { ok: false, erro: 'chave obrigatória' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetD = ss.getSheetByName(SHEET.DADOS);
  if (!sheetD || sheetD.getLastRow() < 2) return { ok: true, predio: null, aptos: [] };

  var dados = sheetD.getRange(2, 1, sheetD.getLastRow() - 1, sheetD.getLastColumn()).getValues();
  var aptos = [];
  dados.forEach(function(r, i){
    var log = String(r[COL.DADOS.LOGRADOURO] || '').trim();
    var num = String(r[COL.DADOS.NUMERO] || '').trim();
    if (_chavePredio_(log, num) !== chave) return;
    aptos.push({
      row: i + 2,
      complemento: String(r[COL.DADOS.COMPLEMENTO] || ''),
      tipo: String(r[COL.DADOS.TIPO] || ''),
      nome: String(r[COL.DADOS.NOME_EDIF] || ''),
      logradouro: log, numero: num
    });
  });

  if (aptos.length === 0) return { ok: false, erro: 'Prédio não encontrado' };

  var overlay = _mapaOverlaysPredios_()[chave] || {};
  var status = _mapaAptosStatus_();
  var ultimos = _ultimoDesfechoPorRow_();
  var tz = Session.getScriptTimeZone();

  aptos.forEach(function(a){
    var s = status[a.row] || {};
    a.cartaEscritaStr = s.cartaEscrita
      ? Utilities.formatDate(new Date(s.cartaEscrita), tz, 'dd/MM/yyyy') : '';
    a.cartaEntregueStr = s.cartaEntregue
      ? Utilities.formatDate(new Date(s.cartaEntregue), tz, 'dd/MM/yyyy') : '';
    a.desocupado = !!s.desocupado;
    a.naoEscrever = !!s.naoEscrever;
    var u = ultimos[a.row];
    a.ultimoTipo = u ? u.tipo : '';
    a.ultimoDataStr = u && u.dataMs
      ? Utilities.formatDate(new Date(u.dataMs), tz, 'dd/MM/yyyy') : '';
  });

  // Ordena por complemento alfanumérico (apto 101, 102, 201...)
  aptos.sort(function(a, b){
    return String(a.complemento).localeCompare(String(b.complemento), 'pt-BR', { numeric: true });
  });

  var nomeAuto = '';
  for (var i = 0; i < aptos.length; i++) {
    if (aptos[i].nome) { nomeAuto = aptos[i].nome; break; }
  }
  var predio = {
    chave: chave,
    nome: overlay.nome || nomeAuto || (aptos[0].logradouro + ', ' + aptos[0].numero),
    logradouro: aptos[0].logradouro,
    numero: aptos[0].numero,
    qtdEnderecos: aptos.length,
    irmaoMora: !!overlay.irmaoMora,
    nomeIrmao: overlay.nomeIrmao || '',
    acessoInterfone: overlay.acessoInterfone || '',
    tipoEntrada: overlay.tipoEntrada || '',
    acessoCaixas: !!overlay.acessoCaixas,
    acessoInterfones: !!overlay.acessoInterfones,
    naoEhPredio: !!overlay.naoEhPredio
  };
  return { ok: true, predio: predio, aptos: aptos };
}

function atualizarAptoStatus(row, patch) {
  var rowNum = parseInt(row, 10);
  if (!rowNum || rowNum < 2) return { ok: false, erro: 'row inválida' };
  return withLock_(function(){
    var sh = ensureSheetPrediosAptos_();
    var linha = _acharLinhaAptoPorRow_(sh, rowNum);
    if (linha < 0) {
      sh.appendRow([rowNum, '', '', false, new Date(), false]);
      linha = sh.getLastRow();
    }
    var mapa = {
      cartaEscrita:   COL.PREDIOS_APTOS.CARTA_ESCRITA_1IDX,
      cartaEntregue:  COL.PREDIOS_APTOS.CARTA_ENTREGUE_1IDX,
      desocupado:     COL.PREDIOS_APTOS.DESOCUPADO_1IDX,
      naoEscrever:    COL.PREDIOS_APTOS.NAO_ESCREVER_1IDX
    };
    Object.keys(patch || {}).forEach(function(k){
      if (!(k in mapa)) return;
      var valor = patch[k];
      if (k === 'desocupado' || k === 'naoEscrever') valor = valor === true;
      else if (valor === true) valor = new Date(); // toggle on com data atual
      else if (valor === false || valor === null || valor === '') valor = '';
      else if (typeof valor === 'string') valor = new Date(valor + 'T00:00:00');
      sh.getRange(linha, mapa[k]).setValue(valor);
    });
    sh.getRange(linha, COL.PREDIOS_APTOS.ATUALIZADO_1IDX).setValue(new Date());
    _invalidar();
    return { ok: true };
  });
}

// =================================================================
// PACOTE F — Desfecho de visita por endereço (Publico.html)
// =================================================================
// Registra o desfecho de tentativa de visita num endereço específico.
// Tipos aceitos: 'naoAtendeu', 'semConversa', 'conversou'.
// 'carta' tem endpoint separado (registrarCartaEndereco) por ser flag
// independente.
function registrarDesfechoEndereco(row, tipo) {
  var rowNum = parseInt(row, 10);
  if (!rowNum || rowNum < 2) return { ok: false, erro: 'row inválida' };
  // tipo vazio = undo (publicador desmarcou). Registra como 'desfeito'
  // pra preservar trilha de auditoria em Registros.
  var TIPOS_VALIDOS = { naoAtendeu: 1, semConversa: 1, conversou: 1, '': 1 };
  if (!TIPOS_VALIDOS[tipo == null ? '' : tipo]) return { ok: false, erro: 'tipo inválido' };
  var tipoFinal = tipo === '' || tipo == null ? 'desfeito' : tipo;
  return withLock_(function(){
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetD = getSheetByName_(SHEET.DADOS);
    if (sheetD && rowNum > sheetD.getLastRow()) {
      return { ok: false, erro: 'row fora do range' };
    }
    var sheetReg = getSheetByName_(SHEET.REGISTROS);
    if (!sheetReg) {
      sheetReg = ss.insertSheet(SHEET.REGISTROS);
      sheetReg.appendRow(["ID", "Data", "Tipo", "TS"]);
    }
    sheetReg.appendRow([
      'endereco:' + rowNum,
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      tipoFinal,
      new Date()
    ]);
    // Mantém compat: atualiza coluna ULT_VISITA na Dados Brutos pra
    // não quebrar quem depende dela (filtros do publicador, etc).
    if (sheetD) {
      sheetD.getRange(rowNum, 20).setValue(sheetD.getRange(rowNum, 19).getValue());
      sheetD.getRange(rowNum, 19).setValue(new Date());
    }
    _invalidar();
    return { ok: true };
  });
}

// =================================================================
// RENOMEAÇÃO EM MASSA DE QUADRAS POR TERRITÓRIO
// Atualiza ID em cascata: Quadras, Dados Brutos.QUADRA,
// Territorios.IDS_QUADRAS (CSV), Designacoes.IDS_QUADRAS (CSV) e
// Registros (eventos por quadra). Tudo numa transação.
// =================================================================

// Preview do que VAI mudar — sem aplicar. Devolve mapa idAntigo→idNovo
// pra o admin confirmar.
function previewRenomearQuadras(nomeTerr, prefixo) {
  if (!nomeTerr || !prefixo) return { ok: false, erro: 'parâmetros obrigatórios' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetQ = ss.getSheetByName(SHEET.QUADRAS);
  if (!sheetQ) return { ok: false, erro: 'aba Quadras não encontrada' };
  var dataQ = sheetQ.getDataRange().getValues();
  var quadras = [];
  for (var i = 1; i < dataQ.length; i++) {
    var terr = String(dataQ[i][COL.QUADRAS.TERRITORIO] || '').trim();
    if (terr !== nomeTerr) continue;
    var idAtual = String(dataQ[i][COL.QUADRAS.ID] || '').trim();
    if (idAtual) quadras.push(idAtual);
  }
  if (quadras.length === 0) return { ok: false, erro: 'Sem quadras nesse território' };
  // Ordena por id natural (Q-1, Q-2, Q-10 numérico)
  quadras.sort(function(a, b){ return a.localeCompare(b, 'pt-BR', { numeric: true }); });
  var letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var mapa = {};
  quadras.forEach(function(id, idx){
    var letra;
    if (idx < 26) letra = letras[idx];
    else letra = letras[Math.floor(idx/26) - 1] + letras[idx % 26]; // AA, AB...
    mapa[id] = prefixo + letra;
  });
  return { ok: true, mapa: mapa, total: quadras.length };
}

// ordemIds opcional: lista de ids do território na ORDEM em que o
// usuário quer que recebam A, B, C, D... Se ausente, ordena
// automaticamente (compat).
function renomearQuadrasDoTerritorio(nomeTerr, prefixo, ordemIds) {
  if (!nomeTerr || !prefixo) return { ok: false, erro: 'parâmetros obrigatórios' };
  return withLock_(function(){
    var mapa;
    if (Array.isArray(ordemIds) && ordemIds.length > 0) {
      // Modo manual: ordem fornecida pelo usuário
      var letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      mapa = {};
      ordemIds.forEach(function(id, idx){
        var letra;
        if (idx < 26) letra = letras[idx];
        else letra = letras[Math.floor(idx/26) - 1] + letras[idx % 26];
        mapa[String(id).trim()] = prefixo + letra;
      });
      // Garante que TODAS as quadras do território estão na lista
      var ssCheck = SpreadsheetApp.getActiveSpreadsheet();
      var sQCheck = ssCheck.getSheetByName(SHEET.QUADRAS);
      var dQCheck = sQCheck.getDataRange().getValues();
      var faltam = [];
      for (var ic = 1; ic < dQCheck.length; ic++) {
        var terrC = String(dQCheck[ic][COL.QUADRAS.TERRITORIO] || '').trim();
        if (terrC !== nomeTerr) continue;
        var idC = String(dQCheck[ic][COL.QUADRAS.ID] || '').trim();
        if (idC && !(idC in mapa)) faltam.push(idC);
      }
      if (faltam.length > 0) {
        return { ok: false, erro: 'Faltam quadras na ordem: ' + faltam.join(', ') };
      }
    } else {
      var prev = previewRenomearQuadras(nomeTerr, prefixo);
      if (!prev.ok) return prev;
      mapa = prev.mapa;
    }

    // Detecta conflitos: algum dos NOVOS ids já existe em outro
    // território? Não pode sobrescrever quadra que não é nossa.
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetQ = ss.getSheetByName(SHEET.QUADRAS);
    var dataQ = sheetQ.getDataRange().getValues();
    var idsFora = {};
    for (var i = 1; i < dataQ.length; i++) {
      var terr = String(dataQ[i][COL.QUADRAS.TERRITORIO] || '').trim();
      var idA = String(dataQ[i][COL.QUADRAS.ID] || '').trim();
      if (idA && terr !== nomeTerr) idsFora[idA] = true;
    }
    var conflitos = [];
    Object.keys(mapa).forEach(function(antigo){
      var novo = mapa[antigo];
      if (novo !== antigo && idsFora[novo]) conflitos.push(novo);
    });
    if (conflitos.length > 0) {
      return { ok: false, erro: 'IDs já em uso em outros territórios: ' + conflitos.join(', ') };
    }

    // 1. Atualiza Quadras.ID (com 1 batch — mais rápido)
    var updatesQ = [];
    for (var i2 = 1; i2 < dataQ.length; i2++) {
      var idAtual = String(dataQ[i2][COL.QUADRAS.ID] || '').trim();
      if (mapa[idAtual] && mapa[idAtual] !== idAtual) {
        updatesQ.push({ linha: i2 + 1, novo: mapa[idAtual] });
      }
    }
    updatesQ.forEach(function(u){
      sheetQ.getRange(u.linha, COL.QUADRAS.ID_1IDX).setValue(u.novo);
    });

    // Cascata nas outras abas (Dados, Territorios, Designacoes, Registros)
    _propagarRenomeacaoIds_(mapa);

    _invalidar();
    return { ok: true, renomeadas: Object.keys(mapa).length, mapa: mapa };
  });
}

// Propaga renomeação de IDs de quadra pras abas dependentes. NÃO toca
// na Quadras — quem chama é responsável por isso. Usado por:
//   - renomearQuadrasDoTerritorio (operação em massa)
//   - salvarEdicaoQuadra (edição manual individual)
// IMPORTANTE: assume que já está dentro de withLock_.
function _propagarRenomeacaoIds_(mapa) {
  if (!mapa || Object.keys(mapa).length === 0) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Dados Brutos — coluna QUADRA
  var sheetD = ss.getSheetByName(SHEET.DADOS);
  if (sheetD && sheetD.getLastRow() > 1) {
    var range = sheetD.getRange(2, COL.DADOS.QUADRA_1IDX, sheetD.getLastRow() - 1, 1);
    var vals = range.getValues();
    var alterado = false;
    for (var d = 0; d < vals.length; d++) {
      var id = String(vals[d][0] || '').trim();
      if (mapa[id] && mapa[id] !== id) { vals[d][0] = mapa[id]; alterado = true; }
    }
    if (alterado) range.setValues(vals);
  }

  // 2. Territorios.IDS_QUADRAS (CSV)
  var sheetT = ss.getSheetByName(SHEET.TERRITORIOS)
            || ss.getSheetByName('Territórios');
  if (sheetT && sheetT.getLastRow() > 1) {
    var dataT = sheetT.getDataRange().getValues();
    for (var t = 1; t < dataT.length; t++) {
      var csv = String(dataT[t][COL.TERRITORIOS.IDS_QUADRAS] || '');
      if (!csv) continue;
      var ids = csv.split(',').map(function(s){ return s.trim(); });
      var novo = ids.map(function(id){ return mapa[id] || id; });
      if (novo.join(',') !== ids.join(',')) {
        sheetT.getRange(t + 1, COL.TERRITORIOS.IDS_QUADRAS_1IDX).setValue(novo.join(','));
      }
    }
  }

  // 3. Designacoes.IDS_QUADRAS (CSV)
  var sheetDes = ss.getSheetByName(SHEET.DESIGNACOES);
  if (sheetDes && sheetDes.getLastRow() > 1) {
    var dataDes = sheetDes.getRange(2, 1, sheetDes.getLastRow() - 1, 7).getValues();
    for (var ds = 0; ds < dataDes.length; ds++) {
      var csvD = String(dataDes[ds][COL.DESIGNACOES.IDS_QUADRAS] || '');
      if (!csvD) continue;
      var idsD = csvD.split(',').map(function(s){ return s.trim(); });
      var novoD = idsD.map(function(id){ return mapa[id] || id; });
      if (novoD.join(',') !== idsD.join(',')) {
        sheetDes.getRange(ds + 2, COL.DESIGNACOES.IDS_QUADRAS_1IDX).setValue(novoD.join(','));
      }
    }
  }

  // 4. Registros — coluna ID (eventos por quadra; 'endereco:*' não bate)
  var sheetReg = ss.getSheetByName(SHEET.REGISTROS);
  if (sheetReg && sheetReg.getLastRow() > 1) {
    var rangeR = sheetReg.getRange(2, 1, sheetReg.getLastRow() - 1, 1);
    var valsR = rangeR.getValues();
    var alteradoR = false;
    for (var r = 0; r < valsR.length; r++) {
      var id2 = String(valsR[r][0] || '').trim();
      if (mapa[id2]) { valsR[r][0] = mapa[id2]; alteradoR = true; }
    }
    if (alteradoR) rangeR.setValues(valsR);
  }
}

// Lista nomes de territórios com qtd de quadras, pra popular o select
// no modal de renomeação.
function listarTerritoriosComContagem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetQ = ss.getSheetByName(SHEET.QUADRAS);
  if (!sheetQ) return [];
  var dataQ = sheetQ.getDataRange().getValues();
  var mapa = {};
  for (var i = 1; i < dataQ.length; i++) {
    var terr = String(dataQ[i][COL.QUADRAS.TERRITORIO] || '').trim();
    if (!terr) continue;
    mapa[terr] = (mapa[terr] || 0) + 1;
  }
  return Object.keys(mapa)
    .sort(function(a, b){ return a.localeCompare(b, 'pt-BR', { numeric: true }); })
    .map(function(n){ return { nome: n, qtd: mapa[n] }; });
}

// =================================================================
// TERRITÓRIOS COMERCIAIS ESPECIAIS (TCE)
// Atravessam fronteiras de quadras: agrupam endereços comerciais
// avulsos. Não estão na hierarquia Quadras → Territórios.
// =================================================================

function ensureSheetTerritoriosEsp_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET.TERRITORIOS_ESP);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET.TERRITORIOS_ESP);
  sh.appendRow([
    'id', 'nome', 'tipo', 'rows', 'polyString',
    'publicador', 'prazo', 'status', 'criado', 'dataConc', 'notas'
  ]);
  sh.setFrozenRows(1);
  return sh;
}

function _gerarIdTCE_() {
  return 'tce_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function _linhaParaTCE_(r) {
  var rows = String(r[COL.TERRITORIOS_ESP.ROWS] || '')
    .split(',').map(function(s){ return parseInt(s.trim(), 10); })
    .filter(function(n){ return !isNaN(n) && n > 0; });
  return {
    id:         String(r[COL.TERRITORIOS_ESP.ID] || ''),
    nome:       String(r[COL.TERRITORIOS_ESP.NOME] || ''),
    tipo:       String(r[COL.TERRITORIOS_ESP.TIPO] || 'comercial'),
    rows:       rows,
    polyString: String(r[COL.TERRITORIOS_ESP.POLYSTRING] || ''),
    publicador: String(r[COL.TERRITORIOS_ESP.PUBLICADOR] || ''),
    prazo:      r[COL.TERRITORIOS_ESP.PRAZO] ? new Date(r[COL.TERRITORIOS_ESP.PRAZO]).getTime() : 0,
    status:     String(r[COL.TERRITORIOS_ESP.STATUS] || STATUS_TCE.ABERTO),
    criado:     r[COL.TERRITORIOS_ESP.CRIADO] ? new Date(r[COL.TERRITORIOS_ESP.CRIADO]).getTime() : 0,
    dataConc:   r[COL.TERRITORIOS_ESP.DATA_CONC] ? new Date(r[COL.TERRITORIOS_ESP.DATA_CONC]).getTime() : 0,
    notas:      String(r[COL.TERRITORIOS_ESP.NOTAS] || '')
  };
}

// Cria um TCE. payload = { nome, tipo, rows[], polyString, publicador?,
// prazo?, notas? }. polyString é o convex hull computado no front.
function criarTerritorioComercial(payload) {
  if (!payload || !payload.nome) return { ok: false, erro: 'Nome obrigatório' };
  if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
    return { ok: false, erro: 'Selecione ao menos 1 endereço' };
  }
  var prazoDate = null;
  if (payload.prazo) {
    var v = validarData_(payload.prazo);
    if (!v.ok) return { ok: false, erro: 'Prazo inválido: ' + v.msg };
    prazoDate = new Date(payload.prazo + 'T00:00:00');
  }
  return withLock_(function(){
    var sh = ensureSheetTerritoriosEsp_();
    var id = _gerarIdTCE_();
    var rowsStr = payload.rows.map(function(r){ return parseInt(r, 10); })
      .filter(function(n){ return n > 0; }).join(',');
    sh.appendRow([
      id,
      sanitizar_(payload.nome),
      sanitizar_(payload.tipo || 'comercial'),
      rowsStr,
      String(payload.polyString || ''),
      sanitizar_(payload.publicador || ''),
      prazoDate || '',
      STATUS_TCE.ABERTO,
      new Date(),
      '',
      sanitizar_(payload.notas || '')
    ]);
    _invalidar();
    return { ok: true, id: id };
  });
}

function _acharLinhaTCE_(sh, id) {
  var ult = sh.getLastRow();
  if (ult < 2) return -1;
  var col = sh.getRange(2, 1, ult - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]) === String(id)) return i + 2;
  return -1;
}

// Lista TCEs (com filtro opcional só dos abertos)
function listarTerritoriosComerciais(somenteAbertos) {
  var sh = ensureSheetTerritoriosEsp_();
  if (sh.getLastRow() < 2) return [];
  var dados = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
  return dados.map(_linhaParaTCE_).filter(function(t){
    if (!t.id) return false;
    if (somenteAbertos && t.status !== STATUS_TCE.ABERTO) return false;
    return true;
  });
}

// Mapa { row → {tceId, nome, publicador, prazo} } pra UI consultar se
// um endereço está em algum TCE aberto. Usado pra esmaecer + badge
// no painel do publicador residencial.
function getEnderecosEmTCE() {
  var tces = listarTerritoriosComerciais(true);
  var mapa = {};
  tces.forEach(function(t){
    t.rows.forEach(function(row){
      mapa[row] = { tceId: t.id, nome: t.nome, publicador: t.publicador, prazo: t.prazo };
    });
  });
  return mapa;
}

// Devolve dados pra renderizar o TCE no link público (?v=publico&te=ID)
// Aceita TCE concluído/cancelado — devolve com flag pro frontend
// mostrar em modo read-only ("Concluído em DD/MM").
function getDadosTCE(id) {
  if (!id) return { ok: false, erro: 'id obrigatório' };
  var sh = ensureSheetTerritoriosEsp_();
  var linha = _acharLinhaTCE_(sh, id);
  if (linha < 0) return { ok: false, erro: 'Território comercial não encontrado' };
  var t = _linhaParaTCE_(sh.getRange(linha, 1, 1, 11).getValues()[0]);

  // Busca endereços nas rows
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetD = ss.getSheetByName(SHEET.DADOS);
  if (!sheetD) return { ok: false, erro: 'Dados Brutos não encontrada' };
  var lastCol = sheetD.getLastColumn();
  var ultimos = _ultimoDesfechoPorRow_();
  var enderecos = [];
  t.rows.forEach(function(row){
    if (row < 2 || row > sheetD.getLastRow()) return;
    var r = sheetD.getRange(row, 1, 1, lastCol).getValues()[0];
    var u = ultimos[row];
    enderecos.push({
      row: row,
      logradouro: String(r[COL.DADOS.LOGRADOURO] || ''),
      numero: String(r[COL.DADOS.NUMERO] || ''),
      complemento: String(r[COL.DADOS.COMPLEMENTO] || ''),
      lat: r[COL.DADOS.LAT], lng: r[COL.DADOS.LNG],
      tipo: String(r[COL.DADOS.TIPO] || ''),
      nome: String(r[COL.DADOS.NOME_EDIF] || ''),
      nota: String(r[COL.DADOS.NOTA] || ''),
      ultimoTipo: u ? u.tipo : '',
      ultimoDataStr: u && u.dataMs
        ? Utilities.formatDate(new Date(u.dataMs), 'GMT-3', 'dd/MM/yy') : ''
    });
  });

  var dataConcStr = t.dataConc
    ? Utilities.formatDate(new Date(t.dataConc), 'GMT-3', 'dd/MM/yyyy') : '';

  return {
    ok: true,
    tce: {
      id: t.id, nome: t.nome, tipo: t.tipo,
      polyString: t.polyString, publicador: t.publicador,
      prazo: t.prazo, status: t.status, total: enderecos.length,
      dataConcStr: dataConcStr,
      // Frontend usa pra renderizar em modo read-only
      readonly: t.status !== STATUS_TCE.ABERTO
    },
    enderecos: enderecos
  };
}

function concluirTerritorioComercial(id) {
  return withLock_(function(){
    var sh = ensureSheetTerritoriosEsp_();
    var linha = _acharLinhaTCE_(sh, id);
    if (linha < 0) return { ok: false, erro: 'TCE não encontrado' };
    sh.getRange(linha, COL.TERRITORIOS_ESP.STATUS_1IDX).setValue(STATUS_TCE.CONCLUIDO);
    sh.getRange(linha, COL.TERRITORIOS_ESP.DATA_CONC_1IDX).setValue(new Date());
    _invalidar();
    return { ok: true };
  });
}

function cancelarTerritorioComercial(id) {
  return withLock_(function(){
    var sh = ensureSheetTerritoriosEsp_();
    var linha = _acharLinhaTCE_(sh, id);
    if (linha < 0) return { ok: false, erro: 'TCE não encontrado' };
    sh.getRange(linha, COL.TERRITORIOS_ESP.STATUS_1IDX).setValue(STATUS_TCE.CANCELADO);
    _invalidar();
    return { ok: true };
  });
}

// Reabre um TCE concluído/cancelado: volta o status pra "aberto",
// limpa data de conclusão. Endereços continuam os mesmos, publicador
// e prazo são preservados (se quiser zerar, edita depois).
function reabrirTerritorioComercial(id) {
  return withLock_(function(){
    var sh = ensureSheetTerritoriosEsp_();
    var linha = _acharLinhaTCE_(sh, id);
    if (linha < 0) return { ok: false, erro: 'TCE não encontrado' };
    sh.getRange(linha, COL.TERRITORIOS_ESP.STATUS_1IDX).setValue(STATUS_TCE.ABERTO);
    sh.getRange(linha, COL.TERRITORIOS_ESP.DATA_CONC_1IDX).setValue('');
    _invalidar();
    return { ok: true };
  });
}

// Reutiliza um TCE antigo criando um NOVO com os mesmos endereços e
// polígono. Útil pra começar ciclo novo sem perder histórico do antigo.
// payload pode sobrescrever publicador/prazo/nome.
function reutilizarTerritorioComercial(idAntigo, payload) {
  if (!idAntigo) return { ok: false, erro: 'id obrigatório' };
  var sh = ensureSheetTerritoriosEsp_();
  var linha = _acharLinhaTCE_(sh, idAntigo);
  if (linha < 0) return { ok: false, erro: 'TCE não encontrado' };
  var t = _linhaParaTCE_(sh.getRange(linha, 1, 1, 11).getValues()[0]);
  if (t.rows.length === 0) return { ok: false, erro: 'TCE sem endereços' };

  // Monta payload da criação a partir do antigo + overrides
  var novo = {
    nome: (payload && payload.nome) || t.nome,
    tipo: t.tipo,
    rows: t.rows,
    polyString: t.polyString,
    publicador: (payload && typeof payload.publicador === 'string') ? payload.publicador : '',
    prazo: (payload && payload.prazo) || '',
    notas: (payload && payload.notas) || ''
  };
  return criarTerritorioComercial(novo);
}

// =================================================================
// DENSIDADE DE PRÉDIOS POR QUADRA
// Pra UI mostrar quadras com mais/menos prédios — não conta endereços
// individuais (aptos mascaram), conta agrupamentos por logradouro+numero.
// Útil pro servo e dirigente saberem onde tem mais trabalho concentrado.
// =================================================================
function getDensidadePredios() {
  // Cache 5min — chamado por getDadosComContexto em todo load de publico
  // e dirigente. Sem cache, relê Dados Brutos inteiro toda vez = lento.
  var cache = CacheService.getScriptCache();
  var cached = cache.get('DENSIDADE_PREDIOS_V1');
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetD = ss.getSheetByName(SHEET.DADOS);
  if (!sheetD || sheetD.getLastRow() < 2) return {};

  // Agrupa por (quadra, logradouro+numero) e conta os que têm ≥2 endereços
  var data = sheetD.getRange(2, 1, sheetD.getLastRow() - 1, sheetD.getLastColumn()).getValues();
  var contagem = {}; // { quadraId: { chavePredio: qtd } }
  data.forEach(function(r){
    var q = String(r[COL.DADOS.QUADRA] || '').trim();
    var log = String(r[COL.DADOS.LOGRADOURO] || '').trim();
    var num = String(r[COL.DADOS.NUMERO] || '').trim();
    if (!q || !log || !num) return;
    var chave = log.toLowerCase() + '|' + num.toLowerCase();
    if (!contagem[q]) contagem[q] = {};
    contagem[q][chave] = (contagem[q][chave] || 0) + 1;
  });
  var resultado = {};
  Object.keys(contagem).forEach(function(q){
    var qtd = 0;
    Object.keys(contagem[q]).forEach(function(c){
      if (contagem[q][c] >= 2) qtd++; // prédio = ≥2 endereços no mesmo número
    });
    resultado[q] = qtd;
  });
  try { cache.put('DENSIDADE_PREDIOS_V1', JSON.stringify(resultado), 300); } catch(e) {}
  return resultado;
}

// =================================================================
// AUTO-VINCULAÇÃO DE ENDEREÇOS A QUADRAS — algoritmo geométrico
// (point-in-polygon)
//
// Pra cada cluster (setor IBGE + quadra IBGE) conta quantos endereços
// estão GEOMETRICAMENTE dentro de cada polígono de quadra do app.
// O cluster é vinculado à quadra com maior porcentagem de pontos
// dentro, desde que ≥60% do cluster esteja contido (alta confiança).
// Funciona MESMO sem nenhum vínculo manual prévio.
// =================================================================

// Ray-casting clássico. polygon = [[lat,lng], [lat,lng], ...]. point [lat,lng].
function _pontoNoPoligono_(point, polygon) {
  var x = point[0], y = point[1];
  var inside = false;
  for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    var xi = polygon[i][0], yi = polygon[i][1];
    var xj = polygon[j][0], yj = polygon[j][1];
    var intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Bounding box do polígono — pra short-circuit antes do ray-cast
function _bboxPoligono_(polygon) {
  var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  polygon.forEach(function(p){
    if (p[0] < minLat) minLat = p[0];
    if (p[0] > maxLat) maxLat = p[0];
    if (p[1] < minLng) minLng = p[1];
    if (p[1] > maxLng) maxLng = p[1];
  });
  return { minLat: minLat, maxLat: maxLat, minLng: minLng, maxLng: maxLng };
}

function _parsePolyStr_(s) {
  if (!s) return null;
  var pts = String(s).split('|').map(function(p){
    var c = p.trim().split(',');
    return [parseFloat(c[0]), parseFloat(c[1])];
  }).filter(function(p){ return !isNaN(p[0]) && !isNaN(p[1]); });
  return pts.length >= 3 ? pts : null;
}

function autoVincularEnderecos() {
  return withLock_(function(){
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetD = ss.getSheetByName(SHEET.DADOS);
    var sheetQ = ss.getSheetByName(SHEET.QUADRAS);
    if (!sheetD || sheetD.getLastRow() < 2) return { ok: false, erro: 'Dados Brutos vazia' };
    if (!sheetQ || sheetQ.getLastRow() < 2) return { ok: false, erro: 'Aba Quadras vazia' };

    var ult = sheetD.getLastRow();
    var lastCol = sheetD.getLastColumn();
    var dados = sheetD.getRange(2, 1, ult - 1, lastCol).getValues();

    // 1. Carrega quadras do app com polígonos
    var dataQ = sheetQ.getRange(2, 1, sheetQ.getLastRow() - 1, sheetQ.getLastColumn()).getValues();
    var quadrasApp = [];
    dataQ.forEach(function(r){
      var id = String(r[COL.QUADRAS.ID] || '').trim();
      var st = String(r[COL.QUADRAS.STATUS] || '');
      if (!id || st === 'Inativa') return; // ignora inativa
      var poly = _parsePolyStr_(r[COL.QUADRAS.POLYSTRING]);
      if (!poly) return;
      quadrasApp.push({ id: id, polygon: poly, bbox: _bboxPoligono_(poly) });
    });

    // 2. Agrupa endereços por (setor + quadraIBGE), guardando lat/lng
    var clusters = {};
    dados.forEach(function(r, i){
      var setor = String(r[COL.DADOS.SETOR_1IDX - 1] || '').trim();
      var qIBGE = String(r[COL.DADOS.QUADRA_IBGE] || '').trim();
      if (!setor || !qIBGE) return;
      var lat = parseFloat(r[COL.DADOS.LAT]);
      var lng = parseFloat(r[COL.DADOS.LNG]);
      // (setor + quadraIBGE) é a unidade INDIVISÍVEL do IBGE — todas
      // as faces dessa quadra ficam dentro de UMA quadra do app.
      // Vínculos divergentes dentro dum cluster são INCONSISTÊNCIA
      // da planilha (alguém vinculou metade pra Q-8 e metade pra Q-9).
      var chave = setor + '|' + qIBGE;
      if (!clusters[chave]) clusters[chave] = { rows: [], pontos: [], vinculos: {}, setor: setor, qIBGE: qIBGE };
      clusters[chave].rows.push(i);
      if (!isNaN(lat) && !isNaN(lng)) clusters[chave].pontos.push([lat, lng]);
      var qApp = String(r[COL.DADOS.QUADRA] || '').trim();
      if (qApp) {
        if (!clusters[chave].vinculos[qApp]) clusters[chave].vinculos[qApp] = 0;
        clusters[chave].vinculos[qApp]++;
      }
    });

    // 3. Pra cada cluster: testa point-in-polygon contra cada quadra,
    //    e escolhe a quadra com MAIS pontos contidos. Se ≥60% dos pontos
    //    do cluster estão dentro → match com alta confiança.
    var THRESHOLD = 0.6; // 60%
    var vinculadosAuto = 0;
    var clustersIncertos = [];
    Object.keys(clusters).forEach(function(chave){
      var c = clusters[chave];
      // c.vinculos é mapa { quadraApp: qtd_endereços }
      var vinculos = Object.keys(c.vinculos);

      // Caso 1: vínculo único — propaga pros endereços sem vínculo
      if (vinculos.length === 1) {
        var quadraAlvo = vinculos[0];
        c.rows.forEach(function(idx){
          if (!String(dados[idx][COL.DADOS.QUADRA] || '').trim()) {
            dados[idx][COL.DADOS.QUADRA] = quadraAlvo;
            vinculadosAuto++;
          }
        });
        return;
      }

      // Sem pontos georreferenciados, não dá pra usar geometria
      if (c.pontos.length === 0) {
        clustersIncertos.push({
          chave: chave, totalEnderecos: c.rows.length,
          motivo: 'Sem coordenadas pra usar geometria',
          exemploRows: c.rows.slice(0, 3).map(function(i){ return i + 2; }),
          melhorMatch: null,
          pontos: []
        });
        return;
      }

      // Conta pontos dentro de cada quadra
      var contagens = {};
      c.pontos.forEach(function(pt){
        quadrasApp.forEach(function(q){
          var b = q.bbox;
          if (pt[0] < b.minLat || pt[0] > b.maxLat || pt[1] < b.minLng || pt[1] > b.maxLng) return;
          if (_pontoNoPoligono_(pt, q.polygon)) {
            contagens[q.id] = (contagens[q.id] || 0) + 1;
          }
        });
      });

      // Pega a quadra com mais matches
      var melhorId = '', melhorQtd = 0;
      Object.keys(contagens).forEach(function(id){
        if (contagens[id] > melhorQtd) { melhorId = id; melhorQtd = contagens[id]; }
      });
      var pct = c.pontos.length > 0 ? melhorQtd / c.pontos.length : 0;

      // Decisão
      if (vinculos.length > 1) {
        // INCONSISTÊNCIA: a mesma quadra-IBGE está vinculada a mais
        // de uma quadra do app. IBGE garante que isso é erro. Reporta
        // com contagem por quadra pra user decidir qual é a certa.
        var detalhe = vinculos.map(function(q){ return q + ': ' + c.vinculos[q]; }).join(', ');
        // Quadra mais provável: maior contagem entre as já vinculadas
        var maiorQtd = 0, sugestao = '';
        vinculos.forEach(function(q){
          if (c.vinculos[q] > maiorQtd) { maiorQtd = c.vinculos[q]; sugestao = q; }
        });
        clustersIncertos.push({
          chave: chave, totalEnderecos: c.rows.length,
          motivo: '⚠ Inconsistência — ' + detalhe,
          exemploRows: c.rows.slice(0, 3).map(function(i){ return i + 2; }),
          inconsistente: true,
          vinculosCont: c.vinculos,
          // Sugestão é a maioria; geometria como segundo critério
          melhorMatch: (sugestao || melhorId)
            ? { id: sugestao || melhorId, pct: Math.round(pct * 100), qtd: melhorQtd || 0, total: c.rows.length }
            : null,
          pontos: c.pontos.slice(0, 30)
        });
      } else if (pct >= THRESHOLD && melhorId) {
        // Alta confiança — vincula todos os endereços do cluster
        c.rows.forEach(function(idx){
          if (!String(dados[idx][COL.DADOS.QUADRA] || '').trim()) {
            dados[idx][COL.DADOS.QUADRA] = melhorId;
            vinculadosAuto++;
          }
        });
      } else {
        // Baixa confiança — relata pra revisão
        clustersIncertos.push({
          chave: chave, totalEnderecos: c.rows.length,
          motivo: melhorId
            ? 'Confiança baixa (' + Math.round(pct * 100) + '%) — melhor candidata: ' + melhorId
            : 'Nenhuma quadra contém os pontos',
          exemploRows: c.rows.slice(0, 3).map(function(i){ return i + 2; }),
          melhorMatch: melhorId ? { id: melhorId, pct: Math.round(pct * 100), qtd: melhorQtd, total: c.pontos.length } : null,
          pontos: c.pontos.slice(0, 30)
        });
      }
    });

    // 4. Persiste em batch
    if (vinculadosAuto > 0) {
      var colA = dados.map(function(r){ return [r[COL.DADOS.QUADRA]]; });
      sheetD.getRange(2, 1, ult - 1, 1).setValues(colA);
    }
    _invalidar();
    return {
      ok: true,
      vinculados: vinculadosAuto,
      incertos: clustersIncertos,
      totalClusters: Object.keys(clusters).length
    };
  });
}

// Vincula manualmente um cluster (setor + quadraIBGE) inteiro a
// uma quadra do app. Sobrescreve vínculo existente — intencional,
// é correção manual de inconsistência ou primeira atribuição.
function vincularClusterAQuadra(setor, quadraIBGE, quadraId) {
  if (!setor || !quadraIBGE || !quadraId) return { ok: false, erro: 'parâmetros obrigatórios' };
  return withLock_(function(){
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetD = ss.getSheetByName(SHEET.DADOS);
    if (!sheetD || sheetD.getLastRow() < 2) return { ok: false, erro: 'Dados Brutos vazia' };

    var ult = sheetD.getLastRow();
    var lastCol = sheetD.getLastColumn();
    var dados = sheetD.getRange(2, 1, ult - 1, lastCol).getValues();
    var qLimpo = sanitizar_(quadraId);
    var setorAlvo = String(setor).trim();
    var qibgeAlvo = String(quadraIBGE).trim();

    var atualizadas = 0;
    dados.forEach(function(r){
      var s = String(r[COL.DADOS.SETOR_1IDX - 1] || '').trim();
      var q = String(r[COL.DADOS.QUADRA_IBGE] || '').trim();
      if (s !== setorAlvo || q !== qibgeAlvo) return;
      r[COL.DADOS.QUADRA] = qLimpo;
      atualizadas++;
    });
    if (atualizadas > 0) {
      var colA = dados.map(function(r){ return [r[COL.DADOS.QUADRA]]; });
      sheetD.getRange(2, 1, ult - 1, 1).setValues(colA);
    }
    _invalidar();
    return { ok: true, atualizadas: atualizadas };
  });
}

// =================================================================
// EXCLUIR CLUSTER de endereços (deletar grupo inteiro de Dados Brutos)
// Útil pra remover endereços que NÃO pertencem ao território
// (ex: ruas de outro bairro que vieram no CSV do IBGE).
// =================================================================
function excluirClusterEnderecos(setor, quadraIBGE) {
  if (!setor || !quadraIBGE) return { ok: false, erro: 'setor e quadraIBGE obrigatórios' };
  return withLock_(function(){
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetD = ss.getSheetByName(SHEET.DADOS);
    if (!sheetD || sheetD.getLastRow() < 2) return { ok: false, erro: 'Dados Brutos vazia' };

    var data = sheetD.getRange(2, 1, sheetD.getLastRow() - 1, sheetD.getLastColumn()).getValues();
    var setorAlvo = String(setor).trim();
    var qibgeAlvo = String(quadraIBGE).trim();

    // Loop reverso pra deletar sem bagunçar índices
    var deletadas = 0;
    for (var i = data.length - 1; i >= 0; i--) {
      var s = String(data[i][COL.DADOS.SETOR_1IDX - 1] || '').trim();
      var q = String(data[i][COL.DADOS.QUADRA_IBGE] || '').trim();
      if (s !== setorAlvo || q !== qibgeAlvo) continue;
      sheetD.deleteRow(i + 2);
      deletadas++;
    }
    _invalidar();
    return { ok: true, deletadas: deletadas };
  });
}

// =================================================================
// AUDITORIA DE QUADRAS — busca inconsistências:
// 1. Quadras com múltiplos clusters IBGE (setor+quadraIBGE) — viola
//    a invariante "1 quadra IBGE = 1 quadra do app"
// 2. Quadras vazias (sem nenhum endereço vinculado e não-inativas)
//
// Cada quadra pode ser marcada como "OK auditado" pra sumir da
// próxima auditoria. Persistido em ScriptProperty AUDIT_OK_*.
// =================================================================

function auditarQuadras() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetQ = ss.getSheetByName(SHEET.QUADRAS);
  var sheetD = ss.getSheetByName(SHEET.DADOS);
  if (!sheetQ) return { ok: false, erro: 'Aba Quadras não encontrada' };

  var dataQ = sheetQ.getDataRange().getValues();
  var quadras = {};
  var polyById = {};
  for (var i = 1; i < dataQ.length; i++) {
    var id = String(dataQ[i][COL.QUADRAS.ID]).trim();
    var st = String(dataQ[i][COL.QUADRAS.STATUS] || '');
    if (!id || st === STATUS.INATIVA) continue;
    quadras[id] = { qtdEnderecos: 0, clustersIBGE: {} };
    polyById[id] = String(dataQ[i][COL.QUADRAS.POLYSTRING] || '');
  }

  if (sheetD && sheetD.getLastRow() > 1) {
    var dataD = sheetD.getRange(2, 1, sheetD.getLastRow() - 1, sheetD.getLastColumn()).getValues();
    dataD.forEach(function(r){
      var q = String(r[COL.DADOS.QUADRA] || '').trim();
      if (!q || !quadras[q]) return;
      quadras[q].qtdEnderecos++;
      var setor = String(r[COL.DADOS.SETOR_1IDX - 1] || '').trim();
      var qibge = String(r[COL.DADOS.QUADRA_IBGE] || '').trim();
      if (setor && qibge) quadras[q].clustersIBGE[setor + '|' + qibge] = (quadras[q].clustersIBGE[setor + '|' + qibge] || 0) + 1;
    });
  }

  // Reads OK flags
  var props = PropertiesService.getScriptProperties();
  function lerOk(key) {
    var set = {};
    String(props.getProperty(key) || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean).forEach(function(id){ set[id] = true; });
    return set;
  }
  var okMulti = lerOk('AUDIT_OK_MULTI');
  var okVazia = lerOk('AUDIT_OK_VAZIA');

  var multiplos = [], vazias = [];
  Object.keys(quadras).forEach(function(id){
    var q = quadras[id];
    var clustersList = Object.keys(q.clustersIBGE);
    if (clustersList.length >= 2 && !okMulti[id]) {
      multiplos.push({
        id: id,
        clusters: clustersList.map(function(c){
          var p = c.split('|');
          return { setor: p[0], qibge: p[1], qtd: q.clustersIBGE[c] };
        }),
        qtdEnderecos: q.qtdEnderecos,
        polyString: polyById[id] || ''
      });
    }
    if (q.qtdEnderecos === 0 && !okVazia[id]) {
      vazias.push({ id: id, polyString: polyById[id] || '' });
    }
  });

  return {
    ok: true,
    multiplos: multiplos,
    vazias: vazias,
    totalQuadras: Object.keys(quadras).length,
    okMultiCount: Object.keys(okMulti).length,
    okVaziaCount: Object.keys(okVazia).length
  };
}

function marcarAuditoriaOk(id, tipo) {
  if (!id || !tipo) return { ok: false, erro: 'parâmetros obrigatórios' };
  return withLock_(function(){
    var props = PropertiesService.getScriptProperties();
    var key = tipo === 'multi' ? 'AUDIT_OK_MULTI' : 'AUDIT_OK_VAZIA';
    var lista = String(props.getProperty(key) || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    if (lista.indexOf(id) < 0) lista.push(id);
    props.setProperty(key, lista.join(','));
    return { ok: true };
  });
}

function desmarcarAuditoriaOk(id, tipo) {
  if (!id || !tipo) return { ok: false, erro: 'parâmetros obrigatórios' };
  return withLock_(function(){
    var props = PropertiesService.getScriptProperties();
    var key = tipo === 'multi' ? 'AUDIT_OK_MULTI' : 'AUDIT_OK_VAZIA';
    var lista = String(props.getProperty(key) || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    lista = lista.filter(function(x){ return x !== id; });
    props.setProperty(key, lista.join(','));
    return { ok: true };
  });
}

// Lista quadras marcadas como "OK auditado" — pra UI poder revisitar
// e reativar caso o user mude de ideia. Devolve polyString pra cada
// pra ser destacada no mapa.
function listarAuditoriaIgnoradas() {
  var props = PropertiesService.getScriptProperties();
  function lerLista(key) {
    return String(props.getProperty(key) || '').split(',')
      .map(function(s){ return s.trim(); }).filter(Boolean);
  }
  var idsMulti = lerLista('AUDIT_OK_MULTI');
  var idsVazia = lerLista('AUDIT_OK_VAZIA');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetQ = ss.getSheetByName(SHEET.QUADRAS);
  var polyById = {};
  if (sheetQ && sheetQ.getLastRow() > 1) {
    var dataQ = sheetQ.getDataRange().getValues();
    for (var i = 1; i < dataQ.length; i++) {
      polyById[String(dataQ[i][COL.QUADRAS.ID]).trim()] = String(dataQ[i][COL.QUADRAS.POLYSTRING] || '');
    }
  }
  function mapear(ids) {
    return ids.map(function(id){
      return { id: id, polyString: polyById[id] || '', existe: polyById.hasOwnProperty(id) };
    });
  }
  return { ok: true, multi: mapear(idsMulti), vazia: mapear(idsVazia) };
}

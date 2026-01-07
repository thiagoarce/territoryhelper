/**
 * ====================================================================
 * ARQUIVO: Database.gs
 * DESCRIÇÃO: Responsável pela comunicação entre a Planilha (Backend) 
 * e o HTML (Frontend). Lê e escreve dados.
 * ====================================================================
 */

// --- SEÇÃO 1: LEITURA DE DADOS ---

/**
 * Retorna uma visão geral aglomerada das quadras para o mapa de calor/pontos.
 * Calcula o centro médio de cada quadra baseada nos endereços contidos.
 */
function getVisaoGeral() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  if (!sheet) return [];
  
  // Lê colunas A até K (11 colunas)
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues(); 
  
  const quadras = {};

  data.forEach(row => {
    const faceId = row[0]; 
    if (!faceId) return;
    
    // Extrai o ID da Quadra (ex: "010-005" a partir de "010-005-02")
    const partes = faceId.split('-');
    if (partes.length < 2) return;
    const quadraId = partes[0] + '-' + partes[1]; 

    // Inicializa objeto se não existir
    if (!quadras[quadraId]) {
      quadras[quadraId] = { id: quadraId, lat: 0, lng: 0, totalEnderecos: 0, countCoords: 0 };
    }

    // Soma coordenadas para calcular média (centroide)
    const lat = limparCoord(row[9]);
    const lng = limparCoord(row[10]);

    if (lat && lng) {
      quadras[quadraId].lat += lat;
      quadras[quadraId].lng += lng;
      quadras[quadraId].countCoords++;
    }
    quadras[quadraId].totalEnderecos++;
  });

  // Retorna array formatado para o Frontend
  return Object.values(quadras).map(q => ({
    id: q.id,
    lat: q.countCoords > 0 ? q.lat / q.countCoords : null,
    lng: q.countCoords > 0 ? q.lng / q.countCoords : null,
    total: q.totalEnderecos
  }));
}

/**
 * Retorna apenas uma lista simples de IDs únicos de quadras.
 * Usado para popular o dropdown de seleção.
 */
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

/**
 * Retorna os detalhes (endereços) de uma quadra específica.
 * Usado na aba "Detalhes".
 */
function getDadosDaQuadra(quadraId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dados Brutos");
  const lastRow = sheet.getLastRow();
  // Lê até a coluna R (18) para pegar nome do edifício, etc.
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

/**
 * Lê a aba "Quadras" onde ficam os polígonos desenhados.
 * Retorna geometria, cor e território de cada quadra.
 */
function getPoligonosQuadras() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  if (!sheet || sheet.getLastRow() < 2) return [];
  
  // A=ID, B=Area, C=Lat, D=Lon, E=PolyString, F=Cor, G=Territorio
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  
  return range.map(row => ({
    id: row[0],
    area: row[1],
    lat: row[2],
    lng: row[3],
    polyString: row[4],
    color: row[5] || "#3388ff",
    territory: row[6] || ""
  }));
}

/**
 * Lê a aba "Territorios".
 * AGORA INCLUI COLUNA 'labelType' (Tipo de Rótulo).
 */
function getDadosTerritorios() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Territorios");
  
  // Cria aba se não existir, com cabeçalho atualizado
  if (!sheet) {
    sheet = ss.insertSheet("Territorios");
    sheet.appendRow(["Nome", "Cor", "Lista de Quadras", "Polígono (Union)", "Posição Rótulo", "Tipo Rótulo"]);
    return [];
  }
  
  if (sheet.getLastRow() < 2) return [];
  
  // Lê 6 colunas: A=Nome, B=Cor, C=Lista, D=Poly, E=Pos, F=Type
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  
  return range.map(row => ({
    name: row[0],
    color: row[1],
    quadras: row[2],
    polyString: row[3],
    labelPos: row[4],
    labelType: row[5] || "visible" // Padrão 'visible' se estiver vazio
  }));
}

// --- SEÇÃO 2: ESCRITA E ATUALIZAÇÃO ---

/**
 * Salva edição de geometria de uma ÚNICA quadra.
 */
function salvarEdicaoQuadra(dados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  if (!sheet) return { erro: "Planilha 'Quadras' não encontrada." };
  
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  let rowIndex = ids.indexOf(dados.idOriginal);
  
  if (rowIndex === -1) return { erro: "Quadra original não encontrada." };
  
  const linha = rowIndex + 2;
  // Atualiza colunas
  sheet.getRange(linha, 1).setValue(dados.idNovo);
  sheet.getRange(linha, 2).setValue(dados.area);
  sheet.getRange(linha, 3).setValue(dados.centro[0]);
  sheet.getRange(linha, 4).setValue(dados.centro[1]);
  sheet.getRange(linha, 5).setValue(dados.polyString);
  sheet.getRange(linha, 6).setValue(dados.color);
  sheet.getRange(linha, 7).setValue(dados.territory);
  
  return { sucesso: true };
}

/**
 * Wrapper para salvar criação individual, redireciona para o lote.
 */
function salvarCriacaoTerritorio(dados) {
  return salvarLoteTerritorios([dados]);
}

/**
 * PRINCIPAL FUNÇÃO DE SALVAMENTO DE TERRITÓRIOS.
 * - Cria novos territórios ou atualiza existentes.
 * - Atualiza a cor e o dono nas quadras individuais.
 * - Suporta 'labelType'.
 */
function salvarLoteTerritorios(listaUpdates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQuadras = ss.getSheetByName("Quadras");
  let sheetTerritorios = ss.getSheetByName("Territorios");
  
  if (!sheetQuadras) return { erro: "Aba 'Quadras' não encontrada." };
  
  // Garante que a aba Territorios existe com cabeçalho correto
  if (!sheetTerritorios) {
      sheetTerritorios = ss.insertSheet("Territorios");
      sheetTerritorios.appendRow(["Nome", "Cor", "Lista de Quadras", "Polígono (Union)", "Posição Rótulo", "Tipo Rótulo"]);
  }

  // Cache para busca rápida de índices (Performance)
  const lastRowT = sheetTerritorios.getLastRow();
  const nomesTerritorios = lastRowT > 1 ? sheetTerritorios.getRange(2, 1, lastRowT-1, 1).getValues().flat() : [];
  
  const lastRowQ = sheetQuadras.getLastRow();
  const idsQuadras = lastRowQ > 1 ? sheetQuadras.getRange(2, 1, lastRowQ-1, 1).getValues().flat() : [];

  // Processa cada item da lista (Território Principal + Vítimas afetadas)
  listaUpdates.forEach(update => {
    
    // 1. Atualiza a Aba TERRITORIOS
    const nomeBusca = update.originalName || update.name;
    const tIndex = nomesTerritorios.indexOf(nomeBusca);
    
    if (tIndex > -1) {
      // CASO: ATUALIZAÇÃO (Já existe)
      const rowT = tIndex + 2;
      sheetTerritorios.getRange(rowT, 1).setValue(update.name);
      sheetTerritorios.getRange(rowT, 2).setValue(update.color);
      sheetTerritorios.getRange(rowT, 3).setValue(update.idsQuadras.join(","));
      sheetTerritorios.getRange(rowT, 4).setValue(update.polyString);
      
      // Salva Posição e Tipo de Rótulo (se fornecidos)
      if (update.labelPos !== undefined) sheetTerritorios.getRange(rowT, 5).setValue(update.labelPos);
      if (update.labelType !== undefined) sheetTerritorios.getRange(rowT, 6).setValue(update.labelType);
      
    } else {
      // CASO: CRIAÇÃO (Novo Território)
      sheetTerritorios.appendRow([
        update.name, 
        update.color, 
        update.idsQuadras.join(","), 
        update.polyString,
        update.labelPos || "",
        update.labelType || "visible" // Padrão visible
      ]);
      // Adiciona ao cache local para evitar duplicidade no mesmo loop
      nomesTerritorios.push(update.name); 
    }

    // 2. Atualiza a Aba QUADRAS (Propaga a cor e nome do território)
    update.idsQuadras.forEach(qId => {
      const qIndex = idsQuadras.indexOf(qId);
      if (qIndex > -1) {
        sheetQuadras.getRange(qIndex + 2, 6).setValue(update.color); // Coluna F
        sheetQuadras.getRange(qIndex + 2, 7).setValue(update.name);  // Coluna G
      }
    });
  });

  return { sucesso: true };
}

/**
 * Exclui um território e limpa a referência nas quadras.
 */
function excluirTerritorio(nomeTerritorio) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetQuadras = ss.getSheetByName("Quadras");
  const sheetTerritorios = ss.getSheetByName("Territorios");

  // Remove da aba Territorios
  const nomes = sheetTerritorios.getRange(2, 1, sheetTerritorios.getLastRow()-1, 1).getValues().flat();
  const idx = nomes.indexOf(nomeTerritorio);
  if (idx > -1) {
    sheetTerritorios.deleteRow(idx + 2);
  } else {
    return { erro: "Território não encontrado." };
  }

  // Limpa referência nas Quadras (ficarão "órfãs")
  const qData = sheetQuadras.getRange(2, 7, sheetQuadras.getLastRow()-1, 1).getValues().flat();
  qData.forEach((val, i) => {
    if (val === nomeTerritorio) {
      sheetQuadras.getRange(i + 2, 6).setValue("#3388ff"); // Volta pro azul padrão
      sheetQuadras.getRange(i + 2, 7).setValue("");        // Limpa nome
    }
  });

  return { sucesso: true };
}

/**
 * Processamento em lote para divisão/fusão de geometrias.
 * Deleta quadras antigas e cria novas.
 */
function processarGeometriaEmLote(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  
  // 1. Remove Antigas
  if (payload.toRemove && payload.toRemove.length > 0) {
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
    const rowsToDelete = [];
    payload.toRemove.forEach(id => {
      const idx = ids.indexOf(id);
      if (idx > -1) rowsToDelete.push(idx + 2);
    });
    // Deleta de baixo para cima para não quebrar índices
    rowsToDelete.sort((a, b) => b - a);
    rowsToDelete.forEach(row => sheet.deleteRow(row));
  }

  // 2. Adiciona Novas
  if (payload.toAdd && payload.toAdd.length > 0) {
    payload.toAdd.forEach(q => {
      sheet.appendRow([
        q.id,
        q.area || 0,
        q.centro[0],
        q.centro[1],
        q.polyString,
        q.color || "#3388ff",
        q.territory || ""
      ]);
    });
  }

  return { sucesso: true };
}

function excluirQuadra(idQuadra) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Quadras");
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  const rowIndex = ids.indexOf(idQuadra);

  if (rowIndex > -1) {
    sheet.deleteRow(rowIndex + 2);
    return { sucesso: true };
  }
  return { erro: "Quadra não encontrada." };
}

// Auxiliar: Corrige formatos de números (vírgula para ponto)
function limparCoord(coord) {
  if (typeof coord === 'number') return coord;
  if (typeof coord === 'string') return parseFloat(coord.replace(',', '.'));
  return null;
}
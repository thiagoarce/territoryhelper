function salvarQuadrasNaPlanilha() {
  // 1. Configurações e Coordenadas (Seu Polígono do Aeroclube)
  var poligonoCoords = [
    [-34.840249, -7.105773], [-34.836566, -7.103969], [-34.833991, -7.102643], 
    [-34.832885, -7.102143], [-34.831466, -7.101432], [-34.831889, -7.100038], 
    [-34.832110, -7.099339], [-34.832701, -7.096902], [-34.833325, -7.092736], 
    [-34.833228, -7.089514], [-34.832882, -7.087742], [-34.832302, -7.085314], 
    [-34.832079, -7.084943], [-34.829927, -7.080488], [-34.829642, -7.075777], 
    [-34.829955, -7.074955], [-34.832396, -7.075063], [-34.835365, -7.075975], 
    [-34.838690, -7.077090], [-34.838976, -7.077263], [-34.839502, -7.078235], 
    [-34.839589, -7.078516], [-34.839489, -7.079483], [-34.839607, -7.080344], 
    [-34.839538, -7.081812], [-34.839776, -7.082302], [-34.839953, -7.082731], 
    [-34.840109, -7.083268], [-34.840068, -7.084171], [-34.844027, -7.085008], 
    [-34.846218, -7.084699], [-34.846762, -7.084619], [-34.847192, -7.084487], 
    [-34.847572, -7.084501], [-34.848639, -7.084403], [-34.848474, -7.086367], 
    [-34.847799, -7.097944], [-34.847781, -7.098129], [-34.844281, -7.097862], 
    [-34.843739, -7.101250], [-34.843145, -7.102365], [-34.841082, -7.105551], 
    [-34.841064, -7.105562], [-34.840554, -7.105263]
  ];

  // 2. Preparar Planilha
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.create("Mapeamento de Quadras"); // Cria nova se não estiver em uma
  
  var sheetName = "Ruas_e_Quadras_" + new Date().toLocaleTimeString();
  var sheet = ss.insertSheet(sheetName);
  
  // Cabeçalhos
  sheet.appendRow(["ID OSM", "Nome da Rua", "Tipo de Via", "Latitude Centro", "Longitude Centro", "Coordenadas Completas (Geometria)"]);
  sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#cfe2f3");

  // 3. Montar Consulta Overpass (Usando o servidor Kumi que funcionou)
  var lats = poligonoCoords.map(function(p) { return p[1]; });
  var lons = poligonoCoords.map(function(p) { return p[0]; });
  var minLat = Math.min.apply(null, lats); var maxLat = Math.max.apply(null, lats);
  var minLon = Math.min.apply(null, lons); var maxLon = Math.max.apply(null, lons);

  // Pedimos 'out geom' para vir a geometria completa da linha
  var query = '[out:json][timeout:180];(';
  query += 'way["highway"](' + minLat + ',' + minLon + ',' + maxLat + ',' + maxLon + ');';
  query += ');out geom;'; 

  var url = 'https://overpass.kumi.systems/api/interpreter?data=' + encodeURIComponent(query);

  Logger.log("Consultando API e salvando na planilha...");

  try {
    var response = UrlFetchApp.fetch(url, {'method': 'get', 'muteHttpExceptions': true});
    
    if (response.getResponseCode() !== 200) {
      Browser.msgBox("Erro na API: " + response.getResponseCode());
      return;
    }

    var data = JSON.parse(response.getContentText());
    var elements = data.elements;
    var count = 0;
    var ruasVistas = {};

    // 4. Processar e Salvar
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      
      // Calcular centro aproximado da geometria da rua
      if (el.geometry && el.geometry.length > 0) {
        var midIndex = Math.floor(el.geometry.length / 2);
        var centerLat = el.geometry[midIndex].lat;
        var centerLon = el.geometry[midIndex].lon;
        
        // Verifica se está dentro do polígono
        if (pointInPolygon([centerLon, centerLat], poligonoCoords)) {
          var nome = el.tags && el.tags.name ? el.tags.name : "Via sem nome";
          var tipo = el.tags && el.tags.highway ? el.tags.highway : "desconhecido";
          
          // Formata coordenadas para string (para copiar pro MyMaps se quiser)
          var coordString = el.geometry.map(function(g){ return g.lat + "," + g.lon; }).join(" | ");

          // Evita duplicatas exatas de nome (opcional, removi para ter todos os segmentos)
          // Se quiser apenas nomes únicos, descomente o if abaixo
          // if (!ruasVistas[nome]) {
             sheet.appendRow([el.id, nome, tipo, centerLat, centerLon, coordString]);
             count++;
             ruasVistas[nome] = true;
          // }
        }
      }
    }
    
    // Ajustar largura das colunas
    sheet.autoResizeColumns(1, 5);
    Logger.log("Finalizado! " + count + " segmentos salvos na aba " + sheetName);
    Browser.msgBox("Sucesso! " + count + " segmentos de ruas importados para a aba '" + sheetName + "'.");

  } catch (e) {
    Logger.log("Erro: " + e.toString());
    Browser.msgBox("Erro: " + e.toString());
  }
}

// Função Auxiliar Ray Casting (Mantida igual)
function pointInPolygon(point, vs) {
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var intersect = ((yi > y) != (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
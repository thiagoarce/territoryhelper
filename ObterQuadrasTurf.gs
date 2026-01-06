// --- CARREGADOR DO TURF.JS ---
var TURF_URL = "https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js";
eval(UrlFetchApp.fetch(TURF_URL).getContentText());

function gerarQuadrasFinal() {
  
  // 1. COLE AQUI O TEXTO BRUTO DAS COORDENADAS (Do jeito que você mandou na mensagem)
  // O script vai limpar, formatar e fechar o polígono automaticamente.
  var RAW_COORDS = "-34.8402492167095,-7.105772937285273,0 -34.83656585432185,-7.103969495755631,0 -34.83399072928768,-7.102642789990798,0 -34.83288509383766,-7.102142695959089,0 -34.83146550812567,-7.10143183551614,0 -34.83188940056169,-7.100038010364944,0 -34.83210999287999,-7.099339489456094,0 -34.83270103465748,-7.096902329365649,0 -34.83332472875301,-7.092736160352118,0 -34.83322790242358,-7.089513798787441,0 -34.83288186176642,-7.087741557577467,0 -34.83230168375907,-7.085313669761098,0 -34.83207887661662,-7.084942946377998,0 -34.82992660721558,-7.080488280066209,0 -34.8296415562137,-7.075777235084613,0 -34.82995536596383,-7.074954739892589,0 -34.83239598795073,-7.075062663079965,0 -34.83536529273002,-7.075975161532427,0 -34.83869046916412,-7.077089811589052,0 -34.83897642417451,-7.077262961805704,0 -34.8395016102262,-7.078235351643039,0 -34.8395892704818,-7.078515752986198,0 -34.83948896133709,-7.079483187324126,0 -34.83960661484216,-7.080344266138737,0 -34.83953757970433,-7.08181200812384,0 -34.83977596366647,-7.082302349869891,0 -34.8399525496074,-7.082731463772175,0 -34.84010887427435,-7.083267803464745,0 -34.8400681810926,-7.084170569091759,0 -34.8440274075699,-7.085008193220118,0 -34.84621773948703,-7.084699217561237,0 -34.84676215537577,-7.084619025039491,0 -34.84719184469495,-7.084487464400635,0 -34.84757161857727,-7.084501023520058,0 -34.84863917182286,-7.084403448900995,0 -34.84847395700686,-7.086366964095371,0 -34.84779863170149,-7.097944076209448,0 -34.84778129860544,-7.098128952084696,0 -34.84428054574305,-7.097861509073728,0 -34.84373940723259,-7.101250236401192,0 -34.84314523041781,-7.102364573800679,0 -34.84108209967532,-7.105551141239858,0 -34.84106426044082,-7.105562269915411,0 -34.84055357737189,-7.105262662495004,0 -34.8402492167095,-7.105772937285273,0";

  // --- Processamento das Coordenadas ---
  var poligonoCoords = parseKMLString(RAW_COORDS);
  
  // 2. Preparar Planilha
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.create("Quadras Geradas");
  var sheetName = "Quadras_Turf_V3_" + new Date().getHours() + "h" + new Date().getMinutes();
  var sheet = ss.insertSheet(sheetName);
  
  sheet.appendRow(["ID Quadra", "Área (m²)", "Centro Lat", "Centro Lon", "DESENHO DO POLÍGONO (Lat,Lon)"]);
  sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#d0e0e3");

  // 3. Definir Caixa Delimitadora (Bounding Box)
  var lats = poligonoCoords.map(function(p) { return p[1]; });
  var lons = poligonoCoords.map(function(p) { return p[0]; });
  var minLat = Math.min.apply(null, lats); var maxLat = Math.max.apply(null, lats);
  var minLon = Math.min.apply(null, lons); var maxLon = Math.max.apply(null, lons);

  // 4. Consulta Overpass (Baixar Ruas)
  var query = '[out:json][timeout:180];(';
  query += 'way["highway"](' + minLat + ',' + minLon + ',' + maxLat + ',' + maxLon + ');';
  query += ');out geom;'; 

  var url = 'https://overpass.kumi.systems/api/interpreter?data=' + encodeURIComponent(query);
  
  Logger.log("Consultando Overpass...");

  try {
    var response = UrlFetchApp.fetch(url, {'method': 'get', 'muteHttpExceptions': true});
    var data = JSON.parse(response.getContentText());
    
    // 5. Converter Ruas para formato Turf
    var lineFeatures = [];
    if(data.elements) {
      data.elements.forEach(function(el) {
        if (el.geometry && el.geometry.length > 1) {
          // Turf usa [Longitude, Latitude]
          var coords = el.geometry.map(function(pt){ return [pt.lon, pt.lat]; });
          var line = turf.lineString(coords);
          lineFeatures.push(line);
        }
      });
    }

    Logger.log("Segmentos de rua encontrados: " + lineFeatures.length);
    
    // 6. Polygonize (Gerar Quadras)
    var featureCollection = turf.featureCollection(lineFeatures);
    var polygons = turf.polygonize(featureCollection);
    
    Logger.log("Polígonos gerados: " + polygons.features.length);

    // 7. Filtragem: Verificar quais quadras estão dentro do SEU território
    // Criamos o polígono de máscara usando as coordenadas tratadas
    var meuTerritorio = turf.polygon([poligonoCoords]); 
    var count = 0;

    polygons.features.forEach(function(poly, index) {
      var centro = turf.centerOfMass(poly);
      
      // Verifica se o CENTRO da quadra gerada está dentro do limite do Aeroclube
      if (turf.booleanPointInPolygon(centro, meuTerritorio)) {
        
        var area = turf.area(poly);
        var centroCoords = centro.geometry.coordinates; // [lon, lat]
        
        // Inverter para Lat,Lon (padrão Google Maps)
        var coordsString = poly.geometry.coordinates[0].map(function(c){
          return c[1] + "," + c[0]; 
        }).join(" | ");

        sheet.appendRow([
          "Q-" + (index + 1),
          Math.round(area),
          centroCoords[1], // Lat
          centroCoords[0], // Lon
          coordsString
        ]);
        count++;
      }
    });

    sheet.autoResizeColumns(1, 5);
    Browser.msgBox("Sucesso! " + count + " quadras identificadas e desenhadas na aba " + sheetName);

  } catch (e) {
    Logger.log("Erro: " + e.toString());
    Browser.msgBox("Erro: " + e.toString());
  }
}

// --- FUNÇÃO AUXILIAR PARA CORRIGIR COORDENADAS ---
function parseKMLString(rawString) {
  // Remove espaços extras e quebras de linha
  var cleanString = rawString.replace(/\s+/g, ' ').trim();
  
  // Divide pelos espaços (cada par de coord é separado por espaço no KML)
  var pairs = cleanString.split(' ');
  var coords = [];
  
  pairs.forEach(function(pair) {
    var parts = pair.split(',');
    if (parts.length >= 2) {
      // Pega Lon e Lat e converte para número
      var lon = parseFloat(parts[0]);
      var lat = parseFloat(parts[1]);
      // Ignora o '0' da altitude se existir
      coords.push([lon, lat]);
    }
  });

  // VERIFICAÇÃO DE SEGURANÇA: Fechar o Polígono
  var first = coords[0];
  var last = coords[coords.length - 1];

  // Se o último ponto não for IGUAL ao primeiro, adiciona o primeiro no final
  if (first[0] !== last[0] || first[1] !== last[1]) {
    Logger.log("Aviso: Polígono não estava fechado matematicamente. Fechando agora.");
    coords.push(first);
  }
  
  return coords;
}
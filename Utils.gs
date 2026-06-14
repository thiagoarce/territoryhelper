// =================================================================
// UTILS — validação, lock, sanitização. Use estas funções em todo
// save para que erros virem mensagens claras, não exceções obscuras.
// =================================================================

/**
 * Roda fn() com lock exclusivo de até 20s. Use em TODA escrita para evitar
 * dois usuários sobrescreverem um ao outro.
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(20 * 1000)) {
      throw new Error("Sistema ocupado — tente novamente em alguns segundos.");
    }
    return fn();
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

/**
 * Valida polyString no formato "lat,lng | lat,lng | ...".
 * Mínimo 3 pontos. Coordenadas precisam ser numéricas e dentro do globo.
 * Retorna {ok: bool, msg: string}.
 */
function validarPolyString_(poly) {
  if (!poly || typeof poly !== "string") return { ok: false, msg: "Polígono vazio." };
  var pts = poly.replace(/\r\n|\n|\r/g, "|").split("|");
  var validos = 0;
  for (var i = 0; i < pts.length; i++) {
    var c = pts[i].trim().split(",");
    if (c.length < 2) continue;
    var lat = parseFloat(c[0]), lng = parseFloat(c[1]);
    if (isNaN(lat) || isNaN(lng)) return { ok: false, msg: "Coordenada inválida." };
    if (lat < -90 || lat > 90) return { ok: false, msg: "Latitude fora do globo." };
    if (lng < -180 || lng > 180) return { ok: false, msg: "Longitude fora do globo." };
    validos++;
  }
  if (validos < 3) return { ok: false, msg: "Polígono precisa de pelo menos 3 vértices." };
  return { ok: true, msg: "" };
}

function validarId_(id) {
  if (!id) return { ok: false, msg: "ID vazio." };
  var s = String(id).trim();
  if (s.length === 0) return { ok: false, msg: "ID vazio." };
  if (s.length > 50) return { ok: false, msg: "ID muito longo (máx 50)." };
  // só letras, números, hífen, underscore, ponto, espaço
  if (!/^[a-zA-Z0-9\-_.\sçÇãÃõÕáÁéÉíÍóÓúÚâÂêÊîÎôÔûÛ]+$/.test(s)) {
    return { ok: false, msg: "ID com caracteres inválidos." };
  }
  return { ok: true, msg: "" };
}

function validarData_(dataStr) {
  if (!dataStr) return { ok: false, msg: "Data vazia." };
  // aceita yyyy-MM-dd ou ISO completo
  var d = new Date(dataStr.indexOf("T") > -1 ? dataStr : dataStr + "T00:00:00");
  if (isNaN(d.getTime())) return { ok: false, msg: "Data inválida." };
  return { ok: true, msg: "", date: d };
}

function validarCor_(cor) {
  if (!cor) return "#3388ff";
  var s = String(cor).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return s;
  return "#3388ff";
}

/** Sanitiza string para gravação na sheet (evita injection de fórmula) */
function sanitizar_(val) {
  if (val === null || val === undefined) return "";
  var s = String(val);
  // Apps Script trata "=" no começo como fórmula; prefixar com aspas simples
  if (s.length > 0 && (s.charAt(0) === "=" || s.charAt(0) === "+" || s.charAt(0) === "@")) {
    return "'" + s;
  }
  return s;
}

/**
 * Busca a aba pelo nome principal; fallback para nome alternativo (acentos).
 */
function getSheetByName_(nome) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(nome);
  if (s) return s;
  // Tenta variantes comuns
  if (nome === "Territorios") return ss.getSheetByName("Territórios");
  if (nome === "Territórios") return ss.getSheetByName("Territorios");
  return null;
}

/**
 * Encontra a linha (1-indexed) de uma quadra por ID. Retorna -1 se não achar.
 * Recebe `data` (resultado de getDataRange().getValues()) para evitar releitura.
 */
function acharLinhaQuadra_(data, id) {
  var alvo = String(id).trim();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.QUADRAS.ID]).trim() === alvo) return i + 1;
  }
  return -1;
}

/**
 * Loga erro em uma aba "Logs" (se existir) e re-lança. Útil para
 * post-mortem sem ter que voltar no Apps Script logs.
 */
function logErro_(contexto, err) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Logs");
    if (!sheet) {
      sheet = ss.insertSheet("Logs");
      sheet.appendRow(["Timestamp", "Contexto", "Erro", "Stack"]);
    }
    sheet.appendRow([new Date(), contexto, String(err && err.message ? err.message : err), String(err && err.stack ? err.stack : "")]);
  } catch(e) {}
}

// Link do Google Maps → local (nome, endereço, coordenada).
//
// O caso de uso é o do WhatsApp: alguém manda
// https://maps.app.goo.gl/CR5K3oRQxFkUDToi7 e o servo quer transformar
// isso num ponto de encontro do sistema, sem sair procurando no mapa.
//
// O que dá e o que NÃO dá (verificado com link real antes de escrever):
//   - o link curto SEMPRE precisa ser seguido no servidor (o browser
//     não consegue: CORS);
//   - a URL final NEM SEMPRE tem coordenada. O link testado resolveu
//     pra `?q=Parahyba Mall - R. Bacharel ... , 850 - Jardim Oceania,
//     João Pessoa - PB&ftid=0x...` — nome e endereço, zero lat/lng;
//   - quando não vem coordenada, o nome + cidade geocodificado no
//     Nominatim acertou o lugar exato. Por isso o resultado carrega a
//     CONFIANÇA: 'exata' (veio no link) ou 'aproximada' (geocodificada),
//     e a tela obriga o admin a conferir o pino antes de salvar.
//
// A parte pura (extrair da URL) mora aqui e é testada; o fetch mora em
// /api/maps-link (server).

export interface LocalDoLink {
  nome: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  confianca: 'exata' | 'aproximada' | 'sem_coordenada';
}

/** É um link do Google Maps (curto ou longo)? */
export function ehLinkGoogleMaps(url: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(
    url.trim()
  );
}

/** Precisa passar pelo servidor pra seguir o redirecionamento? */
export function ehLinkCurto(url: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url.trim());
}

function coordenadaValida(lat: number, lng: number): boolean {
  // (0,0) é o Atlântico: o Google usa isso como placeholder e vários
  // parsers ingênuos "acertam" a null island sem perceber.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Extrai o que der de uma URL do Maps JÁ RESOLVIDA (sem rede).
 * Ordem de confiança das fontes de coordenada:
 *   1. `!3d<lat>!4d<lng>` (dados do lugar — o mais preciso)
 *   2. `@<lat>,<lng>,<zoom>z` (centro do mapa na hora do compartilhamento)
 *   3. `q=<lat>,<lng>` / `query=<lat>,<lng>` (pino solto)
 */
export function extrairDoLinkMaps(urlStr: string): LocalDoLink {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { nome: null, endereco: null, lat: null, lng: null, confianca: 'sem_coordenada' };
  }
  const inteiro = decodeURIComponent(urlStr);
  const params = url.searchParams;

  let lat: number | null = null;
  let lng: number | null = null;

  const m3d = inteiro.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m3d && coordenadaValida(+m3d[1], +m3d[2])) {
    lat = +m3d[1];
    lng = +m3d[2];
  }
  if (lat === null) {
    const mAt = inteiro.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (mAt && coordenadaValida(+mAt[1], +mAt[2])) {
      lat = +mAt[1];
      lng = +mAt[2];
    }
  }

  // q / query pode ser coordenada OU texto ("Nome - Endereço")
  const q = params.get('q') ?? params.get('query') ?? params.get('destination') ?? '';
  let nome: string | null = null;
  let endereco: string | null = null;

  const mQ = q.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  if (mQ && coordenadaValida(+mQ[1], +mQ[2])) {
    if (lat === null) {
      lat = +mQ[1];
      lng = +mQ[2];
    }
  } else if (q.trim()) {
    // "Parahyba Mall - R. Bacharel José..., 850 - Jardim Oceania, João Pessoa - PB, 58037-432"
    const partes = q.split(' - ');
    nome = partes[0]?.trim() || null;
    endereco = partes.length > 1 ? partes.slice(1).join(' - ').trim() : null;
  }

  // /maps/place/<Nome>/... quando não veio pelo q=
  if (!nome) {
    const mPlace = inteiro.match(/\/maps\/place\/([^/@]+)/);
    if (mPlace) nome = mPlace[1].replace(/\+/g, ' ').trim() || null;
  }

  return {
    nome,
    endereco,
    lat,
    lng,
    confianca: lat !== null ? 'exata' : 'sem_coordenada'
  };
}

/** Texto de busca pro geocoder quando o link não trouxe coordenada. */
export function consultaParaGeocodificar(l: {
  nome: string | null;
  endereco: string | null;
}): string | null {
  // O nome + cidade funciona MUITO melhor que o endereço completo no
  // Nominatim (testado: o endereço com número caiu numa rua errada; o
  // nome do lugar acertou na mosca). A cidade sai do fim do endereço.
  const cidade = l.endereco?.match(/,\s*([^,]+?)\s*-\s*[A-Z]{2}/)?.[1]?.trim() ?? null;
  if (l.nome) return cidade ? `${l.nome}, ${cidade}` : l.nome;
  return l.endereco?.trim() || null;
}

/** Link pra compartilhar no WhatsApp: o original, se houver. */
export function urlCompartilhavel(p: {
  maps_url?: string | null;
  lat: number;
  lng: number;
}): string {
  if (p.maps_url?.trim()) return p.maps_url.trim();
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}

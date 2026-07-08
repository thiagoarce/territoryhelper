// U1: ordenação padrão dos endereços de uma quadra seguindo um percurso
// físico real, quando não há `ordem_na_quadra` manual (T14) — antes
// disso a ordem padrão era só a de inserção (id)/face IBGE, sem relação
// nenhuma com o percurso físico real.
//
// Tentativa anterior (ângulo em torno do centróide) só funciona bem em
// quadras compactas/quadradas — em quadras finas e alongadas (comum:
// uma fileira de casas ao longo de uma avenida, às vezes com um prédio
// ou dois mais afastados) o centróide fica deslocado pro lado e o
// ângulo gera zigue-zague (ex.: 8,7,6,5,4,3 depois pula pra 12,10,11)
// em vez de um percurso limpo. Nearest-neighbor resolve isso pra
// qualquer formato: nunca volta pra trás, sempre anda pro mais perto.

export interface PontoComId {
  id: number;
  geo_geojson?: { type: 'Point'; coordinates: [number, number] } | null;
}

// Centroide simples (média dos vértices do anel externo) — não é o
// centroide "verdadeiro" ponderado por área, mas é suficiente pra uma
// quadra (polígono pequeno, convexo ou quase).
export function centroidePoligono(polyGeoJson: unknown): { lat: number; lng: number } | null {
  const anel = (polyGeoJson as any)?.coordinates?.[0] as [number, number][] | undefined;
  if (!anel || anel.length === 0) return null;
  let somaLat = 0;
  let somaLng = 0;
  for (const [lng, lat] of anel) {
    somaLat += lat;
    somaLng += lng;
  }
  return { lat: somaLat / anel.length, lng: somaLng / anel.length };
}

function distancia2(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy; // só compara — não precisa da raiz nem de haversine
}

// Caminho "nearest neighbor": começa no ponto mais distante do centro
// (aproxima uma esquina/extremidade da quadra — "começamos a trabalhar
// da esquina") e daí em diante sempre anda pro ponto restante mais
// próximo. Greedy, O(n²), mas n é umas poucas dezenas de endereços por
// quadra — sem custo real.
export function ordenarPorCaminho<T extends PontoComId>(
  centro: { lat: number; lng: number } | null,
  locais: T[]
): T[] {
  const comCoord: { l: T; c: [number, number] }[] = [];
  const semCoord: T[] = [];
  for (const l of locais) {
    const c = l.geo_geojson?.coordinates;
    if (c) comCoord.push({ l, c });
    else semCoord.push(l);
  }
  if (comCoord.length === 0) return locais;

  const centroPt: [number, number] = centro ? [centro.lng, centro.lat] : comCoord[0].c;

  // Ponto de partida = mais distante do centro (extremidade/esquina).
  let iInicial = 0;
  let maiorDist = -1;
  for (let i = 0; i < comCoord.length; i++) {
    const d = distancia2(comCoord[i].c, centroPt);
    if (d > maiorDist) { maiorDist = d; iInicial = i; }
  }

  const restantes = [...comCoord];
  const [inicial] = restantes.splice(iInicial, 1);
  const ordenado: T[] = [inicial.l];
  let atual = inicial.c;

  while (restantes.length > 0) {
    let iMaisPerto = 0;
    let menorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = distancia2(restantes[i].c, atual);
      if (d < menorDist) { menorDist = d; iMaisPerto = i; }
    }
    const [proximo] = restantes.splice(iMaisPerto, 1);
    ordenado.push(proximo.l);
    atual = proximo.c;
  }

  return [...ordenado, ...semCoord];
}

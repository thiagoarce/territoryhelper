// U1: ordenação padrão dos endereços de uma quadra "dando a volta" a
// partir do centro, quando não há `ordem_na_quadra` manual (T14) — antes
// disso a ordem padrão era só a de inserção (id)/face IBGE, sem relação
// nenhuma com o percurso físico real.

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

// Ordena por ângulo em torno do centro, sentido horário (lat pra cima,
// lng pra direita — atan2 padrão dá anti-horário, por isso invertemos o
// sinal do ângulo antes de comparar).
export function ordenarPorAngulo<T extends PontoComId>(
  centro: { lat: number; lng: number },
  locais: T[]
): T[] {
  const comAngulo = locais.map((l) => {
    const coords = l.geo_geojson?.coordinates;
    if (!coords) return { l, angulo: null as number | null };
    const [lng, lat] = coords;
    const angulo = -Math.atan2(lat - centro.lat, lng - centro.lng);
    return { l, angulo };
  });
  // Sem coordenada fica no fim, ordem estável entre eles.
  return comAngulo
    .sort((a, b) => {
      if (a.angulo === null && b.angulo === null) return 0;
      if (a.angulo === null) return 1;
      if (b.angulo === null) return -1;
      return a.angulo - b.angulo;
    })
    .map((x) => x.l);
}

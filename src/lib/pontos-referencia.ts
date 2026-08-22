// Pontos de referência nomeados pela congregação ("Banco do Brasil da
// Fernando"). Parte PURA: validação e normalização, testada em
// tests/pontos-referencia.test.ts. A escrita mora em
// $lib/server/pontos.ts e a leitura nos fetchers de campo.

export type TipoPonto = 'estacionamento' | 'referencia' | 'entrada' | 'atencao';

export const TIPOS_PONTO: { valor: TipoPonto; label: string; icone: string }[] = [
  { valor: 'estacionamento', label: 'Onde parar', icone: 'parking' },
  { valor: 'referencia', label: 'Referência', icone: 'estrela' },
  { valor: 'entrada', label: 'Entrada/acesso', icone: 'door-closed' },
  { valor: 'atencao', label: 'Atenção', icone: 'alert' }
];

export interface PontoReferencia {
  id: number;
  nome: string;
  tipo: TipoPonto;
  lat: number;
  lng: number;
  notas: string | null;
  quadra_id: string | null;
  territorio_id: string | null;
  osm_id: string | null;
}

/** Colapsa espaço e corta — nome digitado no celular vem com sobra. */
export function normalizarNomePonto(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function ehTipoPonto(t: unknown): t is TipoPonto {
  return TIPOS_PONTO.some((x) => x.valor === t);
}

/**
 * Valida o que veio do formulário ANTES de ir pro banco. Coordenada
 * fora de faixa é o erro que mais dói: o ponto entra, some do mapa e
 * ninguém entende por quê (lat/lng trocados dá um ponto no meio do
 * oceano perto da África, que é exatamente 0,0 invertido).
 */
export function validarPonto(p: {
  nome: string;
  lat: unknown;
  lng: unknown;
  tipo?: unknown;
}): { ok: true; nome: string; tipo: TipoPonto; lat: number; lng: number } | { ok: false; erro: string } {
  const nome = normalizarNomePonto(String(p.nome ?? ''));
  if (nome.length < 2) return { ok: false, erro: 'Dê um nome ao ponto (ex: "Banco do Brasil da Fernando")' };
  if (nome.length > 80) return { ok: false, erro: 'Nome muito longo (máx. 80 caracteres)' };
  // null/undefined/'' NÃO podem virar 0 pelo Number() — 0,0 é um ponto
  // válido no meio do Atlântico ("null island"): o ponto entraria no
  // banco e sumiria do mapa sem erro nenhum.
  const cru = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const lat = cru(p.lat);
  const lng = cru(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, erro: 'Sem coordenada — toque no mapa ou use sua localização' };
  if (lat < -90 || lat > 90) return { ok: false, erro: 'Latitude fora de faixa' };
  if (lng < -180 || lng > 180) return { ok: false, erro: 'Longitude fora de faixa' };
  const tipo = ehTipoPonto(p.tipo) ? p.tipo : 'referencia';
  return { ok: true, nome, tipo, lat, lng };
}

/**
 * Junta o que a congregação salvou com o que veio do OSM, e quando os
 * dois são o MESMO lugar (mesmo osm_id) fica o nosso — o apelido da
 * congregação é o que serve em campo. Pura.
 */
export function mesclarSalvosComOsm<T extends { id: string }>(
  salvos: PontoReferencia[],
  doOsm: T[]
): { salvos: PontoReferencia[]; doOsm: T[] } {
  const jaSalvos = new Set(salvos.map((s) => s.osm_id).filter(Boolean) as string[]);
  return { salvos, doOsm: doOsm.filter((p) => !jaSalvos.has(p.id)) };
}

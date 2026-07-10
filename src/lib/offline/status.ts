// W9: timestamp do último "baixar pra usar offline" completo (prefetch da
// carteira + telas de campo) — só um marcador leve em localStorage, não
// precisa da IndexedDB do cache-leitura (é 1 valor, não por-tela).
const CHAVE = 'territoryhelper:ultimo-prefetch';

export function gravarUltimoPrefetch(ts: number): void {
  try {
    localStorage.setItem(CHAVE, String(ts));
  } catch {
    // localStorage indisponível (modo privado etc) — não é crítico, ignora.
  }
}

export function lerUltimoPrefetch(): number | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

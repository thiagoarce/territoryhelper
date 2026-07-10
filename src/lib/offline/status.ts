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

// Revisão final: uid do usuário logado, gravado pelo root layout. A fila
// de escrita usa isso pra (a) etiquetar cada item com quem o criou e
// (b) NÃO replayar item de A com a sessão de B num aparelho compartilhado
// (a action gravaria B como autor do desfecho). localStorage em vez de
// session do supabase porque a fila precisa disso de forma SÍNCRONA e
// sem acoplar $lib/offline ao client supabase.
const CHAVE_UID = 'territoryhelper:uid-atual';

export function gravarUidAtual(uid: string | null): void {
  try {
    if (uid) localStorage.setItem(CHAVE_UID, uid);
    else localStorage.removeItem(CHAVE_UID);
  } catch {
    // localStorage indisponível — a fila degrada pro comportamento antigo
    // (sem etiqueta de usuário), não é crítico.
  }
}

export function lerUidAtual(): string | null {
  try {
    return localStorage.getItem(CHAVE_UID);
  } catch {
    return null;
  }
}

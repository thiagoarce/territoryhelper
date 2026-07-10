// E2: lógica PURA do Registro de Designação de Território (S-13-T).
// Regra do usuário: "a designação inicia com a data da primeira quadra de
// um território designada e termina quando a última quadra daquele
// território é concluída".
//
// Modelo: por território, eventos de DESIGNAÇÃO (designações pessoais e
// arranjos que tocam alguma quadra dele) abrem um CICLO; o ciclo fecha na
// data em que TODAS as quadras do território têm alguma conclusão >= a
// abertura (fechamento = a última dessas primeiras conclusões). Eventos de
// designação que caem DENTRO de um ciclo aberto pertencem a ele (não abrem
// outro — trabalhar o mesmo território em várias frentes é um ciclo só).
//
// Aproximação documentada: o conjunto de quadras é o ATUAL (quadra criada
// depois "entra" na história retroativamente) — o S-13 é um retrato, não
// uma auditoria.

export interface EventoDesignacao {
  /** yyyy-mm-dd — designacoes.criada_em (date part) ou arranjos.data */
  data: string;
  /** nome do publicador; null = trabalho em grupo (arranjo) */
  nome: string | null;
}

export interface Conclusao {
  quadra_id: string;
  /** yyyy-mm-dd */
  data: string;
}

export interface CicloTerritorio {
  inicio: string;
  designado: string;
  /** null = ciclo ainda aberto */
  conclusao: string | null;
}

export function ciclosDoTerritorio(
  quadraIds: string[],
  eventos: EventoDesignacao[],
  conclusoes: Conclusao[]
): CicloTerritorio[] {
  if (quadraIds.length === 0) return [];
  const evs = [...eventos].sort((a, b) => a.data.localeCompare(b.data));
  const porQuadra = new Map<string, string[]>();
  for (const c of conclusoes) {
    if (!quadraIds.includes(c.quadra_id)) continue;
    const arr = porQuadra.get(c.quadra_id) ?? [];
    arr.push(c.data);
    porQuadra.set(c.quadra_id, arr);
  }
  for (const arr of porQuadra.values()) arr.sort();

  // Fechamento de um ciclo iniciado em `inicio`: pra cada quadra, a
  // PRIMEIRA conclusão >= inicio; se todas têm, fecha na maior delas.
  function fechamento(inicio: string): string | null {
    let maior: string | null = null;
    for (const qid of quadraIds) {
      const datas = porQuadra.get(qid) ?? [];
      const primeira = datas.find((d) => d >= inicio);
      if (!primeira) return null;
      if (!maior || primeira > maior) maior = primeira;
    }
    return maior;
  }

  const ciclos: CicloTerritorio[] = [];
  let liberadoApos: string | null = null; // fim do ciclo anterior
  for (const ev of evs) {
    if (liberadoApos !== null && ev.data <= liberadoApos) continue; // dentro/antes do ciclo anterior
    const fim = fechamento(ev.data);
    ciclos.push({
      inicio: ev.data,
      designado: ev.nome ?? 'Campo (grupo)',
      conclusao: fim
    });
    if (fim === null) break; // ciclo aberto engole o resto dos eventos
    liberadoApos = fim;
  }
  return ciclos;
}

/** Ano de serviço N = 1/set/(N-1) a 31/ago/N. */
export function periodoAnoDeServico(ano: number): { inicio: string; fim: string } {
  return { inicio: `${ano - 1}-09-01`, fim: `${ano}-08-31` };
}

/** Ano de serviço a que uma data pertence (set/2024 → 2025). */
export function anoDeServicoDe(dataIso: string): number {
  const [y, m] = dataIso.split('-').map(Number);
  return m >= 9 ? y + 1 : y;
}

export interface LinhaS13 {
  territorio_id: string;
  territorio_nome: string | null;
  ultimaConclusaoAnterior: string | null;
  ciclos: CicloTerritorio[];
}

// Filtra os ciclos que APARECEM na folha do ano (ativos em algum momento
// do período) e calcula a "Última data concluída" (asterisco do
// formulário): fechamento do último ciclo encerrado ANTES do ano.
export function linhaDoAno(
  territorio: { id: string; nome: string | null },
  todosCiclos: CicloTerritorio[],
  ano: number
): LinhaS13 {
  const { inicio, fim } = periodoAnoDeServico(ano);
  const doAno = todosCiclos.filter(
    (c) => c.inicio <= fim && (c.conclusao === null || c.conclusao >= inicio)
  );
  const anteriores = todosCiclos.filter((c) => c.conclusao !== null && c.conclusao! < inicio);
  const ultima = anteriores.length > 0 ? anteriores[anteriores.length - 1].conclusao : null;
  return {
    territorio_id: territorio.id,
    territorio_nome: territorio.nome,
    ultimaConclusaoAnterior: ultima,
    ciclos: doAno
  };
}

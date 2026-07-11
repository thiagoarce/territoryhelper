// E2: lógica PURA do Registro de Designação de Território (S-13-T).
// Regra do usuário: "a designação inicia com a data da primeira quadra de
// um território designada e termina quando a última quadra daquele
// território é concluída".
//
// Modelo: por território, eventos de DESIGNAÇÃO (designações pessoais e
// arranjos que tocam alguma quadra dele) abrem um CICLO; o ciclo fecha
// quando (quase) todas as quadras do território têm alguma conclusão >= a
// abertura — até `margem` quadras podem ficar sem conclusão e o ciclo
// fecha assim mesmo (fechamento = a maior conclusão entre as que têm,
// ver `fechamento()`). Eventos de designação que caem DENTRO de um ciclo
// aberto pertencem a ele (não abrem outro — trabalhar o mesmo território
// em várias frentes é um ciclo só).
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
  /** true = ciclo sem designação registrada, inferido das conclusões
   *  (histórico lançado / quadra feita sem pedir) */
  inferido?: boolean;
}

/** Rótulo do "Designado para" quando não há nome de pessoa pra mostrar:
 *  arranjo sem dirigente definido, ou ciclo inferido de conclusão sem
 *  nenhuma designação/arranjo registrado (histórico em lote, quadra
 *  feita sem pedir) — na prática os dois casos costumam ser trabalho em
 *  grupo não lançado formalmente, então usam o mesmo rótulo. */
export const DESIGNADO_ARRANJO = 'Arranjo';

export function ciclosDoTerritorio(
  quadraIds: string[],
  eventos: EventoDesignacao[],
  conclusoes: Conclusao[]
): CicloTerritorio[] {
  if (quadraIds.length === 0) return [];
  const porQuadra = new Map<string, string[]>();
  for (const c of conclusoes) {
    if (!quadraIds.includes(c.quadra_id)) continue;
    const arr = porQuadra.get(c.quadra_id) ?? [];
    arr.push(c.data);
    porQuadra.set(c.quadra_id, arr);
  }
  for (const arr of porQuadra.values()) arr.sort();

  // Conclusão sem designação registrada NÃO pode sumir do S-13
  // (histórico lançado em lote, quadra feita sem pedir): cada conclusão
  // vira um candidato a abrir ciclo com data de designação INFERIDA
  // igual à data da conclusão. Se a conclusão já cai dentro de um ciclo
  // real, o candidato é pulado pelo laço (mesma regra dos eventos
  // normais); só a órfã abre ciclo. Empate de data com evento real →
  // o real vem primeiro no sort e ganha o nome.
  type Ev = EventoDesignacao & { inferido?: boolean };
  const evs: Ev[] = [...eventos];
  for (const datas of porQuadra.values())
    for (const d of datas) evs.push({ data: d, nome: null, inferido: true });
  evs.sort((a, b) => a.data.localeCompare(b.data) || Number(!!a.inferido) - Number(!!b.inferido));

  // Margem de tolerância: território raramente fecha 100% no mesmo fôlego
  // — sobra 1 quadra teimosa e o pessoal já considera feito. Tolera até
  // `margem` quadras sem conclusão (proporcional ao tamanho, mínimo 2)
  // pra não prender o ciclo aberto por meses esperando só uma quadra. As
  // quadras toleradas, se forem concluídas bem depois, viram conclusão
  // órfã (mecanismo de inferido acima) — não ficam perdidas, só entram
  // como um registro à parte em vez de esticar este ciclo.
  const margem = Math.max(2, Math.ceil(quadraIds.length * 0.1));

  // Fechamento de um ciclo iniciado em `inicio`: pra cada quadra, a
  // PRIMEIRA conclusão >= inicio; fecha na maior delas quando no máximo
  // `margem` quadras ficaram sem conclusão (nunca fecha com ZERO
  // conclusões — isso não é "quase todo mundo feito", é nada feito).
  function fechamento(inicio: string): string | null {
    let maior: string | null = null;
    let faltando = 0;
    for (const qid of quadraIds) {
      const datas = porQuadra.get(qid) ?? [];
      const primeira = datas.find((d) => d >= inicio);
      if (!primeira) {
        faltando++;
        if (faltando > margem) return null;
        continue;
      }
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
      designado: ev.nome ?? DESIGNADO_ARRANJO,
      conclusao: fim,
      inferido: ev.inferido
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

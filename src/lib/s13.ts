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
// Fechamento FORÇADO: um ciclo pode ficar aberto além do que a margem
// tolera (mais quadras teimosas do que o normal). Se isso acontecer mas o
// território for designado de novo (evento REAL, não inferido de
// conclusão órfã) — regra do usuário: "se designar assim a gente dá como
// concluído pela última quadra e segue o baile" — o ciclo travado fecha
// na melhor data disponível (a maior conclusão desde a abertura, mesmo
// que só parte das quadras tenha, e mesmo ZERO) e um ciclo novo abre pro
// evento novo, marcado com `fechamentoForcado` (regra: só uma
// REdesignação de verdade prova que o território seguiu adiante — uma
// conclusão órfã sozinha não força nada, continua engolindo o resto).
//
// Ciclo INFERIDO (conclusão órfã, sem designação real por trás) tem uma
// janela LIMITADA — a próxima designação/arranjo REAL, SE houver, e
// também qualquer silêncio > 60 dias sem nenhuma conclusão nova no
// território (`limiteGapInferido`) — senão uma quadra esquecida e
// concluída sozinha (histórico solto) ficava aberta esperando o resto do
// território indefinidamente e, quando o trabalho retomava meses depois
// (com ou sem uma redesignação real por trás), o ciclo órfão "roubava"
// esse trabalho todo pra si (fechava tarde demais, com a data certa mas
// o início errado, escondendo que era um esforço novo). Ciclo REAL não
// tem esse teto: evento dentro dele continua pertencendo a ele
// normalmente (regra de sempre).
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
  /** true = fechou sem satisfazer a margem de tolerância normal, forçado
   *  por uma redesignação real que provou que o território seguiu
   *  adiante (pode ter deixado quadra pra trás — ver doc do arquivo) */
  fechamentoForcado?: boolean;
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
  // PRIMEIRA conclusão >= inicio (e < `limite`, se houver — ver abaixo);
  // fecha na maior delas quando no máximo `margem` quadras ficaram sem
  // conclusão (nunca fecha com ZERO conclusões — isso não é "quase todo
  // mundo feito", é nada feito).
  function fechamento(inicio: string, limite: string | null): string | null {
    let maior: string | null = null;
    let faltando = 0;
    for (const qid of quadraIds) {
      const datas = porQuadra.get(qid) ?? [];
      const primeira = datas.find((d) => d >= inicio && (limite === null || d < limite));
      if (!primeira) {
        faltando++;
        if (faltando > margem) return null;
        continue;
      }
      if (!maior || primeira > maior) maior = primeira;
    }
    return maior;
  }

  // Fechamento FORÇADO: sem margem — a MAIOR conclusão disponível desde
  // `inicio` (e < `limite`, se houver), mesmo que só algumas quadras
  // tenham; null se NENHUMA quadra do território tem conclusão nenhuma
  // na janela. Só chamado quando uma redesignação real já provou que o
  // território seguiu adiante (ver doc do arquivo).
  function fechamentoForcado(inicio: string, limite: string | null): string | null {
    let maior: string | null = null;
    for (const qid of quadraIds) {
      const datas = porQuadra.get(qid) ?? [];
      const primeira = datas.find((d) => d >= inicio && (limite === null || d < limite));
      if (primeira && (!maior || primeira > maior)) maior = primeira;
    }
    return maior;
  }

  // Próxima designação/arranjo REAL (não inferida) depois do índice `i`
  // — usada como TETO da janela de um ciclo INFERIDO (órfão), pra ele não
  // "roubar" trabalho de uma redesignação de verdade que vier depois (ver
  // doc do arquivo: quadra esquecida sozinha não pode engolir o arranjo
  // seguinte). Ciclo REAL nunca é limitado por isso — segue com a regra
  // de sempre (evento dentro dele pertence a ele, sem cortar a janela).
  function proximoRealApos(i: number): string | null {
    for (let j = i + 1; j < evs.length; j++) if (!evs[j].inferido) return evs[j].data;
    return null;
  }

  // Território que NUNCA teve designação/arranjo real (100% conclusões
  // avulsas, ex: admin concluindo quadra direto no mapa sem passar pelo
  // fluxo de designação) não tem `proximoRealApos` pra se apoiar — sem
  // outro teto, um ciclo inferido buscava conclusão futura SEM LIMITE de
  // tempo, então uma quadra esquecida sozinha ficava "esperando" o
  // território inteiro ser refeito meses depois e engolia tudo num ciclo
  // só (bug do território 29: quadra concluída sozinha em 22/04, resto só
  // voltou em 04/07 — 73 dias de silêncio — e o relatório mostrava um
  // ciclo só 22/04→10/07). Silêncio > GAP_ABANDONO_DIAS entre duas
  // conclusões seguidas (de QUALQUER quadra do território) é tratado como
  // território esquecido: nada depois do silêncio conta pra este ciclo.
  const GAP_ABANDONO_DIAS = 60;
  function diasEntre(a: string, b: string): number {
    return (Date.parse(b) - Date.parse(a)) / 86400000;
  }
  function limiteGapInferido(inicio: string): string | null {
    const todas = [...porQuadra.values()].flat().filter((d) => d >= inicio).sort();
    for (let i = 1; i < todas.length; i++) {
      if (diasEntre(todas[i - 1], todas[i]) > GAP_ABANDONO_DIAS) return todas[i];
    }
    return null;
  }
  function menorData(a: string | null, b: string | null): string | null {
    if (a === null) return b;
    if (b === null) return a;
    return a < b ? a : b;
  }

  const ciclos: CicloTerritorio[] = [];
  let liberadoApos: string | null = null; // fim do ciclo anterior
  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i];
    if (liberadoApos !== null && ev.data <= liberadoApos) continue; // dentro/antes do ciclo anterior

    const limite = ev.inferido ? menorData(proximoRealApos(i), limiteGapInferido(ev.data)) : null;
    let fim = fechamento(ev.data, limite);
    let forcado = false;
    if (fim === null) {
      // Só força se houver um evento REAL (não inferido) mais novo depois
      // deste — prova de que o território foi designado de novo mesmo
      // sem toda quadra concluída. Conclusão órfã sozinha não força nada.
      const temRedesignacao = ev.inferido ? limite !== null : proximoRealApos(i) !== null;
      if (temRedesignacao) {
        fim = fechamentoForcado(ev.data, limite);
        forcado = true;
      }
    }

    ciclos.push({
      inicio: ev.data,
      designado: ev.nome ?? DESIGNADO_ARRANJO,
      conclusao: fim,
      inferido: ev.inferido,
      fechamentoForcado: forcado || undefined
    });

    if (fim === null && !forcado) break; // genuinamente aberto, sem evento futuro que force — engole o resto
    liberadoApos = fim ?? ev.data; // forçado sem nenhuma conclusão: usa a própria abertura como piso
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

/** Uma linha (território) numa folha impressa: nome + "Última data
 *  concluída" desta folha + os ciclos que cabem na janela de colunas
 *  desta folha (pode ser vazio — o território aparece mesmo assim). */
export interface CelulaS13 {
  terr: string;
  nome: string | null;
  /** "Última data concluída" DESTA folha: na 1ª folha = a do ano
   *  anterior; nas seguintes = a última conclusão registrada até o fim
   *  da folha anterior (baseline pra folha nova ser autossuficiente). */
  ultima: string | null;
  ciclos: CicloTerritorio[];
}

/** Uma FOLHA lógica do S-13 = uma listagem COMPLETA de TODOS os
 *  territórios. Modelo físico do formulário: o servo tem uma folha com
 *  todos os territórios; quando UM estoura as `colunas` designações do
 *  ano, ele pega OUTRA folha, reescreve TODOS os nomes, preenche a
 *  última data de cada e continua — não uma folha só do que estourou.
 *  `passada` 0 = 1ª listagem (colunas 1-4), 1 = 2ª (colunas 5-8), etc. */
export interface FolhaS13 {
  passada: number;
  linhas: CelulaS13[];
}

// Ordena territórios de forma NATURAL: "10" depois de "9" (não depois de
// "1"), e territórios com nome de texto (ex: "Condomínio Parque Verde")
// depois dos numéricos. `localeCompare` com numeric:true faz exatamente
// isso — dígitos antes de letras, números comparados por valor.
function compararTerritorio(a: string, b: string): number {
  return a.localeCompare(b, 'pt', { numeric: true, sensitivity: 'base' });
}

// Monta as folhas impressas do S-13 no MODELO FÍSICO real do formulário:
// cada folha lista TODOS os territórios (em ordem natural). O ano cabe em
// `colunas` designações por território; se ALGUM território tiver mais do
// que isso, cria-se uma folha NOVA inteira (passada seguinte) com todos
// os territórios de novo — cada um com sua "Última data concluída"
// preenchida (a última conclusão registrada até o fim da passada
// anterior) e os ciclos excedentes nas colunas. Territórios que não
// estouraram aparecem na folha nova com nome + última data e as colunas
// de ciclo em branco (pro servo continuar preenchendo à mão). Quando os
// territórios já ocupam N páginas físicas, cada passada ocupa N páginas —
// o navegador pagina cada tabela por conta própria (thead repete).
export function folhasImpressasS13(
  territorios: { id: string; nome: string | null; ciclos: CicloTerritorio[] }[],
  ano: number,
  colunas: number
): FolhaS13[] {
  const linhasAno = territorios
    .map((t) => ({ terr: t.id, nome: t.nome, ...linhaDoAno({ id: t.id, nome: t.nome }, t.ciclos, ano) }))
    .sort((a, b) => compararTerritorio(a.terr, b.terr));

  const maxCiclos = linhasAno.reduce((m, l) => Math.max(m, l.ciclos.length), 0);
  const numPassadas = Math.max(1, Math.ceil(maxCiclos / colunas));

  const folhas: FolhaS13[] = [];
  for (let p = 0; p < numPassadas; p++) {
    const inicio = p * colunas;
    const linhas: CelulaS13[] = linhasAno.map((l) => {
      // Última data desta folha: na 1ª passada, a do ano anterior; nas
      // seguintes, a última conclusão NÃO-nula entre os ciclos já
      // impressos nas passadas anteriores (nunca em branco numa folha de
      // continuação).
      let ultima: string | null = l.ultimaConclusaoAnterior;
      if (p > 0) {
        const anteriores = l.ciclos.slice(0, inicio).filter((c) => c.conclusao !== null);
        ultima = anteriores.length > 0 ? anteriores[anteriores.length - 1].conclusao : l.ultimaConclusaoAnterior;
      }
      return { terr: l.terr, nome: l.nome, ultima, ciclos: l.ciclos.slice(inicio, inicio + colunas) };
    });
    folhas.push({ passada: p, linhas });
  }
  return folhas;
}

export type StatusTerritorio = 'pendente' | 'iniciado' | 'concluido';

// Classificação usada na Visão Geral (E5 seguinte): "concluídas: N quadras"
// sozinho não dizia nada — o que importa é o estado do CICLO do território.
// - concluido: o ciclo mais recente já fechou (nada aberto agora).
// - iniciado: tem ciclo aberto E já rolou alguma coisa nele (quadra
//   concluída dentro do ciclo, ou arranjo ativo tocando o território) —
//   "marcamos como concluída a primeira quadra, mesmo sem designação, ou
//   já tá designado a um arranjo ativo" (regra do usuário).
// - pendente: sem ciclo nenhum ainda, ou ciclo aberto mas zero movimento.
export function statusDoTerritorio(
  quadraIds: string[],
  ciclos: CicloTerritorio[],
  conclusoes: Conclusao[],
  temArranjoAtivo: boolean
): StatusTerritorio {
  if (ciclos.length === 0) return temArranjoAtivo ? 'iniciado' : 'pendente';
  const ultimo = ciclos[ciclos.length - 1];
  if (ultimo.conclusao !== null) return 'concluido';
  const algumaConcluidaNesseCiclo = conclusoes.some(
    (c) => quadraIds.includes(c.quadra_id) && c.data >= ultimo.inicio
  );
  return algumaConcluidaNesseCiclo || temArranjoAtivo ? 'iniciado' : 'pendente';
}

// "Concluir só um lado da quadra" — um lado = uma RUA.
//
// O publicador fala "fizemos o lado da Rua Napoleão Abdon", não "a face
// 3". Por isso o lado é derivado de `locais.logradouro` (NOT NULL), e
// não de `locais.face_ibge` (texto livre, muitas vezes NULL, sem
// significado pra quem está na rua).
//
// REGRA DE OURO: conclusão de lado é PROGRESSO do ciclo atual e não é
// fonte de verdade pra ninguém fora da tela de trabalhar a quadra. A
// conclusão binária da quadra (quadras.data_conclusao /
// quadras_conclusoes) continua sendo o que o S-13, o dashboard, a
// campanha, a cor do mapa e o cartão S-12 leem.
//
// Tudo aqui é PURO — testado em tests/lados.test.ts.

/** Prefixos de logradouro que significam a mesma coisa escrita de outro
 *  jeito. "R." e "RUA" são o mesmo lado; "TRAVESSA" e "RUA", NÃO. */
const PREFIXOS: [RegExp, string][] = [
  [/^R\b\.?/, 'RUA'],
  [/^RUA\b/, 'RUA'],
  [/^AV\b\.?/, 'AVENIDA'],
  [/^AVENIDA\b/, 'AVENIDA'],
  [/^TV\b\.?/, 'TRAVESSA'],
  [/^TRAV\b\.?/, 'TRAVESSA'],
  [/^TRAVESSA\b/, 'TRAVESSA'],
  [/^PC\b\.?/, 'PRACA'],
  [/^PÇ\b\.?/, 'PRACA'],
  [/^PRACA\b/, 'PRACA'],
  [/^ROD\b\.?/, 'RODOVIA'],
  [/^RODOVIA\b/, 'RODOVIA'],
  [/^AL\b\.?/, 'ALAMEDA'],
  [/^ALAMEDA\b/, 'ALAMEDA']
];

/**
 * Chave de comparação do lado: maiúsculas, sem acento, sem pontuação
 * solta, com o TIPO de logradouro padronizado (não removido — remover
 * faria "Travessa João" e "Rua João" virarem o mesmo lado).
 */
export function chaveLado(logradouro: string | null | undefined): string {
  const bruto = (logradouro ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acento
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!bruto) return '';
  for (const [re, canonico] of PREFIXOS) {
    if (re.test(bruto)) return (canonico + ' ' + bruto.replace(re, '').trim()).trim();
  }
  return bruto;
}

export interface LadoDaQuadra {
  chave: string;
  /** como aparece na tela (o logradouro do primeiro endereço) */
  rotulo: string;
  localIds: number[];
  /** conclusão VÁLIDA no ciclo atual da quadra, se houver */
  feitoEm: string | null;
}

export interface ConclusaoLado {
  lado_chave: string;
  data_conclusao: string;
  marcado_em?: string | null;
}

/** Última conclusão de cada lado (maior data; empate → maior marcado_em). */
export function ultimaConclusaoPorLado(cs: ConclusaoLado[]): Map<string, ConclusaoLado> {
  const m = new Map<string, ConclusaoLado>();
  for (const c of cs) {
    const atual = m.get(c.lado_chave);
    if (
      !atual ||
      c.data_conclusao > atual.data_conclusao ||
      (c.data_conclusao === atual.data_conclusao && (c.marcado_em ?? '') > (atual.marcado_em ?? ''))
    ) {
      m.set(c.lado_chave, c);
    }
  }
  return m;
}

/**
 * A conclusão do lado vale no ciclo ATUAL da quadra? Marca anterior à
 * última conclusão cheia é histórico do ciclo passado — o lado precisa
 * ser refeito. É o que impede "quadra reaberta com os lados ainda
 * verdes".
 */
export function ladoFeitoNoCiclo(
  conclusao: ConclusaoLado | undefined,
  dataConclusaoQuadra: string | null | undefined
): boolean {
  if (!conclusao) return false;
  if (!dataConclusaoQuadra) return true;
  return conclusao.data_conclusao > dataConclusaoQuadra;
}

/**
 * Agrupa os endereços da quadra em lados (ruas), já com o estado de
 * feito/não feito no ciclo atual. Endereço marcado como inexistente
 * fica de fora — senão uma rua que não existe mais seguraria a quadra
 * aberta pra sempre.
 */
export function ladosDaQuadra<
  T extends { id: number; logradouro: string; marcado_nao_existe?: boolean | null }
>(
  locais: T[],
  conclusoes: ConclusaoLado[],
  dataConclusaoQuadra: string | null | undefined
): LadoDaQuadra[] {
  const porChave = new Map<string, { rotulo: string; localIds: number[] }>();
  for (const l of locais) {
    if (l.marcado_nao_existe) continue;
    const chave = chaveLado(l.logradouro);
    if (!chave) continue;
    const atual = porChave.get(chave);
    if (atual) atual.localIds.push(l.id);
    else porChave.set(chave, { rotulo: l.logradouro, localIds: [l.id] });
  }
  const ultimas = ultimaConclusaoPorLado(conclusoes);
  return [...porChave.entries()]
    .map(([chave, v]) => {
      const c = ultimas.get(chave);
      return {
        chave,
        rotulo: v.rotulo,
        localIds: v.localIds,
        feitoEm: ladoFeitoNoCiclo(c, dataConclusaoQuadra) ? c!.data_conclusao : null
      };
    })
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** Todos os lados feitos no ciclo atual? (quadra sem endereço → false:
 *  não faz sentido "fechar sozinha" uma quadra vazia) */
export function todosLadosFeitos(lados: LadoDaQuadra[]): boolean {
  return lados.length > 0 && lados.every((l) => l.feitoEm !== null);
}

/** Data da conclusão cheia automática = a MAIOR entre os lados. */
export function dataConclusaoCheiaAutomatica(lados: LadoDaQuadra[]): string | null {
  let maior: string | null = null;
  for (const l of lados) {
    if (l.feitoEm && (!maior || l.feitoEm > maior)) maior = l.feitoEm;
  }
  return maior;
}

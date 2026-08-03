// Revisão humana das áreas geradas pelo Installer (`revisao_status`).
//
// As duas malhas — pregação regular/rural e censo de idioma — são revisadas
// em telas SEPARADAS (/admin/poligonos e /admin/censo), mas a regra é a
// mesma, então ela mora aqui. Cada action passa a sua finalidade e o
// helper NUNCA toca área de outra finalidade: é a garantia de que o editor
// territorial não aprova malha de idioma nem o contrário, mesmo que um id
// chegue por engano no formulário.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinalidadeArea } from "$lib/types";

export interface ResultadoRevisao {
  ok: boolean;
  msg?: string;
  erro?: string;
}

export const REVISAO_VALIDA = ["suggested", "approved"] as const;
export type RevisaoStatus = (typeof REVISAO_VALIDA)[number];

// Aprovar = tornar operacional (ativa). Para `language-census` "operacional"
// significa apenas visível na própria malha de censo: nenhum fluxo de
// pregação e nenhum vínculo automático de endereço olha essa finalidade.
export async function alterarRevisaoArea(
  supabase: SupabaseClient,
  id: string,
  revisaoStatus: string,
  finalidade: FinalidadeArea,
): Promise<ResultadoRevisao> {
  if (!id || !REVISAO_VALIDA.includes(revisaoStatus as RevisaoStatus))
    return { ok: false, erro: "Área ou revisão inválida" };
  // `count` porque UPDATE filtrado (ou barrado por RLS) responde sucesso com
  // 0 linhas — sem isso, aprovar a área errada dava toast verde sem efeito.
  const { error, count } = await supabase
    .from("quadras")
    .update(
      { revisao_status: revisaoStatus, ativa: revisaoStatus === "approved" },
      { count: "exact" },
    )
    .eq("id", id)
    .eq("finalidade", finalidade);
  if (error) return { ok: false, erro: error.message };
  if (!count) return { ok: false, erro: `${id} não é uma área desta malha` };
  return {
    ok: true,
    msg:
      revisaoStatus === "approved"
        ? `${id} aprovada`
        : `${id} voltou para revisão`,
  };
}

// Lote: só alta confiança. Média/baixa continua exigindo olho humano no mapa.
export async function aprovarAreasConfiaveis(
  supabase: SupabaseClient,
  finalidade: FinalidadeArea,
): Promise<ResultadoRevisao> {
  const { count, error: countError } = await supabase
    .from("quadras")
    .select("id", { count: "exact", head: true })
    .eq("finalidade", finalidade)
    .eq("confianca", "high")
    .eq("revisao_status", "suggested");
  if (countError) return { ok: false, erro: countError.message };
  const { error } = await supabase
    .from("quadras")
    .update({ revisao_status: "approved", ativa: true })
    .eq("finalidade", finalidade)
    .eq("confianca", "high")
    .eq("revisao_status", "suggested");
  if (error) return { ok: false, erro: error.message };
  return { ok: true, msg: `${count ?? 0} área(s) confiável(is) aprovada(s)` };
}

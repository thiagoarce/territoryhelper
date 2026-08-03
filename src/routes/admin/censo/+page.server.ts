// O load mora em +page.ts (universal, roda no browser). Aqui só as actions
// de revisão, fixadas na finalidade `language-census`: aprovar uma área de
// censo torna a área visível/ativa DENTRO da malha de censo e nada mais —
// nenhum fluxo de pregação, nenhuma designação e nenhum vínculo automático
// de endereço olha essa finalidade (auto_vincular_enderecos filtra
// `finalidade = 'regular-preaching'` no SQL).
import type { Actions } from "./$types";
import { exigirAdminAction } from "$lib/server/guards";
import {
  alterarRevisaoArea,
  aprovarAreasConfiaveis,
} from "$lib/server/revisao-areas";
import { fail } from "@sveltejs/kit";

const FINALIDADE = "language-census" as const;

export const actions: Actions = {
  alterarRevisaoArea: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const r = await alterarRevisaoArea(
      locals.supabase,
      String(fd.get("id") ?? ""),
      String(fd.get("revisao_status") ?? ""),
      FINALIDADE,
    );
    return r.ok ? { ok: true, msg: r.msg } : fail(400, { erro: r.erro });
  },

  aprovarAreasConfiaveis: async ({ locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const r = await aprovarAreasConfiaveis(locals.supabase, FINALIDADE);
    return r.ok ? { ok: true, msg: r.msg } : fail(400, { erro: r.erro });
  },
};

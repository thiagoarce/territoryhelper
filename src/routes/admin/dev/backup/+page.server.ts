import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { exigirAdminAction } from '$lib/server/guards';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { TABELAS_BACKUP, RESTORE_PULA, VERSAO_BACKUP } from './_tabelas';
import { listarSnapshots, gerarSnapshotSeNecessario, baixarSnapshot } from './_snapshot';

export const load: PageServerLoad = async ({ locals, platform }) => {
  // U6: gera um snapshot novo em background se o mais recente já
  // estiver velho — não bloqueia a resposta da página.
  platform?.context?.waitUntil(gerarSnapshotSeNecessario());
  return {
    minhaRole: locals.profile?.role,
    tabelas: TABELAS_BACKUP.map((t) => t.nome),
    puladasNoRestore: [...RESTORE_PULA],
    snapshots: await listarSnapshots()
  };
};

const LOTE = 500;

type ResultadoLinha = { tabela: string; linhas: number; status: 'ok' | 'pulada' | 'erro'; msg?: string };

// T34/A25: aplica um backup (objeto já parseado) por UPSERT em ordem de
// FK. Não deleta nada que não esteja no arquivo — é "recuperar", não
// "espelhar". Compartilhado pelas duas actions de restore (upload
// manual e snapshot automático, U6).
async function aplicarRestore(backup: any): Promise<
  { ok: true; resultados: ResultadoLinha[] } | { ok: false; erro: string; resultados: ResultadoLinha[] }
> {
  if (backup?.app !== 'territoryhelper' || !backup?.tabelas) {
    return { ok: false, erro: 'Arquivo não parece um backup do Territory Helper', resultados: [] };
  }
  if (backup.versao !== VERSAO_BACKUP) {
    return { ok: false, erro: `Versão do backup (${backup.versao}) diferente da esperada (${VERSAO_BACKUP})`, resultados: [] };
  }

  const resultados: ResultadoLinha[] = [];

  for (const t of TABELAS_BACKUP) {
    const linhas = (backup.tabelas[t.nome] ?? []) as Record<string, unknown>[];
    if (RESTORE_PULA.has(t.nome)) {
      resultados.push({ tabela: t.nome, linhas: linhas.length, status: 'pulada', msg: 'depende do Auth' });
      continue;
    }
    if (linhas.length === 0) {
      resultados.push({ tabela: t.nome, linhas: 0, status: 'ok' });
      continue;
    }
    let erro: string | null = null;
    for (let i = 0; i < linhas.length; i += LOTE) {
      const lote = linhas.slice(i, i + LOTE);
      const { error } = await supabaseAdmin.from(t.nome).upsert(lote, { onConflict: t.pk });
      if (error) {
        erro = `lote ${i / LOTE + 1}: ${error.message}`;
        break;
      }
    }
    resultados.push({
      tabela: t.nome,
      linhas: linhas.length,
      status: erro ? 'erro' : 'ok',
      msg: erro ?? undefined
    });
    // Erro numa tabela-base compromete as dependentes — para aqui pra
    // não cascatear violação de FK em cima de dado meio-restaurado.
    if (erro) {
      resultados.push({ tabela: '(interrompido)', linhas: 0, status: 'erro', msg: 'restore parado no primeiro erro' });
      return { ok: false, erro: `Falhou em ${t.nome} — ${erro}`, resultados };
    }
  }

  // Realinha as sequences dos ids seriais (upsert com id explícito não
  // avança a sequence — sem isso o próximo INSERT normal colide).
  const setvals = TABELAS_BACKUP.filter((t) => t.serial)
    .map((t) => `select setval(pg_get_serial_sequence('${t.nome}','id'), coalesce((select max(id) from ${t.nome}), 1));`)
    .join('\n');
  const { error: errSeq } = await supabaseAdmin.rpc('exec_sql' as any, { query: setvals });
  if (errSeq) {
    return { ok: false, erro: 'Dados restaurados, mas falhou realinhar sequences: ' + errSeq.message, resultados };
  }

  return { ok: true, resultados };
}

export const actions: Actions = {
  // T34/A25: RESTAURA um backup enviado por upload, por UPSERT em ordem
  // de FK. Exige digitar RESTAURAR (destrutivo no sentido de
  // sobrescrever registros existentes com o conteúdo do arquivo).
  restaurar: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;

    const fd = await request.formData();
    const confirmacao = String(fd.get('confirmacao') ?? '').trim();
    if (confirmacao !== 'RESTAURAR') {
      return fail(400, { erro: 'Digite RESTAURAR pra confirmar' });
    }
    const arquivo = fd.get('arquivo') as File | null;
    if (!arquivo || arquivo.size === 0) return fail(400, { erro: 'Envie o arquivo de backup (.json)' });

    let backup: any;
    try {
      backup = JSON.parse(await arquivo.text());
    } catch {
      return fail(400, { erro: 'Arquivo não é um JSON válido' });
    }

    const resultado = await aplicarRestore(backup);
    if (!resultado.ok) return fail(400, { erro: resultado.erro, resultados: resultado.resultados });
    return { ok: true, resultados: resultado.resultados };
  },

  // U6: RESTAURA a partir de um snapshot automático já salvo no Storage
  // (sem precisar baixar/reenviar o arquivo manualmente).
  restaurarSnapshot: async ({ request, locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;

    const fd = await request.formData();
    const confirmacao = String(fd.get('confirmacao') ?? '').trim();
    if (confirmacao !== 'RESTAURAR') {
      return fail(400, { erro: 'Digite RESTAURAR pra confirmar' });
    }
    const nome = String(fd.get('nome') ?? '').trim();
    if (!nome) return fail(400, { erro: 'Snapshot não informado' });

    const backup = await baixarSnapshot(nome);
    if (!backup) return fail(400, { erro: 'Não consegui ler esse snapshot' });

    const resultado = await aplicarRestore(backup);
    if (!resultado.ok) return fail(400, { erro: resultado.erro, resultados: resultado.resultados });
    return { ok: true, resultados: resultado.resultados };
  }
};

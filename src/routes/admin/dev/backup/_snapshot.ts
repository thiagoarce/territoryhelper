// U6: snapshot automático de backup — alternativa gratuita ao
// Point-in-Time-Recovery pago do Supabase (decisão do usuário: sem
// assinar nada). Sem Cron Trigger (o adapter Cloudflare deste projeto
// só suporta handler de fetch) — o snapshot é gerado sob demanda
// quando um admin abre /admin/dev/backup, se o último salvo já tem
// mais de INTERVALO_HORAS. Reusa o mesmo formato do export manual
// (versao/gerado_em/app/tabelas) pra funcionar com o restore existente.
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { selectAll } from '$lib/server/queries';
import { TABELAS_BACKUP, VERSAO_BACKUP } from './_tabelas';

const BUCKET = 'backups-auto';
const MAX_SNAPSHOTS = 7;
const INTERVALO_HORAS = 20;

export interface SnapshotInfo {
  nome: string;
  criado_em: string;
}

export async function listarSnapshots(): Promise<SnapshotInfo[]> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list('', {
    sortBy: { column: 'name', order: 'desc' }
  });
  if (error || !data) return [];
  return data
    .filter((f) => f.name.endsWith('.json'))
    .map((f) => ({ nome: f.name, criado_em: f.created_at ?? f.updated_at ?? '' }));
}

// Mesma técnica de U5 (export streaming): busca + serializa UMA tabela
// por vez, com um await de rede entre cada uma — quebra o trabalho em
// N rajadas síncronas pequenas em vez de 1 rajada gigante, mesmo
// acumulando o resultado numa string em vez de escrever direto na
// resposta HTTP (aqui o destino é o Storage, não o browser).
async function gerarConteudoBackup(): Promise<string> {
  const partes: string[] = [];
  const cabecalho = { versao: VERSAO_BACKUP, gerado_em: new Date().toISOString(), app: 'territoryhelper' };
  partes.push(JSON.stringify(cabecalho).slice(0, -1) + ',"tabelas":{');
  for (let i = 0; i < TABELAS_BACKUP.length; i++) {
    const t = TABELAS_BACKUP[i];
    const primeiraPk = t.pk.split(',')[0];
    const linhas = await selectAll<Record<string, unknown>>(
      supabaseAdmin.from(t.nome).select('*').order(primeiraPk)
    );
    partes.push((i > 0 ? ',' : '') + JSON.stringify(t.nome) + ':' + JSON.stringify(linhas));
  }
  partes.push('}}');
  return partes.join('');
}

// Chamado via platform.context.waitUntil() no load de /admin/dev/backup
// — não bloqueia a resposta da página. Silencioso em erro (loga só) já
// que roda em background sem ninguém esperando o resultado direto.
export async function gerarSnapshotSeNecessario(): Promise<void> {
  try {
    const snapshots = await listarSnapshots();
    const maisRecente = snapshots[0];
    if (maisRecente?.criado_em) {
      const idadeMs = Date.now() - new Date(maisRecente.criado_em).getTime();
      if (idadeMs < INTERVALO_HORAS * 3600_000) return; // ainda fresco
    }
    const conteudo = await gerarConteudoBackup();
    const nome = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(nome, new Blob([conteudo], { type: 'application/json' }), { upsert: false });
    if (error) {
      console.error('[snapshot] upload falhou:', error.message);
      return;
    }

    // Rotação: mantém só os MAX_SNAPSHOTS mais recentes.
    const atualizados = await listarSnapshots();
    const antigos = atualizados.slice(MAX_SNAPSHOTS).map((s) => s.nome);
    if (antigos.length > 0) {
      await supabaseAdmin.storage.from(BUCKET).remove(antigos);
    }
  } catch (e) {
    console.error('[snapshot] erro inesperado:', e);
  }
}

// Baixa e faz parse de um snapshot salvo — usado pelo restore.
export async function baixarSnapshot(nome: string): Promise<any | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(nome);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

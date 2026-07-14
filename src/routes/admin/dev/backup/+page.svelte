<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { deserialize } from '$app/forms';
  import { onMount } from 'svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { supabaseBrowser } from '$lib/supabase-browser';

  let { data }: {
    data: { tabelas: string[]; puladasNoRestore: string[]; versaoBackup: number };
  } = $props();

  const BUCKET = 'backups-auto';
  const MAX_SNAPSHOTS = 7;
  const INTERVALO_HORAS = 20;

  // ── Snapshots (100% no browser — W6): lista, gera, rotaciona ────────
  interface SnapshotInfo { nome: string; criado_em: string; tamanho: number | null }
  let snapshots = $state<SnapshotInfo[]>([]);
  let carregandoSnapshots = $state(true);
  let gerandoSnapshot = $state(false);

  async function listarSnapshots(): Promise<SnapshotInfo[]> {
    const { data: arquivos, error } = await supabaseBrowser().storage.from(BUCKET).list('', {
      sortBy: { column: 'name', order: 'desc' }
    });
    if (error) throw error;
    return (arquivos ?? [])
      .filter((f) => f.name.endsWith('.json'))
      .map((f) => ({
        nome: f.name,
        criado_em: f.created_at ?? f.updated_at ?? '',
        tamanho: (f.metadata as any)?.size ?? null
      }));
  }

  async function gerarSnapshot(automatico = false) {
    gerandoSnapshot = true;
    try {
      // O export streaming (U5) já funciona — o browser baixa e sobe
      // direto pro Storage (policies da migration 076). Zero CPU no Worker
      // além do export em si.
      const res = await fetch('/admin/dev/backup/export');
      if (!res.ok) throw new Error(`Export falhou (${res.status})`);
      const blob = await res.blob();
      const nome = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const { error } = await supabaseBrowser().storage.from(BUCKET).upload(nome, blob, {
        contentType: 'application/json',
        upsert: false
      });
      if (error) throw error;

      // Rotação: mantém só os MAX_SNAPSHOTS mais recentes.
      const todos = await listarSnapshots();
      const antigos = todos.slice(MAX_SNAPSHOTS).map((s) => s.nome);
      if (antigos.length > 0) await supabaseBrowser().storage.from(BUCKET).remove(antigos);

      snapshots = (await listarSnapshots()).slice(0, MAX_SNAPSHOTS);
      if (!automatico) toast.success('Snapshot gerado');
    } catch (e: any) {
      if (!automatico) toast.error('Falhou gerar snapshot: ' + (e?.message ?? e));
    } finally {
      gerandoSnapshot = false;
    }
  }

  onMount(async () => {
    try {
      snapshots = await listarSnapshots();
      // Auto: se o mais recente tem mais de INTERVALO_HORAS (ou não existe
      // nenhum), gera um em background — sem Cron Trigger (o adapter
      // Cloudflare só suporta fetch), quem "agenda" é abrir esta tela.
      const maisRecente = snapshots[0];
      const idadeMs = maisRecente?.criado_em ? Date.now() - new Date(maisRecente.criado_em).getTime() : Infinity;
      if (idadeMs > INTERVALO_HORAS * 3600_000) void gerarSnapshot(true);
    } catch (e: any) {
      toast.error('Falhou listar snapshots: ' + (e?.message ?? e));
    } finally {
      carregandoSnapshots = false;
    }
  });

  function fmtSnapshot(iso: string): string {
    return iso ? new Date(iso).toLocaleString('pt-BR') : '?';
  }
  function fmtTamanho(bytes: number | null): string {
    if (bytes == null) return '';
    return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  // ── Restore em LOTES (o browser parseia; o Worker só upserta ~400
  //    linhas por request — o modelo antigo de arquivo inteiro estourava
  //    CPU e nunca completava) ─────────────────────────────────────────
  const LOTE = 400;
  let confirmacao = $state('');
  let restaurando = $state(false);
  let progresso = $state<{ tabela: string; feitas: number; total: number } | null>(null);
  let resultados = $state<{ tabela: string; linhas: number; status: 'ok' | 'pulada' | 'erro'; msg?: string }[]>([]);
  let arquivoInput = $state<HTMLInputElement | null>(null);
  let snapshotEscolhido = $state<string | null>(null);

  // ── Higiene de dados ─────────────────────────────────────────────────
  let limpandoNotificacoes = $state(false);
  let resultadoLimpeza = $state<string | null>(null);
  async function limparNotificacoesAntigas() {
    limpandoNotificacoes = true;
    resultadoLimpeza = null;
    try {
      const res = await fetch('?/limparNotificacoesAntigas', { method: 'POST', body: new FormData() });
      const parsed = deserialize(await res.text()) as any;
      if (parsed.type === 'success') {
        resultadoLimpeza = `${parsed.data.removidas} notificação(ões) removida(s).`;
        toast.success('Limpeza concluída');
      } else {
        toast.error(String(parsed.data?.erro || 'Falhou limpar'));
      }
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      limpandoNotificacoes = false;
    }
  }

  async function postAction(action: string, fd: FormData): Promise<{ ok: boolean; erro?: string }> {
    const res = await fetch(action, { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success') return { ok: true };
    return { ok: false, erro: String(parsed.data?.erro || 'Falhou') };
  }

  async function restaurarBackup(backup: any) {
    if (backup?.app !== 'territoryhelper' || !backup?.tabelas) {
      toast.error('Arquivo não parece um backup do Territory Helper');
      return;
    }
    if (backup.versao !== data.versaoBackup) {
      toast.error(`Versão do backup (${backup.versao}) diferente da esperada (${data.versaoBackup})`);
      return;
    }
    restaurando = true;
    resultados = [];
    const puladas = new Set(data.puladasNoRestore);
    try {
      for (const tabela of data.tabelas) {
        const linhas = (backup.tabelas[tabela] ?? []) as Record<string, unknown>[];
        if (puladas.has(tabela)) {
          resultados = [...resultados, { tabela, linhas: linhas.length, status: 'pulada', msg: 'depende do Auth' }];
          continue;
        }
        if (linhas.length === 0) {
          resultados = [...resultados, { tabela, linhas: 0, status: 'ok' }];
          continue;
        }
        progresso = { tabela, feitas: 0, total: linhas.length };
        for (let i = 0; i < linhas.length; i += LOTE) {
          const fd = new FormData();
          fd.append('tabela', tabela);
          fd.append('linhas_json', JSON.stringify(linhas.slice(i, i + LOTE)));
          const r = await postAction('?/restaurarLote', fd);
          if (!r.ok) {
            // Erro numa tabela-base compromete as dependentes — para aqui
            // pra não cascatear violação de FK em cima de dado meio-restaurado.
            resultados = [...resultados, { tabela, linhas: linhas.length, status: 'erro', msg: r.erro }];
            toast.error(`Restore parado em ${tabela}: ${r.erro}`);
            return;
          }
          progresso = { tabela, feitas: Math.min(i + LOTE, linhas.length), total: linhas.length };
        }
        resultados = [...resultados, { tabela, linhas: linhas.length, status: 'ok' }];
      }
      const seq = await postAction('?/realinharSequences', new FormData());
      if (!seq.ok) {
        toast.error('Dados restaurados, mas ' + seq.erro);
        return;
      }
      toast.success('Backup restaurado');
    } finally {
      restaurando = false;
      progresso = null;
      confirmacao = '';
    }
  }

  async function restaurarDeArquivo() {
    const arquivo = arquivoInput?.files?.[0];
    if (!arquivo) { toast.error('Escolha o arquivo de backup (.json)'); return; }
    let backup: any;
    try {
      backup = JSON.parse(await arquivo.text());
    } catch {
      toast.error('Arquivo não é um JSON válido');
      return;
    }
    await restaurarBackup(backup);
  }

  async function restaurarDeSnapshot() {
    if (!snapshotEscolhido) return;
    restaurando = true;
    try {
      const { data: blob, error } = await supabaseBrowser().storage.from(BUCKET).download(snapshotEscolhido);
      if (error || !blob) { toast.error('Falhou baixar o snapshot'); return; }
      let backup: any;
      try {
        backup = JSON.parse(await blob.text());
      } catch {
        toast.error('Snapshot corrompido (JSON inválido)');
        return;
      }
      await restaurarBackup(backup);
    } finally {
      restaurando = false;
    }
  }
</script>

<div class="p-4 space-y-4 max-w-2xl">
  <div>
    <h1 class="text-2xl font-bold">Backup</h1>
    <p class="text-sm text-slate-500">
      Exporta todas as tabelas de dados num JSON e restaura por upsert.
      O dado da congregação só existe no Supabase — baixe um backup de
      tempos em tempos e guarde num lugar seguro.
    </p>
  </div>

  <Card padding="md">
    <h2 class="font-semibold mb-1">Exportar</h2>
    <p class="text-xs text-slate-500 mb-3">
      {data.tabelas.length} tabelas (território, endereços, registros,
      designações, arranjos, TP, publicações...). Notificações, inscrições
      de push e convites ficam de fora (descartáveis/presos ao Auth).
    </p>
    <a href="/admin/dev/backup/export" download
      class="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700">
      <Icon nome="inbox" size={14} /> Baixar backup (.json)
    </a>
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-1">Snapshots automáticos</h2>
    <p class="text-xs text-slate-500 mb-3">
      Guardados no Storage do Supabase (mantém os {MAX_SNAPSHOTS} mais
      recentes). Ao abrir esta tela, se o último tiver mais de
      ~{INTERVALO_HORAS}h, um novo é gerado sozinho — o seu navegador faz o
      trabalho (baixa o export e sobe direto pro Storage), nada roda no
      servidor.
    </p>
    <Button variant="secondary" size="sm" loading={gerandoSnapshot} onclick={() => gerarSnapshot(false)}>
      <Icon nome="sparkles" size={12} /> Gerar snapshot agora
    </Button>

    {#if carregandoSnapshots}
      <p class="text-xs text-slate-400 mt-3">Carregando snapshots…</p>
    {:else if snapshots.length === 0}
      <p class="text-xs text-slate-400 mt-3">Nenhum snapshot ainda.</p>
    {:else}
      <div class="space-y-1.5 mt-3">
        {#each snapshots as s (s.nome)}
          <label class="flex items-center gap-2 text-sm rounded-lg border border-slate-200 px-3 py-2 cursor-pointer" class:border-primary-400={snapshotEscolhido === s.nome} class:bg-primary-50={snapshotEscolhido === s.nome}>
            <input type="radio" name="snapshot_radio" value={s.nome} bind:group={snapshotEscolhido} />
            <span class="flex-1 truncate">{fmtSnapshot(s.criado_em)}</span>
            <span class="text-xs text-slate-400 shrink-0">{fmtTamanho(s.tamanho)}</span>
          </label>
        {/each}
      </div>

      {#if snapshotEscolhido}
        <div class="space-y-2 mt-3 pt-3 border-t border-slate-100">
          <input bind:value={confirmacao} placeholder='Digite RESTAURAR pra confirmar' required
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          <Button variant="danger" loading={restaurando} disabled={confirmacao !== 'RESTAURAR'} onclick={restaurarDeSnapshot} class="w-full">
            <Icon nome="alert" size={14} /> Restaurar deste snapshot
          </Button>
        </div>
      {/if}
    {/if}
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-1 text-red-700">Restaurar de arquivo</h2>
    <p class="text-xs text-slate-500 mb-3">
      Aplica o arquivo por cima do banco atual (upsert em ordem de
      dependência, em lotes de {LOTE} linhas): registros do arquivo
      SOBRESCREVEM os de mesmo id; o que só existe no banco fica intacto —
      restaurar é recuperar, não espelhar. <strong>profiles</strong> é
      pulado (usuários vivem no Auth — restaure no mesmo projeto ou crie
      os usuários antes).
    </p>
    <div class="space-y-2">
      <input type="file" accept="application/json,.json" bind:this={arquivoInput}
        class="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" />
      <input bind:value={confirmacao} placeholder='Digite RESTAURAR pra confirmar' required
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
      <Button variant="danger" loading={restaurando} disabled={confirmacao !== 'RESTAURAR'} onclick={restaurarDeArquivo} class="w-full">
        <Icon nome="alert" size={14} /> Restaurar backup
      </Button>
    </div>

    {#if progresso}
      <div class="mt-3 pt-3 border-t border-slate-100">
        <div class="flex items-center justify-between text-xs mb-1">
          <span class="font-mono">{progresso.tabela}</span>
          <span>{progresso.feitas}/{progresso.total}</span>
        </div>
        <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full bg-primary-600 transition-all" style:width="{progresso.total > 0 ? Math.round((progresso.feitas / progresso.total) * 100) : 0}%"></div>
        </div>
      </div>
    {/if}

    {#if resultados.length > 0}
      <div class="mt-3 pt-3 border-t border-slate-100 space-y-0.5 text-xs max-h-64 overflow-y-auto">
        {#each resultados as r}
          <div class="flex items-center justify-between gap-2 {r.status === 'erro' ? 'text-red-700' : r.status === 'pulada' ? 'text-slate-400' : 'text-slate-600'}">
            <span class="font-mono">{r.tabela}</span>
            <span>{r.status === 'ok' ? `${r.linhas} linha(s)` : r.status === 'pulada' ? `pulada (${r.msg})` : r.msg}</span>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-1">Higiene de dados</h2>
    <p class="text-xs text-slate-500 mb-3">
      <strong>notificacoes</strong> é append-only e só cresce — o Postgres
      do plano free tem 500MB. Apaga só notificação JÁ LIDA com mais de
      90 dias; não-lida nunca é apagada, mesmo antiga.
    </p>
    <Button variant="secondary" loading={limpandoNotificacoes} onclick={limparNotificacoesAntigas} class="w-full">
      <Icon nome="trash" size={14} /> Limpar notificações lidas antigas
    </Button>
    {#if resultadoLimpeza}
      <p class="text-xs text-slate-500 mt-2">{resultadoLimpeza}</p>
    {/if}
  </Card>
</div>

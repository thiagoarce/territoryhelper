<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { enhance } from '$app/forms';
  import { toast } from '$lib/ui/toast.svelte';

  let { data, form }: {
    data: { tabelas: string[]; puladasNoRestore: string[]; snapshots: { nome: string; criado_em: string }[] };
    form: any;
  } = $props();

  let restaurando = $state(false);
  let confirmacao = $state('');

  // U6: restaurar a partir de um snapshot automático (sem upload manual).
  let snapshotEscolhido = $state<string | null>(null);
  let confirmacaoSnapshot = $state('');
  let restaurandoSnapshot = $state(false);

  function fmtSnapshot(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR');
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
      Sem versão real do banco (isso é recurso pago do Supabase) — mas
      toda vez que essa tela é aberta, se o último snapshot salvo tiver
      mais de ~20h, um novo é gerado sozinho em segundo plano (mesmo
      formato do export acima), guardado no Storage. Mantém os últimos
      7 automaticamente.
    </p>
    {#if data.snapshots.length === 0}
      <p class="text-xs text-slate-400">Nenhum snapshot ainda — volte a esta tela em alguns minutos.</p>
    {:else}
      <div class="space-y-1.5">
        {#each data.snapshots as s (s.nome)}
          <label class="flex items-center gap-2 text-sm rounded-lg border border-slate-200 px-3 py-2 cursor-pointer" class:border-primary-400={snapshotEscolhido === s.nome} class:bg-primary-50={snapshotEscolhido === s.nome}>
            <input type="radio" name="snapshot_radio" value={s.nome} bind:group={snapshotEscolhido} />
            <span class="flex-1 truncate">{fmtSnapshot(s.criado_em)}</span>
            <span class="font-mono text-xs text-slate-400 truncate">{s.nome}</span>
          </label>
        {/each}
      </div>

      {#if snapshotEscolhido}
        <form
          method="POST"
          action="?/restaurarSnapshot"
          use:enhance={() => {
            restaurandoSnapshot = true;
            return async ({ result, update }) => {
              await update({ reset: false });
              restaurandoSnapshot = false;
              if (result.type === 'success') toast.success('Restaurado a partir do snapshot');
              else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
            };
          }}
          class="space-y-2 mt-3 pt-3 border-t border-slate-100"
        >
          <input type="hidden" name="nome" value={snapshotEscolhido} />
          <input name="confirmacao" bind:value={confirmacaoSnapshot} placeholder='Digite RESTAURAR pra confirmar' required
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          <Button variant="danger" type="submit" loading={restaurandoSnapshot} disabled={confirmacaoSnapshot !== 'RESTAURAR'} class="w-full">
            <Icon nome="alert" size={14} /> Restaurar deste snapshot
          </Button>
        </form>
      {/if}
    {/if}
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-1 text-red-700">Restaurar</h2>
    <p class="text-xs text-slate-500 mb-3">
      Aplica o arquivo por cima do banco atual (upsert em ordem de
      dependência): registros do arquivo SOBRESCREVEM os de mesmo id;
      o que só existe no banco fica intacto — restaurar é recuperar, não
      espelhar. <strong>profiles</strong> é pulado (usuários vivem no
      Auth — restaure no mesmo projeto ou crie os usuários antes).
    </p>
    <form
      method="POST"
      action="?/restaurar"
      enctype="multipart/form-data"
      use:enhance={() => {
        restaurando = true;
        return async ({ result, update }) => {
          await update({ reset: false });
          restaurando = false;
          if (result.type === 'success') toast.success('Backup restaurado');
          else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
        };
      }}
      class="space-y-2"
    >
      <input type="file" name="arquivo" accept="application/json,.json" required
        class="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" />
      <input name="confirmacao" bind:value={confirmacao} placeholder='Digite RESTAURAR pra confirmar' required
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
      <Button variant="danger" type="submit" loading={restaurando} disabled={confirmacao !== 'RESTAURAR'} class="w-full">
        <Icon nome="alert" size={14} /> Restaurar backup
      </Button>
    </form>

    {#if form?.resultados}
      <div class="mt-3 pt-3 border-t border-slate-100 space-y-0.5 text-xs max-h-64 overflow-y-auto">
        {#each form.resultados as r}
          <div class="flex items-center justify-between gap-2 {r.status === 'erro' ? 'text-red-700' : r.status === 'pulada' ? 'text-slate-400' : 'text-slate-600'}">
            <span class="font-mono">{r.tabela}</span>
            <span>{r.status === 'ok' ? `${r.linhas} linha(s)` : r.status === 'pulada' ? `pulada (${r.msg})` : r.msg}</span>
          </div>
        {/each}
      </div>
    {/if}
  </Card>
</div>

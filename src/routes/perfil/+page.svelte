<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  // dynamic, não static: a chave é opcional até configurar (ver $lib/server/push.ts)
  import { env as publicEnv } from '$env/dynamic/public';
  import { lerUltimoPrefetch } from '$lib/offline/status';
  import { limparCacheLeitura } from '$lib/offline/cache-leitura';
  import { baixarTudoParaOffline } from '$lib/campo-fetchers';
  import { metaMapaOffline, baixarMapaOffline, removerMapaOffline, type MetaMapaOffline } from '$lib/mapa-offline';

  // PUSH-A: base64url (mesmo formato do endpoint) → Uint8Array, formato
  // que pushManager.subscribe espera em applicationServerKey.
  function urlBase64ToUint8Array(base64url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
    const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  let { data, form }: {
    data: {
      profile: any;
      email: string;
      qtdPushSubscriptions: number;
    };
    form: any;
  } = $props();
  let salvandoNome = $state(false);
  let salvandoSenha = $state(false);
  let salvandoBasemap = $state(false);

  // W12: seção Offline — última sincronização completa (W9's "baixar pra
  // usar offline"), estimativa de espaço usado e ações manuais (baixar
  // agora / limpar). Só mexe no cache de LEITURA — a fila de escrita
  // (dado de campo ainda não sincronizado) NUNCA é tocada aqui.
  let ultimaSincronizacao = $state<number | null>(null);
  let espacoUsadoMb = $state<number | null>(null);
  let baixandoTudo = $state(false);
  let limpandoOffline = $state(false);

  async function atualizarEstimativaEspaco() {
    try {
      if (navigator.storage?.estimate) {
        const { usage } = await navigator.storage.estimate();
        espacoUsadoMb = usage != null ? Math.round((usage / (1024 * 1024)) * 10) / 10 : null;
      }
    } catch {
      espacoUsadoMb = null;
    }
  }

  onMount(() => {
    ultimaSincronizacao = lerUltimoPrefetch();
    void atualizarEstimativaEspaco();
  });

  function fmtUltimaSincronizacao(ts: number): string {
    return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  async function baixarTudoAgora() {
    if (!data.profile?.id) return;
    baixandoTudo = true;
    try {
      await baixarTudoParaOffline(data.profile.id, data.profile.role, !!data.profile.tp_aprovado);
      ultimaSincronizacao = Date.now();
      await atualizarEstimativaEspaco();
      toast.success('Dados baixados pra uso offline');
    } catch {
      toast.error('Falhou baixar — confira sua conexão');
    } finally {
      baixandoTudo = false;
    }
  }

  async function limparDadosOffline() {
    if (!confirm('Limpar os dados salvos offline? A fila de ações pendentes de sincronizar NÃO é afetada — só o que já foi sincronizado e ficou salvo pra consulta sem sinal.')) return;
    limpandoOffline = true;
    await limparCacheLeitura();
    ultimaSincronizacao = null;
    await atualizarEstimativaEspaco();
    limpandoOffline = false;
    toast.info('Dados offline limpos');
  }

  // === E4: mapa de fundo offline (PMTiles do município) ===
  let metaMapa = $state<MetaMapaOffline | null>(null);
  let baixandoMapa = $state(false);
  let progressoMapa = $state<number | null>(null);
  let removendoMapa = $state(false);
  onMount(() => {
    metaMapa = metaMapaOffline();
  });

  async function baixarMapa() {
    baixandoMapa = true;
    progressoMapa = 0;
    try {
      await baixarMapaOffline((f) => (progressoMapa = f));
      metaMapa = metaMapaOffline();
      await atualizarEstimativaEspaco();
      toast.success('Mapa do município baixado — o fundo dos mapas agora funciona sem internet');
    } catch (e: any) {
      toast.error(String(e?.message || 'Falhou baixar o mapa'));
    } finally {
      baixandoMapa = false;
      progressoMapa = null;
    }
  }

  async function removerMapa() {
    if (!confirm('Remover o mapa offline do aparelho?')) return;
    removendoMapa = true;
    await removerMapaOffline();
    metaMapa = null;
    await atualizarEstimativaEspaco();
    removendoMapa = false;
    toast.info('Mapa offline removido');
  }

  async function trocarBasemap(e: Event) {
    const valor = (e.target as HTMLSelectElement).value;
    salvandoBasemap = true;
    try {
      const fd = new FormData();
      fd.append('basemap', valor);
      const res = await fetch('?/atualizarBasemap', { method: 'POST', body: fd });
      const parsed = deserialize(await res.text()) as any;
      if (parsed.type === 'success') { toast.success('Estilo do mapa atualizado'); await invalidateAll(); }
      else toast.error(String(parsed.data?.erro || 'Falhou'));
    } finally {
      salvandoBasemap = false;
    }
  }

  // === Notificações (PUSH-A) ===
  type StatusPush = 'verificando' | 'nao_suportado' | 'nao_configurado' | 'inativo' | 'ativo';
  let statusPush = $state<StatusPush>('verificando');
  let processandoPush = $state(false);
  let enviandoTeste = $state(false);

  async function enviarTeste() {
    enviandoTeste = true;
    try {
      const res = await fetch('?/enviarTeste', { method: 'POST', body: new FormData() });
      const parsed = deserialize(await res.text()) as any;
      if (parsed.type === 'success') toast.success(String(parsed.data?.msg || 'Notificação de teste enviada'));
      else toast.error(String(parsed.data?.erro || 'Falhou'));
    } finally {
      enviandoTeste = false;
    }
  }

  // Checklist de diagnóstico — cada pré-condição do Web Push visível,
  // em vez de um status opaco (no iPhone a pegadinha clássica é não
  // estar instalado na tela de início).
  interface DiagPush {
    chaveServidor: boolean;
    suporteNavegador: boolean;
    appInstalado: boolean;
    ehIos: boolean;
    permissao: string;
    inscritoNesteAparelho: boolean;
  }
  let diag = $state<DiagPush | null>(null);

  onMount(async () => {
    const ehIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const appInstalado = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    const suporteNavegador = 'serviceWorker' in navigator && 'PushManager' in window;
    let inscrito = false;
    if (suporteNavegador) {
      try {
        const reg = await navigator.serviceWorker.ready;
        inscrito = !!(await reg.pushManager.getSubscription());
      } catch { /* sem SW ativo */ }
    }
    diag = {
      chaveServidor: !!publicEnv.PUBLIC_VAPID_PUBLIC_KEY,
      suporteNavegador,
      appInstalado,
      ehIos,
      permissao: 'Notification' in window ? Notification.permission : 'indisponível',
      inscritoNesteAparelho: inscrito
    };

    if (!publicEnv.PUBLIC_VAPID_PUBLIC_KEY) {
      statusPush = 'nao_configurado';
      return;
    }
    if (!suporteNavegador) {
      statusPush = 'nao_suportado';
      return;
    }
    statusPush = inscrito ? 'ativo' : 'inativo';
  });

  async function ativarNotificacoes() {
    processandoPush = true;
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        toast.error('Permissão de notificação negada');
        return;
      }
      if (!publicEnv.PUBLIC_VAPID_PUBLIC_KEY) { toast.error('Notificações push ainda não configuradas neste servidor'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicEnv.PUBLIC_VAPID_PUBLIC_KEY) as BufferSource
      });
      const j = sub.toJSON();
      const fd = new FormData();
      fd.append('endpoint', j.endpoint ?? '');
      fd.append('p256dh', j.keys?.p256dh ?? '');
      fd.append('auth', j.keys?.auth ?? '');
      fd.append('user_agent', navigator.userAgent);
      const res = await fetch('?/registrarPush', { method: 'POST', body: fd });
      const parsed = deserialize(await res.text()) as any;
      if (parsed.type === 'success') { toast.success('Notificações ativadas'); statusPush = 'ativo'; }
      else toast.error(String(parsed.data?.erro || 'Falhou'));
    } catch (e) {
      toast.error('Não deu pra ativar notificações nesse aparelho');
    } finally {
      processandoPush = false;
    }
  }

  async function desativarNotificacoes() {
    processandoPush = true;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        const fd = new FormData();
        fd.append('endpoint', endpoint);
        const res = await fetch('?/removerPush', { method: 'POST', body: fd });
        const parsed = deserialize(await res.text()) as any;
        if (parsed.type !== 'success') toast.error(String(parsed.data?.erro || 'Falhou'));
      }
      statusPush = 'inativo';
      toast.success('Notificações desativadas nesse aparelho');
    } finally {
      processandoPush = false;
    }
  }
</script>

<div>
  <h1 class="text-2xl font-bold">Meu perfil</h1>
  <p class="text-sm text-slate-500 mt-1">Atualize seu nome e senha</p>
</div>

<div class="mt-4 space-y-4 max-w-md">
  <Card padding="md">
    <h2 class="font-semibold mb-3">Conta</h2>
    <div class="space-y-2 text-sm">
      <div>
        <div class="text-xs text-slate-500">Email</div>
        <div>{data.email}</div>
      </div>
      <div>
        <div class="text-xs text-slate-500">Papel</div>
        <div class="capitalize">{data.profile.role}</div>
      </div>
    </div>
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-3">Nome</h2>
    <form
      method="POST"
      action="?/atualizarNome"
      use:enhance={() => {
        salvandoNome = true;
        return async ({ result, update }) => {
          await update();
          salvandoNome = false;
          if (result.type === 'success') {
            toast.success('Nome atualizado');
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="flex gap-2"
    >
      <input
        name="nome"
        value={data.profile.nome}
        required
        class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <Button variant="primary" type="submit" loading={salvandoNome}>Salvar</Button>
    </form>
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-3">Trocar senha</h2>
    <form
      method="POST"
      action="?/trocarSenha"
      use:enhance={() => {
        salvandoSenha = true;
        return async ({ result, update }) => {
          await update();
          salvandoSenha = false;
          if (result.type === 'success') {
            toast.success('Senha trocada');
            const inp = document.getElementById('nova-senha') as HTMLInputElement;
            if (inp) inp.value = '';
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="space-y-2"
    >
      <input
        id="nova-senha"
        name="senha"
        type="password"
        minlength="6"
        placeholder="Nova senha (mín. 6)"
        required
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <Button variant="primary" type="submit" loading={salvandoSenha} class="w-full">Trocar senha</Button>
    </form>
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-3">Estilo do mapa</h2>
    <select
      value={data.profile.pref_basemap ?? 'positron'}
      onchange={trocarBasemap}
      disabled={salvandoBasemap}
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
    >
      <option value="positron">Cinza</option>
      <option value="liberty">Colorido</option>
      <option value="bright">Brilhante</option>
    </select>
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-1">Notificações</h2>
    <p class="text-xs text-slate-500 mb-3">
      Avisa quando você recebe uma designação, é escalado num turno de TP,
      ou um pedido de publicação muda de status. Funciona mesmo com o app
      fechado (em iOS, precisa ter instalado o app na tela de início).
    </p>
    {#if statusPush === 'verificando'}
      <p class="text-sm text-slate-400">Verificando suporte...</p>
    {:else if statusPush === 'nao_configurado'}
      <p class="text-sm text-slate-400">Notificações push ainda não configuradas pelo admin neste servidor. O sino no topo do app continua funcionando normalmente.</p>
    {:else if statusPush === 'nao_suportado'}
      <p class="text-sm text-slate-400">Esse navegador/aparelho não suporta notificações push. O sino no topo do app continua funcionando normalmente.</p>
    {:else if statusPush === 'ativo'}
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm text-green-700"><Icon nome="check" size={14} /> Ativadas nesse aparelho</span>
        <Button variant="secondary" size="sm" loading={processandoPush} onclick={desativarNotificacoes}>Desativar</Button>
      </div>
      <Button variant="secondary" size="sm" loading={enviandoTeste} onclick={enviarTeste} class="w-full mt-2">
        Enviar notificação de teste
      </Button>
    {:else}
      <Button variant="primary" loading={processandoPush} onclick={ativarNotificacoes} class="w-full">
        <Icon nome="megaphone" size={14} /> Ativar notificações
      </Button>
    {/if}

    {#if diag}
      <div class="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs">
        <div class="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">Diagnóstico</div>
        {#snippet check(ok: boolean, rotulo: string)}
          <div class="flex items-center gap-1.5 {ok ? 'text-green-700' : 'text-red-600'}">
            <Icon nome={ok ? 'check' : 'x'} size={12} /> {rotulo}
          </div>
        {/snippet}
        {@render check(diag.chaveServidor, 'Chave de push configurada no servidor')}
        {@render check(diag.suporteNavegador, 'Navegador suporta push')}
        {#if diag.ehIos}
          {@render check(diag.appInstalado, 'App instalado na tela de início (obrigatório no iPhone)')}
        {/if}
        {@render check(diag.permissao === 'granted', `Permissão de notificação: ${diag.permissao}`)}
        {@render check(diag.inscritoNesteAparelho, 'Este aparelho está inscrito')}
        {@render check(data.qtdPushSubscriptions > 0, `Aparelhos inscritos na sua conta: ${data.qtdPushSubscriptions}`)}
        {#if diag.ehIos && !diag.appInstalado}
          <p class="text-amber-700 bg-amber-50 rounded-lg p-2 mt-1.5">
            No iPhone, o push SÓ funciona com o app instalado: abra no Safari,
            toque em Compartilhar e em "Adicionar à Tela de Início". Depois
            abra pelo ícone e ative as notificações aqui.
          </p>
        {/if}
      </div>
    {/if}
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-1">Offline</h2>
    <p class="text-xs text-slate-500 mb-3">
      As telas de campo (designações, agenda, TP, prédios) salvam o último
      dado visto pra abrir sem sinal. "Baixar tudo agora" adianta esse
      download antes de sair de casa.
    </p>
    <div class="text-sm text-slate-600 mb-3">
      {#if ultimaSincronizacao}
        <div><Icon nome="clock" size={14} /> Última sincronização completa: {fmtUltimaSincronizacao(ultimaSincronizacao)}</div>
      {:else}
        <div class="text-slate-400">Ainda não baixou os dados completos pra offline.</div>
      {/if}
      {#if espacoUsadoMb != null}
        <div class="text-xs text-slate-400 mt-0.5">~{espacoUsadoMb} MB usados neste aparelho</div>
      {/if}
    </div>
    <div class="flex gap-2">
      <Button variant="primary" size="sm" loading={baixandoTudo} onclick={baixarTudoAgora} class="flex-1">
        <Icon nome="refresh" size={14} /> Baixar tudo agora
      </Button>
      <Button variant="secondary" size="sm" loading={limpandoOffline} onclick={limparDadosOffline} class="flex-1">
        Limpar dados offline
      </Button>
    </div>

    <!-- E4: mapa de fundo offline -->
    <div class="mt-4 pt-3 border-t border-slate-100">
      <div class="text-sm font-medium mb-1"><Icon nome="map" size={14} /> Mapa do município (fundo dos mapas)</div>
      {#if metaMapa}
        <p class="text-xs text-slate-500 mb-2">
          Baixado — {(metaMapa.bytes / (1024 * 1024)).toFixed(1)} MB em
          {new Date(metaMapa.baixadoEm).toLocaleDateString('pt-BR')}. Sem internet,
          o desenho das ruas vem desse arquivo.
        </p>
        <div class="flex gap-2">
          <Button variant="secondary" size="sm" loading={baixandoMapa} onclick={baixarMapa} class="flex-1">Baixar de novo</Button>
          <Button variant="secondary" size="sm" loading={removendoMapa} onclick={removerMapa} class="flex-1 text-red-600">Remover</Button>
        </div>
      {:else}
        <p class="text-xs text-slate-500 mb-2">
          Sem esse download, os mapas funcionam offline mas o fundo (ruas)
          fica vazio. Baixa uma vez e pronto.
        </p>
        <Button variant="primary" size="sm" loading={baixandoMapa} onclick={baixarMapa} class="w-full">
          <Icon nome="map" size={14} />
          {baixandoMapa && progressoMapa !== null ? `Baixando… ${Math.round(progressoMapa * 100)}%` : 'Baixar mapa do município'}
        </Button>
      {/if}
    </div>
  </Card>

  <a href="/publicador/tp" class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 transition-colors">
    <span class="text-sm font-medium"><Icon nome="megaphone" size={14} /> Sua disponibilidade pro testemunho público fica em Testemunho público →</span>
    <Icon nome="chevron-right" size={14} class="text-slate-400" />
  </a>

  <form action="/logout" method="POST">
    <Button variant="secondary" type="submit" class="w-full text-red-600">Sair</Button>
  </form>
</div>

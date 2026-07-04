<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { DIAS_SEMANA } from '$lib/arranjos';
  import { PUBLIC_VAPID_PUBLIC_KEY } from '$env/static/public';
  import type { TpDisponibilidadeLinha } from './$types';

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
      tpPreferencias: { transporta_carrinho: boolean; notas: string | null };
      tpDisponibilidade: TpDisponibilidadeLinha[];
    };
    form: any;
  } = $props();
  let salvandoNome = $state(false);
  let salvandoSenha = $state(false);
  let salvandoPreferencias = $state(false);
  let adicionandoDisponibilidade = $state(false);
  let removendoId = $state<number | null>(null);

  let novoDia = $state(1);
  let novaHoraInicio = $state('');
  let novaHoraFim = $state('');

  async function removerDisponibilidade(id: number) {
    removendoId = id;
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch('?/removerDisponibilidade', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    removendoId = null;
    if (parsed.type === 'success') { toast.success('Janela removida'); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // === Notificações (PUSH-A) ===
  type StatusPush = 'verificando' | 'nao_suportado' | 'inativo' | 'ativo';
  let statusPush = $state<StatusPush>('verificando');
  let processandoPush = $state(false);

  onMount(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      statusPush = 'nao_suportado';
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      statusPush = sub ? 'ativo' : 'inativo';
    } catch {
      statusPush = 'nao_suportado';
    }
  });

  async function ativarNotificacoes() {
    processandoPush = true;
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        toast.error('Permissão de notificação negada');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_PUBLIC_KEY) as BufferSource
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
    <h2 class="font-semibold mb-1">Notificações</h2>
    <p class="text-xs text-slate-500 mb-3">
      Avisa quando você recebe uma designação, é escalado num turno de TP,
      ou um pedido de publicação muda de status. Funciona mesmo com o app
      fechado (em iOS, precisa ter instalado o app na tela de início).
    </p>
    {#if statusPush === 'verificando'}
      <p class="text-sm text-slate-400">Verificando suporte...</p>
    {:else if statusPush === 'nao_suportado'}
      <p class="text-sm text-slate-400">Esse navegador/aparelho não suporta notificações push. O sino no topo do app continua funcionando normalmente.</p>
    {:else if statusPush === 'ativo'}
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm text-green-700"><Icon nome="check" size={14} /> Ativadas nesse aparelho</span>
        <Button variant="secondary" size="sm" loading={processandoPush} onclick={desativarNotificacoes}>Desativar</Button>
      </div>
    {:else}
      <Button variant="primary" loading={processandoPush} onclick={ativarNotificacoes} class="w-full">
        <Icon nome="megaphone" size={14} /> Ativar notificações
      </Button>
    {/if}
  </Card>

  <Card padding="md">
    <h2 class="font-semibold mb-1">Testemunho público</h2>
    <p class="text-xs text-slate-500 mb-3">Ajuda o admin a te escalar num horário que funciona pra você.</p>

    <form
      method="POST"
      action="?/salvarPreferenciasTp"
      use:enhance={() => {
        salvandoPreferencias = true;
        return async ({ result, update }) => {
          await update();
          salvandoPreferencias = false;
          if (result.type === 'success') { toast.success('Preferências salvas'); await invalidateAll(); }
          else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
        };
      }}
      class="space-y-2"
    >
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" name="transporta_carrinho" checked={data.tpPreferencias.transporta_carrinho} class="w-4 h-4 rounded" />
        Consigo levar o equipamento até o ponto
      </label>
      <textarea
        name="notas"
        rows="2"
        placeholder="Notas (opcional) — ex: só de carro, só aos sábados de manhã"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >{data.tpPreferencias.notas ?? ''}</textarea>
      <Button variant="primary" type="submit" loading={salvandoPreferencias} class="w-full">Salvar</Button>
    </form>

    <div class="mt-4 pt-4 border-t border-slate-100">
      <div class="text-sm font-medium mb-2">Horários que costumo estar disponível</div>
      <div class="space-y-1.5 mb-3">
        {#each data.tpDisponibilidade as d (d.id)}
          <div class="flex items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
            <span>{DIAS_SEMANA[d.dia_semana]} · {d.hora_inicio.substring(0, 5)}–{d.hora_fim.substring(0, 5)}</span>
            <button
              type="button"
              disabled={removendoId === d.id}
              onclick={() => removerDisponibilidade(d.id)}
              class="text-red-600 hover:underline shrink-0 disabled:opacity-40"
            ><Icon nome={removendoId === d.id ? 'loader' : 'trash'} size={14} spin={removendoId === d.id} /></button>
          </div>
        {/each}
        {#if data.tpDisponibilidade.length === 0}
          <p class="text-xs text-slate-400">Nenhuma janela cadastrada ainda.</p>
        {/if}
      </div>

      <form
        method="POST"
        action="?/adicionarDisponibilidade"
        use:enhance={() => {
          adicionandoDisponibilidade = true;
          return async ({ result, update }) => {
            await update();
            adicionandoDisponibilidade = false;
            if (result.type === 'success') {
              toast.success('Janela adicionada');
              novaHoraInicio = '';
              novaHoraFim = '';
              await invalidateAll();
            } else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
          };
        }}
        class="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end"
      >
        <div>
          <label for="disp-dia" class="block text-xs text-slate-500 mb-1">Dia</label>
          <select id="disp-dia" name="dia_semana" bind:value={novoDia} class="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
            {#each [1, 2, 3, 4, 5, 6, 0] as dia}
              <option value={dia}>{DIAS_SEMANA[dia]}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="disp-inicio" class="block text-xs text-slate-500 mb-1">Início</label>
          <input id="disp-inicio" name="hora_inicio" type="time" bind:value={novaHoraInicio} required class="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        </div>
        <div>
          <label for="disp-fim" class="block text-xs text-slate-500 mb-1">Fim</label>
          <input id="disp-fim" name="hora_fim" type="time" bind:value={novaHoraFim} required class="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        </div>
        <Button variant="secondary" type="submit" loading={adicionandoDisponibilidade}><Icon nome="plus" size={14} /></Button>
      </form>
    </div>
  </Card>
</div>

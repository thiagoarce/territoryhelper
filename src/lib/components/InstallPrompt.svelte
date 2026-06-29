<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/ui/Button.svelte';

  let promptEvent: any = $state(null);
  let installable = $state(false);
  let dispensado = $state(false);

  onMount(() => {
    try { dispensado = localStorage.getItem('th_install_dispensado') === '1'; } catch {}

    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      promptEvent = e;
      installable = true;
    });
    window.addEventListener('appinstalled', () => {
      installable = false;
      try { localStorage.setItem('th_install_dispensado', '1'); } catch {}
    });
  });

  async function instalar() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    promptEvent = null;
    installable = false;
    if (choice.outcome === 'accepted') {
      try { localStorage.setItem('th_install_dispensado', '1'); } catch {}
    }
  }

  function dispensar() {
    dispensado = true;
    try { localStorage.setItem('th_install_dispensado', '1'); } catch {}
  }
</script>

{#if installable && !dispensado}
  <div class="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-40 bg-white border border-slate-200 rounded-xl shadow-lg p-4 flex items-center gap-3">
    <div class="text-2xl">📱</div>
    <div class="flex-1 min-w-0">
      <div class="font-semibold text-sm">Instalar o app</div>
      <div class="text-xs text-slate-500">Acesso rápido + funciona offline</div>
    </div>
    <Button variant="primary" size="sm" onclick={instalar}>Instalar</Button>
    <button onclick={dispensar} aria-label="Dispensar" class="text-slate-400 hover:text-slate-700 text-lg">×</button>
  </div>
{/if}

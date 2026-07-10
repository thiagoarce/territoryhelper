<script lang="ts">
  // W12: "dados de HH:MM" — todo load convertido pra +page.ts universal
  // (rodada W) já devolve cacheInfo {deCache, gravadoEm}; esse badge só
  // deixa isso VISÍVEL, senão o publicador não tem como saber se o que
  // está vendo é fresco ou uma foto de antes de perder o sinal.
  import Icon from '$lib/ui/Icon.svelte';

  let {
    cacheInfo,
    onDark = false
  }: {
    cacheInfo?: { deCache: boolean; gravadoEm: number };
    /** true = fundo colorido (header com gradiente) — usa texto claro em vez de slate-400 */
    onDark?: boolean;
  } = $props();

  function fmtHora(ts: number): string {
    const d = new Date(ts);
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    return mesmoDia
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
</script>

{#if cacheInfo?.gravadoEm}
  <div
    class="inline-flex items-center gap-1.5 text-[11px] {cacheInfo.deCache ? (onDark ? 'text-amber-200' : 'text-amber-600') : (onDark ? 'text-white/70' : 'text-slate-400')}"
    title={cacheInfo.deCache ? 'Sem sinal no momento — mostrando o último dado salvo' : 'Dado atualizado agora'}
  >
    <Icon nome={cacheInfo.deCache ? 'alert' : 'clock'} size={12} />
    {cacheInfo.deCache ? 'Offline — dados de' : 'Atualizado às'}
    {fmtHora(cacheInfo.gravadoEm)}
  </div>
{/if}

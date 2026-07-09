// W2: o conteúdo real mora em $lib/queries.ts (portável — os helpers
// recebem o SupabaseClient por parâmetro e só importam módulos shared),
// pra poder ser usado TAMBÉM em loads universais (+page.ts) rodando no
// browser (rodada Workers/Offline — leituras saem do Worker). Este shim
// existe só pra não tocar nos ~15 imports server que já apontam pra cá.
export * from '$lib/queries';

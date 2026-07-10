-- 079 (E4/W11): bucket PÚBLICO pro extract PMTiles do município — o
-- arquivo de mapa vetorial que o app baixa uma vez (Perfil → Offline →
-- Baixar mapa) e usa como fundo dos mapas quando está sem internet.
-- Público de propósito: são dados do OpenStreetMap (nada da congregação);
-- bucket público dispensa policy de leitura e o download funciona até
-- deslogado. Upload: manual pelo painel do Supabase (service role) —
-- ver scripts/gerar-mapa-offline.md pra gerar o arquivo.
insert into storage.buckets (id, name, public)
values ('mapa-offline', 'mapa-offline', true)
on conflict (id) do nothing;

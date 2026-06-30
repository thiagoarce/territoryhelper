-- Exceções de recorrência em arranjos.
-- Permite "personalizar só este dia" sem afetar a recorrência geral.
-- A ocorrência personalizada vira um arranjo pontual separado;
-- a data fica na lista de exceções pra não duplicar no calendário.

alter table arranjos add column if not exists excecoes_datas date[] not null default '{}'::date[];

-- 087: marca quais conclusões têm HORA REAL informada pelo servo (não
-- só a hora de registro) + backfill de estimativa pras conclusões
-- antigas, pro dashboard já ter *algum* dado pra análise de manhã/
-- tarde/noite em vez de esperar meses de coleta nova.
--
-- hora_informada distingue os dois casos porque, sem ela, um segundo
-- run acidental deste backfill sobrescreveria hora REAL já informada
-- por publicadores depois desta migration com a estimativa de novo —
-- a condição `where hora_informada = false` torna o UPDATE idempotente
-- e nunca toca em dado real.
alter table quadras_conclusoes add column if not exists hora_informada boolean not null default false;

-- Estimativa por dia da semana (média observada de quando a congregação
-- costuma sair pregar) — NÃO é a hora real, só destrava a análise com
-- algum dado histórico. Dia da semana vem de data_conclusao (date puro,
-- sem componente de hora — extract(dow) não tem ambiguidade de fuso).
-- Hora local do Brasil + 3h = UTC (mesmo padrão fixo que o resto do
-- código usa, sem depender de nome de fuso no Postgres).
update quadras_conclusoes
set marcado_em = (
  (
    data_conclusao::timestamp
    + case extract(dow from data_conclusao)
        when 1 then interval '17:00'  -- segunda
        when 2 then interval '08:00'  -- terça
        when 3 then interval '15:45'  -- quarta
        when 4 then interval '08:30'  -- quinta
        when 5 then interval '08:00'  -- sexta
        when 6 then interval '15:45'  -- sábado
        else interval '08:00'         -- domingo (dow=0)
      end
    + interval '3 hours'
  ) at time zone 'UTC'
)
where hora_informada = false;

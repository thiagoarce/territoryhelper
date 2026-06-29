-- Flag pra marcar agrupamentos (logradouro+numero) que NÃO são prédios de fato
-- (vilas, casas geminadas, comércios separados). Esconde da lista de prédios.
-- Schema do GAS tinha isso na overlay Predios; aqui é direto no local.

alter table locais add column if not exists nao_eh_predio boolean not null default false;
create index if not exists locais_nao_eh_predio_idx on locais(nao_eh_predio) where nao_eh_predio = true;

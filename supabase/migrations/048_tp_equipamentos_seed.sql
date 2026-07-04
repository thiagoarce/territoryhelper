-- ============================================================================
-- 048_tp_equipamentos_seed.sql — seed do catálogo real de equipamentos de
-- testemunho público, transcrito do PDF oficial "Equipamentos para
-- testemunho público" (S-80-T Ba 11/23).
--
-- ATENÇÃO: isso é um SEED, não uma migration idempotente — não há unique
-- constraint em nome pra suportar ON CONFLICT. Rode UMA VEZ. Se precisar
-- editar/adicionar depois, use a UI em /admin/tp → aba Equipamentos.
--
-- Preço e dimensões não entram: mudam com o tempo e o app não tem nenhum
-- controle financeiro — o preço atual mora no JW Hub. O `codigo` é o
-- mnemônico usado pra pedir o item por lá.
-- ============================================================================

insert into tp_carrinho_tipos (nome, codigo, descricao) values
  ('Carrinho de publicações', 'ldcrt-1 (3516-1)',
   'Três prateleiras com proteção de acrílico na frente, rodas, capa de chuva inclusa. 40,64x40,64x101,6 cm, 9,6 kg.'),
  ('Display de publicações — Simples', 'ldstd-1 (3517-1)',
   'Malha leve com armação de alumínio, 9 bolsos de vinil. Monta em menos de 5 min. Inclui bolsa de transporte. 54,5x43x144,3 cm, 1,9 kg.'),
  ('Display de publicações — Duplo', 'ldstd-2 (3517-2)',
   'Igual ao simples, em dobro. 54,5x40x144,3 cm, 3 kg.'),
  ('Quiosque de publicações', 'ldksk-1 (3519-1)',
   'Com rodas, leve, portátil. Monta em menos de 5 min. Inclui duas bolsas de transporte e o cartaz.'),
  ('Mesa de publicações', 'ldtbl-1 (3518-1)',
   'Armação de alumínio. Monta em menos de 5 min. Inclui bolsa de transporte, toalha de mesa e suporte pro cartaz.');

-- Carrinho de publicações
insert into tp_pecas_catalogo (tipo_id, nome, categoria, codigo, ordem)
select id, v.nome, v.categoria, v.codigo, v.ordem
from tp_carrinho_tipos, (values
  ('Peças de acrílico das prateleiras (3 un.)', 'fisica', 'ldcrtadp (3520)', 1),
  ('Capa de chuva', 'fisica', 'ldcrtrcv (3521)', 2),
  ('Placa de PVC preta', 'fisica', 'ldcrtpbd (3528)', 3),
  ('Rodas, rolamentos e contrapinos', 'fisica', 'ldcrtwhl (3523)', 4),
  ('Ferragem do carrinho (porcas, parafusos)', 'fisica', 'ldcrtrkt (3522)', 5),
  ('Placa magnética', 'fisica', 'ldcrtmbd (3526)', 6),
  ('Cartaz magnético (campanha/publicação)', 'literatura', 'mvp_____', 7)
) as v(nome, categoria, codigo, ordem)
where tp_carrinho_tipos.nome = 'Carrinho de publicações';

-- Display de publicações — Simples
insert into tp_pecas_catalogo (tipo_id, nome, categoria, codigo, ordem)
select id, v.nome, v.categoria, v.codigo, v.ordem
from tp_carrinho_tipos, (values
  ('Peças de reposição (8 un., plástico ABS)', 'fisica', 'ldstd1sp (3524)', 1),
  ('Bolsa de transporte', 'fisica', 'ldstdcbg (3527)', 2),
  ('Cartaz impresso', 'literatura', null, 3)
) as v(nome, categoria, codigo, ordem)
where tp_carrinho_tipos.nome = 'Display de publicações — Simples';

-- Display de publicações — Duplo
insert into tp_pecas_catalogo (tipo_id, nome, categoria, codigo, ordem)
select id, v.nome, v.categoria, v.codigo, v.ordem
from tp_carrinho_tipos, (values
  ('Peças de reposição (11 un., plástico ABS)', 'fisica', 'ldstd2sp (3525)', 1),
  ('Bolsa de transporte', 'fisica', 'ldstdcbg (3527)', 2),
  ('Cartaz impresso', 'literatura', null, 3)
) as v(nome, categoria, codigo, ordem)
where tp_carrinho_tipos.nome = 'Display de publicações — Duplo';

-- Quiosque de publicações (PDF não traz SKU individual pras peças, só a
-- ferragem genérica de montagem — catálogo fica enxuto de propósito)
insert into tp_pecas_catalogo (tipo_id, nome, categoria, codigo, ordem)
select id, v.nome, v.categoria, v.codigo, v.ordem
from tp_carrinho_tipos, (values
  ('Bolsas de transporte (2 un.)', 'fisica', null::text, 1),
  ('Cartaz (jw.org, fixo, incluído)', 'fisica', null::text, 2)
) as v(nome, categoria, codigo, ordem)
where tp_carrinho_tipos.nome = 'Quiosque de publicações';

-- Mesa de publicações (idem — sem SKU individual no PDF)
insert into tp_pecas_catalogo (tipo_id, nome, categoria, codigo, ordem)
select id, v.nome, v.categoria, v.codigo, v.ordem
from tp_carrinho_tipos, (values
  ('Bolsa de transporte', 'fisica', null::text, 1),
  ('Toalha de mesa', 'fisica', null::text, 2),
  ('Suporte pro cartaz', 'fisica', null::text, 3),
  ('Cartaz impresso', 'literatura', null::text, 4)
) as v(nome, categoria, codigo, ordem)
where tp_carrinho_tipos.nome = 'Mesa de publicações';

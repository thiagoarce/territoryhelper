-- 072: RLS pra TCE recebido via repartição de arranjo (arranjo_partes.tces_ids)
-- Faltava esse caminho de acesso inteiro — só existiam policies pra TCE
-- direto (tces_publicador_proprio, migration 004) e pra designação pessoal
-- (tces_via_designacao/tce_unidades_via_designacao, migration 067). Um TCE
-- que o dirigente reparte dentro de um arranjo (Casa a casa → Repartir
-- território → T33) não tinha NENHUMA policy de select cobrindo esse
-- caminho — publicador comum recebia 404 em /publicador/tce/[id] (admin
-- não notava porque passa por tces_admin_all, que cobre tudo).
--
-- Mesmo padrão de pode_editar_local (migration 040): cobre tanto a MINHA
-- parte especificamente quanto qualquer TCE do arranjo onde eu tenho
-- alguma parte (quem tem parte na saída pode ajudar em qualquer TCE do
-- arranjo, não só no da própria parte — mesma lógica já usada pra quadras).

drop policy if exists tces_via_parte_arranjo on tces;
create policy tces_via_parte_arranjo on tces for select to authenticated
  using (
    exists (
      select 1
      from arranjo_partes pt
      join arranjos a on a.id = pt.arranjo_id
      where auth.uid() = any(pt.publicadores)
        and pt.tces_ids @> array[tces.id]
        and a.ativo = true
    )
    or exists (
      select 1
      from arranjos a
      join arranjo_partes pt on pt.arranjo_id = a.id
      where a.tces_ids @> array[tces.id]
        and a.ativo = true
        and auth.uid() = any(pt.publicadores)
    )
  );

drop policy if exists tce_unidades_via_parte_arranjo on tce_unidades;
create policy tce_unidades_via_parte_arranjo on tce_unidades for select to authenticated
  using (
    exists (
      select 1
      from arranjo_partes pt
      join arranjos a on a.id = pt.arranjo_id
      where auth.uid() = any(pt.publicadores)
        and pt.tces_ids @> array[tce_unidades.tce_id]
        and a.ativo = true
    )
    or exists (
      select 1
      from arranjos a
      join arranjo_partes pt on pt.arranjo_id = a.id
      where a.tces_ids @> array[tce_unidades.tce_id]
        and a.ativo = true
        and auth.uid() = any(pt.publicadores)
    )
  );

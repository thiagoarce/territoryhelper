# Tasks — Rodada Exportáveis (ordem de execução)

> Mesmo protocolo das rodadas anteriores: migration validada 2x local se
> houver → build/test/check sem subir baseline → commit com "Não
> testado:" → push branch + merge main. Specs em
> `docs/specs-exportaveis.md`. Migrations a partir de **078**.

- [x] 🟡 **E1** Cartão S-12: migration 078 (`contexto` no
      `territorio_publico`) + `CartaoTerritorio.svelte` (mapa oculto +
      composição canvas) + sheet no `/t/[token]` (localidade editável
      pré-preenchida via Nominatim, limiar 3/6/12 meses, fundo
      positron/liberty/bright) + compartilhar como hoje.

- [x] 🟡 **E2** Relatório S-13: rota `/admin/relatorios/s13` (load
      universal), seletor de ano de serviço (set→ago), algoritmo de
      ciclos por território (designacoes+arranjos × quadras_conclusoes),
      tabela no layout do S-13-T com CSS de impressão + botão
      Imprimir/Salvar PDF. Entrada no drawer (Sistema).

- [x] 🟢 **E3** Hub de designações: TCE só aparece se publicador_id OU
      designacao_tces aberta OU arranjo ativo válido. Ajustar contador.

- [x] 🔴 **E4** (= W11) Mapa offline PMTiles — ver
      docs/tasks-workers-offline.md. Código completo; FALTA o usuário gerar/subir
      o extract do município (scripts/gerar-mapa-offline.md) e aplicar
      as migrations 078/079 via /admin/dev/sql.

- [x] 🟢 **E5** `/admin/dashboard`: cobertura 12m, esquecidas, tempo
      médio de ciclo, conclusões/mês, funil designadas×arranjo×livres.

- [ ] ⚪ **E6** Multicongregação — FUTURO, branch separada, fora daqui.

# Gerar o mapa offline do município (PMTiles)

O fundo dos mapas offline (E4/W11) vem de UM arquivo `.pmtiles` com o
recorte do município, hospedado no bucket público `mapa-offline` do
Supabase (migration 079). Este guia gera e publica esse arquivo. É um
processo que se faz UMA vez (e repete só se quiser ruas mais novas —
1-2x por ano é de sobra).

## 1. Descobrir a bounding box do município

Abra https://boundingbox.klokantech.com (ou bboxfinder.com), procure a
cidade, escolha o formato **CSV** e copie os 4 números:
`minLng,minLat,maxLng,maxLat` (ex. João Pessoa:
`-34.966,-7.245,-34.790,-7.065`). Pegue com folga — uns km além do
território não custam quase nada.

## 2. Baixar a ferramenta `pmtiles` (CLI)

Binário único, sem instalação: https://github.com/protomaps/go-pmtiles/releases
(baixe o da sua plataforma, ex. `pmtiles-windows-x86_64.zip` ou
`pmtiles-linux_x86_64.tar.gz`, e extraia).

## 3. Extrair o recorte do build diário do Protomaps

```bash
# troque a data pelo build mais recente listado em https://maps.protomaps.com/builds/
# e o --bbox pela sua bounding box do passo 1
./pmtiles extract https://build.protomaps.com/20260701.pmtiles municipio.pmtiles \
  --bbox=-34.966,-7.245,-34.790,-7.065
```

Isso baixa SÓ o recorte (uma cidade típica dá entre 5 e 40 MB). O nome
do arquivo precisa ser exatamente **`municipio.pmtiles`**.

## 4. Publicar no Supabase

Painel do Supabase → **Storage** → bucket **`mapa-offline`** (criado
pela migration 079; se não existir, aplique a 079 via `/admin/dev/sql`)
→ **Upload file** → suba o `municipio.pmtiles` na raiz do bucket.

## 5. Testar

No celular: **Perfil → Offline → Baixar mapa do município**. Depois modo
avião → abrir uma quadra → o fundo com as ruas deve aparecer (estilo
claro do Protomaps, um pouco diferente do OpenFreeMap — é só no offline;
online continua tudo como sempre).

## Limitações conhecidas

- Rótulos offline cobrem o alfabeto latino (os ranges de fonte baixados
  junto com o mapa). Texto fora disso só perde o rótulo.
- Ícones de POI (farmácia, banco…) não aparecem no fundo offline —
  decisão de escopo, o fundo serve pra orientação de ruas.
- Pra atualizar o mapa no aparelho depois de subir um arquivo novo:
  Perfil → Offline → "Baixar de novo".

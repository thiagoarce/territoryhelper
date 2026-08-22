<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import MapaPoligonos from '$lib/components/MapaPoligonos.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo } from '$lib/queries';
  import { page } from '$app/stores';
  import type { LocalComGeo } from './+page';
  import type { CuradoriaLinha, PontoAdmin } from './+page';
  import { ehLinkGoogleMaps, urlCompartilhavel } from '$lib/maps-link';
  import { TIPOS_PONTO } from '$lib/pontos-referencia';

  let { data, form }: {
    data: {
      locais: LocalComGeo[];
      quadras: QuadraGeo[];
      territorios: { id: string; nome: string; cor: string | null; qtd: number }[];
      tces: { id: string; nome: string; tipo: string; status: string; prazo: string | null; publicador_id: string | null; publicador_nome: string | null; poly_geojson: unknown | null }[];
      publicadores: { id: string; nome: string; role: string }[];
      quadrasMultiCluster: {
        quadra_id: string;
        clusters: {
          cluster: string;
          qtd: number;
          quadrasVizinhas: string[];
          enderecos: { id: number; endereco: string; lat: number | null; lng: number | null }[];
        }[];
      }[];
      quadrasVazias: string[];
      quadrasOrfas: string[];
      locaisSemFace: { id: number; endereco: string; quadra_id: string | null }[];
      quadrasParaRenomear: { id: string; color: string; status: string }[];
      curadoria: CuradoriaLinha[];
      pontos: PontoAdmin[];
      profile?: import('$lib/types').Profile | null;
      cacheInfo?: { deCache: boolean; gravadoEm: number };
    };
    form: any;
  } = $props();

  // null = mapa limpo (nenhum modo). Endereços só aparecem em 'vincular'/'tce'.
  type Modo = 'vincular' | 'quadras' | 'territorios' | 'tce' | 'auditar' | 'curadoria' | 'pontos' | null;
  let modo = $state<Modo>($page.url.searchParams.get('modo') === 'curadoria' ? 'curadoria' : null);
  let resolvendoCuradoriaId = $state<number | null>(null);

  let filtroTipo = $state<'dom' | 'com' | 'ambos'>('ambos');
  let filtroVinculo = $state<'vinculados' | 'sem' | 'ambos'>('ambos');
  let porFace = $state(false);
  let mostrarRotulos = $state(true);
  let selecionadosLocais = $state<Set<number>>(new Set());
  let selecionadasQuadras = $state<Set<string>>(new Set());
  let quadraDestaque = $state<string | null>(null);
  let salvando = $state(false);
  let aprovandoLote = $state(false);

  // TCE (designar é no Visão Geral; aqui só cria/conclui/deleta)
  let sheetCriarTce = $state(false);
  let novoTceNome = $state('');

  // Sheet do modo Quadras (renomear + território + ativa)
  let sheetQuadra = $state(false);
  let quadraSel = $state<QuadraGeo | null>(null);
  let novoIdQuadra = $state('');
  let territorioSel = $state('');

  // Desenho de polígono (terra-draw)
  let mapaRef = $state<any>(null);
  let desenhoAtivo = $state<'off' | 'nova' | 'editar' | 'split'>('off');
  let quadraEditandoForma = $state<QuadraGeo | null>(null);
  let quadraSplit = $state<QuadraGeo | null>(null);
  let sheetSplit = $state(false);
  let splitNovoId = $state('');
  let sheetNovaQuadra = $state(false);
  let novaQuadraId = $state('');
  let novaQuadraCor = $state('#3388ff');
  let novaQuadraTerr = $state('');
  // Juntar quadras (sub-modo dentro de Quadras)
  let juntarAtivo = $state(false);

  // Modo Território
  let sheetCriarTerr = $state(false);
  let sheetEditarTerr = $state(false);
  let terrEdit = $state<{ id: string; nome: string; cor: string | null; qtd: number } | null>(null);
  let novoTerrNome = $state('');
  let novoTerrCor = $state('#3388ff');
  let adicionarAterritorio = $state('');

  const mostrarEnderecos = $derived(modo === 'vincular' || modo === 'tce');
  const colorirPorTerritorio = $derived(modo === 'territorios');
  // No TCE o filtro é sempre comércio
  const filtroTipoEfetivo = $derived(modo === 'tce' ? 'com' : filtroTipo);
  // Só pregação regular: o load desta tela não traz mais `language-census`
  // (essa malha se revisa em /admin/censo).
  const areasSugeridasStats = $derived.by(() => ({
    regulares: data.quadras.filter((q) => q.revisao_status === 'suggested' && q.confianca === 'high').length,
    revisaoManual: data.quadras.filter((q) => q.revisao_status === 'suggested' && q.confianca !== 'high').length
  }));

  function setModo(m: Modo) {
    if (desenhoAtivo !== 'off') cancelarDesenho();
    modo = modo === m ? null : m;
    if (modo !== 'vincular' && modo !== 'tce') selecionadosLocais = new Set();
    if (modo !== 'territorios' && modo !== 'quadras') selecionadasQuadras = new Set();
    if (modo !== 'auditar') quadraDestaque = null;
    if (modo !== 'quadras') juntarAtivo = false;
    // TCE entra já agrupado por face (cluster de comércios)
    if (modo === 'tce') porFace = true;
  }

  // Locais visíveis conforme filtros do modo atual
  const locaisVisiveis = $derived.by(() => {
    return data.locais.filter((l) => {
      if (filtroTipoEfetivo === 'com' && l.tipo !== 'comercio') return false;
      if (filtroTipoEfetivo === 'dom' && l.tipo === 'comercio') return false;
      if (modo === 'vincular') {
        if (filtroVinculo === 'vinculados' && !l.quadra_id) return false;
        if (filtroVinculo === 'sem' && l.quadra_id) return false;
      }
      return true;
    });
  });

  // Faces (cluster por setor|quadra_ibge|face_ibge) dos locais visíveis
  function faceKey(l: LocalComGeo): string {
    return `${l.setor ?? ''}|${l.quadra_ibge ?? ''}|${l.face_ibge ?? ''}`;
  }
  const faceIds = $derived.by(() => {
    const m = new Map<string, number[]>();
    for (const l of locaisVisiveis) {
      const k = faceKey(l);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l.id);
    }
    return m;
  });
  const selLocaisKey = $derived([...selecionadosLocais].sort().join('|'));
  const faces = $derived.by(() => {
    void selLocaisKey;
    const acc = new Map<string, { lat: number; lng: number; n: number; sel: number }>();
    for (const l of locaisVisiveis) {
      if (l.lat == null || l.lng == null) continue;
      const k = faceKey(l);
      const e = acc.get(k) ?? { lat: 0, lng: 0, n: 0, sel: 0 };
      e.lat += l.lat; e.lng += l.lng; e.n++;
      if (selecionadosLocais.has(l.id)) e.sel++;
      acc.set(k, e);
    }
    return [...acc].map(([key, e]) => ({
      key, lat: e.lat / e.n, lng: e.lng / e.n, qtd: e.n, selecionada: e.sel === e.n && e.n > 0
    }));
  });

  function onClickFace(key: string) {
    const ids = faceIds.get(key) ?? [];
    const todosSel = ids.every((id) => selecionadosLocais.has(id));
    for (const id of ids) {
      if (todosSel) selecionadosLocais.delete(id);
      else selecionadosLocais.add(id);
    }
    selecionadosLocais = new Set(selecionadosLocais);
  }

  function toggleQuadraSel(id: string) {
    if (selecionadasQuadras.has(id)) selecionadasQuadras.delete(id);
    else selecionadasQuadras.add(id);
    selecionadasQuadras = new Set(selecionadasQuadras);
  }
  function limparQuadras() { selecionadasQuadras = new Set(); }

  function onClickLocal(l: LocalComGeo) {
    if (modo !== 'vincular') return;
    if (selecionadosLocais.has(l.id)) selecionadosLocais.delete(l.id);
    else selecionadosLocais.add(l.id);
    selecionadosLocais = new Set(selecionadosLocais);
  }

  async function onClickQuadra(q: QuadraGeo) {
    if (desenhoAtivo !== 'off') return; // ignora cliques enquanto desenha
    if (modo === 'quadras') {
      if (juntarAtivo) { toggleQuadraSel(q.id); return; }
      quadraSel = q;
      novoIdQuadra = '';
      territorioSel = q.territorio_id ?? '';
      sheetQuadra = true;
      return;
    }
    if (modo === 'territorios') {
      toggleQuadraSel(q.id);
      return;
    }
    if (modo === 'vincular' && selecionadosLocais.size > 0) {
      const fd = new FormData();
      fd.append('quadra_id', q.id);
      for (const id of selecionadosLocais) fd.append('local_ids', String(id));
      salvando = true;
      try {
        const res = await fetch('?/vincularManual', { method: 'POST', body: fd });
        const { deserialize } = await import('$app/forms');
        const result = deserialize(await res.text()) as any;
        if (result.type === 'success') {
          toast.success(`${selecionadosLocais.size} endereço(s) vinculado(s) a ${q.id}`);
          selecionadosLocais = new Set();
          await invalidateAll();
        } else {
          toast.error(String(result.data?.erro || 'Falhou'));
        }
      } finally {
        salvando = false;
      }
    }
  }

  function destacarQuadra(id: string) {
    quadraDestaque = quadraDestaque === id ? null : id;
  }

  // A20: ações do painel Auditar — pulam pro modo certo já com o item
  // pré-selecionado, reusando os fluxos existentes (Vincular/Quadras).
  function focarNoVincular(localId: number) {
    modo = 'vincular';
    selecionadosLocais = new Set([localId]);
  }
  function focarJuntar(quadraId: string) {
    modo = 'quadras';
    juntarAtivo = true;
    selecionadasQuadras = new Set([quadraId]);
  }
  let excluindoQuadraId = $state<string | null>(null);
  async function excluirQuadraAuditoria(id: string) {
    if (!confirm(`Excluir quadra ${id}? Os endereços dela ficam sem quadra (você pode reatribuir depois).`)) return;
    excluindoQuadraId = id;
    const fd = new FormData();
    fd.append('id', id);
    const res = await fetch('?/excluirQuadra', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    excluindoQuadraId = null;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Excluída')); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }
  let unificandoQuadraId = $state<string | null>(null);
  async function unificarCluster(quadraId: string) {
    if (!confirm(`Unificar os clusters de ${quadraId}? Os endereços minoritários têm setor/quadra IBGE ajustados pro valor majoritário.`)) return;
    unificandoQuadraId = quadraId;
    const fd = new FormData();
    fd.append('quadra_id', quadraId);
    const res = await fetch('?/unificarClusterQuadra', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    unificandoQuadraId = null;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Unificado')); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // U11: seleção "pertence a esta quadra?" por endereço dentro de cada
  // cluster (checkbox default = TRUE só no cluster majoritário — os
  // minoritários vêm desmarcados, já que são o sinal do problema).
  // Desmarcados ao salvar caem em "sem quadra" (reusa ?/desvincular).
  let selecaoPertence = $state<Record<number, boolean>>({});
  $effect(() => {
    const itens = data.quadrasMultiCluster;
    for (const item of itens) {
      for (const [i, c] of item.clusters.entries()) {
        for (const e of c.enderecos) {
          if (!(e.id in selecaoPertence)) selecaoPertence[e.id] = i === 0;
        }
      }
    }
  });
  function linkStreetView(lat: number | null, lng: number | null): string | null {
    if (lat == null || lng == null) return null;
    return `https://www.google.com/maps?layer=c&cbll=${lat},${lng}`;
  }
  let salvandoSelecaoId = $state<string | null>(null);
  async function salvarSelecao(item: (typeof data.quadrasMultiCluster)[number]) {
    const idsForaDaQuadra = item.clusters
      .flatMap((c) => c.enderecos)
      .filter((e) => selecaoPertence[e.id] === false)
      .map((e) => e.id);
    if (idsForaDaQuadra.length === 0) { toast.error('Nada desmarcado — nenhuma mudança'); return; }
    if (!confirm(`Remover ${idsForaDaQuadra.length} endereço(s) de ${item.quadra_id}? Eles caem em "sem quadra".`)) return;
    salvandoSelecaoId = item.quadra_id;
    const fd = new FormData();
    for (const id of idsForaDaQuadra) fd.append('local_ids', String(id));
    const res = await fetch('?/desvincular', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    salvandoSelecaoId = null;
    if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'Atualizado')); await invalidateAll(); }
    else toast.error(String(parsed.data?.erro || 'Falhou'));
  }

  // ---- Desenho ----
  function iniciarNova() {
    desenhoAtivo = 'nova';
    quadraEditandoForma = null;
    mapaRef?.desenharNova();
  }
  function onDesenhoPronto() {
    if (desenhoAtivo === 'split') {
      // Linha de corte terminada → pede id da nova metade
      splitNovoId = '';
      sheetSplit = true;
      return;
    }
    // Polígono novo terminado → abre sheet pra id/cor/território
    novaQuadraId = '';
    novaQuadraCor = '#3388ff';
    novaQuadraTerr = '';
    sheetNovaQuadra = true;
  }
  function iniciarEditarForma(q: QuadraGeo) {
    sheetQuadra = false;
    desenhoAtivo = 'editar';
    quadraEditandoForma = q;
    mapaRef?.editarForma(q);
  }
  function iniciarSplit(q: QuadraGeo) {
    sheetQuadra = false;
    desenhoAtivo = 'split';
    quadraSplit = q;
    quadraDestaque = q.id;
    mapaRef?.desenharLinha();
  }
  async function confirmarSplit() {
    const line = mapaRef?.pegarLinha();
    if (!line || !quadraSplit) { toast.error('Desenhe a linha de corte'); return; }
    const fd = new FormData();
    fd.append('id', quadraSplit.id);
    fd.append('novo_id', splitNovoId.trim());
    fd.append('line', JSON.stringify(line));
    salvando = true;
    try {
      const res = await fetch('?/dividirQuadra', { method: 'POST', body: fd });
      const { deserialize } = await import('$app/forms');
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success') {
        toast.success(result.data?.msg || 'Dividida');
        cancelarDesenho();
        await invalidateAll();
      } else {
        toast.error(String(result.data?.erro || 'Falhou'));
      }
    } finally {
      salvando = false;
    }
  }
  function cancelarDesenho() {
    mapaRef?.cancelarDesenho();
    desenhoAtivo = 'off';
    quadraEditandoForma = null;
    quadraSplit = null;
    quadraDestaque = null;
    sheetNovaQuadra = false;
    sheetSplit = false;
  }
  async function salvarPoligono(criar: boolean, id: string, color = '#3388ff', territorioId = '') {
    const geom = mapaRef?.pegarPoligono();
    if (!geom) { toast.error('Desenhe o polígono primeiro'); return; }
    const fd = new FormData();
    fd.append('id', id);
    fd.append('geojson', JSON.stringify(geom));
    fd.append('criar', String(criar));
    fd.append('color', color);
    fd.append('territorio_id', territorioId);
    salvando = true;
    try {
      const res = await fetch('?/salvarPoligonoQuadra', { method: 'POST', body: fd });
      const { deserialize } = await import('$app/forms');
      const result = deserialize(await res.text()) as any;
      if (result.type === 'success') {
        toast.success(result.data?.msg || 'Salvo');
        cancelarDesenho();
        await invalidateAll();
      } else {
        toast.error(String(result.data?.erro || 'Falhou'));
      }
    } finally {
      salvando = false;
    }
  }

  function limparSelecao() { selecionadosLocais = new Set(); }

  const stats = $derived.by(() => {
    const semQuadra = data.locais.filter((l) => !l.quadra_id).length;
    const total = data.locais.length;
    return { total, semQuadra, vinculados: total - semQuadra };
  });

  const totalProblemas = $derived(
    data.quadrasMultiCluster.length + data.quadrasVazias.length + data.quadrasOrfas.length + data.locaisSemFace.length
  );

  // ── Modo Pontos (catálogo de locais de encontro/referência) ────────
  // Fica aqui, e não na tela da quadra: o ponto de encontro é
  // característica do TERRITÓRIO — e um bom ponto costuma servir a
  // VÁRIOS territórios (encontro de territórios).
  let pontoEdit = $state<{
    id: number | null;
    nome: string;
    tipo: string;
    notas: string;
    endereco: string;
    maps_url: string;
    lat: number | null;
    lng: number | null;
    territorios: string[];
  } | null>(null);
  let linkMaps = $state('');
  let resolvendoLink = $state(false);
  let confiancaLink = $state<'exata' | 'aproximada' | null>(null);
  let salvandoPonto = $state(false);
  let sheetPonto = $state(false);
  // fechar o sheet limpa o rascunho (senão o próximo "Novo ponto"
  // nasceria com o texto do anterior)
  $effect(() => {
    if (!sheetPonto) pontoEdit = null;
  });

  const pontosSugeridos = $derived(data.pontos.filter((p) => p.status === 'sugerido'));
  const pontosValidados = $derived(data.pontos.filter((p) => p.status !== 'sugerido'));

  function novoPonto(lat: number | null = null, lng: number | null = null) {
    pontoEdit = { id: null, nome: '', tipo: 'estacionamento', notas: '', endereco: '', maps_url: '', lat, lng, territorios: [] };
    linkMaps = '';
    confiancaLink = null;
    sheetPonto = true;
  }
  function editarPonto(p: PontoAdmin) {
    pontoEdit = {
      id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      notas: p.notas ?? '',
      endereco: p.endereco ?? '',
      maps_url: p.maps_url ?? '',
      lat: p.lat,
      lng: p.lng,
      territorios: [...p.territorios]
    };
    linkMaps = p.maps_url ?? '';
    confiancaLink = null;
    sheetPonto = true;
  }

  // Link do WhatsApp → local. O link CURTO só entrega o destino num
  // redirect, que o browser não segue (CORS) — por isso passa pelo
  // /api/maps-link. E o link resolvido nem sempre traz coordenada: aí o
  // servidor geocodifica pelo nome e devolve 'aproximada', pra tela
  // avisar que o pino precisa de conferência.
  async function resolverLinkMaps() {
    const url = linkMaps.trim();
    if (!url || !pontoEdit) return;
    if (!ehLinkGoogleMaps(url)) return toast.error('Isso não parece um link do Google Maps');
    resolvendoLink = true;
    confiancaLink = null;
    try {
      const resp = await fetch('/api/maps-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).message ?? 'Falhou');
      const r = await resp.json();
      pontoEdit.maps_url = url;
      if (r.nome && !pontoEdit.nome.trim()) pontoEdit.nome = r.nome;
      if (r.endereco) pontoEdit.endereco = r.endereco;
      if (r.lat != null && r.lng != null) {
        pontoEdit.lat = r.lat;
        pontoEdit.lng = r.lng;
        confiancaLink = r.confianca === 'exata' ? 'exata' : 'aproximada';
        toast.success(r.confianca === 'exata' ? 'Local do link' : 'Local aproximado — confira o pino');
      } else {
        toast.info('O link não trouxe coordenada. Clique no mapa pra marcar o ponto.');
      }
    } catch {
      toast.error('Não consegui ler esse link agora.');
    } finally {
      resolvendoLink = false;
    }
  }

  async function salvarPonto() {
    if (!pontoEdit) return;
    salvandoPonto = true;
    const fd = new FormData();
    if (pontoEdit.id) fd.append('id', String(pontoEdit.id));
    fd.append('nome', pontoEdit.nome);
    fd.append('tipo', pontoEdit.tipo);
    fd.append('lat', String(pontoEdit.lat ?? ''));
    fd.append('lng', String(pontoEdit.lng ?? ''));
    fd.append('notas', pontoEdit.notas);
    fd.append('endereco', pontoEdit.endereco);
    fd.append('maps_url', pontoEdit.maps_url);
    for (const t of pontoEdit.territorios) fd.append('territorios', t);
    const res = await fetch('?/salvarPonto', { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    salvandoPonto = false;
    if (parsed.type === 'success') {
      toast.success(String(parsed.data?.msg ?? 'Ponto salvo'));
      sheetPonto = false;
      await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro ?? 'Falhou'));
    }
  }

  // Mandar o ponto no WhatsApp: usa o link ORIGINAL do Maps quando ele
  // existe — é o que a congregação já reconhece — e cai num link
  // montado pela coordenada quando o ponto nasceu de um clique no mapa.
  async function compartilharPonto(p: PontoAdmin) {
    const url = urlCompartilhavel({ maps_url: p.maps_url, lat: p.lat, lng: p.lng });
    const texto = `${p.nome}${p.endereco ? ' — ' + p.endereco : ''}`;
    const nav: any = navigator;
    if (nav.share) {
      try {
        await nav.share({ title: p.nome, text: texto, url });
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${texto}\n${url}`);
      toast.success('Link copiado');
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }

  async function acaoPonto(acao: 'validarPonto' | 'excluirPonto', id: number) {
    const fd = new FormData();
    fd.append('id', String(id));
    const res = await fetch(`?/${acao}`, { method: 'POST', body: fd });
    const parsed = deserialize(await res.text()) as any;
    if (parsed.type === 'success') {
      toast.success(String(parsed.data?.msg ?? 'Feito'));
      await invalidateAll();
    } else {
      toast.error(String(parsed.data?.erro ?? 'Falhou'));
    }
  }

  const MODOS: { k: Exclude<Modo, null>; label: string }[] = [
    { k: 'vincular', label: 'Vincular' },
    { k: 'quadras', label: 'Quadras' },
    { k: 'territorios', label: 'Territórios' },
    { k: 'tce', label: 'TCE' },
    { k: 'auditar', label: 'Auditar' },
    { k: 'curadoria', label: 'Curadoria' },
    { k: 'pontos', label: 'Pontos' }
  ];

  const TIPO_LABEL: Record<CuradoriaLinha['tipo'], string> = {
    edicao: 'Edição', criacao: 'Novo endereço', nao_existe: 'Não existe mais'
  };

  async function resolverCuradoria(id: number, acao: 'confirmarCuradoria' | 'reverterCuradoria') {
    resolvendoCuradoriaId = id;
    try {
      const fd = new FormData();
      fd.append('id', String(id));
      const res = await fetch(`?/${acao}`, { method: 'POST', body: fd });
      const parsed = deserialize(await res.text()) as any;
      if (parsed.type === 'success') { toast.success(String(parsed.data?.msg || 'OK')); await invalidateAll(); }
      else toast.error(String(parsed.data?.erro || 'Falhou'));
    } finally {
      resolvendoCuradoriaId = null;
    }
  }

  function nomeTerritorio(id: string | null): string {
    if (!id) return '—';
    return data.territorios.find((t) => t.id === id)?.nome ?? id;
  }
</script>

<div class="p-4 space-y-3">
  <CacheInfoBadge cacheInfo={data.cacheInfo} />
  <!-- Toolbar topo -->
  <div class="flex items-center gap-2 flex-wrap">
    <div class="flex gap-1 rounded-lg bg-slate-100 p-0.5 max-w-full overflow-x-auto">
      {#each MODOS as m}
        <button
          onclick={() => setModo(m.k)}
          class="shrink-0 whitespace-nowrap px-3 py-1 text-sm rounded transition-colors flex items-center gap-1"
          class:bg-white={modo === m.k}
          class:font-medium={modo === m.k}
          class:shadow-sm={modo === m.k}
          class:text-slate-500={modo !== m.k}
        >
          {m.label}
          {#if m.k === 'auditar' && totalProblemas > 0}
            <span class="bg-red-600 text-white text-[10px] px-1.5 rounded-full">{totalProblemas}</span>
          {/if}
          {#if m.k === 'curadoria' && data.curadoria.length > 0}
            <span class="bg-amber-500 text-white text-[10px] px-1.5 rounded-full">{data.curadoria.length}</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if modo === 'vincular'}
      <select bind:value={filtroTipo} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
        <option value="ambos">Domic. + Comércio</option>
        <option value="dom">Só Domicílios</option>
        <option value="com">Só Comércio</option>
      </select>
      <select bind:value={filtroVinculo} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
        <option value="ambos">Todos</option>
        <option value="vinculados">Vinculados</option>
        <option value="sem">Sem quadra</option>
      </select>
    {/if}

    {#if modo === 'vincular' || modo === 'tce'}
      <label class="flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="checkbox" bind:checked={porFace} class="w-4 h-4 rounded" />
        Por face
      </label>
    {/if}

    <label class="flex items-center gap-1.5 text-sm cursor-pointer ml-auto">
      <input type="checkbox" bind:checked={mostrarRotulos} class="w-4 h-4 rounded" />
      Rótulos
    </label>
  </div>

  <!-- Stats (só no Vincular) -->
  {#if modo === 'vincular'}
    <div class="grid grid-cols-3 gap-2 text-center text-xs">
      <div class="rounded bg-slate-50 p-2">
        <div class="font-bold text-base">{stats.total.toLocaleString('pt-BR')}</div>
        <div class="text-slate-500 uppercase">endereços</div>
      </div>
      <div class="rounded bg-green-50 p-2">
        <div class="font-bold text-base text-green-700">{stats.vinculados.toLocaleString('pt-BR')}</div>
        <div class="text-slate-500 uppercase">vinculados</div>
      </div>
      <div class="rounded bg-red-50 p-2">
        <div class="font-bold text-base text-red-700">{stats.semQuadra.toLocaleString('pt-BR')}</div>
        <div class="text-slate-500 uppercase">sem quadra</div>
      </div>
    </div>

    {#if stats.semQuadra > 0}
      <form
        method="POST"
        action="?/autoVincular"
        use:enhance={() => {
          salvando = true;
          return async ({ result, update }) => {
            await update();
            salvando = false;
            if (result.type === 'success') {
              toast.success((result.data as any)?.msg || 'OK');
              await invalidateAll();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.erro || 'Falhou'));
            }
          };
        }}
      >
        <Button variant="primary" type="submit" loading={salvando}><Icon nome="zap" size={14} /> Auto-vincular {stats.semQuadra} endereço(s)</Button>
      </form>
    {/if}
  {/if}

  <!-- Painel Auditar (A20: 3 listas acionáveis) -->
  {#if modo === 'auditar'}
    {#if totalProblemas === 0}
      <div class="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
        <Icon nome="check" size={14} /> Nada pra auditar — todas as quadras consistentes
      </div>
    {:else}
      <div class="space-y-3 max-h-96 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {#if data.locaisSemFace.length > 0}
          <div>
            <div class="text-xs font-semibold text-blue-700"><Icon nome="map-pin" size={14} /> Endereços sem face IBGE ({data.locaisSemFace.length})</div>
            <div class="space-y-1 mt-1">
              {#each data.locaisSemFace as l (l.id)}
                <div class="flex items-center justify-between gap-2 text-xs bg-blue-50 rounded px-2 py-1">
                  <span class="truncate">{l.endereco} {#if !l.quadra_id}<span class="text-slate-400">(sem quadra)</span>{/if}</span>
                  <button onclick={() => focarNoVincular(l.id)} class="shrink-0 text-blue-700 hover:underline">Atribuir quadra</button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if data.quadrasVazias.length > 0}
          <div>
            <div class="text-xs font-semibold text-red-700">∅ Quadras sem endereço ({data.quadrasVazias.length})</div>
            <div class="space-y-1 mt-1">
              {#each data.quadrasVazias as qid}
                <div class="flex items-center justify-between gap-2 text-xs bg-red-50 rounded px-2 py-1">
                  <button onclick={() => destacarQuadra(qid)} class="font-mono font-semibold text-left" class:underline={quadraDestaque === qid}>{qid}</button>
                  <div class="flex items-center gap-2 shrink-0">
                    <button onclick={() => focarJuntar(qid)} class="text-red-700 hover:underline">Juntar</button>
                    <button disabled={excluindoQuadraId === qid} onclick={() => excluirQuadraAuditoria(qid)} class="text-red-700 hover:underline disabled:opacity-40">Excluir</button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if data.quadrasMultiCluster.length > 0}
          <div>
            <div class="text-xs font-semibold text-amber-700"><Icon nome="alert" size={14} /> Múltiplos clusters IBGE ({data.quadrasMultiCluster.length})</div>
            <div class="space-y-1.5 mt-1">
              {#each data.quadrasMultiCluster as item (item.quadra_id)}
                {@const vizinhas = [...new Set(item.clusters.slice(1).flatMap((c) => c.quadrasVizinhas))]}
                <div class="bg-amber-50 rounded px-2 py-1.5 text-xs">
                  <div class="flex items-center justify-between gap-2">
                    <button onclick={() => destacarQuadra(item.quadra_id)} class="font-mono font-semibold" class:underline={quadraDestaque === item.quadra_id}>{item.quadra_id}</button>
                    <span class="text-slate-500">{item.clusters.length} clusters</span>
                  </div>
                  {#if vizinhas.length > 0}
                    <div class="text-slate-500 mt-0.5">
                      Cluster minoritário também aparece em:
                      {#each vizinhas as vid}
                        <button onclick={() => destacarQuadra(vid)} class="font-mono text-amber-800 hover:underline ml-1">{vid}</button>
                      {/each}
                    </div>
                  {/if}

                  <!-- U11: endereços de cada cluster, com checkbox
                       "pertence aqui?" + link de Street View pra
                       conferir visualmente. -->
                  <div class="mt-1.5 space-y-1.5">
                    {#each item.clusters as c, i (c.cluster)}
                      <div class="rounded bg-white/60 px-1.5 py-1">
                        <div class="text-[10px] text-slate-500 uppercase tracking-wide">
                          Cluster {i + 1} ({c.qtd} endereço(s){i === 0 ? ' — majoritário' : ''})
                        </div>
                        <div class="space-y-0.5 mt-0.5">
                          {#each c.enderecos as e (e.id)}
                            {@const sv = linkStreetView(e.lat, e.lng)}
                            <label class="flex items-center gap-1.5">
                              <input type="checkbox" checked={selecaoPertence[e.id] ?? i === 0}
                                onchange={(ev) => { selecaoPertence[e.id] = (ev.target as HTMLInputElement).checked; selecaoPertence = { ...selecaoPertence }; }} />
                              <span class="flex-1 truncate">{e.endereco}</span>
                              {#if sv}
                                <a href={sv} target="_blank" rel="noopener" class="text-blue-700 hover:underline shrink-0">Street View</a>
                              {/if}
                            </label>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>

                  <div class="flex gap-2 mt-1.5">
                    <button disabled={unificandoQuadraId === item.quadra_id} onclick={() => unificarCluster(item.quadra_id)} class="text-amber-800 hover:underline disabled:opacity-40">Unificar clusters (aceitar como uma quadra só)</button>
                    <button disabled={salvandoSelecaoId === item.quadra_id} onclick={() => salvarSelecao(item)} class="text-red-700 hover:underline disabled:opacity-40">Salvar seleção (desmarcados saem da quadra)</button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if data.quadrasOrfas.length > 0}
          <div>
            <div class="text-xs font-semibold text-orange-700"><Icon nome="shapes" size={14} /> Quadras sem território ({data.quadrasOrfas.length})</div>
            <div class="flex flex-wrap gap-1 mt-1">
              {#each data.quadrasOrfas as qid}
                <button
                  onclick={() => destacarQuadra(qid)}
                  class="text-xs font-mono px-2 py-0.5 rounded bg-orange-50 text-orange-700 hover:bg-orange-100"
                  class:ring-2={quadraDestaque === qid}
                >{qid}</button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  <!-- Painel Curadoria (T12/A6) -->
<BottomSheet bind:open={sheetPonto} title={pontoEdit?.id ? 'Editar ponto' : 'Novo ponto'}>
  {#if pontoEdit}
    <!-- Link do WhatsApp → local. É o caminho mais comum: alguém manda
         o link do Maps no grupo e o servo quer virar ponto do sistema. -->
    <label for="ponto-link" class="block text-sm font-medium mb-1">Link do Google Maps (opcional)</label>
    <div class="flex gap-2 mb-1">
      <input
        id="ponto-link"
        bind:value={linkMaps}
        placeholder="https://maps.app.goo.gl/..."
        class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <Button variant="secondary" size="sm" loading={resolvendoLink} onclick={resolverLinkMaps}>Ler</Button>
    </div>
    {#if confiancaLink === 'aproximada'}
      <p class="text-xs text-amber-700 mb-2">
        O link não trazia coordenada — este pino veio de busca pelo nome. Confira no mapa e clique pra ajustar.
      </p>
    {:else if confiancaLink === 'exata'}
      <p class="text-xs text-green-700 mb-2">Coordenada exata do link.</p>
    {/if}

    <label for="ponto-nome-admin" class="block text-sm font-medium mb-1">Nome</label>
    <input
      id="ponto-nome-admin"
      bind:value={pontoEdit.nome}
      maxlength="80"
      placeholder="Ex: Banco do Brasil da Fernando"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
    />

    <span class="block text-sm font-medium mb-1">Tipo</span>
    <div class="flex flex-wrap gap-2 mb-3">
      {#each TIPOS_PONTO as t}
        <button
          type="button"
          onclick={() => pontoEdit && (pontoEdit.tipo = t.valor)}
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border {pontoEdit.tipo === t.valor
            ? 'bg-primary-600 text-white border-primary-600'
            : 'border-slate-300 text-slate-600 hover:bg-slate-50'}"
        >
          <Icon nome={t.icone as any} size={14} /> {t.label}
        </button>
      {/each}
    </div>

    <span class="block text-sm font-medium mb-1">
      Territórios que usam este ponto
      <span class="font-normal text-slate-400">(encontro de territórios costuma compartilhar o mesmo)</span>
    </span>
    <div class="flex flex-wrap gap-1.5 mb-3 max-h-32 overflow-y-auto">
      {#each data.territorios as t}
        {@const marcado = pontoEdit.territorios.includes(t.id)}
        <button
          type="button"
          onclick={() => {
            if (!pontoEdit) return;
            pontoEdit.territorios = marcado
              ? pontoEdit.territorios.filter((x) => x !== t.id)
              : [...pontoEdit.territorios, t.id];
          }}
          class="px-2 py-1 rounded-full text-xs border {marcado
            ? 'bg-primary-600 text-white border-primary-600'
            : 'border-slate-300 text-slate-600'}"
        >{t.nome || t.id}</button>
      {/each}
    </div>

    <label for="ponto-notas-admin" class="block text-sm font-medium mb-1">Notas (opcional)</label>
    <input
      id="ponto-notas-admin"
      bind:value={pontoEdit.notas}
      placeholder="Ex: cabem 3 carros, sombra de manhã"
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
    />

    <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 mb-3">
      {#if pontoEdit.lat != null && pontoEdit.lng != null}
        Coordenada: {pontoEdit.lat.toFixed(5)}, {pontoEdit.lng.toFixed(5)}
        {#if pontoEdit.endereco}<div class="mt-0.5 text-slate-500">{pontoEdit.endereco}</div>{/if}
      {:else}
        <span class="text-amber-700">Sem coordenada — clique no mapa pra marcar, ou cole um link do Maps.</span>
      {/if}
    </div>

    <Button variant="primary" class="w-full" loading={salvandoPonto} onclick={salvarPonto}>
      <Icon nome="check" size={14} /> Salvar ponto
    </Button>
  {/if}
</BottomSheet>

  {#if modo === 'pontos'}
    <div class="space-y-3">
      <div class="flex items-center gap-2 flex-wrap">
        <Button variant="primary" size="sm" onclick={() => novoPonto()}>
          <Icon nome="plus" size={14} /> Novo ponto
        </Button>
        <span class="text-xs text-slate-500">
          Clique no mapa pra marcar a coordenada de um ponto novo.
          Colar o link do Maps também preenche a coordenada.
        </span>
      </div>

      {#if pontosSugeridos.length > 0}
        <div>
          <h3 class="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
            Sugestões dos dirigentes ({pontosSugeridos.length})
          </h3>
          <div class="space-y-2">
            {#each pontosSugeridos as p (p.id)}
              <div class="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium flex-1 min-w-0 truncate">{p.nome}</span>
                  <span class="text-xs text-slate-500">{p.criado_por_nome ?? '?'}</span>
                </div>
                {#if p.endereco}<div class="text-xs text-slate-500 truncate">{p.endereco}</div>{/if}
                <div class="flex gap-2 mt-2">
                  <button type="button" class="text-xs px-2 py-1 rounded bg-green-600 text-white" onclick={() => acaoPonto('validarPonto', p.id)}>
                    Validar
                  </button>
                  <button type="button" class="text-xs px-2 py-1 rounded border border-slate-300" onclick={() => editarPonto(p)}>
                    Editar antes
                  </button>
                  <button type="button" class="text-xs px-2 py-1 rounded border border-red-200 text-red-600" onclick={() => acaoPonto('excluirPonto', p.id)}>
                    Recusar
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div>
        <h3 class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Pontos validados ({pontosValidados.length})
        </h3>
        {#if pontosValidados.length === 0}
          <p class="text-sm text-slate-400">Nenhum ponto cadastrado ainda.</p>
        {:else}
          <div class="space-y-1.5 max-h-96 overflow-y-auto">
            {#each pontosValidados as p (p.id)}
              <div class="rounded-lg border border-slate-200 p-2.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <Icon nome="estrela" size={14} class="text-amber-600 shrink-0" />
                  <span class="font-medium flex-1 min-w-0 truncate">{p.nome}</span>
                  {#each p.territorios as t}
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 text-primary-800">T{t}</span>
                  {/each}
                </div>
                {#if p.endereco}<div class="text-xs text-slate-500 truncate">{p.endereco}</div>{/if}
                <div class="flex gap-2 mt-1.5 flex-wrap">
                  <button type="button" class="text-xs text-primary-700 underline" onclick={() => editarPonto(p)}>Editar</button>
                  <a
                    href={urlCompartilhavel({ maps_url: p.maps_url, lat: p.lat, lng: p.lng })}
                    target="_blank"
                    rel="noopener"
                    class="text-xs text-primary-700 underline"
                  >Abrir no Maps</a>
                  <button
                    type="button"
                    class="text-xs text-primary-700 underline"
                    onclick={() => compartilharPonto(p)}
                  >Compartilhar</button>
                  <button type="button" class="text-xs text-red-600 underline ml-auto" onclick={() => acaoPonto('excluirPonto', p.id)}>Excluir</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if modo === 'curadoria'}
    {#if data.curadoria.length === 0}
      <div class="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
        <Icon nome="check" size={14} /> Nada pendente — fila de curadoria vazia
      </div>
    {:else}
      <div class="space-y-2 max-h-[28rem] overflow-y-auto">
        {#each data.curadoria as c (c.id)}
          <div class="rounded-lg border border-slate-200 p-3">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="min-w-0">
                <span class="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{TIPO_LABEL[c.tipo]}</span>
                <span class="ml-1.5 font-medium truncate">{c.local_endereco ?? '(endereço excluído)'}</span>
              </div>
              <div class="text-xs text-slate-400 whitespace-nowrap">
                {c.publicador_nome ?? '?'} · {new Date(c.criado_em).toLocaleDateString('pt-BR')}
              </div>
            </div>

            {#if c.tipo === 'criacao'}
              <div class="text-xs text-slate-500 mt-1.5">Novo endereço criado pelo publicador.</div>
            {:else if c.antes}
              <div class="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div class="text-slate-400 uppercase text-[10px] font-semibold mb-0.5">Antes</div>
                  {#each Object.entries(c.antes) as [campo, valor]}
                    <div><span class="text-slate-500">{campo}:</span> {valor ?? '—'}</div>
                  {/each}
                </div>
                <div>
                  <div class="text-slate-400 uppercase text-[10px] font-semibold mb-0.5">Depois</div>
                  {#each Object.entries(c.antes) as [campo]}
                    <div><span class="text-slate-500">{campo}:</span> {(c.depois as any)?.[campo] ?? '—'}</div>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="flex gap-2 mt-2">
              <Button
                variant="secondary" size="sm"
                loading={resolvendoCuradoriaId === c.id}
                onclick={() => resolverCuradoria(c.id, 'reverterCuradoria')}
              >Reverter</Button>
              <Button
                variant="primary" size="sm"
                loading={resolvendoCuradoriaId === c.id}
                onclick={() => resolverCuradoria(c.id, 'confirmarCuradoria')}
              >Confirmar</Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Painel Territórios -->
  {#if modo === 'territorios'}
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="text-xs text-slate-500">
        {data.territorios.length} território(s). Click numa quadra pra selecionar; click num território abaixo pra editar.
      </div>

      <Button variant="primary" size="sm" onclick={() => { novoTerrNome = ''; novoTerrCor = '#3388ff'; sheetCriarTerr = true; }}>+ Novo território</Button>
    </div>
    <div class="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
      {#each data.territorios as t}
        <button
          onclick={() => { terrEdit = t; novoTerrNome = t.nome; novoTerrCor = t.cor ?? '#3388ff'; sheetEditarTerr = true; }}
          class="text-xs px-2 py-1 rounded-full border flex items-center gap-1.5 hover:bg-slate-50"
          style:border-color={t.cor ?? '#cbd5e1'}
        >
          <span class="w-3 h-3 rounded-full" style:background-color={t.cor ?? '#cbd5e1'}></span>
          {t.nome} <span class="text-slate-400">({t.qtd})</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Painel TCE -->
  {#if modo === 'tce'}
    <div class="text-xs text-slate-500">
      Comércios{porFace ? ' agrupados por face' : ''}. Click pra selecionar; depois "Criar TCE".
    </div>
    {#if data.tces.length > 0}
      <div class="space-y-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {#each data.tces as t}
          <div class="flex items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" style:background-color={t.status === 'aberto' ? '#9333ea' : '#94a3b8'}></span>
              <span class="font-medium truncate">{t.nome}</span>
              {#if t.publicador_nome}
                <span class="text-blue-600 truncate"><Icon nome="user" size={14} /> {t.publicador_nome}</span>
              {:else}
                <span class="text-slate-400">{t.status}</span>
              {/if}
            </div>
            <div class="flex gap-1.5 shrink-0">
              {#if t.status === 'aberto'}
                <form method="POST" action="?/alterarStatusTce" use:enhance={() => async ({ result, update }) => { await update(); if (result.type==='success'){ toast.success('Concluído'); await invalidateAll(); } }}>
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="concluido" />
                  <button type="submit" class="text-green-700 hover:underline"><Icon nome="check" size={14} /></button>
                </form>
              {/if}
              <form method="POST" action="?/deletarTce" use:enhance={() => async ({ result, update }) => { await update(); if (result.type==='success'){ toast.warn('Removido'); await invalidateAll(); } }} onsubmit={(e) => { if (!confirm(`Deletar TCE "${t.nome}"?`)) e.preventDefault(); }}>
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" class="text-red-600 hover:underline"><Icon nome="trash" size={14} /></button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <!-- Instruções por modo -->
  <p class="text-xs text-slate-500 text-center">
    {#if modo === null}
      Escolha um modo acima. Mapa mostra as quadras coloridas.
    {:else if modo === 'tce'}
      {#if selecionadosLocais.size === 0}
        Click nos comércios/faces pra montar o TCE.
      {:else}
        <strong>{selecionadosLocais.size}</strong> endereço(s) — clique "Criar TCE" abaixo
      {/if}
    {:else if modo === 'vincular'}
      {#if selecionadosLocais.size === 0}
        Click nos pontos pra selecionar endereços. Depois click numa quadra pra vincular.
      {:else}
        <strong>{selecionadosLocais.size}</strong> endereço(s) selecionado(s) · click numa quadra pra vincular
      {/if}
    {:else if modo === 'quadras'}
      {#if desenhoAtivo === 'nova'}
        Desenhe a quadra no mapa: clique nos cantos, duplo-clique pra fechar.
      {:else if desenhoAtivo === 'editar'}
        Arraste os vértices pra ajustar a forma de {quadraEditandoForma?.id}.
      {:else if desenhoAtivo === 'split'}
        Desenhe uma linha cortando {quadraSplit?.id} de lado a lado, duplo-clique pra terminar.
      {:else if juntarAtivo}
        Click em 2+ quadras adjacentes pra juntar.
      {:else}
        Click numa quadra pra renomear/território/ativar. Ou desenhe/junte abaixo.
      {/if}
    {:else if modo === 'territorios'}
      {#if selecionadasQuadras.size === 0}
        Click nas quadras pra montar um território. Cores mostram os territórios atuais.
      {:else}
        <strong>{selecionadasQuadras.size}</strong> quadra(s) selecionada(s) — use a barra inferior
      {/if}
    {:else}
      Click num item da lista pra destacar a quadra no mapa.
    {/if}
  </p>

  <!-- Sub-toolbar do modo Quadras: desenhar / juntar -->
  {#if modo === 'quadras' && desenhoAtivo === 'off'}
    <div class="flex items-center gap-2 flex-wrap">
      <Button variant="secondary" size="sm" onclick={iniciarNova}><Icon nome="pencil" size={14} /> Desenhar nova quadra</Button>
      <button
        onclick={() => { juntarAtivo = !juntarAtivo; selecionadasQuadras = new Set(); }}
        class="text-sm px-3 py-1.5 rounded-lg border transition-colors"
        class:bg-primary-50={juntarAtivo}
        class:border-primary-500={juntarAtivo}
        class:text-primary-700={juntarAtivo}
        class:border-slate-300={!juntarAtivo}
      ><Icon nome="link" size={14} /> Juntar quadras</button>
      {#if areasSugeridasStats.regulares > 0}
        <form
          method="POST"
          action="?/aprovarAreasConfiaveis"
          use:enhance={() => {
            aprovandoLote = true;
            return async ({ result, update }) => {
              await update();
              aprovandoLote = false;
              if (result.type === 'success') {
                toast.success((result.data as any)?.msg || 'Áreas aprovadas');
                await invalidateAll();
              } else if (result.type === 'failure') {
                toast.error(String((result.data as any)?.erro || 'Falhou'));
              }
            };
          }}
          onsubmit={(e) => {
            if (!confirm(`Aprovar ${areasSugeridasStats.regulares} áreas de alta confiança?`)) e.preventDefault();
          }}
        >
          <Button variant="secondary" size="sm" type="submit" loading={aprovandoLote}>
            Aprovar regulares confiáveis ({areasSugeridasStats.regulares})
          </Button>
        </form>
      {/if}
      {#if areasSugeridasStats.revisaoManual > 0}
        <span class="text-xs font-medium text-amber-700">{areasSugeridasStats.revisaoManual} área(s) exigem revisão manual</span>
      {/if}
    </div>
  {/if}

  <MapaPoligonos
    bind:this={mapaRef}
    quadras={data.quadras}
    locais={data.locais}
    tces={data.tces}
    {faces}
    mostrarFaces={porFace}
    altura={500}
    {mostrarRotulos}
    {mostrarEnderecos}
    filtroTipo={filtroTipoEfetivo}
    {filtroVinculo}
    {quadraDestaque}
    {colorirPorTerritorio}
    bind:selecionadosLocais
    bind:selecionadasQuadras
    basemap={data.profile?.pref_basemap ?? 'bright'}
    {onClickLocal}
    {onClickQuadra}
    onClickMapa={modo === 'pontos'
      ? (ll) => {
          if (pontoEdit && sheetPonto) {
            pontoEdit.lat = ll.lat;
            pontoEdit.lng = ll.lng;
            confiancaLink = null;
            toast.success('Coordenada marcada');
          } else {
            novoPonto(ll.lat, ll.lng);
          }
        }
      : undefined}
    {onClickFace}
    {onDesenhoPronto}
  />
</div>

<!-- Barra inferior do Vincular -->
{#if modo === 'vincular' && selecionadosLocais.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium">
      <strong>{selecionadosLocais.size}</strong> selecionado(s)
    </div>
    <p class="text-xs text-slate-500 hidden sm:block">click numa quadra pra vincular · ou:</p>

    <form
      method="POST"
      action="?/desvincular"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success('Desvinculados'); limparSelecao(); await invalidateAll(); }
      }}
      onsubmit={(e) => { if (!confirm(`Remover quadra de ${selecionadosLocais.size} endereço(s)?`)) e.preventDefault(); }}
    >
      {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
      <Button variant="ghost" size="sm" type="submit"><Icon nome="undo" size={14} /> Desvincular</Button>
    </form>

    <form
      method="POST"
      action="?/toggleAtivacao"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); limparSelecao(); await invalidateAll(); }
      }}
    >
      {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
      <input type="hidden" name="ativar" value="false" />
      <Button variant="ghost" size="sm" type="submit">∅ Desativar</Button>
    </form>

    <form
      method="POST"
      action="?/toggleAtivacao"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); limparSelecao(); await invalidateAll(); }
      }}
    >
      {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
      <input type="hidden" name="ativar" value="true" />
      <Button variant="ghost" size="sm" type="submit"><Icon nome="check" size={14} /> Ativar</Button>
    </form>

    <Button variant="ghost" size="sm" onclick={limparSelecao} class="ml-auto">Limpar</Button>
  </div>
{/if}

<!-- Barra inferior do modo Território (quadras selecionadas) -->
{#if modo === 'territorios' && selecionadasQuadras.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium"><strong>{selecionadasQuadras.size}</strong> quadra(s)</div>

    <Button variant="primary" size="sm" onclick={() => { novoTerrNome = ''; novoTerrCor = '#3388ff'; sheetCriarTerr = true; }}>+ Criar território</Button>

    <form
      method="POST"
      action="?/adicionarQuadrasAoTerritorio"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); limparQuadras(); adicionarAterritorio=''; await invalidateAll(); }
        else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
      }}
      class="flex items-center gap-1"
    >
      {#each [...selecionadasQuadras] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
      <select name="id" bind:value={adicionarAterritorio} required class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
        <option value="">+ a existente…</option>
        {#each data.territorios as t}<option value={t.id}>{t.nome}</option>{/each}
      </select>
      <Button variant="secondary" size="sm" type="submit" disabled={!adicionarAterritorio}>Add</Button>
    </form>

    <form
      method="POST"
      action="?/removerQuadrasDoTerritorio"
      use:enhance={() => async ({ result, update }) => {
        await update();
        if (result.type === 'success') { toast.info((result.data as any)?.msg || 'Órfãs'); limparQuadras(); await invalidateAll(); }
      }}
    >
      {#each [...selecionadasQuadras] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
      <Button variant="ghost" size="sm" type="submit"><Icon nome="undo" size={14} /> Tirar do território</Button>
    </form>

    <Button variant="ghost" size="sm" onclick={limparQuadras} class="ml-auto">Limpar</Button>
  </div>
{/if}

<!-- Barra inferior: salvar forma editada -->
{#if desenhoAtivo === 'editar' && quadraEditandoForma}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2">
    <div class="text-sm font-medium">Editando forma de <strong>{quadraEditandoForma.id}</strong></div>
    <div class="ml-auto flex gap-2">
      <Button variant="ghost" size="sm" onclick={cancelarDesenho}>Cancelar</Button>
      <Button variant="primary" size="sm" loading={salvando} onclick={() => salvarPoligono(false, quadraEditandoForma!.id)}>Salvar forma</Button>
    </div>
  </div>
{/if}

<!-- Barra inferior: desenhando nova (antes de fechar o polígono) -->
{#if desenhoAtivo === 'nova' && !sheetNovaQuadra}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2">
    <div class="text-sm text-slate-600">Desenhando nova quadra…</div>
    <Button variant="ghost" size="sm" onclick={cancelarDesenho} class="ml-auto">Cancelar</Button>
  </div>
{/if}

<!-- Barra inferior: desenhando linha de corte (split) -->
{#if desenhoAtivo === 'split' && !sheetSplit}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2">
    <div class="text-sm text-slate-600">Cortando <strong>{quadraSplit?.id}</strong>…</div>
    <Button variant="ghost" size="sm" onclick={cancelarDesenho} class="ml-auto">Cancelar</Button>
  </div>
{/if}

<!-- Barra inferior: juntar quadras -->
{#if modo === 'quadras' && juntarAtivo && selecionadasQuadras.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium"><strong>{selecionadasQuadras.size}</strong>: {[...selecionadasQuadras].join(', ')}</div>
    <form
      method="POST"
      action="?/juntarQuadras"
      use:enhance={() => {
        salvando = true;
        return async ({ result, update }) => {
          await update();
          salvando = false;
          if (result.type === 'success') {
            toast.success((result.data as any)?.msg || 'Unidas');
            selecionadasQuadras = new Set();
            await invalidateAll();
          } else if (result.type === 'failure') {
            toast.error(String((result.data as any)?.erro || 'Falhou'));
          }
        };
      }}
      class="ml-auto"
    >
      {#each [...selecionadasQuadras] as id}<input type="hidden" name="ids" value={id} />{/each}
      <Button variant="primary" size="sm" type="submit" loading={salvando} disabled={selecionadasQuadras.size < 2}><Icon nome="link" size={14} /> Juntar (mantém {[...selecionadasQuadras][0] ?? ''})</Button>
    </form>
    <Button variant="ghost" size="sm" onclick={() => (selecionadasQuadras = new Set())}>Limpar</Button>
  </div>
{/if}

<!-- Barra inferior do modo TCE -->
{#if modo === 'tce' && selecionadosLocais.size > 0}
  <div class="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-lg p-3 flex items-center gap-2 flex-wrap">
    <div class="text-sm font-medium"><strong>{selecionadosLocais.size}</strong> comércio(s)</div>
    <Button variant="primary" size="sm" onclick={() => { novoTceNome = ''; sheetCriarTce = true; }}><Icon nome="store" size={14} /> Criar TCE</Button>
    <Button variant="ghost" size="sm" onclick={limparSelecao} class="ml-auto">Limpar</Button>
  </div>
{/if}

<!-- Sheet: criar TCE -->
<BottomSheet bind:open={sheetCriarTce} title="Novo TCE">
  <form
    method="POST"
    action="?/criarTce"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.msg || 'TCE criado');
          sheetCriarTce = false; limparSelecao();
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    {#each [...selecionadosLocais] as id}<input type="hidden" name="local_ids" value={id} />{/each}
    <input type="hidden" name="tipo" value="comercial" />
    <div class="text-xs text-slate-500">{selecionadosLocais.size} endereço(s) comerciais. O polígono é o convex hull dos pontos.</div>
    <div>
      <label for="tce_nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="tce_nome" name="nome" bind:value={novoTceNome} required placeholder="Ex: Galeria X, Av. Comercial" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetCriarTce = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Criar TCE</Button>
    </div>
  </form>
</BottomSheet>

<!-- Sheet: nova quadra (depois de desenhar) -->
<BottomSheet open={sheetNovaQuadra} title="Nova quadra">
  <div class="space-y-3">
    <div class="text-xs text-slate-500">Polígono desenhado. Defina o ID da quadra.</div>
    <div>
      <label for="nq_id" class="block text-sm font-medium mb-1">ID da quadra</label>
      <input id="nq_id" bind:value={novaQuadraId} placeholder="Ex: 12B" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="nq_cor" class="block text-sm font-medium mb-1">Cor</label>
        <input id="nq_cor" type="color" bind:value={novaQuadraCor} class="h-10 w-20 rounded border border-slate-300" />
      </div>
      <div>
        <label for="nq_terr" class="block text-sm font-medium mb-1">Território</label>
        <select id="nq_terr" bind:value={novaQuadraTerr} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">— sem —</option>
          {#each data.territorios as t}<option value={t.id}>{t.nome}</option>{/each}
        </select>
      </div>
    </div>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={cancelarDesenho} class="flex-1">Cancelar</Button>
      <Button variant="primary" loading={salvando} disabled={!novaQuadraId.trim()} onclick={() => salvarPoligono(true, novaQuadraId.trim(), novaQuadraCor, novaQuadraTerr)} class="flex-1">Criar quadra</Button>
    </div>
  </div>
</BottomSheet>

<!-- Sheet: dividir (split) — id da nova metade -->
<BottomSheet open={sheetSplit} title={quadraSplit ? `Dividir ${quadraSplit.id}` : ''}>
  <div class="space-y-3">
    <div class="text-xs text-slate-500">A linha cortou a quadra. A parte original mantém {quadraSplit?.id}; a outra metade vira uma nova quadra.</div>
    <div>
      <label for="sp_id" class="block text-sm font-medium mb-1">ID da nova metade</label>
      <input id="sp_id" bind:value={splitNovoId} placeholder="Ex: {quadraSplit?.id}-B" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={cancelarDesenho} class="flex-1">Cancelar</Button>
      <Button variant="primary" loading={salvando} disabled={!splitNovoId.trim()} onclick={confirmarSplit} class="flex-1">Dividir</Button>
    </div>
  </div>
</BottomSheet>

<!-- Sheet: criar território -->
<BottomSheet bind:open={sheetCriarTerr} title="Novo território">
  <form
    method="POST"
    action="?/criarTerritorio"
    use:enhance={() => {
      salvando = true;
      return async ({ result, update }) => {
        await update();
        salvando = false;
        if (result.type === 'success') {
          toast.success((result.data as any)?.msg || 'Criado');
          sheetCriarTerr = false; limparQuadras();
          await invalidateAll();
        } else if (result.type === 'failure') {
          toast.error(String((result.data as any)?.erro || 'Falhou'));
        }
      };
    }}
    class="space-y-3"
  >
    {#each [...selecionadasQuadras] as qid}<input type="hidden" name="quadras_ids" value={qid} />{/each}
    <div class="text-xs text-slate-500">{selecionadasQuadras.size} quadra(s) selecionada(s) entrarão neste território.</div>
    <div>
      <label for="terr_nome" class="block text-sm font-medium mb-1">Nome</label>
      <input id="terr_nome" name="nome" bind:value={novoTerrNome} required placeholder="Ex: Centro, Bairro X" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
    <div>
      <label for="terr_cor" class="block text-sm font-medium mb-1">Cor</label>
      <input id="terr_cor" name="cor" type="color" bind:value={novoTerrCor} class="h-10 w-20 rounded border border-slate-300" />
    </div>
    <div class="flex gap-2 pt-2">
      <Button variant="secondary" onclick={() => (sheetCriarTerr = false)} class="flex-1">Cancelar</Button>
      <Button variant="primary" type="submit" loading={salvando} class="flex-1">Criar</Button>
    </div>
  </form>
</BottomSheet>

<!-- Sheet: editar/deletar território -->
<BottomSheet bind:open={sheetEditarTerr} title={terrEdit ? `Território ${terrEdit.nome}` : ''}>
  {#if terrEdit}
    <div class="space-y-4">
      <form
        method="POST"
        action="?/atualizarTerritorio"
        use:enhance={() => {
          salvando = true;
          return async ({ result, update }) => {
            await update();
            salvando = false;
            if (result.type === 'success') { toast.success('Salvo'); sheetEditarTerr = false; await invalidateAll(); }
            else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
          };
        }}
        class="space-y-3"
      >
        <input type="hidden" name="id" value={terrEdit.id} />
        <div class="text-xs text-slate-500">{terrEdit.qtd} quadra(s) neste território.</div>
        <div>
          <label for="ed_nome" class="block text-sm font-medium mb-1">Nome</label>
          <input id="ed_nome" name="nome" bind:value={novoTerrNome} required class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label for="ed_cor" class="block text-sm font-medium mb-1">Cor (propaga pras quadras)</label>
          <input id="ed_cor" name="cor" type="color" bind:value={novoTerrCor} class="h-10 w-20 rounded border border-slate-300" />
        </div>
        <Button variant="primary" type="submit" loading={salvando} class="w-full">Salvar</Button>
      </form>

      <form
        method="POST"
        action="?/deletarTerritorio"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success') { toast.warn((result.data as any)?.msg || 'Removido'); sheetEditarTerr = false; await invalidateAll(); }
          else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
        }}
        onsubmit={(e) => { if (!confirm(`Deletar território "${terrEdit?.nome}"? As ${terrEdit?.qtd} quadra(s) ficam órfãs.`)) e.preventDefault(); }}
        class="border-t border-slate-100 pt-3"
      >
        <input type="hidden" name="id" value={terrEdit.id} />
        <button type="submit" class="text-sm text-red-700 hover:underline"><Icon nome="trash" size={14} /> Deletar território (quadras viram órfãs)</button>
      </form>
    </div>
  {/if}
</BottomSheet>

<!-- Sheet do modo Quadras (renomear + território + ativa) -->
<BottomSheet bind:open={sheetQuadra} title={quadraSel ? `Quadra ${quadraSel.id}` : ''}>
  {#if quadraSel}
    <div class="space-y-4 text-sm">
      <div class="text-xs text-slate-500">
        Território: <strong>{nomeTerritorio(quadraSel.territorio_id)}</strong> ·
        {quadraSel.ativa ? 'ativa' : 'inativa'} ·
        {quadraSel.qtd_locais} endereço(s)
      </div>

      <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <div><strong>Tipo:</strong> {quadraSel.tipo_area}</div>
        <div><strong>Finalidade:</strong> {quadraSel.finalidade === 'language-census' ? 'censo de idioma' : 'pregação regular'}</div>
        <div><strong>Origem:</strong> {quadraSel.origem_geografica} · confiança {quadraSel.confianca}</div>
        <div><strong>Revisão:</strong> {quadraSel.revisao_status === 'approved' ? 'aprovada' : 'sugerida'}</div>
      </div>

      {#if quadraSel.origem_geografica !== 'manual'}
        <form
          method="POST"
          action="?/alterarRevisaoArea"
          use:enhance={() => async ({ result, update }) => {
            await update();
            if (result.type === 'success') {
              toast.success((result.data as any)?.msg || 'Revisão atualizada');
              sheetQuadra = false;
              await invalidateAll();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.erro || 'Falhou'));
            }
          }}
        >
          <input type="hidden" name="id" value={quadraSel.id} />
          <input type="hidden" name="revisao_status" value={quadraSel.revisao_status === 'approved' ? 'suggested' : 'approved'} />
          <Button variant={quadraSel.revisao_status === 'approved' ? 'secondary' : 'primary'} type="submit" class="w-full">
            {quadraSel.revisao_status === 'approved' ? 'Reabrir revisão' : 'Aprovar esta área'}
          </Button>
        </form>
      {/if}

      <!-- Território -->
      <form
        method="POST"
        action="?/vincularTerritorioQuadra"
        use:enhance={() => {
          salvando = true;
          return async ({ result, update }) => {
            await update();
            salvando = false;
            if (result.type === 'success') {
              toast.success((result.data as any)?.msg || 'OK');
              sheetQuadra = false;
              await invalidateAll();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.erro || 'Falhou'));
            }
          };
        }}
        class="space-y-2"
      >
        <input type="hidden" name="id" value={quadraSel.id} />
        <label for="territorio_id" class="block font-medium">Território</label>
        <div class="flex gap-2">
          <select id="territorio_id" name="territorio_id" bind:value={territorioSel} class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— sem território —</option>
            {#each data.territorios as t}
              <option value={t.id}>{t.nome}</option>
            {/each}
          </select>
          <Button variant="primary" size="sm" type="submit" loading={salvando}>Salvar</Button>
        </div>
        <p class="text-xs text-slate-500">Criar/deletar território é no modo Territórios.</p>
      </form>

      <!-- Ativa/Inativa -->
      <div class="grid grid-cols-2 gap-2">
        {#each [{ v: true, label: 'Ativa' }, { v: false, label: '∅ Inativa' }] as opt}
          <form
            method="POST"
            action="?/alterarStatusQuadra"
            use:enhance={() => async ({ result, update }) => {
              await update();
              if (result.type === 'success') { toast.success((result.data as any)?.msg || 'OK'); sheetQuadra = false; await invalidateAll(); }
            }}
          >
            <input type="hidden" name="id" value={quadraSel.id} />
            <input type="hidden" name="ativa" value={String(opt.v)} />
            <button type="submit"
              class="w-full px-3 py-2 border rounded-lg hover:bg-slate-50 transition-colors text-center"
              class:bg-primary-50={quadraSel.ativa === opt.v}
              class:border-primary-500={quadraSel.ativa === opt.v}
              class:border-slate-300={quadraSel.ativa !== opt.v}
            >{opt.label}</button>
          </form>
        {/each}
      </div>

      <!-- Renomear -->
      <form
        method="POST"
        action="?/renomearQuadra"
        use:enhance={() => {
          salvando = true;
          return async ({ result, update }) => {
            await update();
            salvando = false;
            if (result.type === 'success') {
              toast.success((result.data as any)?.msg || 'OK');
              sheetQuadra = false;
              await invalidateAll();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.erro || 'Falhou'));
            }
          };
        }}
        class="space-y-2 border-t border-slate-100 pt-3"
      >
        <input type="hidden" name="id_antigo" value={quadraSel.id} />
        <label for="id_novo" class="block font-medium">Renomear (novo ID)</label>
        <div class="flex gap-2">
          <input id="id_novo" name="id_novo" bind:value={novoIdQuadra} placeholder="Ex: 12B" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <Button variant="secondary" size="sm" type="submit" loading={salvando} disabled={!novoIdQuadra.trim()}>Renomear</Button>
        </div>
        <p class="text-xs text-slate-500">Cascata via locais e designações.</p>
      </form>

      <!-- Geometria: editar forma / dividir -->
      <div class="border-t border-slate-100 pt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onclick={() => iniciarEditarForma(quadraSel!)}><Icon nome="pencil" size={14} /> Editar forma</Button>
        <Button variant="secondary" onclick={() => iniciarSplit(quadraSel!)}><Icon nome="scissors" size={14} /> Dividir</Button>
      </div>

      <!-- Excluir quadra -->
      <form
        method="POST"
        action="?/excluirQuadra"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success') { toast.warn((result.data as any)?.msg || 'Excluída'); sheetQuadra = false; await invalidateAll(); }
          else if (result.type === 'failure') toast.error(String((result.data as any)?.erro || 'Falhou'));
        }}
        onsubmit={(e) => { if (!confirm(`Excluir quadra ${quadraSel?.id}? Os endereços ficam sem quadra.`)) e.preventDefault(); }}
      >
        <input type="hidden" name="id" value={quadraSel.id} />
        <button type="submit" class="text-sm text-red-700 hover:underline"><Icon nome="trash" size={14} /> Excluir quadra</button>
      </form>

      <Button variant="ghost" onclick={() => (sheetQuadra = false)} class="w-full">Fechar</Button>
    </div>
  {/if}
</BottomSheet>

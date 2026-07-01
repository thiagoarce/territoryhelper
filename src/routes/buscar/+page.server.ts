import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';

interface LocalProximo {
  id: number;
  tipo: string;
  logradouro: string;
  numero: string;
  nome: string | null;
  quadra_id: string | null;
  distancia_m?: number;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const q = (url.searchParams.get('q') || '').trim();
  const lat = parseFloat(url.searchParams.get('lat') || '');
  const lng = parseFloat(url.searchParams.get('lng') || '');
  const temGeo = isFinite(lat) && isFinite(lng);

  // Sem query e sem geo: tela vazia
  if (!q && !temGeo) return { q, lat: null, lng: null, quadras: [], locais: [] as LocalProximo[] };

  const [quadrasRes, locaisRes, proxRes] = await Promise.all([
    q
      ? locals.supabase.from('quadras').select('id, color, territorio_id, status').ilike('id', `%${q}%`).limit(20)
      : Promise.resolve({ data: [] }),
    q
      ? locals.supabase
          .from('locais')
          .select('id, tipo, logradouro, numero, nome, quadra_id')
          .or(`logradouro.ilike.%${q}%,nome.ilike.%${q}%,numero.ilike.%${q}%`)
          .eq('pendente', false)
          .limit(50)
      : Promise.resolve({ data: [] }),
    temGeo
      ? locals.supabase.rpc('buscar_locais_proximos' as any, { p_lat: lat, p_lng: lng, p_limite: 30, p_raio_m: 2000 } as any)
      : Promise.resolve({ data: null })
  ]);

  let locais: LocalProximo[] = (locaisRes.data ?? []) as LocalProximo[];

  // Se tem geo, mescla proximidade com resultados textuais (proximidade primeiro)
  if (temGeo && proxRes.data) {
    const proximos = proxRes.data as LocalProximo[];
    const jaIncluidos = new Set(locais.map((l) => l.id));
    // Se tem query, prioriza matches textuais; proximidade preenche o resto
    if (q) {
      for (const p of proximos) if (!jaIncluidos.has(p.id)) locais.push(p);
    } else {
      // Sem query: só proximidade
      locais = proximos;
    }
  }

  return {
    q,
    lat: temGeo ? lat : null,
    lng: temGeo ? lng : null,
    quadras: quadrasRes.data ?? [],
    locais
  };
};

export const actions: Actions = {
  // Publicador cria prédio pendente quando não encontra na busca. Admin depois
  // valida e associa a uma quadra (marca pendente=false).
  criarPredioPendente: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const logradouro = String(fd.get('logradouro') ?? '').trim();
    const numero = String(fd.get('numero') ?? '').trim() || 's/n';
    const nome = String(fd.get('nome') ?? '').trim() || null;
    const tipoEntrada = String(fd.get('tipo_entrada') ?? '').trim() || null;
    const qtd = Number(fd.get('qtd_aptos') ?? 0);
    const lat = parseFloat(String(fd.get('lat') ?? ''));
    const lng = parseFloat(String(fd.get('lng') ?? ''));
    const notas = String(fd.get('notas') ?? '').trim() || null;

    if (!logradouro) return fail(400, { erro: 'Logradouro obrigatório' });

    const geo = isFinite(lat) && isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null;

    const { data: novo, error: errL } = await locals.supabase
      .from('locais')
      .insert({
        tipo: 'predio',
        logradouro,
        numero,
        nome,
        tipo_entrada: tipoEntrada,
        geo,
        quadra_id: null,
        pendente: true,
        notas,
        criado_por: locals.user.id
      })
      .select('id')
      .single();
    if (errL || !novo) return fail(400, { erro: errL?.message ?? 'Falhou' });

    // Gera as unidades (aptos) — se informado
    const n = Number.isFinite(qtd) && qtd > 0 ? Math.min(qtd, 200) : 1;
    const unidades = Array.from({ length: n }, (_, i) => ({
      local_id: novo.id,
      complemento: `APTO ${i + 1}`,
      ordem: i + 1
    }));
    await locals.supabase.from('unidades').insert(unidades);

    return { ok: true, msg: 'Prédio criado — admin vai validar', id: novo.id };
  }
};

// Resolve um link do Google Maps mandado no WhatsApp e devolve o local.
//
// Precisa ser SERVER: o link curto (maps.app.goo.gl) só entrega o
// destino num redirect, e o browser não consegue seguir por CORS.
//
// Custo de CPU no Worker é baixo (um fetch + regex + no máximo um
// segundo fetch de geocoder) — nada de agregação, então não fere a
// regra da casa de manter trabalho pesado fora do Worker.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  ehLinkGoogleMaps,
  extrairDoLinkMaps,
  consultaParaGeocodificar,
  type LocalDoLink
} from '$lib/maps-link';

const UA = 'TerritoryHelper/2.0 (app de territórios; contato pelo admin da congregação)';

export const POST: RequestHandler = async ({ request, locals }) => {
  // Só quem cadastra ponto usa isso (admin no /admin/poligonos,
  // dirigente ao sugerir) — não é endpoint aberto.
  if (!locals.user) throw error(401, 'Não autenticado');
  if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
    throw error(403, 'Só dirigente/admin');
  }

  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  const link = (url ?? '').trim();
  if (!link) throw error(400, 'Informe o link');
  if (!ehLinkGoogleMaps(link)) throw error(400, 'Isso não parece um link do Google Maps');

  // 1) Segue o redirect até a URL final
  let urlFinal = link;
  try {
    const resp = await fetch(link, {
      redirect: 'follow',
      headers: {
        // Sem User-Agent de browser o Google às vezes devolve uma
        // página de consentimento em vez do redirect.
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });
    urlFinal = resp.url || link;
  } catch {
    throw error(502, 'Não consegui abrir o link do Maps agora. Tente de novo.');
  }

  const local: LocalDoLink = extrairDoLinkMaps(urlFinal);

  // 2) Sem coordenada no link (caso comum!): geocodifica pelo nome do
  //    lugar. O admin ainda vê o pino e confirma antes de salvar.
  if (local.lat === null) {
    const consulta = consultaParaGeocodificar(local);
    if (consulta) {
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(consulta)}`,
          { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(8000) }
        );
        if (resp.ok) {
          const [achado] = (await resp.json()) as { lat?: string; lon?: string; display_name?: string }[];
          const lat = Number(achado?.lat);
          const lng = Number(achado?.lon);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            local.lat = lat;
            local.lng = lng;
            local.confianca = 'aproximada';
            if (!local.endereco && achado?.display_name) local.endereco = achado.display_name;
          }
        }
      } catch {
        // geocoder fora do ar não invalida o resto: nome/endereço já
        // ajudam, e a tela deixa marcar o ponto no mapa na mão
      }
    }
  }

  return json({ ...local, urlFinal });
};

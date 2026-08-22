// Toque longo no mapa (segurar o dedo) → devolve a coordenada.
// É como o dirigente cadastra um ponto de referência em campo, sem sair
// da tela ("segura onde dá pra estacionar e dá um nome").
//
// Por que não só `map.on('contextmenu')`: no toque, o contextmenu
// depende do navegador (Chrome Android emite; iOS Safari costuma não
// emitir dentro de canvas) — então há um detector manual por
// touchstart/touchend em paralelo, com as duas guardas que evitam
// disparo indevido: cancelar se o dedo ARRASTAR (pan do mapa) e
// cancelar em movimento/zoom do próprio mapa.
export interface OpcoesToqueLongo {
  /** ms segurando pra contar como toque longo */
  duracao?: number;
  /** px de tolerância de movimento do dedo antes de cancelar */
  tolerancia?: number;
}

export function instalarToqueLongo(
  mapa: any,
  aoDisparar: (lngLat: { lng: number; lat: number }) => void,
  opts: OpcoesToqueLongo = {}
): () => void {
  const duracao = opts.duracao ?? 600;
  const tolerancia = opts.tolerancia ?? 10;
  const canvas: HTMLElement = mapa.getCanvasContainer();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inicio: { x: number; y: number } | null = null;

  const cancelar = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    inicio = null;
  };

  const disparar = (x: number, y: number) => {
    try {
      const ll = mapa.unproject([x, y]);
      // Vibração curta: sem ela o usuário não percebe que "pegou" e
      // continua segurando (aí o navegador abre o menu de seleção).
      try { navigator.vibrate?.(30); } catch {}
      aoDisparar({ lng: ll.lng, lat: ll.lat });
    } catch {}
  };

  const pontoRelativo = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return cancelar(); // pinça = zoom, não é toque longo
    const t = e.touches[0];
    inicio = pontoRelativo(t.clientX, t.clientY);
    timer = setTimeout(() => {
      if (inicio) disparar(inicio.x, inicio.y);
      cancelar();
    }, duracao);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!inicio || e.touches.length === 0) return;
    const t = e.touches[0];
    const p = pontoRelativo(t.clientX, t.clientY);
    if (Math.hypot(p.x - inicio.x, p.y - inicio.y) > tolerancia) cancelar();
  };

  // Desktop: o contextmenu do MapLibre já entrega o lngLat pronto
  const onContextMenu = (e: any) => {
    cancelar(); // não disparar duas vezes no Android, que emite os dois
    if (e?.lngLat) {
      try { navigator.vibrate?.(30); } catch {}
      aoDisparar({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    }
  };

  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: true });
  canvas.addEventListener('touchend', cancelar, { passive: true });
  canvas.addEventListener('touchcancel', cancelar, { passive: true });
  mapa.on('contextmenu', onContextMenu);
  mapa.on('movestart', cancelar);
  mapa.on('zoomstart', cancelar);

  return () => {
    cancelar();
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', cancelar);
    canvas.removeEventListener('touchcancel', cancelar);
    try { mapa.off('contextmenu', onContextMenu); } catch {}
    try { mapa.off('movestart', cancelar); } catch {}
    try { mapa.off('zoomstart', cancelar); } catch {}
  };
}

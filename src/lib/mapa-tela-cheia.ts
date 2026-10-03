// Botão de tela cheia dos mapas (pedido do dirigente: ver o território
// inteiro sem header/menu/bottom nav disputando espaço).
//
// NÃO é o FullscreenControl do MapLibre: ele põe só o <div> do mapa em
// tela cheia nativa — e aí TUDO que mora fora dele some (BottomSheet que
// abre ao tocar na quadra, toast, barra de seleção em massa, legenda e
// overlay de carregamento dos nossos componentes). No modo pseudo dele o
// mapa vai pra z-index 99999, que dá no mesmo. Aqui:
//
//   1. o WRAPPER do componente (pai do container — onde moram legenda e
//      MapaCarregando) vira `position: fixed; inset: 0` num z-index ABAIXO
//      das barras fixas de ação (z-30), sheets (z-40/50) e toasts (z-50),
//      e o header/bottom nav do layout somem via classe no <html>
//      (`.esconde-em-tela-cheia` no app.css);
//   2. se o navegador deixar, pede tela cheia NATIVA da PÁGINA INTEIRA
//      (documentElement, não o mapa) — some a barra do navegador/sistema
//      no Android sem esconder nada do app. iPhone não tem a API pra
//      elemento: fica só o (1), que no PWA instalado já ocupa a tela toda.
//
// Botão "voltar" do Android sai da nativa → `fullscreenchange` → sai do
// modo inteiro. Esc idem (no desktop).

const CLASSE_WRAPPER = 'mapa-tela-cheia';
const CLASSE_HTML = 'mapa-em-tela-cheia';

// Só um mapa por vez em tela cheia (Casa a casa tem vários na mesma tela)
let ativo: ControleTelaCheia | null = null;

function elementoNativo(): Element | null {
  const d = document as any;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function pedirNativa() {
  const el = document.documentElement as any;
  try {
    const r = el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.();
    // Promise rejeitada (permissão, iframe, PWA que não deixa) não pode
    // virar "Uncaught (in promise)" na telemetria de erros
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    /* sem API: fica só a tela cheia por CSS */
  }
}

function sairNativa() {
  if (!elementoNativo()) return;
  const d = document as any;
  try {
    const r = d.exitFullscreen?.() ?? d.webkitExitFullscreen?.();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    /* nada */
  }
}

export class ControleTelaCheia {
  private mapa: any;
  private wrapper: HTMLElement | null = null;
  private caixa: HTMLDivElement | null = null;
  private botao: HTMLButtonElement | null = null;
  private ligado = false;

  onAdd(mapa: any): HTMLElement {
    this.mapa = mapa;
    this.wrapper = mapa.getContainer().parentElement;
    const caixa = document.createElement('div');
    caixa.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const botao = document.createElement('button');
    botao.type = 'button';
    const icone = document.createElement('span');
    icone.className = 'maplibregl-ctrl-icon';
    icone.setAttribute('aria-hidden', 'true');
    botao.appendChild(icone);
    botao.addEventListener('click', this.alternar);
    caixa.appendChild(botao);
    this.caixa = caixa;
    this.botao = botao;
    this.atualizarBotao();
    document.addEventListener('fullscreenchange', this.aoMudarNativa);
    document.addEventListener('webkitfullscreenchange', this.aoMudarNativa);
    document.addEventListener('keydown', this.aoTeclar);
    return caixa;
  }

  onRemove() {
    // Componente desmontado em tela cheia (navegou pra outra tela): sem
    // isso o header/bottom nav ficariam escondidos no app inteiro.
    if (this.ligado) this.desligar();
    document.removeEventListener('fullscreenchange', this.aoMudarNativa);
    document.removeEventListener('webkitfullscreenchange', this.aoMudarNativa);
    document.removeEventListener('keydown', this.aoTeclar);
    this.caixa?.remove();
    this.mapa = null;
  }

  private atualizarBotao() {
    if (!this.botao) return;
    // Ícones já vêm no CSS bundlado do MapLibre
    this.botao.className = this.ligado ? 'maplibregl-ctrl-shrink' : 'maplibregl-ctrl-fullscreen';
    const titulo = this.ligado ? 'Sair da tela cheia' : 'Tela cheia';
    this.botao.title = titulo;
    this.botao.setAttribute('aria-label', titulo);
    this.botao.setAttribute('aria-pressed', String(this.ligado));
  }

  private alternar = () => {
    if (this.ligado) this.desligar();
    else this.ligar();
  };

  private ligar() {
    if (!this.wrapper) return;
    if (ativo && ativo !== this) ativo.desligar();
    ativo = this;
    this.ligado = true;
    this.wrapper.classList.add(CLASSE_WRAPPER);
    document.documentElement.classList.add(CLASSE_HTML);
    this.atualizarBotao();
    pedirNativa();
    this.redimensionar();
  }

  private desligar() {
    this.ligado = false;
    if (ativo === this) ativo = null;
    this.wrapper?.classList.remove(CLASSE_WRAPPER);
    if (!ativo) document.documentElement.classList.remove(CLASSE_HTML);
    this.atualizarBotao();
    sairNativa();
    this.redimensionar();
  }

  private redimensionar() {
    // O ResizeObserver do MapLibre pega a mudança de tamanho, mas a tela
    // cheia nativa anima — um resize depois do próximo frame garante
    // que o canvas não fica com o tamanho antigo (faixa cinza).
    const m = this.mapa;
    if (!m) return;
    requestAnimationFrame(() => {
      try {
        m.resize();
      } catch {
        /* mapa removido no meio */
      }
    });
  }

  private aoMudarNativa = () => {
    // Saiu da nativa por fora (voltar do Android, Esc, gesto do sistema)
    if (this.ligado && !elementoNativo()) {
      // Só derruba se a NATIVA estava ligada — em aparelho sem a API o
      // evento não dispara, então não há falso positivo aqui.
      this.desligar();
    }
  };

  private aoTeclar = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.ligado && !elementoNativo()) this.desligar();
  };
}

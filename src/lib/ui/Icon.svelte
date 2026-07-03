<script lang="ts" module>
  // Mapa central de ícones (lucide) — importar por nome semântico mantém
  // a UI consistente e o tree-shaking elimina o que não é usado.
  import {
    Map as MapIcon, MapPin, ClipboardList, Mail, BarChart3, Calendar, User,
    Settings, Eye, FolderOpen, Target, Footprints, Store, Tent, Scissors,
    Share2, Link2, Pencil, Trash2, Hourglass, Timer, DoorOpen, DoorClosed,
    Ban, MessageCircle, Hand, Users, Inbox, Phone, Lock, LockOpen, Camera,
    Pill, Trees, Fuel, ShoppingCart, Croissant, Building2, Home, Hotel,
    Plus, Paperclip, TriangleAlert, Check, X, RotateCcw, RefreshCw, Eraser,
    SquareCheck, Pin, Clock, FileText, Shield, CircleDot, Plug, Sparkles,
    Smartphone, MailOpen, Megaphone, Wheat, Tag, Info, Zap, Play,
    ChevronDown, Shapes, Menu, History, Square, SquareParking, Search,
    Circle, ArrowRightLeft, LoaderCircle
  } from 'lucide-svelte';

  export const ICONES = {
    map: MapIcon,
    'map-pin': MapPin,
    clipboard: ClipboardList,
    mail: Mail,
    chart: BarChart3,
    calendar: Calendar,
    user: User,
    settings: Settings,
    eye: Eye,
    folder: FolderOpen,
    target: Target,
    walk: Footprints,
    store: Store,
    tent: Tent,
    scissors: Scissors,
    share: Share2,
    link: Link2,
    pencil: Pencil,
    trash: Trash2,
    hourglass: Hourglass,
    timer: Timer,
    door: DoorOpen,
    'door-closed': DoorClosed,
    ban: Ban,
    chat: MessageCircle,
    hand: Hand,
    users: Users,
    inbox: Inbox,
    phone: Phone,
    lock: Lock,
    unlock: LockOpen,
    camera: Camera,
    pill: Pill,
    trees: Trees,
    fuel: Fuel,
    cart: ShoppingCart,
    croissant: Croissant,
    building: Building2,
    home: Home,
    hotel: Hotel,
    plus: Plus,
    paperclip: Paperclip,
    alert: TriangleAlert,
    check: Check,
    x: X,
    undo: RotateCcw,
    refresh: RefreshCw,
    eraser: Eraser,
    'square-check': SquareCheck,
    pin: Pin,
    clock: Clock,
    'file-text': FileText,
    shield: Shield,
    'circle-dot': CircleDot,
    plug: Plug,
    sparkles: Sparkles,
    smartphone: Smartphone,
    'mail-open': MailOpen,
    megaphone: Megaphone,
    wheat: Wheat,
    tag: Tag,
    info: Info,
    zap: Zap,
    play: Play,
    'chevron-down': ChevronDown,
    shapes: Shapes,
    menu: Menu,
    history: History,
    square: Square,
    parking: SquareParking,
    search: Search,
    circle: Circle,
    swap: ArrowRightLeft,
    loader: LoaderCircle
  } as const;

  export type NomeIcone = keyof typeof ICONES;
</script>

<script lang="ts">
  let {
    nome,
    size = 16,
    spin = false,
    class: cls = 'inline-block align-[-0.125em] shrink-0'
  }: {
    nome: NomeIcone;
    size?: number;
    /** Gira o ícone (loading). Aditivo — não substitui a classe base,
        que segura o `inline-block` contra o preflight do Tailwind
        (svg é display:block por padrão e quebraria linha no botão). */
    spin?: boolean;
    class?: string;
  } = $props();

  const C = $derived(ICONES[nome] ?? Circle);
</script>

<C {size} class="{cls}{spin ? ' animate-spin' : ''}" strokeWidth={2} aria-hidden="true" />

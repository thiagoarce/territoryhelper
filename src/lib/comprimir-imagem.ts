// Comprime uma foto no CLIENT antes do upload — fotos de câmera vêm
// com vários MB (a maioria bem maior que qualquer tela do app precisa)
// e o Storage do Supabase free é 1GB só; foto é o que mais rápido come
// esse espaço. Resize via <canvas> pra no máximo `maxLado` px no maior
// lado + reencode JPEG em `qualidade` corta ~80-90% do peso típico, e
// deixa o upload viável em sinal ruim (a fila offline não leva foto —
// ver CLAUDE.md — mas o upload direto ainda se beneficia).
//
// Se por algum motivo a compressão falhar (ex: formato exótico que o
// <canvas> não decodifica) devolve o arquivo ORIGINAL — nunca bloqueia
// o upload por causa de um passo que é só otimização.
export async function comprimirImagem(
  file: File,
  { maxLado = 1280, qualidade = 0.82 }: { maxLado?: number; qualidade?: number } = {}
): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    // Já é pequena e leve — não vale reencodar (JPEG re-encode pode até
    // aumentar um PNG pequeno já otimizado).
    if (escala === 1 && file.size <= 400 * 1024) {
      bitmap.close?.();
      return file;
    }
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', qualidade)
    );
    if (!blob || blob.size >= file.size) return file;
    const nome = file.name.replace(/\.\w+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

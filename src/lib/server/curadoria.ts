// Fila de curadoria (migration 057): edição de OVERLAY feita por
// não-admin vale na hora, mas fica pendente até o admin confirmar ou
// reverter. Reverter aplica o snapshot `antes` de volta no registro.
// Admin editando não gera linha (já é curado). O log NUNCA derruba a
// action — a edição em si já foi salva; falha de log é só console.

export interface EntradaCuradoria {
  local_id: number | null;
  unidade_id?: number | null;
  tipo: 'edicao' | 'criacao' | 'nao_existe';
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
}

export async function registrarCuradoria(locals: App.Locals, entrada: EntradaCuradoria): Promise<void> {
  if (!locals.user || locals.profile?.role === 'admin') return;
  const { error } = await locals.supabase.from('curadoria_edicoes').insert({
    local_id: entrada.local_id,
    unidade_id: entrada.unidade_id ?? null,
    publicador_id: locals.user.id,
    tipo: entrada.tipo,
    antes: entrada.antes ?? null,
    depois: entrada.depois ?? null
  });
  if (error) console.warn('[curadoria] falhou registrar:', error.message);
}

// Recorta do registro atual só os campos que o patch vai mudar — vira o
// snapshot `antes` da linha de curadoria.
export function snapshotAntes(
  atual: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const antes: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) antes[k] = atual?.[k] ?? null;
  return antes;
}

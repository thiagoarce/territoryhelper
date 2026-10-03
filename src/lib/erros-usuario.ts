export interface FriendlyError {
  message: string;
  diagnosticCode: string;
  retryable: boolean;
}

function technicalMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error ?? 'erro desconhecido');
}

export function friendlyError(error: unknown, status?: number): FriendlyError {
  const raw = technicalMessage(error).toLowerCase();
  if (raw.includes('quadra_not_assigned') || raw.includes('local_not_assigned')) {
    return { message: 'Este item não faz mais parte da sua designação ativa.', diagnosticCode: 'ITEM_NOT_ASSIGNED', retryable: false };
  }
  if (raw.includes('quadra_not_found')) {
    return { message: 'Esta quadra não está mais disponível.', diagnosticCode: 'RESOURCE_NOT_FOUND', retryable: false };
  }
  if (raw.includes('structural_change_not_allowed') || raw.includes('privilege_change_not_allowed')) {
    return { message: 'Esta alteração estrutural precisa ser feita por um administrador.', diagnosticCode: 'STRUCTURAL_CHANGE_NOT_ALLOWED', retryable: false };
  }
  if (status === 401 || raw.includes('jwt') || raw.includes('session')) {
    return { message: 'Sua sessão expirou. Entre novamente para continuar.', diagnosticCode: 'SESSION_EXPIRED', retryable: false };
  }
  if (status === 404) {
    return { message: 'Este item não está mais disponível.', diagnosticCode: 'RESOURCE_NOT_FOUND', retryable: false };
  }
  if (status === 405) {
    return { message: 'Esta ação mudou ou não está disponível. Atualize a página e tente novamente.', diagnosticCode: 'ACTION_UNAVAILABLE', retryable: true };
  }
  if (status === 403 || raw.includes('permission') || raw.includes('policy') || raw.includes('rls')) {
    return { message: 'Você não pode realizar esta ação neste item.', diagnosticCode: 'ACTION_NOT_ALLOWED', retryable: false };
  }
  if (status === 409 || raw.includes('conflict') || raw.includes('duplicate')) {
    return { message: 'Os dados foram alterados por outra pessoa. Revise a versão atual antes de continuar.', diagnosticCode: 'WRITE_CONFLICT', retryable: true };
  }
  return { message: 'Não foi possível salvar agora. Tente novamente.', diagnosticCode: 'UNEXPECTED_ERROR', retryable: true };
}

export function friendlyMessage(error: unknown, status?: number): string {
  return friendlyError(error, status).message;
}

export function domainMessage(error: unknown, status?: number): string {
  const raw = technicalMessage(error);
  const technical = status === 401 || status === 403 || status === 404 || status === 405 || status === 409
    || /(sql|postgres|postgrest|policy|rls|permission|constraint|violates|pgrst\d+|not found|method not allowed|_not_assigned|structural_change_not_allowed)/i.test(raw);
  return technical ? friendlyMessage(error, status) : raw;
}

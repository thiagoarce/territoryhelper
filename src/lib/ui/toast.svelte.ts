// Sistema de toast global. Uso:
//   import { toast } from '$lib/ui/toast.svelte';
//   toast.success('Salvo');
//   toast.error('Falhou: ' + err);
//   toast.info('Sincronizando…');
//
// Componente <Toaster /> deve estar uma vez no root layout pra renderizar.

import { SvelteMap } from 'svelte/reactivity';

export type ToastTipo = 'success' | 'error' | 'warn' | 'info';

export interface ToastItem {
  id: number;
  tipo: ToastTipo;
  msg: string;
  duracao: number;
}

class ToastStore {
  itens = $state(new SvelteMap<number, ToastItem>());
  private nextId = 1;

  add(tipo: ToastTipo, msg: string, duracao = 3000): number {
    const id = this.nextId++;
    this.itens.set(id, { id, tipo, msg, duracao });
    if (duracao > 0) {
      setTimeout(() => this.dismiss(id), duracao);
    }
    return id;
  }

  dismiss(id: number) {
    this.itens.delete(id);
  }

  success(msg: string, duracao?: number) { return this.add('success', msg, duracao); }
  error(msg: string, duracao = 5000) { return this.add('error', msg, duracao); }
  warn(msg: string, duracao?: number) { return this.add('warn', msg, duracao); }
  info(msg: string, duracao?: number) { return this.add('info', msg, duracao); }
}

export const toast = new ToastStore();

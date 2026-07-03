// Mini test harness sem dependências. Roda em Node via tsx (resolve $lib
// pelos paths do tsconfig gerado pelo SvelteKit).
export interface Teste {
  nome: string;
  fn: () => void | Promise<void>;
}

const testes: Teste[] = [];

export function test(nome: string, fn: () => void | Promise<void>) {
  testes.push({ nome, fn });
}

export function assertEq(atual: unknown, esperado: unknown, msg?: string) {
  const a = JSON.stringify(atual);
  const e = JSON.stringify(esperado);
  if (a !== e) throw new Error((msg ? msg + ': ' : '') + 'esperado ' + e + ' recebeu ' + a);
}

export function assertTrue(v: unknown, msg?: string) {
  if (!v) throw new Error(msg || 'esperado true');
}

export function assertFalse(v: unknown, msg?: string) {
  if (v) throw new Error(msg || 'esperado false');
}

export async function run() {
  let pass = 0, fail = 0;
  for (const t of testes) {
    try {
      await t.fn();
      console.log('  ✓', t.nome);
      pass++;
    } catch (e: any) {
      console.log('  ✗', t.nome);
      console.log('    ' + (e?.stack || e?.message || e));
      fail++;
    }
  }
  console.log('\n' + pass + ' passou, ' + fail + ' falhou');
  if (fail > 0) process.exitCode = 1;
}

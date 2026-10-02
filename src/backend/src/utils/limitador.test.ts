import { describe, expect, it } from 'vitest';
import { Limitador } from './limitador';

function relogio(inicio = 0) {
  let t = inicio;
  return { agora: () => t, avancar: (ms: number) => { t += ms; } };
}

describe('Limitador', () => {
  it('bloqueia ao atingir o máximo e libera quando a janela vence', () => {
    const r = relogio();
    const l = new Limitador(3, 1000, r.agora);
    for (let i = 0; i < 2; i++) l.registrarFalha('x');
    expect(l.bloqueado('x')).toBe(false);
    l.registrarFalha('x');
    expect(l.bloqueado('x')).toBe(true);
    r.avancar(999);
    expect(l.bloqueado('x')).toBe(true);
    r.avancar(1);
    expect(l.bloqueado('x')).toBe(false);
  });

  it('chaves são independentes e limpar zera a contagem', () => {
    const l = new Limitador(1, 1000, relogio().agora);
    l.registrarFalha('a');
    expect(l.bloqueado('a')).toBe(true);
    expect(l.bloqueado('b')).toBe(false);
    l.limpar('a');
    expect(l.bloqueado('a')).toBe(false);
  });

  it('falha depois da janela recomeça a contagem', () => {
    const r = relogio();
    const l = new Limitador(2, 1000, r.agora);
    l.registrarFalha('x');
    r.avancar(1500);
    l.registrarFalha('x');
    expect(l.bloqueado('x')).toBe(false);
  });
});

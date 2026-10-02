import { describe, expect, it } from 'vitest';
import { gerarHashSenha, gerarSenha, hashParaComparacaoFicticia, senhaConfere } from './senha';

describe('gerarHashSenha / senhaConfere', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const hash = await gerarHashSenha('abcd-EFGH-2345-jkmn');
    expect(hash).toMatch(/^scrypt\$15\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(await senhaConfere('abcd-EFGH-2345-jkmn', hash)).toBe(true);
    expect(await senhaConfere('abcd-EFGH-2345-jkmM', hash)).toBe(false);
    expect(await senhaConfere('', hash)).toBe(false);
  });

  it('usa sal: a mesma senha dá hashes diferentes', async () => {
    expect(await gerarHashSenha('mesma senha')).not.toBe(await gerarHashSenha('mesma senha'));
  });

  it('normaliza acentos (NFC e NFD conferem igual)', async () => {
    const hash = await gerarHashSenha('societário');
    expect(await senhaConfere('societa\u0301rio', hash)).toBe(true);
  });

  it('nunca confere com hash em formato desconhecido ou adulterado', async () => {
    expect(await senhaConfere('x', '')).toBe(false);
    expect(await senhaConfere('x', 'bcrypt$2b$10$abc')).toBe(false);
    expect(await senhaConfere('x', 'scrypt$40$8$1$c2Fs$aGFzaA')).toBe(false); // N absurdo
    expect(await senhaConfere('x', 'scrypt$15$8$1$$aGFzaA')).toBe(false);     // sem sal
  });

  it('o hash fictício existe e não confere com nada previsível', async () => {
    const hash = await hashParaComparacaoFicticia();
    expect(await senhaConfere('', hash)).toBe(false);
    expect(await hashParaComparacaoFicticia()).toBe(hash);
  });
});

describe('gerarSenha', () => {
  it('gera xxxx-xxxx-xxxx-xxxx sem caracteres ambíguos', () => {
    for (let i = 0; i < 50; i++) {
      const s = gerarSenha();
      expect(s).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
      expect(s).not.toMatch(/[0O1lI]/);
    }
  });

  it('não repete', () => {
    const vistas = new Set(Array.from({ length: 200 }, gerarSenha));
    expect(vistas.size).toBe(200);
  });
});

import { describe, expect, it } from 'vitest';
import { classificarExClientes } from './auditExClientes';

const empresas = [
  { id: 'a10',   razaoSocial: 'A10 TRANSPORTES GV LTDA',            cnpj: '48.401.034/0001-14' },
  { id: 'ss',    razaoSocial: 'SS TRANSPORTES LTDA',                cnpj: '57.018.867/0001-91' },
  { id: 'net',   razaoSocial: 'NETPARTS COMERCIO DE PECAS LTDA',    cnpj: '34.857.388/0001-63' },
  { id: 'alfa',  razaoSocial: 'ALFA MANUTENCOES LTDA',              cnpj: '22.659.441/0001-32' },
  { id: 'bld1',  razaoSocial: 'BLD LOGISTICA LTDA',                 cnpj: '17.122.471/0001-55' },
  { id: 'bld12', razaoSocial: 'BLD LOGISTICA LTDA',                 cnpj: '17.122.471/0012-28' },
  { id: 'cic',   razaoSocial: 'CIC TRANSPORTES LTDA',               cnpj: '11.111.111/0001-11' },
];
const comPastaAtiva = new Set(['ss']);
const classificar = (pastas: string[]) => classificarExClientes(pastas, empresas, (id) => comPastaAtiva.has(id));

describe('classificarExClientes', () => {
  it('pasta só em Ex Clientes tira a empresa; com pasta ativa também, fica com aviso', () => {
    const r = classificar(['A10 TRANSPORTES GV LTDA', 'SS TRANSPORTES LTDA']);
    expect([...r.fora]).toEqual([['a10', 'A10 TRANSPORTES GV LTDA']]);
    expect([...r.aviso]).toEqual([['ss', 'SS TRANSPORTES LTDA']]);
  });

  it('casa como o vínculo automático: acento, "LTDA" e "- 1 MATRIZ"', () => {
    const r = classificar(['ALFA MANUTENÇÕES', 'NETPARTS COMERCIO DE PECAS LTDA - 1 MATRIZ']);
    expect([...r.fora.keys()].sort()).toEqual(['alfa', 'net']);
  });

  it('filial pela ordem do CNPJ; nome repetido sem filial não tira ninguém', () => {
    expect([...classificar(['BLD LOGISTICA LTDA - 12 FILIAL']).fora.keys()]).toEqual(['bld12']);
    expect(classificar(['BLD LOGISTICA LTDA']).fora.size).toBe(0);
  });

  it('nome só parecido não tira ninguém (sem falso positivo)', () => {
    expect(classificar(['TRANSCIC TRANSPORTES LTDA', 'PASTA QUALQUER']).fora.size).toBe(0);
  });

  it('lista vazia não tira ninguém', () => {
    const r = classificar([]);
    expect(r.fora.size + r.aviso.size).toBe(0);
  });
});

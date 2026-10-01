import { describe, expect, it } from 'vitest';
import { filtrarEmpresas, type EmpresaAditivo } from './auditAditivosService';
import type { StatusAditivo } from './auditAditivosStatus';

function empresa(
  razaoSocial: string,
  status: StatusAditivo,
  extra: { responsavel?: string | null; cnpj?: string; pasta?: string; alerta?: boolean } = {},
): EmpresaAditivo {
  return {
    empresa: { id: razaoSocial, razaoSocial, cnpj: extra.cnpj ?? '11.111.111/0001-11', responsavel: extra.responsavel ?? null },
    status,
    emDia: status === 'ASSINADO_DIGITAL' || status === 'ASSINADO_PELO_NOME',
    pastas: extra.pasta ? [{ nomePasta: extra.pasta, subpastasContrato: [] }] : [],
    aditivosDoAno: [], outrosAditivos: [], ultimoAnoComAditivo: null, temDecimoTerceiroDoAno: false,
    geradosNoApp: 0, ultimoGeradoNoApp: null,
    alertas: extra.alerta ? ['gerado_no_app_sem_arquivo'] : [],
  };
}

const lista = [
  empresa('ALLMETAL LTDA', 'ASSINADO_DIGITAL', { responsavel: 'Ana', pasta: 'ALLMETAL LTDA' }),
  empresa('BLD LOGÍSTICA LTDA', 'PDF_SEM_ASSINATURA', { responsavel: 'Bia', cnpj: '17.122.471/0012-28', pasta: 'BLD LOGÍSTICA LTDA - 12 FILIAL' }),
  empresa('GAZAL LOGISTICA', 'ASSINADO_PELO_NOME'),
  empresa('41 CONSULTORIA LTDA', 'SEM_ADITIVO', { alerta: true }),
];
const nomes = (r: EmpresaAditivo[]) => r.map((e) => e.empresa.razaoSocial);

describe('filtrarEmpresas', () => {
  it('sem filtro devolve tudo', () => {
    expect(filtrarEmpresas(lista, {})).toHaveLength(4);
  });

  it('em dia e pendente seguem a decisão 4 (pelo nome conta como em dia)', () => {
    expect(nomes(filtrarEmpresas(lista, { status: 'em_dia' }))).toEqual(['ALLMETAL LTDA', 'GAZAL LOGISTICA']);
    expect(nomes(filtrarEmpresas(lista, { status: 'pendente' }))).toEqual(['BLD LOGÍSTICA LTDA', '41 CONSULTORIA LTDA']);
  });

  it('status exato', () => {
    expect(nomes(filtrarEmpresas(lista, { status: 'SEM_ADITIVO' }))).toEqual(['41 CONSULTORIA LTDA']);
  });

  it('responsável, inclusive "sem responsável"', () => {
    expect(nomes(filtrarEmpresas(lista, { responsavel: 'Bia' }))).toEqual(['BLD LOGÍSTICA LTDA']);
    expect(nomes(filtrarEmpresas(lista, { responsavel: '__none__' }))).toEqual(['GAZAL LOGISTICA', '41 CONSULTORIA LTDA']);
  });

  it('busca sem acento por nome, por pasta e por CNPJ', () => {
    expect(nomes(filtrarEmpresas(lista, { busca: 'logistica' }))).toEqual(['BLD LOGÍSTICA LTDA', 'GAZAL LOGISTICA']);
    expect(nomes(filtrarEmpresas(lista, { busca: '12 filial' }))).toEqual(['BLD LOGÍSTICA LTDA']);
    expect(nomes(filtrarEmpresas(lista, { busca: '17.122.471' }))).toEqual(['BLD LOGÍSTICA LTDA']);
  });

  it('só com alerta', () => {
    expect(nomes(filtrarEmpresas(lista, { soAlerta: true }))).toEqual(['41 CONSULTORIA LTDA']);
  });
});

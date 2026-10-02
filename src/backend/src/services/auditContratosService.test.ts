import { describe, expect, it } from 'vitest';
import { filtrarEmpresasContratos, type EmpresaContrato } from './auditContratosService';

function empresa(
  id: string,
  status: EmpresaContrato['status'],
  motivo: EmpresaContrato['motivo'],
): EmpresaContrato {
  return {
    empresa: { id, razaoSocial: `Empresa ${id}`, cnpj: id.padStart(14, '0'), responsavel: null },
    status,
    emDia: status === 'ASSINADO',
    motivo,
    pastas: [],
    contratos: [],
    descartados: [],
    contratoPrincipal: null,
    warnings: [],
    renomeacao: null,
  };
}

describe('filtrarEmpresasContratos', () => {
  const empresas = [
    empresa('1', 'ASSINADO', 'CONTRATO_DIGITAL_ASSINADO'),
    empresa('2', 'ASSINADO', 'CONTRATO_ASSINADO_PELO_NOME'),
    empresa('3', 'AGUARDANDO_ASSINATURA', 'PDF_SEM_ASSINATURA'),
  ];

  it('separa assinatura digital de assinatura aceita pelo nome', () => {
    expect(filtrarEmpresasContratos(empresas, { status: 'assinado_digital' }).map((e) => e.empresa.id))
      .toEqual(['1']);
    expect(filtrarEmpresasContratos(empresas, { status: 'assinado_pelo_nome' }).map((e) => e.empresa.id))
      .toEqual(['2']);
  });

  it('mantém o filtro geral de empresas em dia', () => {
    expect(filtrarEmpresasContratos(empresas, { status: 'em_dia' })).toHaveLength(2);
  });
});

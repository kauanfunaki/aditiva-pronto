// Ex-clientes (pedido do Societário, 12/11/2026): quando o cliente sai, a pasta vai para
// "009_EMPRESAS EX CLIENTES" na raiz, mas a empresa continua ativa no app (vem ativa na
// relação do Domínio). O robô 1.2+ manda os nomes dessas pastas; aqui eles são casados com
// as empresas pela mesma regra do vínculo automático (nome normalizado único, ou filial pela
// ordem do CNPJ). Usado por Aditivos, Contratos e Honorários.

import * as base from '../repositories/auditRepository';
import { agruparPorNome, indexarEmpresas, vinculoAutomatico, type EmpresaVinculavel } from './auditVinculo';

export interface ExClienteResumo {
  id:          string;
  razaoSocial: string;
  cnpj:        string;
  pasta:       string;
}

export interface ResultadoExClientes {
  /** Pasta só em Ex Clientes: a empresa sai da auditoria. companyId → pasta. */
  fora:  Map<string, string>;
  /** Pasta em Ex Clientes E pasta ativa vinculada: continua, com aviso. companyId → pasta. */
  aviso: Map<string, string>;
}

export function classificarExClientes(
  pastasExClientes: string[],
  empresas: EmpresaVinculavel[],
  temPastaAtiva: (companyId: string) => boolean,
): ResultadoExClientes {
  const porNome = agruparPorNome(indexarEmpresas(empresas));
  const fora = new Map<string, string>();
  const aviso = new Map<string, string>();
  for (const pasta of pastasExClientes) {
    const id = vinculoAutomatico(pasta, porNome);
    if (!id || fora.has(id) || aviso.has(id)) continue;
    (temPastaAtiva(id) ? aviso : fora).set(id, pasta);
  }
  return { fora, aviso };
}

/** Lê a última lista do robô e classifica as empresas ativas. Sem lista (robô antigo), ninguém sai. */
export async function carregarExClientes(
  empresas: EmpresaVinculavel[],
  temPastaAtiva: (companyId: string) => boolean,
): Promise<ResultadoExClientes> {
  const lista = await base.buscarUltimaListaExClientes();
  if (!lista?.length) return { fora: new Map(), aviso: new Map() };
  return classificarExClientes(lista, empresas, temPastaAtiva);
}

export function resumirForaDaAuditoria(
  r: ResultadoExClientes,
  empresas: { id: string; razao_social: string; cnpj: string }[],
): ExClienteResumo[] {
  return empresas
    .filter((e) => r.fora.has(e.id))
    .map((e) => ({ id: e.id, razaoSocial: e.razao_social, cnpj: e.cnpj, pasta: r.fora.get(e.id)! }))
    .sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, 'pt-BR'));
}

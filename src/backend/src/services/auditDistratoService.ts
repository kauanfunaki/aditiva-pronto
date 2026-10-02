// Distrato por empresa, a partir do inventário da última sincronização e do texto lido pelo
// robô (au_textos). Usado por Aditivos, Contratos e Honorários: cada um já carregou os
// arquivos e o vínculo pasta → empresa e passa para cá.

import type { ArquivoDoJobRow } from '../repositories/auditAditivosRepository';
import * as textosRepo from '../repositories/auditTextosRepository';
import { classificarContrato } from './auditContratosClassificador';
import {
  analisarDistratos, arquivoEmDistrato, dataFimDoDistrato, ehDocumentoDeDistrato, montarDocumentoDistrato,
  type ArquivoParaDistrato, type ResultadoDistrato,
} from './auditDistrato';
import { chaveDoArquivo, EXTENSOES_COM_TEXTO, mesmaVersao } from './auditTextosService';
import { dataDoDocumento } from './honorarioLeitor';

function paraArquivo(a: ArquivoDoJobRow): ArquivoParaDistrato {
  return {
    nomePasta: a.nome_pasta, caminhoRelativo: a.caminho_relativo, nome: a.nome, ext: a.ext,
    modificadoEm: a.modificado_em, pdfAssinado: a.pdf_assinado === null ? null : !!a.pdf_assinado,
    pdfMarca: a.pdf_marca,
  };
}

const comTexto = (a: ArquivoDoJobRow) => EXTENSOES_COM_TEXTO.has(a.ext.toLowerCase());
const dataDoArquivo = (d: Date) => d.toISOString().slice(0, 10);

/**
 * @param pastasPorEmpresa companyId → nomes das pastas vinculadas (da última sincronização)
 * @returns companyId → distrato (só as empresas que têm algum documento de distrato)
 */
export async function carregarDistratos(
  arquivos: ArquivoDoJobRow[],
  pastasPorEmpresa: Map<string, string[]>,
): Promise<Map<string, ResultadoDistrato>> {
  const porPasta = new Map<string, ArquivoDoJobRow[]>();
  for (const a of arquivos) porPasta.set(a.nome_pasta, [...(porPasta.get(a.nome_pasta) ?? []), a]);

  // Só interessa quem tem documento de distrato.
  const alvo = new Map<string, { distratos: ArquivoDoJobRow[]; contratos: ArquivoDoJobRow[] }>();
  for (const [companyId, pastas] of pastasPorEmpresa) {
    const seus = pastas.flatMap((p) => porPasta.get(p) ?? []);
    const distratos = seus.filter((a) => arquivoEmDistrato(a.caminho_relativo) && ehDocumentoDeDistrato(a.nome, a.ext));
    if (!distratos.length) continue;
    const contratos = seus.filter((a) => !arquivoEmDistrato(a.caminho_relativo)
      && classificarContrato(paraArquivo(a)).ehContratoServico);
    alvo.set(companyId, { distratos, contratos });
  }
  if (!alvo.size) return new Map();

  const chavesDistrato = [...alvo.values()].flatMap((x) => x.distratos.filter(comTexto))
    .map((a) => chaveDoArquivo(a.nome_pasta, a.caminho_relativo));
  const chavesContrato = [...alvo.values()].flatMap((x) => x.contratos.filter(comTexto))
    .map((a) => chaveDoArquivo(a.nome_pasta, a.caminho_relativo));
  const [lidosDistrato, lidosContrato] = await Promise.all([
    textosRepo.listarPorChaves(chavesDistrato, true),
    textosRepo.listarPorChaves(chavesContrato, false),
  ]);
  const leitura = new Map([...lidosDistrato, ...lidosContrato].map((l) => [l.chave, l]));
  const valida = (a: ArquivoDoJobRow) => {
    const l = leitura.get(chaveDoArquivo(a.nome_pasta, a.caminho_relativo));
    return l && l.status === 'ok' && mesmaVersao({ modificadoEm: a.modificado_em, tamanho: Number(a.tamanho) }, l) ? l : null;
  };

  const resultado = new Map<string, ResultadoDistrato>();
  for (const [companyId, { distratos, contratos }] of alvo) {
    const docs = distratos.map((a) => {
      const l = valida(a);
      const texto = l?.texto ?? null;
      return montarDocumentoDistrato(paraArquivo(a), texto
        ? { dataFim: dataFimDoDistrato(texto), dataDocumento: dataDoDocumento(texto) }
        : null);
    });
    // Contrato mais recente: a data do texto (assinatura) e, sem texto, a do arquivo.
    const datasContrato = contratos.map((a) => valida(a)?.data_documento ?? dataDoArquivo(a.modificado_em));
    const contratoMaisNovo = datasContrato.length ? datasContrato.sort().at(-1)! : null;
    const r = analisarDistratos(docs, contratoMaisNovo);
    if (r) resultado.set(companyId, r);
  }
  return resultado;
}

// Regras do honorário por empresa (decisão do Kauan em 02/10/2026): vale o valor do
// documento MAIS RECENTE entre contrato e termo aditivo de honorário, sem correção pelo IPCA.
// Funções puras: o serviço monta os dados e estas regras decidem.

import type { FormaLeitura, TipoDocumento } from './honorarioLeitor';
import type { SinalAssinatura } from './auditAditivosClassificador';

export type SituacaoHonorario =
  | 'MANUAL'              // valor informado por uma pessoa (vence a leitura)
  | 'LIDO'                // valor lido de documento, sem nada a conferir
  | 'CONFERIR'            // valor lido, mas com alerta
  | 'AGUARDANDO_LEITURA'  // o robô ainda não leu os documentos
  | 'DIGITALIZADO'        // só há documento sem texto (imagem): informar à mão
  | 'SEM_VALOR'           // documentos lidos, nenhum com valor
  | 'SEM_DOCUMENTO';      // sem pasta vinculada ou sem documento na pasta

export const SITUACOES_HONORARIO: SituacaoHonorario[] = [
  'CONFERIR', 'DIGITALIZADO', 'SEM_VALOR', 'AGUARDANDO_LEITURA', 'SEM_DOCUMENTO', 'LIDO', 'MANUAL',
];

export type AlertaHonorario =
  | 'minuta'                        // só há valor em minuta
  | 'sem_assinatura'                // o documento escolhido não tem assinatura
  | 'mencao'                        // valor achado fora da cláusula de honorário
  | 'acordo_comercial'              // valor de documento que não é contrato nem aditivo
  | 'valor_condicional'             // valor amarrado a faixa de faturamento
  | 'valores_diferentes'            // documentos da mesma data com valores diferentes
  | 'documento_mais_novo_sem_valor' // há contrato/aditivo de honorário mais novo sem valor lido
  | 'sem_data'                      // sem data no texto: usou a data do arquivo
  | 'leitura_incompleta';           // ainda há documento da empresa sem texto lido

/**
 * Avisos que não põem o VALOR em dúvida: aparecem na tela, mas a empresa continua "Lido".
 * A assinatura em si é assunto dos módulos de Contratos e Aditivos; o Word com valor costuma
 * ter a versão assinada escaneada ao lado.
 */
export const ALERTAS_INFORMATIVOS: ReadonlySet<AlertaHonorario> = new Set(['sem_assinatura', 'sem_data']);

export type EstadoTexto = 'ok' | 'sem_texto' | 'erro' | 'pendente' | 'imagem';

export interface DocumentoDaEmpresa {
  nomePasta:        string;
  caminhoRelativo:  string;
  nome:             string;
  modificadoEm:     Date;
  estado:           EstadoTexto;
  tipo:             TipoDocumento;
  /** Data por extenso no texto (AAAA-MM-DD), quando há. */
  data:             string | null;
  assinatura:       SinalAssinatura;
  minuta:           boolean;
  valor:            number | null;
  adicional:        number | null;
  forma:            FormaLeitura | null;
  condicional:      boolean;
  trecho:           string | null;
}

export interface Escolha {
  documento: DocumentoDaEmpresa | null;
  alertas:   AlertaHonorario[];
}

/** Data usada para ordenar: a do texto; sem ela, a do arquivo. */
export function dataEfetiva(d: DocumentoDaEmpresa): string {
  return d.data ?? d.modificadoEm.toISOString().slice(0, 10);
}

const PESO_TIPO: Record<TipoDocumento, number> = { aditivo: 0, contrato: 1, outro: 2 };
const PESO_FORMA: Record<FormaLeitura, number> = { novo_valor: 0, valor_mensal: 1, mencao: 2 };
const assinado = (d: DocumentoDaEmpresa) => d.assinatura === 'digital' || d.assinatura === 'pelo_nome';

/** Mais recente primeiro; empate: aditivo > contrato, cláusula > menção, assinado > não, arquivo mais novo. */
export function compararDocumentos(a: DocumentoDaEmpresa, b: DocumentoDaEmpresa): number {
  return dataEfetiva(b).localeCompare(dataEfetiva(a))
    || PESO_TIPO[a.tipo] - PESO_TIPO[b.tipo]
    || PESO_FORMA[a.forma ?? 'mencao'] - PESO_FORMA[b.forma ?? 'mencao']
    || Number(assinado(b)) - Number(assinado(a))
    || b.modificadoEm.getTime() - a.modificadoEm.getTime();
}

export function escolherHonorario(docs: DocumentoDaEmpresa[]): Escolha {
  const comValor = docs.filter((d) => d.valor !== null);
  if (!comValor.length) return { documento: null, alertas: [] };

  const alertas = new Set<AlertaHonorario>();

  // Contrato ou aditivo, com o valor na cláusula. Acordo comercial e menção solta só se não houver outro.
  let candidatos = comValor.filter((d) => d.tipo !== 'outro' && d.forma !== 'mencao');
  if (!candidatos.length) candidatos = comValor;

  const semMinuta = candidatos.filter((d) => !d.minuta);
  if (semMinuta.length) candidatos = semMinuta;

  const escolhido = [...candidatos].sort(compararDocumentos)[0];

  if (escolhido.minuta) alertas.add('minuta');
  if (escolhido.tipo === 'outro') alertas.add('acordo_comercial');
  if (escolhido.forma === 'mencao') alertas.add('mencao');
  if (!assinado(escolhido)) alertas.add('sem_assinatura');
  if (escolhido.condicional) alertas.add('valor_condicional');
  if (!escolhido.data) alertas.add('sem_data');

  const mesmaData = candidatos.filter((d) => dataEfetiva(d) === dataEfetiva(escolhido));
  if (mesmaData.some((d) => Math.abs((d.valor ?? 0) - (escolhido.valor ?? 0)) >= 0.005)) {
    alertas.add('valores_diferentes');
  }

  // Contrato (ou aditivo de honorário) mais novo que o escolhido, sem valor lido:
  // pode ser o contrato novo digitalizado. O aditivo anual sem valor (responsável
  // técnico, 13º) não conta.
  const maisNovoSemValor = docs.some((d) =>
    d.valor === null && !d.minuta
    && (d.tipo === 'contrato' || /honor/i.test(d.nome))
    && dataEfetiva(d) > dataEfetiva(escolhido));
  if (maisNovoSemValor) alertas.add('documento_mais_novo_sem_valor');

  return { documento: escolhido, alertas: [...alertas] };
}

export function situacaoDoHonorario(
  docs: DocumentoDaEmpresa[],
  escolha: Escolha,
  temManual: boolean,
): { situacao: SituacaoHonorario; alertas: AlertaHonorario[] } {
  const alertas = [...escolha.alertas];
  const pendentes = docs.some((d) => d.estado === 'pendente');
  if (escolha.documento && pendentes) alertas.push('leitura_incompleta');

  if (temManual) return { situacao: 'MANUAL', alertas };
  if (escolha.documento) {
    const conferir = alertas.some((a) => !ALERTAS_INFORMATIVOS.has(a));
    return { situacao: conferir ? 'CONFERIR' : 'LIDO', alertas };
  }
  if (pendentes) return { situacao: 'AGUARDANDO_LEITURA', alertas };
  if (docs.some((d) => d.estado === 'sem_texto' || d.estado === 'imagem')) return { situacao: 'DIGITALIZADO', alertas };
  if (docs.some((d) => d.estado === 'ok' || d.estado === 'erro')) return { situacao: 'SEM_VALOR', alertas };
  return { situacao: 'SEM_DOCUMENTO', alertas };
}

// ── Comparação com o Acessórias ───────────────────────────────────

export type ComparacaoAcessorias =
  | 'NAO_CONFERIDO'     // ninguém clicou em "Conferir no Acessórias" ainda
  | 'NAO_ENCONTRADA'    // CNPJ não está no Acessórias
  | 'SEM_VALOR_NO_APP'  // nada para comparar
  | 'IGUAL'
  | 'DIFERENTE';

export function compararComAcessorias(
  valorApp: number | null,
  acessorias: { honorario: number | null } | null,
  conferido: boolean,
): ComparacaoAcessorias {
  if (!conferido) return 'NAO_CONFERIDO';
  if (!acessorias) return 'NAO_ENCONTRADA';
  if (valorApp === null) return 'SEM_VALOR_NO_APP';
  return Math.abs((acessorias.honorario ?? 0) - valorApp) < 0.005 ? 'IGUAL' : 'DIFERENTE';
}

/** "1412.00": o formato que o Acessórias aceita (milhar sem separador, decimal com ponto). */
export function formatoAcessorias(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor de honorário inválido.');
  return valor.toFixed(2);
}

export function minutaPeloNome(nome: string): boolean {
  return /minuta|rascunho|modelo/i.test(nome.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

export function acordoComercialPeloNome(nome: string): boolean {
  return /acordo|proposta|or[cç]amento/i.test(nome);
}

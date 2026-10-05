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
  | 'SEM_DOCUMENTO'       // sem pasta vinculada ou sem documento na pasta
  | 'DISTRATO';           // distrato da prestação de serviços: não envia ao Acessórias

export const SITUACOES_HONORARIO: SituacaoHonorario[] = [
  'CONFERIR', 'DIGITALIZADO', 'SEM_VALOR', 'AGUARDANDO_LEITURA', 'SEM_DOCUMENTO', 'LIDO', 'MANUAL', 'DISTRATO',
];

export type AlertaHonorario =
  | 'minuta'                        // só há valor em minuta
  | 'sem_assinatura'                // o documento escolhido não tem assinatura
  | 'mencao'                        // valor achado fora da cláusula de honorário
  | 'acordo_comercial'              // valor de documento que não é contrato nem aditivo
  | 'valor_condicional'             // valor amarrado a faixa de faturamento
  | 'valores_diferentes'            // documentos da mesma data com valores diferentes
  | 'documento_mais_novo_sem_valor' // há contrato/aditivo de honorário mais novo, com texto, sem valor lido
  | 'mais_recente_digitalizado'     // o contrato/aditivo mais recente é foto ou PDF escaneado (sem texto)
  | 'sem_data'                      // sem data no texto: usou a data do arquivo
  | 'documento_sem_cnpj'            // há documento mais novo, sem CNPJ, com outro valor (pasta de grupo?)
  | 'cnpj_diferente'                // o documento escolhido cita outro CNPJ (outra empresa? erro de digitação?)
  | 'documento_depois_do_informado' // chegou documento com outro valor depois do valor informado à mão
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
  /** CNPJs citados no texto (só dígitos, sem o da 041). null = sem texto; [] = texto sem CNPJ. */
  cnpjs?:           string[] | null;
}

/**
 * De quem é o documento, pelos CNPJs do texto. Compara a raiz (8 primeiros dígitos):
 * contrato da matriz vale para a filial e vice-versa.
 *  - 'empresa' : cita o CNPJ desta empresa (ou de outro estabelecimento dela)
 *  - 'outra'   : cita só CNPJ de outra empresa (ex.: outra empresa do grupo na mesma pasta)
 *  - 'sem'     : não cita CNPJ (ou não tem texto)
 */
export function donoDoDocumento(d: Pick<DocumentoDaEmpresa, 'cnpjs'>, cnpjEmpresa: string | null): 'empresa' | 'outra' | 'sem' {
  const digitos = (cnpjEmpresa ?? '').replace(/\D/g, '');
  if (!d.cnpjs?.length || digitos.length !== 14) return 'sem';
  const raiz = digitos.slice(0, 8);
  return d.cnpjs.some((c) => c.startsWith(raiz)) ? 'empresa' : 'outra';
}

export interface Escolha {
  documento: DocumentoDaEmpresa | null;
  alertas:   AlertaHonorario[];
  /** Foto/escaneado mais novo que o documento escolhido (alerta mais_recente_digitalizado). */
  fotoMaisNova?: DocumentoDaEmpresa | null;
}

/** Data usada para ordenar: a do texto; sem ela, a do arquivo. */
export function dataEfetiva(d: DocumentoDaEmpresa): string {
  return d.data ?? d.modificadoEm.toISOString().slice(0, 10);
}

const PESO_TIPO: Record<TipoDocumento, number> = { aditivo: 0, contrato: 1, outro: 2 };
const PESO_FORMA: Record<FormaLeitura, number> = { novo_valor: 0, valor_mensal: 1, mencao: 2 };
const assinado = (d: DocumentoDaEmpresa) => d.assinatura === 'digital' || d.assinatura === 'pelo_nome';

/** Foto ou PDF escaneado: o robô não tem o texto, o valor só se vê abrindo o arquivo. */
export const digitalizado = (d: Pick<DocumentoDaEmpresa, 'estado'>) => d.estado === 'sem_texto' || d.estado === 'imagem';

/** Nome sem extensão, acento, "assinado", "(1)"… para achar a versão escaneada de um Word. */
export function nomeBase(nome: string): string {
  return nome
    .replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(assinad[oa]s?|digitalizad[oa]s?|escanead[oa]s?|scan(ead[oa])?|copia|final)\b/g, ' ')
    .replace(/\(\d+\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Mais recente primeiro; empate: aditivo > contrato, cláusula > menção, assinado > não, arquivo mais novo. */
export function compararDocumentos(a: DocumentoDaEmpresa, b: DocumentoDaEmpresa): number {
  return dataEfetiva(b).localeCompare(dataEfetiva(a))
    || PESO_TIPO[a.tipo] - PESO_TIPO[b.tipo]
    || PESO_FORMA[a.forma ?? 'mencao'] - PESO_FORMA[b.forma ?? 'mencao']
    || Number(assinado(b)) - Number(assinado(a))
    || b.modificadoEm.getTime() - a.modificadoEm.getTime();
}

export function escolherHonorario(docs: DocumentoDaEmpresa[], cnpjEmpresa: string | null = null): Escolha {
  const comValor = docs.filter((d) => d.valor !== null);
  if (!comValor.length) return { documento: null, alertas: [] };

  const alertas = new Set<AlertaHonorario>();

  // Se há documento que cita o CNPJ da empresa, só esses valem: os de outro CNPJ ou sem CNPJ
  // podem ser de outra empresa do grupo ("EMPRESA NOVA - FULANO"). Sem nenhum documento com
  // o CNPJ dela, vale a regra de sempre, mas com alerta se o escolhido cita outro CNPJ: pode
  // ser outra empresa ou erro de digitação no contrato (casos reais DZ PLUS, X ONE EXPRESS).
  const daEmpresa = comValor.filter((d) => donoDoDocumento(d, cnpjEmpresa) === 'empresa');
  const base = daEmpresa.length ? daEmpresa : comValor;

  // Contrato ou aditivo, com o valor na cláusula. Acordo comercial e menção solta só se não houver outro.
  let candidatos = base.filter((d) => d.tipo !== 'outro' && d.forma !== 'mencao');
  if (!candidatos.length) candidatos = base;

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

  // Contrato (ou aditivo de honorário) mais novo que o escolhido, sem valor lido. O aditivo
  // anual sem valor (responsável técnico, 13º) não conta.
  const maisNovoSemValor = docs.some((d) =>
    d.valor === null && !d.minuta && !digitalizado(d)
    && (d.tipo === 'contrato' || /honor/i.test(d.nome))
    && dataEfetiva(d) > dataEfetiva(escolhido));
  if (maisNovoSemValor) alertas.add('documento_mais_novo_sem_valor');

  // Foto ou PDF escaneado mais novo que o escolhido: o valor dele pode ser outro e o robô não
  // tem como ler (caso real BIOOSCARE, 05/10/2026: contrato assinado fotografado, com valor
  // menor). Não conta a versão escaneada de um documento lido ("X.docx" e "X assinado.pdf").
  const lidos = new Set(docs.filter((d) => d.estado === 'ok').map((d) => nomeBase(d.nome)));
  const fotoMaisNova = docs
    .filter((d) =>
      digitalizado(d) && !d.minuta && d.tipo !== 'outro'
      && dataEfetiva(d) > dataEfetiva(escolhido)
      && !lidos.has(nomeBase(d.nome)))
    .sort(compararDocumentos)[0] ?? null;
  if (fotoMaisNova) alertas.add('mais_recente_digitalizado');

  if (donoDoDocumento(escolhido, cnpjEmpresa) === 'outra') alertas.add('cnpj_diferente');

  if (daEmpresa.length) {
    const semCnpjMaisNovo = comValor.some((d) =>
      donoDoDocumento(d, cnpjEmpresa) === 'sem' && d.tipo !== 'outro' && d.forma !== 'mencao'
      && dataEfetiva(d) > dataEfetiva(escolhido)
      && Math.abs((d.valor ?? 0) - (escolhido.valor ?? 0)) >= 0.005);
    if (semCnpjMaisNovo) alertas.add('documento_sem_cnpj');
  }

  return { documento: escolhido, alertas: [...alertas], fotoMaisNova };
}

export function situacaoDoHonorario(
  docs: DocumentoDaEmpresa[],
  escolha: Escolha,
  manual: { valor: number; informadoEm: Date } | null,
): { situacao: SituacaoHonorario; alertas: AlertaHonorario[] } {
  // Valor informado à mão (digitado ou "Acessórias está certo"): uma pessoa já decidiu, os
  // alertas da leitura não contam. Só avisa se chegou documento com outro valor DEPOIS
  // disso (ex.: aditivo de honorário do ano seguinte), pela data do arquivo na pasta.
  if (manual) {
    const novo = docs.some((d) =>
      d.valor !== null && !d.minuta && d.tipo !== 'outro'
      && d.modificadoEm.getTime() > manual.informadoEm.getTime()
      && Math.abs(d.valor - manual.valor) >= 0.005);
    return { situacao: 'MANUAL', alertas: novo ? ['documento_depois_do_informado'] : [] };
  }

  const alertas = [...escolha.alertas];
  const pendentes = docs.some((d) => d.estado === 'pendente');
  if (escolha.documento && pendentes) alertas.push('leitura_incompleta');

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

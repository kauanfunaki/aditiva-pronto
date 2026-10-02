// Auditoria Contratos (Fase 2B) — classificador puro de arquivos.
//
// O coletor só informa metadados. Este módulo interpreta nome, caminho, formato e
// assinatura técnica, preservando evidências contraditórias para revisão humana.

import { semAcentoMaiusculo } from './auditNormalizacao';

export type FormatoContrato = 'word' | 'pdf' | 'imagem' | 'outro';
export type MotivoExclusaoContrato =
  | 'aditivo'
  | 'distrato'
  | 'abertura_empresa'
  | 'alteracao_contratual'
  | 'aluguel_locacao_coworking'
  | 'contrato_social'
  | 'modelo'
  | 'arquivo_sistema'
  | 'nao_parece_contrato';

export interface ArquivoParaClassificarContrato {
  nome:            string;
  caminhoRelativo: string;
  ext:             string;
  modificadoEm:    Date;
  pdfAssinado:     boolean | null;
  pdfMarca:        string | null;
}

export interface EvidenciasAssinatura {
  digital:               boolean;
  peloNome:              boolean;
  explicitamenteAusente: boolean;
  contraditoria:         boolean;
  /** false em PDF cujo conteúdo não pôde ser inspecionado pelo coletor. */
  tecnicaLida:           boolean;
}

export interface ClassificacaoContrato {
  ehContratoServico: boolean;
  motivoExclusao:    MotivoExclusaoContrato | null;
  formato:           FormatoContrato;
  antigo:            boolean;
  minuta:            boolean;
  assinatura:        EvidenciasAssinatura;
  icp:               boolean;
  /** Agrupa somente versões que aparentam ser o mesmo contrato lógico. */
  identidade:        string;
  motivos:           string[];
}

const EXT_WORD = new Set(['.docx', '.doc', '.odt', '.rtf']);
const EXT_IMAGEM = new Set(['.jpg', '.jpeg', '.png', '.jfif', '.tif', '.tiff', '.heic', '.webp', '.bmp']);

export function palavrasContrato(texto: string): string[] {
  return semAcentoMaiusculo(texto).split(/[^A-Z0-9º°ª]+/).filter(Boolean);
}

function formatoDe(ext: string): FormatoContrato {
  const normalizada = ext.toLowerCase();
  if (normalizada === '.pdf') return 'pdf';
  if (EXT_WORD.has(normalizada)) return 'word';
  if (EXT_IMAGEM.has(normalizada)) return 'imagem';
  return 'outro';
}

function contemSequencia(palavras: string[], ...sequencia: string[]): boolean {
  return palavras.some((_, inicio) => sequencia.every((p, i) => palavras[inicio + i] === p));
}

function distanciaEdicao(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(
        linha[j] + 1,
        linha[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/** CONTRATO(S) e erros curtos encontrados na rede, como CONTARTO. */
export function pareceContrato(palavra: string): boolean {
  if (palavra === 'CONTRATO' || palavra === 'CONTRATOS') return true;
  if (!palavra.startsWith('CON') || palavra.length < 6 || palavra.length > 10) return false;
  return distanciaEdicao(palavra, 'CONTRATO') <= 2 || distanciaEdicao(palavra, 'CONTRATOS') <= 2;
}

export function ehNomeArquivoSistema(nome: string): boolean {
  const n = nome.normalize('NFC');
  return n.startsWith('._') || n.startsWith('~$') || /^(THUMBS\.DB|\.DS_STORE|DESKTOP\.INI)$/i.test(n);
}

function detectarExclusao(nome: string, ps: string[], caminhoPs: string[]): MotivoExclusaoContrato | null {
  if (ehNomeArquivoSistema(nome)) return 'arquivo_sistema';
  if (caminhoPs.some((p) => p.startsWith('ADITIV')) || contemSequencia(caminhoPs, 'TERMO', 'ADITIVO')) return 'aditivo';
  if (caminhoPs.some((p) => p.startsWith('DISTRAT'))) return 'distrato';
  if (contemSequencia(ps, 'ABERTURA', 'DE', 'EMPRESA') || contemSequencia(ps, 'ABERTURA', 'EMPRESA')) {
    return 'abertura_empresa';
  }
  if (ps.some((p) => p.startsWith('ALTERACAO')) && ps.some((p) => p.startsWith('CONTRATUAL'))) {
    return 'alteracao_contratual';
  }
  if (ps.some((p) => ['ALUGUEL', 'LOCACAO', 'COWORKING'].includes(p))) return 'aluguel_locacao_coworking';
  if (contemSequencia(ps, 'CONTRATO', 'SOCIAL')) return 'contrato_social';
  if (caminhoPs.some((p) => p === 'MODELO' || p === 'MODELOS')) return 'modelo';
  const contratoExato = ps.some((p) => p === 'CONTRATO' || p === 'CONTRATOS');
  const contratoComErro = ps.some(pareceContrato);
  const sinalDeServico = ps.some((p) => p.startsWith('PREST') || p.startsWith('SERVI'));
  // A tolerância de edição só é suficiente quando o restante do nome também fala
  // de prestação/serviço; assim "CONTATO" não vira contrato por engano.
  if (!contratoExato && !(contratoComErro && sinalDeServico)) return 'nao_parece_contrato';
  return null;
}

export function detectarAssinaturaContrato(
  nome: string,
  formato: FormatoContrato,
  pdfAssinado: boolean | null,
): EvidenciasAssinatura {
  const ps = palavrasContrato(nome);
  const explicitamenteAusente = ps.some((p, i) =>
    (p === 'SEM' || p === 'NAO') &&
    ['ASS', 'ASSINATURA', 'ASSINADO', 'ASSINADA', 'ASSINADOS', 'ASSINADAS'].includes(ps[i + 1]),
  );
  const peloNome = ps.some((p, i) => {
    if (!(p === 'ASS' || /^ASSINAD[OA]S?$/.test(p))) return false;
    return ps[i - 1] !== 'SEM' && ps[i - 1] !== 'NAO';
  });
  const digital = formato === 'pdf' && pdfAssinado === true;

  return {
    digital,
    peloNome,
    explicitamenteAusente,
    contraditoria: digital && explicitamenteAusente,
    tecnicaLida: formato !== 'pdf' || pdfAssinado !== null,
  };
}

/**
 * Retira apenas marcadores de estado/versão. Datas, empresa e subpastas continuam
 * na chave para não juntar contratos diferentes só porque ambos se chamam "contrato".
 */
export function identidadeDoContrato(a: ArquivoParaClassificarContrato): string {
  const segmentos = a.caminhoRelativo.split(/[\\/]/).slice(1);
  const nome = segmentos.pop() ?? a.nome;
  const semExt = nome.toLowerCase().endsWith(a.ext.toLowerCase())
    ? nome.slice(0, -a.ext.length)
    : nome;
  const caminho = [...segmentos, semExt].join(' / ');

  const marcadores = new Set([
    'ASS', 'ASSINADO', 'ASSINADA', 'ASSINADOS', 'ASSINADAS', 'ASSINATURA',
    'SEM', 'NAO', 'DIGITAL', 'MINUTA', 'RASCUNHO', 'FINAL', 'COPIA',
    'NOVO', 'NOVA',
  ]);
  const tokens = palavrasContrato(caminho)
    .filter((p) => !marcadores.has(p))
    .filter((p) => !/^V\d+$/.test(p));
  return tokens.join(' ') || palavrasContrato(semExt).join(' ');
}

export function classificarContrato(a: ArquivoParaClassificarContrato): ClassificacaoContrato {
  const semExt = a.nome.toLowerCase().endsWith(a.ext.toLowerCase())
    ? a.nome.slice(0, -a.ext.length)
    : a.nome;
  const ps = palavrasContrato(semExt);
  const caminhoPs = palavrasContrato(a.caminhoRelativo);
  const motivoExclusao = detectarExclusao(a.nome, ps, caminhoPs);
  const formato = formatoDe(a.ext);
  const assinatura = detectarAssinaturaContrato(semExt, formato, a.pdfAssinado);
  const antigo = caminhoPs.some((p) => ['ANTIGO', 'ANTIGA', 'OLD'].includes(p));
  const minuta = caminhoPs.some((p) => ['MINUTA', 'RASCUNHO'].includes(p));
  const motivos: string[] = [];

  if (!motivoExclusao) motivos.push('nome compatível com contrato de prestação de serviços');
  else motivos.push(`excluído: ${motivoExclusao}`);
  if (antigo) motivos.push('marcado como antigo');
  if (minuta) motivos.push('marcado como minuta ou rascunho');
  if (assinatura.digital) motivos.push('assinatura digital detectada no PDF');
  if (assinatura.peloNome) motivos.push('nome indica arquivo assinado');
  if (assinatura.explicitamenteAusente) motivos.push('nome declara ausência de assinatura');
  if (assinatura.contraditoria) motivos.push('assinatura digital contradiz o nome do arquivo');

  return {
    ehContratoServico: motivoExclusao === null,
    motivoExclusao,
    formato,
    antigo,
    minuta,
    assinatura,
    icp: assinatura.digital && a.pdfMarca === 'icp',
    identidade: identidadeDoContrato(a),
    motivos,
  };
}

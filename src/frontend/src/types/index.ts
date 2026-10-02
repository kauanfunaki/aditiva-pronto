export interface Company {
  id:           string;
  razao_social: string;
  cnpj:         string;
  source_file:  string | null;
  responsavel:  string | null;
  inativo:      number; // 0 = ativa, 1 = inativa
  created_at:   string;
  updated_at:   string;
  // joined
  complement_id?: string | null;
  nome_socio?:    string | null;
  cpf_socio?:     string | null;
}

export interface Complement {
  id?:         string;
  company_id?: string;

  nome_socio:  string;
  cpf_socio:   string;

  endereco_empresa?:  string;
  numero_empresa?:    string;
  bairro_empresa?:    string;
  cidade_empresa?:    string;
  estado_empresa?:    string;
  cep_empresa?:       string;

  nacionalidade_socio?: string;
  estado_civil_socio?:  string;
  profissao_socio?:     string;

  endereco_socio?: string;
  numero_socio?:   string;
  bairro_socio?:   string;
  cidade_socio?:   string;
  estado_socio?:   string;
  cep_socio?:      string;

  contato_administrativo_nome?:      string;
  contato_administrativo_telefone?:  string;
  contato_administrativo_email?:     string;

  contato_financeiro_nome?:      string;
  contato_financeiro_telefone?:  string;
  contato_financeiro_email?:     string;
}

export interface GeneratedDocument {
  id:           string;
  company_id:   string;
  file_name:    string;
  file_path:    string;
  generated_at: string;
  generated_by: string | null;
}

export interface DashboardStats {
  totalCompanies: number;
  withData:       number;
  pending:        number;
  inativos:       number;
  lastFile:       string | null;
  lastSync:       string | null;
  totalDocuments: number;
  docsThisMonth:  number;
}

export interface ListResponse {
  data:  Company[];
  total: number;
  page:  number;
  pages: number;
}

export interface PreviewResponse {
  texto_contratante: string;
  nome_socio:        string;
  razao_social:      string;
  cnpj:              string;
}

export type CompanyStatus = 'all' | 'pending' | 'ready' | 'inativo';

// ── Responsáveis ─────────────────────────────────────────────────────

export interface Responsavel {
  id:         string;
  nome:       string;
  created_at: string;
}

// ── Reports ──────────────────────────────────────────────────────────

export type ReportFormat = 'xlsx' | 'csv';
export type ReportStatus = 'all' | 'pending' | 'ready' | 'inativo';

export interface ReportPayload {
  format:  ReportFormat;
  status:  ReportStatus;
  search?: string;
  fields:  string[];
}

// ── Auditoria (base comum) ───────────────────────────────────────────

export type AuditJobStatus = 'pendente' | 'executando' | 'concluido' | 'erro';

export interface AuditJob {
  id:                string;
  status:            AuditJobStatus;
  origem:            'manual' | 'agendado';
  solicitadoEm:      string;
  iniciadoEm:        string | null;
  concluidoEm:       string | null;
  roboHost:          string | null;
  pastasTotal:       number | null;
  pastasRecebidas:   number;
  arquivosRecebidos: number;
  erro:              string | null;
}

export interface AuditStatus {
  ativo:           AuditJob | null;
  ultimoConcluido: AuditJob | null;
  ultimoErro:      AuditJob | null;
  robo: {
    host:    string;
    versao:  string | null;
    vistoEm: string;
    online:  boolean;
  } | null;
}

export interface AuditEmpresa {
  id:          string;
  razaoSocial: string;
  cnpj:        string;
  inativo?:    boolean;
}

export interface AuditSugestao extends AuditEmpresa {
  similaridade:  number;
  filialConfere: boolean;
}

export type AuditTipoVinculo = 'auto' | 'confirmado' | 'ignorado';

export interface AuditPasta {
  nomePasta:         string;
  subpastasContrato: string[];
  arquivos:          number;
  erro:              string | null;
  vinculo: { tipo: AuditTipoVinculo; empresa: AuditEmpresa | null } | null;
  sugestoes:         AuditSugestao[];
}

export interface AuditEmpresaSemPasta {
  id:          string;
  razaoSocial: string;
  cnpj:        string;
  responsavel: string | null;
  marcada:     boolean;
  motivo:      string | null;
  marcadoEm:   string | null;
  sugestoesDePasta: { nomePasta: string; similaridade: number; filialConfere: boolean }[];
}

export interface AuditPastasResponse {
  job: AuditJob | null;
  resumo: {
    pastas:                   number;
    comSubpastaContrato:      number;
    automaticas:              number;
    confirmadas:              number;
    ignoradas:                number;
    semVinculo:               number;
    empresasAtivas:           number;
    empresasAtivasSemPasta:   number;
    empresasMarcadasSemPasta: number;
  };
  pastas:           AuditPasta[];
  empresasSemPasta: AuditEmpresaSemPasta[];
}

export type AuditAcaoSemPasta =
  | { acao: 'marcar'; companyId: string; motivo?: string }
  | { acao: 'desmarcar'; companyId: string };

export type AuditAcaoVinculo =
  | { acao: 'vincular'; nomePasta: string; companyId: string }
  | { acao: 'ignorar';  nomePasta: string }
  | { acao: 'desfazer'; nomePasta: string };

// ── Auditoria Aditivos (Fase 2A) ─────────────────────────────────────

export type AuditStatusAditivo =
  | 'SEM_VINCULO' | 'SEM_PASTA_CONTRATO' | 'SEM_ADITIVO' | 'SO_DOCX'
  | 'PDF_SEM_ASSINATURA' | 'ASSINADO_PELO_NOME' | 'ASSINADO_DIGITAL' | 'DISTRATO';

// ── Distrato (Aditivos, Contratos e Honorários) ───────────────────
export interface AuditDocumentoDistrato {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  tipo:            'contabil' | 'bpo' | 'social';
  assinado:        boolean;
  assinatura:      string;
  dataFim:         string | null;
  dataDocumento:   string | null;
}

/** efetivo = tira das pendências · desconsiderado = contrato mais novo · avisos = BPO/social. */
export interface AuditDistrato {
  efetivo:        AuditDocumentoDistrato | null;
  desconsiderado: { documento: AuditDocumentoDistrato; contratoMaisNovoEm: string } | null;
  avisos:         AuditDocumentoDistrato[];
}

export type AuditAssinatura = 'digital' | 'pelo_nome' | 'declarada_sem' | 'nenhuma' | 'nao_se_aplica';

export interface AuditArquivoAditivo {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  formato:         'word' | 'pdf' | 'imagem' | 'outro';
  assinatura:      AuditAssinatura;
  icp:             boolean;
  decimoTerceiro:  boolean;
  honorario:       boolean;
  ano:             number;
  anoFonte:        'nome' | 'data_do_arquivo';
  modificadoEm:    string;
}

export interface AuditEmpresaAditivo {
  empresa: { id: string; razaoSocial: string; cnpj: string; responsavel: string | null };
  status:                 AuditStatusAditivo;
  emDia:                  boolean;
  pastas:                 { nomePasta: string; subpastasContrato: string[] }[];
  aditivosDoAno:          AuditArquivoAditivo[];
  outrosAditivos:         AuditArquivoAditivo[];
  ultimoAnoComAditivo:    number | null;
  decimoTerceiro: {
    situacao: Exclude<AuditStatusAditivo, 'SEM_VINCULO' | 'SEM_PASTA_CONTRATO' | 'SEM_ADITIVO' | 'DISTRATO'>;
    assinado: boolean;
    arquivos: AuditArquivoAditivo[];
  } | null;
  geradosNoApp:           number;
  ultimoGeradoNoApp:      string | null;
  alertas:                'gerado_no_app_sem_arquivo'[];
  distrato:               AuditDistrato | null;
}

export interface AuditRelatorioAditivos {
  job:             AuditJob | null;
  anoReferencia:   number;
  anosDisponiveis: number[];
  raizUnc:         string;
  resumo: {
    empresas:              number;
    emDia:                 number;
    porStatus:             Record<AuditStatusAditivo, number>;
    geradoNoAppSemArquivo: number;
    marcadasSemPasta:      number;
    decimoTerceiro:        { empresas: number; assinados: number };
    distratos:             number;
  };
  empresas: AuditEmpresaAditivo[];
}

export interface AuditFiltrosAditivos {
  ano?:         number;
  status?:      AuditStatusAditivo | 'em_dia' | 'pendente';
  responsavel?: string;
  busca?:       string;
  alerta?:      '1';
  decimo?:      'com' | 'pendente';
}

// ── Auditoria Contratos (Fase 2B) ───────────────────────────────────

export type AuditStatusContrato =
  | 'NAO_LOCALIZADO' | 'MINUTA' | 'AGUARDANDO_ASSINATURA' | 'REVISAR' | 'ASSINADO' | 'DISTRATO';

export type AuditMotivoContrato =
  | 'SEM_VINCULO' | 'SEM_PASTA_CONTRATO' | 'SEM_CONTRATO_SERVICO'
  | 'MULTIPLOS_CONTRATOS_ATUAIS' | 'SOMENTE_CONTRATO_ANTIGO'
  | 'CONTRATO_ASSINADO_PELO_NOME' | 'ARQUIVO_NAO_IDENTIFICADO' | 'PDF_NAO_ANALISADO'
  | 'FORMATO_EXIGE_REVISAO' | 'CONTRATO_DIGITAL_ASSINADO'
  | 'PDF_SEM_ASSINATURA' | 'APENAS_MINUTA' | 'DISTRATO_PRESTACAO';

export interface AuditArquivoContrato {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  ext:             string;
  modificadoEm:    string;
  formato:         'word' | 'pdf' | 'imagem' | 'outro';
  antigo:          boolean;
  minuta:          boolean;
  assinatura: {
    digital:               boolean;
    peloNome:              boolean;
    explicitamenteAusente: boolean;
    contraditoria:         boolean;
    tecnicaLida:           boolean;
  };
  icp:             boolean;
  identidade:      string;
  motivos:         string[];
  motivoExclusao:  string | null;
}

export interface AuditPlanoRenomeacao {
  dryRun:          true;
  executar:        false;
  recomendado:     boolean;
  caminhoOriginal: string;
  caminhoDestino:  string | null;
  resultado:       'recomendado' | 'ja_padronizado' | 'destino_existente';
}

export interface AuditEmpresaContrato {
  empresa: { id: string; razaoSocial: string; cnpj: string; responsavel: string | null };
  status:            AuditStatusContrato;
  emDia:             boolean;
  motivo:            AuditMotivoContrato;
  pastas:            { nomePasta: string; subpastasContrato: string[] }[];
  contratos:         AuditArquivoContrato[];
  descartados:       AuditArquivoContrato[];
  contratoPrincipal: AuditArquivoContrato | null;
  warnings:          string[];
  renomeacao:        AuditPlanoRenomeacao | null;
  distrato:          AuditDistrato | null;
}

export interface AuditRelatorioContratos {
  job:     AuditJob | null;
  raizUnc: string;
  resumo: {
    empresas:  number;
    emDia:     number;
    revisar:   number;
    marcadasSemPasta: number;
    porStatus: Record<AuditStatusContrato, number>;
    distratos: number;
  };
  empresas: AuditEmpresaContrato[];
}

export interface AuditFiltrosContratos {
  status?:      AuditStatusContrato | 'em_dia' | 'pendente' | 'assinado_digital' | 'assinado_pelo_nome';
  responsavel?: string;
  busca?:       string;
}

// ── Sessão ────────────────────────────────────────────────────────
/** Conta compartilhada do setor (Societário, Controladoria). */
export interface UsuarioLogado {
  id:    string;
  login: string;
  nome:  string;
}

// ── Honorários (leitura dos documentos e Acessórias) ──────────────
export type SituacaoHonorario =
  | 'MANUAL' | 'LIDO' | 'CONFERIR' | 'AGUARDANDO_LEITURA' | 'DIGITALIZADO' | 'SEM_VALOR' | 'SEM_DOCUMENTO' | 'DISTRATO';

export type AlertaHonorario =
  | 'minuta' | 'sem_assinatura' | 'mencao' | 'acordo_comercial' | 'valor_condicional'
  | 'valores_diferentes' | 'documento_mais_novo_sem_valor' | 'sem_data' | 'leitura_incompleta';

export type ComparacaoAcessorias = 'NAO_CONFERIDO' | 'NAO_ENCONTRADA' | 'SEM_VALOR_NO_APP' | 'IGUAL' | 'DIFERENTE';

export interface HonorarioDocumento {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  tipo:            'contrato' | 'aditivo' | 'outro';
  data:            string | null;
  modificadoEm:    string;
  estado:          'ok' | 'sem_texto' | 'erro' | 'pendente' | 'imagem';
  assinatura:      string;
  minuta:          boolean;
  valor:           number | null;
  adicional:       number | null;
  forma:           'novo_valor' | 'valor_mensal' | 'mencao' | null;
  trecho:          string | null;
}

export interface HonorarioEmpresa {
  empresa:    { id: string; razaoSocial: string; cnpj: string; responsavel: string | null };
  situacao:   SituacaoHonorario;
  alertas:    AlertaHonorario[];
  valor:      number | null;
  fonte:      'manual' | 'documento' | null;
  documento:  HonorarioDocumento | null;
  manual:     { valor: number; documento: string | null; observacao: string | null; informadoPor: string; informadoEm: string } | null;
  documentos: HonorarioDocumento[];
  acessorias: { comparacao: ComparacaoAcessorias; valor: number | null; identificador: string | null; situacao: string | null };
  ultimoEnvio: { enviadoEm: string; conta: string; valorEnviado: number; status: 'ok' | 'erro'; erro: string | null } | null;
  distrato:    AuditDistrato | null;
}

export interface RelatorioHonorarios {
  job:     AuditJob | null;
  raizUnc: string;
  resumo: {
    empresas:    number;
    porSituacao: Record<SituacaoHonorario, number>;
    comValor:    number;
    textos:      { documentos: number; lidos: number; pendentes: number; semTexto: number };
    acessorias:  { conferidoEm: string | null; iguais: number; diferentes: number; naoEncontradas: number };
  };
  empresas: HonorarioEmpresa[];
}

export interface ResultadoEnvioAcessorias {
  companyId:     string;
  razao:         string;
  status:        'ok' | 'erro' | 'ignorado';
  mensagem:      string;
  outrosCampos?: string[];
}

export interface OperacaoAcessorias {
  tipo:        'conferir' | 'enviar_lote';
  conta:       string;
  executando:  boolean;
  iniciadaEm:  string;
  concluidaEm: string | null;
  total:       number | null;
  feitos:      number;
  erros:       number;
  mensagem:    string | null;
  resultados:  ResultadoEnvioAcessorias[];
}

export interface EstadoAcessorias {
  configurado:       boolean;
  operacao:          OperacaoAcessorias | null;
  envioLoteLiberado: boolean;
  bloqueio: {
    id: string; companyId: string; razaoSocial: string; enviadoEm: string; conta: string;
    outrosCampos: string[]; fichaAntes: Record<string, unknown> | null; fichaDepois: Record<string, unknown> | null;
  } | null;
}

export interface EnvioAcessorias {
  id:            string;
  companyId:     string;
  razaoSocial:   string;
  cnpj:          string;
  valorAnterior: number | null;
  valorEnviado:  number;
  fonte:         'documento' | 'manual';
  conta:         string;
  status:        'ok' | 'erro';
  erro:          string | null;
  outrosCampos:  string[] | null;
  enviadoEm:     string;
  conferidoEm:   string | null;
  conferidoPor:  string | null;
}

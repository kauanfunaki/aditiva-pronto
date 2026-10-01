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

export interface AuditPastasResponse {
  job: AuditJob | null;
  resumo: {
    pastas:                 number;
    comSubpastaContrato:    number;
    automaticas:            number;
    confirmadas:            number;
    ignoradas:              number;
    semVinculo:             number;
    empresasAtivas:         number;
    empresasAtivasSemPasta: number;
  };
  pastas: AuditPasta[];
}

export type AuditAcaoVinculo =
  | { acao: 'vincular'; nomePasta: string; companyId: string }
  | { acao: 'ignorar';  nomePasta: string }
  | { acao: 'desfazer'; nomePasta: string };

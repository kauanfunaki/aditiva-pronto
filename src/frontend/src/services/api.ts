import axios, { type AxiosError } from 'axios';
import { CHAVE_SESSAO, queryClient } from './queryClient';
import type {
  Company, Complement, GeneratedDocument,
  DashboardStats, ListResponse, PreviewResponse, CompanyStatus,
  ReportPayload, Responsavel,
  AuditStatus, AuditJob, AuditPastasResponse, AuditAcaoVinculo, AuditAcaoSemPasta,
  AuditRelatorioAditivos, AuditFiltrosAditivos,
  AuditRelatorioContratos, AuditFiltrosContratos,
  UsuarioLogado,
  RelatorioHonorarios, EstadoAcessorias, OperacaoAcessorias, ResultadoEnvioAcessorias, EnvioAcessorias,
} from '../types';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
  timeout: 60_000,
});

/** Erro da API com o status HTTP (401 = sessão terminou). */
export class ErroApi extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ErroApi';
  }
}

// Extrai a mensagem real do JSON de erro, mesmo quando responseType é 'blob'
http.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const data   = err.response?.data;
    const status = err.response?.status;

    // Sessão terminou no meio do uso: volta para a tela de login.
    if (status === 401 && !err.config?.url?.startsWith('/auth/')) {
      queryClient.setQueryData(CHAVE_SESSAO, null);
    }

    // Quando responseType='blob', erros chegam como Blob — precisa ler como texto
    if (data instanceof Blob && data.type.includes('json')) {
      try {
        const text = await data.text();
        const json = JSON.parse(text) as { error?: string };
        return Promise.reject(new ErroApi(json.error ?? err.message, status));
      } catch {
        return Promise.reject(new ErroApi(err.message, status));
      }
    }

    const apiError = (data as { error?: string } | undefined)?.error;
    return Promise.reject(new ErroApi(apiError ?? err.message, status));
  },
);

// ── Sessão ──────────────────────────────────────────────────────
/** Conta logada, ou null se não há sessão. */
export async function getSessao(): Promise<UsuarioLogado | null> {
  try {
    return (await http.get<{ usuario: UsuarioLogado }>('/auth/me')).data.usuario;
  } catch (e) {
    if (e instanceof ErroApi && e.status === 401) return null;
    throw e;
  }
}

export const entrar = (login: string, senha: string) =>
  http.post<{ usuario: UsuarioLogado }>('/auth/login', { login, senha }).then((r) => r.data.usuario);

export const sair = () => http.post('/auth/logout').then(() => undefined);

// ── Health ──────────────────────────────────────────────────────
export const getHealth = () =>
  http.get<{ status: string }>('/health').then((r) => r.data);

// ── Dashboard ───────────────────────────────────────────────────
export const getStats = () =>
  http.get<DashboardStats>('/stats').then((r) => r.data);

// ── Import ──────────────────────────────────────────────────────
export function importFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return http
    .post('/import/companies', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
}

export const syncFromDir = () => http.post('/import/sync').then((r) => r.data);

// ── Companies ───────────────────────────────────────────────────
export function listCompanies(params: {
  search?:      string;
  status?:      CompanyStatus;
  page?:        number;
  limit?:       number;
  /** undefined = sem filtro | '__none__' = sem responsável | nome = filtrar pelo nome */
  responsavel?: string;
}) {
  return http.get<ListResponse>('/companies', { params }).then((r) => r.data);
}

export function updateResponsavel(id: string, responsavel: string | null) {
  return http
    .patch<{ message: string }>(`/companies/${id}/responsavel`, { responsavel })
    .then((r) => r.data);
}

export function bulkUpdateResponsavelApi(ids: string[], responsavel: string | null) {
  return http
    .patch<{ message: string; affected: number }>('/companies/bulk/responsavel', { ids, responsavel })
    .then((r) => r.data);
}

export function updateCompanyStatus(id: string, inativo: boolean) {
  return http
    .patch<{ message: string }>(`/companies/${id}/status`, { inativo })
    .then((r) => r.data);
}

export function getCompany(id: string) {
  return http
    .get<{ company: Company; complement: Complement | null; documents: GeneratedDocument[] }>(
      `/companies/${id}`,
    )
    .then((r) => r.data);
}

export function saveComplement(id: string, data: Complement) {
  return http
    .put<{ id: string; message: string }>(`/companies/${id}/complement`, data)
    .then((r) => r.data);
}

export function getPreview(id: string) {
  return http.get<PreviewResponse>(`/companies/${id}/preview`).then((r) => r.data);
}

// Gera o DOCX e retorna o blob + nome do arquivo para download imediato
export async function generateDocxBlob(id: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await http.post(`/companies/${id}/generate-docx`, null, {
    responseType: 'blob',
  });

  // Extrai nome do arquivo do header Content-Disposition
  const contentDisp = response.headers['content-disposition'] as string | undefined;
  const match = contentDisp?.match(/filename="([^"]+)"/);
  const rawName = match?.[1] ? decodeURIComponent(match[1]) : 'Termo_Aditivo.docx';

  return { blob: response.data as Blob, fileName: rawName };
}

// Dispara download de um Blob no navegador
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href      = url;
  a.download  = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Documents ───────────────────────────────────────────────────
export function getDocuments(id: string) {
  return http.get<GeneratedDocument[]>(`/companies/${id}/documents`).then((r) => r.data);
}

export function downloadUrl(docId: string) {
  return `${http.defaults.baseURL}/documents/${docId}/download`;
}

// ── Responsáveis ────────────────────────────────────────────────────
export const listResponsaveis = () =>
  http.get<Responsavel[]>('/responsaveis').then((r) => r.data);

export const createResponsavel = (nome: string) =>
  http.post<{ id: string; message: string }>('/responsaveis', { nome }).then((r) => r.data);

export const renameResponsavel = (id: string, nome: string) =>
  http.patch<{ message: string }>(`/responsaveis/${id}`, { nome }).then((r) => r.data);

export const deleteResponsavelApi = (id: string) =>
  http.delete<{ message: string }>(`/responsaveis/${id}`).then((r) => r.data);

// ── Auditoria (base comum) ──────────────────────────────────────
export const getAuditStatus = () =>
  http.get<AuditStatus>('/audit/status').then((r) => r.data);

export const requestAuditSync = () =>
  http.post<{ job: AuditJob; criado: boolean }>('/audit/sync').then((r) => r.data);

export const listAuditFolders = () =>
  http.get<AuditPastasResponse>('/audit/folders').then((r) => r.data);

export const updateAuditFolderLink = (payload: AuditAcaoVinculo) =>
  http.put<{ message: string }>('/audit/folders/link', payload).then((r) => r.data);

export const updateAuditEmpresaSemPasta = (payload: AuditAcaoSemPasta) =>
  http.put<{ message: string }>('/audit/companies/sem-pasta', payload).then((r) => r.data);

// ── Auditoria Aditivos ──────────────────────────────────────────
export const getAuditAditivos = (ano: number) =>
  http.get<AuditRelatorioAditivos>('/audit/aditivos', { params: { ano } }).then((r) => r.data);

export async function exportAuditAditivos(filtros: AuditFiltrosAditivos): Promise<void> {
  const response = await http.get('/audit/aditivos/export', { params: filtros, responseType: 'blob' });
  const contentDisp = response.headers['content-disposition'] as string | undefined;
  const match       = contentDisp?.match(/filename="([^"]+)"/);
  const fileName    = match?.[1] ? decodeURIComponent(match[1]) : `auditoria_aditivos_${filtros.ano ?? ''}.xlsx`;
  triggerBlobDownload(response.data as Blob, fileName);
}

// ── Auditoria Contratos ─────────────────────────────────────────
export const getAuditContratos = () =>
  http.get<AuditRelatorioContratos>('/audit/contratos').then((r) => r.data);

export async function exportAuditContratos(filtros: AuditFiltrosContratos): Promise<void> {
  const response = await http.get('/audit/contratos/export', { params: filtros, responseType: 'blob' });
  const contentDisp = response.headers['content-disposition'] as string | undefined;
  const match = contentDisp?.match(/filename="([^"]+)"/);
  const fileName = match?.[1] ? decodeURIComponent(match[1]) : 'auditoria_contratos.xlsx';
  triggerBlobDownload(response.data as Blob, fileName);
}

// ── Reports ─────────────────────────────────────────────────────
export async function exportCompaniesReport(
  payload: ReportPayload,
): Promise<void> {
  const response = await http.post('/reports/companies/export', payload, {
    responseType: 'blob',
  });

  // Extrai nome do arquivo do header Content-Disposition
  const contentDisp = response.headers['content-disposition'] as string | undefined;
  const match       = contentDisp?.match(/filename="([^"]+)"/);
  const rawName     = match?.[1]
    ? decodeURIComponent(match[1])
    : `clientes_exportados.${payload.format}`;

  triggerBlobDownload(response.data as Blob, rawName);
}

// ── Honorários ──────────────────────────────────────────────────
export const getHonorarios = () =>
  http.get<RelatorioHonorarios>('/honorarios', { timeout: 120_000 }).then((r) => r.data);

export const informarHonorario = (companyId: string, d: { valor: number; documento?: string; observacao?: string }) =>
  http.put(`/honorarios/${companyId}/manual`, d).then((r) => r.data);

/** "Acessórias está certo": o valor do Acessórias passa a valer e a leitura da pasta fica de lado. */
export const confirmarAcessoriasCerto = (companyId: string, d: { valorEsperado: number; observacao?: string }) =>
  http.post<{ message: string; valor: number }>(`/honorarios/${companyId}/acessorias-certo`, d).then((r) => r.data);

export const removerHonorarioInformado = (companyId: string) =>
  http.delete(`/honorarios/${companyId}/manual`).then((r) => r.data);

export const getEstadoAcessorias = () =>
  http.get<EstadoAcessorias>('/honorarios/acessorias').then((r) => r.data);

export const conferirAcessorias = () =>
  http.post<OperacaoAcessorias>('/honorarios/acessorias/conferir').then((r) => r.data);

export const enviarHonorario = (companyId: string, valorEsperado: number) =>
  http.post<ResultadoEnvioAcessorias>('/honorarios/acessorias/enviar', { companyId, valorEsperado }, { timeout: 120_000 })
    .then((r) => r.data);

export const enviarHonorariosLote = (itens: { companyId: string; valorEsperado: number }[]) =>
  http.post<OperacaoAcessorias>('/honorarios/acessorias/enviar-lote', { itens }, { timeout: 120_000 }).then((r) => r.data);

export const getEnviosAcessorias = (limite = 50) =>
  http.get<{ data: EnvioAcessorias[] }>('/honorarios/acessorias/envios', { params: { limite } }).then((r) => r.data.data);

export const liberarEnviosAcessorias = (envioId: string) =>
  http.post(`/honorarios/acessorias/envios/${envioId}/conferido`).then((r) => r.data);

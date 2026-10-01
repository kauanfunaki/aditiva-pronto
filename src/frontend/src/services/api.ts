import axios, { type AxiosError } from 'axios';
import type {
  Company, Complement, GeneratedDocument,
  DashboardStats, ListResponse, PreviewResponse, CompanyStatus,
  ReportPayload, Responsavel,
  AuditStatus, AuditJob, AuditPastasResponse, AuditAcaoVinculo,
  AuditRelatorioAditivos, AuditFiltrosAditivos,
} from '../types';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
  timeout: 60_000,
});

// Extrai a mensagem real do JSON de erro, mesmo quando responseType é 'blob'
http.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const data = err.response?.data;

    // Quando responseType='blob', erros chegam como Blob — precisa ler como texto
    if (data instanceof Blob && data.type.includes('json')) {
      try {
        const text = await data.text();
        const json = JSON.parse(text) as { error?: string };
        return Promise.reject(new Error(json.error ?? err.message));
      } catch {
        return Promise.reject(new Error(err.message));
      }
    }

    const apiError = (data as { error?: string } | undefined)?.error;
    return Promise.reject(new Error(apiError ?? err.message));
  },
);

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

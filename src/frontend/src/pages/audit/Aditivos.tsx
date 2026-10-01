import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MagnifyingGlass, X, FileXls, CaretDown, CaretRight, Copy, SealCheck, Signature,
  FileDoc, FilePdf, FileImage, File, WarningCircle, FolderSimpleDashed,
} from '@phosphor-icons/react';
import { getAuditAditivos, exportAuditAditivos, listResponsaveis } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { maskCNPJ } from '../../utils/validators';
import { SyncBar } from '../../components/audit/SyncBar';
import type {
  AuditArquivoAditivo, AuditEmpresaAditivo, AuditFiltrosAditivos, AuditStatusAditivo,
} from '../../types';

// Auditoria de aditivos (Fase 2A): para cada empresa ativa, se o termo aditivo do ano
// de referência está na pasta de rede e em que estado. Regras em
// src/backend/src/services/auditAditivosStatus.ts (decisões 3, 4 e 5 do plano).

const ANO_ATUAL = new Date().getFullYear();
const PASSO = 100;

const STATUS: { id: AuditStatusAditivo; rotulo: string; classe: string }[] = [
  { id: 'SEM_VINCULO',        rotulo: 'Sem pasta vinculada',      classe: 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300' },
  { id: 'SEM_PASTA_CONTRATO', rotulo: 'Sem subpasta de contrato', classe: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
  { id: 'SEM_ADITIVO',        rotulo: 'Sem aditivo do ano',       classe: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  { id: 'SO_DOCX',            rotulo: 'Só o Word',                classe: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  { id: 'PDF_SEM_ASSINATURA', rotulo: 'PDF sem assinatura',       classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  { id: 'ASSINADO_PELO_NOME', rotulo: 'Assinado (pelo nome)',     classe: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300' },
  { id: 'ASSINADO_DIGITAL',   rotulo: 'Assinado digitalmente',    classe: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
];
const STATUS_POR_ID = Object.fromEntries(STATUS.map((s) => [s.id, s])) as Record<AuditStatusAditivo, (typeof STATUS)[number]>;

const ROTULO_ASSINATURA: Record<string, string> = {
  digital:       'Assinatura digital',
  pelo_nome:     'Assinado (pelo nome)',
  declarada_sem: '"Sem assinatura" no nome',
  nenhuma:       'Sem assinatura',
  nao_se_aplica: 'Word (rascunho)',
};

type FiltroStatus = NonNullable<AuditFiltrosAditivos['status']>;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function passa(e: AuditEmpresaAditivo, status: FiltroStatus | '', responsavel: string, busca: string, soAlerta: boolean) {
  if (soAlerta && !e.alertas.length) return false;
  if (status === 'em_dia' && !e.emDia) return false;
  if (status === 'pendente' && e.emDia) return false;
  if (status && status !== 'em_dia' && status !== 'pendente' && e.status !== status) return false;
  if (responsavel === '__none__' && e.empresa.responsavel) return false;
  if (responsavel && responsavel !== '__none__' && e.empresa.responsavel !== responsavel) return false;
  if (busca) {
    const t = semAcento(busca);
    const d = busca.replace(/\D/g, '');
    const ok = semAcento(e.empresa.razaoSocial).includes(t)
      || e.pastas.some((p) => semAcento(p.nomePasta).includes(t))
      || (d.length >= 3 && e.empresa.cnpj.replace(/\D/g, '').includes(d));
    if (!ok) return false;
  }
  return true;
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export default function Aditivos() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const ano         = Number(params.get('ano')) || ANO_ATUAL;
  const status      = (params.get('status') ?? '') as FiltroStatus | '';
  const responsavel = params.get('responsavel') ?? '';
  const busca       = params.get('busca') ?? '';
  const soAlerta    = params.get('alerta') === '1';

  const [limite, setLimite]       = useState(PASSO);
  const [abertas, setAbertas]     = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit', 'aditivos', ano],
    queryFn:  () => getAuditAditivos(ano),
  });

  const { data: responsaveis } = useQuery({
    queryKey: ['responsaveis'],
    queryFn:  listResponsaveis,
    staleTime: 60_000,
  });

  function setParam(chave: string, valor: string | null) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (valor) next.set(chave, valor);
      else next.delete(chave);
      return next;
    }, { replace: true });
    setLimite(PASSO);
  }

  const visiveis = useMemo(
    () => (data?.empresas ?? []).filter((e) => passa(e, status, responsavel, busca.trim(), soAlerta)),
    [data, status, responsavel, busca, soAlerta],
  );

  function alternar(id: string) {
    setAbertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copiarCaminho(e: AuditEmpresaAditivo) {
    if (!data) return;
    const p = e.pastas.find((x) => x.subpastasContrato.length) ?? e.pastas[0];
    if (!p) return;
    const caminho = [data.raizUnc, p.nomePasta, p.subpastasContrato[0]].filter(Boolean).join('\\');
    toast((await copiar(caminho)) ? 'Caminho copiado. Cole no Explorador de Arquivos.' : 'Não foi possível copiar o caminho.',
      'info');
  }

  async function exportar() {
    setExportando(true);
    try {
      await exportAuditAditivos({
        ano,
        status:      status || undefined,
        responsavel: responsavel || undefined,
        busca:       busca.trim() || undefined,
        alerta:      soAlerta ? '1' : undefined,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao exportar.', 'error');
    } finally {
      setExportando(false);
    }
  }

  const r = data?.resumo;
  const pctEmDia = r && r.empresas ? Math.round((r.emDia / r.empresas) * 100) : 0;
  const chips: { id: FiltroStatus | ''; rotulo: string; qtd: number }[] = r
    ? [
        { id: '',         rotulo: 'Todas',     qtd: r.empresas },
        { id: 'pendente', rotulo: 'Pendentes', qtd: r.empresas - r.emDia },
        { id: 'em_dia',   rotulo: 'Em dia',    qtd: r.emDia },
        ...STATUS.map((s) => ({ id: s.id, rotulo: s.rotulo, qtd: r.porStatus[s.id] })),
      ]
    : [];

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Auditoria de aditivos</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5 max-w-3xl">
            Para cada empresa ativa, se o termo aditivo de {ano} está na pasta de rede e em que estado.
            Conta como em dia o aditivo assinado digitalmente ou com “assinado” no nome. O termo de 13º
            sozinho não fecha a pendência.
          </p>
        </div>
        <button
          type="button"
          className="btn-outline shrink-0 min-h-[44px]"
          onClick={exportar}
          disabled={exportando || !data?.job}
        >
          <FileXls size={16} aria-hidden />
          {exportando ? 'Exportando…' : 'Exportar XLSX'}
        </button>
      </div>

      <SyncBar />

      {isLoading ? (
        <div className="card text-sm text-gray-500 dark:text-zinc-400">Carregando auditoria…</div>
      ) : isError ? (
        <div className="card text-sm text-red-700 dark:text-red-300">
          Não foi possível carregar a auditoria: {(error as Error).message}
        </div>
      ) : !data?.job || !r ? (
        <div className="card flex flex-col items-center text-center gap-2 py-12">
          <FolderSimpleDashed size={40} className="text-gray-300 dark:text-zinc-600" aria-hidden />
          <p className="font-medium text-gray-800 dark:text-zinc-200">Nenhuma sincronização concluída ainda</p>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-md">
            Assim que o robô terminar a primeira varredura das pastas, o relatório aparece aqui.
          </p>
        </div>
      ) : (
        <>
          {/* ── Resumo ── */}
          <div className="card p-5 mb-4">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <p className="text-gray-800 dark:text-zinc-200">
                <span className="text-3xl font-bold tabular-nums">{r.emDia.toLocaleString('pt-BR')}</span>
                <span className="text-sm text-gray-500 dark:text-zinc-400"> de {r.empresas.toLocaleString('pt-BR')} empresas em dia com o aditivo de {ano}</span>
              </p>
              <span className="text-2xl font-semibold tabular-nums text-gray-700 dark:text-zinc-300">{pctEmDia}%</span>
            </div>
            <div
              className="h-2 w-full rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden"
              role="progressbar" aria-label="Empresas em dia" aria-valuemin={0} aria-valuemax={r.empresas} aria-valuenow={r.emDia}
            >
              <div className="h-full bg-green-600 dark:bg-green-500" style={{ width: `${pctEmDia}%` }} />
            </div>
            {r.geradoNoAppSemArquivo > 0 && (
              <button
                type="button"
                onClick={() => setParam('alerta', soAlerta ? null : '1')}
                aria-pressed={soAlerta}
                className={`mt-3 inline-flex items-center gap-1.5 text-sm rounded-md px-2 py-1 min-h-[36px] ${
                  soAlerta
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                    : 'text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                }`}
              >
                <WarningCircle size={16} weight="fill" aria-hidden />
                {r.geradoNoAppSemArquivo} empresa(s) com aditivo gerado no app em {ano} que não está na pasta
                {soAlerta ? ' · mostrando só elas' : ''}
              </button>
            )}
          </div>

          {/* ── Filtros ── */}
          <div className="flex flex-wrap gap-1 mb-3" role="group" aria-label="Filtrar por status">
            {chips.map((c) => (
              <button
                key={c.id || 'todas'}
                type="button"
                aria-pressed={status === c.id}
                onClick={() => setParam('status', c.id || null)}
                className={`px-3 py-1.5 min-h-[36px] rounded-md text-sm font-medium border transition-colors ${
                  status === c.id
                    ? 'bg-brand-50 border-brand-300 text-brand-800 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-200'
                    : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                {c.rotulo} <span className="tabular-nums text-gray-500 dark:text-zinc-400">{c.qtd}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="flex items-center gap-2">
              <label htmlFor="ano-ref" className="text-sm text-gray-500 dark:text-zinc-400 whitespace-nowrap">Ano:</label>
              <select
                id="ano-ref"
                className="input py-1.5 min-h-[40px]"
                value={ano}
                onChange={(e) => setParam('ano', e.target.value === String(ANO_ATUAL) ? null : e.target.value)}
              >
                {data.anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="resp" className="text-sm text-gray-500 dark:text-zinc-400 whitespace-nowrap">Responsável:</label>
              <select
                id="resp"
                className="input py-1.5 min-h-[40px]"
                value={responsavel}
                onChange={(e) => setParam('responsavel', e.target.value || null)}
              >
                <option value="">Todos</option>
                {(responsaveis ?? []).map((x) => <option key={x.id} value={x.nome}>{x.nome}</option>)}
                <option value="__none__">Sem responsável</option>
              </select>
            </div>
            <div className="relative flex-1">
              <label htmlFor="busca-aditivo" className="sr-only">Buscar empresa, CNPJ ou pasta</label>
              <MagnifyingGlass size={16} aria-hidden
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none" />
              <input
                id="busca-aditivo"
                className="input pl-9 pr-9 min-h-[40px]"
                placeholder="Buscar empresa, CNPJ ou pasta…"
                value={busca}
                onChange={(e) => setParam('busca', e.target.value || null)}
              />
              {busca && (
                <button type="button" onClick={() => setParam('busca', null)} aria-label="Limpar busca"
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300">
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-500 dark:text-zinc-400 mb-2" aria-live="polite">
            {visiveis.length.toLocaleString('pt-BR')} empresa(s)
          </p>

          {/* ── Tabela ── */}
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Situação do termo aditivo de {ano} por empresa</caption>
              <thead className="border-b border-gray-100 dark:border-zinc-800 text-left">
                <tr>
                  <th scope="col" className="table-head w-8"><span className="sr-only">Detalhes</span></th>
                  <th scope="col" className="table-head">Empresa</th>
                  <th scope="col" className="table-head">Situação</th>
                  <th scope="col" className="table-head text-right">Aditivos de {ano}</th>
                  <th scope="col" className="table-head text-right">Gerados no app</th>
                  <th scope="col" className="table-head"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-gray-500 dark:text-zinc-400">
                      Nenhuma empresa neste filtro.
                    </td>
                  </tr>
                )}
                {visiveis.slice(0, limite).map((e) => {
                  const aberta = abertas.has(e.empresa.id);
                  const temArquivos = e.aditivosDoAno.length + e.outrosAditivos.length > 0;
                  return (
                    <Fragment key={e.empresa.id}>
                      <tr className="border-b border-gray-50 dark:border-zinc-800 align-top">
                        <td className="pl-3 py-3">
                          {temArquivos && (
                            <button
                              type="button"
                              onClick={() => alternar(e.empresa.id)}
                              aria-expanded={aberta}
                              aria-label={`${aberta ? 'Esconder' : 'Ver'} arquivos de ${e.empresa.razaoSocial}`}
                              className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                              {aberta ? <CaretDown size={14} aria-hidden /> : <CaretRight size={14} aria-hidden />}
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900 dark:text-zinc-100">{e.empresa.razaoSocial}</p>
                          <p className="text-xs text-gray-500 dark:text-zinc-400">
                            <span className="font-mono">{maskCNPJ(e.empresa.cnpj)}</span>
                            {e.empresa.responsavel && <> · {e.empresa.responsavel}</>}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_POR_ID[e.status].classe}`}>
                            {e.status === 'ASSINADO_DIGITAL' && <SealCheck size={12} weight="fill" aria-hidden />}
                            {e.status === 'ASSINADO_PELO_NOME' && <Signature size={12} aria-hidden />}
                            {STATUS_POR_ID[e.status].rotulo}
                          </span>
                          <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-zinc-400">
                            {!e.emDia && e.ultimoAnoComAditivo && e.ultimoAnoComAditivo !== ano && (
                              <p>Último aditivo encontrado: {e.ultimoAnoComAditivo}</p>
                            )}
                            {!e.emDia && e.temDecimoTerceiroDoAno && <p>Tem só o termo de 13º em {ano}</p>}
                            {e.alertas.includes('gerado_no_app_sem_arquivo') && (
                              <p className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
                                <WarningCircle size={12} weight="fill" aria-hidden /> Gerado no app, mas não está na pasta
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-700 dark:text-zinc-300">{e.aditivosDoAno.length}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-700 dark:text-zinc-300">{e.geradosNoApp}</td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end">
                            {e.pastas.length ? (
                              <button type="button" className="btn-outline min-h-[44px] px-3 py-1.5 whitespace-nowrap"
                                onClick={() => copiarCaminho(e)}
                                title="Copia o caminho da pasta do contrato para colar no Explorador de Arquivos">
                                <Copy size={14} aria-hidden /> Copiar caminho
                              </button>
                            ) : (
                              <Link to="/auditoria/pastas" className="btn-outline min-h-[44px] px-3 py-1.5 whitespace-nowrap">
                                Vincular pasta
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                      {aberta && (
                        <tr className="border-b border-gray-50 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/60">
                          <td />
                          <td colSpan={5} className="px-5 py-3">
                            <ListaArquivos titulo={`Aditivos que valem para ${ano}`} arquivos={e.aditivosDoAno} />
                            {e.outrosAditivos.length > 0 && (
                              <ListaArquivos titulo="Outros aditivos (outros anos ou só 13º)" arquivos={e.outrosAditivos} apagado />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {visiveis.length > limite && (
            <div className="mt-4 flex justify-center">
              <button type="button" className="btn-outline min-h-[44px]" onClick={() => setLimite((l) => l + PASSO)}>
                Mostrar mais ({visiveis.length - limite} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function IconeFormato({ formato }: { formato: AuditArquivoAditivo['formato'] }) {
  const p = { size: 16, 'aria-hidden': true } as const;
  if (formato === 'pdf')    return <FilePdf {...p} className="text-red-600 dark:text-red-400 shrink-0" />;
  if (formato === 'word')   return <FileDoc {...p} className="text-blue-600 dark:text-blue-400 shrink-0" />;
  if (formato === 'imagem') return <FileImage {...p} className="text-purple-600 dark:text-purple-400 shrink-0" />;
  return <File {...p} className="text-gray-500 shrink-0" />;
}

function ListaArquivos({ titulo, arquivos, apagado = false }: {
  titulo: string; arquivos: AuditArquivoAditivo[]; apagado?: boolean;
}) {
  return (
    <div className={apagado ? 'mt-3 opacity-75' : ''}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1">{titulo}</p>
      {arquivos.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-zinc-400">Nenhum.</p>
      ) : (
        <ul className="space-y-1">
          {arquivos.map((a) => (
            <li key={`${a.nomePasta}/${a.caminhoRelativo}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <IconeFormato formato={a.formato} />
              <span className="text-gray-900 dark:text-zinc-100 break-all">{a.caminhoRelativo}</span>
              <span className="text-xs text-gray-500 dark:text-zinc-400">
                · {ROTULO_ASSINATURA[a.assinatura] ?? a.assinatura}
                {a.icp && ' (ICP-Brasil)'}
                {a.decimoTerceiro && ' · 13º'}
                {` · ${a.ano}${a.anoFonte === 'data_do_arquivo' ? ' (data do arquivo)' : ''}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

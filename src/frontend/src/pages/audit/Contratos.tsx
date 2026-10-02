import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CaretDown, CaretRight, Copy, File, FileDoc, FileImage, FilePdf, FileXls,
  FolderSimpleDashed, MagnifyingGlass, SealCheck, WarningCircle, X,
} from '@phosphor-icons/react';
import { SyncBar } from '../../components/audit/SyncBar';
import { useToast } from '../../context/ToastContext';
import { exportAuditContratos, getAuditContratos, listResponsaveis } from '../../services/api';
import type {
  AuditArquivoContrato, AuditEmpresaContrato, AuditFiltrosContratos,
  AuditMotivoContrato, AuditStatusContrato,
} from '../../types';
import { maskCNPJ } from '../../utils/validators';
import { AvisoDistrato, CLASSE_DISTRATO } from '../../components/audit/AvisoDistrato';

const PASSO = 100;

const STATUS: { id: AuditStatusContrato; rotulo: string; classe: string }[] = [
  { id: 'NAO_LOCALIZADO',        rotulo: 'Não localizado',         classe: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  { id: 'MINUTA',                rotulo: 'Minuta',                  classe: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  { id: 'AGUARDANDO_ASSINATURA', rotulo: 'Aguardando assinatura',   classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  { id: 'REVISAR',               rotulo: 'Revisar',                 classe: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  { id: 'ASSINADO',              rotulo: 'Assinado',                classe: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  { id: 'DISTRATO',              rotulo: 'Distrato',                classe: CLASSE_DISTRATO },
];
const STATUS_POR_ID = Object.fromEntries(STATUS.map((s) => [s.id, s])) as Record<AuditStatusContrato, (typeof STATUS)[number]>;

const MOTIVO: Record<AuditMotivoContrato, string> = {
  SEM_VINCULO: 'Sem pasta vinculada',
  SEM_PASTA_CONTRATO: 'Sem subpasta de contrato',
  SEM_CONTRATO_SERVICO: 'Contrato de prestação de serviços não localizado',
  MULTIPLOS_CONTRATOS_ATUAIS: 'Múltiplos contratos diferentes',
  SOMENTE_CONTRATO_ANTIGO: 'Somente contrato marcado como antigo',
  CONTRATO_ASSINADO_PELO_NOME: 'Assinado pela indicação no nome',
  ARQUIVO_NAO_IDENTIFICADO: 'PDF ou imagem exige identificação manual',
  PDF_NAO_ANALISADO: 'PDF não analisado tecnicamente pelo coletor',
  FORMATO_EXIGE_REVISAO: 'Formato exige conferência manual',
  CONTRATO_DIGITAL_ASSINADO: 'Assinatura digital detectada',
  PDF_SEM_ASSINATURA: 'PDF sem assinatura digital',
  APENAS_MINUTA: 'Somente arquivo editável ou minuta',
  DISTRATO_PRESTACAO: 'Distrato da prestação de serviços',
};

type FiltroStatus = NonNullable<AuditFiltrosContratos['status']>;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function passa(item: AuditEmpresaContrato, status: FiltroStatus | '', responsavel: string, busca: string) {
  if (status === 'em_dia' && !item.emDia) return false;
  if (status === 'pendente' && (item.emDia || item.status === 'DISTRATO')) return false;
  if (status === 'assinado_digital' && item.motivo !== 'CONTRATO_DIGITAL_ASSINADO') return false;
  if (status === 'assinado_pelo_nome' && item.motivo !== 'CONTRATO_ASSINADO_PELO_NOME') return false;
  if (status && !['em_dia', 'pendente', 'assinado_digital', 'assinado_pelo_nome'].includes(status)
    && item.status !== status) return false;
  if (responsavel === '__none__' && item.empresa.responsavel) return false;
  if (responsavel && responsavel !== '__none__' && item.empresa.responsavel !== responsavel) return false;
  if (busca) {
    const termo = semAcento(busca);
    const digitos = busca.replace(/\D/g, '');
    if (!semAcento(item.empresa.razaoSocial).includes(termo)
      && !item.pastas.some((p) => semAcento(p.nomePasta).includes(termo))
      && !(digitos.length >= 3 && item.empresa.cnpj.replace(/\D/g, '').includes(digitos))) return false;
  }
  return true;
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export default function Contratos() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as FiltroStatus | '';
  const responsavel = params.get('responsavel') ?? '';
  const busca = params.get('busca') ?? '';
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [limite, setLimite] = useState(PASSO);
  const [exportando, setExportando] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit', 'contratos'],
    queryFn: getAuditContratos,
  });
  const { data: responsaveis } = useQuery({
    queryKey: ['responsaveis'],
    queryFn: listResponsaveis,
    staleTime: 60_000,
  });

  function setParam(chave: string, valor: string | null) {
    setParams((anterior) => {
      const proximo = new URLSearchParams(anterior);
      if (valor) proximo.set(chave, valor);
      else proximo.delete(chave);
      return proximo;
    }, { replace: true });
    setLimite(PASSO);
  }

  const visiveis = useMemo(
    () => (data?.empresas ?? []).filter((item) => passa(item, status, responsavel, busca.trim())),
    [data, status, responsavel, busca],
  );

  async function copiarCaminho(item: AuditEmpresaContrato) {
    if (!data) return;
    const pasta = item.pastas.find((p) => p.subpastasContrato.length) ?? item.pastas[0];
    if (!pasta) return;
    const caminho = [data.raizUnc, pasta.nomePasta, pasta.subpastasContrato[0]].filter(Boolean).join('\\');
    toast((await copiar(caminho)) ? 'Caminho copiado. Cole no Explorador de Arquivos.' : 'Não foi possível copiar o caminho.', 'info');
  }

  async function exportar() {
    setExportando(true);
    try {
      await exportAuditContratos({
        status: status || undefined,
        responsavel: responsavel || undefined,
        busca: busca.trim() || undefined,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao exportar.', 'error');
    } finally {
      setExportando(false);
    }
  }

  const resumo = data?.resumo;
  // Empresa com distrato fica na lista, mas fora das pendências e do percentual.
  const baseEmDia = resumo ? resumo.empresas - resumo.distratos : 0;
  const percentual = baseEmDia ? Math.round(((resumo?.emDia ?? 0) / baseEmDia) * 100) : 0;
  const chips: { id: FiltroStatus | ''; rotulo: string; qtd: number }[] = resumo ? [
    { id: '', rotulo: 'Todas', qtd: resumo.empresas },
    { id: 'pendente', rotulo: 'Pendentes', qtd: baseEmDia - resumo.emDia },
    { id: 'em_dia', rotulo: 'Em dia', qtd: resumo.emDia },
    { id: 'assinado_digital', rotulo: 'Assinado digital', qtd: data?.empresas.filter((e) => e.motivo === 'CONTRATO_DIGITAL_ASSINADO').length ?? 0 },
    { id: 'assinado_pelo_nome', rotulo: 'Assinado pelo nome', qtd: data?.empresas.filter((e) => e.motivo === 'CONTRATO_ASSINADO_PELO_NOME').length ?? 0 },
    ...STATUS.map((s) => ({ id: s.id, rotulo: s.rotulo, qtd: resumo.porStatus[s.id] })),
  ] : [];

  return (
    <div className="page-container">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Auditoria de contratos</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5 max-w-3xl">
            Contratos de prestação de serviços das empresas ativas. Conforme a regra do Societário,
            “assinado” no nome conta como assinado e permanece identificado separadamente da assinatura digital.
          </p>
        </div>
        <button type="button" className="btn-outline shrink-0 min-h-[44px]" onClick={exportar}
          disabled={exportando || !data?.job}>
          <FileXls size={16} aria-hidden /> {exportando ? 'Exportando…' : 'Exportar XLSX'}
        </button>
      </div>

      <SyncBar />

      {isLoading ? (
        <div className="card text-sm text-gray-500 dark:text-zinc-400">Carregando auditoria…</div>
      ) : isError ? (
        <div className="card text-sm text-red-700 dark:text-red-300">
          Não foi possível carregar a auditoria: {(error as Error).message}
        </div>
      ) : !data?.job || !resumo ? (
        <div className="card flex flex-col items-center text-center gap-2 py-12">
          <FolderSimpleDashed size={40} className="text-gray-300 dark:text-zinc-600" aria-hidden />
          <p className="font-medium text-gray-800 dark:text-zinc-200">Nenhuma sincronização concluída ainda</p>
          <p className="text-sm text-gray-500 dark:text-zinc-400">O relatório aparecerá após a primeira varredura do robô.</p>
        </div>
      ) : (
        <>
          <div className="card p-5 mb-4">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <p className="text-gray-800 dark:text-zinc-200">
                <span className="text-3xl font-bold tabular-nums">{resumo.emDia.toLocaleString('pt-BR')}</span>
                <span className="text-sm text-gray-500 dark:text-zinc-400"> de {resumo.empresas.toLocaleString('pt-BR')} empresas com contrato assinado</span>
              </p>
              <span className="text-2xl font-semibold tabular-nums text-gray-700 dark:text-zinc-300">{percentual}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden" role="progressbar"
              aria-label="Empresas com contrato assinado" aria-valuemin={0} aria-valuemax={resumo.empresas} aria-valuenow={resumo.emDia}>
              <div className="h-full bg-green-600 dark:bg-green-500" style={{ width: `${percentual}%` }} />
            </div>
            {resumo.revisar > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-purple-700 dark:text-purple-300">
                <WarningCircle size={16} weight="fill" aria-hidden /> {resumo.revisar} empresa(s) precisam de revisão manual.
              </p>
            )}
            {resumo.marcadasSemPasta > 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                {resumo.marcadasSemPasta} empresa(s) marcadas como “sem pasta de propósito” estão fora deste relatório.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-1 mb-3" role="group" aria-label="Filtrar por status">
            {chips.map((chip) => (
              <button key={chip.id || 'todas'} type="button" aria-pressed={status === chip.id}
                onClick={() => setParam('status', chip.id || null)}
                className={`px-3 py-1.5 min-h-[36px] rounded-md text-sm font-medium border transition-colors ${status === chip.id
                  ? 'bg-brand-50 border-brand-300 text-brand-800 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-200'
                  : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}>
                {chip.rotulo} <span className="tabular-nums text-gray-500 dark:text-zinc-400">{chip.qtd}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="flex items-center gap-2">
              <label htmlFor="resp-contrato" className="text-sm text-gray-500 dark:text-zinc-400 whitespace-nowrap">Responsável:</label>
              <select id="resp-contrato" className="input py-1.5 min-h-[40px]" value={responsavel}
                onChange={(e) => setParam('responsavel', e.target.value || null)}>
                <option value="">Todos</option>
                {(responsaveis ?? []).map((r) => <option key={r.id} value={r.nome}>{r.nome}</option>)}
                <option value="__none__">Sem responsável</option>
              </select>
            </div>
            <div className="relative flex-1">
              <label htmlFor="busca-contrato" className="sr-only">Buscar empresa, CNPJ ou pasta</label>
              <MagnifyingGlass size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input id="busca-contrato" className="input pl-9 pr-9 min-h-[40px]" placeholder="Buscar empresa, CNPJ ou pasta…"
                value={busca} onChange={(e) => setParam('busca', e.target.value || null)} />
              {busca && <button type="button" onClick={() => setParam('busca', null)} aria-label="Limpar busca"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-gray-400"><X size={14} /></button>}
            </div>
          </div>

          <p className="text-sm text-gray-500 dark:text-zinc-400 mb-2" aria-live="polite">{visiveis.length} empresa(s)</p>
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Situação dos contratos por empresa</caption>
              <thead className="border-b border-gray-100 dark:border-zinc-800 text-left">
                <tr>
                  <th className="table-head w-8"><span className="sr-only">Detalhes</span></th>
                  <th className="table-head">Empresa</th>
                  <th className="table-head">Situação</th>
                  <th className="table-head">Contrato selecionado</th>
                  <th className="table-head"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-500">Nenhuma empresa neste filtro.</td></tr>}
                {visiveis.slice(0, limite).map((item) => {
                  const aberta = abertas.has(item.empresa.id);
                  const temDetalhes = item.contratos.length + item.descartados.length > 0 || item.warnings.length > 0;
                  return (
                    <Fragment key={item.empresa.id}>
                      <tr className="border-b border-gray-50 dark:border-zinc-800 align-top">
                        <td className="pl-3 py-3">
                          {temDetalhes && <button type="button" className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
                            aria-expanded={aberta} aria-label={`${aberta ? 'Esconder' : 'Ver'} detalhes de ${item.empresa.razaoSocial}`}
                            onClick={() => setAbertas((anterior) => {
                              const proximo = new Set(anterior);
                              if (proximo.has(item.empresa.id)) proximo.delete(item.empresa.id); else proximo.add(item.empresa.id);
                              return proximo;
                            })}>
                            {aberta ? <CaretDown size={14} /> : <CaretRight size={14} />}
                          </button>}
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900 dark:text-zinc-100">{item.empresa.razaoSocial}</p>
                          <p className="text-xs text-gray-500 dark:text-zinc-400"><span className="font-mono">{maskCNPJ(item.empresa.cnpj)}</span>{item.empresa.responsavel && <> · {item.empresa.responsavel}</>}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_POR_ID[item.status].classe}`}>
                            {item.status === 'ASSINADO' && <SealCheck size={12} weight="fill" />} {STATUS_POR_ID[item.status].rotulo}
                          </span>
                          <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">{MOTIVO[item.motivo]}</p>
                          <AvisoDistrato distrato={item.distrato} />
                        </td>
                        <td className="px-5 py-3 text-gray-700 dark:text-zinc-300 break-all">{item.contratoPrincipal?.nome ?? '—'}</td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end">
                            {item.pastas.length ? <button type="button" className="btn-outline min-h-[44px] px-3 py-1.5 whitespace-nowrap"
                              onClick={() => copiarCaminho(item)}><Copy size={14} /> Copiar caminho</button>
                              : <Link to="/auditoria/pastas?aba=empresas" className="btn-outline min-h-[44px] px-3 py-1.5 whitespace-nowrap">Vincular pasta</Link>}
                          </div>
                        </td>
                      </tr>
                      {aberta && <tr className="border-b border-gray-50 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/60">
                        <td /><td colSpan={4} className="px-5 py-3">
                          {item.warnings.map((aviso) => <p key={aviso} className="mb-2 flex items-start gap-1.5 text-sm text-purple-700 dark:text-purple-300"><WarningCircle size={16} className="shrink-0 mt-0.5" />{aviso}</p>)}
                          <ListaArquivos titulo="Contratos candidatos" arquivos={item.contratos} principal={item.contratoPrincipal?.caminhoRelativo} />
                          {item.descartados.length > 0 && <ListaArquivos titulo="Documentos descartados pela classificação" arquivos={item.descartados} apagado />}
                          {item.renomeacao?.recomendado && <p className="mt-3 text-xs text-gray-600 dark:text-zinc-300">
                            <strong>Renomeação sugerida (somente dry run):</strong> {item.renomeacao.caminhoOriginal} → {item.renomeacao.caminhoDestino}
                          </p>}
                        </td>
                      </tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visiveis.length > limite && <div className="mt-4 flex justify-center"><button type="button" className="btn-outline min-h-[44px]" onClick={() => setLimite((n) => n + PASSO)}>Mostrar mais ({visiveis.length - limite} restantes)</button></div>}
        </>
      )}
    </div>
  );
}

function IconeFormato({ formato }: { formato: AuditArquivoContrato['formato'] }) {
  const props = { size: 16, 'aria-hidden': true } as const;
  if (formato === 'pdf') return <FilePdf {...props} className="text-red-600 shrink-0" />;
  if (formato === 'word') return <FileDoc {...props} className="text-blue-600 shrink-0" />;
  if (formato === 'imagem') return <FileImage {...props} className="text-purple-600 shrink-0" />;
  return <File {...props} className="text-gray-500 shrink-0" />;
}

function ListaArquivos({ titulo, arquivos, principal, apagado = false }: {
  titulo: string; arquivos: AuditArquivoContrato[]; principal?: string; apagado?: boolean;
}) {
  return <div className={apagado ? 'mt-3 opacity-70' : ''}>
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1">{titulo}</p>
    {arquivos.length === 0 ? <p className="text-sm text-gray-500">Nenhum.</p> : <ul className="space-y-1">
      {arquivos.map((arquivo) => <li key={`${arquivo.nomePasta}/${arquivo.caminhoRelativo}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <IconeFormato formato={arquivo.formato} />
        <span className="text-gray-900 dark:text-zinc-100 break-all">{arquivo.caminhoRelativo}</span>
        {arquivo.caminhoRelativo === principal && <span className="text-xs font-medium text-brand-700 dark:text-brand-300">selecionado</span>}
        <span className="text-xs text-gray-500 dark:text-zinc-400">
          {arquivo.assinatura.digital ? ' · assinatura digital' : arquivo.assinatura.peloNome ? ' · assinado pelo nome' : ''}
          {arquivo.formato === 'pdf' && !arquivo.assinatura.tecnicaLida ? ' · conteúdo não analisado' : ''}
          {arquivo.icp ? ' · ICP-Brasil' : ''}{arquivo.antigo ? ' · antigo' : ''}{arquivo.motivoExclusao ? ` · ${arquivo.motivoExclusao}` : ''}
        </span>
      </li>)}
    </ul>}
  </div>;
}

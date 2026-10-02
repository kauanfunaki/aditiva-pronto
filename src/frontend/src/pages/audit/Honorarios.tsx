import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowsClockwise, CaretDown, CaretRight, CheckCircle, CloudArrowUp, FolderSimpleDashed, LockSimple,
  MagnifyingGlass, PencilSimple, Spinner, Trash, WarningCircle, X, XCircle,
} from '@phosphor-icons/react';
import {
  conferirAcessorias, enviarHonorario, enviarHonorariosLote, getEnviosAcessorias, getEstadoAcessorias,
  getHonorarios, informarHonorario, liberarEnviosAcessorias, listResponsaveis, removerHonorarioInformado,
} from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { maskCNPJ } from '../../utils/validators';
import { SyncBar } from '../../components/audit/SyncBar';
import { Dialogo } from '../../components/Dialogo';
import type {
  AlertaHonorario, ComparacaoAcessorias, HonorarioDocumento, HonorarioEmpresa, ResultadoEnvioAcessorias,
  SituacaoHonorario,
} from '../../types';

// Honorários: valor do documento mais recente (contrato ou termo aditivo de honorário),
// comparado com o Acessórias. Regras em src/backend/src/services/honorariosRegras.ts.

const PASSO = 100;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const reais = (v: number | null | undefined) => (v === null || v === undefined ? '—' : brl.format(v));
const dataCurta = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : '—';
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const SITUACOES: { id: SituacaoHonorario; rotulo: string; classe: string }[] = [
  { id: 'CONFERIR',           rotulo: 'Conferir',           classe: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
  { id: 'DIGITALIZADO',       rotulo: 'Digitalizado',       classe: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200' },
  { id: 'SEM_VALOR',          rotulo: 'Sem valor',          classe: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  { id: 'AGUARDANDO_LEITURA', rotulo: 'Aguardando leitura', classe: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200' },
  { id: 'SEM_DOCUMENTO',      rotulo: 'Sem documento',      classe: 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300' },
  { id: 'LIDO',               rotulo: 'Lido',               classe: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  { id: 'MANUAL',             rotulo: 'Informado',          classe: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300' },
];
const SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.id, s])) as Record<SituacaoHonorario, (typeof SITUACOES)[number]>;

const ALERTA: Record<AlertaHonorario, string> = {
  minuta:                        'Valor tirado de minuta',
  sem_assinatura:                'Documento sem assinatura',
  mencao:                        'Valor fora da cláusula de honorário',
  acordo_comercial:              'Valor de acordo comercial, não de contrato',
  valor_condicional:             'Valor depende do faturamento',
  valores_diferentes:            'Documentos da mesma data com valores diferentes',
  documento_mais_novo_sem_valor: 'Há contrato mais novo sem valor lido (digitalizado?)',
  sem_data:                      'Sem data no texto: usou a data do arquivo',
  leitura_incompleta:            'O robô ainda está lendo documentos desta empresa',
};

/** Avisos que não põem o valor em dúvida (mesma lista do backend, honorariosRegras.ts). */
const INFORMATIVOS = new Set<AlertaHonorario>(['sem_assinatura', 'sem_data']);
const temAlertaGrave = (e: HonorarioEmpresa) => e.alertas.some((a) => !INFORMATIVOS.has(a));

const COMPARACAO: Record<ComparacaoAcessorias, { rotulo: string; classe: string }> = {
  NAO_CONFERIDO:    { rotulo: 'Não conferido',          classe: 'text-gray-500 dark:text-zinc-400' },
  NAO_ENCONTRADA:   { rotulo: 'Não está no Acessórias', classe: 'text-red-700 dark:text-red-300' },
  SEM_VALOR_NO_APP: { rotulo: '',                       classe: 'text-gray-500 dark:text-zinc-400' },
  IGUAL:            { rotulo: 'Igual',                  classe: 'text-green-700 dark:text-green-400' },
  DIFERENTE:        { rotulo: 'Diferente',              classe: 'text-amber-700 dark:text-amber-300 font-medium' },
};

const ESTADO_DOC: Record<HonorarioDocumento['estado'], string> = {
  ok:        'Lido',
  sem_texto: 'Sem texto (digitalizado)',
  erro:      'Erro na leitura',
  pendente:  'Aguardando o robô',
  imagem:    'Imagem (digitalizado)',
};

const TIPO_DOC: Record<HonorarioDocumento['tipo'], string> = { contrato: 'Contrato', aditivo: 'Aditivo', outro: 'Outro' };

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** "1.234,56" · "1234,56" · "1234.56" · "R$ 1.234,56" → número; null se não der. */
export function lerValorDigitado(texto: string): number | null {
  const t = texto.replace(/R\$|\s/gi, '');
  if (!t) return null;
  let n: number;
  if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ''));
  else n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const podeAtualizar = (e: HonorarioEmpresa) =>
  e.valor !== null && (e.acessorias.comparacao === 'DIFERENTE' || e.acessorias.comparacao === 'NAO_CONFERIDO');

function passa(e: HonorarioEmpresa, situacao: string, comparacao: string, responsavel: string, busca: string) {
  if (situacao && e.situacao !== situacao) return false;
  if (comparacao && e.acessorias.comparacao !== comparacao) return false;
  if (responsavel === '__none__' && e.empresa.responsavel) return false;
  if (responsavel && responsavel !== '__none__' && e.empresa.responsavel !== responsavel) return false;
  if (busca) {
    const t = semAcento(busca);
    const d = busca.replace(/\D/g, '');
    if (!semAcento(e.empresa.razaoSocial).includes(t) && !(d.length >= 3 && e.empresa.cnpj.replace(/\D/g, '').includes(d))) {
      return false;
    }
  }
  return true;
}

export default function Honorarios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const situacao    = params.get('situacao') ?? '';
  const comparacao  = params.get('acessorias') ?? '';
  const responsavel = params.get('responsavel') ?? '';
  const busca       = params.get('busca') ?? '';

  const [limite, setLimite]           = useState(PASSO);
  const [abertas, setAbertas]         = useState<Set<string>>(new Set());
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [envio, setEnvio]             = useState<HonorarioEmpresa | null>(null);
  const [lote, setLote]               = useState<HonorarioEmpresa[] | null>(null);
  const [informar, setInformar]       = useState<HonorarioEmpresa | null>(null);

  const { data, isLoading, isError, error } = useQuery({ queryKey: ['honorarios'], queryFn: getHonorarios });
  const { data: estado } = useQuery({
    queryKey: ['honorarios', 'acessorias'],
    queryFn:  getEstadoAcessorias,
    refetchInterval: (q) => (q.state.data?.operacao?.executando ? 2000 : false),
  });
  const { data: responsaveis } = useQuery({ queryKey: ['responsaveis'], queryFn: listResponsaveis, staleTime: 60_000 });

  // Terminou a conferência ou o lote: atualiza a tabela.
  const ultimaConclusao = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const fim = estado?.operacao?.concluidaEm ?? null;
    if (ultimaConclusao.current !== undefined && fim && fim !== ultimaConclusao.current) {
      queryClient.invalidateQueries({ queryKey: ['honorarios'] });
      if (estado?.operacao?.mensagem) toast(estado.operacao.mensagem, estado.operacao.erros ? 'error' : 'success');
    }
    ultimaConclusao.current = fim;
  }, [estado?.operacao?.concluidaEm]); // eslint-disable-line react-hooks/exhaustive-deps

  const conferir = useMutation({
    mutationFn: conferirAcessorias,
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['honorarios', 'acessorias'] }),
    onError:    (e: Error) => toast(e.message, 'error'),
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
    () => (data?.empresas ?? []).filter((e) => passa(e, situacao, comparacao, responsavel, busca.trim())),
    [data, situacao, comparacao, responsavel, busca],
  );

  const operando  = !!estado?.operacao?.executando;
  const travado   = !!estado?.bloqueio;
  const podeEnviar = !!estado?.configurado && !travado && !operando;
  const selecionaveis = visiveis.filter(podeAtualizar);
  const selecionadasVisiveis = selecionaveis.filter((e) => selecionadas.has(e.empresa.id));

  function alternar(conjunto: Set<string>, id: string) {
    const next = new Set(conjunto);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  const r = data?.resumo;
  const pctTextos = r && r.textos.documentos ? Math.round((r.textos.lidos / r.textos.documentos) * 100) : 0;

  return (
    <div className="page-container">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Honorários</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5 max-w-3xl">
          Honorário do documento mais recente de cada empresa (contrato ou termo aditivo de honorário),
          lido pelo robô na pasta de rede, comparado com o Acessórias. Confira e atualize o Acessórias por aqui.
          Contrato digitalizado não tem texto: informe o valor à mão.
        </p>
      </div>

      <SyncBar />

      {estado?.bloqueio && <Bloqueio bloqueio={estado.bloqueio} />}

      {estado && !estado.configurado && (
        <div className="card p-4 mb-4 flex gap-3 text-sm text-gray-700 dark:text-zinc-300" role="status">
          <LockSimple size={18} className="shrink-0 mt-0.5 text-gray-500" aria-hidden />
          <p>
            A integração com o Acessórias ainda não está configurada no servidor (<code>ACESSORIAS_API_TOKEN</code>).
            Dá para conferir os valores lidos e informar os que faltam, mas não para enviar.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="card text-sm text-gray-500 dark:text-zinc-400">Carregando honorários…</div>
      ) : isError ? (
        <div className="card text-sm text-red-700 dark:text-red-300" role="alert">
          Não foi possível carregar os honorários: {(error as Error).message}
        </div>
      ) : !data?.job || !r ? (
        <div className="card flex flex-col items-center text-center gap-2 py-12">
          <FolderSimpleDashed size={40} className="text-gray-300 dark:text-zinc-600" aria-hidden />
          <p className="font-medium text-gray-800 dark:text-zinc-200">Nenhuma sincronização concluída ainda</p>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-md">
            Assim que o robô terminar a primeira varredura das pastas, os documentos começam a ser lidos.
          </p>
        </div>
      ) : (
        <>
          {/* ── Resumo ── */}
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <div className="card p-5">
              <p className="text-gray-800 dark:text-zinc-200">
                <span className="text-3xl font-bold tabular-nums">{r.comValor.toLocaleString('pt-BR')}</span>
                <span className="text-sm text-gray-500 dark:text-zinc-400"> de {r.empresas.toLocaleString('pt-BR')} empresas com honorário</span>
              </p>
              <p className="mt-3 text-sm text-gray-600 dark:text-zinc-400">
                Documentos lidos pelo robô: {r.textos.lidos.toLocaleString('pt-BR')} de {r.textos.documentos.toLocaleString('pt-BR')}
                {r.textos.semTexto > 0 && <> · {r.textos.semTexto} sem texto (digitalizados)</>}
              </p>
              <div
                className="mt-2 h-2 w-full rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden"
                role="progressbar" aria-label="Documentos lidos pelo robô"
                aria-valuemin={0} aria-valuemax={r.textos.documentos} aria-valuenow={r.textos.lidos}
              >
                <div className="h-full bg-brand-600 dark:bg-brand-500" style={{ width: `${pctTextos}%` }} />
              </div>
              {r.textos.pendentes > 0 && (
                <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                  Faltam {r.textos.pendentes} documento(s). O robô lê um lote a cada poucos segundos; recarregue para ver o avanço.
                </p>
              )}
            </div>

            <div className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-zinc-100">Acessórias</p>
                  <p className="text-sm text-gray-600 dark:text-zinc-400">
                    {r.acessorias.conferidoEm
                      ? <>Conferido em {dataHora(r.acessorias.conferidoEm)}</>
                      : 'Ainda não conferido.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-outline min-h-[44px]"
                  onClick={() => conferir.mutate()}
                  disabled={!estado?.configurado || operando || conferir.isPending}
                >
                  <ArrowsClockwise size={16} className={estado?.operacao?.tipo === 'conferir' && operando ? 'animate-spin' : ''} aria-hidden />
                  Conferir no Acessórias
                </button>
              </div>
              {r.acessorias.conferidoEm && (
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {([
                    ['DIFERENTE', `${r.acessorias.diferentes} diferente(s)`],
                    ['IGUAL', `${r.acessorias.iguais} igual(is)`],
                    ['NAO_ENCONTRADA', `${r.acessorias.naoEncontradas} não encontrada(s)`],
                  ] as const).map(([id, rotulo]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={comparacao === id}
                      onClick={() => setParam('acessorias', comparacao === id ? null : id)}
                      className={`px-2.5 py-1 min-h-[36px] rounded-md border ${comparacao === id
                        ? 'bg-brand-50 border-brand-300 text-brand-800 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-200'
                        : 'border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              )}
              {estado?.operacao && (estado.operacao.executando || estado.operacao.mensagem) && (
                <p className="mt-3 text-sm text-gray-700 dark:text-zinc-300" aria-live="polite">
                  {estado.operacao.executando
                    ? estado.operacao.tipo === 'conferir'
                      ? `Lendo o Acessórias… ${estado.operacao.feitos} empresa(s) até agora.`
                      : `Enviando… ${estado.operacao.feitos} de ${estado.operacao.total}.`
                    : `Última operação (${estado.operacao.conta}): ${estado.operacao.mensagem}`}
                </p>
              )}
            </div>
          </div>

          {/* ── Filtros ── */}
          <div className="flex flex-wrap gap-1 mb-3" role="group" aria-label="Filtrar por situação">
            {[{ id: '', rotulo: 'Todas', qtd: r.empresas }, ...SITUACOES.map((s) => ({ id: s.id, rotulo: s.rotulo, qtd: r.porSituacao[s.id] }))]
              .map((c) => (
                <button
                  key={c.id || 'todas'}
                  type="button"
                  aria-pressed={situacao === c.id}
                  onClick={() => setParam('situacao', c.id || null)}
                  className={`px-3 py-1.5 min-h-[36px] rounded-md text-sm font-medium border transition-colors ${
                    situacao === c.id
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
              <label htmlFor="hon-acessorias" className="text-sm text-gray-500 dark:text-zinc-400 whitespace-nowrap">Acessórias:</label>
              <select id="hon-acessorias" className="input py-1.5 min-h-[40px]" value={comparacao}
                onChange={(e) => setParam('acessorias', e.target.value || null)}>
                <option value="">Todas</option>
                <option value="DIFERENTE">Diferente</option>
                <option value="IGUAL">Igual</option>
                <option value="NAO_ENCONTRADA">Não está no Acessórias</option>
                <option value="NAO_CONFERIDO">Não conferido</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="hon-resp" className="text-sm text-gray-500 dark:text-zinc-400 whitespace-nowrap">Responsável:</label>
              <select id="hon-resp" className="input py-1.5 min-h-[40px]" value={responsavel}
                onChange={(e) => setParam('responsavel', e.target.value || null)}>
                <option value="">Todos</option>
                {(responsaveis ?? []).map((x) => <option key={x.id} value={x.nome}>{x.nome}</option>)}
                <option value="__none__">Sem responsável</option>
              </select>
            </div>
            <div className="relative flex-1">
              <label htmlFor="hon-busca" className="sr-only">Buscar empresa ou CNPJ</label>
              <MagnifyingGlass size={16} aria-hidden
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none" />
              <input id="hon-busca" className="input pl-9 pr-9 min-h-[40px]" placeholder="Buscar empresa ou CNPJ…"
                value={busca} onChange={(e) => setParam('busca', e.target.value || null)} />
              {busca && (
                <button type="button" onClick={() => setParam('busca', null)} aria-label="Limpar busca"
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300">
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
          </div>

          {/* ── Envio em lote ── */}
          {estado?.configurado && selecionaveis.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
              <button
                type="button"
                className="btn-ghost min-h-[40px] px-3"
                onClick={() => setSelecionadas(new Set(selecionaveis
                  .filter((e) => e.situacao === 'LIDO' || e.situacao === 'MANUAL').map((e) => e.empresa.id)))}
              >
                Selecionar as sem pendência ({selecionaveis.filter((e) => e.situacao === 'LIDO' || e.situacao === 'MANUAL').length})
              </button>
              {selecionadasVisiveis.length > 0 && (
                <button type="button" className="btn-ghost min-h-[40px] px-3" onClick={() => setSelecionadas(new Set())}>
                  Limpar seleção
                </button>
              )}
              <button
                type="button"
                className="btn-primary min-h-[44px]"
                disabled={!podeEnviar || !estado.envioLoteLiberado || selecionadasVisiveis.length === 0}
                onClick={() => setLote(selecionadasVisiveis)}
              >
                <CloudArrowUp size={16} aria-hidden />
                Atualizar {selecionadasVisiveis.length || ''} no Acessórias
              </button>
              {!estado.envioLoteLiberado && (
                <span className="text-gray-500 dark:text-zinc-400">
                  O envio em lote libera depois do primeiro envio de uma empresa só, conferido no Acessórias.
                </span>
              )}
            </div>
          )}

          <p className="text-sm text-gray-500 dark:text-zinc-400 mb-2" aria-live="polite">
            {visiveis.length.toLocaleString('pt-BR')} empresa(s)
          </p>

          {/* ── Tabela ── */}
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Honorário por empresa, no documento e no Acessórias</caption>
              <thead className="border-b border-gray-100 dark:border-zinc-800 text-left">
                <tr>
                  <th scope="col" className="table-head w-8"><span className="sr-only">Detalhes</span></th>
                  <th scope="col" className="table-head w-8"><span className="sr-only">Selecionar</span></th>
                  <th scope="col" className="table-head">Empresa</th>
                  <th scope="col" className="table-head text-right">Honorário</th>
                  <th scope="col" className="table-head">Situação</th>
                  <th scope="col" className="table-head text-right">No Acessórias</th>
                  <th scope="col" className="table-head"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-gray-500 dark:text-zinc-400">Nenhuma empresa neste filtro.</td>
                  </tr>
                )}
                {visiveis.slice(0, limite).map((e) => {
                  const aberta = abertas.has(e.empresa.id);
                  const sel = SITUACAO[e.situacao];
                  const comp = COMPARACAO[e.acessorias.comparacao];
                  return (
                    <Fragment key={e.empresa.id}>
                      <tr className="border-b border-gray-50 dark:border-zinc-800 align-top">
                        <td className="pl-3 py-3">
                          <button
                            type="button"
                            onClick={() => setAbertas((s) => alternar(s, e.empresa.id))}
                            aria-expanded={aberta}
                            aria-label={`${aberta ? 'Esconder' : 'Ver'} documentos de ${e.empresa.razaoSocial}`}
                            className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          >
                            {aberta ? <CaretDown size={14} aria-hidden /> : <CaretRight size={14} aria-hidden />}
                          </button>
                        </td>
                        <td className="py-3">
                          {podeAtualizar(e) && estado?.configurado && (
                            <input
                              type="checkbox"
                              className="h-5 w-5 mt-1.5 accent-brand-600"
                              checked={selecionadas.has(e.empresa.id)}
                              onChange={() => setSelecionadas((s) => alternar(s, e.empresa.id))}
                              aria-label={`Selecionar ${e.empresa.razaoSocial} para o envio em lote`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-zinc-100">{e.empresa.razaoSocial}</p>
                          <p className="text-xs text-gray-500 dark:text-zinc-400">
                            <span className="font-mono">{maskCNPJ(e.empresa.cnpj)}</span>
                            {e.empresa.responsavel && <> · {e.empresa.responsavel}</>}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-semibold tabular-nums text-gray-900 dark:text-zinc-100">{reais(e.valor)}</p>
                          <p className="text-xs text-gray-500 dark:text-zinc-400">
                            {e.fonte === 'manual' && <>informado por {e.manual?.informadoPor}</>}
                            {e.fonte === 'documento' && e.documento && (
                              <>{TIPO_DOC[e.documento.tipo].toLowerCase()} de {dataCurta(e.documento.data ?? e.documento.modificadoEm)}</>
                            )}
                            {e.fonte === 'documento' && e.documento?.adicional ? <> · + {reais(e.documento.adicional)}/func.</> : null}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${sel.classe}`}>{sel.rotulo}</span>
                          {e.alertas.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-xs">
                              {e.alertas.map((a) => (
                                <li key={a} className={`flex items-start gap-1 ${INFORMATIVOS.has(a)
                                  ? 'text-gray-500 dark:text-zinc-400'
                                  : 'text-amber-800 dark:text-amber-300'}`}>
                                  {INFORMATIVOS.has(a)
                                    ? <span className="mt-1.5 h-1 w-1 rounded-full bg-current shrink-0" aria-hidden />
                                    : <WarningCircle size={12} weight="fill" className="mt-0.5 shrink-0" aria-hidden />}
                                  {ALERTA[a]}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="tabular-nums text-gray-900 dark:text-zinc-100">
                            {e.acessorias.comparacao === 'NAO_CONFERIDO' || e.acessorias.comparacao === 'NAO_ENCONTRADA'
                              ? '—' : reais(e.acessorias.valor)}
                          </p>
                          {comp.rotulo && <p className={`text-xs ${comp.classe}`}>{comp.rotulo}</p>}
                          {e.ultimoEnvio && (
                            <p className="text-xs text-gray-500 dark:text-zinc-400">
                              {e.ultimoEnvio.status === 'ok' ? 'Atualizado' : 'Falhou'} em {dataCurta(e.ultimoEnvio.enviadoEm)} ({e.ultimoEnvio.conta})
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-end gap-1.5">
                            {podeAtualizar(e) && (
                              <button
                                type="button"
                                className="btn-primary min-h-[40px] px-3 py-1.5 whitespace-nowrap"
                                disabled={!podeEnviar}
                                title={!estado?.configurado ? 'Acessórias não configurado' : travado ? 'Envios travados: confira o aviso no topo' : undefined}
                                onClick={() => setEnvio(e)}
                              >
                                <CloudArrowUp size={14} aria-hidden /> Atualizar
                              </button>
                            )}
                            <button type="button" className="btn-outline min-h-[40px] px-3 py-1.5 whitespace-nowrap" onClick={() => setInformar(e)}>
                              <PencilSimple size={14} aria-hidden />
                              {e.manual ? 'Alterar valor' : e.situacao === 'CONFERIR' ? 'Conferir valor' : 'Informar valor'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {aberta && (
                        <tr className="border-b border-gray-50 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/60">
                          <td colSpan={2} />
                          <td colSpan={5} className="px-4 py-3">
                            <Detalhes e={e} />
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

          <Historico />
        </>
      )}

      {envio && <ConfirmarEnvio e={envio} aoFechar={() => setEnvio(null)} />}
      {lote && (
        <ConfirmarLote
          empresas={lote}
          aoFechar={() => setLote(null)}
          aoEnviar={() => { setSelecionadas(new Set()); setLote(null); }}
        />
      )}
      {informar && <InformarValor e={informar} aoFechar={() => setInformar(null)} />}
    </div>
  );
}

// ── Detalhes da empresa (linha expandida) ─────────────────────────

function Detalhes({ e }: { e: HonorarioEmpresa }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const remover = useMutation({
    mutationFn: () => removerHonorarioInformado(e.empresa.id),
    onSuccess: () => {
      toast('Valor informado removido.', 'success');
      queryClient.invalidateQueries({ queryKey: ['honorarios'] });
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  return (
    <div className="space-y-3">
      {e.manual && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1">Valor informado</p>
          <p className="text-gray-800 dark:text-zinc-200">
            {reais(e.manual.valor)} · por {e.manual.informadoPor} em {dataHora(e.manual.informadoEm)}
            {e.manual.documento && <> · documento: <span className="break-all">{e.manual.documento}</span></>}
          </p>
          {e.manual.observacao && <p className="text-gray-600 dark:text-zinc-400">“{e.manual.observacao}”</p>}
          <button type="button" className="btn-ghost mt-1 min-h-[36px] px-2 text-red-700 dark:text-red-400"
            onClick={() => remover.mutate()} disabled={remover.isPending}>
            <Trash size={14} aria-hidden /> Remover e voltar ao valor lido
          </button>
        </div>
      )}

      {e.documento?.trecho && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1">
            Trecho lido em {e.documento.nome}
          </p>
          <blockquote className="border-l-2 border-gray-300 dark:border-zinc-600 pl-3 text-gray-700 dark:text-zinc-300">
            {e.documento.trecho}
          </blockquote>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1">
          Documentos da pasta ({e.documentos.length})
        </p>
        {e.documentos.length === 0 ? (
          <p className="text-gray-500 dark:text-zinc-400">
            Nenhum documento. {e.situacao === 'SEM_DOCUMENTO' && <Link className="underline" to="/auditoria/pastas?aba=empresas">Conferir o vínculo da pasta</Link>}
          </p>
        ) : (
          <ul className="space-y-1">
            {e.documentos.map((d) => {
              const escolhido = e.documento && d.nomePasta === e.documento.nomePasta && d.caminhoRelativo === e.documento.caminhoRelativo;
              return (
                <li key={`${d.nomePasta}/${d.caminhoRelativo}`} className="flex flex-wrap items-baseline gap-x-2">
                  {escolhido
                    ? <CheckCircle size={14} weight="fill" className="text-green-600 dark:text-green-400 shrink-0 self-center" aria-label="Documento usado" />
                    : <span className="w-3.5 shrink-0" aria-hidden />}
                  <span className="break-all text-gray-900 dark:text-zinc-100">{d.caminhoRelativo}</span>
                  <span className="text-xs text-gray-500 dark:text-zinc-400">
                    · {TIPO_DOC[d.tipo]} · {dataCurta(d.data ?? d.modificadoEm)}{!d.data && ' (arquivo)'} · {ESTADO_DOC[d.estado]}
                    {d.minuta && ' · minuta'}
                    {d.valor !== null && <> · <strong className="text-gray-800 dark:text-zinc-200">{reais(d.valor)}</strong></>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Envio de uma empresa ──────────────────────────────────────────

function ConfirmarEnvio({ e, aoFechar }: { e: HonorarioEmpresa; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const [resultado, setResultado] = useState<ResultadoEnvioAcessorias | null>(null);
  const enviar = useMutation({
    mutationFn: () => enviarHonorario(e.empresa.id, e.valor!),
    onSuccess: (r) => setResultado(r),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['honorarios'] }),
  });

  return (
    <Dialogo
      titulo="Atualizar honorário no Acessórias"
      aoFechar={aoFechar}
      travado={enviar.isPending}
      rodape={resultado || enviar.isError ? (
        <button type="button" className="btn-primary min-h-[44px]" onClick={aoFechar} data-autofocus>Fechar</button>
      ) : (
        <>
          <button type="button" className="btn-outline min-h-[44px]" onClick={aoFechar} disabled={enviar.isPending}>Cancelar</button>
          <button type="button" className="btn-primary min-h-[44px]" onClick={() => enviar.mutate()} disabled={enviar.isPending} data-autofocus>
            {enviar.isPending ? <Spinner size={16} className="animate-spin" aria-hidden /> : <CloudArrowUp size={16} aria-hidden />}
            {enviar.isPending ? 'Enviando…' : 'Atualizar'}
          </button>
        </>
      )}
    >
      <p className="font-medium text-gray-900 dark:text-zinc-100">{e.empresa.razaoSocial}</p>
      <p className="text-xs text-gray-500 dark:text-zinc-400 font-mono mb-3">{maskCNPJ(e.empresa.cnpj)}</p>
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 mb-3">
        <dt className="text-gray-500 dark:text-zinc-400">No Acessórias</dt>
        <dd className="tabular-nums">{e.acessorias.comparacao === 'NAO_CONFERIDO' ? 'não conferido (o app lê antes de enviar)' : reais(e.acessorias.valor)}</dd>
        <dt className="text-gray-500 dark:text-zinc-400">Vai ficar</dt>
        <dd className="tabular-nums font-semibold text-gray-900 dark:text-zinc-100">{reais(e.valor)}</dd>
        <dt className="text-gray-500 dark:text-zinc-400">Fonte</dt>
        <dd className="break-all">
          {e.fonte === 'manual' ? `informado por ${e.manual?.informadoPor}` : e.documento?.caminhoRelativo}
        </dd>
      </dl>
      {temAlertaGrave(e) && (
        <p className="mb-3 text-amber-800 dark:text-amber-300 flex gap-1.5">
          <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" aria-hidden />
          Este valor tem alerta: {e.alertas.filter((a) => !INFORMATIVOS.has(a)).map((a) => ALERTA[a].toLowerCase()).join('; ')}.
        </p>
      )}
      <p className="text-xs text-gray-500 dark:text-zinc-400">
        O app lê a ficha da empresa no Acessórias antes e depois do envio. Se algum outro campo mudar,
        os envios travam até alguém conferir.
      </p>

      <div aria-live="polite">
        {resultado && (
          <p className={`mt-3 flex gap-1.5 ${resultado.status === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {resultado.status === 'ok'
              ? <CheckCircle size={16} weight="fill" className="shrink-0 mt-0.5" aria-hidden />
              : <XCircle size={16} weight="fill" className="shrink-0 mt-0.5" aria-hidden />}
            {resultado.mensagem}
          </p>
        )}
        {enviar.isError && <p className="mt-3 text-red-700 dark:text-red-400" role="alert">{enviar.error.message}</p>}
      </div>
    </Dialogo>
  );
}

// ── Envio em lote ─────────────────────────────────────────────────

function ConfirmarLote({ empresas, aoFechar, aoEnviar }: {
  empresas: HonorarioEmpresa[]; aoFechar: () => void; aoEnviar: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const enviar = useMutation({
    mutationFn: () => enviarHonorariosLote(empresas.map((e) => ({ companyId: e.empresa.id, valorEsperado: e.valor! }))),
    onSuccess: () => {
      toast(`Envio de ${empresas.length} empresa(s) iniciado. O andamento aparece no quadro do Acessórias.`, 'info');
      queryClient.invalidateQueries({ queryKey: ['honorarios', 'acessorias'] });
      aoEnviar();
    },
  });
  const comAlerta = empresas.filter(temAlertaGrave).length;

  return (
    <Dialogo
      titulo={`Atualizar ${empresas.length} honorário(s) no Acessórias`}
      aoFechar={aoFechar}
      largura="lg"
      travado={enviar.isPending}
      rodape={(
        <>
          <button type="button" className="btn-outline min-h-[44px]" onClick={aoFechar} disabled={enviar.isPending}>Cancelar</button>
          <button type="button" className="btn-primary min-h-[44px]" onClick={() => enviar.mutate()} disabled={enviar.isPending} data-autofocus>
            {enviar.isPending ? <Spinner size={16} className="animate-spin" aria-hidden /> : <CloudArrowUp size={16} aria-hidden />}
            Atualizar {empresas.length}
          </button>
        </>
      )}
    >
      {comAlerta > 0 && (
        <p className="mb-3 text-amber-800 dark:text-amber-300 flex gap-1.5">
          <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" aria-hidden />
          {comAlerta} empresa(s) da seleção têm alerta. Confira antes de enviar.
        </p>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">Empresas que serão atualizadas</caption>
        <thead>
          <tr className="text-left text-gray-500 dark:text-zinc-400">
            <th scope="col" className="py-1 pr-2 font-medium">Empresa</th>
            <th scope="col" className="py-1 px-2 font-medium text-right">Acessórias</th>
            <th scope="col" className="py-1 pl-2 font-medium text-right">Vai ficar</th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((e) => (
            <tr key={e.empresa.id} className="border-t border-gray-100 dark:border-zinc-800">
              <td className="py-1.5 pr-2">{e.empresa.razaoSocial}{temAlertaGrave(e) && <span className="text-amber-700 dark:text-amber-300"> · alerta</span>}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{reais(e.acessorias.valor)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums font-medium">{reais(e.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-gray-500 dark:text-zinc-400">
        São cerca de 2 segundos por empresa (limite da API do Acessórias). O envio para sozinho se alguma
        atualização mexer em outro campo.
      </p>
      {enviar.isError && <p className="mt-3 text-red-700 dark:text-red-400" role="alert">{enviar.error.message}</p>}
    </Dialogo>
  );
}

// ── Valor informado à mão ─────────────────────────────────────────

function InformarValor({ e, aoFechar }: { e: HonorarioEmpresa; aoFechar: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inicial = e.manual?.valor ?? e.valor;
  const confirmando = !e.manual && e.valor !== null;
  const [valor, setValor] = useState(inicial ? inicial.toFixed(2).replace('.', ',') : '');
  const [documento, setDocumento] = useState(
    e.manual?.documento ?? (e.documento ? `${e.documento.nomePasta}/${e.documento.caminhoRelativo}` : ''),
  );
  const [observacao, setObservacao] = useState(e.manual?.observacao ?? '');
  const numero = lerValorDigitado(valor);

  const salvar = useMutation({
    mutationFn: () => informarHonorario(e.empresa.id, {
      valor: numero!, documento: documento || undefined, observacao: observacao.trim() || undefined,
    }),
    onSuccess: () => {
      toast('Valor informado.', 'success');
      queryClient.invalidateQueries({ queryKey: ['honorarios'] });
      aoFechar();
    },
  });

  function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (numero && !salvar.isPending) salvar.mutate();
  }

  return (
    <Dialogo
      titulo={confirmando ? 'Conferir honorário' : 'Informar honorário'}
      aoFechar={aoFechar}
      travado={salvar.isPending}
      rodape={(
        <>
          <button type="button" className="btn-outline min-h-[44px]" onClick={aoFechar} disabled={salvar.isPending}>Cancelar</button>
          <button type="submit" form="form-informar" className="btn-primary min-h-[44px]" disabled={!numero || salvar.isPending}>
            {confirmando && numero === e.valor ? 'Confirmar valor' : 'Salvar'}
          </button>
        </>
      )}
    >
      <p className="font-medium text-gray-900 dark:text-zinc-100 mb-1">{e.empresa.razaoSocial}</p>
      {confirmando && (
        <p className="mb-3 text-gray-600 dark:text-zinc-400">
          Valor lido em <span className="break-all">{e.documento?.nome}</span>. Abra o documento na pasta, confira e
          confirme (ou corrija). Depois de confirmado, ele vale mesmo que a leitura mude.
          {temAlertaGrave(e) && <> Alerta: {e.alertas.filter((a) => !INFORMATIVOS.has(a)).map((a) => ALERTA[a].toLowerCase()).join('; ')}.</>}
        </p>
      )}
      <form id="form-informar" onSubmit={enviar} className="space-y-4" noValidate>
        <div>
          <label htmlFor="inf-valor" className="label">Honorário mensal (R$)</label>
          <input id="inf-valor" className="input min-h-[44px]" inputMode="decimal" value={valor}
            onChange={(ev) => setValor(ev.target.value)} placeholder="1.412,00" data-autofocus
            aria-invalid={valor !== '' && !numero} aria-describedby="inf-valor-ajuda" />
          <p id="inf-valor-ajuda" className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
            {valor !== '' && !numero ? 'Valor inválido.' : numero ? `Vai ficar ${reais(numero)}.` : 'Sem o adicional por funcionário.'}
          </p>
        </div>
        <div>
          <label htmlFor="inf-doc" className="label">Documento de onde tirou o valor (opcional)</label>
          <select id="inf-doc" className="input min-h-[44px]" value={documento} onChange={(ev) => setDocumento(ev.target.value)}>
            <option value="">—</option>
            {e.documentos.map((d) => {
              const v = `${d.nomePasta}/${d.caminhoRelativo}`;
              return <option key={v} value={v}>{d.nome} ({dataCurta(d.data ?? d.modificadoEm)})</option>;
            })}
          </select>
        </div>
        <div>
          <label htmlFor="inf-obs" className="label">Observação (opcional)</label>
          <textarea id="inf-obs" className="input" rows={2} maxLength={300} value={observacao}
            onChange={(ev) => setObservacao(ev.target.value)} />
        </div>
        {salvar.isError && <p className="text-red-700 dark:text-red-400" role="alert">{salvar.error.message}</p>}
      </form>
    </Dialogo>
  );
}

// ── Trava de segurança ────────────────────────────────────────────

function Bloqueio({ bloqueio }: { bloqueio: NonNullable<import('../../types').EstadoAcessorias['bloqueio']> }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [ver, setVer] = useState(false);
  const liberar = useMutation({
    mutationFn: () => liberarEnviosAcessorias(bloqueio.id),
    onSuccess: () => {
      toast('Envios liberados.', 'success');
      queryClient.invalidateQueries({ queryKey: ['honorarios'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const valor = (f: Record<string, unknown> | null, k: string) => {
    const v = f?.[k];
    if (v === undefined || v === null || v === '') return '(vazio)';
    const t = typeof v === 'string' ? v : JSON.stringify(v);
    return t.length > 300 ? `${t.slice(0, 300)}…` : t;
  };

  return (
    <div className="card p-5 mb-4 border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30" role="alert">
      <p className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
        <LockSimple size={18} aria-hidden /> Envios ao Acessórias travados
      </p>
      <p className="mt-1 text-sm text-gray-800 dark:text-zinc-200">
        Ao atualizar o honorário de <strong>{bloqueio.razaoSocial}</strong> ({dataHora(bloqueio.enviadoEm)}, conta {bloqueio.conta}),
        estes campos também mudaram no Acessórias: <strong>{bloqueio.outrosCampos.join(', ')}</strong>.
        Confira a empresa no Acessórias, corrija o que for preciso e só então libere.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-outline min-h-[40px]" onClick={() => setVer((v) => !v)} aria-expanded={ver}>
          {ver ? 'Esconder' : 'Ver'} antes e depois
        </button>
        <button type="button" className="btn-danger min-h-[40px]" onClick={() => liberar.mutate()} disabled={liberar.isPending}>
          Já conferi no Acessórias: liberar envios
        </button>
      </div>
      {ver && (
        <table className="mt-3 w-full text-xs">
          <caption className="sr-only">Campos que mudaram</caption>
          <thead>
            <tr className="text-left text-gray-500 dark:text-zinc-400">
              <th scope="col" className="py-1 pr-2">Campo</th><th scope="col" className="py-1 px-2">Antes</th><th scope="col" className="py-1 pl-2">Depois</th>
            </tr>
          </thead>
          <tbody>
            {bloqueio.outrosCampos.map((k) => (
              <tr key={k} className="border-t border-red-100 dark:border-red-900/50 align-top">
                <td className="py-1 pr-2 font-medium">{k}</td>
                <td className="py-1 px-2 break-all">{valor(bloqueio.fichaAntes, k)}</td>
                <td className="py-1 pl-2 break-all">{valor(bloqueio.fichaDepois, k)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Histórico de envios ───────────────────────────────────────────

function Historico() {
  const [aberto, setAberto] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['honorarios', 'envios'],
    queryFn:  () => getEnviosAcessorias(50),
    enabled:  aberto,
  });

  return (
    <div className="mt-6">
      <button type="button" className="btn-ghost min-h-[44px] px-2" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        {aberto ? <CaretDown size={14} aria-hidden /> : <CaretRight size={14} aria-hidden />}
        Histórico de envios ao Acessórias
      </button>
      {aberto && (
        <div className="card p-0 mt-2 overflow-x-auto">
          {isLoading ? (
            <p className="p-4 text-sm text-gray-500 dark:text-zinc-400">Carregando…</p>
          ) : !data?.length ? (
            <p className="p-4 text-sm text-gray-500 dark:text-zinc-400">Nenhum envio ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Últimos envios ao Acessórias</caption>
              <thead className="border-b border-gray-100 dark:border-zinc-800 text-left">
                <tr>
                  <th scope="col" className="table-head">Quando</th>
                  <th scope="col" className="table-head">Empresa</th>
                  <th scope="col" className="table-head text-right">De</th>
                  <th scope="col" className="table-head text-right">Para</th>
                  <th scope="col" className="table-head">Conta</th>
                  <th scope="col" className="table-head">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((x) => (
                  <tr key={x.id} className="border-b border-gray-50 dark:border-zinc-800 align-top">
                    <td className="px-4 py-2 whitespace-nowrap">{dataHora(x.enviadoEm)}</td>
                    <td className="px-4 py-2">{x.razaoSocial}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{reais(x.valorAnterior)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{reais(x.valorEnviado)}</td>
                    <td className="px-4 py-2">{x.conta}</td>
                    <td className="px-4 py-2">
                      {x.status === 'ok' && !x.outrosCampos ? (
                        <span className="text-green-700 dark:text-green-400">Atualizado</span>
                      ) : (
                        <span className="text-red-700 dark:text-red-400">
                          {x.outrosCampos ? `Outros campos mudaram: ${x.outrosCampos.join(', ')}` : x.erro}
                          {x.conferidoEm && ` · conferido por ${x.conferidoPor}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

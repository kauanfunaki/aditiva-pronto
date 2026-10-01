import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MagnifyingGlass, X, FolderSimple, FolderSimpleDashed, CheckCircle, Lightning,
  Prohibit, WarningCircle,
} from '@phosphor-icons/react';
import { listAuditFolders, updateAuditFolderLink } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { maskCNPJ } from '../../utils/validators';
import { SyncBar } from '../../components/audit/SyncBar';
import { EmpresaPicker } from '../../components/audit/EmpresaPicker';
import { EmpresasSemPasta } from '../../components/audit/EmpresasSemPasta';
import type { AuditAcaoVinculo, AuditPasta, AuditPastasResponse } from '../../types';

// Vínculo pasta ↔ empresa (base comum da Auditoria).
// Cada pasta de cliente na rede precisa apontar para uma empresa do app para
// entrar nos relatórios de Contratos e Aditivos.

type Filtro = 'todas' | 'sem' | 'auto' | 'confirmado' | 'ignorado';

const PASSO = 100;

const FILTROS: { id: Filtro; rotulo: string; contar: (r: AuditPastasResponse['resumo']) => number }[] = [
  { id: 'todas',      rotulo: 'Todas',       contar: (r) => r.pastas },
  { id: 'sem',        rotulo: 'Sem vínculo', contar: (r) => r.semVinculo },
  { id: 'auto',       rotulo: 'Automático',  contar: (r) => r.automaticas },
  { id: 'confirmado', rotulo: 'Confirmado',  contar: (r) => r.confirmadas },
  { id: 'ignorado',   rotulo: 'Ignoradas',   contar: (r) => r.ignoradas },
];

function passaNoFiltro(p: AuditPasta, f: Filtro): boolean {
  switch (f) {
    case 'todas':      return true;
    case 'sem':        return !p.vinculo;
    case 'auto':       return p.vinculo?.tipo === 'auto';
    case 'confirmado': return p.vinculo?.tipo === 'confirmado';
    case 'ignorado':   return p.vinculo?.tipo === 'ignorado';
  }
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const BTN_ACAO = 'btn-outline min-h-[44px] px-3 py-1.5 whitespace-nowrap';

export default function Pastas() {
  const qc        = useQueryClient();
  const { toast } = useToast();

  const [params, setParams]   = useSearchParams();
  const aba = params.get('aba') === 'empresas' ? 'empresas' : 'pastas';
  const trocarAba = (nova: 'pastas' | 'empresas') =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nova === 'empresas') next.set('aba', 'empresas');
      else next.delete('aba');
      return next;
    }, { replace: true });

  const [filtro, setFiltro]   = useState<Filtro>('sem');
  const [busca, setBusca]     = useState('');
  const [limite, setLimite]   = useState(PASSO);
  const [picker, setPicker]   = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit', 'folders'],
    queryFn:  listAuditFolders,
  });

  const vinculoMut = useMutation({
    mutationFn: (acao: AuditAcaoVinculo) => updateAuditFolderLink(acao),
    onSuccess: (_r, acao) => {
      qc.invalidateQueries({ queryKey: ['audit', 'folders'] });
      setPicker(null);
      const msg = { vincular: 'Pasta vinculada.', ignorar: 'Pasta marcada como ignorada.', desfazer: 'Vínculo desfeito.' };
      toast(msg[acao.acao], 'success');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    return (data?.pastas ?? []).filter((p) =>
      passaNoFiltro(p, filtro) &&
      (!termo ||
        semAcento(p.nomePasta).includes(termo) ||
        (p.vinculo?.empresa && semAcento(p.vinculo.empresa.razaoSocial).includes(termo))),
    );
  }, [data, filtro, busca]);

  const vincular = (nomePasta: string, companyId: string) =>
    vinculoMut.mutate({ acao: 'vincular', nomePasta, companyId });
  const ignorar  = (nomePasta: string) => vinculoMut.mutate({ acao: 'ignorar', nomePasta });
  const desfazer = (nomePasta: string) => vinculoMut.mutate({ acao: 'desfazer', nomePasta });

  const r = data?.resumo;

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Vínculo de pastas</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5 max-w-3xl">
          Cada pasta de cliente na rede precisa estar ligada a uma empresa para entrar na auditoria de
          contratos e aditivos. Quando o nome bate exatamente (ou a filial bate com a ordem do CNPJ), o
          vínculo é automático. O resto aparece aqui para você confirmar.
        </p>
      </div>

      <SyncBar />

      {isLoading ? (
        <div className="card text-sm text-gray-500 dark:text-zinc-400">Carregando pastas…</div>
      ) : isError ? (
        <div className="card text-sm text-red-700 dark:text-red-300">
          Não foi possível carregar as pastas: {(error as Error).message}
        </div>
      ) : !data?.job || !r ? (
        <div className="card flex flex-col items-center text-center gap-2 py-12">
          <FolderSimpleDashed size={40} className="text-gray-300 dark:text-zinc-600" aria-hidden />
          <p className="font-medium text-gray-800 dark:text-zinc-200">Nenhuma sincronização concluída ainda</p>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-md">
            Assim que o robô terminar a primeira varredura, as pastas aparecem aqui.
          </p>
        </div>
      ) : (
        <>
          {/* ── Resumo ── */}
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4">
            {r.pastas.toLocaleString('pt-BR')} pastas na rede · {r.comSubpastaContrato.toLocaleString('pt-BR')} com
            subpasta de contrato ·{' '}
            <strong className="font-semibold text-gray-800 dark:text-zinc-200">
              {r.empresasAtivasSemPasta.toLocaleString('pt-BR')} de {r.empresasAtivas.toLocaleString('pt-BR')} empresas
              ativas ainda sem pasta
            </strong>
            {r.empresasMarcadasSemPasta > 0 && (
              <> · {r.empresasMarcadasSemPasta.toLocaleString('pt-BR')} marcada(s) sem pasta, fora da auditoria</>
            )}
          </p>

          {/* ── Abas ── */}
          <div className="flex gap-1 border-b border-gray-200 dark:border-zinc-800 mb-5" role="tablist" aria-label="Visão">
            {([
              ['pastas',   `Pastas na rede (${r.pastas})`],
              ['empresas', `Empresas sem pasta (${r.empresasAtivasSemPasta})`],
            ] as const).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={aba === id}
                onClick={() => trocarAba(id)}
                className={`px-4 py-2.5 min-h-[44px] -mb-px border-b-2 text-sm font-medium transition-colors ${
                  aba === id
                    ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                    : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {aba === 'empresas' ? (
            <EmpresasSemPasta empresas={data.empresasSemPasta} />
          ) : (
          <>
          {/* ── Filtros ── */}
          <div className="flex flex-col lg:flex-row gap-3 mb-4">
            <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-zinc-800 rounded-lg p-1" role="group" aria-label="Filtrar pastas">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filtro === f.id}
                  onClick={() => { setFiltro(f.id); setLimite(PASSO); }}
                  className={`px-3 py-1.5 min-h-[36px] rounded-md text-sm font-medium transition-colors ${
                    filtro === f.id
                      ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                      : 'text-gray-600 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {f.rotulo} <span className="tabular-nums text-gray-500 dark:text-zinc-400">{f.contar(r)}</span>
                </button>
              ))}
            </div>

            <div className="relative flex-1">
              <label htmlFor="busca-pasta" className="sr-only">Buscar pasta ou empresa</label>
              <MagnifyingGlass
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none"
                aria-hidden
              />
              <input
                id="busca-pasta"
                className="input pl-9 pr-9"
                placeholder="Buscar pasta ou empresa…"
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setLimite(PASSO); }}
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
                  aria-label="Limpar busca"
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
          </div>

          {/* ── Tabela ── */}
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Pastas de cliente na rede e a empresa vinculada a cada uma</caption>
              <thead className="border-b border-gray-100 dark:border-zinc-800 text-left">
                <tr>
                  <th scope="col" className="table-head">Pasta na rede</th>
                  <th scope="col" className="table-head text-right">Arquivos</th>
                  <th scope="col" className="table-head">Empresa</th>
                  <th scope="col" className="table-head"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-gray-500 dark:text-zinc-400">
                      Nenhuma pasta neste filtro.
                    </td>
                  </tr>
                )}
                {visiveis.slice(0, limite).map((p) => (
                  <Fragment key={p.nomePasta}>
                    <tr className="border-b border-gray-50 dark:border-zinc-800 align-top">
                      <CelulaPasta pasta={p} />
                      <td className="px-5 py-3 text-right tabular-nums text-gray-700 dark:text-zinc-300">{p.arquivos}</td>
                      <CelulaEmpresa
                        pasta={p}
                        ocupado={vinculoMut.isPending}
                        onVincular={(id) => vincular(p.nomePasta, id)}
                      />
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {p.vinculo?.tipo === 'auto' && p.vinculo.empresa && (
                            <button
                              type="button"
                              className={BTN_ACAO}
                              disabled={vinculoMut.isPending}
                              onClick={() => vincular(p.nomePasta, p.vinculo!.empresa!.id)}
                            >
                              Confirmar
                            </button>
                          )}
                          {p.vinculo?.tipo !== 'ignorado' && (
                            <button
                              type="button"
                              className={BTN_ACAO}
                              aria-expanded={picker === p.nomePasta}
                              onClick={() => setPicker(picker === p.nomePasta ? null : p.nomePasta)}
                            >
                              {p.vinculo ? 'Trocar' : 'Escolher empresa'}
                            </button>
                          )}
                          {(!p.vinculo || p.vinculo.tipo === 'auto') && (
                            <button
                              type="button"
                              className={BTN_ACAO}
                              disabled={vinculoMut.isPending}
                              onClick={() => ignorar(p.nomePasta)}
                              title="Para pastas que não são de cliente (SCANNER, CERTIFICADOS…)"
                            >
                              Ignorar
                            </button>
                          )}
                          {p.vinculo && p.vinculo.tipo !== 'auto' && (
                            <button
                              type="button"
                              className={BTN_ACAO}
                              disabled={vinculoMut.isPending}
                              onClick={() => desfazer(p.nomePasta)}
                            >
                              Desfazer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {picker === p.nomePasta && (
                      <tr className="border-b border-gray-50 dark:border-zinc-800">
                        <td colSpan={4} className="px-5 py-3">
                          <EmpresaPicker
                            nomePasta={p.nomePasta}
                            ocupado={vinculoMut.isPending}
                            onEscolher={(id) => vincular(p.nomePasta, id)}
                            onCancelar={() => setPicker(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
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
        </>
      )}
    </div>
  );
}

// ── Células ───────────────────────────────────────────────────────

function CelulaPasta({ pasta }: { pasta: AuditPasta }) {
  return (
    <td className="px-5 py-3">
      <p className="font-medium text-gray-900 dark:text-zinc-100 break-words">{pasta.nomePasta}</p>
      {pasta.subpastasContrato.length > 0 ? (
        pasta.subpastasContrato.map((s) => (
          <p key={s} className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-zinc-400">
            <FolderSimple size={12} aria-hidden /> {s}
          </p>
        ))
      ) : (
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">Sem subpasta de contrato</p>
      )}
      {pasta.erro && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-red-700 dark:text-red-300">
          <WarningCircle size={12} weight="fill" aria-hidden /> Erro ao ler: {pasta.erro}
        </p>
      )}
    </td>
  );
}

function CelulaEmpresa({ pasta, ocupado, onVincular }: {
  pasta: AuditPasta;
  ocupado: boolean;
  onVincular: (companyId: string) => void;
}) {
  const v = pasta.vinculo;

  if (v?.tipo === 'ignorado') {
    return (
      <td className="px-5 py-3">
        <span className="badge-inativo"><Prohibit size={11} weight="fill" aria-hidden /> Ignorada (não é cliente)</span>
      </td>
    );
  }

  if (v && !v.empresa) {
    return (
      <td className="px-5 py-3 text-sm text-red-700 dark:text-red-300">
        A empresa vinculada não existe mais no cadastro. Escolha outra.
      </td>
    );
  }

  if (v?.empresa) {
    return (
      <td className="px-5 py-3">
        <p className="text-gray-900 dark:text-zinc-100">{v.empresa.razaoSocial}</p>
        <p className="text-xs text-gray-500 dark:text-zinc-400 font-mono">{maskCNPJ(v.empresa.cnpj)}</p>
        <p className="mt-1 flex flex-wrap gap-1">
          {v.tipo === 'auto' ? (
            <span className="badge-pending"><Lightning size={11} weight="fill" aria-hidden /> Automático</span>
          ) : (
            <span className="badge-ready"><CheckCircle size={11} weight="fill" aria-hidden /> Confirmado</span>
          )}
          {v.empresa.inativo && <span className="badge-inativo">Empresa inativa</span>}
        </p>
      </td>
    );
  }

  // Sem vínculo: sugestões
  if (!pasta.sugestoes.length) {
    return <td className="px-5 py-3 text-sm text-gray-500 dark:text-zinc-400">Nenhuma empresa parecida.</td>;
  }
  return (
    <td className="px-5 py-3">
      <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Sugestões</p>
      <ul className="space-y-1.5">
        {pasta.sugestoes.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-gray-900 dark:text-zinc-100">{s.razaoSocial}</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                <span className="font-mono">{maskCNPJ(s.cnpj)}</span> · {Math.round(s.similaridade * 100)}% parecido
                {s.filialConfere && <span className="ml-1 font-medium text-green-700 dark:text-green-300">· filial confere</span>}
              </p>
            </div>
            <button
              type="button"
              className="btn-outline shrink-0 min-h-[44px] px-3 py-1.5"
              disabled={ocupado}
              onClick={() => onVincular(s.id)}
              aria-label={`Vincular a ${s.razaoSocial}`}
            >
              Vincular
            </button>
          </li>
        ))}
      </ul>
    </td>
  );
}

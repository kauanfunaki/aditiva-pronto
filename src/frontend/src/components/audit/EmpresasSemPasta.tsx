import { useId, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlass, X, FolderSimple, Prohibit } from '@phosphor-icons/react';
import { updateAuditEmpresaSemPasta, updateAuditFolderLink } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { maskCNPJ } from '../../utils/validators';
import type { AuditEmpresaSemPasta } from '../../types';

// Aba "Empresas sem pasta" da tela de vínculo: empresas ativas que não têm nenhuma
// pasta vinculada. Dá para vincular a uma pasta sugerida (o caminho inverso da aba
// de pastas) ou marcar a empresa como "sem pasta de propósito" — aí ela sai da auditoria.

type Filtro = 'pendentes' | 'marcadas';

const PASSO = 100;
const BTN = 'btn-outline min-h-[44px] px-3 py-1.5 whitespace-nowrap';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function EmpresasSemPasta({ empresas }: { empresas: AuditEmpresaSemPasta[] }) {
  const qc        = useQueryClient();
  const { toast } = useToast();
  const buscaId   = useId();

  const [filtro, setFiltro]       = useState<Filtro>('pendentes');
  const [busca, setBusca]         = useState('');
  const [limite, setLimite]       = useState(PASSO);
  const [marcando, setMarcando]   = useState<string | null>(null);
  const [motivo, setMotivo]       = useState('');

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['audit', 'folders'] });
    qc.invalidateQueries({ queryKey: ['audit', 'aditivos'] });
  };

  const marcaMut = useMutation({
    mutationFn: updateAuditEmpresaSemPasta,
    onSuccess: (_r, v) => {
      recarregar();
      setMarcando(null);
      setMotivo('');
      toast(v.acao === 'marcar' ? 'Empresa marcada como sem pasta. Ela saiu da auditoria.' : 'Marca removida. A empresa voltou para a auditoria.', 'success');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const vinculoMut = useMutation({
    mutationFn: (v: { nomePasta: string; companyId: string }) =>
      updateAuditFolderLink({ acao: 'vincular', ...v }),
    onSuccess: () => { recarregar(); toast('Pasta vinculada.', 'success'); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const ocupado = marcaMut.isPending || vinculoMut.isPending;
  const qtd = {
    pendentes: empresas.filter((e) => !e.marcada).length,
    marcadas:  empresas.filter((e) => e.marcada).length,
  };

  const visiveis = useMemo(() => {
    const t = semAcento(busca.trim());
    const d = busca.replace(/\D/g, '');
    return empresas.filter((e) =>
      (filtro === 'marcadas' ? e.marcada : !e.marcada) &&
      (!t || semAcento(e.razaoSocial).includes(t) || (d.length >= 3 && e.cnpj.replace(/\D/g, '').includes(d))),
    );
  }, [empresas, filtro, busca]);

  return (
    <>
      <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4 max-w-3xl">
        Empresas ativas sem nenhuma pasta vinculada. Se a pasta existe com outro nome, vincule pela
        sugestão (ou pela aba de pastas). Se a empresa não tem pasta na rede de propósito, marque como
        <strong className="font-semibold"> sem pasta</strong>: ela sai da auditoria de contratos e aditivos.
      </p>

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 dark:bg-zinc-800 rounded-lg p-1" role="group" aria-label="Filtrar empresas">
          {(['pendentes', 'marcadas'] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => { setFiltro(f); setLimite(PASSO); }}
              className={`px-3 py-1.5 min-h-[36px] rounded-md text-sm font-medium transition-colors ${
                filtro === f
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                  : 'text-gray-600 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200'
              }`}
            >
              {f === 'pendentes' ? 'Sem pasta' : 'Marcadas sem pasta'}{' '}
              <span className="tabular-nums text-gray-500 dark:text-zinc-400">{qtd[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <label htmlFor={buscaId} className="sr-only">Buscar empresa ou CNPJ</label>
          <MagnifyingGlass size={16} aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none" />
          <input
            id={buscaId}
            className="input pl-9 pr-9"
            placeholder="Buscar empresa ou CNPJ…"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setLimite(PASSO); }}
          />
          {busca && (
            <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca"
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300">
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Empresas ativas sem pasta vinculada</caption>
          <thead className="border-b border-gray-100 dark:border-zinc-800 text-left">
            <tr>
              <th scope="col" className="table-head">Empresa</th>
              <th scope="col" className="table-head">{filtro === 'marcadas' ? 'Motivo' : 'Pastas parecidas'}</th>
              <th scope="col" className="table-head"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-gray-500 dark:text-zinc-400">
                  {filtro === 'marcadas' ? 'Nenhuma empresa marcada como sem pasta.' : 'Nenhuma empresa sem pasta neste filtro.'}
                </td>
              </tr>
            )}
            {visiveis.slice(0, limite).map((e) => (
              <tr key={e.id} className="border-b border-gray-50 dark:border-zinc-800 align-top">
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-900 dark:text-zinc-100">{e.razaoSocial}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    <span className="font-mono">{maskCNPJ(e.cnpj)}</span>
                    {e.responsavel && <> · {e.responsavel}</>}
                  </p>
                </td>

                <td className="px-5 py-3">
                  {e.marcada ? (
                    <div>
                      <span className="badge-inativo"><Prohibit size={11} weight="fill" aria-hidden /> Sem pasta (fora da auditoria)</span>
                      <p className="mt-1 text-gray-700 dark:text-zinc-300">{e.motivo || <span className="text-gray-400 dark:text-zinc-500">Sem motivo informado</span>}</p>
                      {e.marcadoEm && (
                        <p className="text-xs text-gray-500 dark:text-zinc-400">
                          Marcada em {new Date(e.marcadoEm).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  ) : e.sugestoesDePasta.length === 0 ? (
                    <span className="text-gray-500 dark:text-zinc-400">Nenhuma pasta livre parecida.</span>
                  ) : (
                    <ul className="space-y-1.5">
                      {e.sugestoesDePasta.map((s) => (
                        <li key={s.nomePasta} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 text-gray-900 dark:text-zinc-100">
                              <FolderSimple size={14} className="shrink-0 text-gray-400" aria-hidden /> {s.nomePasta}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-zinc-400">
                              {Math.round(s.similaridade * 100)}% parecido
                              {s.filialConfere && <span className="ml-1 font-medium text-green-700 dark:text-green-300">· filial confere</span>}
                            </p>
                          </div>
                          <button
                            type="button"
                            className={BTN}
                            disabled={ocupado}
                            onClick={() => vinculoMut.mutate({ nomePasta: s.nomePasta, companyId: e.id })}
                            aria-label={`Vincular ${e.razaoSocial} à pasta ${s.nomePasta}`}
                          >
                            Vincular
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>

                <td className="px-5 py-3">
                  {e.marcada ? (
                    <div className="flex justify-end">
                      <button type="button" className={BTN} disabled={ocupado}
                        onClick={() => marcaMut.mutate({ acao: 'desmarcar', companyId: e.id })}>
                        Desmarcar
                      </button>
                    </div>
                  ) : marcando === e.id ? (
                    <form
                      className="flex flex-col gap-2 min-w-[240px]"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        marcaMut.mutate({ acao: 'marcar', companyId: e.id, motivo: motivo.trim() || undefined });
                      }}
                    >
                      <label htmlFor={`motivo-${e.id}`} className="text-xs text-gray-600 dark:text-zinc-400">
                        Motivo (opcional)
                      </label>
                      <input
                        id={`motivo-${e.id}`}
                        className="input"
                        maxLength={300}
                        placeholder="Ex.: MEI, contrato fica com o cliente"
                        value={motivo}
                        onChange={(ev) => setMotivo(ev.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <button type="button" className={BTN} onClick={() => { setMarcando(null); setMotivo(''); }}>
                          Cancelar
                        </button>
                        <button type="submit" className="btn-primary min-h-[44px]" disabled={ocupado}>
                          Marcar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex justify-end">
                      <button type="button" className={BTN} disabled={ocupado}
                        onClick={() => { setMarcando(e.id); setMotivo(''); }}
                        title="A empresa não tem pasta na rede de propósito: sai da auditoria">
                        Marcar sem pasta
                      </button>
                    </div>
                  )}
                </td>
              </tr>
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
  );
}

import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowsClockwise, CheckCircle, Clock, WarningCircle, Robot, MagnifyingGlass,
} from '@phosphor-icons/react';
import { getAuditStatus, requestAuditSync } from '../../services/api';
import { useToast } from '../../context/ToastContext';

// Barra de sincronização da Auditoria — a mesma nos módulos Contratos, Aditivos
// e na tela de vínculo de pastas. Um clique pede a varredura; o robô no PC das
// automações pega o pedido e manda o inventário. Enquanto roda, consulta a cada 3 s.

export const AUDIT_STATUS_KEY = ['audit', 'status'] as const;

const fmtNum = (v: number) => v.toLocaleString('pt-BR');

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function tempoRelativo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1)  return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24)   return `há ${h} h`;
  return `em ${dataHora(iso)}`;
}

export function SyncBar() {
  const qc        = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: AUDIT_STATUS_KEY,
    queryFn:  getAuditStatus,
    refetchInterval: (q) => (q.state.data?.ativo ? 3_000 : 30_000),
  });

  // Avisa quando a sincronização que estava rodando termina e recarrega os relatórios.
  const ativoAnterior = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const anterior = ativoAnterior.current;
    ativoAnterior.current = data.ativo?.id ?? null;
    if (!anterior || data.ativo?.id === anterior) return;

    if (data.ultimoConcluido?.id === anterior) {
      toast('Sincronização concluída.', 'success');
      qc.invalidateQueries({ queryKey: ['audit'] });
    } else if (data.ultimoErro?.id === anterior) {
      toast(`A sincronização falhou: ${data.ultimoErro.erro ?? 'erro desconhecido'}`, 'error');
    }
  }, [data, qc, toast]);

  const syncMut = useMutation({
    mutationFn: requestAuditSync,
    onSuccess: (r) => {
      if (!r.criado) toast('Já existe uma sincronização em andamento.', 'info');
      qc.invalidateQueries({ queryKey: AUDIT_STATUS_KEY });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const ativo     = data?.ativo ?? null;
  const robo      = data?.robo ?? null;
  const ocupado   = !!ativo || syncMut.isPending;
  const total     = ativo?.pastasTotal ?? null;
  const progresso = ativo && total ? Math.min(100, Math.round((ativo.pastasRecebidas / total) * 100)) : 0;

  // ── Linha principal ───────────────────────────────────────────
  let principal: React.ReactNode;
  if (isLoading) {
    principal = <span className="text-gray-500 dark:text-zinc-400">Carregando…</span>;
  } else if (isError) {
    principal = (
      <span className="flex items-center gap-2 text-red-700 dark:text-red-300">
        <WarningCircle size={18} weight="fill" aria-hidden />
        Não foi possível consultar a sincronização.
      </span>
    );
  } else if (ativo?.status === 'pendente') {
    principal = (
      <span className="flex items-center gap-2 text-gray-800 dark:text-zinc-200">
        <Clock size={18} className="text-amber-600 dark:text-amber-400" aria-hidden />
        Aguardando o robô começar a varredura…
      </span>
    );
  } else if (ativo?.status === 'executando') {
    principal = (
      <span className="flex items-center gap-2 text-gray-800 dark:text-zinc-200">
        <MagnifyingGlass size={18} className="text-brand-600 dark:text-brand-400" aria-hidden />
        Varrendo as pastas da rede: {fmtNum(ativo.pastasRecebidas)} de {total ? fmtNum(total) : '…'}
        <span className="text-gray-500 dark:text-zinc-400">· {fmtNum(ativo.arquivosRecebidos)} arquivos até agora</span>
      </span>
    );
  } else if (data?.ultimoConcluido) {
    const u = data.ultimoConcluido;
    principal = (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-800 dark:text-zinc-200">
        <CheckCircle size={18} weight="fill" className="text-green-600 dark:text-green-400" aria-hidden />
        <span>
          Última sincronização {tempoRelativo(u.concluidoEm ?? u.solicitadoEm)}
          {u.origem === 'agendado' ? ' (automática)' : ''}
        </span>
        <span className="text-gray-500 dark:text-zinc-400">
          · {fmtNum(u.pastasRecebidas)} pastas · {fmtNum(u.arquivosRecebidos)} arquivos
        </span>
      </span>
    );
  } else {
    principal = (
      <span className="text-gray-700 dark:text-zinc-300">
        Nenhuma sincronização ainda. Clique em <strong className="font-semibold">Sincronizar</strong> para a primeira varredura.
      </span>
    );
  }

  return (
    <section className="card p-4 mb-6" aria-label="Sincronização com a pasta de rede">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0 space-y-1.5 text-sm" aria-live="polite">
          <div>{principal}</div>

          {!ativo && data?.ultimoErro && (
            <p className="flex items-start gap-2 text-red-700 dark:text-red-300">
              <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" aria-hidden />
              <span>
                A tentativa de {dataHora(data.ultimoErro.solicitadoEm)} falhou: {data.ultimoErro.erro ?? 'erro desconhecido'}.
                {data.ultimoConcluido && ' O relatório mostra a última sincronização que deu certo.'}
              </span>
            </p>
          )}

          {!isLoading && !isError && (
            <p className={`flex items-center gap-2 text-xs ${
              robo?.online ? 'text-gray-500 dark:text-zinc-400' : 'text-amber-700 dark:text-amber-300'
            }`}>
              <Robot size={14} aria-hidden />
              {robo?.online
                ? `Robô ${robo.host} online`
                : robo
                  ? `Robô offline desde ${dataHora(robo.vistoEm)}${ativo ? ' — a varredura começa quando ele voltar' : ''}`
                  : 'O robô ainda não se conectou'}
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn-primary shrink-0 min-h-[44px] justify-center"
          onClick={() => syncMut.mutate()}
          disabled={ocupado || isLoading}
          title="Pede ao robô uma nova varredura das pastas dos clientes"
        >
          <ArrowsClockwise size={16} className={ocupado ? 'animate-spin' : ''} aria-hidden />
          {ativo ? 'Sincronizando…' : 'Sincronizar'}
        </button>
      </div>

      {ativo?.status === 'executando' && (
        <div
          className="mt-4 h-1.5 w-full rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden"
          role="progressbar"
          aria-label="Progresso da varredura"
          aria-valuemin={0}
          aria-valuemax={total ?? 0}
          aria-valuenow={ativo.pastasRecebidas}
        >
          <div className="h-full bg-brand-600 dark:bg-brand-400 transition-all" style={{ width: `${progresso}%` }} />
        </div>
      )}
    </section>
  );
}

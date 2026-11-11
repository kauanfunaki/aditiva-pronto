import { useId, useState } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ChatText, CheckCircle, Circle, PencilSimple } from '@phosphor-icons/react';
import { Dialogo } from '../Dialogo';
import { saveAuditConferencia } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import type { AuditConferencia, AuditSituacaoConferencia } from '../../types';

// Conferência manual da auditoria (pedido do Societário, 11/11/2026): o robô não acerta
// todo contrato/aditivo, a equipe confere na pasta e marca Resolvido/Pendente com um
// comentário. "Resolvido" tira a empresa da lista de pendentes. Igual em Contratos e Aditivos.

const MAX_COMENTARIO = 2000;

interface LinhaComConferencia {
  emDia:       boolean;
  status:      string;
  conferencia: AuditConferencia | null;
}

export const resolvida = (l: { conferencia: AuditConferencia | null }) => l.conferencia?.situacao === 'resolvido';
/** Mesma regra do backend (auditConferencia.ts). */
export const ehPendente = (l: LinhaComConferencia) => !l.emDia && l.status !== 'DISTRATO' && !resolvida(l);
export const resolvidaManualmente = (l: LinhaComConferencia) => !l.emDia && l.status !== 'DISTRATO' && resolvida(l);

function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

interface Props {
  modulo:      'contratos' | 'aditivos';
  /** Ano de referência (só aditivos). */
  ano?:        number;
  companyId:   string;
  razaoSocial: string;
  conferencia: AuditConferencia | null;
  /** Chave do relatório no React Query: a gravação atualiza a linha no cache, sem recarregar tudo. */
  queryKey:    QueryKey;
}

export function ConferenciaCelula({ modulo, ano, companyId, razaoSocial, conferencia, queryKey }: Props) {
  const [aberto, setAberto] = useState(false);
  const ok = conferencia?.situacao === 'resolvido';

  return (
    <div className="min-w-[160px] max-w-[260px]">
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ok
        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
        : 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300'}`}>
        {ok ? <CheckCircle size={12} weight="fill" aria-hidden /> : <Circle size={12} aria-hidden />}
        {ok ? 'Resolvido' : 'Pendente'}
      </span>
      {conferencia?.comentario && (
        <p className="mt-1 text-xs text-gray-600 dark:text-zinc-400 line-clamp-2 whitespace-pre-line" title={conferencia.comentario}>
          <ChatText size={12} className="inline mr-1 -mt-0.5" aria-hidden />
          {conferencia.comentario}
        </p>
      )}
      {conferencia && (
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-zinc-500">
          {conferencia.atualizadoPor} · {dataHora(conferencia.atualizadoEm)}
        </p>
      )}
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 min-h-[32px] text-xs font-medium
                   text-brand-700 hover:bg-gray-100 dark:text-brand-300 dark:hover:bg-zinc-800"
        aria-label={`Conferir ${razaoSocial}: marcar resolvido ou pendente e comentar`}
      >
        <PencilSimple size={12} aria-hidden /> {conferencia ? 'Editar' : 'Conferir'}
      </button>
      {aberto && (
        <DialogoConferencia
          modulo={modulo} ano={ano} companyId={companyId} razaoSocial={razaoSocial}
          conferencia={conferencia} queryKey={queryKey} aoFechar={() => setAberto(false)}
        />
      )}
    </div>
  );
}

function DialogoConferencia({ modulo, ano, companyId, razaoSocial, conferencia, queryKey, aoFechar }: Props & { aoFechar: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const idComentario = useId();
  const idSituacao = useId();
  const [situacao, setSituacao] = useState<AuditSituacaoConferencia>(conferencia?.situacao ?? 'pendente');
  const [comentario, setComentario] = useState(conferencia?.comentario ?? '');

  const salvar = useMutation({
    mutationFn: () => saveAuditConferencia({
      companyId, modulo, ano: modulo === 'aditivos' ? ano : undefined, situacao, comentario: comentario.trim() || null,
    }),
    onSuccess: (r) => {
      // Atualiza só a linha no relatório em cache: contadores e filtros são calculados na tela.
      qc.setQueryData<{ empresas: { empresa: { id: string }; conferencia: AuditConferencia | null }[] }>(queryKey, (antigo) =>
        antigo && {
          ...antigo,
          empresas: antigo.empresas.map((e) => (e.empresa.id === companyId ? { ...e, conferencia: r.conferencia } : e)),
        });
      toast(situacao === 'resolvido' ? 'Marcada como resolvida.' : 'Conferência salva.', 'success');
      aoFechar();
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const opcao = (valor: AuditSituacaoConferencia, rotulo: string, ajuda: string) => (
    <label className={`flex-1 flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${situacao === valor
      ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/30'
      : 'border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}>
      <input
        type="radio" name={idSituacao} value={valor} checked={situacao === valor}
        onChange={() => setSituacao(valor)} className="mt-1"
        {...(valor === 'resolvido' ? { 'data-autofocus': true } : {})}
      />
      <span>
        <span className="block text-sm font-medium text-gray-900 dark:text-zinc-100">{rotulo}</span>
        <span className="block text-xs text-gray-500 dark:text-zinc-400">{ajuda}</span>
      </span>
    </label>
  );

  return (
    <Dialogo
      titulo={`Conferência — ${razaoSocial}`}
      aoFechar={aoFechar}
      travado={salvar.isPending}
      rodape={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline min-h-[44px]" onClick={aoFechar} disabled={salvar.isPending}>Cancelar</button>
          <button type="button" className="btn-primary min-h-[44px]" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      }
    >
      <fieldset>
        <legend className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
          Situação {modulo === 'aditivos' && ano ? `do aditivo de ${ano}` : 'do contrato'}
        </legend>
        <div className="flex flex-col sm:flex-row gap-2">
          {opcao('pendente', 'Pendente', 'Continua na lista de pendentes.')}
          {opcao('resolvido', 'Resolvido', 'Conferido à mão: sai da lista de pendentes.')}
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor={idComentario} className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
          Comentário
        </label>
        <textarea
          id={idComentario}
          className="input min-h-[120px]"
          maxLength={MAX_COMENTARIO}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ex.: aditivo assinado está na pasta com outro nome; arquivo renomeado em 14/11."
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400 text-right tabular-nums">
          {comentario.length}/{MAX_COMENTARIO}
        </p>
      </div>
      <p className="text-xs text-gray-500 dark:text-zinc-400">
        A classificação automática do robô continua aparecendo ao lado. Se o arquivo for renomeado, a próxima
        sincronização reconhece e a empresa passa a “em dia” por conta própria.
      </p>
    </Dialogo>
  );
}

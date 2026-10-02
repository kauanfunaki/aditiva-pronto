import { FileX, Info } from '@phosphor-icons/react';
import type { AuditDistrato } from '../../types';

// Distrato da empresa, igual nas três telas (Aditivos, Contratos e Honorários).
// Regras: src/backend/src/services/auditDistrato.ts.

const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : null);

export function AvisoDistrato({ distrato }: { distrato: AuditDistrato | null }) {
  if (!distrato) return null;
  const { efetivo, desconsiderado, avisos } = distrato;
  if (!efetivo && !desconsiderado && !avisos.length) return null;

  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {efetivo && (
        <li className="flex items-start gap-1 text-gray-700 dark:text-zinc-300" title={efetivo.caminhoRelativo}>
          <FileX size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {dataBr(efetivo.dataFim) ? <>Serviços até {dataBr(efetivo.dataFim)}</> : 'Distrato na pasta'}
            {' · '}
            {efetivo.assinado
              ? 'assinado'
              : <span className="text-amber-700 dark:text-amber-300">sem assinatura</span>}
          </span>
        </li>
      )}
      {desconsiderado && (
        <li className="flex items-start gap-1 text-gray-500 dark:text-zinc-400" title={desconsiderado.documento.caminhoRelativo}>
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Distrato desconsiderado: há contrato mais novo ({dataBr(desconsiderado.contratoMaisNovoEm)})
          </span>
        </li>
      )}
      {(['bpo', 'social'] as const).map((tipo) => {
        // Várias versões do mesmo distrato (Word, PDF, assinado): um aviso por tipo.
        const doTipo = avisos.filter((a) => a.tipo === tipo);
        if (!doTipo.length) return null;
        const datas = doTipo.map((a) => a.dataFim).filter((d): d is string => !!d).sort();
        const fim = datas.length ? datas[datas.length - 1] : null;
        return (
          <li key={tipo} className="flex items-start gap-1 text-gray-500 dark:text-zinc-400"
            title={doTipo.map((a) => a.caminhoRelativo).join('\n')}>
            <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {tipo === 'bpo' ? 'Distrato do BPO (a contabilidade segue)' : 'Distrato social (dissolução da empresa)'}
              {dataBr(fim) && <> · até {dataBr(fim)}</>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export const CLASSE_DISTRATO = 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100';

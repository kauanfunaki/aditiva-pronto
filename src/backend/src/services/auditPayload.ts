// Contrato entre o robô coletor e o app (docs/PLANO-AUDITORIA-CONTRATOS-ADITIVOS.md, seção 8.3).
// Mudou aqui, muda no doc e no robô — é a fronteira entre o trabalho do Kauan e o do Angelo.

import { z } from 'zod';

export const MAX_PASTAS_POR_LOTE   = 500;
export const MAX_ARQUIVOS_POR_LOTE = 5000;

export const proximoJobSchema = z.object({
  host:   z.string().trim().min(1).max(100),
  versao: z.string().trim().max(30).optional(),
});

const arquivoSchema = z.object({
  caminhoRelativo: z.string().min(1).max(1000),
  nome:            z.string().min(1).max(300),
  ext:             z.string().max(20).transform((s) => s.toLowerCase()),
  tamanho:         z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  modificadoEm:    z.string().datetime({ offset: true }),
  pdf: z.object({
    assinado: z.boolean(),
    marca:    z.enum(['icp']).nullable(),
  }).nullable().optional(),
});

const pastaSchema = z.object({
  nomePasta:         z.string().trim().min(1).max(300),
  subpastasContrato: z.array(z.string().min(1).max(300)).max(50),
  erro:              z.string().max(1000).nullable().optional(),
  arquivos:          z.array(arquivoSchema).max(MAX_ARQUIVOS_POR_LOTE),
});

export const loteSchema = z.object({
  totalPastas: z.number().int().positive().max(100_000).optional(),
  pastas:      z.array(pastaSchema).min(1).max(MAX_PASTAS_POR_LOTE),
}).superRefine((lote, ctx) => {
  const total = lote.pastas.reduce((n, p) => n + p.arquivos.length, 0);
  if (total > MAX_ARQUIVOS_POR_LOTE) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      message: `Lote com ${total} arquivos; o máximo é ${MAX_ARQUIVOS_POR_LOTE}. Divida em lotes menores.`,
    });
  }
  const nomes = new Set<string>();
  for (const p of lote.pastas) {
    const chave = p.nomePasta.normalize('NFC');
    if (nomes.has(chave)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Pasta repetida no mesmo lote: "${p.nomePasta}".` });
    }
    nomes.add(chave);
  }
});

export const concluirSchema = z.object({
  totais: z.object({
    pastas:   z.number().int().nonnegative(),
    arquivos: z.number().int().nonnegative(),
  }),
});

export const falharSchema = z.object({
  erro: z.string().trim().min(1).max(2000),
});

export const vincularPastaSchema = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('vincular'), nomePasta: z.string().trim().min(1).max(300), companyId: z.string().uuid() }),
  z.object({ acao: z.literal('ignorar'),  nomePasta: z.string().trim().min(1).max(300) }),
  z.object({ acao: z.literal('desfazer'), nomePasta: z.string().trim().min(1).max(300) }),
]);

export const marcaSemPastaSchema = z.discriminatedUnion('acao', [
  z.object({
    acao:      z.literal('marcar'),
    companyId: z.string().uuid(),
    motivo:    z.string().trim().max(300).optional().transform((m) => m || null),
  }),
  z.object({ acao: z.literal('desmarcar'), companyId: z.string().uuid() }),
]);

export type MarcaSemPasta = z.infer<typeof marcaSemPastaSchema>;
export type Lote          = z.infer<typeof loteSchema>;
export type PastaDoLote   = Lote['pastas'][number];
export type VincularPasta = z.infer<typeof vincularPastaSchema>;

/** Mensagem curta e legível a partir de um erro do Zod. */
export function resumirErroZod(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

/** Chave da sessão: `null` = ninguém logado. */
export const CHAVE_SESSAO = ['auth', 'me'] as const;

/**
 * Troca a sessão e descarta os dados da conta anterior. Não usar `queryClient.clear()`:
 * ele remove também a consulta da sessão, e o App continuaria olhando a instância antiga.
 */
export function definirSessao<T>(usuario: T | null): void {
  queryClient.setQueryData(CHAVE_SESSAO, usuario);
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== CHAVE_SESSAO[0] });
}

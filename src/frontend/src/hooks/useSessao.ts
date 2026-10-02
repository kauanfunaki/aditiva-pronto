import { useQuery } from '@tanstack/react-query';
import { getSessao } from '../services/api';
import { CHAVE_SESSAO } from '../services/queryClient';

/** `usuario` undefined = ainda conferindo; null = precisa entrar. */
export function useSessao() {
  const q = useQuery({
    queryKey: CHAVE_SESSAO,
    queryFn:  getSessao,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { usuario: q.data, carregando: q.isPending, erro: q.error };
}

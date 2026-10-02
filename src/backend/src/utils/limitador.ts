// Limite de tentativas em memória (janela fixa por chave).
// O app roda numa instância só; se um dia rodar em várias, o limite passa a valer por instância.

export class Limitador {
  private readonly falhas = new Map<string, { quantidade: number; inicio: number }>();

  constructor(
    private readonly maximo: number,
    private readonly janelaMs: number,
    private readonly agora: () => number = Date.now,
  ) {}

  /** true quando a chave já gastou as tentativas da janela atual. */
  bloqueado(chave: string): boolean {
    const r = this.falhas.get(chave);
    if (!r) return false;
    if (this.agora() - r.inicio >= this.janelaMs) {
      this.falhas.delete(chave);
      return false;
    }
    return r.quantidade >= this.maximo;
  }

  registrarFalha(chave: string): void {
    const t = this.agora();
    const r = this.falhas.get(chave);
    if (!r || t - r.inicio >= this.janelaMs) this.falhas.set(chave, { quantidade: 1, inicio: t });
    else r.quantidade += 1;
    if (this.falhas.size > 10_000) this.limparVencidas();
  }

  limpar(chave: string): void {
    this.falhas.delete(chave);
  }

  private limparVencidas(): void {
    const t = this.agora();
    for (const [chave, r] of this.falhas) {
      if (t - r.inicio >= this.janelaMs) this.falhas.delete(chave);
    }
  }
}

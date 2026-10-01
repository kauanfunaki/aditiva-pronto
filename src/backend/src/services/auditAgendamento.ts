// Sincronização automática diária — decisão pura (sem banco, sem relógio).
//
// Não há cron no servidor: a cada consulta do robô ("tem job?") o app verifica
// se já passou do horário agendado de hoje e se ninguém pediu uma
// sincronização depois disso. Se o robô estiver offline no horário, o job é
// criado assim que ele voltar.

export const FUSO_PADRAO = 'America/Sao_Paulo';

interface PartesLocais { ano: number; mes: number; dia: number; hora: number; minuto: number }

function partesNoFuso(instante: Date, fuso: string): PartesLocais {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(instante).map((x) => [x.type, x.value]));
  return {
    ano:    Number(p.year),
    mes:    Number(p.month),
    dia:    Number(p.day),
    hora:   Number(p.hour),
    minuto: Number(p.minute),
  };
}

/** Instante (UTC) do horário 'HH:MM' de hoje no fuso, tomando `agora` como referência de "hoje". */
export function horarioDeHoje(agora: Date, horario: string, fuso = FUSO_PADRAO): Date {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(horario);
  if (!m) throw new Error(`Horário agendado inválido: "${horario}" (esperado HH:MM).`);

  const local = partesNoFuso(agora, fuso);
  // Diferença entre o relógio local e o UTC neste instante (ex.: -3 h em São Paulo).
  const relogioLocalComoUtc = Date.UTC(local.ano, local.mes - 1, local.dia, local.hora, local.minuto);
  const deslocamento = relogioLocalComoUtc - Math.floor(agora.getTime() / 60_000) * 60_000;

  return new Date(Date.UTC(local.ano, local.mes - 1, local.dia, Number(m[1]), Number(m[2])) - deslocamento);
}

/**
 * true quando já passou do horário de hoje e o último job (de qualquer origem)
 * foi pedido antes desse horário — inclusive se nunca houve job.
 */
export function deveCriarJobAgendado(
  agora: Date,
  horario: string | null,
  ultimoJobSolicitadoEm: Date | null,
  fuso = FUSO_PADRAO,
): boolean {
  if (!horario) return false;
  const alvo = horarioDeHoje(agora, horario, fuso);
  if (agora < alvo) return false;
  return !ultimoJobSolicitadoEm || ultimoJobSolicitadoEm < alvo;
}

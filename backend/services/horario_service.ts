import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import { horarioRepository, type Horario, type HorarioDados } from "../repositories/horario_repository";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MIN_DIA = 24 * 60;
const MIN_SEMANA = 7 * MIN_DIA;

class horarioservice {
  async listar(pizzariaId: string): Promise<Horario[]> {
    return horarioRepository.listByPizzaria(pizzariaId);
  }

  // Substitui a semana inteira (a tela edita todos os turnos de uma vez).
  // Lista vazia = sem horário cadastrado: o site não aceita pedidos
  async substituir(pizzariaId: string, horarios: HorarioDados[]): Promise<Horario[]> {
    validarSobreposicao(horarios);

    return withTransaction(async (conn) => {
      await horarioRepository.deleteByPizzaria(pizzariaId, conn);
      await horarioRepository.createMany(pizzariaId, horarios, conn);
      return horarioRepository.listByPizzaria(pizzariaId, conn);
    });
  }
}

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

// Turno em minutos da semana [inicio, fim). Turno que vira a noite de sábado
// continua no domingo, então é partido em dois pedaços
function trechosDaSemana(h: HorarioDados): [number, number][] {
  const abre = minutos(h.abre);
  const fecha = minutos(h.fecha);
  const duracao = fecha > abre ? fecha - abre : MIN_DIA - abre + fecha;
  const inicio = h.diaSemana * MIN_DIA + abre;
  const fim = inicio + duracao;
  return fim <= MIN_SEMANA ? [[inicio, fim]] : [[inicio, MIN_SEMANA], [0, fim - MIN_SEMANA]];
}

function descrever(h: HorarioDados): string {
  return `${DIAS[h.diaSemana]} ${h.abre}–${h.fecha}`;
}

const DIAS_INTL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Minuto da semana (0 = domingo 00:00) no fuso da pizzaria
export function minutoDaSemana(agora: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return DIAS_INTL.indexOf(valor("weekday")) * MIN_DIA + Number(valor("hour")) * 60 + Number(valor("minute"));
}

// Sem horário cadastrado = fechada. O turno que começou ontem e vira a noite conta hoje
export function estaAberta(horarios: HorarioDados[], fuso: string, agora: Date = new Date()): boolean {
  const minuto = minutoDaSemana(agora, fuso);
  return horarios.some((h) => trechosDaSemana(h).some(([inicio, fim]) => minuto >= inicio && minuto < fim));
}

// Turnos encostados (um fecha 15:00, outro abre 15:00) são permitidos; sobrepostos não
export function validarSobreposicao(horarios: HorarioDados[]): void {
  const trechos = horarios
    .flatMap((horario) => trechosDaSemana(horario).map(([inicio, fim]) => ({ inicio, fim, horario })))
    .sort((a, b) => a.inicio - b.inicio);

  for (let i = 1; i < trechos.length; i++) {
    const anterior = trechos[i - 1];
    const atual = trechos[i];
    if (atual.inicio < anterior.fim) {
      throw new AppError(
        `Horários sobrepostos: ${descrever(anterior.horario)} e ${descrever(atual.horario)}`,
        400,
        "HORARIOS_SOBREPOSTOS"
      );
    }
  }
}

export const horarioService = new horarioservice();

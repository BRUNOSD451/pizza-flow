import { AppError } from "../errors/app_error";
import type { Papel } from "../repositories/member_repository";

export const STATUS_PEDIDO = [
  "aguardando_aceite",
  "recebido",
  "preparando",
  "pronto",
  "saiu_para_entrega",
  "finalizado",
  "cancelado",
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const TIPOS_PEDIDO = ["delivery", "retirada", "local"] as const;
export type TipoPedido = (typeof TIPOS_PEDIDO)[number];

export interface Transicao {
  statusAtual: StatusPedido;
  statusNovo: StatusPedido;
  tipo: TipoPedido;
  entregadorId: string | null;
  papel: Papel;
  membroId: string;
}

interface Regra {
  de: StatusPedido;
  para: StatusPedido;
  // Ausente = vale para todos os tipos de pedido
  tipos?: TipoPedido[];
  papeis: Papel[];
}

const GESTAO: Papel[] = ["dono", "gerente"];

const NAO_FINAIS: StatusPedido[] = ["aguardando_aceite", "recebido", "preparando", "pronto", "saiu_para_entrega"];

const REGRAS: Regra[] = [
  { de: "aguardando_aceite", para: "recebido", papeis: [...GESTAO, "atendente"] },
  { de: "recebido", para: "preparando", papeis: [...GESTAO, "cozinha"] },
  { de: "preparando", para: "pronto", papeis: [...GESTAO, "cozinha"] },
  { de: "pronto", para: "saiu_para_entrega", tipos: ["delivery"], papeis: [...GESTAO, "entregador"] },
  { de: "saiu_para_entrega", para: "finalizado", tipos: ["delivery"], papeis: [...GESTAO, "entregador"] },
  { de: "pronto", para: "finalizado", tipos: ["retirada", "local"], papeis: [...GESTAO, "atendente"] },
  // O atendente só cancela ao recusar um pedido que ainda não foi aceito
  ...NAO_FINAIS.map(
    (de): Regra => ({ de, para: "cancelado", papeis: de === "aguardando_aceite" ? [...GESTAO, "atendente"] : GESTAO })
  ),
];

// Lança AppError se o pedido não pode ir para o novo status, ou se este membro não pode levá-lo até lá
export function validarTransicao(t: Transicao): void {
  const regra = REGRAS.find(
    (r) => r.de === t.statusAtual && r.para === t.statusNovo && (!r.tipos || r.tipos.includes(t.tipo))
  );
  if (!regra) {
    throw new AppError(`Um pedido ${t.tipo} em ${t.statusAtual} não pode ir para ${t.statusNovo}`, 400, "TRANSICAO_INVALIDA");
  }

  if (!regra.papeis.includes(t.papel) || (t.papel === "entregador" && t.entregadorId !== t.membroId)) {
    throw new AppError("Você não tem permissão para esta ação", 403, "SEM_PERMISSAO");
  }

  if (t.statusNovo === "saiu_para_entrega" && !t.entregadorId) {
    throw new AppError("Atribua um entregador antes de o pedido sair", 400, "ENTREGADOR_NAO_ATRIBUIDO");
  }
}

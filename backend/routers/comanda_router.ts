import { Router } from "express";
import { comandaController } from "../controllers/comanda_controller";
import { pagamentoController } from "../controllers/pagamento_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Comandas do salão: abrir na mesa, lançar pedidos, fechar a conta e receber (pode dividir)
export const comandaRouter = Router();

comandaRouter.use(autenticar);

const SALAO = ["dono", "gerente", "atendente", "garcom"] as const;

comandaRouter.get("/", exigirPapel(...SALAO), comandaController.list);
comandaRouter.post("/", exigirPapel(...SALAO), comandaController.create);
comandaRouter.get("/:id", exigirPapel(...SALAO), comandaController.show);
comandaRouter.post("/:id/pedidos", exigirPapel(...SALAO), comandaController.lancarPedido);
comandaRouter.post("/:id/fechar", exigirPapel(...SALAO), comandaController.fechar);
// Comanda aberta por engano (todos os pedidos já cancelados)
comandaRouter.post("/:id/cancelar", exigirPapel("dono", "gerente"), comandaController.cancelar);

// Estornar algo já pago é só da gestão (services/pagamento_regras.ts)
comandaRouter.get("/:id/pagamentos", exigirPapel(...SALAO), pagamentoController.listarDaComanda);
comandaRouter.post("/:id/pagamentos", exigirPapel(...SALAO), pagamentoController.registrarNaComanda);
comandaRouter.patch("/:id/pagamentos/:pagamentoId", exigirPapel(...SALAO), pagamentoController.alterarNaComanda);

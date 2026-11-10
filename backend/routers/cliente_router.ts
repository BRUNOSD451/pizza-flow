import { Router } from "express";
import { clienteController } from "../controllers/cliente_controller";
import { autenticar } from "../middlewares/autenticar";
import { exigirPapel } from "../middlewares/permissoes";

// Clientes da pizzaria e seus endereços de entrega
export const clienteRouter = Router();

clienteRouter.use(autenticar, exigirPapel("dono", "gerente", "atendente"));

clienteRouter.get("/", clienteController.list);
clienteRouter.get("/:id", clienteController.show);
clienteRouter.post("/", clienteController.create);
clienteRouter.patch("/:id", clienteController.edit);

clienteRouter.post("/:id/enderecos", clienteController.createEndereco);
clienteRouter.patch("/:id/enderecos/:enderecoId", clienteController.editEndereco);
clienteRouter.delete("/:id/enderecos/:enderecoId", clienteController.removeEndereco);

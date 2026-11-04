import type { Request, Response } from "express";
import { editarPizzariaSchema } from "../schemas/pizzaria_schema";
import { pizzariaService } from "../services/pizzaria_service";

class pizzariacontroller {
  // GET /pizzaria
  show = async (req: Request, res: Response) => {
    res.json(await pizzariaService.buscar(req.auth!.pizzariaId!));
  };

  // PATCH /pizzaria
  edit = async (req: Request, res: Response) => {
    const dados = editarPizzariaSchema.parse(req.body ?? {});
    res.json(
      await pizzariaService.editarLoja(req.auth!.pizzariaId!, {
        nome: dados.nome,
        slug: dados.slug,
        telefone: dados.telefone,
        logoUrl: dados.logo_url,
        corPrimaria: dados.cor_primaria,
        fusoHorario: dados.fuso_horario,
        regraPrecoPizza: dados.regra_preco_pizza,
        tempoAlvoPreparoMin: dados.tempo_alvo_preparo_min,
        taxaEntregaPadrao: dados.taxa_entrega_padrao,
        aceitandoPedidos: dados.aceitando_pedidos,
        pedidoMinimo: dados.pedido_minimo,
      })
    );
  };
}

export const pizzariaController = new pizzariacontroller();

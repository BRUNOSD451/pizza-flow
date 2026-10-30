import { AppError } from "../errors/app_error";
import { categoriaRepository, type TipoCategoria } from "../repositories/categoria_repository";

class categoriaservice {
  // Sabor só entra em categoria de pizza e produto em categoria de produto, sempre da própria pizzaria
  async validar(pizzariaId: string, categoriaId: string | null | undefined, tipo: TipoCategoria) {
    if (!categoriaId) return;
    const categoria = await categoriaRepository.findById(pizzariaId, categoriaId);
    if (!categoria || categoria.tipo !== tipo) {
      throw new AppError(`Categoria não encontrada ou não é de ${tipo}`, 400, "CATEGORIA_INVALIDA");
    }
  }
}

export const categoriaService = new categoriaservice();

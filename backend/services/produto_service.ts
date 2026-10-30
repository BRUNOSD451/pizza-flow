import { AppError } from "../errors/app_error";
import {
  produtoRepository,
  type CriarProdutoDados,
  type EditarProdutoDados,
  type Produto,
} from "../repositories/produto_repository";
import { categoriaService } from "./categoria_service";

const PRODUTO_NAO_ENCONTRADO = () => new AppError("Produto não encontrado", 404, "PRODUTO_NAO_ENCONTRADO");

class produtoservice {
  async listar(pizzariaId: string): Promise<Produto[]> {
    return produtoRepository.listByPizzaria(pizzariaId);
  }

  async criar(pizzariaId: string, dados: CriarProdutoDados): Promise<Produto> {
    await categoriaService.validar(pizzariaId, dados.categoriaId, "produto");
    return produtoRepository.create(pizzariaId, dados);
  }

  // Pedidos antigos guardam snapshot de nome e preço, então editar não altera o que já foi vendido
  async editar(pizzariaId: string, produtoId: string, dados: EditarProdutoDados): Promise<Produto> {
    if (!(await produtoRepository.findById(pizzariaId, produtoId))) throw PRODUTO_NAO_ENCONTRADO();
    await categoriaService.validar(pizzariaId, dados.categoriaId, "produto");

    const editado = await produtoRepository.edit(pizzariaId, produtoId, dados);
    if (!editado) throw PRODUTO_NAO_ENCONTRADO();
    return editado;
  }
}

export const produtoService = new produtoservice();

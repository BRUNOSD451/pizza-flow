import { AppError } from "../errors/app_error";
import {
  categoriaRepository,
  type Categoria,
  type CriarCategoriaDados,
  type EditarCategoriaDados,
  type TipoCategoria,
} from "../repositories/categoria_repository";

const CATEGORIA_NAO_ENCONTRADA = () => new AppError("Categoria não encontrada", 404, "CATEGORIA_NAO_ENCONTRADA");
const NOME_EM_USO = () => new AppError("Já existe uma categoria com este nome neste tipo", 409, "CATEGORIA_JA_EXISTE");

class categoriaservice {
  async listar(pizzariaId: string): Promise<Categoria[]> {
    return categoriaRepository.listByPizzaria(pizzariaId);
  }

  async criar(pizzariaId: string, dados: CriarCategoriaDados): Promise<Categoria> {
    try {
      return await categoriaRepository.create(pizzariaId, dados);
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw NOME_EM_USO();
      throw error;
    }
  }

  // Desligar (ativo = false) esconde a seção inteira do cardápio, com os sabores/produtos dela
  async editar(pizzariaId: string, categoriaId: string, dados: EditarCategoriaDados): Promise<Categoria> {
    if (!(await categoriaRepository.findById(pizzariaId, categoriaId))) throw CATEGORIA_NAO_ENCONTRADA();

    try {
      const editada = await categoriaRepository.edit(pizzariaId, categoriaId, dados);
      if (!editada) throw CATEGORIA_NAO_ENCONTRADA();
      return editada;
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw NOME_EM_USO();
      throw error;
    }
  }

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

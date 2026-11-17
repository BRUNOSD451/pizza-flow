import { AppError } from "../errors/app_error";
import { mesaRepository, type CriarMesaDados, type EditarMesaDados, type Mesa } from "../repositories/mesa_repository";

const MESA_NAO_ENCONTRADA = () => new AppError("Mesa não encontrada", 404, "MESA_NAO_ENCONTRADA");
const NOME_EM_USO = () => new AppError("Já existe uma mesa com este nome", 409, "MESA_JA_EXISTE");

function eDuplicado(error: unknown): boolean {
  return (error as { code?: string }).code === "ER_DUP_ENTRY";
}

class mesaservice {
  async listar(pizzariaId: string): Promise<Mesa[]> {
    return mesaRepository.listByPizzaria(pizzariaId);
  }

  async criar(pizzariaId: string, dados: CriarMesaDados): Promise<Mesa> {
    try {
      return await mesaRepository.create(pizzariaId, dados);
    } catch (error) {
      if (eDuplicado(error)) throw NOME_EM_USO();
      throw error;
    }
  }

  // Desligar (ativo = false) tira a mesa do salão sem perder o histórico das comandas
  async editar(pizzariaId: string, mesaId: string, dados: EditarMesaDados): Promise<Mesa> {
    if (dados.ativo === false) {
      const mesa = await mesaRepository.findById(pizzariaId, mesaId);
      if (mesa?.comanda_aberta_id) {
        throw new AppError("Feche a comanda desta mesa antes de desativá-la", 400, "MESA_OCUPADA");
      }
    }

    try {
      const editada = await mesaRepository.edit(pizzariaId, mesaId, dados);
      if (!editada) throw MESA_NAO_ENCONTRADA();
      return editada;
    } catch (error) {
      if (eDuplicado(error)) throw NOME_EM_USO();
      throw error;
    }
  }
}

export const mesaService = new mesaservice();

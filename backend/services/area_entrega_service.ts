import { AppError } from "../errors/app_error";
import {
  areaEntregaRepository,
  type AreaEntrega,
  type CriarAreaEntregaDados,
  type EditarAreaEntregaDados,
} from "../repositories/area_entrega_repository";

const AREA_NAO_ENCONTRADA = () => new AppError("Área de entrega não encontrada", 404, "AREA_ENTREGA_NAO_ENCONTRADA");
// A collation do banco ignora maiúsculas e acentos: "Centro" e "centro" são o mesmo bairro
const BAIRRO_EM_USO = () =>
  new AppError("Já existe uma área de entrega para este bairro nesta cidade", 409, "AREA_ENTREGA_JA_EXISTE");

function eDuplicado(error: unknown): boolean {
  return (error as { code?: string }).code === "ER_DUP_ENTRY";
}

class areaentregaservice {
  async listar(pizzariaId: string): Promise<AreaEntrega[]> {
    return areaEntregaRepository.listByPizzaria(pizzariaId);
  }

  async criar(pizzariaId: string, dados: CriarAreaEntregaDados): Promise<AreaEntrega> {
    try {
      return await areaEntregaRepository.create(pizzariaId, dados);
    } catch (error) {
      if (eDuplicado(error)) throw BAIRRO_EM_USO();
      throw error;
    }
  }

  // Pedidos já feitos guardam a taxa cobrada, então mudar a taxa só vale para os próximos.
  // Desligar (ativo = false) tira o bairro das opções de entrega sem perder o histórico
  async editar(pizzariaId: string, areaId: string, dados: EditarAreaEntregaDados): Promise<AreaEntrega> {
    try {
      const editada = await areaEntregaRepository.edit(pizzariaId, areaId, dados);
      if (!editada) throw AREA_NAO_ENCONTRADA();
      return editada;
    } catch (error) {
      if (eDuplicado(error)) throw BAIRRO_EM_USO();
      throw error;
    }
  }
}

export const areaEntregaService = new areaentregaservice();

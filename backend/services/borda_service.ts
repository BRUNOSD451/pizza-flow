import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import { bordaRepository, type BordaComPrecos, type EditarBordaDados } from "../repositories/borda_repository";
import type { PrecoPorTamanho } from "../repositories/tamanho_repository";
import { tamanhoService } from "./tamanho_service";

export interface CriarBordaDados {
  nome: string;
  precos: PrecoPorTamanho[];
}

export interface EditarBordaComPrecosDados extends EditarBordaDados {
  precos?: PrecoPorTamanho[];
}

const BORDA_NAO_ENCONTRADA = () => new AppError("Borda não encontrada", 404, "BORDA_NAO_ENCONTRADA");

class bordaservice {
  async listar(pizzariaId: string): Promise<BordaComPrecos[]> {
    return bordaRepository.listByPizzaria(pizzariaId);
  }

  // Borda e preços entram juntos: ou grava tudo ou nada
  async criar(pizzariaId: string, dados: CriarBordaDados): Promise<BordaComPrecos> {
    await tamanhoService.validarPrecos(pizzariaId, dados.precos);

    return withTransaction(async (conn) => {
      const criada = await bordaRepository.create(pizzariaId, dados.nome, conn);
      await bordaRepository.substituirPrecos(pizzariaId, criada.id, dados.precos, conn);
      return (await bordaRepository.findById(pizzariaId, criada.id, conn))!;
    });
  }

  // Se `precos` vier, substitui a tabela de preços inteira da borda
  async editar(pizzariaId: string, bordaId: string, dados: EditarBordaComPrecosDados): Promise<BordaComPrecos> {
    const { precos, ...borda } = dados;
    if (!(await bordaRepository.findById(pizzariaId, bordaId))) throw BORDA_NAO_ENCONTRADA();
    if (precos) await tamanhoService.validarPrecos(pizzariaId, precos);

    return withTransaction(async (conn) => {
      if (!(await bordaRepository.edit(pizzariaId, bordaId, borda, conn))) throw BORDA_NAO_ENCONTRADA();
      if (precos) await bordaRepository.substituirPrecos(pizzariaId, bordaId, precos, conn);
      return (await bordaRepository.findById(pizzariaId, bordaId, conn))!;
    });
  }
}

export const bordaService = new bordaservice();

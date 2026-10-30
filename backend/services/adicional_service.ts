import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import {
  adicionalRepository,
  type AdicionalComPrecos,
  type CriarAdicionalDados,
  type EditarAdicionalDados,
} from "../repositories/adicional_repository";
import type { PrecoPorTamanho } from "../repositories/tamanho_repository";
import { tamanhoService } from "./tamanho_service";

export interface CriarAdicionalComPrecosDados extends CriarAdicionalDados {
  precos: PrecoPorTamanho[];
}

export interface EditarAdicionalComPrecosDados extends EditarAdicionalDados {
  precos?: PrecoPorTamanho[];
}

const ADICIONAL_NAO_ENCONTRADO = () => new AppError("Adicional não encontrado", 404, "ADICIONAL_NAO_ENCONTRADO");

class adicionalservice {
  async listar(pizzariaId: string): Promise<AdicionalComPrecos[]> {
    return adicionalRepository.listByPizzaria(pizzariaId);
  }

  // Adicional e preços por tamanho entram juntos: ou grava tudo ou nada
  async criar(pizzariaId: string, dados: CriarAdicionalComPrecosDados): Promise<AdicionalComPrecos> {
    const { precos, ...adicional } = dados;
    await tamanhoService.validarPrecos(pizzariaId, precos);

    return withTransaction(async (conn) => {
      const criado = await adicionalRepository.create(pizzariaId, adicional, conn);
      await adicionalRepository.substituirPrecos(pizzariaId, criado.id, precos, conn);
      return (await adicionalRepository.findById(pizzariaId, criado.id, conn))!;
    });
  }

  // Se `precos` vier, substitui os preços por tamanho inteiros ([] volta a usar só o padrão)
  async editar(pizzariaId: string, adicionalId: string, dados: EditarAdicionalComPrecosDados): Promise<AdicionalComPrecos> {
    const { precos, ...adicional } = dados;
    if (!(await adicionalRepository.findById(pizzariaId, adicionalId))) throw ADICIONAL_NAO_ENCONTRADO();
    if (precos) await tamanhoService.validarPrecos(pizzariaId, precos);

    return withTransaction(async (conn) => {
      if (!(await adicionalRepository.edit(pizzariaId, adicionalId, adicional, conn))) throw ADICIONAL_NAO_ENCONTRADO();
      if (precos) await adicionalRepository.substituirPrecos(pizzariaId, adicionalId, precos, conn);
      return (await adicionalRepository.findById(pizzariaId, adicionalId, conn))!;
    });
  }
}

export const adicionalService = new adicionalservice();

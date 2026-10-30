import { withTransaction } from "../db/db";
import { AppError } from "../errors/app_error";
import {
  saborRepository,
  type CriarSaborDados,
  type EditarSaborDados,
  type SaborComPrecos,
} from "../repositories/sabor_repository";
import type { PrecoPorTamanho } from "../repositories/tamanho_repository";
import { categoriaService } from "./categoria_service";
import { tamanhoService } from "./tamanho_service";

export interface CriarSaborComPrecosDados extends CriarSaborDados {
  precos: PrecoPorTamanho[];
}

export interface EditarSaborComPrecosDados extends EditarSaborDados {
  precos?: PrecoPorTamanho[];
}

const SABOR_NAO_ENCONTRADO = () => new AppError("Sabor não encontrado", 404, "SABOR_NAO_ENCONTRADO");

class saborservice {
  async listar(pizzariaId: string): Promise<SaborComPrecos[]> {
    return saborRepository.listByPizzaria(pizzariaId);
  }

  // Sabor e preços entram juntos: ou grava tudo ou nada
  async criar(pizzariaId: string, dados: CriarSaborComPrecosDados): Promise<SaborComPrecos> {
    const { precos, ...sabor } = dados;
    await categoriaService.validar(pizzariaId, sabor.categoriaId, "pizza");
    await tamanhoService.validarPrecos(pizzariaId, precos);

    return withTransaction(async (conn) => {
      const criado = await saborRepository.create(pizzariaId, sabor, conn);
      await saborRepository.substituirPrecos(pizzariaId, criado.id, precos, conn);
      return (await saborRepository.findById(pizzariaId, criado.id, conn))!;
    });
  }

  // Se `precos` vier, substitui a tabela de preços inteira do sabor
  async editar(pizzariaId: string, saborId: string, dados: EditarSaborComPrecosDados): Promise<SaborComPrecos> {
    const { precos, ...sabor } = dados;
    if (!(await saborRepository.findById(pizzariaId, saborId))) throw SABOR_NAO_ENCONTRADO();
    await categoriaService.validar(pizzariaId, sabor.categoriaId, "pizza");
    if (precos) await tamanhoService.validarPrecos(pizzariaId, precos);

    return withTransaction(async (conn) => {
      if (!(await saborRepository.edit(pizzariaId, saborId, sabor, conn))) throw SABOR_NAO_ENCONTRADO();
      if (precos) await saborRepository.substituirPrecos(pizzariaId, saborId, precos, conn);
      return (await saborRepository.findById(pizzariaId, saborId, conn))!;
    });
  }
}

export const saborService = new saborservice();

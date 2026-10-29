// Erro esperado de regra de negócio: a mensagem vai para o cliente com o status informado.
// Qualquer outro erro lançado vira 500 com mensagem genérica.
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

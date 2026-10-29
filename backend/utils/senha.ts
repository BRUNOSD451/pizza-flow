import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// Sem caracteres que se confundem ao ditar ou ler (0/O, 1/l/I)
const ALFABETO_SENHA = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TAMANHO_SENHA_TEMPORARIA = 10;

export function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, SALT_ROUNDS);
}

export function compararSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}

// randomInt usa gerador criptográfico (Math.random seria previsível)
export function gerarSenhaTemporaria(): string {
  let senha = "";
  for (let i = 0; i < TAMANHO_SENHA_TEMPORARIA; i++) {
    senha += ALFABETO_SENHA[randomInt(ALFABETO_SENHA.length)];
  }
  return senha;
}

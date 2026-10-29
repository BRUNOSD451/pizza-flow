import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, SALT_ROUNDS);
}

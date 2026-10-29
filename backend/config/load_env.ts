import dotenv from "dotenv";
import path from "node:path";

// O .env fica na raiz do projeto, não em backend/.
// Só carrega: scripts de banco (migrate, seed) importam isto sem precisar das variáveis da API.
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

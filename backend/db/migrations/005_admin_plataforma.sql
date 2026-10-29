-- Pizza Flow - admin da plataforma (dono do SaaS)
-- Acesso global a todas as pizzarias, fora do sistema de membros.
-- Só é ligado pelo script `npm run seed:admin` ou direto no banco; nenhuma rota da API altera essa flag.

SET NAMES utf8mb4;

ALTER TABLE usuarios
    ADD COLUMN admin_plataforma BOOLEAN NOT NULL DEFAULT FALSE AFTER senha_hash;

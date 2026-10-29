-- Pizza Flow - troca de senha obrigatória
-- Membros cadastrados pelo dono recebem uma senha aleatória provisória.
-- Enquanto deve_trocar_senha = TRUE, a API só libera /auth/me e /auth/trocar-senha.

SET NAMES utf8mb4;

ALTER TABLE usuarios
    ADD COLUMN deve_trocar_senha BOOLEAN NOT NULL DEFAULT FALSE AFTER senha_hash;

-- Pizza Flow - cada usuário pertence a uma única pizzaria
-- Antes: o mesmo usuário podia ser membro de várias pizzarias (único só por pizzaria + usuário)
-- Agora: um usuário tem no máximo um registro em membros. Quem trabalha em duas pizzarias usa dois emails.
-- O admin da plataforma não é membro de nenhuma pizzaria, então não é afetado.

SET NAMES utf8mb4;

-- O novo UNIQUE (usuario_id) já garante o antigo (pizzaria_id, usuario_id)
ALTER TABLE membros
    ADD UNIQUE KEY uq_membros_usuario (usuario_id),
    DROP INDEX uq_membros_pizzaria_usuario;

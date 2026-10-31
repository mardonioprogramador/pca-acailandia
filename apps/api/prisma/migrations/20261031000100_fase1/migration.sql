-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'ORGAO');

-- CreateEnum
CREATE TYPE "TipoOrgao" AS ENUM ('ADMINISTRACAO_DIRETA', 'AUTARQUIA', 'FUNDO', 'OUTRO');

-- CreateEnum
CREATE TYPE "SituacaoExercicio" AS ENUM ('RASCUNHO', 'ABERTO', 'FECHADO', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "SituacaoLista" AS ENUM ('NAO_INICIADA', 'EM_PREENCHIMENTO', 'ENVIADA');

-- CreateEnum
CREATE TYPE "SituacaoObjeto" AS ENUM ('ATIVO', 'PENDENTE', 'INATIVO');

-- CreateEnum
CREATE TYPE "OrigemObjeto" AS ENUM ('SEED', 'ADMIN', 'MANUAL');

-- CreateTable
CREATE TABLE "Orgao" (
    "id" UUID NOT NULL,
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoOrgao" NOT NULL,
    "grupoUnificacao" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Orgao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "orgaoId" UUID,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "trocaSenhaPendente" BOOLEAN NOT NULL DEFAULT true,
    "tentativasLogin" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMPTZ(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercicio" (
    "id" UUID NOT NULL,
    "ano" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "situacao" "SituacaoExercicio" NOT NULL DEFAULT 'RASCUNHO',
    "inicioPreenchimento" TIMESTAMPTZ(3) NOT NULL,
    "fimPreenchimento" TIMESTAMPTZ(3) NOT NULL,
    "atoPublicacao" TEXT,

    CONSTRAINT "Exercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListaOrgao" (
    "id" UUID NOT NULL,
    "exercicioId" UUID NOT NULL,
    "orgaoId" UUID NOT NULL,
    "situacao" "SituacaoLista" NOT NULL DEFAULT 'NAO_INICIADA',
    "enviadaEm" TIMESTAMPTZ(3),
    "enviadaPor" UUID,

    CONSTRAINT "ListaOrgao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjetoCatalogo" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "naturezaPadrao" TEXT,
    "modalidadePadrao" TEXT NOT NULL,
    "elementoDespesa" TEXT,
    "siglasExercicioAnterior" TEXT[],
    "ordem" INTEGER NOT NULL,
    "situacao" "SituacaoObjeto" NOT NULL DEFAULT 'ATIVO',
    "origem" "OrigemObjeto" NOT NULL DEFAULT 'SEED',

    CONSTRAINT "ObjetoCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" UUID NOT NULL,
    "usuarioId" UUID,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Orgao_sigla_key" ON "Orgao"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_orgaoId_idx" ON "Usuario"("orgaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Exercicio_ano_key" ON "Exercicio"("ano");

-- CreateIndex
CREATE INDEX "ListaOrgao_orgaoId_idx" ON "ListaOrgao"("orgaoId");

-- CreateIndex
CREATE UNIQUE INDEX "ListaOrgao_exercicioId_orgaoId_key" ON "ListaOrgao"("exercicioId", "orgaoId");

-- CreateIndex
CREATE UNIQUE INDEX "ObjetoCatalogo_codigo_key" ON "ObjetoCatalogo"("codigo");

-- CreateIndex
CREATE INDEX "ObjetoCatalogo_origem_ordem_idx" ON "ObjetoCatalogo"("origem", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "Sessao_tokenHash_key" ON "Sessao"("tokenHash");

-- CreateIndex
CREATE INDEX "Sessao_usuarioId_idx" ON "Sessao"("usuarioId");

-- CreateIndex
CREATE INDEX "Sessao_expiraEm_idx" ON "Sessao"("expiraEm");

-- CreateIndex
CREATE INDEX "Auditoria_entidade_entidadeId_idx" ON "Auditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "Orgao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaOrgao" ADD CONSTRAINT "ListaOrgao_orgaoId_fkey" FOREIGN KEY ("orgaoId") REFERENCES "Orgao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaOrgao" ADD CONSTRAINT "ListaOrgao_exercicioId_fkey" FOREIGN KEY ("exercicioId") REFERENCES "Exercicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integridade de domínio também no banco, além da validação HTTP.
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_perfil_orgao_check"
  CHECK (("perfil" = 'ADMIN' AND "orgaoId" IS NULL) OR ("perfil" = 'ORGAO' AND "orgaoId" IS NOT NULL));
ALTER TABLE "Exercicio" ADD CONSTRAINT "Exercicio_periodo_check"
  CHECK ("fimPreenchimento" >= "inicioPreenchimento");
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_email_normalizado_check" CHECK ("email" = lower("email"));

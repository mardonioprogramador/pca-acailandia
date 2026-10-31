import type { Request, Router } from 'express';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { exercicioSchema, orgaoSchema, senhaSchema, usuarioSchema } from '@pca/shared';
import { prisma } from './prisma.js';
import { contexto, exigirAdministrador, usuarioPublico } from './autenticacao.js';
import { auditar, ErroHttp, rota } from './http.js';

const id = (req: Request) => z.string().uuid().parse(req.params.id);

async function validarOrgao(tx: Prisma.TransactionClient, orgaoId: string | null, ativo: boolean) {
  if (!orgaoId) return;
  const orgao = await tx.orgao.findUnique({ where: { id: orgaoId } });
  if (!orgao || (ativo && !orgao.ativo)) throw new ErroHttp(400, 'Selecione um órgão ativo válido.');
}

async function bloquearAdministradores(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM "Usuario" WHERE perfil = 'ADMIN' ORDER BY id FOR UPDATE`;
}

async function preservarAdministrador(tx: Prisma.TransactionClient, usuarioId: string) {
  if (!await tx.usuario.count({ where: { id: { not: usuarioId }, perfil: 'ADMIN', ativo: true } })) {
    throw new ErroHttp(409, 'Mantenha pelo menos um administrador ativo.');
  }
}

export function rotasCadastros(router: Router) {
  router.use(['/orgaos', '/usuarios', '/exercicios'], exigirAdministrador);

  router.get('/orgaos', rota(async (_req, res) => {
    res.json(await prisma.orgao.findMany({ orderBy: [{ ordem: 'asc' }, { sigla: 'asc' }] }));
  }));
  router.get('/orgaos/:id', rota(async (req, res) => {
    const orgao = await prisma.orgao.findUnique({ where: { id: id(req) } });
    if (!orgao) throw new ErroHttp(404, 'Órgão não encontrado.');
    res.json(orgao);
  }));
  router.post('/orgaos', rota(async (req, res) => {
    const dados = orgaoSchema.parse(req.body);
    const orgao = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20250001)`;
      const criado = await tx.orgao.create({ data: dados });
      const exercicios = await tx.exercicio.findMany({ select: { id: true } });
      if (exercicios.length) await tx.listaOrgao.createMany({ data: exercicios.map((exercicio) => ({ orgaoId: criado.id, exercicioId: exercicio.id })) });
      await auditar(tx, contexto(req).usuario.id, 'Orgao', criado.id, 'CRIAR', undefined, criado);
      return criado;
    });
    res.status(201).json(orgao);
  }));
  router.put('/orgaos/:id', rota(async (req, res) => {
    const orgaoId = id(req);
    const dados = orgaoSchema.parse(req.body);
    const orgao = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Orgao" WHERE id = ${orgaoId}::uuid FOR UPDATE`;
      const antes = await tx.orgao.findUniqueOrThrow({ where: { id: orgaoId } });
      const depois = await tx.orgao.update({ where: { id: orgaoId }, data: dados });
      if (!depois.ativo) await tx.sessao.deleteMany({ where: { usuario: { orgaoId } } });
      await auditar(tx, contexto(req).usuario.id, 'Orgao', orgaoId, 'ALTERAR', antes, depois);
      return depois;
    });
    res.json(orgao);
  }));
  router.delete('/orgaos/:id', rota(async (req, res) => {
    const orgaoId = id(req);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Orgao" WHERE id = ${orgaoId}::uuid FOR UPDATE`;
      const antes = await tx.orgao.findUniqueOrThrow({ where: { id: orgaoId } });
      const depois = await tx.orgao.update({ where: { id: orgaoId }, data: { ativo: false } });
      await tx.sessao.deleteMany({ where: { usuario: { orgaoId } } });
      await auditar(tx, contexto(req).usuario.id, 'Orgao', orgaoId, 'INATIVAR', antes, depois);
    });
    res.status(204).end();
  }));

  router.get('/usuarios', rota(async (_req, res) => {
    const usuarios = await prisma.usuario.findMany({ include: { orgao: true }, orderBy: { nome: 'asc' } });
    res.json(usuarios.map(usuarioPublico));
  }));
  router.get('/usuarios/:id', rota(async (req, res) => {
    const usuario = await prisma.usuario.findUnique({ where: { id: id(req) }, include: { orgao: true } });
    if (!usuario) throw new ErroHttp(404, 'Usuário não encontrado.');
    res.json(usuarioPublico(usuario));
  }));
  router.post('/usuarios', rota(async (req, res) => {
    const { senha, ...dados } = usuarioSchema.parse(req.body);
    if (!senha) throw new ErroHttp(400, 'Defina a senha inicial do usuário.');
    const senhaHash = await hash(senha, 12);
    const usuario = await prisma.$transaction(async (tx) => {
      await validarOrgao(tx, dados.orgaoId, dados.ativo);
      const criado = await tx.usuario.create({ data: { ...dados, senhaHash, trocaSenhaPendente: true }, include: { orgao: true } });
      await auditar(tx, contexto(req).usuario.id, 'Usuario', criado.id, 'CRIAR', undefined, usuarioPublico(criado));
      return criado;
    });
    res.status(201).json(usuarioPublico(usuario));
  }));
  router.put('/usuarios/:id', rota(async (req, res) => {
    const usuarioId = id(req);
    const { senha, ...dados } = usuarioSchema.parse(req.body);
    if (senha !== undefined) throw new ErroHttp(400, 'Use a redefinição de senha para alterar a senha de outro usuário.');
    const usuario = await prisma.$transaction(async (tx) => {
      await bloquearAdministradores(tx);
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${usuarioId}::uuid FOR UPDATE`;
      const antes = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId }, include: { orgao: true } });
      if (antes.perfil === 'ADMIN' && antes.ativo && (dados.perfil !== 'ADMIN' || !dados.ativo)) await preservarAdministrador(tx, usuarioId);
      await validarOrgao(tx, dados.orgaoId, dados.ativo);
      const depois = await tx.usuario.update({ where: { id: usuarioId }, data: dados, include: { orgao: true } });
      if (!depois.ativo || antes.perfil !== depois.perfil || antes.orgaoId !== depois.orgaoId) {
        await tx.sessao.deleteMany({ where: { usuarioId } });
      }
      await auditar(tx, contexto(req).usuario.id, 'Usuario', usuarioId, 'ALTERAR', usuarioPublico(antes), usuarioPublico(depois));
      return depois;
    });
    res.json(usuarioPublico(usuario));
  }));
  router.delete('/usuarios/:id', rota(async (req, res) => {
    const usuarioId = id(req);
    await prisma.$transaction(async (tx) => {
      await bloquearAdministradores(tx);
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${usuarioId}::uuid FOR UPDATE`;
      const antes = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId }, include: { orgao: true } });
      if (antes.perfil === 'ADMIN' && antes.ativo) await preservarAdministrador(tx, usuarioId);
      const depois = await tx.usuario.update({ where: { id: usuarioId }, data: { ativo: false }, include: { orgao: true } });
      await tx.sessao.deleteMany({ where: { usuarioId } });
      await auditar(tx, contexto(req).usuario.id, 'Usuario', usuarioId, 'INATIVAR', usuarioPublico(antes), usuarioPublico(depois));
    });
    res.status(204).end();
  }));
  router.post('/usuarios/:id/redefinir-senha', rota(async (req, res) => {
    const usuarioId = id(req);
    const { senha } = z.object({ senha: senhaSchema }).strict().parse(req.body);
    const senhaHash = await hash(senha, 12);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${usuarioId}::uuid FOR UPDATE`;
      const antes = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
      await tx.usuario.update({ where: { id: usuarioId }, data: { senhaHash, trocaSenhaPendente: true, tentativasLogin: 0, bloqueadoAte: null } });
      await tx.sessao.deleteMany({ where: { usuarioId } });
      await auditar(tx, contexto(req).usuario.id, 'Usuario', usuarioId, 'REDEFINIR_SENHA',
        { trocaSenhaPendente: antes.trocaSenhaPendente }, { trocaSenhaPendente: true });
    });
    res.status(204).end();
  }));

  router.get('/exercicios', rota(async (_req, res) => {
    res.json(await prisma.exercicio.findMany({ orderBy: { ano: 'desc' } }));
  }));
  router.get('/exercicios/:id', rota(async (req, res) => {
    const exercicio = await prisma.exercicio.findUnique({ where: { id: id(req) } });
    if (!exercicio) throw new ErroHttp(404, 'Exercício não encontrado.');
    res.json(exercicio);
  }));
  router.post('/exercicios', rota(async (req, res) => {
    const dados = exercicioSchema.parse(req.body);
    if (dados.situacao !== 'RASCUNHO') throw new ErroHttp(400, 'Um novo exercício deve começar em rascunho.');
    const exercicio = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20250001)`;
      const criado = await tx.exercicio.create({ data: {
        ...dados,
        titulo: dados.titulo ?? `Plano de Contratações Anual (PCA) ${dados.ano} – MUNICÍPIO DE AÇAILÂNDIA`,
        inicioPreenchimento: new Date(dados.inicioPreenchimento),
        fimPreenchimento: new Date(dados.fimPreenchimento),
      } });
      const orgaos = await tx.orgao.findMany({ select: { id: true } });
      if (orgaos.length) await tx.listaOrgao.createMany({ data: orgaos.map((orgao) => ({ orgaoId: orgao.id, exercicioId: criado.id })) });
      await auditar(tx, contexto(req).usuario.id, 'Exercicio', criado.id, 'CRIAR', undefined, criado);
      return criado;
    });
    res.status(201).json(exercicio);
  }));
  router.put('/exercicios/:id', rota(async (req, res) => {
    const exercicioId = id(req);
    const dados = exercicioSchema.parse(req.body);
    const exercicio = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Exercicio" WHERE id = ${exercicioId}::uuid FOR UPDATE`;
      const antes = await tx.exercicio.findUniqueOrThrow({ where: { id: exercicioId } });
      if (antes.situacao === 'PUBLICADO') throw new ErroHttp(409, 'Um exercício publicado não pode ser alterado.');
      if (dados.situacao === 'PUBLICADO') throw new ErroHttp(409, 'A publicação exige a finalização de uma versão do plano, disponível na fase 3.');
      const transicoes = { RASCUNHO: 'ABERTO', ABERTO: 'FECHADO', FECHADO: null };
      if (antes.situacao !== dados.situacao && transicoes[antes.situacao] !== dados.situacao) {
        throw new ErroHttp(409, 'Transição inválida para a situação do exercício.');
      }
      const depois = await tx.exercicio.update({ where: { id: exercicioId }, data: {
        ...dados,
        titulo: dados.titulo ?? antes.titulo,
        inicioPreenchimento: new Date(dados.inicioPreenchimento),
        fimPreenchimento: new Date(dados.fimPreenchimento),
      } });
      await auditar(tx, contexto(req).usuario.id, 'Exercicio', exercicioId, 'ALTERAR', antes, depois);
      return depois;
    });
    res.json(exercicio);
  }));
  router.delete('/exercicios/:id', rota(async (req, res) => {
    const exercicioId = id(req);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Exercicio" WHERE id = ${exercicioId}::uuid FOR UPDATE`;
      const antes = await tx.exercicio.findUniqueOrThrow({ where: { id: exercicioId } });
      if (antes.situacao !== 'RASCUNHO') throw new ErroHttp(409, 'Somente exercícios em rascunho podem ser excluídos.');
      if (await tx.listaOrgao.count({ where: { exercicioId, situacao: { not: 'NAO_INICIADA' } } })) {
        throw new ErroHttp(409, 'O exercício já possui listas iniciadas e não pode ser excluído.');
      }
      await tx.listaOrgao.deleteMany({ where: { exercicioId } });
      await tx.exercicio.delete({ where: { id: exercicioId } });
      await auditar(tx, contexto(req).usuario.id, 'Exercicio', exercicioId, 'EXCLUIR', antes);
    });
    res.status(204).end();
  }));
}

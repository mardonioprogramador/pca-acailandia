import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class ErroHttp extends Error {
  constructor(public readonly status: number, mensagem: string) {
    super(mensagem);
  }
}

export function rota(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => { void handler(req, res, next).catch(next); };
}

export function tratarErro(erro: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (erro instanceof ErroHttp) {
    res.status(erro.status).json({ erro: erro.message });
    return;
  }
  if (erro instanceof ZodError) {
    res.status(400).json({ erro: 'Confira os campos informados.', campos: erro.flatten().fieldErrors });
    return;
  }
  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    if (erro.code === 'P2002') {
      res.status(409).json({ erro: 'Já existe um registro com os dados únicos informados.' });
      return;
    }
    if (erro.code === 'P2003') {
      res.status(409).json({ erro: 'O registro possui vínculos e não pode ser excluído.' });
      return;
    }
    if (erro.code === 'P2025') {
      res.status(404).json({ erro: 'Registro não encontrado.' });
      return;
    }
    if (erro.code === 'P2034') {
      res.status(409).json({ erro: 'O registro foi alterado simultaneamente. Atualize e tente novamente.' });
      return;
    }
  }
  if (erro instanceof SyntaxError && 'body' in erro) {
    res.status(400).json({ erro: 'O corpo da requisição deve ser um JSON válido.' });
    return;
  }
  if (typeof erro === 'object' && erro !== null && 'type' in erro && erro.type === 'entity.too.large') {
    res.status(413).json({ erro: 'A requisição excede o tamanho permitido.' });
    return;
  }
  // Não registrar requisições, credenciais ou mensagens do driver em logs.
  console.error('Falha interna ao processar requisição.');
  res.status(500).json({ erro: 'Não foi possível concluir a operação. Tente novamente.' });
}

function json(valor: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (valor === undefined || valor === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
}

export async function auditar(
  tx: Prisma.TransactionClient,
  usuarioId: string,
  entidade: string,
  entidadeId: string,
  acao: string,
  antes?: unknown,
  depois?: unknown,
) {
  await tx.auditoria.create({
    data: { usuarioId, entidade, entidadeId, acao, antes: json(antes), depois: json(depois) },
  });
}

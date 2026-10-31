import type { Request, Router } from 'express';
import { z } from 'zod';
import { prisma } from './prisma.js';
import { contexto } from './autenticacao.js';
import { ErroHttp, rota } from './http.js';

function verificarOrgao(req: Request, orgaoId: string) {
  const { usuario } = contexto(req);
  if (usuario.perfil !== 'ADMIN' && usuario.orgaoId !== orgaoId) {
    throw new ErroHttp(403, 'Você não tem permissão para acessar a lista de outro órgão.');
  }
}

const incluir = { orgao: true, exercicio: true } as const;

export function rotasListas(router: Router) {
  router.get('/listas', rota(async (req, res) => {
    const { usuario } = contexto(req);
    res.json(await prisma.listaOrgao.findMany({
      where: usuario.perfil === 'ADMIN' ? {} : { orgaoId: usuario.orgaoId! },
      include: incluir,
      orderBy: [{ exercicio: { ano: 'desc' } }, { orgao: { ordem: 'asc' } }],
    }));
  }));
  router.get('/orgaos/:orgaoId/listas', rota(async (req, res) => {
    const orgaoId = z.string().uuid().parse(req.params.orgaoId);
    verificarOrgao(req, orgaoId);
    if (!await prisma.orgao.findUnique({ where: { id: orgaoId } })) throw new ErroHttp(404, 'Órgão não encontrado.');
    res.json(await prisma.listaOrgao.findMany({ where: { orgaoId }, include: incluir, orderBy: { exercicio: { ano: 'desc' } } }));
  }));
  router.get('/listas/:id', rota(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const lista = await prisma.listaOrgao.findUnique({ where: { id }, include: incluir });
    if (!lista) throw new ErroHttp(404, 'Lista não encontrada.');
    verificarOrgao(req, lista.orgaoId);
    res.json(lista);
  }));
  // Apenas a fronteira de autorização da lista é entregue na fase 1.
  // Seleções, envio e mudanças de situação pertencem à fase 2.
  router.all('/listas/:id', rota(async (req, _res) => {
    const id = z.string().uuid().parse(req.params.id);
    const lista = await prisma.listaOrgao.findUnique({ where: { id } });
    if (!lista) throw new ErroHttp(404, 'Lista não encontrada.');
    verificarOrgao(req, lista.orgaoId);
    throw new ErroHttp(409, 'A edição e o envio das seleções estarão disponíveis na fase 2.');
  }));
}

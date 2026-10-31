import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { loginSchema, trocarSenhaSchema } from '@pca/shared';
import { prisma } from './prisma.js';
import { auditar, ErroHttp, rota } from './http.js';

type UsuarioAutenticado = Prisma.UsuarioGetPayload<{ include: { orgao: true } }>;
type Contexto = { usuario: UsuarioAutenticado; sessaoId: string; csrfToken: string };
const contextos = new WeakMap<Request, Contexto>();
const duracaoSessao = 8 * 60 * 60 * 1000;
const duracaoBloqueio = 15 * 60 * 1000;
const nomeCookie = 'pca_sessao';
const hashInexistente = hash(randomBytes(32).toString('hex'), 12);

export function usuarioPublico(usuario: UsuarioAutenticado) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    orgaoId: usuario.orgaoId,
    ativo: usuario.ativo,
    trocaSenhaPendente: usuario.trocaSenhaPendente,
    orgao: usuario.orgao,
  };
}

export function contexto(req: Request): Contexto {
  const valor = contextos.get(req);
  if (!valor) throw new ErroHttp(401, 'Entre no sistema para continuar.');
  return valor;
}

function opcoesCookie() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.SECURE_COOKIES === 'true' ||
      (process.env.NODE_ENV === 'production' && process.env.SECURE_COOKIES !== 'false'),
    path: '/api',
  };
}

function obterToken(req: Request): string | undefined {
  return req.headers.cookie?.split(';').map((parte) => parte.trim())
    .find((parte) => parte.startsWith(`${nomeCookie}=`))?.slice(nomeCookie.length + 1);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

async function criarSessao(tx: Prisma.TransactionClient, usuarioId: string) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  await tx.sessao.create({
    data: { usuarioId, tokenHash: tokenHash(token), csrfToken, expiraEm: new Date(Date.now() + duracaoSessao) },
  });
  return { token, csrfToken };
}

export const autenticar = rota(async (req, _res, next) => {
  const token = obterToken(req);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ErroHttp(401, 'Entre no sistema para continuar.');
  const sessao = await prisma.sessao.findUnique({
    where: { tokenHash: tokenHash(token) }, include: { usuario: { include: { orgao: true } } },
  });
  if (!sessao || sessao.expiraEm <= new Date() || !sessao.usuario.ativo ||
    (sessao.usuario.perfil === 'ORGAO' && !sessao.usuario.orgao?.ativo)) {
    throw new ErroHttp(401, 'Sua sessão expirou ou o acesso foi desativado. Entre novamente.');
  }
  contextos.set(req, { usuario: sessao.usuario, sessaoId: sessao.id, csrfToken: sessao.csrfToken });
  next();
});

export const exigirCSRF: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
  const esperado = contexto(req).csrfToken;
  const recebido = req.get('x-csrf-token') ?? '';
  if (Buffer.byteLength(recebido) !== Buffer.byteLength(esperado) ||
    !timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) {
    next(new ErroHttp(403, 'Requisição inválida. Atualize a página e tente novamente.'));
    return;
  }
  next();
};

export const exigirSenhaAlterada: RequestHandler = (req, _res, next) => {
  if (contexto(req).usuario.trocaSenhaPendente) {
    next(new ErroHttp(403, 'Altere sua senha inicial antes de continuar.'));
    return;
  }
  next();
};

export const exigirAdministrador: RequestHandler = (req, _res, next) => {
  if (contexto(req).usuario.perfil !== 'ADMIN') {
    next(new ErroHttp(403, 'Esta operação é exclusiva de administradores.'));
    return;
  }
  next();
};

export function rotasAutenticacao(router: Router) {
  router.post('/auth/login', rota(async (req, res) => {
    const dados = loginSchema.parse(req.body);
    if (Buffer.byteLength(dados.senha, 'utf8') > 72) throw new ErroHttp(401, 'E-mail ou senha inválidos.');
    const resultado = await prisma.$transaction(async (tx) => {
      // O bloqueio de linha evita perder tentativas concorrentes da mesma conta.
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE email = ${dados.email} FOR UPDATE`;
      const usuario = await tx.usuario.findUnique({ where: { email: dados.email }, include: { orgao: true } });
      if (!usuario || !usuario.ativo || (usuario.perfil === 'ORGAO' && !usuario.orgao?.ativo)) {
        await compare(dados.senha, await hashInexistente);
        return { status: 'invalido' as const };
      }
      const agora = new Date();
      if (usuario.bloqueadoAte && usuario.bloqueadoAte > agora) return { status: 'bloqueado' as const };
      const tentativasAnteriores = usuario.bloqueadoAte ? 0 : usuario.tentativasLogin;
      if (!await compare(dados.senha, usuario.senhaHash)) {
        const tentativasLogin = tentativasAnteriores + 1;
        await tx.usuario.update({ where: { id: usuario.id }, data: {
          tentativasLogin,
          bloqueadoAte: tentativasLogin >= 5 ? new Date(agora.getTime() + duracaoBloqueio) : null,
        } });
        return { status: tentativasLogin >= 5 ? 'bloqueado' as const : 'invalido' as const };
      }
      await tx.usuario.update({ where: { id: usuario.id }, data: { tentativasLogin: 0, bloqueadoAte: null } });
      const sessao = await criarSessao(tx, usuario.id);
      return { status: 'ok' as const, usuario, ...sessao };
    }, { timeout: 15000 });
    if (resultado.status !== 'ok') {
      if (resultado.status === 'bloqueado') throw new ErroHttp(429, 'Acesso temporariamente bloqueado. Tente novamente em 15 minutos.');
      throw new ErroHttp(401, 'E-mail ou senha inválidos.');
    }
    res.cookie(nomeCookie, resultado.token, { ...opcoesCookie(), maxAge: duracaoSessao });
    res.json({ usuario: usuarioPublico(resultado.usuario), csrfToken: resultado.csrfToken });
  }));

  router.get('/auth/me', autenticar, rota(async (req, res) => {
    const auth = contexto(req);
    res.json({ usuario: usuarioPublico(auth.usuario), csrfToken: auth.csrfToken });
  }));

  router.post('/auth/logout', autenticar, exigirCSRF, rota(async (req, res) => {
    await prisma.sessao.deleteMany({ where: { id: contexto(req).sessaoId } });
    res.clearCookie(nomeCookie, opcoesCookie());
    res.status(204).end();
  }));

  router.post('/auth/senha', autenticar, exigirCSRF, rota(async (req, res) => {
    const dados = trocarSenhaSchema.parse(req.body);
    const auth = contexto(req);
    if (Buffer.byteLength(dados.senhaAtual, 'utf8') > 72) throw new ErroHttp(400, 'A senha atual está incorreta.');
    if (dados.senhaAtual === dados.novaSenha) throw new ErroHttp(400, 'Escolha uma senha diferente da senha atual.');
    const senhaHash = await hash(dados.novaSenha, 12);
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${auth.usuario.id}::uuid FOR UPDATE`;
      const atual = await tx.usuario.findUniqueOrThrow({ where: { id: auth.usuario.id }, include: { orgao: true } });
      if (!await compare(dados.senhaAtual, atual.senhaHash)) throw new ErroHttp(400, 'A senha atual está incorreta.');
      if (await compare(dados.novaSenha, atual.senhaHash)) throw new ErroHttp(400, 'Escolha uma senha diferente da senha atual.');
      // Revalidar a sessão após o lock também protege contra redefinições simultâneas.
      if (!await tx.sessao.findUnique({ where: { id: auth.sessaoId } })) throw new ErroHttp(401, 'Entre novamente para alterar sua senha.');
      const usuario = await tx.usuario.update({ where: { id: atual.id }, data: {
        senhaHash, trocaSenhaPendente: false, tentativasLogin: 0, bloqueadoAte: null,
      }, include: { orgao: true } });
      await tx.sessao.deleteMany({ where: { usuarioId: usuario.id } });
      await auditar(tx, usuario.id, 'Usuario', usuario.id, 'ALTERAR_SENHA',
        { trocaSenhaPendente: atual.trocaSenhaPendente }, { trocaSenhaPendente: false });
      return { usuario, ...await criarSessao(tx, usuario.id) };
    }, { timeout: 15000 });
    res.cookie(nomeCookie, resultado.token, { ...opcoesCookie(), maxAge: duracaoSessao });
    res.json({ usuario: usuarioPublico(resultado.usuario), csrfToken: resultado.csrfToken });
  }));
}

export function validarOrigem(req: Request, _res: Response, next: Parameters<RequestHandler>[2]) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
  const origem = req.get('origin');
  const permitidas = process.env.APP_ORIGIN
    ? [process.env.APP_ORIGIN]
    : ['http://localhost:5173', 'http://localhost:3001'];
  if (origem && !permitidas.includes(origem)) {
    next(new ErroHttp(403, 'A origem da requisição não é permitida.'));
    return;
  }
  next();
}

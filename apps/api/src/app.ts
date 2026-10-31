import express from 'express';
import { fileURLToPath } from 'node:url';
import { prisma } from './prisma.js';
import { autenticar, exigirCSRF, exigirSenhaAlterada, rotasAutenticacao, validarOrigem } from './autenticacao.js';
import { rotasCadastros } from './cadastros.js';
import { rotasListas } from './listas.js';
import { rota, tratarErro } from './http.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', validarOrigem);
  app.get('/api/saude', rota(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ erro: 'O banco de dados está indisponível.' });
    }
  }));

  const autenticacao = express.Router();
  rotasAutenticacao(autenticacao);
  app.use('/api', autenticacao);

  const protegidas = express.Router();
  protegidas.use(autenticar, exigirCSRF, exigirSenhaAlterada);
  // Registrar antes do grupo admin para permitir acesso à própria lista.
  rotasListas(protegidas);
  rotasCadastros(protegidas);
  app.use('/api', protegidas);
  app.use('/api', (_req, res) => { res.status(404).json({ erro: 'Rota não encontrada.' }); });

  if (process.env.NODE_ENV === 'production') {
    const diretorioWeb = fileURLToPath(new URL('../../web/dist/', import.meta.url));
    app.use(express.static(diretorioWeb));
    app.get('*', (_req, res) => { res.sendFile(`${diretorioWeb}/index.html`); });
  }
  app.use((_req, res) => { res.status(404).json({ erro: 'Rota não encontrada.' }); });
  app.use(tratarErro);
  return app;
}

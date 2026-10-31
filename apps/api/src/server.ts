import { createApp } from './app.js';
import { prisma } from './prisma.js';

const porta = Number(process.env.API_PORT ?? 3001);
if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error('API_PORT deve ser uma porta válida.');
const servidor = createApp().listen(porta, '0.0.0.0', () => {
  console.log(`API PCA iniciada na porta ${porta}.`);
});

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => {
    servidor.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); });
  });
}

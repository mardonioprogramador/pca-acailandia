import 'dotenv/config';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {PrismaClient} from '@prisma/client';

// Banco fornecido deve ser exclusivo de testes. Cada execução usa um schema único.
const dockerEnv = {...process.env};
for (const nome of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) delete dockerEnv[nome];
const docker = (...args) => spawnSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {encoding: 'utf8', env: dockerEnv});
const executar = (cmd, args, env) => spawnSync(cmd, args, {stdio: 'inherit', env});
let container;
let cliente;
let codigo = 1;
const schema = `teste_${randomBytes(12).toString('hex')}`;
try {
  let destino = process.env.TEST_DATABASE_URL;
  if (!destino) {
    const senha = randomBytes(24).toString('hex');
    const inicio = docker('run', '-d', '--rm', '--tmpfs', '/var/lib/postgresql/data:rw', '-p', '127.0.0.1::5432', '-e', `POSTGRES_PASSWORD=${senha}`, 'postgres:16-bookworm');
    if (inicio.status !== 0) throw new Error('Não foi possível iniciar o PostgreSQL de testes. Verifique Docker ou configure TEST_DATABASE_URL para um banco exclusivo.');
    container = inicio.stdout.trim();
    let pronto = false;
    for (let i = 0; i < 40; i++) {
      if (docker('exec', container, 'pg_isready', '-q', '-U', 'postgres').status === 0) {pronto = true; break;}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!pronto) throw new Error('O PostgreSQL de testes não ficou pronto.');
    const porta = docker('port', container, '5432/tcp');
    if (porta.status !== 0 || !/^127\.0\.0\.1:\d+\s*$/.test(porta.stdout)) throw new Error('Não foi possível identificar a porta local do banco de testes.');
    destino = `postgresql://postgres:${senha}@127.0.0.1:${porta.stdout.trim().split(':')[1]}/postgres`;
  }
  const url = new URL(destino);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('TEST_DATABASE_URL deve apontar para PostgreSQL.');
  url.searchParams.set('schema', schema);
  const ambiente = {...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'test', PCA_TEST_DATABASE: '1', TZ: 'America/Sao_Paulo'};
  cliente = new PrismaClient({datasourceUrl: url.toString()});
  await cliente.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const migracao = executar('npm', ['run', 'db:migrate'], ambiente);
  if (migracao.status !== 0) throw new Error('Falha ao aplicar as migrações no banco de testes.');
  const testes = executar('npx', ['--no-install', 'vitest', 'run'], ambiente);
  codigo = testes.status ?? 1;
} catch (erro) {
  // Não imprimir URLs de conexão nem saídas de comandos com credenciais.
  console.error(erro instanceof Error && !erro.message.includes('Prisma') ? erro.message : 'Falha ao preparar o banco de testes. Verifique a conexão configurada.');
} finally {
  if (cliente) {
    try {await cliente.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);} catch {console.error('Não foi possível remover o schema temporário de testes.'); codigo = 1;}
    await cliente.$disconnect();
  }
  if (container && docker('stop', '--time', '5', container).status !== 0) {console.error('Não foi possível remover o contêiner temporário de testes.'); codigo = 1;}
}
process.exitCode = codigo;

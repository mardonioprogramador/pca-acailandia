import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { importarDados } from '../src/seed.js';

const senhaInicial = 'Senha inicial segura 2026!';
const senhaNova = 'Senha nova segura 2026!';
const app = createApp();
let senhaHash: string;

async function prepararDados() {
  const orgaoA = await prisma.orgao.create({
    data: { sigla: 'SME', nome: 'Secretaria de Educação', tipo: 'ADMINISTRACAO_DIRETA', grupoUnificacao: 'Administração Direta', ordem: 1, ativo: true },
  });
  const orgaoB = await prisma.orgao.create({
    data: { sigla: 'SEMUS', nome: 'Secretaria de Saúde', tipo: 'ADMINISTRACAO_DIRETA', grupoUnificacao: 'Administração Direta', ordem: 2, ativo: true },
  });
  const admin = await prisma.usuario.create({
    data: { nome: 'Administradora', email: 'admin@teste.invalid', senhaHash, perfil: 'ADMIN', trocaSenhaPendente: false },
  });
  const usuarioA = await prisma.usuario.create({
    data: { nome: 'Pessoa da Educação', email: 'educacao@teste.invalid', senhaHash, perfil: 'ORGAO', orgaoId: orgaoA.id, trocaSenhaPendente: false },
  });
  const usuarioB = await prisma.usuario.create({
    data: { nome: 'Pessoa da Saúde', email: 'saude@teste.invalid', senhaHash, perfil: 'ORGAO', orgaoId: orgaoB.id, trocaSenhaPendente: false },
  });
  const exercicio = await prisma.exercicio.create({
    data: {
      ano: 2027,
      titulo: 'Plano de Contratações Anual 2027',
      inicioPreenchimento: new Date('2027-01-01T00:00:00-03:00'),
      fimPreenchimento: new Date('2027-12-31T23:59:59-03:00'),
    },
  });
  const listaA = await prisma.listaOrgao.create({ data: { exercicioId: exercicio.id, orgaoId: orgaoA.id } });
  const listaB = await prisma.listaOrgao.create({ data: { exercicioId: exercicio.id, orgaoId: orgaoB.id } });
  return { orgaoA, orgaoB, admin, usuarioA, usuarioB, exercicio, listaA, listaB };
}

let dados: Awaited<ReturnType<typeof prepararDados>>;

async function entrar(email = 'admin@teste.invalid', senha = senhaInicial) {
  const resposta = await request(app).post('/api/auth/login').send({ email, senha }).expect(200);
  const cookies: string[] = resposta.headers['set-cookie'] as unknown as string[];
  expect(cookies?.length).toBeGreaterThan(0);
  return {
    cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
    csrfToken: resposta.body.csrfToken as string,
    usuario: resposta.body.usuario,
    cookies,
  };
}

const orgaoNovo = {
  sigla: 'TESTE',
  nome: 'Órgão de teste',
  tipo: 'OUTRO',
  grupoUnificacao: 'Teste',
  ordem: 3,
  ativo: true,
};

const exercicioNovo = {
  ano: 2028,
  inicioPreenchimento: '2028-01-01T00:00:00-03:00',
  fimPreenchimento: '2028-12-31T23:59:59-03:00',
  situacao: 'RASCUNHO',
  atoPublicacao: null,
};

beforeAll(async () => {
  if (process.env.PCA_TEST_DATABASE !== '1' || process.env.NODE_ENV !== 'test') {
    throw new Error('Execute npm test: esta suíte apaga apenas o banco descartável criado pelo runner.');
  }
  senhaHash = await bcrypt.hash(senhaInicial, 4);
});

beforeEach(async () => {
  await prisma.$transaction([
    prisma.sessao.deleteMany(),
    prisma.auditoria.deleteMany(),
    prisma.listaOrgao.deleteMany(),
    prisma.usuario.deleteMany(),
    prisma.exercicio.deleteMany(),
    prisma.objetoCatalogo.deleteMany(),
    prisma.orgao.deleteMany(),
  ]);
  dados = await prepararDados();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe.sequential('Critério 1 — isolamento das listas no backend', () => {
  it('o usuário de órgão lê a própria lista, mas não lê a de outro órgão', async () => {
    const sessao = await entrar(dados.usuarioA.email);
    const propria = await request(app).get(`/api/listas/${dados.listaA.id}`).set('Cookie', sessao.cookie).expect(200);
    expect(propria.body.id).toBe(dados.listaA.id);
    const alheia = await request(app).get(`/api/listas/${dados.listaB.id}`).set('Cookie', sessao.cookie).expect(403);
    expect(alheia.body).toEqual({ erro: expect.any(String) });
    expect(JSON.stringify(alheia.body)).not.toContain(dados.listaB.id);
  });

  it('o usuário de órgão não altera lista alheia mesmo com sessão e CSRF válidos', async () => {
    const sessao = await entrar(dados.usuarioA.email);
    for (const metodo of ['put', 'patch'] as const) {
      await request(app)[metodo](`/api/listas/${dados.listaB.id}`)
        .set('Cookie', sessao.cookie).set('X-CSRF-Token', sessao.csrfToken)
        .send({ orgaoId: dados.orgaoA.id, situacao: 'ENVIADA' }).expect(403);
    }
    expect(await prisma.listaOrgao.findUniqueOrThrow({ where: { id: dados.listaB.id } })).toEqual(dados.listaB);
    await request(app).patch(`/api/listas/${dados.listaA.id}`)
      .set('Cookie', sessao.cookie).set('X-CSRF-Token', sessao.csrfToken).send({}).expect(409);
  });

  it('a coleção e a rota por órgão nunca expõem listas de outros órgãos', async () => {
    const sessao = await entrar(dados.usuarioA.email);
    const resposta = await request(app).get('/api/listas').set('Cookie', sessao.cookie).expect(200);
    expect(resposta.body.map((lista: { id: string }) => lista.id)).toEqual([dados.listaA.id]);
    await request(app).get(`/api/orgaos/${dados.orgaoB.id}/listas`).set('Cookie', sessao.cookie).expect(403);
    const propria = await request(app).get(`/api/orgaos/${dados.orgaoA.id}/listas`).set('Cookie', sessao.cookie).expect(200);
    expect(propria.body.map((lista: { id: string }) => lista.id)).toEqual([dados.listaA.id]);
  });

  it('o administrador consegue consultar listas dos dois órgãos', async () => {
    const sessao = await entrar();
    await request(app).get(`/api/listas/${dados.listaA.id}`).set('Cookie', sessao.cookie).expect(200);
    await request(app).get(`/api/listas/${dados.listaB.id}`).set('Cookie', sessao.cookie).expect(200);
    const resposta = await request(app).get('/api/listas').set('Cookie', sessao.cookie).expect(200);
    expect(resposta.body).toHaveLength(2);
  });
});

describe.sequential('Autenticação, sessão e proteção de requisições', () => {
  it('exige autenticação e nunca expõe senha, hash ou token da sessão nos usuários', async () => {
    await request(app).get('/api/listas').expect(401);
    await request(app).get('/api/usuarios').expect(401);
    const sessao = await entrar();
    const resposta = await request(app).get('/api/usuarios').set('Cookie', sessao.cookie).expect(200);
    const serializado = JSON.stringify(resposta.body);
    expect(serializado).not.toContain('senhaHash');
    expect(serializado).not.toContain('tokenHash');
    expect(serializado).not.toContain(senhaHash);
    expect(serializado).not.toContain(senhaInicial);
    expect(sessao.cookies.join(';')).toMatch(/HttpOnly/i);
    expect(sessao.cookies.join(';')).toMatch(/SameSite=Strict/i);
  });

  it('a sessão expira em oito horas e é rejeitada depois do prazo', async () => {
    const inicio = Date.now();
    const sessao = await entrar();
    const registro = await prisma.sessao.findFirstOrThrow({ where: { usuarioId: dados.admin.id } });
    expect(registro.expiraEm.getTime() - inicio).toBeGreaterThan(8 * 60 * 60 * 1000 - 5000);
    expect(registro.expiraEm.getTime() - inicio).toBeLessThan(8 * 60 * 60 * 1000 + 5000);
    expect(sessao.cookie).not.toContain(registro.tokenHash);
    await prisma.sessao.update({ where: { id: registro.id }, data: { expiraEm: new Date(Date.now() - 1000) } });
    await request(app).get('/api/auth/me').set('Cookie', sessao.cookie).expect(401);
  });

  it('o logout invalida a sessão no servidor', async () => {
    const sessao = await entrar();
    await request(app).post('/api/auth/logout').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({}).expect(204);
    await request(app).get('/api/auth/me').set('Cookie', sessao.cookie).expect(401);
    expect(await prisma.sessao.count({ where: { usuarioId: dados.admin.id } })).toBe(0);
  });

  it('bloqueia por quinze minutos após cinco senhas erradas e libera após o prazo', async () => {
    const inicio = Date.now();
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      const resposta = await request(app).post('/api/auth/login').send({ email: dados.usuarioA.email, senha: 'Senha incorreta 2026!' });
      expect([401, 429]).toContain(resposta.status);
    }
    const bloqueado = await prisma.usuario.findUniqueOrThrow({ where: { id: dados.usuarioA.id } });
    expect(bloqueado.bloqueadoAte).not.toBeNull();
    expect(bloqueado.bloqueadoAte!.getTime() - inicio).toBeGreaterThan(14 * 60 * 1000);
    expect(bloqueado.bloqueadoAte!.getTime() - inicio).toBeLessThan(16 * 60 * 1000);
    await request(app).post('/api/auth/login').send({ email: dados.usuarioA.email, senha: senhaInicial }).expect(429);
    expect(await prisma.sessao.count({ where: { usuarioId: dados.usuarioA.id } })).toBe(0);
    await prisma.usuario.update({ where: { id: dados.usuarioA.id }, data: { bloqueadoAte: new Date(Date.now() - 1000) } });
    await entrar(dados.usuarioA.email);
    const liberado = await prisma.usuario.findUniqueOrThrow({ where: { id: dados.usuarioA.id } });
    expect(liberado.tentativasLogin).toBe(0);
    expect(liberado.bloqueadoAte).toBeNull();
  });

  it('impede mutação sem CSRF ou com token incorreto sem alterar o banco', async () => {
    const sessao = await entrar();
    await request(app).post('/api/orgaos').set('Cookie', sessao.cookie).send(orgaoNovo).expect(403);
    await request(app).post('/api/orgaos').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', 'token-incorreto').send(orgaoNovo).expect(403);
    expect(await prisma.orgao.count()).toBe(2);
    await request(app).post('/api/orgaos').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send(orgaoNovo).expect(201);
  });

  it('rejeita login e mutações originados de outro site', async () => {
    await request(app).post('/api/auth/login').set('Origin', 'https://outro-site.invalid')
      .send({ email: dados.admin.email, senha: senhaInicial }).expect(403);
    const sessao = await entrar();
    await request(app).post('/api/orgaos').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).set('Origin', 'https://outro-site.invalid')
      .send(orgaoNovo).expect(403);
    expect(await prisma.orgao.count()).toBe(2);
  });

  it('exige troca da senha inicial e rotaciona a sessão ao trocar a senha', async () => {
    await prisma.usuario.update({ where: { id: dados.admin.id }, data: { trocaSenhaPendente: true } });
    const sessao = await entrar();
    expect(sessao.usuario.trocaSenhaPendente).toBe(true);
    await request(app).get('/api/orgaos').set('Cookie', sessao.cookie).expect(403);
    await request(app).get('/api/auth/me').set('Cookie', sessao.cookie).expect(200);
    await request(app).post('/api/auth/senha').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({ senhaAtual: senhaInicial, novaSenha: senhaNova }).expect(200);
    await request(app).get('/api/auth/me').set('Cookie', sessao.cookie).expect(401);
    const registro = await prisma.usuario.findUniqueOrThrow({ where: { id: dados.admin.id } });
    expect(registro.trocaSenhaPendente).toBe(false);
    expect(await bcrypt.compare(senhaNova, registro.senhaHash)).toBe(true);
    expect(await bcrypt.compare(senhaInicial, registro.senhaHash)).toBe(false);
    const novaSessao = await entrar(dados.admin.email, senhaNova);
    await request(app).get('/api/orgaos').set('Cookie', novaSessao.cookie).expect(200);
  });

  it('a redefinição administrativa invalida sessões e exige nova troca', async () => {
    const usuario = await entrar(dados.usuarioA.email);
    const admin = await entrar();
    await request(app).post(`/api/usuarios/${dados.usuarioA.id}/redefinir-senha`)
      .set('Cookie', admin.cookie).set('X-CSRF-Token', admin.csrfToken).send({ senha: senhaNova }).expect(204);
    await request(app).get('/api/auth/me').set('Cookie', usuario.cookie).expect(401);
    const novaSessao = await entrar(dados.usuarioA.email, senhaNova);
    expect(novaSessao.usuario.trocaSenhaPendente).toBe(true);
    await request(app).get('/api/listas').set('Cookie', novaSessao.cookie).expect(403);
  });

  it('não aceita manter uma senha equivalente por truncamento do bcrypt em 72 bytes', async () => {
    const senhaLimite = 'a'.repeat(72);
    const hashAnterior = await bcrypt.hash(senhaLimite, 4);
    await prisma.usuario.update({ where: { id: dados.admin.id }, data: { senhaHash: hashAnterior } });
    const sessao = await entrar(dados.admin.email, senhaLimite);
    for (const senhaAtual of [senhaLimite + 'x', senhaLimite]) {
      await request(app).post('/api/auth/senha').set('Cookie', sessao.cookie)
        .set('X-CSRF-Token', sessao.csrfToken).send({ senhaAtual, novaSenha: senhaLimite }).expect(400);
    }
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: dados.admin.id } })).senhaHash).toBe(hashAnterior);
    await request(app).get('/api/auth/me').set('Cookie', sessao.cookie).expect(200);
  });

  it('desativar um usuário revoga o acesso inclusive para uma sessão já emitida', async () => {
    const sessao = await entrar(dados.usuarioA.email);
    await prisma.usuario.update({ where: { id: dados.usuarioA.id }, data: { ativo: false } });
    await request(app).get('/api/auth/me').set('Cookie', sessao.cookie).expect(401);
    await request(app).post('/api/auth/login').send({ email: dados.usuarioA.email, senha: senhaInicial }).expect(401);
  });
});

describe.sequential('Cadastros e auditoria da fase 1', () => {
  it('preserva o último administrador ativo ao desativar ou alterar seu perfil', async () => {
    const sessao = await entrar();
    await request(app).delete(`/api/usuarios/${dados.admin.id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).expect(409);
    await request(app).put(`/api/usuarios/${dados.admin.id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({nome: dados.admin.nome, email: dados.admin.email, perfil: 'ORGAO', orgaoId: dados.orgaoA.id, ativo: true}).expect(409);
    expect((await prisma.usuario.findUniqueOrThrow({where: {id: dados.admin.id}})).perfil).toBe('ADMIN');
    await request(app).get('/api/usuarios').set('Cookie', sessao.cookie).expect(200);
    expect(await prisma.auditoria.count()).toBe(0);
  });

  it('mantém os vínculos das listas ao criar órgão e exercício simultaneamente', async () => {
    const sessao = await entrar();
    const [orgao, exercicio] = await Promise.all([
      request(app).post('/api/orgaos').set('Cookie', sessao.cookie).set('X-CSRF-Token', sessao.csrfToken).send(orgaoNovo).expect(201),
      request(app).post('/api/exercicios').set('Cookie', sessao.cookie).set('X-CSRF-Token', sessao.csrfToken).send(exercicioNovo).expect(201),
    ]);
    expect(await prisma.listaOrgao.count({where: {orgaoId: orgao.body.id as string, exercicioId: exercicio.body.id as string}})).toBe(1);
    expect(await prisma.listaOrgao.count()).toBe(6);
  });

  it.each(['/api/orgaos', '/api/usuarios', '/api/exercicios'])('usuário de órgão não administra %s', async (rota) => {
    const sessao = await entrar(dados.usuarioA.email);
    await request(app).get(rota).set('Cookie', sessao.cookie).expect(403);
    await request(app).post(rota).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({}).expect(403);
  });

  it('o administrador cria, consulta, atualiza e desativa um órgão com auditoria', async () => {
    const sessao = await entrar();
    const criado = await request(app).post('/api/orgaos').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send(orgaoNovo).expect(201);
    const id = criado.body.id as string;
    await request(app).get(`/api/orgaos/${id}`).set('Cookie', sessao.cookie).expect(200);
    await request(app).put(`/api/orgaos/${id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({ ...orgaoNovo, nome: 'Órgão atualizado' }).expect(200);
    await request(app).delete(`/api/orgaos/${id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).expect(204);
    expect((await prisma.orgao.findUniqueOrThrow({ where: { id } })).ativo).toBe(false);
    const auditorias = await prisma.auditoria.findMany({ where: { entidadeId: id }, orderBy: { criadoEm: 'asc' } });
    expect(auditorias).toHaveLength(3);
    expect(auditorias.every((auditoria) => auditoria.usuarioId === dados.admin.id)).toBe(true);
    expect(JSON.stringify(auditorias)).toContain('Órgão atualizado');
    expect(auditorias.some((auditoria) => JSON.stringify(auditoria.antes).includes(orgaoNovo.nome))).toBe(true);
    expect(await prisma.listaOrgao.count({ where: { orgaoId: id, exercicioId: dados.exercicio.id } })).toBe(1);
  });

  it('conflitos de unicidade não alteram cadastros nem geram auditoria de sucesso', async () => {
    const sessao = await entrar();
    const antes = await prisma.auditoria.count();
    await request(app).post('/api/orgaos').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({ ...orgaoNovo, sigla: dados.orgaoA.sigla }).expect(409);
    expect(await prisma.orgao.count()).toBe(2);
    expect(await prisma.auditoria.count()).toBe(antes);
    expect((await prisma.orgao.findUniqueOrThrow({ where: { id: dados.orgaoA.id } })).nome).toBe(dados.orgaoA.nome);
  });

  it('reverte a alteração do cadastro se a gravação da auditoria falhar', async () => {
    const sessao = await entrar();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION bloquear_auditoria_teste() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha de auditoria induzida no banco de teste'; END; $$`);
    try {
      await prisma.$executeRawUnsafe('CREATE TRIGGER bloquear_auditoria_teste BEFORE INSERT ON "Auditoria" FOR EACH ROW EXECUTE FUNCTION bloquear_auditoria_teste()');
      try {
        const resposta = await request(app).post('/api/orgaos').set('Cookie', sessao.cookie)
          .set('X-CSRF-Token', sessao.csrfToken).send(orgaoNovo).expect(500);
        expect(resposta.body).toEqual({ erro: expect.any(String) });
        expect(JSON.stringify(resposta.body)).not.toContain('Falha de auditoria induzida');
        expect(await prisma.orgao.count()).toBe(2);
        expect(await prisma.orgao.findUnique({ where: { sigla: orgaoNovo.sigla } })).toBeNull();
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER bloquear_auditoria_teste ON "Auditoria"');
      }
    } finally {
      await prisma.$executeRawUnsafe('DROP FUNCTION bloquear_auditoria_teste()');
    }
  });

  it('cria usuário vinculado a exatamente um órgão com senha em hash e troca obrigatória', async () => {
    const sessao = await entrar();
    const resposta = await request(app).post('/api/usuarios').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({
        nome: 'Nova pessoa', email: 'nova@teste.invalid', perfil: 'ORGAO', orgaoId: dados.orgaoA.id, ativo: true, senha: senhaInicial,
      }).expect(201);
    expect(resposta.body.trocaSenhaPendente).toBe(true);
    expect(resposta.body.orgaoId).toBe(dados.orgaoA.id);
    expect(JSON.stringify(resposta.body)).not.toContain('senha');
    const registro = await prisma.usuario.findUniqueOrThrow({ where: { id: resposta.body.id as string } });
    expect(registro.senhaHash).not.toBe(senhaInicial);
    expect(await bcrypt.compare(senhaInicial, registro.senhaHash)).toBe(true);
    const auditorias = await prisma.auditoria.findMany({ where: { entidadeId: registro.id } });
    expect(auditorias).toHaveLength(1);
    const serializado = JSON.stringify(auditorias);
    expect(serializado).not.toContain('senhaHash');
    expect(serializado).not.toContain(senhaInicial);
    expect(serializado).not.toContain(registro.senhaHash);
  });

  it('valida vínculos de perfil e rejeita usuário de órgão sem órgão ou administrador vinculado', async () => {
    const sessao = await entrar();
    for (const invalido of [
      { perfil: 'ORGAO', orgaoId: null },
      { perfil: 'ADMIN', orgaoId: dados.orgaoA.id },
    ]) {
      await request(app).post('/api/usuarios').set('Cookie', sessao.cookie)
        .set('X-CSRF-Token', sessao.csrfToken).send({
          nome: 'Pessoa inválida', email: 'invalida@teste.invalid', ativo: true, senha: senhaInicial, ...invalido,
        }).expect(400);
    }
    expect(await prisma.usuario.count()).toBe(3);
  });

  it('o administrador atualiza e desativa usuários sem apagar seu histórico', async () => {
    const sessao = await entrar();
    await request(app).put(`/api/usuarios/${dados.usuarioA.id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({
        nome: 'Nome atualizado', email: dados.usuarioA.email, perfil: 'ORGAO', orgaoId: dados.orgaoA.id, ativo: true,
      }).expect(200);
    await request(app).delete(`/api/usuarios/${dados.usuarioA.id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).expect(204);
    const registro = await prisma.usuario.findUniqueOrThrow({ where: { id: dados.usuarioA.id } });
    expect(registro.ativo).toBe(false);
    expect(registro.nome).toBe('Nome atualizado');
    expect(await prisma.auditoria.count({ where: { entidadeId: registro.id } })).toBe(2);
  });

  it('cria exercício com título padrão e listas para os órgãos ativos', async () => {
    const sessao = await entrar();
    const resposta = await request(app).post('/api/exercicios').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send(exercicioNovo).expect(201);
    expect(resposta.body.titulo).toBe('Plano de Contratações Anual (PCA) 2028 – MUNICÍPIO DE AÇAILÂNDIA');
    expect(resposta.body.situacao).toBe('RASCUNHO');
    expect(new Date(resposta.body.inicioPreenchimento).toISOString()).toBe('2028-01-01T03:00:00.000Z');
    expect(await prisma.listaOrgao.count({ where: { exercicioId: resposta.body.id as string } })).toBe(2);
    expect(await prisma.auditoria.count({ where: { entidadeId: resposta.body.id as string } })).toBe(1);
    await request(app).delete(`/api/exercicios/${resposta.body.id as string}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).expect(204);
    expect(await prisma.exercicio.findUnique({ where: { id: resposta.body.id as string } })).toBeNull();
  });

  it('rejeita período invertido e alteração de exercício já publicado', async () => {
    const sessao = await entrar();
    await request(app).post('/api/exercicios').set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken)
      .send({ ...exercicioNovo, inicioPreenchimento: '2029-01-01T00:00:00-03:00' }).expect(400);
    await prisma.exercicio.update({ where: { id: dados.exercicio.id }, data: { situacao: 'PUBLICADO' } });
    await request(app).put(`/api/exercicios/${dados.exercicio.id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({ ...exercicioNovo, ano: 2027, titulo: 'Alterado' }).expect(409);
    await request(app).delete(`/api/exercicios/${dados.exercicio.id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).expect(409);
    expect((await prisma.exercicio.findUniqueOrThrow({ where: { id: dados.exercicio.id } })).titulo).toBe(dados.exercicio.titulo);
  });

  it('respeita as transições de situação sem permitir publicação antecipada', async () => {
    const sessao = await entrar();
    const payload = {
      ano: dados.exercicio.ano, titulo: dados.exercicio.titulo,
      inicioPreenchimento: dados.exercicio.inicioPreenchimento.toISOString(),
      fimPreenchimento: dados.exercicio.fimPreenchimento.toISOString(), atoPublicacao: null,
    };
    for (const situacao of ['ABERTO', 'FECHADO']) {
      await request(app).put(`/api/exercicios/${dados.exercicio.id}`).set('Cookie', sessao.cookie)
        .set('X-CSRF-Token', sessao.csrfToken).send({ ...payload, situacao }).expect(200);
    }
    await request(app).put(`/api/exercicios/${dados.exercicio.id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).send({ ...payload, situacao: 'PUBLICADO' }).expect(409);
    await request(app).delete(`/api/exercicios/${dados.exercicio.id}`).set('Cookie', sessao.cookie)
      .set('X-CSRF-Token', sessao.csrfToken).expect(409);
  });
});

describe.sequential('Seed dos dados oficiais — aceite da fase 1', () => {
  it('importa exatamente 390 objetos e 19 órgãos de forma idempotente e preserva as exceções do CSV', async () => {
    await prisma.listaOrgao.deleteMany();
    await prisma.usuario.deleteMany();
    await prisma.orgao.deleteMany();
    await importarDados(prisma);
    expect(await prisma.objetoCatalogo.count()).toBe(390);
    expect(await prisma.orgao.count()).toBe(19);
    const objetos = await prisma.objetoCatalogo.findMany({ orderBy: { ordem: 'asc' } });
    const csv = await readFile(new URL('../../../docs/dados/objetos-pca-2025-acailandia.csv', import.meta.url), 'utf8');
    const linhas = parse(csv, { bom: true, columns: true, delimiter: ';' }) as Record<string, string>[];
    expect(linhas).toHaveLength(390);
    for (const [indice, linha] of linhas.entries()) {
      expect(objetos[indice]).toMatchObject({
        ordem: indice + 1,
        descricao: linha.descricao_objeto.trim(),
        modalidadePadrao: linha.modalidade.trim() || 'A definir',
        naturezaPadrao: linha.natureza.trim() || null,
        siglasExercicioAnterior: linha.siglas.split(',').map((sigla) => sigla.trim()).filter(Boolean),
      });
    }
    expect(objetos.map((objeto) => objeto.ordem)).toEqual(Array.from({ length: 390 }, (_, indice) => indice + 1));
    expect(new Set(objetos.map((objeto) => objeto.codigo)).size).toBe(390);
    expect(objetos[21].descricao).toBe('Serviço de Cobertura de seguro para frota de veículos');
    expect(objetos[22].descricao).toBe('Serviço de revitalização do Riacho Esperança');
    expect(objetos[133].descricao).toBe('Aquisição de materiais de jardinagem em geral');
    expect(objetos[133].siglasExercicioAnterior).toEqual([]);
    const saaE = await prisma.orgao.findUniqueOrThrow({ where: { sigla: 'SAAE' } });
    const ipsema = await prisma.orgao.findUniqueOrThrow({ where: { sigla: 'IPSEMA' } });
    expect(saaE.grupoUnificacao).toBe('SAAE');
    expect(ipsema.grupoUnificacao).toBe('IPSEMA');
    expect((await prisma.orgao.findUniqueOrThrow({ where: { sigla: 'SME' } })).grupoUnificacao).toBe('Administração Direta');
    const idsAntes = objetos.map((objeto) => objeto.id);
    await prisma.objetoCatalogo.update({ where: { id: objetos[0].id }, data: { descricao: 'Ajuste administrativo preservado' } });
    await prisma.orgao.update({ where: { id: saaE.id }, data: { nome: 'Nome validado pela administração' } });
    await importarDados(prisma);
    expect(await prisma.objetoCatalogo.count()).toBe(390);
    expect(await prisma.orgao.count()).toBe(19);
    expect((await prisma.objetoCatalogo.findMany({ orderBy: { ordem: 'asc' } })).map((objeto) => objeto.id)).toEqual(idsAntes);
    expect((await prisma.objetoCatalogo.findUniqueOrThrow({ where: { id: objetos[0].id } })).descricao).toBe('Ajuste administrativo preservado');
    expect((await prisma.orgao.findUniqueOrThrow({ where: { id: saaE.id } })).nome).toBe('Nome validado pela administração');
    expect(await prisma.usuario.count()).toBe(0);
  });
});

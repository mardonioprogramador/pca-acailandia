import {PrismaClient} from '@prisma/client';
import {hash} from 'bcryptjs';
import {usuarioSchema} from '@pca/shared';

const cliente = new PrismaClient();
class ErroAdministracao extends Error {}
try {
  const entrada = usuarioSchema.safeParse({nome: process.env.ADMIN_NOME, email: process.env.ADMIN_EMAIL, senha: process.env.ADMIN_SENHA, perfil: 'ADMIN', orgaoId: null, ativo: true});
  if (!entrada.success || !entrada.data.senha) throw new ErroAdministracao('Informe ADMIN_NOME, ADMIN_EMAIL e ADMIN_SENHA (12 caracteres no mínimo, até 72 bytes UTF-8) nas variáveis de ambiente.');
  const {nome, email, senha} = entrada.data;
  const senhaHash = await hash(senha, 12);
  await cliente.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20250002)`;
    if (await tx.usuario.count({where: {perfil: 'ADMIN', ativo: true}})) throw new ErroAdministracao('Já existe administrador ativo. Use o cadastro de usuários autenticado para criar outros.');
    const usuario = await tx.usuario.create({data: {nome, email, senhaHash, perfil: 'ADMIN', trocaSenhaPendente: true}});
    await tx.auditoria.create({data: {usuarioId: usuario.id, entidade: 'Usuario', entidadeId: usuario.id, acao: 'CRIAR_ADMIN_INICIAL', depois: {nome, email, perfil: 'ADMIN', ativo: true}}});
  });
  console.log('Administrador inicial criado. A troca de senha será obrigatória no primeiro acesso.');
} catch (erro) {
  // Não registrar dados Prisma nem entradas de usuário que possam conter senhas.
  console.error(erro instanceof ErroAdministracao ? erro.message : 'Não foi possível criar o administrador. Verifique o banco e se o e-mail já existe.');
  process.exitCode = 1;
} finally { await cliente.$disconnect(); }

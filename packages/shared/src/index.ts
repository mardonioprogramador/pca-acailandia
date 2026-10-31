import {z} from 'zod';

z.setErrorMap(erro => {
  if (erro.code === 'invalid_type') return {message: erro.input === undefined ? 'Campo obrigatório.' : 'Tipo de dado inválido.'};
  if (erro.code === 'too_small') return {message: `Informe um valor com mínimo de ${erro.minimum}${erro.origin === 'string' ? ' caracteres' : ''}.`};
  if (erro.code === 'too_big') return {message: `Informe um valor com máximo de ${erro.maximum}${erro.origin === 'string' ? ' caracteres' : ''}.`};
  if (erro.code === 'invalid_value') return {message: 'Selecione uma das opções disponíveis.'};
  if (erro.code === 'invalid_format') return {message: 'Formato inválido para este campo.'};
  if (erro.code === 'unrecognized_keys') return {message: 'Foram enviados campos não permitidos.'};
  return {message: 'Valor inválido.'};
});

export const perfis = ['ADMIN', 'ORGAO'] as const;
export const tiposOrgao = ['ADMINISTRACAO_DIRETA', 'AUTARQUIA', 'FUNDO', 'OUTRO'] as const;
export const situacoesExercicio = ['RASCUNHO', 'ABERTO', 'FECHADO', 'PUBLICADO'] as const;
export const fusoHorario = 'America/Sao_Paulo';
export const senhaSchema = z.string().min(12, 'A senha deve ter pelo menos 12 caracteres.').max(72, 'A senha deve ter no máximo 72 caracteres.').refine(v => new TextEncoder().encode(v).length <= 72, 'A senha deve ter no máximo 72 bytes UTF-8.');
export const loginSchema = z.object({email: z.string().trim().email().toLowerCase(), senha: z.string().min(1).max(1024)}).strict();
export const trocarSenhaSchema = z.object({senhaAtual: z.string().min(1).max(1024), novaSenha: senhaSchema}).strict();
export const orgaoSchema = z.object({
  sigla: z.string().trim().min(1).max(30).toUpperCase().regex(/^[A-Z0-9_-]+$/, 'Sigla inválida.'),
  nome: z.string().trim().min(2).max(250),
  tipo: z.enum(tiposOrgao),
  grupoUnificacao: z.string().trim().min(1).max(100),
  ordem: z.number().int().min(0).max(99999),
  ativo: z.boolean(),
}).strict();
export const usuarioSchema = z.object({
  nome: z.string().trim().min(2).max(200), email: z.string().trim().email().max(250).toLowerCase(),
  perfil: z.enum(perfis), orgaoId: z.string().uuid().nullable(), ativo: z.boolean(), senha: senhaSchema.optional(),
}).strict().superRefine((v, ctx) => {
  if ((v.perfil === 'ORGAO' && !v.orgaoId) || (v.perfil === 'ADMIN' && v.orgaoId !== null)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ['orgaoId'], message: 'Usuário de órgão exige órgão; administrador não pode ter órgão.'});
  }
});
export const exercicioSchema = z.object({
  ano: z.number().int().min(2000).max(2200),
  titulo: z.string().trim().min(3).max(250).optional(),
  situacao: z.enum(situacoesExercicio),
  inicioPreenchimento: z.string().datetime({offset: true}),
  fimPreenchimento: z.string().datetime({offset: true}),
  atoPublicacao: z.string().trim().max(200).nullable().optional(),
}).strict().superRefine((v, ctx) => {
  if (Date.parse(v.fimPreenchimento) < Date.parse(v.inicioPreenchimento)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ['fimPreenchimento'], message: 'O fim do período deve ser igual ou posterior ao início.'});
  }
});
export type Perfil = typeof perfis[number];
export type OrgaoInput = z.infer<typeof orgaoSchema>;
export type UsuarioInput = z.infer<typeof usuarioSchema>;
export type ExercicioInput = z.infer<typeof exercicioSchema>;

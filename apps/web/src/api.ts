export interface Orgao {
  id: string;
  sigla: string;
  nome: string;
  tipo: 'ADMINISTRACAO_DIRETA' | 'AUTARQUIA' | 'FUNDO' | 'OUTRO';
  grupoUnificacao: string;
  ordem: number;
  ativo: boolean;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: 'ADMIN' | 'ORGAO';
  orgaoId: string | null;
  ativo: boolean;
  trocaSenhaPendente: boolean;
  orgao?: Orgao | null;
}

export interface Sessao { usuario: Usuario; csrfToken: string }

export interface Exercicio {
  id: string;
  ano: number;
  titulo: string;
  situacao: 'RASCUNHO' | 'ABERTO' | 'FECHADO' | 'PUBLICADO';
  inicioPreenchimento: string;
  fimPreenchimento: string;
  atoPublicacao: string | null;
}

export interface ListaOrgao {
  id: string;
  exercicioId: string;
  orgaoId: string;
  situacao: 'NAO_INICIADA' | 'EM_PREENCHIMENTO' | 'ENVIADA';
  orgao: Orgao;
  exercicio: Exercicio;
}

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem); }
}

export async function requisitar<T>(caminho: string, metodo = 'GET', dados?: unknown, csrfToken?: string): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: {
        ...(dados !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      ...(dados !== undefined ? { body: JSON.stringify(dados) } : {}),
    });
  } catch {
    throw new Error('Não foi possível conectar ao sistema. Verifique sua conexão e tente novamente.');
  }
  if (resposta.status === 204) return undefined as T;
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem = corpo && typeof corpo === 'object' && 'mensagem' in corpo && typeof corpo.mensagem === 'string'
      ? corpo.mensagem : corpo && typeof corpo === 'object' && 'erro' in corpo && typeof corpo.erro === 'string'
        ? corpo.erro : 'Não foi possível concluir a operação.';
    const nomesCampos: Record<string, string> = {
      email: 'e-mail institucional', senha: 'senha', senhaAtual: 'senha atual', novaSenha: 'nova senha',
      nome: 'nome completo', sigla: 'sigla', tipo: 'tipo do órgão', grupoUnificacao: 'grupo de unificação',
      ordem: 'ordem de exibição', ativo: 'situação do cadastro', perfil: 'perfil', orgaoId: 'órgão',
      ano: 'ano', titulo: 'título', situacao: 'situação do exercício',
      inicioPreenchimento: 'início do preenchimento', fimPreenchimento: 'fim do preenchimento', atoPublicacao: 'ato de publicação',
    };
    const campos = corpo && typeof corpo === 'object' && 'campos' in corpo && corpo.campos && typeof corpo.campos === 'object'
      ? Object.keys(corpo.campos).map(campo => nomesCampos[campo]).filter(Boolean) : [];
    throw new ErroApi(resposta.status, campos.length ? `${mensagem} Revise: ${campos.join(', ')}.` : mensagem);
  }
  return corpo as T;
}

export const formatarData = (valor: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
}).format(new Date(valor));

export function dataParaCampo(valor: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(valor));
  const obter = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? '';
  return `${obter('year')}-${obter('month')}-${obter('day')}T${obter('hour')}:${obter('minute')}`;
}

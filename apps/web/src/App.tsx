import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  dataParaCampo, ErroApi, formatarData, requisitar,
  type Exercicio, type ListaOrgao, type Orgao, type Sessao, type Usuario,
} from './api';

const nomesSituacao: Record<string, string> = {
  RASCUNHO: 'Rascunho', ABERTO: 'Aberto', FECHADO: 'Fechado', PUBLICADO: 'Publicado',
  NAO_INICIADA: 'Não iniciada', EM_PREENCHIMENTO: 'Em preenchimento', ENVIADA: 'Enviada',
};

function Mensagem({ erro, sucesso }: { erro?: Error | null; sucesso?: string }) {
  if (erro) return <div className="aviso erro" role="alert">{erro.message}</div>;
  if (sucesso) return <div className="aviso sucesso" role="status">{sucesso}</div>;
  return null;
}

function Marca() {
  return <div className="marca"><span className="marca-icone" aria-hidden="true">P</span><span>PCA <strong>Açailândia</strong><small>Planejamento das contratações</small></span></div>;
}

export function App() {
  const cliente = useQueryClient();
  const sessao = useQuery({ queryKey: ['sessao'], queryFn: () => requisitar<Sessao>('/auth/me') });
  const [erroSaida, setErroSaida] = useState<Error | null>(null);
  const [saindo, setSaindo] = useState(false);
  function guardarSessao(dados: Sessao) {
    cliente.removeQueries({ predicate: consulta => consulta.queryKey[0] !== 'sessao' });
    cliente.setQueryData(['sessao'], dados);
  }
  async function sair() {
    if (!sessao.data) return;
    setSaindo(true);
    setErroSaida(null);
    try {
      await requisitar('/auth/logout', 'POST', {}, sessao.data.csrfToken);
      cliente.removeQueries({ predicate: consulta => consulta.queryKey[0] !== 'sessao' });
      cliente.setQueryData(['sessao'], null);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 401) { cliente.removeQueries({ predicate: consulta => consulta.queryKey[0] !== 'sessao' }); cliente.setQueryData(['sessao'], null); }
      else setErroSaida(erro as Error);
    }
    finally { setSaindo(false); }
  }
  if (sessao.isPending) return <div className="carregamento" role="status">Carregando o sistema…</div>;
  if (!sessao.data) {
    if (sessao.error && !(sessao.error instanceof ErroApi && sessao.error.status === 401)) {
      return <div className="login-pagina"><main className="login-cartao"><Marca /><h1>Sistema indisponível</h1><Mensagem erro={sessao.error} /><button onClick={() => void sessao.refetch()}>Tentar novamente</button></main></div>;
    }
    return <Login aoEntrar={guardarSessao} />;
  }
  const atual = sessao.data;
  const admin = atual.usuario.perfil === 'ADMIN';
  return <div className="estrutura">
    <a className="pular" href="#conteudo">Ir para o conteúdo</a>
    <aside className="lateral">
      <Marca />
      <p className="rotulo-menu">Área de trabalho</p>
      <nav aria-label="Menu principal">
        {admin ? <>
          <NavLink to="/exercicios"><span aria-hidden="true">◷</span> Exercícios</NavLink>
          <NavLink to="/orgaos"><span aria-hidden="true">▤</span> Órgãos</NavLink>
          <NavLink to="/usuarios"><span aria-hidden="true">♙</span> Usuários</NavLink>
        </> : <NavLink to="/minhas-listas"><span aria-hidden="true">▤</span> Minhas listas</NavLink>}
        <NavLink to="/minha-senha"><span aria-hidden="true">◇</span> Minha senha</NavLink>
      </nav>
      <div className="lateral-rodape"><strong>Prefeitura de Açailândia</strong><span>Comissão Central de Licitação</span><span>Maranhão</span></div>
    </aside>
    <div className="area-principal">
      <header className="topo"><span>Sistema de Elaboração do PCA</span><div className="conta"><div><strong>{atual.usuario.nome}</strong><small>{admin ? 'Administrador' : atual.usuario.orgao?.sigla ?? 'Usuário de órgão'}</small></div><button className="botao-secundario compacto" onClick={() => void sair()} disabled={saindo}>{saindo ? 'Saindo…' : 'Sair'}</button></div></header>
      <main id="conteudo" tabIndex={-1}>
        <Mensagem erro={erroSaida} />
        {atual.usuario.trocaSenhaPendente
          ? <TrocarSenha sessao={atual} aoTrocar={guardarSessao} obrigatoria />
          : <Routes>
            <Route path="/minha-senha" element={<TrocarSenha sessao={atual} aoTrocar={guardarSessao} />} />
            {admin ? <>
              <Route path="/exercicios" element={<Cadastro chave="exercicios" sessao={atual} />} />
              <Route path="/orgaos" element={<Cadastro chave="orgaos" sessao={atual} />} />
              <Route path="/usuarios" element={<Cadastro chave="usuarios" sessao={atual} />} />
            </> : <Route path="/minhas-listas" element={<MinhasListas />} />}
            <Route path="*" element={<Navigate replace to={admin ? '/exercicios' : '/minhas-listas'} />} />
          </Routes>}
      </main>
      <footer className="rodape">Prefeitura Municipal de Açailândia · Comissão Central de Licitação<span>Horários de Brasília (America/Sao_Paulo)</span></footer>
    </div>
  </div>;
}

function Login({ aoEntrar }: { aoEntrar: (sessao: Sessao) => void }) {
  const entrar = useMutation({ mutationFn: (dados: { email: string; senha: string }) => requisitar<Sessao>('/auth/login', 'POST', dados), onSuccess: aoEntrar });
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    entrar.mutate({ email: String(dados.get('email')), senha: String(dados.get('senha')) });
  }
  return <div className="login-pagina">
    <section className="login-apresentacao"><Marca /><div><p className="sobretitulo">Gestão pública municipal</p><h1>Planejar hoje.<br />Contratar melhor.</h1><p>Organização e responsabilidade no planejamento das contratações de Açailândia.</p><div className="linha-decorativa" /></div><small>Prefeitura Municipal de Açailândia / MA<br />Comissão Central de Licitação</small></section>
    <main className="login-cartao"><span className="etiqueta">Acesso ao sistema</span><h2>Bem-vindo ao PCA</h2><p className="texto-suave">Entre com seu e-mail institucional e sua senha.</p>
      <form onSubmit={enviar} className="formulario">
        <label htmlFor="email-login">E-mail institucional<input id="email-login" name="email" type="email" autoComplete="username" required autoFocus /></label>
        <label htmlFor="senha-login">Senha<input id="senha-login" name="senha" type="password" autoComplete="current-password" required /></label>
        <Mensagem erro={entrar.error} />
        <button disabled={entrar.isPending} type="submit">{entrar.isPending ? 'Entrando…' : 'Entrar no sistema'} <span aria-hidden="true">→</span></button>
      </form><p className="ajuda-login">Precisa de acesso ou esqueceu sua senha?<br />Procure o administrador da CCL.</p>
    </main>
  </div>;
}

function TrocarSenha({ sessao, aoTrocar, obrigatoria = false }: { sessao: Sessao; aoTrocar: (sessao: Sessao) => void; obrigatoria?: boolean }) {
  const [erroLocal, setErroLocal] = useState<Error | null>(null);
  const [sucesso, setSucesso] = useState('');
  const trocar = useMutation({ mutationFn: (dados: { senhaAtual: string; novaSenha: string }) => requisitar<Sessao>('/auth/senha', 'POST', dados, sessao.csrfToken), onSuccess: dados => { aoTrocar(dados); setSucesso('Senha alterada com sucesso.'); } });
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroLocal(null); setSucesso('');
    const dados = new FormData(evento.currentTarget);
    if (dados.get('novaSenha') !== dados.get('confirmacao')) { setErroLocal(new Error('A confirmação deve ser igual à nova senha.')); return; }
    trocar.mutate({ senhaAtual: String(dados.get('senhaAtual')), novaSenha: String(dados.get('novaSenha')) });
  }
  return <>
    <Titulo secao="Minha conta" titulo={obrigatoria ? 'Defina sua nova senha' : 'Minha senha'} descricao={obrigatoria ? 'Antes de continuar, substitua a senha inicial definida pelo administrador.' : 'Atualize sua senha de acesso ao sistema.'} />
    <section className="painel painel-estreito"><form className="formulario" onSubmit={enviar}>
      <label htmlFor="senha-atual">Senha atual<input id="senha-atual" name="senhaAtual" type="password" autoComplete="current-password" required /></label>
      <label htmlFor="nova-senha">Nova senha<input id="nova-senha" name="novaSenha" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /><small>Use de 12 a 72 caracteres. Evite nomes e informações pessoais.</small></label>
      <label htmlFor="confirmar-senha">Confirme a nova senha<input id="confirmar-senha" name="confirmacao" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /></label>
      <Mensagem erro={erroLocal ?? trocar.error} sucesso={sucesso} />
      <button type="submit" disabled={trocar.isPending}>{trocar.isPending ? 'Salvando…' : 'Salvar nova senha'}</button>
    </form></section>
  </>;
}

function Titulo({ secao, titulo, descricao, acao }: { secao: string; titulo: string; descricao: string; acao?: ReactNode }) {
  return <div className="titulo-pagina"><div><p className="sobretitulo">{secao}</p><h1>{titulo}</h1><p>{descricao}</p></div>{acao}</div>;
}

type ChaveCadastro = 'exercicios' | 'orgaos' | 'usuarios';
type Registro = Exercicio | Orgao | Usuario;
const titulos: Record<ChaveCadastro, { titulo: string; singular: string; descricao: string }> = {
  exercicios: { titulo: 'Exercícios', singular: 'exercício', descricao: 'Organize os exercícios e os períodos de preenchimento do PCA.' },
  orgaos: { titulo: 'Órgãos', singular: 'órgão', descricao: 'Gerencie os órgãos municipais e seus grupos de unificação.' },
  usuarios: { titulo: 'Usuários', singular: 'usuário', descricao: 'Gerencie os acessos e os perfis de cada usuário.' },
};

function Cadastro({ chave, sessao }: { chave: ChaveCadastro; sessao: Sessao }) {
  // A chave remonta a página para não transportar um formulário entre cadastros.
  return <PaginaCadastro key={chave} chave={chave} sessao={sessao} />;
}

function PaginaCadastro({ chave, sessao }: { chave: ChaveCadastro; sessao: Sessao }) {
  const cliente = useQueryClient();
  const [edicao, setEdicao] = useState<Registro | 'novo' | null>(null);
  const [senhaUsuario, setSenhaUsuario] = useState<Usuario | null>(null);
  const [mensagem, setMensagem] = useState('');
  const consulta = useQuery({ queryKey: [chave], queryFn: () => requisitar<Registro[]>(`/${chave}`) });
  const orgaos = useQuery({ queryKey: ['orgaos'], queryFn: () => requisitar<Orgao[]>('/orgaos'), enabled: chave === 'usuarios' });
  const excluir = useMutation({ mutationFn: (id: string) => requisitar(`/${chave}/${id}`, 'DELETE', undefined, sessao.csrfToken), onSuccess: async () => { setMensagem('Operação concluída com sucesso.'); await cliente.invalidateQueries({ queryKey: [chave] }); } });
  const texto = titulos[chave];
  function pedirExclusao(registro: Registro) {
    setMensagem('');
    const nome = 'nome' in registro ? registro.nome : String(registro.ano);
    const acao = chave === 'exercicios' ? 'excluir' : 'desativar';
    if (window.confirm(`Confirma ${acao} ${texto.singular} “${nome}”? ${chave === 'exercicios' ? 'Apenas exercícios em rascunho podem ser excluídos.' : 'O histórico será preservado.'}`)) excluir.mutate(registro.id);
  }
  return <>
    <Titulo secao="Cadastros" titulo={texto.titulo} descricao={texto.descricao} acao={<button onClick={() => { setEdicao('novo'); setSenhaUsuario(null); setMensagem(''); }}>+ Novo {texto.singular}</button>} />
    <Mensagem erro={consulta.error ?? excluir.error} sucesso={mensagem} />
    {edicao && <FormularioCadastro key={edicao === 'novo' ? 'novo' : edicao.id} chave={chave} registro={edicao === 'novo' ? null : edicao} orgaos={orgaos.data ?? []} erroOrgaos={orgaos.error} carregandoOrgaos={orgaos.isPending && chave === 'usuarios'} sessao={sessao} cancelar={() => setEdicao(null)} salvo={async () => { setEdicao(null); setMensagem('Cadastro salvo com sucesso.'); await cliente.invalidateQueries({ queryKey: [chave] }); }} />}
    {senhaUsuario && <RedefinirSenha key={senhaUsuario.id} usuario={senhaUsuario} sessao={sessao} cancelar={() => setSenhaUsuario(null)} salvo={() => { setSenhaUsuario(null); setMensagem('Senha redefinida. O usuário deverá trocá-la no próximo acesso.'); }} />}
    <section className="painel tabela-painel" aria-label={`Lista de ${texto.titulo.toLowerCase()}`}>
      <div className="tabela-cabecalho"><h2>{texto.titulo} cadastrados</h2><span>{consulta.data?.length ?? 0} registros</span></div>
      {consulta.isPending ? <p className="estado-vazio" role="status">Carregando cadastros…</p> : consulta.error ? <div className="estado-vazio"><p>Não foi possível carregar os cadastros.</p><button className="botao-secundario" onClick={() => void consulta.refetch()}>Tentar novamente</button></div> : !consulta.data?.length ? <div className="estado-vazio"><span aria-hidden="true">▤</span><h3>Nenhum {texto.singular} cadastrado</h3><p>Use o botão acima para iniciar o cadastro.</p></div> : <div className="tabela-rolagem"><table><thead><tr>{chave === 'exercicios' ? <><th>Exercício</th><th>Período de preenchimento</th><th>Situação</th></> : chave === 'orgaos' ? <><th>Órgão</th><th>Grupo de unificação</th><th>Situação</th></> : <><th>Usuário</th><th>Perfil / órgão</th><th>Situação</th></>}<th className="acoes-coluna">Ações</th></tr></thead><tbody>
        {consulta.data.map(registro => <tr key={registro.id}>
          {chave === 'exercicios' ? <ColunasExercicio registro={registro as Exercicio} /> : chave === 'orgaos' ? <ColunasOrgao registro={registro as Orgao} /> : <ColunasUsuario registro={registro as Usuario} orgaos={orgaos.data ?? []} />}
          <td><div className="acoes-tabela"><button className="botao-texto" onClick={() => { setEdicao(registro); setSenhaUsuario(null); setMensagem(''); }} aria-label={`Editar ${'nome' in registro ? registro.nome : registro.ano}`}>Editar</button>{chave === 'usuarios' && <button className="botao-texto" onClick={() => { setSenhaUsuario(registro as Usuario); setEdicao(null); setMensagem(''); }}>Redefinir senha</button>}<button className="botao-texto perigo" disabled={excluir.isPending || ('ativo' in registro && !registro.ativo)} onClick={() => pedirExclusao(registro)} aria-label={`${chave === 'exercicios' ? 'Excluir' : 'Desativar'} ${'nome' in registro ? registro.nome : registro.ano}`}>{chave === 'exercicios' ? 'Excluir' : 'Desativar'}</button></div></td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </>;
}

function ColunasExercicio({ registro }: { registro: Exercicio }) {
  return <><td><strong>{registro.ano}</strong><small className="limitar-texto">{registro.titulo}</small></td><td>{formatarData(registro.inicioPreenchimento)}<small>até {formatarData(registro.fimPreenchimento)}</small></td><td><span className={`selo ${registro.situacao === 'ABERTO' ? 'ativo' : ''}`}>{nomesSituacao[registro.situacao]}</span></td></>;
}
function ColunasOrgao({ registro }: { registro: Orgao }) {
  return <><td><strong>{registro.sigla}</strong><small>{registro.nome}</small></td><td>{registro.grupoUnificacao}</td><td><span className={`selo ${registro.ativo ? 'ativo' : ''}`}>{registro.ativo ? 'Ativo' : 'Inativo'}</span></td></>;
}
function ColunasUsuario({ registro, orgaos }: { registro: Usuario; orgaos: Orgao[] }) {
  return <><td><strong>{registro.nome}</strong><small>{registro.email}</small></td><td>{registro.perfil === 'ADMIN' ? 'Administrador' : 'Usuário de órgão'}<small>{registro.perfil === 'ORGAO' ? registro.orgao?.sigla ?? orgaos.find(o => o.id === registro.orgaoId)?.sigla ?? 'Órgão vinculado' : 'Todos os órgãos'}</small></td><td><span className={`selo ${registro.ativo ? 'ativo' : ''}`}>{registro.ativo ? 'Ativo' : 'Inativo'}</span></td></>;
}

function FormularioCadastro({ chave, registro, orgaos, erroOrgaos, carregandoOrgaos, sessao, cancelar, salvo }: { chave: ChaveCadastro; registro: Registro | null; orgaos: Orgao[]; erroOrgaos: Error | null; carregandoOrgaos: boolean; sessao: Sessao; cancelar: () => void; salvo: () => Promise<void> }) {
  const usuario = chave === 'usuarios' ? registro as Usuario | null : null;
  const [perfil, setPerfil] = useState(usuario?.perfil ?? 'ORGAO');
  const salvar = useMutation({ mutationFn: (dados: unknown) => requisitar(`/${chave}${registro ? `/${registro.id}` : ''}`, registro ? 'PUT' : 'POST', dados, sessao.csrfToken), onSuccess: salvo });
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const texto = (nome: string) => String(dados.get(nome) ?? '').trim();
    if (chave === 'orgaos') salvar.mutate({ sigla: texto('sigla'), nome: texto('nome'), tipo: texto('tipo'), grupoUnificacao: texto('grupoUnificacao'), ordem: Number(texto('ordem')), ativo: dados.has('ativo') });
    if (chave === 'usuarios') salvar.mutate({ nome: texto('nome'), email: texto('email'), perfil, orgaoId: perfil === 'ADMIN' ? null : texto('orgaoId'), ativo: dados.has('ativo'), ...(!registro ? { senha: String(dados.get('senha') ?? '') } : {}) });
    if (chave === 'exercicios') salvar.mutate({ ano: Number(texto('ano')), ...(texto('titulo') ? { titulo: texto('titulo') } : {}), situacao: texto('situacao'), inicioPreenchimento: `${texto('inicioPreenchimento')}:00-03:00`, fimPreenchimento: `${texto('fimPreenchimento')}:00-03:00`, atoPublicacao: texto('atoPublicacao') || null });
  }
  const orgao = chave === 'orgaos' ? registro as Orgao | null : null;
  const exercicio = chave === 'exercicios' ? registro as Exercicio | null : null;
  return <section className="painel formulario-painel" aria-labelledby="titulo-cadastro" key={registro?.id ?? 'novo'}><h2 id="titulo-cadastro">{registro ? 'Editar' : 'Novo'} {titulos[chave].singular}</h2><form onSubmit={enviar} className="formulario">
    {exercicio?.situacao === 'PUBLICADO' && <div className="aviso informacao">O exercício publicado não pode ser alterado.</div>}
    <fieldset className="grade-formulario" disabled={exercicio?.situacao === 'PUBLICADO'}>
      {chave === 'orgaos' && <>
        <label htmlFor="sigla">Sigla<input id="sigla" name="sigla" required maxLength={30} defaultValue={orgao?.sigla ?? ''} /></label>
        <label htmlFor="nome-orgao">Nome completo<input id="nome-orgao" name="nome" required maxLength={250} defaultValue={orgao?.nome ?? ''} /></label>
        <label htmlFor="tipo">Tipo<select id="tipo" name="tipo" defaultValue={orgao?.tipo ?? 'ADMINISTRACAO_DIRETA'}><option value="ADMINISTRACAO_DIRETA">Administração direta</option><option value="AUTARQUIA">Autarquia</option><option value="FUNDO">Fundo</option><option value="OUTRO">Outro</option></select></label>
        <label htmlFor="grupoUnificacao">Grupo de unificação<input id="grupoUnificacao" name="grupoUnificacao" required maxLength={100} defaultValue={orgao?.grupoUnificacao ?? 'Administração Direta'} /></label>
        <label htmlFor="ordem">Ordem de exibição<input id="ordem" name="ordem" type="number" min={0} max={99999} step={1} required defaultValue={orgao?.ordem ?? 0} /></label>
        <label className="campo-checkbox" htmlFor="ativo-orgao"><input id="ativo-orgao" name="ativo" type="checkbox" defaultChecked={orgao?.ativo ?? true} />Órgão ativo</label>
      </>}
      {chave === 'usuarios' && <>
        <label htmlFor="nome-usuario">Nome completo<input id="nome-usuario" name="nome" required maxLength={200} defaultValue={usuario?.nome ?? ''} /></label>
        <label htmlFor="email-usuario">E-mail institucional<input id="email-usuario" name="email" type="email" maxLength={250} autoComplete="off" required defaultValue={usuario?.email ?? ''} /></label>
        <label htmlFor="perfil">Perfil<select id="perfil" name="perfil" value={perfil} onChange={evento => setPerfil(evento.target.value as Usuario['perfil'])}><option value="ORGAO">Usuário de órgão</option><option value="ADMIN">Administrador</option></select></label>
        {perfil === 'ORGAO' && <label htmlFor="orgaoId">Órgão<select id="orgaoId" name="orgaoId" required defaultValue={usuario?.orgaoId ?? ''} disabled={carregandoOrgaos}><option value="">{carregandoOrgaos ? 'Carregando órgãos…' : 'Selecione o órgão'}</option>{orgaos.map(o => <option value={o.id} key={o.id}>{o.sigla} — {o.nome}{o.ativo ? '' : ' (inativo)'}</option>)}</select></label>}
        {!registro && <label htmlFor="senha-inicial">Senha inicial<input id="senha-inicial" name="senha" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /><small>O usuário deverá trocá-la no primeiro acesso.</small></label>}
        <label className="campo-checkbox" htmlFor="ativo-usuario"><input id="ativo-usuario" name="ativo" type="checkbox" defaultChecked={usuario?.ativo ?? true} />Usuário ativo</label>
      </>}
      {chave === 'exercicios' && <>
        <label htmlFor="ano">Ano<input id="ano" name="ano" type="number" min={2000} max={2200} step={1} required defaultValue={exercicio?.ano ?? Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date())) + 1} /></label>
        <label htmlFor="situacao">Situação<select id="situacao" name="situacao" defaultValue={exercicio?.situacao ?? 'RASCUNHO'}>
          {(!exercicio || exercicio.situacao === 'RASCUNHO') && <option value="RASCUNHO">Rascunho</option>}
          {exercicio && ['RASCUNHO', 'ABERTO'].includes(exercicio.situacao) && <option value="ABERTO">Aberto</option>}
          {exercicio && ['ABERTO', 'FECHADO'].includes(exercicio.situacao) && <option value="FECHADO">Fechado</option>}
          {exercicio?.situacao === 'PUBLICADO' && <option value="PUBLICADO">Publicado</option>}
        </select></label>
        <label className="campo-largo" htmlFor="titulo">Título<input id="titulo" name="titulo" defaultValue={exercicio?.titulo ?? ''} minLength={3} maxLength={250} placeholder="Deixe vazio para usar o título padrão do exercício" /></label>
        <label htmlFor="inicioPreenchimento">Início do preenchimento<input id="inicioPreenchimento" name="inicioPreenchimento" type="datetime-local" required defaultValue={exercicio ? dataParaCampo(exercicio.inicioPreenchimento) : ''} /><small>Horário de Brasília</small></label>
        <label htmlFor="fimPreenchimento">Fim do preenchimento<input id="fimPreenchimento" name="fimPreenchimento" type="datetime-local" required defaultValue={exercicio ? dataParaCampo(exercicio.fimPreenchimento) : ''} /><small>Horário de Brasília</small></label>
        <label className="campo-largo" htmlFor="atoPublicacao">Ato de publicação (opcional)<input id="atoPublicacao" name="atoPublicacao" defaultValue={exercicio?.atoPublicacao ?? ''} maxLength={200} placeholder="Ex.: Decreto Municipal nº 150/2024" /></label>
      </>}
    </fieldset>
    <Mensagem erro={salvar.error ?? (chave === 'usuarios' ? erroOrgaos : null)} />
    <div className="acoes-formulario"><button type="submit" disabled={exercicio?.situacao === 'PUBLICADO' || salvar.isPending || (chave === 'usuarios' && perfil === 'ORGAO' && (carregandoOrgaos || !!erroOrgaos))}>{salvar.isPending ? 'Salvando…' : 'Salvar cadastro'}</button><button className="botao-secundario" type="button" disabled={salvar.isPending} onClick={cancelar}>Cancelar</button></div>
  </form></section>;
}

function RedefinirSenha({ usuario, sessao, cancelar, salvo }: { usuario: Usuario; sessao: Sessao; cancelar: () => void; salvo: () => void }) {
  const redefinir = useMutation({ mutationFn: (senha: string) => requisitar(`/usuarios/${usuario.id}/redefinir-senha`, 'POST', { senha }, sessao.csrfToken), onSuccess: salvo });
  return <section className="painel formulario-painel"><h2>Redefinir senha de {usuario.nome}</h2><p className="texto-suave">A senha atual será substituída e uma nova troca será exigida no próximo acesso.</p><form className="formulario" onSubmit={evento => { evento.preventDefault(); redefinir.mutate(String(new FormData(evento.currentTarget).get('senha'))); }}><label htmlFor="senha-redefinida">Nova senha inicial<input id="senha-redefinida" name="senha" type="password" minLength={12} maxLength={72} required autoComplete="new-password" /></label><Mensagem erro={redefinir.error} /><div className="acoes-formulario"><button disabled={redefinir.isPending} type="submit">{redefinir.isPending ? 'Redefinindo…' : 'Redefinir senha'}</button><button className="botao-secundario" type="button" onClick={cancelar}>Cancelar</button></div></form></section>;
}

function MinhasListas() {
  const consulta = useQuery({ queryKey: ['listas'], queryFn: () => requisitar<ListaOrgao[]>('/listas') });
  return <>
    <Titulo secao="Área do órgão" titulo="Minhas listas" descricao="Consulte os exercícios vinculados ao seu órgão." />
    <Mensagem erro={consulta.error} />
    <div className="aviso informacao">O preenchimento e o envio das demandas ainda não estão disponíveis.</div>
    <section className="painel tabela-painel"><div className="tabela-cabecalho"><h2>Listas do meu órgão</h2><span>{consulta.data?.length ?? 0} listas</span></div>
      {consulta.isPending ? <p className="estado-vazio" role="status">Carregando listas…</p> : consulta.error ? <div className="estado-vazio"><button className="botao-secundario" onClick={() => void consulta.refetch()}>Tentar novamente</button></div> : !consulta.data?.length ? <div className="estado-vazio"><span aria-hidden="true">▤</span><h3>Nenhum exercício disponível</h3><p>As listas aparecerão quando a CCL cadastrar um exercício para seu órgão.</p></div> : <div className="tabela-rolagem"><table><thead><tr><th>Exercício</th><th>Órgão</th><th>Período de preenchimento</th><th>Situação da lista</th></tr></thead><tbody>{consulta.data.map(lista => <tr key={lista.id}><td><strong>{lista.exercicio.ano}</strong><small>{lista.exercicio.titulo}</small></td><td><strong>{lista.orgao.sigla}</strong><small>{lista.orgao.nome}</small></td><td>{formatarData(lista.exercicio.inicioPreenchimento)}<small>até {formatarData(lista.exercicio.fimPreenchimento)}</small></td><td><span className="selo">{nomesSituacao[lista.situacao]}</span></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}

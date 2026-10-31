# Decisões técnicas — fase 1

## Escopo e organização

Monorepo npm workspaces em `apps/api`, `apps/web` e `packages/shared`, conforme o PDR §12. A fase 1 entrega a base de autenticação, cadastros, auditoria e importação. A função de unificação, catálogo interativo, demandas, envio e PDF não foram antecipados.

As listas existem como estrutura vinculada ao exercício e ao órgão, com consulta protegida no backend. As tentativas de leitura e alteração de listas de outro órgão são negadas antes de qualquer acesso funcional. A edição das seleções permanece indisponível nesta fase; não há uma operação fictícia de seleção para fazer o critério de isolamento passar.

## Banco e importação

PostgreSQL 16 com Prisma 6 e migrações versionadas. As restrições de unicidade e os vínculos ficam no banco. Cadastros e seus registros de auditoria usam a mesma transação; falhas não devem deixar alterações sem histórico.

O seed importa 19 órgãos e um objeto por cada uma das 390 posições do CSV, sem deduplicar por número do PCA ou descrição. Preserva o número 22 repetido e as linhas com dados incompletos. A chave estável de importação permite reexecutar o seed sem duplicar registros. O seed não cria credenciais padrão e não simula o exercício de demonstração da fase 3.

O relatório de ocorrências está em `docs/relatorio-importacao.md`, fora de `docs/dados/`, para respeitar a restrição explícita de não alterar essa pasta. Os CSVs e o PDR permanecem intactos.

## Segurança

Sessões opacas no servidor, com token aleatório armazenado em hash, expiração absoluta de oito horas e cookie HttpOnly/SameSite Strict. O atributo Secure é controlado por `SECURE_COOKIES`: desligado apenas no HTTP local e ligado sob HTTPS. Nenhuma credencial de sessão é armazenada no localStorage.

As mutações autenticadas exigem um token CSRF associado à sessão. O login limita tentativas de cada usuário no banco, com bloqueio de quinze minutos após cinco falhas. A troca de senha inicial é obrigatória; redefinições invalidam sessões. As permissões são verificadas na API usando o usuário atual e seu órgão ativo, sem confiar em campos enviados pelo frontend.

Os registros de auditoria armazenam o ator, a ação, a entidade, o instante e os dados de cadastro antes/depois. Senhas, hashes de senha, tokens de sessão e tokens CSRF não entram no histórico nem nas respostas de cadastro. A tela de consulta da auditoria fica para a fase 4.

## Dependências complementares

- `bcryptjs`: implementação pequena de bcrypt sem compilação nativa, necessária ao hash de senhas previsto pelo PDR.
- `dotenv`: carrega a configuração local `.env` na API e nos comandos administrativos; nenhum segredo é versionado.
- `csv-parse`: interpreta os CSVs com BOM, separador `;` e campos delimitados corretamente, sem um parser caseiro que possa corromper os dados oficiais.
- `tsx`: executa TypeScript em desenvolvimento e nos comandos de migração de dados/administração.
- `concurrently`: executa os processos de API e Vite com um único comando de desenvolvimento.
- `supertest`: exercita a API Express com cookies e respostas HTTP nos testes Vitest, usando PostgreSQL real.
- Tipagens, ESLint e ferramentas TypeScript/Vite: suporte de compilação, lint e desenvolvimento da stack prescrita.

## Infraestrutura e testes

Docker Compose mantém o PostgreSQL em volume persistente e executa a aplicação com usuário sem privilégios. O build preserva TLS e as assinaturas dos pacotes; ambientes com proxy podem montar a CA como secret temporário do BuildKit. A imagem conserva Prisma CLI e `tsx` para comandos administrativos explícitos de migração, seed e criação do administrador.

Os testes de integração usam PostgreSQL real e isolado, sem substituir o controle de acesso por mocks. O seed é testado com reexecução. O código de desenvolvimento não recebe credenciais fixas de teste. Datas de interface e configuração seguem `America/Sao_Paulo`; o banco armazena os instantes de forma inequívoca.

O runner cria um schema aleatório por execução, inclusive ao usar `TEST_DATABASE_URL`, e remove apenas esse schema. O contêiner descartável usa senha aleatória e porta publicada no loopback. A criação de órgãos, exercícios e a importação compartilham uma trava transacional para preservar os vínculos de listas em operações concorrentes. A CI versionada repete lint, tipos, integração e build; a execução remota depende do envio do código ao GitHub.

## Atualizações de dependências e validação

Foram adotadas versões corrigidas de Express 4, Zod 4, React Router 7 (compatível com React 18), csv-parse 7, Vite 6 e Vitest 4, sem trocar as ferramentas prescritas no PDR. O override de `deepmerge-ts` para 8.0.2 está restrito a `@prisma/config`: corrige exaustão de pilha sem migrar o Prisma 6. A compatibilidade foi verificada com `prisma validate` carregando uma configuração explícita, geração do cliente, migrações e testes com banco real.

Na verificação desta entrega, `npm audit --omit=dev` não apontou vulnerabilidades. O audit completo ainda apontou 11 avisos moderados na cadeia de lint ESLint/typescript-eslint/minimatch, sem avisos altos ou críticos. Não foi aplicado o downgrade incompatível sugerido pelo audit, nem um override global de minimatch entre versões principais. Essas ferramentas operam sobre arquivos do projeto; a atualização coordenada dessa cadeia permanece pendente.

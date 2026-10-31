# Sistema PCA — Açailândia/MA

Base da fase 1 do Sistema de Elaboração do Plano de Contratações Anual da Prefeitura Municipal de Açailândia. A especificação preservada está em [docs/PDR pca.md](<docs/PDR pca.md>).

Esta fase entrega autenticação, perfis, auditoria dos cadastros, gestão de exercícios, órgãos e usuários, importação de 390 objetos e 19 órgãos e isolamento das listas por órgão no backend. Catálogo interativo, seleção de objetos e envio pertencem à fase 2; unificação e versionamento à fase 3; PDF, consulta da auditoria e E2E completos à fase 4.

## Requisitos

- Node.js 20+; imagem da aplicação com Node.js 22.
- npm com suporte a workspaces, Docker e Docker Compose v2.
- PostgreSQL 16, fornecido pelo Compose.

## Configuração local do zero

Execute na raiz do repositório:

```bash
cp .env.example .env
```

Preencha no arquivo local `.env`:

- `POSTGRES_USER`, `POSTGRES_DB` e `POSTGRES_PASSWORD`: usuário, banco e uma senha própria. Prefira senha aleatória com caracteres seguros para URL; por exemplo, gere uma com `openssl rand -hex 32` e mantenha o valor somente no arquivo local.
- `DATABASE_URL`: `postgresql://USUARIO:SENHA@localhost:5432/BANCO?schema=public`, substituindo os marcadores. Se a senha contiver caracteres reservados, codifique-os para URL. No Compose a aplicação usa o host `db` automaticamente, a partir das variáveis `POSTGRES_*`.
- `SECURE_COOKIES=false` somente para desenvolvimento local por HTTP. Use `true` quando o navegador acessar a aplicação por HTTPS.
- `APP_ORIGIN`: origem exata da aplicação quando publicada, incluindo `https://`, domínio e porta se houver. O padrão do Compose é `http://localhost:3001`; ajuste também essa variável se alterar `APP_PORT`.

O arquivo `.env` é ignorado pelo Git. Não use as credenciais reais em código, commits ou exemplos.

```bash
npm ci
npm run db:generate
docker compose up -d db
npm run db:migrate
npm run db:seed
```

O seed é idempotente e não cria usuários ou senhas padrão. Importa uma entrada por posição do CSV, inclusive o número de item 22 repetido e a linha sem sigla. Mantém os arquivos de `docs/dados/` intactos. As ocorrências ficam em [docs/relatorio-importacao.md](docs/relatorio-importacao.md).

Crie o primeiro administrador com as variáveis `ADMIN_NOME`, `ADMIN_EMAIL` e `ADMIN_SENHA`. Para não incluir a senha no histórico do terminal, use uma entrada oculta:

```bash
read -r -p 'Nome do administrador: ' ADMIN_NOME
read -r -p 'E-mail institucional: ' ADMIN_EMAIL
read -r -s -p 'Senha inicial (mínimo de 12 caracteres): ' ADMIN_SENHA
printf '\n'
export ADMIN_NOME ADMIN_EMAIL ADMIN_SENHA
npm run admin:criar
unset ADMIN_NOME ADMIN_EMAIL ADMIN_SENHA
```

O primeiro login exige trocar a senha. O administrador pode cadastrar outros administradores e usuários vinculados a um único órgão e redefinir senhas pela interface.

```bash
npm run dev
```

A interface de desenvolvimento atende em `http://localhost:5173`; o Vite encaminha `/api` para a API na porta 3001. Não é necessário configurar CORS nem armazenar tokens no navegador. A sessão fica em cookie HttpOnly e o token CSRF fica em memória.

## Executar toda a aplicação com Docker

Com o `.env` configurado:

```bash
docker compose up -d --build
docker compose exec app npm run db:seed
```

A aplicação aplica as migrações ao iniciar e serve API e frontend no mesmo endereço, `http://localhost:3001`. O seed e a criação do administrador são operações explícitas. Para criar o administrador em um contêiner, use as variáveis temporárias mostradas acima e passe seus nomes ao Compose, sem colocar a senha no comando:

```bash
docker compose exec -e ADMIN_NOME -e ADMIN_EMAIL -e ADMIN_SENHA app npm run admin:criar
```

O PostgreSQL persiste no volume `pg_dados`. `docker compose down` interrompe os serviços e preserva esse volume. A aplicação e o banco publicam portas apenas no loopback do host por padrão. Para disponibilização institucional, use um proxy reverso HTTPS, `SECURE_COOKIES=true` e `APP_ORIGIN` igual à origem HTTPS pública; reinicie a aplicação após alterar a configuração.

Em um ambiente de nuvem com proxy TLS, monte o certificado público fornecido pela plataforma durante o build, sem desabilitar a validação TLS:

```bash
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t pca-acailandia:local .
docker compose up -d --no-build
```

O certificado é montado temporariamente pelo BuildKit e não é copiado para a imagem. Preserve as configurações de proxy e autenticação do Docker fornecidas pelo ambiente.

## Validação

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` executa o Vitest com PostgreSQL 16 real e isolado em um contêiner descartável. Requer Docker disponível e remove o contêiner ao terminar. Alternativamente, configure `TEST_DATABASE_URL` para um banco destinado exclusivamente a testes; nunca use o banco de produção. As verificações cobrem o isolamento entre órgãos, permissões, autenticação, CSRF, auditoria e o seed idempotente com as contagens exigidas pela fase 1.

O endpoint `GET /api/saude` verifica a disponibilidade do banco para o healthcheck. A autenticação usa bcrypt, sessão de oito horas e bloqueio de quinze minutos após cinco tentativas incorretas. Mutações autenticadas exigem `X-CSRF-Token`, retornado pelo login e por `/api/auth/me`.

## Backup e restauração

Crie um backup em formato custom do PostgreSQL, fora do repositório:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /CAMINHO/SEGURO/pca.dump
```

O arquivo contém dados pessoais e deve ficar em armazenamento com acesso controlado. Para restaurar um backup, pare a aplicação e confira o banco de destino: o comando abaixo substitui seus objetos pelos do backup.

```bash
docker compose stop app
docker compose exec -T db sh -c 'pg_restore --exit-on-error --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < /CAMINHO/SEGURO/pca.dump
docker compose up -d app
```

Teste a restauração em um banco separado antes de depender do backup.

## Organização

- `apps/api`: Express, Prisma, autenticação, cadastros e importação.
- `apps/web`: React 18, Vite, React Router, TanStack Query e Tailwind CSS.
- `packages/shared`: tipos, enums e validações Zod compartilhados; a unificação será implementada na fase 3.
- `apps/api/prisma`: schema e migrações versionadas.
- `apps/api/tests`: testes de integração com banco real.
- [docs/decisoes.md](docs/decisoes.md) e [docs/duvidas.md](docs/duvidas.md): decisões e interpretações conservadoras da fase.

# AGENTS.md — Sistema PCA Açailândia

## Fonte da verdade
- A especificação completa está em `docs/PDR pca.md`. Leia o documento inteiro antes de qualquer tarefa.
- Os dados iniciais estão em `docs/dados/`. Não altere esses CSVs.

## Regras
- Implemente somente o que o PDR pede para a fase indicada na tarefa. Ideias extras vão para `docs/backlog.md`.
- Stack fixa (PDR §12). Não adicione dependências fora dela, exceto bibliotecas pequenas e indispensáveis; justifique cada uma em `docs/decisoes.md`.
- Interface, mensagens, commits e documentação em pt-BR. Nomes de entidades de domínio em português (Exercicio, Orgao, Selecao, PlanoVersao...).
- Toda permissão é verificada no backend.
- A função de unificação (PDR §7) fica em `packages/shared`, é pura e tem testes para cada regra.
- Nunca grave credenciais no repositório. Use `.env.example`.
- Datas no fuso America/Sao_Paulo.

## Comandos (mantenha esta seção atualizada)
- Instalar com lockfile: `npm ci`
- Configurar: copiar `.env.example` para `.env` e preencher as variáveis locais, sem versionar credenciais.
- Gerar cliente Prisma: `npm run db:generate`
- Subir banco: `docker compose up -d db`
- Migrar e popular: `npm run db:migrate && npm run db:seed`
- Criar primeiro administrador: definir `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` e executar `npm run admin:criar` (ver README).
- Testes com PostgreSQL isolado: `npm test` (requer Docker ou `TEST_DATABASE_URL` dedicado).
- Lint e tipos: `npm run lint && npm run typecheck`
- Desenvolvimento: `npm run dev`
- Build: `npm run build`
- Aplicação completa em contêiner: `docker compose up -d --build`
- Produção após build: `npm start`

## Antes de concluir qualquer tarefa
1. `npm run lint`, `npm run typecheck` e `npm test` passam sem erro.
2. `docs/decisoes.md` registra as decisões técnicas da tarefa.
3. Ambiguidades ficam em `docs/duvidas.md`, com a opção adotada (sempre a mais conservadora compatível com o PDR).
4. O resumo final lista o que foi feito, os critérios de aceite atendidos e o que ficou pendente.

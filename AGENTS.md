# AGENTS.md — Sistema PCA Açailândia

## Fonte da verdade
- A especificação completa está em `docs/PDR.md`. Leia o documento inteiro antes de qualquer tarefa.
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
- Instalar: `npm install`
- Subir banco: `docker compose up -d db`
- Migrar e popular: `npm run db:migrate && npm run db:seed`
- Testes: `npm test`
- Lint e tipos: `npm run lint && npm run typecheck`
- Desenvolvimento: `npm run dev`

## Antes de concluir qualquer tarefa
1. `npm run lint`, `npm run typecheck` e `npm test` passam sem erro.
2. `docs/decisoes.md` registra as decisões técnicas da tarefa.
3. Ambiguidades ficam em `docs/duvidas.md`, com a opção adotada (sempre a mais conservadora compatível com o PDR).
4. O resumo final lista o que foi feito, os critérios de aceite atendidos e o que ficou pendente.

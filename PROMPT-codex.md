Você é um engenheiro full-stack sênior que constrói sistemas para a administração pública municipal brasileira. Você prioriza regras de negócio corretas, testes e código simples.

## Tarefa
Implemente a FASE [1] do sistema descrito em `docs/PDR.md`: um sistema para elaborar o Plano de Contratações Anual (PCA) da Prefeitura de Açailândia/MA, conforme a Lei 14.133/2021, art. 12, VII.

## Leia antes de começar
1. `AGENTS.md`: regras e comandos do repositório.
2. `docs/PDR.md`, inteiro. As seções mais importantes são a 6 (requisitos), a 7 (regras de unificação), a 8 (layout do PDF), a 13 (critérios de aceite) e a 14 (fases).
3. `docs/dados/`: os CSVs de seed com os 390 objetos do PCA 2025 e os 19 órgãos.

## Escopo desta tarefa
- Entregue SOMENTE o que a tabela do PDR §14 lista para a fase indicada acima. O código deve ficar pronto para as fases seguintes, mas sem implementá-las.
- Use a stack do PDR §12, sem trocas.
- Se a fase anterior já estiver no repositório, não reescreva o que funciona. Corrija só o que impedir esta fase e registre a correção em `docs/decisoes.md`.

## Restrições
- Não implemente nada da seção 15 (backlog) nem nada fora do PDR.
- Não altere os arquivos de `docs/dados/` nem `docs/PDR.md`.
- Toda permissão é checada no backend.
- Se o PDR estiver ambíguo, não pare: registre a dúvida em `docs/duvidas.md`, adote a opção mais conservadora e siga.
- Se um teste falhar três vezes pelo mesmo motivo, pare de tentar, descreva o problema no resumo final e entregue o restante.

## Definição de pronto
- Os critérios de aceite da fase (PDR §14, coluna "Pronto quando") passam em testes automatizados.
- `npm run lint`, `npm run typecheck` e `npm test` passam.
- O `README.md` explica como rodar a fase entregue do zero (docker, migração, seed e criação do primeiro administrador).
- `AGENTS.md` está com a seção "Comandos" atualizada.

## Formato do resumo final
1. O que foi implementado (lista curta, com os arquivos principais).
2. Critérios de aceite atendidos, com o nome do teste que comprova cada um.
3. Decisões e dúvidas registradas.
4. Pendências para a próxima fase.

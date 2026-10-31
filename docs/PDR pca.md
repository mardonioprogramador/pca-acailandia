# PDR — Sistema de Elaboração do Plano de Contratações Anual (PCA)
**Prefeitura Municipal de Açailândia/MA · Comissão Central de Licitação (CCL)**
Versão 1.0 · 30/10/2026

---

## 1. Problema e objetivo

Hoje o PCA de Açailândia é montado à mão: cada secretaria manda sua lista e a CCL junta tudo numa planilha. Os objetos comuns a várias secretarias (combustível, material de expediente, limpeza...) viram uma única linha, com as siglas de todas as interessadas na coluna "Secretarias/Órgãos". O resultado é publicado como anexo de decreto; o PCA 2025 é o Decreto Municipal nº 150/2024, com 389 itens numerados (390 linhas, porque o número 22 se repete).

O sistema deve:
1. cadastrar órgãos e seus usuários;
2. permitir que cada órgão escolha, num catálogo, os objetos de seu interesse e informe os dados de planejamento de cada um;
3. permitir que o órgão inclua manualmente um objeto que não esteja no catálogo;
4. gerar automaticamente o **plano unificado**, juntando numa linha só os órgãos que escolheram o mesmo objeto;
5. disponibilizar o plano unificado para download em **PDF**, no mesmo formato da tabela oficial;
6. ter um usuário **Administrador** com acesso a todas as funções.

## 2. Base legal e referências

- **Lei nº 14.133/2021, art. 12, VII:** o PCA é elaborado a partir dos documentos de formalização de demandas, para racionalizar as contratações, garantir o alinhamento com o planejamento estratégico e subsidiar as leis orçamentárias.
- **Lei nº 14.133/2021, art. 12, §1º:** o PCA deve ser divulgado e mantido à disposição no sítio eletrônico oficial.
- **Decreto Municipal nº 150/2024:** estabelece o PCA 2025 (modelo de layout deste sistema).
- **Decreto Municipal nº 034/2024:** citado nos considerandos do Decreto 150/2024. O sistema não implementa regras dele sem confirmação da CCL.

## 3. Escopo

**Dentro do escopo**
- Cadastro de exercícios, órgãos, usuários e catálogo de objetos.
- Seleção de objetos pelos órgãos, com os campos de planejamento, e inclusão manual de objetos.
- Envio da lista do órgão para a CCL.
- Unificação, revisão pelo administrador, versionamento e geração do PDF.
- Importação dos dados iniciais (PCA 2025) a partir dos CSVs em `docs/dados/`.

**Fora do escopo (não implementar)**
- Integração com o PNCP, valores estimados, controle de fracionamento, assinatura eletrônica, envio de e-mails, inteligência artificial, aplicativo mobile.
- Ideias novas vão para `docs/backlog.md`.

## 4. Perfis e permissões

| Ação | Administrador | Usuário de Órgão |
|---|---|---|
| Cadastrar exercícios, órgãos, usuários e catálogo | ✅ | ❌ |
| Abrir e fechar o período de preenchimento | ✅ | ❌ |
| Selecionar objetos e preencher campos | ✅ (de qualquer órgão) | ✅ (só do próprio órgão, com o período aberto) |
| Incluir objeto manual | ✅ | ✅ |
| Enviar a lista do órgão para a CCL | ✅ | ✅ |
| Reabrir a lista de um órgão já enviada | ✅ | ❌ |
| Aprovar, mesclar ou recusar objeto manual | ✅ | ❌ |
| Gerar o plano unificado, editar o rascunho e finalizar | ✅ | ❌ |
| Baixar o PDF do plano finalizado | ✅ | ✅ |
| Ver auditoria | ✅ | ❌ |

- As permissões são verificadas **no backend**. Esconder botões no frontend não é suficiente.
- Pode haver mais de um administrador.
- Um usuário de órgão pertence a exatamente um órgão.

## 5. Jornada principal

1. O **Admin** cria o exercício (ex.: 2027), define o período de preenchimento e abre o exercício.
2. O **usuário do órgão** entra no sistema e vê o catálogo. O filtro "Usados pelo meu órgão no PCA anterior" já vem marcado.
3. O usuário marca os objetos de interesse e preenche os campos de cada um (seção 6.3). Se algo não existir no catálogo, inclui manualmente.
4. O usuário confere a lista e clica em **Enviar para a CCL**. A lista fica bloqueada para edição.
5. O **Admin** acompanha quais órgãos já enviaram, revisa os objetos manuais (aprovar no catálogo, mesclar com existente ou manter como específico) e clica em **Gerar plano unificado**.
6. O sistema cria uma **versão rascunho** do plano. O Admin resolve os conflitos sinalizados, ajusta o que precisar e clica em **Finalizar versão**.
7. O sistema gera o **PDF**, que fica disponível para download pelo Admin e pelos órgãos.

## 6. Requisitos funcionais

### 6.1 Exercícios
- **RF-01** CRUD de exercício com ano, título (padrão: "Plano de Contratações Anual (PCA) {ano} – MUNICÍPIO DE AÇAILÂNDIA"), data de início e fim do preenchimento, situação e número do ato de publicação (opcional, ex.: "Decreto Municipal nº 150/2024").
- **RF-02** Situações do exercício: `RASCUNHO` → `ABERTO` → `FECHADO` → `PUBLICADO`. Os órgãos só editam com o exercício `ABERTO` e dentro do período. O Admin edita em qualquer situação, exceto `PUBLICADO`.
- **RF-03** "Copiar do exercício anterior": o Admin pode pré-carregar, para cada órgão, as seleções do exercício anterior como rascunho. O órgão revisa antes de enviar.

### 6.2 Órgãos e usuários
- **RF-04** CRUD de órgão com:
  - sigla (única);
  - nome completo;
  - tipo (`ADMINISTRACAO_DIRETA`, `AUTARQUIA`, `FUNDO`, `OUTRO`);
  - **grupo de unificação**;
  - ordem de exibição;
  - situação (ativo ou inativo).
- **RF-05** Grupo de unificação: só órgãos do mesmo grupo são juntados numa linha. Padrão: todas as secretarias ficam em "Administração Direta"; SAAE e IPSEMA ficam cada um no próprio grupo. Esse é o comportamento do PCA 2025, em que essas entidades aparecem em linhas separadas.
- **RF-06** CRUD de usuário com nome, e-mail (login), perfil e órgão. A senha inicial é definida pelo Admin, com troca obrigatória no primeiro acesso. A senha pode ser redefinida pelo Admin.

### 6.3 Catálogo e seleção de objetos
- **RF-07** CRUD do catálogo pelo Admin, com os campos:
  - código interno;
  - descrição sucinta do objeto;
  - natureza padrão;
  - modalidade sugerida padrão;
  - elemento de despesa (opcional);
  - siglas que usaram o objeto no exercício anterior;
  - ordem;
  - situação (`ATIVO`, `PENDENTE`, `INATIVO`).
- **RF-08** Tela de seleção para o órgão:
  - busca por texto, sem diferenciar acentos nem maiúsculas;
  - filtros por natureza e por "usados pelo meu órgão no exercício anterior";
  - paginação;
  - marcação por checkbox;
  - painel lateral com a lista do órgão e um contador.
- **RF-09** Campos de cada objeto selecionado (iguais às colunas do PCA oficial):

  | Campo | Tipo | Regra |
  |---|---|---|
  | Modalidade sugerida | lista | Pregão Eletrônico, Concorrência Eletrônica, Concorrência, Dispensa, Dispensa Eletrônica, Inexigibilidade, Credenciamento, Chamamento Público, Chamada Pública, Adesão a Ata, Leilão, A definir. Vem preenchido com a sugestão do catálogo. |
  | Natureza do objeto | lista | Material de Consumo, Material Permanente, Material, Serviço, Material e Serviço, Obra/Serviço de Engenharia. Vem preenchido com o valor do catálogo. |
  | Previsão de início da tramitação/envio do ETP e TR | mês/ano **ou** opção especial | Opções especiais: "No decorrer do ano", "Sob demanda", "Sem previsão". Opcional. |
  | Mês pretendido para início da prestação do serviço ou do fornecimento do bem | mês/ano **ou** opção especial | Obrigatório. Não pode ser anterior à previsão do ETP/TR quando as duas forem mês/ano. |
  | Grau de prioridade | lista | Alta, Média, Baixa. Obrigatório. |
  | Elemento de despesa | texto `0.0.00.00.00.00` | Opcional; aparece só se o exercício tiver a coluna habilitada (RF-17). |
  | Observação | texto | Opcional; não sai no PDF. |

- **RF-10** Um órgão não pode selecionar o mesmo objeto duas vezes no mesmo exercício.
- **RF-11** **Inclusão manual:** o órgão informa a descrição sucinta e os campos do RF-09. O sistema mostra objetos parecidos do catálogo (busca por similaridade de texto) e pergunta "É algum destes?" antes de salvar. Se o usuário confirmar que é novo, o objeto entra com situação `PENDENTE`, visível só para o órgão que o criou e para o Admin.
- **RF-12** O Admin trata cada objeto `PENDENTE` de uma de três formas:
  - **aprovar no catálogo:** o objeto fica `ATIVO` e passa a aparecer para todos os órgãos;
  - **mesclar com existente:** as seleções são transferidas para o objeto escolhido e o pendente é inativado;
  - **manter como específico:** o objeto continua visível só para o órgão de origem, mas entra no plano.

### 6.4 Envio
- **RF-13** "Enviar para a CCL" valida todos os campos obrigatórios, grava data e hora e bloqueia a edição da lista. O Admin pode reabrir a lista, informando o motivo, que fica na auditoria.
- **RF-14** Painel do Admin mostra, para cada órgão: situação (não iniciado, em preenchimento ou enviado), quantidade de objetos, data do envio e objetos manuais pendentes.

### 6.5 Plano unificado
- **RF-15** "Gerar plano unificado" cria uma nova **versão rascunho** com as regras da seção 7. O Admin escolhe se entram só as listas enviadas (padrão) ou também as que estão em preenchimento.
- **RF-16** No rascunho, o Admin pode:
  - editar qualquer campo de uma linha;
  - reordenar linhas;
  - remover uma linha, com justificativa;
  - ver, em cada linha, os valores informados por cada órgão.

  Linhas com conflito ficam destacadas, e uma linha editada à mão recebe um selo.
- **RF-17** Configuração do layout por exercício:
  - mostrar a coluna "Elemento de Despesas" (padrão: não);
  - mostrar a palavra "ANEXO" (padrão: sim);
  - texto do cabeçalho (padrão: "ESTADO DO MARANHÃO / PREFEITURA MUNICIPAL DE AÇAILÂNDIA / GABINETE DO PREFEITO");
  - imagem do brasão (upload PNG/JPG).
- **RF-18** "Finalizar versão" exige que todos os conflitos estejam resolvidos ou aceitos. A versão fica imutável, o PDF é gerado e guardado com hash SHA-256, e o exercício pode passar para `PUBLICADO`. Uma nova geração cria a versão seguinte; as anteriores continuam disponíveis para download.
- **RF-19** Ao gerar um novo rascunho a partir das demandas, as edições manuais da versão anterior **não** são aproveitadas. O sistema avisa isso antes de gerar.

### 6.6 Auditoria
- **RF-20** Registrar quem fez o quê e quando (antes e depois) em: seleções, envio, reabertura, objetos manuais, edições do rascunho, finalização e cadastros. Tela de consulta com filtros.

## 7. Regras de unificação (núcleo do sistema)

Implementar como **função pura**, sem acesso ao banco, coberta por testes unitários.

**Entrada:** as seleções do exercício, cada uma com o órgão, o grupo de unificação do órgão, o objeto e os campos do RF-09.

1. **Agrupamento:** a chave é `(objeto_id, grupo_de_unificacao)`. Cada grupo vira uma linha.
2. **Coluna Secretarias/Órgãos:** siglas distintas, separadas por ", ", na ordem de exibição dos órgãos.
3. **Descrição:** a do objeto no catálogo.
4. **Modalidade e natureza:** se todos os órgãos informaram o mesmo valor, usa esse valor. Se houver divergência, usa o valor mais frequente; no empate, o valor do órgão com maior prioridade informada e, persistindo o empate, o do órgão que vem primeiro na ordem de exibição. Em qualquer divergência, a linha é marcada como **conflito**.
5. **Previsão do ETP/TR:** usa a **mais cedo** entre os meses/anos informados. As opções especiais só valem se ninguém informou mês/ano; entre elas, a precedência é "No decorrer do ano" > "Sob demanda" > "Sem previsão". Campo vazio é ignorado.
6. **Mês pretendido:** mesma regra do item 5.
7. **Prioridade:** a **mais alta** informada (Alta > Média > Baixa).
8. **Elemento de despesa:** valores distintos, separados por "; ".
9. **Ordenação:** primeiro os objetos do catálogo, pela `ordem` do catálogo. Depois os objetos específicos (manuais), pela ordem do órgão e pela data de criação. Grupos de unificação diferentes do mesmo objeto ficam em linhas próprias, logo abaixo da linha do grupo "Administração Direta".
10. **Numeração:** sequencial a partir de 1, depois de ordenar.
11. **Saída por linha:** número, siglas, descrição, modalidade, natureza, previsão, mês, prioridade, elemento, lista de conflitos (campo e valores por órgão) e as seleções de origem.

**Exemplo**

| Órgão | Objeto | Modalidade | Previsão | Mês | Prioridade |
|---|---|---|---|---|---|
| SEMAD | Material de expediente | Pregão Eletrônico | Jun/2027 | Set/2027 | Média |
| SME | Material de expediente | Pregão Eletrônico | Mai/2027 | Out/2027 | Alta |
| SEMUS | Material de expediente | Dispensa | — | Sob demanda | Baixa |

Resultado: **SEMAD, SME, SEMUS** | Material de expediente | Pregão Eletrônico (**conflito**: SEMUS = Dispensa) | Maio/2027 | Setembro/2027 | Alta.

## 8. Layout do PDF (modelo: PCA 2025)

- **Página:** A4 paisagem, margens de 10 mm, fonte sans-serif (Carlito, Calibri ou Arial), corpo com 8–9 pt.
- **Cabeçalho, em todas as páginas:** brasão centralizado e o texto do cabeçalho em negrito, centralizado.
- **Primeira página:** a palavra "ANEXO" (se habilitada) e o título do exercício.
- **Tabela:**
  - colunas na ordem: **Nº do Item | Secretarias/Órgãos | Descrição sucinta do objeto | Modalidade Sugerida | Natureza do objeto | [Elemento de Despesas] | Previsão Início da Tramitação do Processo/Envio do ETP e TR | Mês pretendido para início da prestação do serviço ou do fornecimento do bem | Grau de prioridade da contratação \***;
  - cabeçalho da tabela com fundo cinza, repetido em todas as páginas;
  - linhas zebradas e bordas finas;
  - nenhuma linha partida entre páginas, quando couber;
  - meses no formato "Março/2027".
- **Final:** a "Legenda Siglas Secretarias/Órgãos", só com as siglas presentes no plano, no formato "• SIGLA - Nome completo", e a nota "\* Grau de prioridade: Alta, Média ou Baixa".
- **Rodapé, em todas as páginas:** "Página X de Y", a versão do plano e a data/hora de geração (fuso America/Sao_Paulo).
- **Arquivo:** `PCA-{ano}-v{versao}.pdf`.

## 9. Modelo de dados (referência)

`Exercicio`(id, ano único, titulo, situacao, inicio_preenchimento, fim_preenchimento, ato_publicacao, mostrar_elemento, mostrar_anexo, cabecalho, brasao_path)
`Orgao`(id, sigla única, nome, tipo, grupo_unificacao, ordem, ativo)
`Usuario`(id, nome, email único, senha_hash, perfil `ADMIN|ORGAO`, orgao_id nulo para ADMIN, ativo, troca_senha_pendente)
`ObjetoCatalogo`(id, codigo, descricao, natureza_padrao, modalidade_padrao, elemento_despesa, siglas_exercicio_anterior[], ordem, situacao, origem `SEED|ADMIN|MANUAL`, orgao_criador_id, mesclado_em_id)
`ListaOrgao`(id, exercicio_id, orgao_id, situacao `NAO_INICIADA|EM_PREENCHIMENTO|ENVIADA`, enviada_em, enviada_por) — única por (exercicio, orgao)
`Selecao`(id, lista_id, objeto_id, modalidade, natureza, previsao_tipo `MES|DECORRER|SOB_DEMANDA|SEM_PREVISAO|VAZIO`, previsao_mes, previsao_ano, mes_tipo, mes_mes, mes_ano, prioridade, elemento, observacao) — única por (lista, objeto)
`PlanoVersao`(id, exercicio_id, numero, situacao `RASCUNHO|FINAL`, gerado_em, gerado_por, finalizado_em, finalizado_por, pdf_path, pdf_sha256, incluiu_nao_enviadas)
`LinhaPlano`(id, versao_id, numero, ordem, objeto_id, siglas, descricao, modalidade, natureza, previsao_texto, mes_texto, prioridade, elemento, conflitos jsonb, origem jsonb, editada_manual, removida, motivo_remocao)
`Auditoria`(id, usuario_id, entidade, entidade_id, acao, antes jsonb, depois jsonb, criado_em)

## 10. Dados iniciais (`docs/dados/`)

- **`orgaos-acailandia.csv`** (`;`, UTF-8 com BOM): `sigla;nome`. Tem as 17 siglas da legenda oficial do PCA 2025, mais IPSEMA e SAAE. O nome completo do IPSEMA deve ser confirmado pela CCL.
- **`objetos-pca-2025-acailandia.csv`** (`;`, UTF-8 com BOM): as 390 linhas do PCA 2025, extraídas do PDF oficial. Colunas:
  - `numero_item_pca2025`;
  - `secretarias_orgaos_original`;
  - `siglas` (separadas por vírgula, sem espaço);
  - `descricao_objeto`;
  - `modalidade_original` e `modalidade` (normalizada);
  - `natureza_original` e `natureza` (normalizada);
  - `elemento_despesa`;
  - `previsao_etp_tr_original`;
  - `mes_pretendido_original` e `mes_pretendido` (`01`–`12` ou texto especial);
  - `prioridade_original` e `prioridade` (normalizada);
  - `pagina_pdf`;
  - `observacao`.
- O seed cria um `ObjetoCatalogo` por linha, com `ordem` = posição no CSV, `siglas_exercicio_anterior` = `siglas`, e modalidade e natureza padrão = colunas normalizadas (vazio vira "A definir"/nulo).
- **Seed opcional "exercício 2025 de demonstração"** (comando separado): cria uma `Selecao` para cada sigla de cada linha, com os valores originais, e marca todas as listas como enviadas. Serve para o teste de aceite 13.4.
- Linhas sem sigla ou com observação no CSV são importadas e registradas num relatório de importação (`docs/dados/relatorio-importacao.md`).

## 11. Requisitos não funcionais

- **Idioma e formatos:** interface em pt-BR; datas no formato dd/mm/aaaa; fuso America/Sao_Paulo.
- **Segurança:**
  - senhas com hash (Argon2 ou bcrypt);
  - sessão com expiração de 8 horas;
  - bloqueio de 15 minutos após 5 tentativas de login erradas;
  - proteção CSRF, se usar cookies;
  - validação de toda entrada no backend.
- **LGPD:** dados pessoais limitados a nome, e-mail institucional e órgão.
- **Desempenho:** tela de seleção responde em menos de 1 s com 2.000 objetos; PDF de 400 linhas gerado em menos de 20 s.
- **Usabilidade e acessibilidade:** funciona em notebook comum (1366×768); campos com label; navegável por teclado.
- **Erros:** mensagens claras, sem stack trace para o usuário.
- **Documentação e configuração:** `README.md` com instalação, seed, criação do primeiro administrador e backup do banco; credenciais só em variáveis de ambiente, com `.env.example` sem valores reais.

## 12. Stack

- **Backend:** Node.js 20+, TypeScript, Express, Prisma, PostgreSQL 16, Zod para validação.
- **Frontend:** React 18, Vite, TypeScript, React Router, TanStack Query, Tailwind CSS.
- **PDF:** HTML renderizado no servidor e convertido com Playwright (Chromium), usando `@media print` e `thead` repetido.
- **Testes:** Vitest (unitários e integração da API) e Playwright (E2E).
- **Infra:** `docker-compose.yml` com PostgreSQL e a aplicação.
- **Estrutura:** monorepo `apps/api`, `apps/web` e `packages/shared` (tipos, enums, schemas Zod e a função de unificação).

## 13. Critérios de aceite

1. Um usuário de órgão não consegue ver nem alterar a lista de outro órgão. Existe um teste de API para isso.
2. Com o exercício fechado ou fora do período, o órgão não consegue editar (API retorna 403 e a interface mostra aviso). O Admin consegue.
3. A função de unificação passa nos testes de todas as regras da seção 7, incluindo:
   - empate na modalidade;
   - opções especiais de mês;
   - grupos de unificação distintos;
   - objeto manual específico;
   - seleção de lista não enviada excluída por padrão.
4. **Ida e volta com o PCA 2025:** depois do seed de demonstração, gerar o plano de 2025 resulta em 390 linhas, e o conjunto de siglas de cada linha é igual ao da coluna `siglas` do CSV.
5. O PDF gerado no item 4:
   - abre sem erro;
   - repete o cabeçalho da tabela em todas as páginas;
   - não corta texto;
   - tem a legenda de siglas no final;
   - tem "Página X de Y" no rodapé.
6. Uma versão finalizada é imutável. Tentativas de edição pela API retornam 409.
7. Um objeto manual mesclado transfere as seleções, e o plano gerado em seguida não tem linha duplicada.
8. Toda ação listada no RF-20 aparece na auditoria.

## 14. Fases de entrega

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1 | Monorepo, docker-compose, Prisma, autenticação, perfis, auditoria, CRUD de exercício, órgão e usuário, importação dos CSVs | Critério 1 passa; o seed importa 390 objetos e 19 órgãos |
| 2 | Catálogo, tela de seleção, inclusão manual com sugestão de similares, envio, painel do Admin, tratamento de pendentes | Critérios 2 e 7 passam |
| 3 | Função de unificação, geração do rascunho, edição e resolução de conflitos, finalização e versionamento | Critérios 3, 4 e 6 passam |
| 4 | PDF, configuração de layout, download, tela de auditoria, testes E2E | Critérios 5 e 8 passam |

## 15. Backlog (não implementar agora)

- Valor estimado por objeto e alerta de fracionamento (art. 75, §1º).
- Envio do PCA ao PNCP pela API de integração.
- Exportação em XLSX ou CSV.
- Notificação por e-mail de abertura e fechamento de prazo.
- Página pública do PCA (art. 12, §1º).

## 16. Glossário de siglas (legenda do PCA 2025)

SINURB – Infraestrutura e Urbanismo · SEMUS – Saúde · SEAGRI – Agricultura e Pesca · SEMAS – Assistência Social · SEMAD – Administração · SME – Educação · SEMES – Esporte · SMM – Mulher · SEMEF – Economia e Finanças · CGM – Controladoria Geral do Município · PGM – Procuradoria Geral do Município · GAB – Gabinete do Prefeito · SEGOV – Governo · SINCTUR – Desenvolvimento Econômico, Agronegócio, Indústria, Comércio e Trabalho · SEMMA – Meio Ambiente · SEPLAN – Planejamento · SECULT – Cultura e Turismo · IPSEMA · SAAE – Serviço Autônomo de Água e Esgoto.

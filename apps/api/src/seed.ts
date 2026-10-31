import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'csv-parse/sync';
import {PrismaClient} from '@prisma/client';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
type Linha = Record<string, string>;
type Ocorrencia = {ordem: number; numero: string; semSigla: boolean; observacao: string};

async function lerCsv(nome: string): Promise<Linha[]> {
  return parse(await readFile(resolve(raiz, 'docs/dados', nome), 'utf8'), {
    bom: true, delimiter: ';', columns: true, skip_empty_lines: true,
  }) as Linha[];
}

export async function importarDados(cliente: PrismaClient) {
  const orgaos = await lerCsv('orgaos-acailandia.csv');
  const objetos = await lerCsv('objetos-pca-2025-acailandia.csv');
  if (orgaos.length !== 19 || objetos.length !== 390) throw new Error('Os CSVs devem conter 19 órgãos e 390 objetos.');
  const siglasConhecidas = new Set(orgaos.map(o => o.sigla));
  if (siglasConhecidas.size !== 19 || orgaos.some(o => !o.sigla || !o.nome)) throw new Error('CSV de órgãos inválido.');
  const ocorrencias: Ocorrencia[] = [];
  const dadosObjetos = objetos.map((linha, indice) => {
    const siglas = linha.siglas.split(',').map(v => v.trim()).filter(Boolean);
    if (!linha.descricao_objeto || siglas.some(sigla => !siglasConhecidas.has(sigla))) throw new Error(`Objeto inválido na posição ${indice + 1}.`);
    if (!siglas.length || linha.observacao) ocorrencias.push({ordem: indice + 1, numero: linha.numero_item_pca2025, semSigla: !siglas.length, observacao: linha.observacao});
    return {
      codigo: `PCA2025-${String(indice + 1).padStart(3, '0')}`,
      descricao: linha.descricao_objeto,
      naturezaPadrao: linha.natureza || null,
      modalidadePadrao: linha.modalidade || 'A definir',
      elementoDespesa: linha.elemento_despesa || null,
      siglasExercicioAnterior: siglas,
      ordem: indice + 1,
    };
  });
  await cliente.$transaction(async tx => {
    // Trava transacional evita duplicação de auditoria em seeds concorrentes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20250001)`;
    let criados = 0;
    for (const [indice, orgao] of orgaos.entries()) {
      const existente = await tx.orgao.findUnique({where: {sigla: orgao.sigla}});
      if (!existente) {
        await tx.orgao.create({data: {
          sigla: orgao.sigla, nome: orgao.nome,
          tipo: ['IPSEMA', 'SAAE'].includes(orgao.sigla) ? 'AUTARQUIA' : 'ADMINISTRACAO_DIRETA',
          grupoUnificacao: ['IPSEMA', 'SAAE'].includes(orgao.sigla) ? orgao.sigla : 'Administração Direta',
          ordem: indice + 1, ativo: true,
        }});
        criados++;
      }
    }
    for (const objeto of dadosObjetos) {
      const existente = await tx.objetoCatalogo.findUnique({where: {codigo: objeto.codigo}});
      if (!existente) {
        await tx.objetoCatalogo.create({data: {...objeto, origem: 'SEED', situacao: 'ATIVO'}});
        criados++;
      }
    }
    // Órgãos importados depois de exercícios também recebem a lista estrutural.
    const exercicios = await tx.exercicio.findMany({select: {id: true}});
    const todosOrgaos = await tx.orgao.findMany({select: {id: true}});
    for (const exercicio of exercicios) {
      await tx.listaOrgao.createMany({data: todosOrgaos.map(orgao => ({exercicioId: exercicio.id, orgaoId: orgao.id})), skipDuplicates: true});
    }
    if (criados) await tx.auditoria.create({data: {entidade: 'Importacao', entidadeId: 'PCA-2025', acao: 'IMPORTAR', depois: {origem: 'CSVs oficiais PCA 2025', orgaos: orgaos.length, objetos: objetos.length, registrosCriados: criados}}});
  }, {timeout: 60000});
  return {orgaos: orgaos.length, objetos: objetos.length, ocorrencias};
}

function relatorio(ocorrencias: Ocorrencia[]) {
  const escapar = (s: string) => s.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  return `# Relatório de importação do PCA 2025\n\nImportação: 19 órgãos e 390 objetos. Identificadores de objetos usam a posição no CSV, preservando os dois itens numerados 22. Reexecuções preservam os cadastros existentes. Nenhum CSV foi alterado.\n\nO relatório fica em docs/ por determinação de preservação integral de docs/dados/. O nome completo do IPSEMA permanece a confirmar pela CCL.\n\n## Linhas sem sigla ou com observação\n\n| Posição | Número original | Sem sigla | Observação do CSV |\n| --- | --- | --- | --- |\n${ocorrencias.map(o => `| ${o.ordem} | ${escapar(o.numero)} | ${o.semSigla ? 'Sim' : 'Não'} | ${escapar(o.observacao)} |`).join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cliente = new PrismaClient();
  try {
    const resultado = await importarDados(cliente);
    await writeFile(resolve(raiz, 'docs/relatorio-importacao.md'), relatorio(resultado.ocorrencias), 'utf8');
    console.log(`Importação concluída: ${resultado.orgaos} órgãos e ${resultado.objetos} objetos. Relatório: docs/relatorio-importacao.md.`);
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : 'Falha na importação.');
    process.exitCode = 1;
  } finally { await cliente.$disconnect(); }
}

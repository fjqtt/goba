import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  gtpToPoint,
  pointToGtp,
  policyRank,
  type CrosscheckMetadata,
  type KataGoResult,
} from '../solver/katago-crosscheck';

const [metadataFile, resultFile, outputDirectoryArg, markdownFileArg] = process.argv.slice(2);
if (!metadataFile || !resultFile || !outputDirectoryArg || !markdownFileArg) {
  process.stderr.write(
    'Usage: npm run analyze:katago-crosscheck --workspace @goba/generator -- '
      + '<metadata.json> <results.jsonl> <output-directory> <summary.md>\n',
  );
  process.exitCode = 2;
} else {
  await main(metadataFile, resultFile, outputDirectoryArg, markdownFileArg);
}

type MetadataFile = { schemaVersion: 1; maxVisits: number; queryCount: number; queries: CrosscheckMetadata[] };

type QueryAssessment = {
  id: string;
  corpus: CrosscheckMetadata['corpus'];
  problemNumber: number;
  auditStatus: string;
  ply: number;
  player: string;
  expectedMoves: string[];
  generatorMoves: string[];
  expectedMoveLegality: string;
  topMove?: string;
  expectedSearchRank?: number;
  expectedPolicyRank?: number;
  expectedPolicy?: number;
  generatorSearchRank?: number;
  generatorPolicyRank?: number;
  generatorPolicy?: number;
  generatorContainsExpected: boolean;
  error?: string;
};

async function main(
  metadataName: string,
  resultName: string,
  outputDirectoryName: string,
  markdownName: string,
): Promise<void> {
  const metadata = JSON.parse(await readFile(resolve(metadataName), 'utf8')) as MetadataFile;
  const results = new Map(
    (await readFile(resolve(resultName), 'utf8')).split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as KataGoResult)
      .map(result => [result.id, result]),
  );
  const assessments = metadata.queries.map(query => assess(query, results.get(query.id)));
  const missing = assessments.filter(item => item.error === 'missing-result').length;
  if (missing > 0) throw new Error(`KataGo result is missing for ${missing} queries`);

  const summary = {
    queryCount: assessments.length,
    maxVisits: metadata.maxVisits,
    errors: assessments.filter(item => item.error).length,
    byCorpus: Object.fromEntries(
      ['exact', 'reconciled', 'genuine-key', 'genuine-sgf'].map(corpus => [
        corpus,
        summarize(assessments.filter(item => item.corpus === corpus)),
      ]),
    ),
    exactByAuditStatus: Object.fromEntries(
      [...new Set(assessments.filter(item => item.corpus === 'exact').map(item => item.auditStatus))]
        .sort()
        .map(status => [status, summarize(assessments.filter(item => (
          item.corpus === 'exact' && item.auditStatus === status
        )))]),
    ),
  };
  const genuineComparison = compareGenuineDifferences(assessments);
  const outputDirectory = resolve(outputDirectoryName);
  const reportPath = resolve(outputDirectory, 'crosscheck-report.json');
  const csvPath = resolve(outputDirectory, 'crosscheck-summary.csv');
  const reviewQueuePath = resolve(outputDirectory, 'crosscheck-review-queue.csv');
  const markdownPath = resolve(markdownName);
  await Promise.all([mkdir(outputDirectory, { recursive: true }), mkdir(dirname(markdownPath), { recursive: true })]);
  await Promise.all([
    writeFile(reportPath, `${JSON.stringify({
      schemaVersion: 1,
      verification: 'katago-ranking-signal-not-tsumego-proof',
      model: 'g170e-b20c256x2-s5303129600-d1228401921',
      summary,
      genuineSetupDifferences: genuineComparison,
      assessments,
    }, null, 2)}\n`, 'utf8'),
    writeFile(csvPath, toCsv(assessments), 'utf8'),
    writeFile(reviewQueuePath, toReviewQueueCsv(assessments), 'utf8'),
    writeFile(markdownPath, toMarkdown(summary, genuineComparison, assessments), 'utf8'),
  ]);
  process.stdout.write(`${JSON.stringify({ reportPath, csvPath, reviewQueuePath, markdownPath, summary })}\n`);
}

function assess(query: CrosscheckMetadata, result: KataGoResult | undefined): QueryAssessment {
  const size = query.position.boardSize;
  const searchRanks = new Map((result?.moveInfos ?? []).map(info => {
    const point = gtpToPoint(info.move, size);
    return point === undefined ? [-1, info.order + 1] : [point, info.order + 1];
  }));
  const rankSet = (points: number[]): { searchRank?: number; policyRank?: number; policy?: number } => {
    const search = points.map(point => searchRanks.get(point)).filter(isNumber);
    const policies = points.map(point => policyRank(result?.policy, point, query.allowedMoves));
    const rankedPolicies = policies.filter(item => item.rank !== undefined);
    const bestPolicy = [...rankedPolicies].sort((left, right) => left.rank! - right.rank!)[0];
    return {
      ...(search.length ? { searchRank: Math.min(...search) } : {}),
      ...(bestPolicy?.rank !== undefined ? { policyRank: bestPolicy.rank } : {}),
      ...(bestPolicy?.value !== undefined ? { policy: bestPolicy.value } : {}),
    };
  };
  const expected = rankSet(query.expectedMoves);
  const generated = rankSet(query.generatorMoves);
  const topMove = result?.moveInfos?.[0]?.move;
  return {
    id: query.id,
    corpus: query.corpus,
    problemNumber: query.problemNumber,
    auditStatus: query.auditStatus,
    ply: query.ply,
    player: query.player,
    expectedMoves: query.expectedMoves.map(point => pointToGtp(point, size)),
    generatorMoves: query.generatorMoves.map(point => pointToGtp(point, size)),
    expectedMoveLegality: query.expectedMoveLegality,
    ...(topMove ? { topMove } : {}),
    ...(expected.searchRank !== undefined ? { expectedSearchRank: expected.searchRank } : {}),
    ...(expected.policyRank !== undefined ? { expectedPolicyRank: expected.policyRank } : {}),
    ...(expected.policy !== undefined ? { expectedPolicy: expected.policy } : {}),
    ...(generated.searchRank !== undefined ? { generatorSearchRank: generated.searchRank } : {}),
    ...(generated.policyRank !== undefined ? { generatorPolicyRank: generated.policyRank } : {}),
    ...(generated.policy !== undefined ? { generatorPolicy: generated.policy } : {}),
    generatorContainsExpected: query.expectedMoves.some(point => query.generatorMoves.includes(point)),
    ...(!result ? { error: 'missing-result' } : result.error ? { error: result.error } : {}),
  };
}

function summarize(items: QueryAssessment[]) {
  const comparable = items.filter(item => item.expectedMoves.length > 0 && !item.error);
  const generated = comparable.filter(item => item.generatorMoves.length > 0);
  const divergent = generated.filter(item => !item.generatorContainsExpected);
  const comparePolicy = (item: QueryAssessment): number => {
    const expected = item.expectedPolicyRank ?? Number.POSITIVE_INFINITY;
    const generator = item.generatorPolicyRank ?? Number.POSITIVE_INFINITY;
    return expected - generator;
  };
  return {
    queries: items.length,
    problems: new Set(items.map(item => item.problemNumber)).size,
    errors: items.filter(item => item.error).length,
    illegalExpectedMoves: comparable.filter(item => (
      item.expectedMoveLegality !== 'legal' && item.expectedMoveLegality !== 'unknown'
    )).length,
    expectedTop1Search: countAtMost(comparable, 'expectedSearchRank', 1),
    expectedTop3Search: countAtMost(comparable, 'expectedSearchRank', 3),
    expectedTop5Search: countAtMost(comparable, 'expectedSearchRank', 5),
    expectedTop3Policy: countAtMost(comparable, 'expectedPolicyRank', 3),
    expectedTop5Policy: countAtMost(comparable, 'expectedPolicyRank', 5),
    statesWithGeneratorContinuation: generated.length,
    generatorContainsExpected: generated.filter(item => item.generatorContainsExpected).length,
    generatorTop3Search: countAtMost(generated, 'generatorSearchRank', 3),
    generatorTop5Search: countAtMost(generated, 'generatorSearchRank', 5),
    generatorTop3Policy: countAtMost(generated, 'generatorPolicyRank', 3),
    generatorTop5Policy: countAtMost(generated, 'generatorPolicyRank', 5),
    generatorDisagreements: divergent.length,
    keyPolicyBetterOnDisagreement: divergent.filter(item => comparePolicy(item) < 0).length,
    generatorPolicyBetterOnDisagreement: divergent.filter(item => comparePolicy(item) > 0).length,
    equalPolicyRankOnDisagreement: divergent.filter(item => comparePolicy(item) === 0).length,
  };
}

function compareGenuineDifferences(items: QueryAssessment[]) {
  const problems = [...new Set(items
    .filter(item => item.corpus === 'genuine-key' || item.corpus === 'genuine-sgf')
    .map(item => item.problemNumber))].sort(numeric);
  return problems.map(problemNumber => {
    const key = items.filter(item => item.corpus === 'genuine-key' && item.problemNumber === problemNumber);
    const sgf = items.filter(item => item.corpus === 'genuine-sgf' && item.problemNumber === problemNumber);
    const keyScore = reciprocalRankScore(key);
    const sgfScore = reciprocalRankScore(sgf);
    const difference = keyScore - sgfScore;
    const keyIllegalMoves = illegalMoveCount(key);
    const sgfIllegalMoves = illegalMoveCount(sgf);
    const legalitySignal = keyIllegalMoves > 0 && sgfIllegalMoves > 0
      ? 'both-lines-invalid'
      : keyIllegalMoves === sgfIllegalMoves ? undefined
      : keyIllegalMoves < sgfIllegalMoves ? 'key-position-stronger' : 'sgf-position-stronger';
    return {
      problemNumber,
      pliesCompared: Math.min(key.length, sgf.length),
      keyRootPolicyRank: key.find(item => item.ply === 0)?.expectedPolicyRank,
      sgfRootPolicyRank: sgf.find(item => item.ply === 0)?.expectedPolicyRank,
      keyTop3Policy: countAtMost(key, 'expectedPolicyRank', 3),
      sgfTop3Policy: countAtMost(sgf, 'expectedPolicyRank', 3),
      keyIllegalMoves,
      sgfIllegalMoves,
      keyReciprocalPolicyRank: keyScore,
      sgfReciprocalPolicyRank: sgfScore,
      signal: legalitySignal ?? (Math.abs(difference) < 0.05
        ? 'inconclusive'
        : difference > 0 ? 'key-position-stronger' : 'sgf-position-stronger'),
    };
  });
}

function reciprocalRankScore(items: QueryAssessment[]): number {
  const ranks = items.map(item => item.expectedPolicyRank).filter(isNumber);
  if (ranks.length === 0) return 0;
  return ranks.reduce((sum, rank) => sum + 1 / rank, 0) / ranks.length;
}

function illegalMoveCount(items: QueryAssessment[]): number {
  return items.filter(item => (
    item.expectedMoveLegality !== 'legal' && item.expectedMoveLegality !== 'unknown'
  )).length;
}

function countAtMost(
  items: QueryAssessment[],
  key: 'expectedSearchRank' | 'expectedPolicyRank' | 'generatorSearchRank' | 'generatorPolicyRank',
  maximum: number,
): number {
  return items.filter(item => item[key] !== undefined && item[key]! <= maximum).length;
}

function toCsv(items: QueryAssessment[]): string {
  const header = [
    'id', 'corpus', 'problemNumber', 'auditStatus', 'ply', 'player', 'expectedMoves', 'generatorMoves',
    'expectedMoveLegality', 'topMove', 'expectedSearchRank', 'expectedPolicyRank',
    'generatorSearchRank', 'generatorPolicyRank', 'generatorContainsExpected', 'error',
  ];
  const rows = items.map(item => [
    item.id, item.corpus, item.problemNumber, item.auditStatus, item.ply, item.player,
    item.expectedMoves.join('|'), item.generatorMoves.join('|'), item.expectedMoveLegality, item.topMove ?? '',
    item.expectedSearchRank ?? '', item.expectedPolicyRank ?? '', item.generatorSearchRank ?? '',
    item.generatorPolicyRank ?? '', item.generatorContainsExpected, item.error ?? '',
  ].map(csvCell).join(','));
  return `${[header.join(','), ...rows].join('\n')}\n`;
}

function toReviewQueueCsv(items: QueryAssessment[]): string {
  const rows = items.flatMap(item => {
    const reason = reviewReason(item);
    if (!reason) return [];
    return [[
      reason, item.corpus, item.problemNumber, item.ply + 1, item.auditStatus,
      item.expectedMoves.join('|'), item.generatorMoves.join('|'), item.expectedMoveLegality,
      item.expectedPolicyRank ?? '', item.generatorPolicyRank ?? '', item.topMove ?? '',
    ].map(csvCell).join(',')];
  });
  const header = [
    'reason', 'corpus', 'problemNumber', 'lineMove', 'auditStatus', 'expectedMoves',
    'generatorMoves', 'expectedMoveLegality', 'expectedPolicyRank', 'generatorPolicyRank', 'katagoTopMove',
  ];
  return `${[header.join(','), ...rows].join('\n')}\n`;
}

function reviewReason(item: QueryAssessment): string | undefined {
  if (item.expectedMoveLegality !== 'legal' && item.expectedMoveLegality !== 'unknown') {
    return 'source-line-illegal';
  }
  if (item.generatorMoves.length > 0 && !item.generatorContainsExpected) {
    const expectedRank = item.expectedPolicyRank ?? Number.POSITIVE_INFINITY;
    const generatorRank = item.generatorPolicyRank ?? Number.POSITIVE_INFINITY;
    return expectedRank < generatorRank
      ? 'generator-diverges-key-ranked-higher'
      : 'generator-diverges-generator-ranked-higher';
  }
  if ((item.expectedPolicyRank ?? Number.POSITIVE_INFINITY) > 5) return 'key-outside-local-policy-top5';
  return undefined;
}

function toMarkdown(
  summary: {
    queryCount: number;
    maxVisits: number;
    errors: number;
    byCorpus: Record<string, ReturnType<typeof summarize>>;
    exactByAuditStatus: Record<string, ReturnType<typeof summarize>>;
  },
  genuine: ReturnType<typeof compareGenuineDifferences>,
  items: QueryAssessment[],
): string {
  const exact = summary.byCorpus.exact!;
  const reconciled = summary.byCorpus.reconciled!;
  const disagreementRows = items
    .filter(item => item.corpus === 'exact' && item.generatorMoves.length > 0 && !item.generatorContainsExpected)
    .slice(0, 100)
    .map(item => `| ${item.problemNumber} | ${item.ply + 1} | ${item.expectedMoves.join('/')} | ${item.generatorMoves.join('/')} | ${item.expectedPolicyRank ?? '—'} | ${item.generatorPolicyRank ?? '—'} |`)
    .join('\n');
  return `# KataGo cross-check Cho elementary\n\n`
    + `Дата: 2026-09-16. Модель: \`g170e-b20c256x2-s5303129600-d1228401921\`, Metal, ${summary.maxVisits} visits на состояние.\n\n`
    + `KataGo здесь используется как независимый ranking signal на локально ограниченном наборе ходов. Это не proof жизни/смерти и не основание автоматически публиковать задачу.\n\n`
    + `## Покрытие\n\n`
    + `- Проверено состояний: **${summary.queryCount}**, ошибок Analysis API: **${summary.errors}**.\n`
    + `- Exact-linked: **${exact.queries}** состояний / **${exact.problems}** задач.\n`
    + `- Восстановленные setup-кандидаты: **${reconciled.queries}** состояний / **${reconciled.problems}** задач.\n`
    + `- Восемь настоящих setup-различий проверены в обеих версиях позиции.\n\n`
    + `## Exact-linked: все ходы printable line\n\n`
    + `| Метрика | Значение |\n|---|---:|\n`
    + `| Ход ключа top-1 KataGo search | ${exact.expectedTop1Search}/${exact.queries} |\n`
    + `| Ход ключа top-3 KataGo search | ${exact.expectedTop3Search}/${exact.queries} |\n`
    + `| Ход ключа top-5 policy | ${exact.expectedTop5Policy}/${exact.queries} |\n`
    + `| Есть продолжение GNU Go на этом префиксе | ${exact.statesWithGeneratorContinuation} |\n`
    + `| GNU Go содержит следующий ход ключа | ${exact.generatorContainsExpected}/${exact.statesWithGeneratorContinuation} |\n`
    + `| Продолжение GNU Go top-5 KataGo policy | ${exact.generatorTop5Policy}/${exact.statesWithGeneratorContinuation} |\n\n`
    + `На **${exact.generatorDisagreements}** префиксах GNU Go предлагает продолжение, но не следующий ход ключа. `
    + `KataGo policy ставит ход ключа выше в **${exact.keyPolicyBetterOnDisagreement}**, GNU Go-вариант выше в **${exact.generatorPolicyBetterOnDisagreement}**, одинаковый ранг — в **${exact.equalPolicyRankOnDisagreement}**.\n\n`
    + `### По статусу GNU Go audit\n\n`
    + `| Статус | Состояний | key top-3 policy | GNU содержит key | GNU top-3 policy |\n|---|---:|---:|---:|---:|\n`
    + Object.entries(summary.exactByAuditStatus).map(([status, value]) => (
      `| ${status} | ${value.queries} | ${value.expectedTop3Policy}/${value.queries} | `
        + `${value.generatorContainsExpected}/${value.statesWithGeneratorContinuation} | `
        + `${value.generatorTop3Policy}/${value.statesWithGeneratorContinuation} |`
    )).join('\n')
    + `\n\n`
    + `## Восстановленные 47 позиций\n\n`
    + `| Метрика | Значение |\n|---|---:|\n`
    + `| Состояний | ${reconciled.queries} |\n`
    + `| Незаконных ходов ключа по ld-v1 | ${reconciled.illegalExpectedMoves} |\n`
    + `| Ход ключа top-5 policy | ${reconciled.expectedTop5Policy}/${reconciled.queries} |\n`
    + `| GNU Go содержит следующий ход ключа | ${reconciled.generatorContainsExpected}/${reconciled.statesWithGeneratorContinuation} |\n\n`
    + `## Восемь настоящих setup-различий\n\n`
    + `| № | Ходов | root rank key/SGF | top-3 key/SGF | illegal key/SGF | MRR key/SGF | Сигнал |\n|---:|---:|---:|---:|---:|---:|---|\n`
    + genuine.map(item => `| ${item.problemNumber} | ${item.pliesCompared} | ${item.keyRootPolicyRank ?? '—'}/${item.sgfRootPolicyRank ?? '—'} | ${item.keyTop3Policy}/${item.sgfTop3Policy} | ${item.keyIllegalMoves}/${item.sgfIllegalMoves} | ${item.keyReciprocalPolicyRank.toFixed(3)}/${item.sgfReciprocalPolicyRank.toFixed(3)} | ${item.signal} |`).join('\n')
    + `\n\n## Прямые расхождения GNU Go с ключом\n\n`
    + `Показаны первые 100 состояний, где выбранное дерево GNU Go имеет продолжение на том же префиксе, но не содержит следующий ход ключа. Полный список — в JSON/CSV артефактах.\n\n`
    + `| № | Ход линии | Ключ | GNU Go | rank ключа | rank GNU Go |\n|---:|---:|---|---|---:|---:|\n`
    + `${disagreementRows || '| — | — | — | — | — | — |'}\n`;
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function isNumber(value: number | undefined): value is number { return value !== undefined; }
function numeric(left: number, right: number): number { return left - right; }

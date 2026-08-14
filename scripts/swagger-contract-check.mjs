import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const rootUrl = (process.env.SWAGGER_ROOT_URL || 'http://221.128.249.198:8902').replace(/\/$/, '');
const baselineName = process.env.SWAGGER_BASELINE || '2026-08-14';
const writeBaseline = process.argv.includes('--write-baseline');
const baselineDir = join(process.cwd(), 'docs', 'swagger-baselines', baselineName);
const groups = ['admin', 'user', 'order', 'notify'];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function countOperations(document) {
  return Object.values(document.paths || {}).reduce(
    (total, pathItem) => total + Object.keys(pathItem).filter(key => /^(get|post|put|delete|patch|head|options)$/i.test(key)).length,
    0
  );
}

function describe(document, httpStatus) {
  if (!document) return { httpStatus };
  return {
    httpStatus,
    version: document.info?.version || '',
    paths: Object.keys(document.paths || {}).length,
    operations: countOperations(document),
    schemas: Object.keys(document.components?.schemas || {}).length,
    hash: hash(document)
  };
}

async function fetchJson(path) {
  const response = await fetch(`${rootUrl}${path}`);
  if (!response.ok) return { httpStatus: response.status, document: null };
  return { httpStatus: response.status, document: await response.json() };
}

function diff(before, after, location = '$', changes = []) {
  if (JSON.stringify(before) === JSON.stringify(after)) return changes;
  const beforeObject = before && typeof before === 'object';
  const afterObject = after && typeof after === 'object';
  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
    changes.push(`${location}: ${before === undefined ? '新增' : after === undefined ? '删除' : '值变更'}`);
    return changes;
  }
  if (Array.isArray(before)) {
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) diff(before[index], after[index], `${location}[${index}]`, changes);
    return changes;
  }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    diff(before[key], after[key], `${location}.${key}`, changes);
  }
  return changes;
}

async function readBaseline(group) {
  try {
    return JSON.parse(await readFile(join(baselineDir, `${group}.json`), 'utf8'));
  } catch {
    return undefined;
  }
}

const config = await fetchJson('/v3/api-docs/swagger-config');
if (!config.document) throw new Error(`swagger-config 请求失败：HTTP ${config.httpStatus}`);

const current = {};
for (const group of groups) current[group] = await fetchJson(`/${group}/v3/api-docs`);

if (writeBaseline) {
  await mkdir(baselineDir, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    rootUrl,
    swaggerConfig: config.document,
    groups: {}
  };
  for (const group of groups) {
    const result = current[group];
    manifest.groups[group] = describe(result.document, result.httpStatus);
    await writeFile(join(baselineDir, `${group}.json`), JSON.stringify(result.document, null, 2));
  }
  await writeFile(join(baselineDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`已写入 Swagger 基线：${baselineDir}`);
}

let changed = false;
for (const group of groups) {
  const result = current[group];
  const summary = describe(result.document, result.httpStatus);
  console.log(
    result.document
      ? `${group}: HTTP ${summary.httpStatus}，路径 ${summary.paths}，操作 ${summary.operations}，schema ${summary.schemas}`
      : `${group}: HTTP ${summary.httpStatus}`
  );

  const baseline = await readBaseline(group);
  if (baseline === undefined && !writeBaseline) {
    console.log(`${group}: 未找到基线 ${baselineDir}`);
    continue;
  }
  if (hash(baseline) === hash(result.document)) {
    console.log(`${group}: 无契约差异`);
    continue;
  }
  changed = true;
  if (baseline === null && result.document) {
    console.log(`${group}: 服务状态变化：基线文档不可用，当前 HTTP ${summary.httpStatus}，路径 ${summary.paths}，操作 ${summary.operations}，schema ${summary.schemas}`);
    continue;
  }
  if (baseline && !result.document) {
    console.log(`${group}: 服务状态变化：基线文档可用，当前请求失败（HTTP ${summary.httpStatus}）`);
    continue;
  }
  const changes = diff(baseline, result.document);
  console.log(`${group}: 发现 ${changes.length} 项递归差异`);
  for (const item of changes.slice(0, 200)) console.log(`  ${item}`);
  if (changes.length > 200) console.log(`  …其余 ${changes.length - 200} 项已省略`);
}

if (changed) process.exitCode = 2;

/**
 * compare-model.test.js
 * 对比模式核心逻辑的轻量断言脚本（无第三方依赖）。
 *
 * 运行：node tests/compare-model.test.js
 * 覆盖数据生成、桶数选择、两侧步骤共享数据、同步帧映射与统计口径。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { window: {} };
vm.createContext(sandbox);
['binary-search.js', 'hash-table.js', 'compare-model.js'].forEach((file) => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  vm.runInContext(source, sandbox, { filename: file });
});

const CompareModel = sandbox.window.CompareModel;
const BinarySearch = sandbox.window.BinarySearch;
const HashTable = sandbox.window.HashTable;

let failures = 0;
let passes = 0;

function assert(condition, message) {
  if (condition) {
    passes += 1;
    return;
  }
  failures += 1;
  console.error('  ✗ ' + message);
}

function assertThrows(fn, message) {
  try {
    fn();
    assert(false, message);
  } catch (error) {
    assert(true, message);
  }
}

function test(name, fn) {
  console.log(name);
  fn();
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return function () {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function allKeys(step) {
  return step.buckets.reduce((result, chain) => result.concat(chain), []);
}

test('桶数量：满足装载因子且为质数', () => {
  assert(CompareModel.chooseBucketCount(8) === 11, '8 个关键字 → 11 个桶');
  assert(CompareModel.chooseBucketCount(12) === 17, '12 个关键字 → 17 个桶');
  assert(CompareModel.chooseBucketCount(16) === 23, '16 个关键字 → 23 个桶');
  assert(CompareModel.chooseBucketCount(24) === 37, '24 个关键字 → 37 个桶');

  for (let n = 8; n <= 24; n += 1) {
    const count = CompareModel.chooseBucketCount(n);
    assert(HashTable.isPrime(count), 'n=' + n + ' 的桶数应为质数');
    assert(n / count <= 0.75, 'n=' + n + ' 的装载因子应不超过 0.75');
  }

  assertThrows(() => CompareModel.chooseBucketCount(0), '0 个关键字应报错');
  assertThrows(() => CompareModel.chooseBucketCount(2.5), '非整数规模应报错');
});

test('数据生成：关键字互不相同且同时提供插入顺序与升序数组', () => {
  const dataset = CompareModel.createDataset(12, seededRandom(20261122));
  assert(dataset.keys.length === 12, '应生成 12 个关键字');
  assert(new Set(dataset.keys).size === 12, '关键字应互不相同');
  assert(dataset.sorted.length === 12, '升序数组长度应一致');
  assert(dataset.sorted.every((value, index) => index === 0 || dataset.sorted[index - 1] < value),
    '升序数组应严格递增');
  assert(JSON.stringify(dataset.sorted) === JSON.stringify(dataset.keys.slice().sort((a, b) => a - b)),
    '升序数组应是同一组关键字');
  assert(dataset.keys.includes(dataset.target), '默认目标应来自关键字');

  assertThrows(() => CompareModel.createDataset(7), '规模小于 8 应报错');
  assertThrows(() => CompareModel.createDataset(25), '规模大于 24 应报错');
  assertThrows(() => CompareModel.createDataset(12.5), '非整数规模应报错');
});

test('对比模型：两侧共享同一组数据与同一个目标值', () => {
  const dataset = CompareModel.createDataset(12, seededRandom(7));
  const model = CompareModel.buildComparison(dataset);

  assert(JSON.stringify(model.dataset.keys) === JSON.stringify(dataset.keys), '哈希侧应保留原始插入顺序');
  assert(JSON.stringify(model.dataset.sorted) === JSON.stringify(dataset.sorted), '二分侧应使用升序数组');
  assert(model.dataset.target === dataset.target, '两侧目标值必须一致');

  model.binary.steps.forEach((step) => {
    assert(step.target === dataset.target, '二分步骤应携带同一个目标值');
  });
  model.hash.steps.forEach((step) => {
    assert(step.target === dataset.target, '哈希步骤应携带同一个目标值');
    assert(step.phase === 'search', '对比模式只保留哈希查找阶段');
  });

  assert(model.binary.steps[0].type === 'init', '二分从 init 开始');
  assert(model.hash.steps[0].type === 'search-hash', '哈希从 search-hash 开始');
  assert(model.hash.steps.some((step) => step.type === 'found'), '默认目标应能命中');

  const lastHashStep = model.hash.steps[model.hash.steps.length - 1];
  assert(new Set(allKeys(lastHashStep)).size === dataset.keys.length, '哈希快照应包含全部关键字');
  assert(model.hash.rehashes === 0, '按装载因子推导的桶数不应触发扩容');
  assert(model.hash.bucketCount === CompareModel.chooseBucketCount(12), '桶数应与推导结果一致');
});

test('统计口径：比较次数与底层算法一致', () => {
  const dataset = CompareModel.createDataset(16, seededRandom(99));
  const model = CompareModel.buildComparison(dataset);

  const binary = BinarySearch.buildSteps(model.dataset.sorted, dataset.target);
  const hash = HashTable.buildSteps(dataset.keys, {
    bucketCount: CompareModel.chooseBucketCount(dataset.keys.length),
    target: dataset.target
  });
  const searchStart = hash.steps.findIndex((step) => step.type === 'search-hash');

  assert(model.binary.comparisons === binary.comparisons, '二分比较次数应与算法结果一致');
  assert(model.hash.comparisons === hash.comparisons, '哈希比较次数应与算法结果一致');
  assert(model.hash.steps.length === hash.steps.length - searchStart, '哈希步骤应只裁剪查找阶段');
  assert(model.frames === Math.max(binary.steps.length, model.hash.steps.length),
    '同步帧数应取两侧步骤数的较大值');
  assert(model.binary.theoreticalMax === BinarySearch.theoreticalMaxComparisons(16),
    '二分理论比较上限应与算法函数一致');
  assert(model.binary.build.estimate === Math.ceil(16 * Math.log2(16)),
    '排序成本估算应为 n·log₂n');
  assert(model.hash.build.insertions === 16, '建表插入次数应等于关键字数量');
  assert(model.hash.build.conflicts === hash.steps.filter(
    (step) => step.type === 'insert-conflict'
  ).length, '冲突次数应与建表步骤一致');
});

test('目标不存在：两侧都以 not-found 结束', () => {
  const dataset = {
    keys: [12, 3, 27, 8, 45, 19, 61, 33],
    target: -999
  };
  const model = CompareModel.buildComparison(dataset);

  assert(model.binary.found === false, '二分应未命中');
  assert(model.hash.found === false, '哈希应未命中');
  assert(model.binary.steps[model.binary.steps.length - 1].type === 'not-found',
    '二分最后一步应为 not-found');
  assert(model.hash.steps[model.hash.steps.length - 1].type === 'not-found',
    '哈希最后一步应为 not-found');

  const frame = CompareModel.frameAt(model, model.frames - 1);
  assert(frame.binaryStep.type === 'not-found', '最后一帧的二分步骤应为终态');
  assert(frame.hashStep.type === 'not-found', '最后一帧的哈希步骤应为终态');
  assert(CompareModel.conclusionFor(model).includes('结论依赖'), '结论应说明依赖当前数据');
});

test('同步帧：第 0 帧与越界帧都能安全读取', () => {
  const dataset = CompareModel.createDataset(10, seededRandom(123));
  const model = CompareModel.buildComparison(dataset);

  const first = CompareModel.frameAt(model, 0);
  assert(first.binaryStep.type === 'init', '第 0 帧左侧应为 init');
  assert(first.hashStep.type === 'search-hash', '第 0 帧右侧应为 search-hash');

  const last = CompareModel.frameAt(model, model.frames + 50);
  assert(last.binaryStep === model.binary.steps[model.binary.steps.length - 1],
    '越界帧应钳制到二分最后一步');
  assert(last.hashStep === model.hash.steps[model.hash.steps.length - 1],
    '越界帧应钳制到哈希最后一步');

  const negative = CompareModel.frameAt(model, -3);
  assert(negative.binaryStep.type === 'init', '负数帧应钳制到第 0 帧');
});

test('边界情况：非法输入与结论文本', () => {
  assertThrows(() => CompareModel.buildComparison({ keys: [], target: 1 }),
    '空关键字列表应报错');
  assertThrows(() => CompareModel.buildComparison({ keys: [1, 1], target: 1 }),
    '重复关键字应报错');
  assertThrows(() => CompareModel.buildComparison({ keys: [1, 2], target: 1.5 }),
    '非整数目标应报错');

  const model = CompareModel.buildComparison({
    keys: [5, 10, 15],
    target: 10
  });
  const conclusion = CompareModel.conclusionFor(model);
  assert(conclusion.includes('二分查找比较 ' + model.binary.comparisons + ' 次'),
    '结论应包含二分比较次数');
  assert(conclusion.includes('哈希查找比较 ' + model.hash.comparisons + ' 次'),
    '结论应包含哈希比较次数');
  assert(conclusion.includes('m = ' + model.hash.bucketCount), '结论应包含当前桶数');
});

console.log('');
if (failures > 0) {
  console.error('✗ ' + failures + ' 项断言失败，' + passes + ' 项通过');
  process.exitCode = 1;
} else {
  console.log('✓ ' + passes + ' 项断言全部通过');
}

/**
 * hash-table.test.js
 * 哈希表核心逻辑的轻量断言脚本（无第三方依赖）。
 *
 * 运行：node tests/hash-table.test.js
 * 覆盖哈希函数、链地址法插入/冲突、查找、装载因子与自动扩容。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'hash-table.js'),
  'utf8'
);

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'hash-table.js' });

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

function allKeys(steps, index) {
  return steps[index].buckets.reduce((result, chain) => result.concat(chain), []);
}

test('哈希函数：取模结果确定且非负', () => {
  assert(HashTable.hashKey(23, 5) === 3, '23 mod 5 = 3');
  assert(HashTable.hashKey(5, 5) === 0, '5 mod 5 = 0');
  assert(HashTable.hashKey(-1, 5) === 4, '负数也能落到合法桶：-1 → 4');
  assert(HashTable.hashKey(23, 5) === HashTable.hashKey(23, 5), '同一 key 结果必须确定');
});

test('扩容桶数：变大且为质数', () => {
  const next = HashTable.nextBucketCount(5, 4);
  assert(next > 5, '新桶数必须大于旧桶数');
  assert(next === 11, '5 个桶、4 个元素时应扩到 11 个桶');
  assert(HashTable.nextBucketCount(11, 9) === 23, '11 个桶、9 个元素时应扩到 23 个桶');
});

test('链地址法：冲突元素按插入顺序挂到链尾', () => {
  const result = HashTable.buildSteps([5, 10, 15], {
    bucketCount: 5,
    target: 15
  });

  assert(result.steps[0].type === 'init', '第 0 步必须是 init');
  assert(result.rehashes === 0, '3 个元素、5 个桶不应扩容');

  const insertHashes = result.steps.filter((step) => step.type === 'insert-hash');
  assert(insertHashes.length === 3, '每个关键字都应有一条哈希计算步骤');
  assert(insertHashes.every((step) => step.bucket === 0), '5、10、15 都应落在桶 0');

  const conflicts = result.steps.filter((step) => step.type === 'insert-conflict');
  assert(conflicts.length === 2, '第 2、3 个元素应触发冲突');

  const chains = result.steps
    .filter((step) => step.type === 'insert' || step.type === 'insert-conflict')
    .map((step) => step.buckets[0].slice());
  assert(JSON.stringify(chains[0]) === JSON.stringify([5]), '第一次插入后链为 [5]');
  assert(JSON.stringify(chains[1]) === JSON.stringify([5, 10]), '冲突元素挂到链尾，链为 [5, 10]');
  assert(JSON.stringify(chains[2]) === JSON.stringify([5, 10, 15]), '链为 [5, 10, 15]');
});

test('查找命中：定位桶后逐节点比较', () => {
  const result = HashTable.buildSteps([5, 10, 15], {
    bucketCount: 5,
    target: 15
  });

  assert(result.found === true, '目标存在时 found 应为 true');
  assert(result.foundBucket === 0, '命中的桶应为 0');
  assert(result.comparisons === 3, '链上第三个节点命中，应比较 3 次');

  const searchStartIndex = result.steps.findIndex((step) => step.type === 'search-hash');
  assert(searchStartIndex > 0, '建表结束后应有 search-hash 步骤');
  const searchSteps = result.steps.slice(searchStartIndex);
  assert(searchSteps[1].type === 'search-compare', '先比较链首节点');
  assert(searchSteps[1].nodeIndex === 0, '失败比较记录节点下标 0');
  assert(searchSteps[2].type === 'search-compare', '继续比较第二个节点');
  assert(searchSteps[3].type === 'found', '第三个节点命中');
  assert(searchSteps[3].message.includes('15'), '命中步骤应包含目标值');
});

test('查找未命中：遍历整条冲突链后失败', () => {
  const result = HashTable.buildSteps([2, 5], {
    bucketCount: 3,
    target: 8
  });

  assert(result.found === false, '目标不存在时 found 应为 false');
  assert(result.steps[result.steps.length - 1].type === 'not-found', '最后一步应为 not-found');
  assert(result.comparisons === 2, '桶 2 的 [2, 5] 两个节点都要比较');
  assert(result.steps[result.steps.length - 1].loadFactor > 0, '失败步骤仍应携带装载因子');
});

test('装载因子超过 0.75 时提示并演示 rehash', () => {
  const keys = [3, 8, 13, 18, 23, 28, 33, 38];
  const result = HashTable.buildSteps(keys, {
    bucketCount: 5,
    target: 18
  });

  assert(result.rehashes > 0, '8 个元素、5 个桶必须触发扩容');

  const hintIndex = result.steps.findIndex((step) => step.type === 'rehash-needed');
  assert(hintIndex > 0, '扩容前应有 rehash-needed 提示步骤');
  const hint = result.steps[hintIndex];
  assert(hint.loadFactor > 0.75, '提示步骤的装载因子应高于阈值');
  assert(hint.threshold === 0.75, '提示步骤应说明 0.75 阈值');

  const rehash = result.steps[hintIndex + 1];
  assert(rehash.type === 'rehash', '提示之后应立即演示 rehash');
  assert(rehash.bucketCount > rehash.oldBucketCount, 'rehash 后桶数必须增加');
  assert(rehash.buckets.length === rehash.bucketCount, '快照桶数应与新桶数一致');
  assert(rehash.rehashCount === 1, '第一次扩容后计数为 1');

  const expected = keys.slice(0, rehash.insertedCount).sort((a, b) => a - b);
  const redistributed = allKeys(result.steps, hintIndex + 1).sort((a, b) => a - b);
  assert(JSON.stringify(redistributed) === JSON.stringify(expected), 'rehash 必须保留全部已插入元素');
});

test('每一步的快照、装载因子与计数彼此一致', () => {
  const keys = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110];
  const result = HashTable.buildSteps(keys, {
    bucketCount: 4,
    target: 66
  });

  let rehashSteps = 0;
  result.steps.forEach((step, index) => {
    assert(typeof step.message === 'string' && step.message.length > 0, '步骤 ' + index + ' 应有说明');
    assert(Array.isArray(step.buckets), '步骤 ' + index + ' 应携带桶快照');
    assert(step.buckets.length === step.bucketCount, '步骤 ' + index + ' 的桶快照长度应等于桶数');

    const flattened = step.buckets.reduce((acc, chain) => acc.concat(chain), []);
    assert(flattened.length === step.insertedCount, '步骤 ' + index + ' 的元素数应与快照一致');
    assert(
      Math.abs(step.loadFactor - step.insertedCount / step.bucketCount) < 1e-9,
      '步骤 ' + index + ' 的装载因子应为 n / m'
    );
    assert(new Set(flattened).size === flattened.length, '步骤 ' + index + ' 不应出现重复元素');
    assert(flattened.every((key) => keys.includes(key)), '步骤 ' + index + ' 不应出现意外元素');

    if (step.type === 'rehash') {
      rehashSteps += 1;
      assert(step.rehashCount === rehashSteps, 'rehash 次数应逐次递增');
    } else if (step.type !== 'init') {
      assert(step.rehashCount === rehashSteps, '普通步骤的 rehash 计数应保持当前值');
    }
  });

  assert(rehashSteps === result.rehashes, 'rehash 步骤数应等于结果中的扩容次数');
  assert(new Set(allKeys(result.steps, result.steps.length - 1)).size === keys.length,
    '最终快照应包含全部关键字');
});

test('查找比较次数只统计链内比较', () => {
  const result = HashTable.buildSteps([5, 10, 15], {
    bucketCount: 5,
    target: 10
  });

  const compareSteps = result.steps.filter(
    (step) => step.type === 'search-compare' || step.type === 'found'
  );
  assert(compareSteps.length === result.comparisons, '比较次数应等于 search-compare/found 步骤数');
  result.steps
    .filter((step) => step.phase === 'insert')
    .forEach((step) => assert(step.comparisons === 0, '插入阶段不累计查找比较次数'));
});

test('边界情况：非法输入会报错', () => {
  assertThrows(() => HashTable.buildSteps([], { bucketCount: 5, target: 1 }), '空关键字列表应报错');
  assertThrows(() => HashTable.buildSteps([1, 1], { bucketCount: 5, target: 1 }), '重复关键字应报错');
  assertThrows(() => HashTable.buildSteps([1, 2], { bucketCount: 0, target: 1 }), '桶数必须为正整数');
  assertThrows(() => HashTable.buildSteps([1, 2], { bucketCount: 5.5, target: 1 }), '桶数必须为整数');
  assertThrows(() => HashTable.buildSteps([1, 2], { bucketCount: 5, target: 1.5 }), '目标必须为整数');
});

console.log('');
if (failures > 0) {
  console.error('✗ ' + failures + ' 项断言失败，' + passes + ' 项通过');
  process.exitCode = 1;
} else {
  console.log('✓ ' + passes + ' 项断言全部通过');
}

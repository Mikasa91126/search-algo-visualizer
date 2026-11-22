/**
 * binary-search.test.js
 * 二分查找核心逻辑的轻量断言脚本（无第三方依赖）。
 *
 * 运行：node tests/binary-search.test.js
 * 浏览器页面不加载此文件，它只用于开发与提交前的算法校验。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'binary-search.js'),
  'utf8'
);

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'binary-search.js' });

const BinarySearch = sandbox.window.BinarySearch;
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

test('单元素数组：命中与未命中', () => {
  const hit = BinarySearch.buildSteps([42], 42);
  assert(hit.foundIndex === 0, '单元素命中下标应为 0');
  assert(hit.steps[hit.steps.length - 1].type === 'found', '最后一步应为 found');
  assert(hit.comparisons === 1, '单元素命中比较 1 次');

  const miss = BinarySearch.buildSteps([42], 7);
  assert(miss.foundIndex === -1, '单元素未命中返回 -1');
  assert(miss.steps[miss.steps.length - 1].type === 'not-found', '最后一步应为 not-found');
  assert(miss.comparisons === 1, '单元素未命中比较 1 次');
});

test('不同目标位置：首、中、尾、不存在', () => {
  const array = [1, 3, 5, 7, 9];
  assert(BinarySearch.buildSteps(array, 1).foundIndex === 0, '命中首元素');
  assert(BinarySearch.buildSteps(array, 5).foundIndex === 2, '命中中间元素');
  assert(BinarySearch.buildSteps(array, 9).foundIndex === 4, '命中尾元素');

  const lowerMiss = BinarySearch.buildSteps(array, -3);
  assert(lowerMiss.foundIndex === -1, '小于最小值应未命中');
  assert(lowerMiss.steps[lowerMiss.steps.length - 1].type === 'not-found', '小于最小值以失败结束');

  const upperMiss = BinarySearch.buildSteps(array, 100);
  assert(upperMiss.foundIndex === -1, '大于最大值应未命中');
  assert(upperMiss.steps[upperMiss.steps.length - 1].type === 'not-found', '大于最大值以失败结束');
});

test('步骤记录与数组内容一致', () => {
  const array = [2, 4, 6, 8, 10, 12, 14, 16];
  const result = BinarySearch.buildSteps(array, 10);

  assert(result.steps[0].type === 'init', '第 0 步必须是 init');
  assert(result.steps[0].low === 0 && result.steps[0].high === 7, 'init 区间应为 [0, 7]');

  result.steps.forEach((step, index) => {
    assert(step.comparisons >= 0, '步骤 ' + index + ' 的比较次数非负');
    if (step.type === 'compare' || step.type === 'found') {
      assert(step.mid >= 0 && step.mid < array.length, '步骤 ' + index + ' 的 mid 应在数组范围内');
      assert(array[step.mid] === step.value, '步骤 ' + index + ' 的 value 应与数组一致');
      assert(step.low >= 0 && step.high < array.length, '步骤 ' + index + ' 的区间应在数组范围内');
    }
    if (step.type === 'found') {
      assert(step.value === step.target, '命中步骤的值应等于目标');
    }
  });

  const compareCount = result.steps.filter(
    (step) => step.type === 'compare' || step.type === 'found'
  ).length;
  assert(compareCount === result.comparisons, '比较次数应等于 compare/found 步骤数');
});

test('区间随步骤单调收缩', () => {
  const array = Array.from({ length: 16 }, (_, index) => index * 3 + 1);
  const result = BinarySearch.buildSteps(array, 2);
  let previous = Number.POSITIVE_INFINITY;

  result.steps.forEach((step) => {
    const size = Math.max(0, step.high - step.low + 1);
    assert(size <= previous, '区间长度不应增大');
    previous = size;
  });
});

test('边界情况：空数组与乱序数组会报错', () => {
  assertThrows(() => BinarySearch.buildSteps([], 1), '空数组应抛出错误');
  assertThrows(() => BinarySearch.buildSteps([3, 1, 2], 1), '乱序数组应抛出错误');
});

test('理论比较上限 ⌊log₂n⌋ + 1', () => {
  assert(BinarySearch.theoreticalMaxComparisons(1) === 1, 'n=1 → 1');
  assert(BinarySearch.theoreticalMaxComparisons(2) === 2, 'n=2 → 2');
  assert(BinarySearch.theoreticalMaxComparisons(8) === 4, 'n=8 → 4');
  assert(BinarySearch.theoreticalMaxComparisons(9) === 4, 'n=9 → 4');
  assert(BinarySearch.theoreticalMaxComparisons(16) === 5, 'n=16 → 5');
  assert(BinarySearch.theoreticalMaxComparisons(128) === 8, 'n=128 → 8');
  assert(BinarySearch.theoreticalMaxComparisons(0) === 0, 'n=0 → 0');
});

test('随机用例：结果与实际下标一致', () => {
  for (let round = 0; round < 200; round += 1) {
    const length = 1 + Math.floor(Math.random() * 128);
    const set = new Set();
    while (set.size < length) {
      set.add(Math.floor(Math.random() * 999) + 1);
    }
    const array = Array.from(set).sort((a, b) => a - b);
    const target = Math.random() < 0.5
      ? array[Math.floor(Math.random() * array.length)]
      : Math.floor(Math.random() * 1200) - 100;

    const result = BinarySearch.buildSteps(array, target);
    if (result.foundIndex >= 0) {
      assert(array[result.foundIndex] === target, '命中下标的值应等于目标');
    } else {
      assert(!array.includes(target), '未命中时数组中确实不应存在目标');
    }
    assert(
      result.steps[result.steps.length - 1].type === (result.foundIndex >= 0 ? 'found' : 'not-found'),
      '最后一步类型与查找结果一致'
    );
  }
});

console.log('');
if (failures > 0) {
  console.error('✗ ' + failures + ' 项断言失败，' + passes + ' 项通过');
  process.exitCode = 1;
} else {
  console.log('✓ ' + passes + ' 项断言全部通过');
}

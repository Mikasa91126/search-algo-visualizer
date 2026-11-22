/**
 * compare-model.js
 * 对比模式的数据与步骤模型。
 *
 * 该模块不接触任何 DOM，只做三件事：
 *   1. 生成一组互不相同的整数，同时保留「随机插入顺序」与「升序数组」；
 *   2. 复用 binary-search.js / hash-table.js 生成两种查找的步骤序列；
 *   3. 汇总比较次数、理论复杂度与前置构建成本，供渲染层读取。
 *
 * 对比模式只回放「查找阶段」：二分查找从 init 开始，哈希查找从 search-hash
 * 开始。两侧共用一个同步帧号，因此一次播放可以同时驱动左右各自推进。
 */
(function (global) {
  'use strict';

  var MIN_SIZE = 8;
  var MAX_SIZE = 24;
  var LOAD_FACTOR_LIMIT = 0.75;

  function randomInt(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  /**
   * 对比模式的桶数量：取使装载因子不超过 0.75 的最小质数，
   * 这样建表阶段不会触发 rehash，左右两侧的查找都建立在稳定的结构上。
   *
   * @param {number} n 关键字数量
   * @returns {number} 桶数量 m
   */
  function chooseBucketCount(n) {
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('关键字数量必须是正整数');
    }
    var minimum = Math.max(2, Math.ceil(n / LOAD_FACTOR_LIMIT));
    while (!global.HashTable.isPrime(minimum)) {
      minimum += 1;
    }
    return minimum;
  }

  /**
   * 排序构建成本的估算值：n·log₂n 次比较。只用于统计面板展示量级，
   * 不冒充某一种具体排序实现的精确比较次数。
   *
   * @param {number} n 元素个数
   * @returns {number}
   */
  function estimateSortComparisons(n) {
    if (!Number.isInteger(n) || n <= 1) {
      return 0;
    }
    return Math.ceil(n * Math.log2(n));
  }

  /**
   * 生成对比模式的数据集：同一组关键字既用于建哈希表，也排序后用于二分查找。
   *
   * @param {number} size 关键字数量
   * @param {function} [random] 随机数函数，测试时可注入固定序列
   * @returns {{keys: number[], sorted: number[], target: number}}
   */
  function createDataset(size, random) {
    if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
      throw new Error('对比模式的数据规模应在 ' + MIN_SIZE + '–' + MAX_SIZE + ' 之间');
    }
    var rng = typeof random === 'function' ? random : Math.random;
    var picked = new Set();
    var guard = 0;
    while (picked.size < size) {
      picked.add(randomInt(rng, 1, 999));
      guard += 1;
      if (guard > 10000) {
        throw new Error('无法生成足够多的互不相同的关键字');
      }
    }

    var keys = Array.from(picked);
    var sorted = keys.slice().sort(function (a, b) { return a - b; });
    var target = keys[Math.floor(rng() * keys.length)];

    return {
      keys: keys,
      sorted: sorted,
      target: target
    };
  }

  function validateDataset(dataset) {
    if (!dataset || !Array.isArray(dataset.keys) || dataset.keys.length === 0) {
      throw new Error('对比模式需要非空的关键字列表');
    }
    if (!Number.isSafeInteger(dataset.target)) {
      throw new Error('目标值必须是整数');
    }
    var seen = Object.create(null);
    dataset.keys.forEach(function (key) {
      if (!Number.isSafeInteger(key)) {
        throw new Error('关键字必须是整数');
      }
      if (seen[key]) {
        throw new Error('对比模式的关键字不能重复');
      }
      seen[key] = true;
    });
  }

  /**
   * 生成一次完整的对比演示。
   *
   * @param {{keys: number[], target: number}} dataset 同一组关键字与目标值
   * @param {{bucketCount?: number}} [options]
   * @returns {object} 对比模型，包含两侧步骤、统计与构建成本
   */
  function buildComparison(dataset, options) {
    validateDataset(dataset);

    var keys = dataset.keys.slice();
    var sorted = keys.slice().sort(function (a, b) { return a - b; });
    var target = dataset.target;
    var bucketCount = options && options.bucketCount
      ? options.bucketCount
      : chooseBucketCount(keys.length);

    var binaryResult = global.BinarySearch.buildSteps(sorted, target);
    var hashResult = global.HashTable.buildSteps(keys, {
      bucketCount: bucketCount,
      target: target
    });

    // 只保留查找阶段：哈希建表过程不参与同步播放，其成本单独统计。
    var searchStart = hashResult.steps.findIndex(function (step) {
      return step.type === 'search-hash';
    });
    if (searchStart < 0) {
      throw new Error('哈希步骤中缺少查找阶段');
    }
    var hashSearchSteps = hashResult.steps.slice(searchStart);

    var conflictCount = hashResult.steps.filter(function (step) {
      return step.type === 'insert-conflict';
    }).length;

    var finalStep = hashSearchSteps[hashSearchSteps.length - 1];
    var maxChain = finalStep.buckets.reduce(function (longest, chain) {
      return Math.max(longest, chain.length);
    }, 0);

    return {
      dataset: {
        keys: keys,
        sorted: sorted,
        target: target
      },
      binary: {
        steps: binaryResult.steps,
        comparisons: binaryResult.comparisons,
        found: binaryResult.foundIndex >= 0,
        foundIndex: binaryResult.foundIndex,
        theoreticalMax: global.BinarySearch.theoreticalMaxComparisons(sorted.length),
        build: {
          notation: 'O(n log n)',
          label: '排序',
          estimate: estimateSortComparisons(sorted.length)
        }
      },
      hash: {
        steps: hashSearchSteps,
        comparisons: hashResult.comparisons,
        found: hashResult.found,
        foundBucket: hashResult.foundBucket,
        bucketCount: hashResult.bucketCount,
        initialBucketCount: bucketCount,
        rehashes: hashResult.rehashes,
        loadFactor: hashResult.loadFactor,
        maxChain: maxChain,
        build: {
          notation: 'O(n)',
          label: '建表',
          insertions: keys.length,
          conflicts: conflictCount,
          rehashes: hashResult.rehashes
        }
      },
      frames: Math.max(binaryResult.steps.length, hashSearchSteps.length)
    };
  }

  /**
   * 取同步帧对应的两侧步骤。较短的一侧到达最后一步后保持终态，
   * 让另一侧继续推进，避免一侧提前结束后整个演示被迫停顿。
   *
   * @param {object} model buildComparison 的返回值
   * @param {number} frameIndex 同步帧号
   * @returns {{binaryStep: object, hashStep: object}}
   */
  function frameAt(model, frameIndex) {
    var index = Math.max(0, Math.floor(frameIndex) || 0);
    return {
      binaryStep: model.binary.steps[Math.min(index, model.binary.steps.length - 1)],
      hashStep: model.hash.steps[Math.min(index, model.hash.steps.length - 1)]
    };
  }

  /**
   * 播放到最后一帧时的对比结论。结论只描述本次数据与参数，
   * 不推广成「哈希永远更快」的绝对判断。
   *
   * @param {object} model buildComparison 的返回值
   * @returns {string}
   */
  function conclusionFor(model) {
    var binary = model.binary;
    var hash = model.hash;
    var comparison = hash.comparisons < binary.comparisons
      ? '哈希查找少比较 ' + (binary.comparisons - hash.comparisons) + ' 次'
      : (hash.comparisons > binary.comparisons
        ? '二分查找少比较 ' + (hash.comparisons - binary.comparisons) + ' 次'
        : '两者比较次数相同');

    return '本次查找：二分查找比较 ' + binary.comparisons + ' 次，哈希查找比较 ' +
      hash.comparisons + ' 次（另有 1 次哈希定位，不计入比较次数），' + comparison +
      '。结论依赖当前数据规模、目标位置与桶数 m = ' + hash.bucketCount +
      '，不代表所有输入。';
  }

  global.CompareModel = {
    MIN_SIZE: MIN_SIZE,
    MAX_SIZE: MAX_SIZE,
    LOAD_FACTOR_LIMIT: LOAD_FACTOR_LIMIT,
    chooseBucketCount: chooseBucketCount,
    estimateSortComparisons: estimateSortComparisons,
    createDataset: createDataset,
    buildComparison: buildComparison,
    frameAt: frameAt,
    conclusionFor: conclusionFor
  };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * hash-table.js
 * 哈希表（取模哈希 + 链地址法）与「步骤序列」生成。
 *
 * 该模块不接触任何 DOM，只负责把一次哈希表演示展开成可回放的步骤数组：
 *   init            初始化空桶数组
 *   insert-hash     计算 h(k) = k mod m，定位目标桶
 *   insert          目标桶为空，关键字直接入桶
 *   insert-conflict 目标桶已有元素，关键字追加到链尾
 *   rehash-needed   装载因子超过 0.75，提示即将扩容
 *   rehash          扩容完成，所有关键字重新分布
 *   search-hash     计算目标的桶位置
 *   search-compare  在桶内链表中逐个比较
 *   found / not-found 查找结束
 *
 * 每个步骤都保存当时的桶快照、桶数、已插入元素数、装载因子、比较次数和
 * 扩容次数。渲染层只读取当前步骤即可还原界面，单步回退时不需要重算。
 */
(function (global) {
  'use strict';

  var LOAD_FACTOR_THRESHOLD = 0.75;

  /**
   * 取模哈希：h(key) = key mod m。
   * JavaScript 的 % 对负数会得到负数，这里统一折算到 [0, m) 区间。
   *
   * @param {number} key 关键字
   * @param {number} bucketCount 桶数量 m
   * @returns {number} 桶下标
   */
  function hashKey(key, bucketCount) {
    return ((key % bucketCount) + bucketCount) % bucketCount;
  }

  /**
   * 判断一个整数是否为质数，用于选择扩容后的桶数，避免桶数含过多因子
   * 导致取模分布过于集中。
   *
   * @param {number} value
   * @returns {boolean}
   */
  function isPrime(value) {
    if (!Number.isInteger(value) || value < 2) {
      return false;
    }
    if (value === 2) {
      return true;
    }
    if (value % 2 === 0) {
      return false;
    }
    for (var divisor = 3; divisor * divisor <= value; divisor += 2) {
      if (value % divisor === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * 扩容后的桶数：至少翻倍，并保证按当前元素数计算的装载因子不高于阈值；
   * 最后向上取到最近的质数，让取模分布更均匀。
   *
   * @param {number} currentCount 当前桶数
   * @param {number} insertedCount 已插入元素数
   * @returns {number} 新桶数
   */
  function nextBucketCount(currentCount, insertedCount) {
    var minByLoad = Math.ceil(insertedCount / LOAD_FACTOR_THRESHOLD);
    var candidate = Math.max(currentCount * 2 + 1, minByLoad);
    if (candidate % 2 === 0) {
      candidate += 1;
    }
    while (!isPrime(candidate)) {
      candidate += 2;
    }
    return candidate;
  }

  function cloneBuckets(buckets) {
    return buckets.map(function (chain) {
      return chain.slice();
    });
  }

  function countElements(buckets) {
    return buckets.reduce(function (total, chain) {
      return total + chain.length;
    }, 0);
  }

  function formatFactor(value) {
    return value.toFixed(2);
  }

  function validateInput(keys, options) {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error('哈希演示需要至少一个关键字');
    }
    var seen = Object.create(null);
    keys.forEach(function (key) {
      if (!Number.isSafeInteger(key)) {
        throw new Error('关键字必须是整数');
      }
      if (seen[key]) {
        throw new Error('关键字不能重复，否则无法确定命中位置');
      }
      seen[key] = true;
    });
    if (!options || !Number.isSafeInteger(options.bucketCount) || options.bucketCount < 2) {
      throw new Error('桶数量必须是大于 1 的整数');
    }
    if (!Number.isSafeInteger(options.target)) {
      throw new Error('目标值必须是整数');
    }
  }

  /**
   * 生成完整的哈希表演示步骤。
   *
   * 建表阶段依次插入全部关键字；只要某次插入让装载因子超过 0.75，
   * 立即插入「扩容提示 → rehash」两步。建表结束后再演示一次目标查找。
   *
   * @param {number[]} keys 待插入的关键字（互不重复）
   * @param {{bucketCount: number, target: number}} options
   * @returns {object} {
   *   steps, target, found, foundBucket, comparisons, rehashes,
   *   initialBucketCount, bucketCount, loadFactor
   * }
   */
  function buildSteps(keys, options) {
    validateInput(keys, options);

    var target = options.target;
    var initialBucketCount = options.bucketCount;
    var bucketCount = initialBucketCount;
    var buckets = [];
    for (var i = 0; i < bucketCount; i += 1) {
      buckets.push([]);
    }

    var steps = [];
    var insertedCount = 0;
    var comparisons = 0;
    var rehashCount = 0;

    function baseStep(type, extra) {
      var step = {
        type: type,
        phase: insertedCount < keys.length ? 'insert' : 'search',
        target: target,
        bucketCount: bucketCount,
        insertedCount: insertedCount,
        loadFactor: insertedCount / bucketCount,
        comparisons: comparisons,
        rehashCount: rehashCount,
        threshold: LOAD_FACTOR_THRESHOLD,
        buckets: cloneBuckets(buckets)
      };
      Object.keys(extra || {}).forEach(function (name) {
        step[name] = extra[name];
      });
      return step;
    }

    steps.push(baseStep('init', {
      bucket: null,
      nodeIndex: null,
      message: '初始化 ' + bucketCount + ' 个桶；准备依次插入 ' + keys.length + ' 个关键字。'
    }));

    keys.forEach(function (key) {
      var bucket = hashKey(key, bucketCount);
      var chainBefore = buckets[bucket];
      var isConflict = chainBefore.length > 0;

      // 第一步只展示哈希计算与目标桶，此时关键字还没有进入链表。
      steps.push(baseStep('insert-hash', {
        phase: 'insert',
        key: key,
        bucket: bucket,
        nodeIndex: null,
        chainLength: chainBefore.length,
        message: '计算 h(' + key + ') = ' + key + ' mod ' + bucketCount + ' = ' +
          bucket + '，定位到桶 ' + bucket + (isConflict ?
            '；该桶已有 ' + chainBefore.length + ' 个元素。' :
            '；该桶目前为空。')
      }));

      chainBefore.push(key);
      insertedCount += 1;
      var nodeIndex = chainBefore.length - 1;
      var conflictMessage = isConflict ?
        '桶 ' + bucket + ' 已有元素，发生冲突：把 ' + key + ' 追加到链尾（第 ' +
          (nodeIndex + 1) + ' 个节点）。' :
        '桶 ' + bucket + ' 为空，关键字 ' + key + ' 直接成为链首节点。';

      steps.push(baseStep(isConflict ? 'insert-conflict' : 'insert', {
        phase: 'insert',
        key: key,
        bucket: bucket,
        nodeIndex: nodeIndex,
        chainLength: chainBefore.length,
        message: conflictMessage
      }));

      var factor = insertedCount / bucketCount;
      if (factor > LOAD_FACTOR_THRESHOLD) {
        var oldBucketCount = bucketCount;
        var newBucketCount = nextBucketCount(bucketCount, insertedCount);

        steps.push(baseStep('rehash-needed', {
          phase: 'insert',
          key: null,
          bucket: null,
          nodeIndex: null,
          oldBucketCount: oldBucketCount,
          nextBucketCount: newBucketCount,
          message: '装载因子 ' + formatFactor(factor) + ' > ' +
            formatFactor(LOAD_FACTOR_THRESHOLD) + '：' + insertedCount + ' 个关键字 / ' +
            oldBucketCount + ' 个桶，准备扩容到 ' + newBucketCount + ' 个桶。'
        }));

        bucketCount = newBucketCount;
        var redistributed = [];
        for (var b = 0; b < bucketCount; b += 1) {
          redistributed.push([]);
        }
        buckets.forEach(function (chain) {
          chain.forEach(function (storedKey) {
            redistributed[hashKey(storedKey, bucketCount)].push(storedKey);
          });
        });
        buckets = redistributed;
        rehashCount += 1;

        steps.push(baseStep('rehash', {
          phase: 'insert',
          key: null,
          bucket: null,
          nodeIndex: null,
          oldBucketCount: oldBucketCount,
          message: '扩容完成：' + oldBucketCount + ' → ' + bucketCount +
            ' 个桶，' + insertedCount + ' 个关键字按 h(k) = k mod ' + bucketCount +
            ' 重新分布，装载因子降为 ' + formatFactor(insertedCount / bucketCount) + '。'
        }));
      }
    });

    // 建表结束后开始查找：先定位桶，再沿冲突链逐个比较。
    var targetBucket = hashKey(target, bucketCount);
    var targetChain = buckets[targetBucket];
    var targetNodeIndex = targetChain.indexOf(target);
    var found = targetNodeIndex >= 0;

    steps.push(baseStep('search-hash', {
      phase: 'search',
      key: target,
      bucket: targetBucket,
      nodeIndex: null,
      chainLength: targetChain.length,
      found: found,
      message: '查找目标 ' + target + '：计算 h(' + target + ') = ' + target +
        ' mod ' + bucketCount + ' = ' + targetBucket + '，定位到桶 ' + targetBucket +
        '（链长 ' + targetChain.length + '）。'
    }));

    for (var node = 0; node < targetChain.length; node += 1) {
      var stored = targetChain[node];
      comparisons += 1;
      if (stored === target) {
        steps.push(baseStep('found', {
          phase: 'search',
          key: target,
          bucket: targetBucket,
          nodeIndex: node,
          chainLength: targetChain.length,
          found: true,
          message: '比较桶 ' + targetBucket + ' 的第 ' + (node + 1) + ' 个节点 ' +
            stored + ' 与目标 ' + target + '：相等，命中。'
        }));
        break;
      }
      steps.push(baseStep('search-compare', {
        phase: 'search',
        key: target,
        bucket: targetBucket,
        nodeIndex: node,
        chainLength: targetChain.length,
        found: false,
        message: '比较桶 ' + targetBucket + ' 的第 ' + (node + 1) + ' 个节点 ' +
          stored + ' 与目标 ' + target + '：不相等，继续下一个节点。'
      }));
    }

    if (!found) {
      steps.push(baseStep('not-found', {
        phase: 'search',
        key: target,
        bucket: targetBucket,
        nodeIndex: null,
        chainLength: targetChain.length,
        found: false,
        message: targetChain.length === 0 ?
          '桶 ' + targetBucket + ' 为空，目标 ' + target + ' 不在哈希表中。' :
          '桶 ' + targetBucket + ' 的链表已遍历完，目标 ' + target + ' 不在哈希表中。'
      }));
    }

    return {
      steps: steps,
      target: target,
      found: found,
      foundBucket: found ? targetBucket : -1,
      comparisons: comparisons,
      rehashes: rehashCount,
      initialBucketCount: initialBucketCount,
      bucketCount: bucketCount,
      loadFactor: insertedCount / bucketCount
    };
  }

  global.HashTable = {
    LOAD_FACTOR_THRESHOLD: LOAD_FACTOR_THRESHOLD,
    hashKey: hashKey,
    nextBucketCount: nextBucketCount,
    isPrime: isPrime,
    buildSteps: buildSteps
  };
})(window);

/**
 * binary-search.js
 * 二分查找算法与「步骤序列」生成。
 *
 * 该模块不接触任何 DOM，只负责把一次二分查找展开成可回放的步骤数组：
 *   init      初始化查找区间
 *   compare   比较中点并把区间折半
 *   found     命中目标
 *   not-found 区间为空，查找失败
 *
 * 每个步骤都保存了当时的 low / high / mid、比较次数和中文说明，
 * 渲染层只需要读取当前步骤即可还原界面，无需重新执行算法。
 */
(function (global) {
  'use strict';

  /**
   * 生成二分查找的完整步骤序列。
   *
   * @param {number[]} array  升序排列的整数数组
   * @param {number}   target 要查找的整数
   * @returns {{steps: object[], foundIndex: number, comparisons: number, target: number}}
   * @throws {Error} 数组为空或未按升序排列时抛出，便于开发时尽早发现问题
   */
  function buildSteps(array, target) {
    if (!Array.isArray(array) || array.length === 0) {
      throw new Error('二分查找需要一个非空数组');
    }

    // 二分查找的前提：数组必须有序。这里只做展示所需的校验。
    for (let i = 1; i < array.length; i += 1) {
      if (array[i - 1] > array[i]) {
        throw new Error('二分查找要求数组按升序排列');
      }
    }

    const steps = [];
    let low = 0;
    let high = array.length - 1;
    let comparisons = 0;

    // 第 0 步：展示完整的初始查找区间。
    steps.push({
      type: 'init',
      low: low,
      high: high,
      mid: null,
      value: null,
      target: target,
      comparisons: 0,
      intervalSize: array.length,
      message: '初始化查找区间 [0, ' + (array.length - 1) + ']，共 ' + array.length + ' 个元素。'
    });

    while (low <= high) {
      const mid = low + Math.floor((high - low) / 2);
      const value = array[mid];
      comparisons += 1;

      if (value === target) {
        steps.push({
          type: 'found',
          low: low,
          high: high,
          mid: mid,
          value: value,
          target: target,
          comparisons: comparisons,
          intervalSize: high - low + 1,
          message: '比较 A[' + mid + '] = ' + value + ' 与目标 ' + target +
            '：相等，命中下标 ' + mid + '。'
        });
        return {
          steps: steps,
          foundIndex: mid,
          comparisons: comparisons,
          target: target
        };
      }

      if (value < target) {
        // 中点偏小：目标只可能在右半区间，丢弃 [low, mid]。
        const discardedFrom = low;
        low = mid + 1;
        steps.push({
          type: 'compare',
          direction: 'right',
          low: low,
          high: high,
          mid: mid,
          value: value,
          target: target,
          comparisons: comparisons,
          discarded: [discardedFrom, mid],
          intervalSize: Math.max(0, high - low + 1),
          message: 'A[' + mid + '] = ' + value + ' < 目标 ' + target +
            '，目标只可能在右半区间：丢弃 [' + discardedFrom + ', ' + mid +
            ']，low 移到 ' + low + '。'
        });
      } else {
        // 中点偏大：目标只可能在左半区间，丢弃 [mid, high]。
        const discardedTo = high;
        high = mid - 1;
        steps.push({
          type: 'compare',
          direction: 'left',
          low: low,
          high: high,
          mid: mid,
          value: value,
          target: target,
          comparisons: comparisons,
          discarded: [mid, discardedTo],
          intervalSize: Math.max(0, high - low + 1),
          message: 'A[' + mid + '] = ' + value + ' > 目标 ' + target +
            '，目标只可能在左半区间：丢弃 [' + mid + ', ' + discardedTo +
            ']，high 移到 ' + high + '。'
        });
      }
    }

    // 区间为空：low 已经越过 high，说明目标不存在。
    steps.push({
      type: 'not-found',
      low: low,
      high: high,
      mid: null,
      value: null,
      target: target,
      comparisons: comparisons,
      intervalSize: 0,
      message: '查找区间为空（low = ' + low + ' > high = ' + high +
        '），数组中不存在目标 ' + target + '。'
    });

    return {
      steps: steps,
      foundIndex: -1,
      comparisons: comparisons,
      target: target
    };
  }

  /**
   * 当前规模下二分查找最多需要比较多少次：⌊log₂n⌋ + 1。
   * 这里用循环计算，避免浮点误差。
   *
   * @param {number} n 元素个数
   * @returns {number}
   */
  function theoreticalMaxComparisons(n) {
    if (!Number.isInteger(n) || n <= 0) {
      return 0;
    }
    let levels = 0;
    let power = 1;
    // 找到不超过 n 的最大 2 的幂，其指数就是 ⌊log₂n⌋。
    while (power * 2 <= n) {
      power *= 2;
      levels += 1;
    }
    return levels + 1;
  }

  global.BinarySearch = {
    buildSteps: buildSteps,
    theoreticalMaxComparisons: theoreticalMaxComparisons
  };
})(window);

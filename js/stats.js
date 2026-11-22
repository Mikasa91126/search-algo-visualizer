/**
 * stats.js
 * 统计面板：把当前步骤汇总为比较次数、剩余区间、理论比较上限和查找结果。
 *
 * 统计值全部来自 binary-search.js 生成的步骤记录，不重复执行算法。
 */
(function (global) {
  'use strict';

  var StatsPanel = (function () {
    var els = {};
    var theoretical = 0;

    function mount(elements) {
      els = elements;
    }

    /**
     * 在新数据生成后调用，记录当前规模的理论比较上限。
     * @param {number} arrayLength
     */
    function setData(arrayLength) {
      theoretical = global.BinarySearch.theoreticalMaxComparisons(arrayLength);
      if (els.theoretical) {
        els.theoretical.textContent = String(theoretical);
      }
    }

    /**
     * 渲染当前步骤的统计。
     * @param {object} step 当前步骤
     * @param {number} arrayLength 数组长度
     */
    function render(step, arrayLength) {
      if (!els.comparisons) {
        return;
      }

      var comparisons = step ? step.comparisons : 0;
      var remaining = step ? Math.max(0, step.high - step.low + 1) : arrayLength;

      els.comparisons.textContent = String(comparisons);
      els.remaining.textContent = String(remaining);

      var verdict = '准备就绪';
      var tone = 'idle';
      var result = '—';
      if (step) {
        if (step.type === 'found') {
          verdict = '已找到';
          tone = 'found';
          result = '下标 ' + step.mid;
        } else if (step.type === 'not-found') {
          verdict = '未找到';
          tone = 'failed';
          result = '不存在';
        } else if (step.type === 'compare') {
          verdict = '查找中';
          tone = 'active';
          result = '继续';
        }
      }

      els.verdict.textContent = verdict;
      els.verdict.setAttribute('data-tone', tone);
      els.result.textContent = result;
      els.result.classList.toggle('is-found', tone === 'found');
      els.result.classList.toggle('is-failed', tone === 'failed');
      els.result.classList.toggle('is-small', result.length > 4);

      // 数据规模变化后，理论值与实际规模保持一致。
      var expected = global.BinarySearch.theoreticalMaxComparisons(arrayLength);
      if (expected !== theoretical) {
        setData(arrayLength);
      }
    }

    return {
      mount: mount,
      setData: setData,
      render: render
    };
  })();

  global.StatsPanel = StatsPanel;
})(window);

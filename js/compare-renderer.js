/**
 * compare-renderer.js
 * 对比模式渲染层：左侧二分查找、右侧哈希查找、下方统计对比与柱状图。
 *
 * 两侧共用同一个同步帧号：每推进一帧，左右各自读取自己的下一步；
 * 先结束的一侧停在终态，另一侧继续推进。所有数值通过 textContent 写入。
 */
(function (global) {
  'use strict';

  var els = {};
  var binaryArray = null;
  var binaryCells = [];
  var lastBinaryMid = null;
  var hashRows = [];
  var hashStructureKey = null;
  var preparedModel = null;

  function setTone(element, tone) {
    if (element) {
      element.setAttribute('data-tone', tone);
    }
  }

  function resultClass(element, tone) {
    if (!element) {
      return;
    }
    element.classList.toggle('is-found', tone === 'found');
    element.classList.toggle('is-failed', tone === 'failed');
  }

  function describeCell(index, value, step) {
    var parts = ['下标 ' + index, '值 ' + value];
    if (step) {
      if (step.mid === index) {
        parts.push(step.type === 'found' ? '命中目标' : '当前比较的中点');
      } else if (index >= step.low && index <= step.high) {
        parts.push('位于待查找区间');
      } else {
        parts.push('已被排除');
      }
    }
    return parts.join('，');
  }

  function buildBinaryCells(array) {
    var fragment = document.createDocumentFragment();
    binaryCells = [];

    array.forEach(function (value, index) {
      var wrap = document.createElement('div');
      wrap.className = 'cell-wrap';
      wrap.setAttribute('role', 'listitem');
      wrap.setAttribute('aria-label', describeCell(index, value, null));

      var stack = document.createElement('div');
      stack.className = 'pointer-stack';
      stack.setAttribute('aria-hidden', 'true');

      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = String(value);

      var indexEl = document.createElement('span');
      indexEl.className = 'cell-index';
      indexEl.textContent = String(index);

      wrap.appendChild(stack);
      wrap.appendChild(cell);
      wrap.appendChild(indexEl);
      fragment.appendChild(wrap);

      binaryCells.push({
        wrap: wrap,
        stack: stack,
        cell: cell,
        pointerSignature: ''
      });
    });

    els.binaryTrack.replaceChildren(fragment);
    binaryArray = array;
    lastBinaryMid = null;
  }

  function pointerLabelsFor(index, step) {
    if (!step || step.low > step.high) {
      return [];
    }
    var labels = [];
    if (step.low === index) {
      labels.push({ name: 'low', className: 'pointer-low' });
    }
    if (step.mid === index) {
      labels.push({
        name: 'mid',
        className: step.type === 'found' ? 'pointer-mid pointer-found' : 'pointer-mid'
      });
    }
    if (step.high === index) {
      labels.push({ name: 'high', className: 'pointer-high' });
    }
    return labels;
  }

  function updateBinaryPointers(ref, labels, step) {
    var signature = labels.map(function (item) {
      return item.name + ':' + item.className;
    }).join('|');
    if (ref.pointerSignature === signature) {
      return;
    }
    ref.pointerSignature = signature;
    ref.stack.replaceChildren();

    labels.forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'pointer ' + item.className;
      chip.textContent = item.name;
      chip.title = item.name + ' = ' + step[item.name];
      ref.stack.appendChild(chip);
    });
  }

  function scrollBinaryMidIntoView(step) {
    if (!step || !els.binaryViewport) {
      return;
    }
    if (step.type === 'init') {
      lastBinaryMid = null;
      els.binaryViewport.scrollLeft = 0;
      return;
    }
    if (step.mid === null || step.mid === lastBinaryMid) {
      return;
    }
    var ref = binaryCells[step.mid];
    if (!ref) {
      return;
    }
    lastBinaryMid = step.mid;

    var viewRect = els.binaryViewport.getBoundingClientRect();
    var cellRect = ref.wrap.getBoundingClientRect();
    if (cellRect.left >= viewRect.left && cellRect.right <= viewRect.right) {
      return;
    }
    var delta = (cellRect.left - viewRect.left) -
      (els.binaryViewport.clientWidth - cellRect.width) / 2;
    els.binaryViewport.scrollLeft += delta;
  }

  function renderBinary(step, stepIndex, totalSteps) {
    binaryArray.forEach(function (value, index) {
      var ref = binaryCells[index];
      if (!ref) {
        return;
      }
      var isActive = index >= step.low && index <= step.high;
      var isCompared = step.mid === index && step.type !== 'found';
      var isFound = step.mid === index && step.type === 'found';

      ref.cell.classList.toggle('is-active', isActive);
      ref.cell.classList.toggle('is-excluded', !isActive);
      ref.cell.classList.toggle('is-compared', isCompared);
      ref.cell.classList.toggle('is-found', isFound);
      ref.wrap.classList.toggle('is-highlighted', isCompared);
      ref.wrap.classList.toggle('is-found', isFound);
      ref.wrap.setAttribute('aria-label', describeCell(index, value, step));
      updateBinaryPointers(ref, pointerLabelsFor(index, step), step);
    });

    var tone = 'idle';
    if (step.type === 'found') {
      tone = 'found';
    } else if (step.type === 'not-found') {
      tone = 'failed';
    } else if (step.type === 'compare') {
      tone = 'active';
    }
    setTone(els.binaryStatus, tone);
    els.binaryStatusMessage.textContent = step.message;
    els.binaryStatusCount.textContent = '比较 ' + step.comparisons + ' 次';
    els.binaryStep.textContent = (stepIndex + 1) + ' / ' + totalSteps;
    els.binaryInterval.textContent = step.low <= step.high
      ? '[' + step.low + ', ' + step.high + ']'
      : '空';

    var result = '—';
    var resultTone = '';
    if (step.type === 'found') {
      result = '下标 ' + step.mid;
      resultTone = 'found';
    } else if (step.type === 'not-found') {
      result = '不存在';
      resultTone = 'failed';
    } else if (step.type === 'compare') {
      result = '查找中';
    }
    els.binaryResult.textContent = result;
    resultClass(els.binaryResult, resultTone);

    scrollBinaryMidIntoView(step);
  }

  function structureKeyFor(step) {
    return step.bucketCount + '|' + step.buckets.map(function (chain) {
      return chain.join(',');
    }).join(';');
  }

  function buildHashRows(step) {
    var fragment = document.createDocumentFragment();
    hashRows = [];

    step.buckets.forEach(function (chain, bucketIndex) {
      var row = document.createElement('div');
      row.className = 'bucket-row';
      row.setAttribute('role', 'listitem');
      row.setAttribute('data-bucket', String(bucketIndex));

      var indexEl = document.createElement('span');
      indexEl.className = 'bucket-index';
      indexEl.textContent = '[' + bucketIndex + ']';

      var connector = document.createElement('span');
      connector.className = 'bucket-connector';
      connector.setAttribute('aria-hidden', 'true');
      connector.textContent = '→';

      var chainEl = document.createElement('div');
      chainEl.className = 'bucket-chain';

      var nodes = [];
      chain.forEach(function (key, nodeIndex) {
        if (nodeIndex > 0) {
          var arrow = document.createElement('span');
          arrow.className = 'chain-arrow';
          arrow.setAttribute('aria-hidden', 'true');
          arrow.textContent = '→';
          chainEl.appendChild(arrow);
        }
        var node = document.createElement('span');
        node.className = 'chain-node';
        node.textContent = String(key);
        node.title = '关键字 ' + key + '，桶 ' + bucketIndex + ' 的第 ' +
          (nodeIndex + 1) + ' 个节点';
        chainEl.appendChild(node);
        nodes.push(node);
      });

      if (chain.length === 0) {
        var empty = document.createElement('span');
        empty.className = 'chain-empty';
        empty.textContent = '空桶';
        chainEl.appendChild(empty);
      }

      var flagEl = document.createElement('span');
      flagEl.className = 'bucket-flag';
      flagEl.hidden = true;
      chainEl.appendChild(flagEl);

      row.appendChild(indexEl);
      row.appendChild(connector);
      row.appendChild(chainEl);
      fragment.appendChild(row);

      hashRows.push({
        row: row,
        chainEl: chainEl,
        flagEl: flagEl,
        nodes: nodes
      });
    });

    els.hashList.replaceChildren(fragment);
    hashStructureKey = structureKeyFor(step);
  }

  function hashFlagFor(step, active) {
    if (!active) {
      return '';
    }
    if (step.type === 'found') {
      return '命中';
    }
    if (step.type === 'not-found') {
      return '未命中';
    }
    if (step.type === 'search-compare') {
      return '比较中';
    }
    return '查找中';
  }

  function renderHash(step, stepIndex, totalSteps) {
    hashRows.forEach(function (ref, bucketIndex) {
      var chain = step.buckets[bucketIndex] || [];
      var isActiveBucket = step.bucket === bucketIndex;
      var isFound = isActiveBucket && step.type === 'found';
      var isFailed = isActiveBucket && step.type === 'not-found';
      var isComparing = isActiveBucket && step.type === 'search-compare';

      ref.row.classList.toggle('is-active', isActiveBucket && !isFound && !isFailed);
      ref.row.classList.toggle('is-found', isFound);
      ref.row.classList.toggle('is-failed', isFailed);
      ref.row.classList.toggle('is-conflict', false);
      ref.row.classList.toggle('is-comparing', isComparing);

      ref.nodes.forEach(function (node, nodeIndex) {
        var isActiveNode = isActiveBucket && step.nodeIndex === nodeIndex;
        var nodeFound = isActiveNode && step.type === 'found';
        node.classList.toggle('is-active', isActiveNode && !nodeFound);
        node.classList.toggle('is-found', nodeFound);
        node.classList.toggle('is-new', false);
        node.setAttribute('aria-label', '桶 ' + bucketIndex + ' 中的关键字 ' +
          chain[nodeIndex] + '，第 ' + (nodeIndex + 1) + ' 个节点' +
          (isActiveNode ? (nodeFound ? '，命中目标' : '，当前正在比较') : ''));
      });

      var label = '桶 ' + bucketIndex + '：' +
        (chain.length === 0 ? '空桶' : chain.join(' → ') + '，共 ' + chain.length + ' 个元素');
      if (isActiveBucket) {
        label += isFound ? '，命中目标' : (isFailed ? '，目标不在此链' : '，当前高亮');
      }
      ref.row.setAttribute('aria-label', label);

      var flag = hashFlagFor(step, isActiveBucket);
      ref.flagEl.hidden = flag === '';
      ref.flagEl.textContent = flag;
      ref.flagEl.classList.toggle('is-found', isFound);
      ref.flagEl.classList.toggle('is-failed', isFailed);
    });

    var isFound = step.type === 'found';
    var isFailed = step.type === 'not-found';
    setTone(els.hashStatus, isFound ? 'found' : (isFailed ? 'failed' : 'active'));
    els.hashStatusMessage.textContent = step.message;
    els.hashStatusCount.textContent = '比较 ' + step.comparisons + ' 次';
    els.hashStep.textContent = (stepIndex + 1) + ' / ' + totalSteps;
    els.hashBucketReadout.textContent = 'm = ' + step.bucketCount;

    var result = '—';
    var resultTone = '';
    if (isFound) {
      result = '桶 ' + step.bucket + ' · 第 ' + (step.nodeIndex + 1) + ' 个';
      resultTone = 'found';
    } else if (isFailed) {
      result = '不存在';
      resultTone = 'failed';
    } else if (step.type === 'search-compare') {
      result = '查找中';
    } else {
      result = '定位桶 ' + step.bucket;
    }
    els.hashResult.textContent = result;
    resultClass(els.hashResult, resultTone);

    scrollHashIntoView();
  }

  function scrollHashIntoView() {
    if (!els.hashViewport) {
      return;
    }
    var activeRow = null;
    hashRows.forEach(function (ref) {
      if (ref.row.classList.contains('is-active') ||
          ref.row.classList.contains('is-found') ||
          ref.row.classList.contains('is-failed')) {
        activeRow = ref.row;
      }
    });
    if (!activeRow || els.hashViewport.clientHeight === 0) {
      return;
    }
    var viewRect = els.hashViewport.getBoundingClientRect();
    var rowRect = activeRow.getBoundingClientRect();
    if (rowRect.top < viewRect.top) {
      els.hashViewport.scrollTop -= viewRect.top - rowRect.top + 6;
    } else if (rowRect.bottom > viewRect.bottom) {
      els.hashViewport.scrollTop += rowRect.bottom - viewRect.bottom + 6;
    }
  }

  function renderBars(model, binaryComparisons, hashComparisons) {
    var scale = Math.max(model.binary.comparisons, model.hash.comparisons, 1);
    var binaryWidth = (binaryComparisons / scale) * 100;
    var hashWidth = (hashComparisons / scale) * 100;
    els.barBinary.style.width = binaryWidth.toFixed(2) + '%';
    els.barHash.style.width = hashWidth.toFixed(2) + '%';
    els.barBinaryValue.textContent = String(binaryComparisons);
    els.barHashValue.textContent = String(hashComparisons);
  }

  function renderStats(model, frameIndex, binaryStep, hashStep) {
    var binaryComparisons = binaryStep ? binaryStep.comparisons : 0;
    var hashComparisons = hashStep ? hashStep.comparisons : 0;

    els.statBinaryComparisons.textContent = String(binaryComparisons);
    els.statHashComparisons.textContent = String(hashComparisons);
    renderBars(model, binaryComparisons, hashComparisons);

    var complete = frameIndex >= model.frames - 1;
    if (complete) {
      var bothFound = model.binary.found && model.hash.found;
      var neitherFound = !model.binary.found && !model.hash.found;
      els.statVerdict.textContent = '对比完成';
      setTone(els.statVerdict, bothFound ? 'found' : (neitherFound ? 'failed' : 'active'));
      els.conclusion.textContent = global.CompareModel.conclusionFor(model);
      els.conclusion.setAttribute('data-tone', 'complete');
    } else if (frameIndex > 0) {
      els.statVerdict.textContent = '同步播放中';
      setTone(els.statVerdict, 'active');
      els.conclusion.textContent = '一次「播放」同时驱动左右两侧各自推进；两侧步骤数不同，' +
        '先结束的一侧会停在终态。';
      els.conclusion.setAttribute('data-tone', 'running');
    } else {
      els.statVerdict.textContent = '准备就绪';
      setTone(els.statVerdict, 'idle');
      els.conclusion.textContent = '点击「播放」或「单步」开始：同一组数据、同一个目标值，' +
        '左右两侧同步推进并实时累计比较次数。';
      els.conclusion.setAttribute('data-tone', 'idle');
    }
  }

  function prepare(model) {
    if (!els.binaryTrack || !els.hashList) {
      return;
    }
    preparedModel = model;
    buildBinaryCells(model.dataset.sorted);
    buildHashRows(model.hash.steps[0]);

    els.targetMeta.textContent = String(model.dataset.target);
    els.sizeMeta.textContent = String(model.dataset.keys.length);
    els.bucketMeta.textContent = String(model.hash.bucketCount);
    if (els.hashBucketMeta) {
      els.hashBucketMeta.textContent = 'm = ' + model.hash.bucketCount;
    }

    els.binaryBuild.textContent = '排序 n = ' + model.dataset.keys.length +
      ' · 约 ' + model.binary.build.estimate + ' 次比较（n log₂n 估算）';
    var hashBuild = '建表 ' + model.hash.build.insertions + ' 次插入 · m = ' +
      model.hash.bucketCount + ' · ' + model.hash.build.conflicts + ' 次冲突';
    if (model.hash.build.rehashes > 0) {
      hashBuild += ' · ' + model.hash.build.rehashes + ' 次扩容';
    }
    els.hashBuild.textContent = hashBuild;

    els.statBinaryResult.textContent = '—';
    els.statHashResult.textContent = '—';
    resultClass(els.statBinaryResult, '');
    resultClass(els.statHashResult, '');
  }

  function render(model, frameIndex) {
    if (!els.binaryTrack || !model) {
      return;
    }
    if (model !== preparedModel) {
      prepare(model);
    }

    var frame = global.CompareModel.frameAt(model, frameIndex);
    var binaryIndex = Math.min(frameIndex, model.binary.steps.length - 1);
    var hashIndex = Math.min(frameIndex, model.hash.steps.length - 1);

    renderBinary(frame.binaryStep, binaryIndex, model.binary.steps.length);
    renderHash(frame.hashStep, hashIndex, model.hash.steps.length);
    renderStats(model, frameIndex, frame.binaryStep, frame.hashStep);

    els.statBinaryResult.textContent = els.binaryResult.textContent;
    els.statHashResult.textContent = els.hashResult.textContent;
    resultClass(els.statBinaryResult,
      els.binaryResult.classList.contains('is-found') ? 'found'
        : (els.binaryResult.classList.contains('is-failed') ? 'failed' : ''));
    resultClass(els.statHashResult,
      els.hashResult.classList.contains('is-found') ? 'found'
        : (els.hashResult.classList.contains('is-failed') ? 'failed' : ''));
  }

  global.CompareRenderer = {
    mount: function (elements) {
      els = elements;
    },
    prepare: prepare,
    render: render
  };
})(typeof window !== 'undefined' ? window : globalThis);

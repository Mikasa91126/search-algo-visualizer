/**
 * hash-renderer.js
 * 哈希表演示的渲染层：桶数组、冲突链、哈希计算卡片、装载因子、统计与轨迹。
 *
 * 渲染完全由 hash-table.js 生成的步骤快照驱动：
 * - 桶结构变化（插入、扩容）时重建行，其余步骤只切换状态类；
 * - 当前桶会自动滚入可视区域；
 * - 所有用户输入与数值都通过 textContent 写入。
 */
(function (global) {
  'use strict';

  var ACTIVE_NODE_TYPES = {
    insert: true,
    'insert-conflict': true,
    'search-hash': true,
    'search-compare': true,
    found: true
  };

  function percent(value) {
    return Math.min(value, 1) * 100;
  }

  function structureKeyFor(step) {
    return step.bucketCount + '|' + step.buckets.map(function (chain) {
      return chain.join(',');
    }).join(';');
  }

  /* ------------------------------------------------------------------ *
   * 桶与冲突链
   * ------------------------------------------------------------------ */

  var BucketRenderer = (function () {
    var listEl = null;
    var viewportEl = null;
    var els = {};
    var rows = [];
    var renderedStructureKey = null;
    var lastScrollKey = null;

    function mount(elements) {
      listEl = elements.list;
      viewportEl = elements.viewport;
      els = elements;
    }

    function buildRows(step) {
      var fragment = document.createDocumentFragment();
      rows = [];

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
          node.title = '关键字 ' + key + '，位于桶 ' + bucketIndex + ' 的第 ' +
            (nodeIndex + 1) + ' 个节点';
          chainEl.appendChild(node);
          nodes.push(node);
        });

        var emptyEl = null;
        if (chain.length === 0) {
          emptyEl = document.createElement('span');
          emptyEl.className = 'chain-empty';
          emptyEl.textContent = '空桶';
          chainEl.appendChild(emptyEl);
        }

        var flagEl = document.createElement('span');
        flagEl.className = 'bucket-flag';
        flagEl.hidden = true;
        chainEl.appendChild(flagEl);

        row.appendChild(indexEl);
        row.appendChild(connector);
        row.appendChild(chainEl);
        fragment.appendChild(row);

        rows.push({
          row: row,
          indexEl: indexEl,
          chainEl: chainEl,
          emptyEl: emptyEl,
          flagEl: flagEl,
          nodes: nodes
        });
      });

      listEl.replaceChildren(fragment);
      renderedStructureKey = structureKeyFor(step);
      lastScrollKey = null;
    }

    function describeRow(bucketIndex, chain, activeText) {
      var text = '桶 ' + bucketIndex + '：' +
        (chain.length === 0 ? '空桶' : chain.join(' → ') + '，共 ' + chain.length + ' 个元素');
      return activeText ? text + '，' + activeText : text;
    }

    function flagFor(step, isActiveBucket) {
      if (!isActiveBucket) {
        return '';
      }
      switch (step.type) {
        case 'insert-hash':
          return '定位';
        case 'insert':
          return '挂链';
        case 'insert-conflict':
          return '冲突 · 挂链';
        case 'search-hash':
          return '查找中';
        case 'search-compare':
          return '比较中';
        case 'found':
          return '命中';
        case 'not-found':
          return '未命中';
        default:
          return '';
      }
    }

    function updateRows(step) {
      rows.forEach(function (ref, bucketIndex) {
        var chain = step.buckets[bucketIndex] || [];
        var isActiveBucket = step.bucket === bucketIndex && step.bucket !== null;
        var isFound = isActiveBucket && step.type === 'found';
        var isFailed = isActiveBucket && step.type === 'not-found';
        var isConflict = isActiveBucket && step.type === 'insert-conflict';
        var isComparing = isActiveBucket && step.type === 'search-compare';

        ref.row.classList.toggle('is-active', isActiveBucket && !isFound && !isFailed);
        ref.row.classList.toggle('is-found', isFound);
        ref.row.classList.toggle('is-failed', isFailed);
        ref.row.classList.toggle('is-conflict', isConflict);
        ref.row.classList.toggle('is-comparing', isComparing);

        ref.nodes.forEach(function (node, nodeIndex) {
          var isActiveNode = isActiveBucket &&
            step.nodeIndex === nodeIndex &&
            Boolean(ACTIVE_NODE_TYPES[step.type]);
          var nodeFound = isActiveNode && step.type === 'found';
          var nodeNew = isActiveNode &&
            (step.type === 'insert' || step.type === 'insert-conflict');

          node.classList.toggle('is-active', isActiveNode && !nodeFound);
          node.classList.toggle('is-found', nodeFound);
          node.classList.toggle('is-new', nodeNew);
          var suffix = isActiveNode ?
            (nodeFound ? '，命中目标' : '，当前正在处理') : '';
          node.setAttribute('aria-label', '桶 ' + bucketIndex + ' 中的关键字 ' +
            chain[nodeIndex] + '，第 ' + (nodeIndex + 1) + ' 个节点' + suffix);
        });

        var activeText = '';
        if (isActiveBucket) {
          activeText = isFound ? '匹配目标' : (isFailed ? '目标不在此链' : '当前高亮');
        }
        ref.row.setAttribute('aria-label', describeRow(bucketIndex, chain, activeText));

        var flag = flagFor(step, isActiveBucket);
        ref.flagEl.hidden = flag === '';
        ref.flagEl.textContent = flag;
        ref.flagEl.classList.toggle('is-found', isFound);
        ref.flagEl.classList.toggle('is-failed', isFailed);
      });
    }

    function updateMeta(step, totalKeys) {
      if (els.tableMeta) {
        els.tableMeta.textContent = 'm = ' + step.bucketCount;
      }
      if (els.storedMeta) {
        els.storedMeta.textContent = '已存 ' + step.insertedCount +
          (totalKeys ? ' / ' + totalKeys : '') + ' 个';
      }

      if (els.loadFactor) {
        els.loadFactor.textContent = step.loadFactor.toFixed(2);
      }
      if (els.loadBar) {
        els.loadBar.style.width = percent(step.loadFactor).toFixed(2) + '%';
        els.loadBar.classList.toggle('is-high', step.loadFactor > 0.75 && step.loadFactor <= 1);
        els.loadBar.classList.toggle('is-over', step.loadFactor > 1);
      }
      if (els.loadHint) {
        var over = step.type === 'rehash-needed' || step.loadFactor > 0.75;
        els.loadHint.classList.toggle('is-over', over);
        if (step.type === 'rehash-needed') {
          els.loadHint.textContent = '装载因子 ' + step.loadFactor.toFixed(2) +
            ' 超过 0.75，下一步将扩容并 rehash。';
        } else if (step.type === 'rehash') {
          els.loadHint.textContent = '扩容完成，装载因子已回落到 ' +
            step.loadFactor.toFixed(2) + '。';
        } else if (over) {
          els.loadHint.textContent = '装载因子已超过 0.75，即将触发扩容。';
        } else {
          els.loadHint.textContent = '扩容阈值 α = 0.75，超过后自动触发 rehash。';
        }
      }
    }

    function calcFor(step) {
      if (step.type === 'init') {
        return {
          key: 'm = ' + step.bucketCount,
          formula: 'h(k) = k mod ' + step.bucketCount,
          bucket: '空表',
          tone: '',
          note: '初始化 ' + step.bucketCount + ' 个空桶，等待依次插入关键字。'
        };
      }
      if (step.type === 'rehash-needed') {
        return {
          key: 'α = ' + step.loadFactor.toFixed(2),
          formula: step.loadFactor.toFixed(2) + ' > 0.75',
          bucket: '准备扩容',
          tone: 'is-warn',
          note: '桶数将从 ' + step.oldBucketCount + ' 扩到 ' + step.nextBucketCount +
            '，下一步演示全部关键字的重新分布。'
        };
      }
      if (step.type === 'rehash') {
        return {
          key: 'm：' + step.oldBucketCount + ' → ' + step.bucketCount,
          formula: 'h(k) = k mod ' + step.bucketCount,
          bucket: '重新分布',
          tone: 'is-active',
          note: '扩容完成，' + step.insertedCount + ' 个关键字重新计算桶位并挂链。'
        };
      }

      var note = '';
      switch (step.type) {
        case 'insert-hash':
          note = '插入前先算出桶位；下一步把关键字挂到目标桶的链上。';
          break;
        case 'insert':
          note = '目标桶为空，关键字成为链首节点。';
          break;
        case 'insert-conflict':
          note = '目标桶已有元素，冲突通过追加到链尾解决。';
          break;
        case 'search-hash':
          note = '查找先定位桶，接下来沿冲突链逐个比较。';
          break;
        case 'search-compare':
          note = '当前节点不匹配，继续沿链表向后。';
          break;
        case 'found':
          note = '链内比较命中，查找结束。';
          break;
        case 'not-found':
          note = '链表已经遍历完，目标不在哈希表中。';
          break;
        default:
          note = '';
      }

      var tone = '';
      if (step.type === 'found') {
        tone = 'is-found';
      } else if (step.type === 'not-found') {
        tone = 'is-failed';
      } else if (step.type === 'insert-conflict') {
        tone = 'is-warn';
      } else if (step.phase === 'search') {
        tone = 'is-active';
      } else if (step.type === 'insert-hash' || step.type === 'insert') {
        tone = 'is-active';
      }

      return {
        key: 'k = ' + step.key,
        formula: step.key + ' mod ' + step.bucketCount + ' = ' + step.bucket,
        bucket: '桶 ' + step.bucket,
        tone: tone,
        note: note
      };
    }

    function updateCalc(step) {
      var calc = calcFor(step);
      if (els.calcKey) {
        els.calcKey.textContent = calc.key;
      }
      if (els.calcFormula) {
        els.calcFormula.textContent = calc.formula;
      }
      if (els.calcBucket) {
        els.calcBucket.textContent = calc.bucket;
        els.calcBucket.className = 'calc-chip calc-bucket' + (calc.tone ? ' ' + calc.tone : '');
      }
      if (els.calcNote) {
        els.calcNote.textContent = calc.note;
      }
    }

    function scrollActiveIntoView(step) {
      if (!viewportEl) {
        return;
      }
      var activeRow = null;
      rows.forEach(function (ref) {
        if (ref.row.classList.contains('is-active') ||
            ref.row.classList.contains('is-found') ||
            ref.row.classList.contains('is-failed')) {
          activeRow = ref.row;
        }
      });
      if (!activeRow) {
        return;
      }
      var scrollKey = renderedStructureKey + ':' + step.bucket + ':' + step.type;
      if (scrollKey === lastScrollKey) {
        return;
      }
      lastScrollKey = scrollKey;

      if (viewportEl.clientHeight === 0) {
        return;
      }
      var viewRect = viewportEl.getBoundingClientRect();
      var rowRect = activeRow.getBoundingClientRect();
      if (rowRect.top < viewRect.top) {
        viewportEl.scrollTop -= viewRect.top - rowRect.top + 8;
      } else if (rowRect.bottom > viewRect.bottom) {
        viewportEl.scrollTop += rowRect.bottom - viewRect.bottom + 8;
      }
    }

    function render(step, totalKeys) {
      if (!listEl || !step) {
        return;
      }
      var key = structureKeyFor(step);
      if (key !== renderedStructureKey) {
        buildRows(step);
      }
      updateRows(step);
      updateMeta(step, totalKeys);
      updateCalc(step);
      scrollActiveIntoView(step);
    }

    return {
      mount: mount,
      render: render
    };
  })();

  /* ------------------------------------------------------------------ *
   * 哈希查找轨迹
   * ------------------------------------------------------------------ */

  var HashTracePanel = (function () {
    var listEl = null;
    var countEl = null;
    var items = [];
    var cachedSteps = null;
    var selectHandler = null;

    function mount(elements, onSelect) {
      listEl = elements.list;
      countEl = elements.count;
      selectHandler = onSelect;

      listEl.addEventListener('click', function (event) {
        var button = event.target.closest('button[data-step]');
        if (!button) {
          return;
        }
        var index = Number(button.getAttribute('data-step'));
        if (selectHandler && Number.isInteger(index)) {
          selectHandler(index);
        }
      });
    }

    function build(steps) {
      var fragment = document.createDocumentFragment();
      items = [];

      steps.forEach(function (step, index) {
        var li = document.createElement('li');
        var button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-step', String(index));
        button.title = '跳到第 ' + (index + 1) + ' 步';

        var stepNo = document.createElement('span');
        stepNo.className = 'trace-step';
        stepNo.textContent = String(index + 1).padStart(2, '0');

        var message = document.createElement('span');
        message.className = 'trace-message';
        message.textContent = step.message;

        button.appendChild(stepNo);
        button.appendChild(message);
        li.appendChild(button);
        fragment.appendChild(li);
        items.push({ li: li, button: button });
      });

      listEl.replaceChildren(fragment);
      countEl.textContent = '共 ' + steps.length + ' 步';
      cachedSteps = steps;
    }

    function render(steps, currentIndex) {
      if (!listEl || !steps) {
        return;
      }
      if (steps !== cachedSteps) {
        build(steps);
      }

      items.forEach(function (item, index) {
        item.li.classList.toggle('is-current', index === currentIndex);
        item.li.classList.toggle('is-past', index < currentIndex);
        if (index === currentIndex) {
          item.button.setAttribute('aria-current', 'step');
        } else {
          item.button.removeAttribute('aria-current');
        }
      });

      var current = items[currentIndex];
      if (current) {
        var listRect = listEl.getBoundingClientRect();
        var itemRect = current.li.getBoundingClientRect();
        if (itemRect.top < listRect.top) {
          listEl.scrollTop -= listRect.top - itemRect.top;
        } else if (itemRect.bottom > listRect.bottom) {
          listEl.scrollTop += itemRect.bottom - listRect.bottom;
        }
      }
    }

    return {
      mount: mount,
      render: render
    };
  })();

  /* ------------------------------------------------------------------ *
   * 哈希统计面板
   * ------------------------------------------------------------------ */

  var HashStatsPanel = (function () {
    var els = {};

    function mount(elements) {
      els = elements;
    }

    function render(step) {
      if (!els.comparisons) {
        return;
      }

      var comparisons = step ? step.comparisons : 0;
      var loadFactor = step ? step.loadFactor : 0;
      var rehashes = step ? step.rehashCount : 0;
      var bucketCount = step ? step.bucketCount : 0;
      var maxChain = step && step.buckets.length ?
        Math.max.apply(null, step.buckets.map(function (chain) { return chain.length; })) : 0;

      els.comparisons.textContent = String(comparisons);
      els.load.textContent = loadFactor.toFixed(2);
      els.rehash.textContent = String(rehashes);
      els.buckets.textContent = String(bucketCount);
      els.chain.textContent = String(maxChain);

      var verdict = '准备就绪';
      var tone = 'idle';
      var result = '—';

      if (step) {
        if (step.type === 'found') {
          verdict = '已找到';
          tone = 'found';
          result = '桶 ' + step.bucket + ' · 第 ' + (step.nodeIndex + 1) + ' 个';
        } else if (step.type === 'not-found') {
          verdict = '未找到';
          tone = 'failed';
          result = '不存在';
        } else if (step.type === 'search-hash' || step.type === 'search-compare') {
          verdict = '查找中';
          tone = 'active';
          result = step.type === 'search-hash' ?
            '定位桶 ' + step.bucket :
            '比较第 ' + (step.nodeIndex + 1) + ' 个';
        } else if (step.type === 'rehash-needed') {
          verdict = '即将扩容';
          tone = 'active';
          result = 'α > 0.75';
        } else if (step.type === 'rehash') {
          verdict = '扩容完成';
          tone = 'active';
          result = '扩容 ' + step.oldBucketCount + ' → ' + step.bucketCount;
        } else if (step.type !== 'init') {
          verdict = '建表中';
          tone = 'active';
          result = '已存 ' + step.insertedCount;
        }
      }

      els.verdict.textContent = verdict;
      els.verdict.setAttribute('data-tone', tone);
      els.result.textContent = result;
      els.result.classList.toggle('is-found', tone === 'found');
      els.result.classList.toggle('is-failed', tone === 'failed');
      els.result.classList.toggle('is-small', result.length > 4);
      els.load.classList.toggle('is-failed', loadFactor > 1);
    }

    return {
      mount: mount,
      render: render
    };
  })();

  global.HashBucketRenderer = BucketRenderer;
  global.HashTracePanel = HashTracePanel;
  global.HashStatsPanel = HashStatsPanel;
})(window);

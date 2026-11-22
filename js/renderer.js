/**
 * renderer.js
 * 渲染层：把当前步骤映射为数组方块、low / mid / high 指针与查找轨迹。
 *
 * 设计要点：
 * - 数组方块只在数据变化时重建，单步播放时只切换状态类，保证过渡自然；
 * - 指针浮动在每个方块上方，同一格出现多个指针时会纵向堆叠；
 * - 所有文案通过 textContent 写入，避免把用户输入当作 HTML 解析。
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 数组与指针渲染
   * ------------------------------------------------------------------ */

  var ArrayRenderer = (function () {
    var trackEl = null;
    var viewportEl = null;
    var frameEl = null;
    var renderedArray = null;
    var cellRefs = [];
    var lastMid = null;

    /**
     * @param {{track: HTMLElement, viewport: HTMLElement, frame: HTMLElement}} elements
     */
    function mount(elements) {
      trackEl = elements.track;
      viewportEl = elements.viewport;
      frameEl = elements.frame;
    }

    function describeCell(index, value, step) {
      var parts = ['下标 ' + index, '值 ' + value];
      if (step) {
        if (step.mid === index) {
          parts.push(step.type === 'found' ? '命中目标' : '当前比较的中点');
        } else if (index >= step.low && index <= step.high) {
          parts.push('位于待查找区间');
        } else if (step.type !== 'init') {
          parts.push('已被排除');
        }
      }
      return parts.join('，');
    }

    function buildCells(array) {
      var fragment = document.createDocumentFragment();
      cellRefs = [];

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

        cellRefs.push({
          wrap: wrap,
          stack: stack,
          cell: cell,
          indexEl: indexEl,
          pointerSignature: ''
        });
      });

      trackEl.replaceChildren(fragment);
      renderedArray = array;
      lastMid = null;
    }

    function pointerLabelsFor(index, step) {
      if (!step || step.low > step.high) {
        // 区间为空时不再悬浮指针，避免让「low 指向某个方块」产生歧义；
        // low / high 的具体数值仍会显示在状态说明与统计面板中。
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

    function updatePointers(ref, labels, step) {
      var signature = labels.map(function (item) { return item.name + ':' + item.className; }).join('|');
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

    function updateCells(array, step) {
      array.forEach(function (value, index) {
        var ref = cellRefs[index];
        if (!ref) {
          return;
        }

        var isActive = Boolean(step) && index >= step.low && index <= step.high;
        var isCompared = Boolean(step) && step.mid === index && step.type !== 'found';
        var isFound = Boolean(step) && step.mid === index && step.type === 'found';

        ref.cell.classList.toggle('is-active', isActive);
        ref.cell.classList.toggle('is-excluded', Boolean(step) && !isActive);
        ref.cell.classList.toggle('is-compared', isCompared);
        ref.cell.classList.toggle('is-found', isFound);
        ref.wrap.classList.toggle('is-highlighted', isCompared);
        ref.wrap.classList.toggle('is-found', isFound);
        ref.wrap.setAttribute('aria-label', describeCell(index, value, step));

        updatePointers(ref, pointerLabelsFor(index, step), step);
      });

      if (frameEl) {
        frameEl.classList.toggle('is-failed', Boolean(step) && step.type === 'not-found');
      }
    }

    /**
     * 把 mid 所在方块滚动到可视区域中央，数据规模较大时也能跟上动画。
     */
    function scrollMidIntoView(step) {
      if (!step) {
        return;
      }
      if (step.type === 'init') {
        // 回到初始状态时把数组滚回最左侧，避免上一轮停在数组尾部。
        lastMid = null;
        if (viewportEl && viewportEl.scrollLeft !== 0) {
          viewportEl.scrollLeft = 0;
        }
        return;
      }
      if (step.mid === null || step.mid === lastMid) {
        return;
      }
      var ref = cellRefs[step.mid];
      if (!ref || !viewportEl) {
        return;
      }
      lastMid = step.mid;

      var viewRect = viewportEl.getBoundingClientRect();
      var cellRect = ref.wrap.getBoundingClientRect();
      var outside = cellRect.left < viewRect.left || cellRect.right > viewRect.right;
      if (!outside) {
        return;
      }

      var reduced = global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var delta = (cellRect.left - viewRect.left) -
        (viewportEl.clientWidth - cellRect.width) / 2;

      // 距离较远时直接跳转，避免大数组里平滑滚动迟迟追不上动画。
      var instant = reduced || Math.abs(delta) > viewportEl.clientWidth * 1.5;
      viewportEl.scrollTo({
        left: viewportEl.scrollLeft + delta,
        behavior: instant ? 'auto' : 'smooth'
      });
    }

    /**
     * 渲染一个步骤。
     * @param {number[]} array 当前数组（同一份引用表示同一组数据）
     * @param {object}   step  当前步骤
     */
    function render(array, step) {
      if (!trackEl || !array) {
        return;
      }
      if (array !== renderedArray) {
        buildCells(array);
      }
      updateCells(array, step);
      scrollMidIntoView(step);
    }

    return {
      mount: mount,
      render: render
    };
  })();

  /* ------------------------------------------------------------------ *
   * 查找轨迹渲染
   * ------------------------------------------------------------------ */

  var TracePanel = (function () {
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
        // 只滚动轨迹列表自身，避免自动播放时把整个页面带着上下跳。
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

  global.ArrayRenderer = ArrayRenderer;
  global.TracePanel = TracePanel;
})(window);

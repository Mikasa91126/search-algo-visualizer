/**
 * main.js
 * 应用入口：生成数组、维护当前数据与步骤、绑定输入与播放控件。
 *
 * 页面状态只有一份：
 *   array   当前升序数组
 *   target  当前目标值
 *   steps   二分查找预生成的步骤序列
 *   index   当前播放到的步骤（由 controls.js 维护）
 * 所有视图刷新都走 render()，避免算法、动画和 DOM 状态各自为政。
 */
(function () {
  'use strict';

  var DEFAULT_TARGET_HINT = '输入任意整数；也可以输入数组中不存在的值，观察查找失败的过程。';
  var MIN_SIZE = 8;
  var MAX_SIZE = 128;

  var els = {
    size: document.getElementById('size'),
    sizeValue: document.getElementById('size-value'),
    target: document.getElementById('target'),
    targetHint: document.getElementById('target-hint'),
    randomTarget: document.getElementById('random-target'),
    speedGroup: document.getElementById('speed-group'),
    regenerate: document.getElementById('regenerate'),
    reset: document.getElementById('reset'),

    arrayTrack: document.getElementById('array-track'),
    arrayViewport: document.getElementById('array-viewport'),
    arrayFrame: document.querySelector('.array-frame'),
    arrayMeta: document.getElementById('array-meta'),
    targetMeta: document.getElementById('target-meta'),

    statusPanel: document.getElementById('status-panel'),
    statusMessage: document.getElementById('status-message'),
    statusCount: document.getElementById('status-count'),

    prev: document.getElementById('prev'),
    step: document.getElementById('step'),
    play: document.getElementById('play'),
    stepCounter: document.getElementById('step-counter'),
    intervalReadout: document.getElementById('interval-readout'),
    progressBar: document.getElementById('progress-bar'),

    traceList: document.getElementById('trace-list'),
    traceCount: document.getElementById('trace-count'),

    statComparisons: document.getElementById('stat-comparisons'),
    statRemaining: document.getElementById('stat-remaining'),
    statTheoretical: document.getElementById('stat-theoretical'),
    statResult: document.getElementById('stat-result'),
    statVerdict: document.getElementById('stat-verdict')
  };

  var state = {
    array: [],
    target: 0,
    steps: [],
    speedMs: 700
  };

  var playback = null;

  /* ------------------------------------------------------------------ *
   * 数据生成
   * ------------------------------------------------------------------ */

  function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /**
   * 生成 n 个互不相同的随机整数（1–999），并升序排列。
   * 使用 Set 去重，保证同一个值不会在数组中出现两次，
   * 这样「命中下标」始终只有一个，演示不会产生歧义。
   */
  function createSortedArray(n) {
    var picked = new Set();
    while (picked.size < n) {
      picked.add(randomInt(1, 999));
    }
    return Array.from(picked).sort(function (a, b) { return a - b; });
  }

  function pickTargetFrom(array) {
    return array[randomInt(0, array.length - 1)];
  }

  /* ------------------------------------------------------------------ *
   * 表单与提示
   * ------------------------------------------------------------------ */

  function updateRangeFill() {
    var min = Number(els.size.min);
    var max = Number(els.size.max);
    var value = Number(els.size.value);
    var percent = ((value - min) / (max - min)) * 100;
    els.size.style.setProperty('--range-progress', percent + '%');
  }

  function setTargetHint(message, isError) {
    els.targetHint.textContent = message;
    els.targetHint.classList.toggle('is-error', Boolean(isError));
    els.target.classList.toggle('is-error', Boolean(isError));
  }

  function readTarget() {
    var raw = els.target.value.trim();
    if (raw === '') {
      return { ok: false, message: '请输入一个整数目标值。' };
    }
    var value = Number(raw);
    if (!Number.isSafeInteger(value)) {
      return { ok: false, message: '目标值必须是整数。' };
    }
    return { ok: true, value: value };
  }

  /**
   * 把输入框中的目标值同步到演示状态。
   * @returns {boolean} 输入是否有效
   */
  function commitTarget() {
    var parsed = readTarget();
    if (!parsed.ok) {
      setTargetHint(parsed.message, true);
      return false;
    }

    setTargetHint(DEFAULT_TARGET_HINT, false);
    if (parsed.value !== state.target || state.steps.length === 0) {
      state.target = parsed.value;
      rebuildSteps();
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 步骤生成与界面刷新
   * ------------------------------------------------------------------ */

  function rebuildSteps() {
    var result;
    try {
      result = window.BinarySearch.buildSteps(state.array, state.target);
    } catch (error) {
      els.statusPanel.setAttribute('data-tone', 'failed');
      els.statusMessage.textContent = '无法生成步骤：' + error.message;
      return;
    }

    state.steps = result.steps;
    els.arrayMeta.textContent = 'n = ' + state.array.length;
    els.targetMeta.textContent = String(state.target);
    window.StatsPanel.setData(state.array.length);

    // setSteps 会重置到第 0 步并触发一次 render。
    playback.setSteps(state.steps.length);
  }

  function toneFor(step) {
    if (!step) {
      return 'idle';
    }
    if (step.type === 'found') {
      return 'found';
    }
    if (step.type === 'not-found') {
      return 'failed';
    }
    if (step.type === 'compare') {
      return 'active';
    }
    return 'idle';
  }

  function render(index, playbackState) {
    var step = state.steps[index] || null;
    var lastIndex = state.steps.length - 1;

    window.ArrayRenderer.render(state.array, step);
    window.TracePanel.render(state.steps, index);
    window.StatsPanel.render(step, state.array.length);

    if (step) {
      els.statusPanel.setAttribute('data-tone', toneFor(step));
      els.statusMessage.textContent = step.message;
      els.statusCount.textContent = '比较 ' + step.comparisons + ' 次';
    }

    els.stepCounter.textContent = (index + 1) + ' / ' + state.steps.length;
    if (step && step.low <= step.high) {
      els.intervalReadout.textContent = '[' + step.low + ', ' + step.high + ']';
    } else {
      els.intervalReadout.textContent = '空';
    }

    var progress = lastIndex > 0 ? (index / lastIndex) * 100 : 0;
    els.progressBar.style.width = progress.toFixed(2) + '%';

    els.prev.disabled = index <= 0;
    els.step.disabled = index >= lastIndex;

    if (playbackState.playing) {
      els.play.textContent = '暂停';
      els.play.setAttribute('aria-pressed', 'true');
      els.play.setAttribute('aria-label', '暂停自动演示');
    } else if (playbackState.atEnd) {
      els.play.textContent = '重播';
      els.play.setAttribute('aria-pressed', 'false');
      els.play.setAttribute('aria-label', '重新播放演示');
    } else {
      els.play.textContent = '播放';
      els.play.setAttribute('aria-pressed', 'false');
      els.play.setAttribute('aria-label', '播放自动演示');
    }
  }

  /* ------------------------------------------------------------------ *
   * 数据操作
   * ------------------------------------------------------------------ */

  function applySize() {
    var size = Number(els.size.value);
    if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
      return;
    }
    els.sizeValue.textContent = String(size);
    state.array = createSortedArray(size);
    state.target = pickTargetFrom(state.array);
    els.target.value = String(state.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);
    rebuildSteps();
  }

  function regenerateData() {
    var size = Number(els.size.value);
    state.array = createSortedArray(size);
    state.target = pickTargetFrom(state.array);
    els.target.value = String(state.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);
    rebuildSteps();
  }

  function randomizeTarget() {
    state.target = pickTargetFrom(state.array);
    els.target.value = String(state.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);
    rebuildSteps();
  }

  function selectSpeed(button) {
    var speed = Number(button.getAttribute('data-speed'));
    if (!Number.isInteger(speed) || speed <= 0) {
      return;
    }
    state.speedMs = speed;

    Array.prototype.forEach.call(els.speedGroup.querySelectorAll('button'), function (item) {
      var selected = item === button;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });

    playback.setSpeed();
  }

  function ensureValidTarget() {
    if (!commitTarget()) {
      playback.pause();
      return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 事件绑定
   * ------------------------------------------------------------------ */

  function bindEvents() {
    // 数组规模：拖动时先更新读数，松开后再重建数据，避免每一步都重置演示。
    els.size.addEventListener('input', function () {
      els.sizeValue.textContent = els.size.value;
      updateRangeFill();
    });
    els.size.addEventListener('change', applySize);

    // 目标值：输入时做即时提示，失焦或回车时再提交。
    els.target.addEventListener('input', function () {
      var parsed = readTarget();
      if (parsed.ok) {
        setTargetHint(DEFAULT_TARGET_HINT, false);
      } else if (els.target.value.trim() !== '') {
        setTargetHint(parsed.message, true);
        // 输入非法时暂停播放，避免动画继续使用旧目标值造成误解。
        playback.pause();
      } else {
        setTargetHint(DEFAULT_TARGET_HINT, false);
      }
    });
    els.target.addEventListener('change', function () {
      if (!commitTarget()) {
        playback.pause();
      }
    });
    els.target.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitTarget();
      }
    });

    els.randomTarget.addEventListener('click', randomizeTarget);
    els.regenerate.addEventListener('click', regenerateData);
    els.reset.addEventListener('click', function () {
      // reset() 总会触发一次 render，即使当前已经在第 0 步。
      playback.reset();
    });

    els.prev.addEventListener('click', function () {
      playback.prev();
    });
    els.step.addEventListener('click', function () {
      if (ensureValidTarget()) {
        playback.next();
      }
    });
    els.play.addEventListener('click', function () {
      if (ensureValidTarget()) {
        playback.toggle();
      }
    });

    els.speedGroup.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-speed]');
      if (button) {
        selectSpeed(button);
      }
    });

    // 切到哈希查找时暂停二分演示，避免隐藏面板继续跑动画。
    document.addEventListener('app:viewchange', function (event) {
      if (event.detail && event.detail.view !== 'binary' && playback) {
        playback.pause();
      }
    });

    // 键盘快捷键：只在二分查找面板可见时生效；在输入框或按钮上不拦截。
    document.addEventListener('keydown', function (event) {
      if (window.AppViews && !window.AppViews.isActive('binary')) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      var target = event.target;
      if (target && target.closest &&
          target.closest('input, textarea, select, button, a, [contenteditable="true"]')) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        if (ensureValidTarget()) {
          playback.toggle();
        }
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (ensureValidTarget()) {
          playback.next();
        }
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        playback.prev();
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        playback.reset();
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 初始化
   * ------------------------------------------------------------------ */

  function init() {
    window.ArrayRenderer.mount({
      track: els.arrayTrack,
      viewport: els.arrayViewport,
      frame: els.arrayFrame
    });

    window.TracePanel.mount({
      list: els.traceList,
      count: els.traceCount
    }, function (index) {
      playback.jumpTo(index);
    });

    window.StatsPanel.mount({
      comparisons: els.statComparisons,
      remaining: els.statRemaining,
      theoretical: els.statTheoretical,
      verdict: els.statVerdict,
      result: els.statResult
    });

    playback = window.PlaybackControls.create({
      onChange: render,
      getSpeed: function () { return state.speedMs; }
    });

    bindEvents();

    var size = Number(els.size.value);
    els.sizeValue.textContent = String(size);
    updateRangeFill();

    state.array = createSortedArray(size);
    state.target = pickTargetFrom(state.array);
    els.target.value = String(state.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);

    rebuildSteps();
  }

  init();
})();

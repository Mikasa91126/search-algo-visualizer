/**
 * hash-main.js
 * 哈希表演示入口：生成关键字、维护桶数与目标值、绑定播放控件。
 *
 * 页面状态：
 *   keys        待插入的关键字列表
 *   target      当前查找目标
 *   bucketCount 用户配置的初始桶数 m
 *   steps       hash-table.js 预生成的完整步骤序列
 *   index       当前播放位置（由 controls.js 维护）
 */
(function () {
  'use strict';

  var DEFAULT_TARGET_HINT = '默认从关键字中随机选取；也可以输入不存在的值，观察整条链比较后失败。';
  var MIN_SIZE = 6;
  var MAX_SIZE = 16;
  var MIN_BUCKETS = 4;
  var MAX_BUCKETS = 12;

  var els = {
    size: document.getElementById('hash-size'),
    sizeValue: document.getElementById('hash-size-value'),
    bucketCount: document.getElementById('hash-bucket-count'),
    bucketCountValue: document.getElementById('hash-bucket-count-value'),
    target: document.getElementById('hash-target'),
    targetHint: document.getElementById('hash-target-hint'),
    randomTarget: document.getElementById('hash-random-target'),
    speedGroup: document.getElementById('hash-speed-group'),
    regenerate: document.getElementById('hash-regenerate'),
    reset: document.getElementById('hash-reset'),

    bucketList: document.getElementById('hash-bucket-list'),
    bucketViewport: document.getElementById('hash-bucket-viewport'),
    tableMeta: document.getElementById('hash-table-meta'),
    storedMeta: document.getElementById('hash-stored-meta'),
    targetMeta: document.getElementById('hash-target-meta'),

    loadFactor: document.getElementById('hash-load-factor'),
    loadBar: document.getElementById('hash-load-bar'),
    loadHint: document.getElementById('hash-load-hint'),

    calcKey: document.getElementById('hash-calc-key'),
    calcFormula: document.getElementById('hash-calc-formula'),
    calcBucket: document.getElementById('hash-calc-bucket'),
    calcNote: document.getElementById('hash-calc-note'),

    statusPanel: document.getElementById('hash-status-panel'),
    statusMessage: document.getElementById('hash-status-message'),
    statusCount: document.getElementById('hash-status-count'),

    prev: document.getElementById('hash-prev'),
    step: document.getElementById('hash-step'),
    play: document.getElementById('hash-play'),
    stepCounter: document.getElementById('hash-step-counter'),
    bucketReadout: document.getElementById('hash-bucket-readout'),
    progressBar: document.getElementById('hash-progress-bar'),

    traceList: document.getElementById('hash-trace-list'),
    traceCount: document.getElementById('hash-trace-count'),

    statComparisons: document.getElementById('hash-stat-comparisons'),
    statLoad: document.getElementById('hash-stat-load'),
    statRehash: document.getElementById('hash-stat-rehash'),
    statBuckets: document.getElementById('hash-stat-buckets'),
    statChain: document.getElementById('hash-stat-chain'),
    statResult: document.getElementById('hash-stat-result'),
    statVerdict: document.getElementById('hash-stat-verdict')
  };

  var state = {
    keys: [],
    target: 0,
    bucketCount: 5,
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
   * 生成 n 个互不相同的随机整数（1–999）。
   * 保留随机顺序作为插入顺序，让冲突与挂链过程更自然。
   */
  function createKeys(n) {
    var picked = new Set();
    while (picked.size < n) {
      picked.add(randomInt(1, 999));
    }
    return Array.from(picked);
  }

  function pickTargetFrom(keys) {
    return keys[randomInt(0, keys.length - 1)];
  }

  /* ------------------------------------------------------------------ *
   * 表单与提示
   * ------------------------------------------------------------------ */

  function updateRangeFill(element) {
    var min = Number(element.min);
    var max = Number(element.max);
    var value = Number(element.value);
    var percent = ((value - min) / (max - min)) * 100;
    element.style.setProperty('--range-progress', percent + '%');
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
      result = window.HashTable.buildSteps(state.keys, {
        bucketCount: state.bucketCount,
        target: state.target
      });
    } catch (error) {
      els.statusPanel.setAttribute('data-tone', 'failed');
      els.statusMessage.textContent = '无法生成步骤：' + error.message;
      return;
    }

    state.steps = result.steps;
    state.result = result;
    els.targetMeta.textContent = String(state.target);
    els.bucketReadout.textContent = 'm = ' + result.bucketCount;

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
    if (step.type === 'rehash-needed') {
      return 'warn';
    }
    if (step.type === 'search-hash' ||
        step.type === 'search-compare' ||
        step.type === 'insert-conflict' ||
        step.type === 'rehash') {
      return 'active';
    }
    return 'idle';
  }

  function render(index, playbackState) {
    var step = state.steps[index] || null;
    var lastIndex = state.steps.length - 1;

    window.HashBucketRenderer.render(step, state.keys.length);
    window.HashTracePanel.render(state.steps, index);
    window.HashStatsPanel.render(step);

    if (step) {
      els.statusPanel.setAttribute('data-tone', toneFor(step));
      els.statusMessage.textContent = step.message;
      els.statusCount.textContent = '比较 ' + step.comparisons + ' 次';
      els.bucketReadout.textContent = 'm = ' + step.bucketCount;
    }

    els.stepCounter.textContent = (index + 1) + ' / ' + state.steps.length;
    var progress = lastIndex > 0 ? (index / lastIndex) * 100 : 0;
    els.progressBar.style.width = progress.toFixed(2) + '%';

    els.prev.disabled = index <= 0;
    els.step.disabled = index >= lastIndex;

    if (playbackState.playing) {
      els.play.textContent = '暂停';
      els.play.setAttribute('aria-pressed', 'true');
    } else if (playbackState.atEnd) {
      els.play.textContent = '重播';
      els.play.setAttribute('aria-pressed', 'false');
    } else {
      els.play.textContent = '播放';
      els.play.setAttribute('aria-pressed', 'false');
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
    state.keys = createKeys(size);
    state.target = pickTargetFrom(state.keys);
    els.target.value = String(state.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);
    rebuildSteps();
  }

  function applyBucketCount() {
    var bucketCount = Number(els.bucketCount.value);
    if (!Number.isInteger(bucketCount) || bucketCount < MIN_BUCKETS || bucketCount > MAX_BUCKETS) {
      return;
    }
    els.bucketCountValue.textContent = String(bucketCount);
    if (bucketCount === state.bucketCount) {
      return;
    }
    state.bucketCount = bucketCount;
    rebuildSteps();
  }

  function regenerateData() {
    var size = Number(els.size.value);
    state.keys = createKeys(size);
    state.target = pickTargetFrom(state.keys);
    els.target.value = String(state.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);
    rebuildSteps();
  }

  function randomizeTarget() {
    state.target = pickTargetFrom(state.keys);
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
    els.size.addEventListener('input', function () {
      els.sizeValue.textContent = els.size.value;
      updateRangeFill(els.size);
    });
    els.size.addEventListener('change', applySize);

    els.bucketCount.addEventListener('input', function () {
      els.bucketCountValue.textContent = els.bucketCount.value;
      updateRangeFill(els.bucketCount);
    });
    els.bucketCount.addEventListener('change', applyBucketCount);

    els.target.addEventListener('input', function () {
      var parsed = readTarget();
      if (parsed.ok) {
        setTargetHint(DEFAULT_TARGET_HINT, false);
      } else if (els.target.value.trim() !== '') {
        setTargetHint(parsed.message, true);
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

    document.addEventListener('keydown', function (event) {
      if (window.AppViews && !window.AppViews.isActive('hash')) {
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

    // 切到二分查找时暂停哈希演示，避免隐藏面板继续跑动画。
    document.addEventListener('app:viewchange', function (event) {
      if (event.detail && event.detail.view !== 'hash' && playback) {
        playback.pause();
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 初始化
   * ------------------------------------------------------------------ */

  function init() {
    if (!els.bucketList) {
      return;
    }

    window.HashBucketRenderer.mount({
      list: els.bucketList,
      viewport: els.bucketViewport,
      tableMeta: els.tableMeta,
      storedMeta: els.storedMeta,
      loadFactor: els.loadFactor,
      loadBar: els.loadBar,
      loadHint: els.loadHint,
      calcKey: els.calcKey,
      calcFormula: els.calcFormula,
      calcBucket: els.calcBucket,
      calcNote: els.calcNote
    });

    window.HashTracePanel.mount({
      list: els.traceList,
      count: els.traceCount
    }, function (index) {
      playback.jumpTo(index);
    });

    window.HashStatsPanel.mount({
      comparisons: els.statComparisons,
      load: els.statLoad,
      rehash: els.statRehash,
      buckets: els.statBuckets,
      chain: els.statChain,
      result: els.statResult,
      verdict: els.statVerdict
    });

    playback = window.PlaybackControls.create({
      onChange: render,
      getSpeed: function () { return state.speedMs; }
    });

    bindEvents();

    var size = Number(els.size.value);
    state.bucketCount = Number(els.bucketCount.value);
    els.sizeValue.textContent = String(size);
    els.bucketCountValue.textContent = String(state.bucketCount);
    updateRangeFill(els.size);
    updateRangeFill(els.bucketCount);

    state.keys = createKeys(size);
    state.target = pickTargetFrom(state.keys);
    els.target.value = String(state.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);

    rebuildSteps();
  }

  init();
})();

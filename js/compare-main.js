/**
 * compare-main.js
 * 对比模式入口：生成同一组数据、维护同一个目标值、驱动左右两侧同步播放。
 *
 * 状态：
 *   dataset  {keys, sorted, target}
 *   model    compare-model.js 生成的对比模型
 *   speedMs  播放间隔
 *   playback controls.js 的播放控制器（帧号 = 两侧同步步数）
 */
(function () {
  'use strict';

  var DEFAULT_TARGET_HINT = '左右两侧使用同一个目标值；输入不存在的整数可以观察双方失败的过程。';
  var MIN_SIZE = 8;
  var MAX_SIZE = 24;

  var els = {
    size: document.getElementById('compare-size'),
    sizeValue: document.getElementById('compare-size-value'),
    target: document.getElementById('compare-target'),
    targetHint: document.getElementById('compare-target-hint'),
    randomTarget: document.getElementById('compare-random-target'),
    speedGroup: document.getElementById('compare-speed-group'),
    regenerate: document.getElementById('compare-regenerate'),
    reset: document.getElementById('compare-reset'),

    prev: document.getElementById('compare-prev'),
    step: document.getElementById('compare-step'),
    play: document.getElementById('compare-play'),
    stepCounter: document.getElementById('compare-step-counter'),
    progressBar: document.getElementById('compare-progress-bar'),
    syncReadout: document.getElementById('compare-sync-readout'),

    binaryTrack: document.getElementById('compare-binary-track'),
    binaryViewport: document.getElementById('compare-binary-viewport'),
    binaryStatus: document.getElementById('compare-binary-status'),
    binaryStatusMessage: document.getElementById('compare-binary-status-message'),
    binaryStatusCount: document.getElementById('compare-binary-status-count'),
    binaryStep: document.getElementById('compare-binary-step'),
    binaryInterval: document.getElementById('compare-binary-interval'),
    binaryResult: document.getElementById('compare-binary-result'),

    hashList: document.getElementById('compare-hash-list'),
    hashViewport: document.getElementById('compare-hash-viewport'),
    hashStatus: document.getElementById('compare-hash-status'),
    hashStatusMessage: document.getElementById('compare-hash-status-message'),
    hashStatusCount: document.getElementById('compare-hash-status-count'),
    hashStep: document.getElementById('compare-hash-step'),
    hashBucketReadout: document.getElementById('compare-hash-bucket-readout'),
    hashBucketMeta: document.getElementById('compare-hash-bucket-meta'),
    hashResult: document.getElementById('compare-hash-result'),

    targetMeta: document.getElementById('compare-target-meta'),
    sizeMeta: document.getElementById('compare-size-meta'),
    bucketMeta: document.getElementById('compare-bucket-meta'),

    binaryBuild: document.getElementById('compare-binary-build'),
    hashBuild: document.getElementById('compare-hash-build'),

    statBinaryComparisons: document.getElementById('compare-stat-binary-comparisons'),
    statHashComparisons: document.getElementById('compare-stat-hash-comparisons'),
    statBinaryResult: document.getElementById('compare-stat-binary-result'),
    statHashResult: document.getElementById('compare-stat-hash-result'),
    statVerdict: document.getElementById('compare-stat-verdict'),
    conclusion: document.getElementById('compare-conclusion'),

    barBinary: document.getElementById('compare-bar-binary'),
    barHash: document.getElementById('compare-bar-hash'),
    barBinaryValue: document.getElementById('compare-bar-binary-value'),
    barHashValue: document.getElementById('compare-bar-hash-value')
  };

  var state = {
    dataset: null,
    model: null,
    speedMs: 700
  };

  var playback = null;

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

  function rebuild() {
    var model;
    try {
      model = window.CompareModel.buildComparison(state.dataset);
    } catch (error) {
      els.binaryStatusMessage.textContent = '无法生成对比数据：' + error.message;
      els.hashStatusMessage.textContent = '无法生成对比数据：' + error.message;
      return;
    }

    state.model = model;
    window.CompareRenderer.prepare(model);
    // setSteps 会回到第 0 帧并触发一次 render。
    playback.setSteps(model.frames);
  }

  function applySize() {
    var size = Number(els.size.value);
    if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
      return;
    }
    els.sizeValue.textContent = String(size);
    state.dataset = window.CompareModel.createDataset(size);
    els.target.value = String(state.dataset.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);
    rebuild();
  }

  function regenerateData() {
    var size = Number(els.size.value);
    state.dataset = window.CompareModel.createDataset(size);
    els.target.value = String(state.dataset.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);
    rebuild();
  }

  function randomizeTarget() {
    var keys = state.dataset.keys;
    var next = keys[Math.floor(Math.random() * keys.length)];
    state.dataset.target = next;
    els.target.value = String(next);
    setTargetHint(DEFAULT_TARGET_HINT, false);
    rebuild();
  }

  function commitTarget() {
    var parsed = readTarget();
    if (!parsed.ok) {
      setTargetHint(parsed.message, true);
      return false;
    }
    setTargetHint(DEFAULT_TARGET_HINT, false);
    if (parsed.value !== state.dataset.target) {
      state.dataset.target = parsed.value;
      rebuild();
    }
    return true;
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

  function render(index, playbackState) {
    var model = state.model;
    if (!model) {
      return;
    }

    window.CompareRenderer.render(model, index);

    var lastIndex = model.frames - 1;
    els.stepCounter.textContent = (index + 1) + ' / ' + model.frames;
    els.syncReadout.textContent = '二分 ' + Math.min(index + 1, model.binary.steps.length) +
      '/' + model.binary.steps.length + ' 步 · 哈希 ' +
      Math.min(index + 1, model.hash.steps.length) + '/' + model.hash.steps.length + ' 步';
    els.progressBar.style.width = (lastIndex > 0 ? (index / lastIndex) * 100 : 0).toFixed(2) + '%';

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

  /**
   * 面板从隐藏变为显示时重绘一次：隐藏状态下无法计算元素尺寸，
   * 哈希桶的自动滚动和目标桶高亮需要等到面板可见后再刷新。
   */
  function refreshCurrentFrame() {
    if (!state.model || !playback) {
      return;
    }
    var index = playback.getIndex();
    render(index, {
      playing: playback.isPlaying(),
      atEnd: index >= state.model.frames - 1,
      count: state.model.frames
    });
  }

  function bindEvents() {
    els.size.addEventListener('input', function () {
      els.sizeValue.textContent = els.size.value;
      updateRangeFill();
    });
    els.size.addEventListener('change', applySize);

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

    document.addEventListener('app:viewchange', function (event) {
      if (event.detail && event.detail.view !== 'compare' && playback) {
        playback.pause();
      } else if (event.detail && event.detail.view === 'compare') {
        refreshCurrentFrame();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (window.AppViews && !window.AppViews.isActive('compare')) {
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

  function init() {
    if (!els.size || !els.binaryTrack || !els.hashList) {
      return;
    }

    window.CompareRenderer.mount({
      binaryTrack: els.binaryTrack,
      binaryViewport: els.binaryViewport,
      binaryStatus: els.binaryStatus,
      binaryStatusMessage: els.binaryStatusMessage,
      binaryStatusCount: els.binaryStatusCount,
      binaryStep: els.binaryStep,
      binaryInterval: els.binaryInterval,
      binaryResult: els.binaryResult,

      hashList: els.hashList,
      hashViewport: els.hashViewport,
      hashStatus: els.hashStatus,
      hashStatusMessage: els.hashStatusMessage,
      hashStatusCount: els.hashStatusCount,
      hashStep: els.hashStep,
      hashBucketReadout: els.hashBucketReadout,
      hashBucketMeta: els.hashBucketMeta,
      hashResult: els.hashResult,

      targetMeta: els.targetMeta,
      sizeMeta: els.sizeMeta,
      bucketMeta: els.bucketMeta,

      binaryBuild: els.binaryBuild,
      hashBuild: els.hashBuild,

      statBinaryComparisons: els.statBinaryComparisons,
      statHashComparisons: els.statHashComparisons,
      statBinaryResult: els.statBinaryResult,
      statHashResult: els.statHashResult,
      statVerdict: els.statVerdict,
      conclusion: els.conclusion,

      barBinary: els.barBinary,
      barHash: els.barHash,
      barBinaryValue: els.barBinaryValue,
      barHashValue: els.barHashValue
    });

    playback = window.PlaybackControls.create({
      onChange: render,
      getSpeed: function () { return state.speedMs; }
    });

    bindEvents();

    var size = Number(els.size.value);
    els.sizeValue.textContent = String(size);
    updateRangeFill();

    state.dataset = window.CompareModel.createDataset(size);
    els.target.value = String(state.dataset.target);
    setTargetHint(DEFAULT_TARGET_HINT, false);
    rebuild();
  }

  init();
})();

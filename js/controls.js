/**
 * controls.js
 * 播放控制器：管理「当前步骤索引」和自动播放定时器。
 *
 * 控制器不直接操作 DOM，只向外抛出一个统一的 onChange(index, state) 回调，
 * 由 main.js 决定如何刷新界面。单步、上一步、跳转、重置和自动播放都走同一套索引逻辑。
 */
(function (global) {
  'use strict';

  function create(options) {
    var onChange = options.onChange || function () {};
    var getSpeed = options.getSpeed || function () { return 700; };

    var index = 0;
    var count = 0;
    var timer = null;
    var playing = false;

    function clearTimer() {
      if (timer !== null) {
        global.clearTimeout(timer);
        timer = null;
      }
    }

    /**
     * 停止自动播放但先不通知界面，便于调用方在同一次操作里只刷新一帧。
     */
    function pauseSilently() {
      playing = false;
      clearTimer();
    }

    function emit() {
      onChange(index, {
        playing: playing,
        atEnd: count > 0 && index >= count - 1,
        count: count
      });
    }

    function schedule() {
      clearTimer();
      if (!playing) {
        return;
      }
      timer = global.setTimeout(function () {
        timer = null;
        if (!playing) {
          return;
        }
        if (index < count - 1) {
          index += 1;
          if (index >= count - 1) {
            // 抵达最后一步（命中或失败），自动停止。
            pauseSilently();
          }
          emit();
          if (playing) {
            schedule();
          }
        } else {
          pauseSilently();
          emit();
        }
      }, getSpeed());
    }

    function setPlaying(next) {
      if (next === playing) {
        return;
      }
      if (next) {
        playing = true;
        schedule();
      } else {
        pauseSilently();
      }
      emit();
    }

    function setSteps(nextCount) {
      // 数据变化时先静默清空定时器和旧索引，再一次性通知渲染，
      // 避免用旧索引去读取新步骤序列产生一帧错位。
      pauseSilently();
      count = Math.max(0, nextCount);
      index = 0;
      emit();
    }

    function next() {
      pauseSilently();
      if (index < count - 1) {
        index += 1;
      }
      emit();
    }

    function prev() {
      pauseSilently();
      if (index > 0) {
        index -= 1;
      }
      emit();
    }

    function jumpTo(nextIndex) {
      pauseSilently();
      index = Math.max(0, Math.min(count - 1, nextIndex));
      emit();
    }

    function reset() {
      pauseSilently();
      index = 0;
      emit();
    }

    function toggle() {
      if (playing) {
        setPlaying(false);
        return;
      }
      if (count <= 1) {
        return;
      }
      if (index >= count - 1) {
        // 已经到结尾：从第一步重新播放。
        index = 0;
      }
      setPlaying(true);
    }

    function setSpeed() {
      if (playing) {
        schedule();
      }
    }

    return {
      setSteps: setSteps,
      next: next,
      prev: prev,
      jumpTo: jumpTo,
      reset: reset,
      toggle: toggle,
      pause: function () {
        var wasPlaying = playing;
        pauseSilently();
        if (wasPlaying) {
          emit();
        }
      },
      setSpeed: setSpeed,
      getIndex: function () { return index; },
      isPlaying: function () { return playing; }
    };
  }

  global.PlaybackControls = {
    create: create
  };
})(window);

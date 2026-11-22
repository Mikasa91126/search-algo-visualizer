/**
 * views.js
 * 顶部模块标签页：在「二分查找」与「哈希查找」之间切换。
 *
 * 切换只负责显示 / 隐藏面板、同步 tab 的 ARIA 状态和标题文案，
 * 具体演示状态由各自的 main 脚本管理；离开某个模块时通过
 * app:viewchange 事件通知它暂停播放。
 */
(function (global) {
  'use strict';

  var VIEW_META = {
    binary: {
      title: '二分查找',
      lede: '看查找区间如何一次次折半，直到命中目标，或者彻底落空。'
    },
    hash: {
      title: '哈希查找',
      lede: '看关键字如何由 h(k) = k mod m 落进桶里，冲突如何成链，装载因子何时触发扩容。'
    }
  };

  var tabs = [];
  var panels = [];
  var currentView = 'binary';

  function metaFor(view) {
    return VIEW_META[view] || VIEW_META.binary;
  }

  function activate(view, options) {
    if (!VIEW_META[view]) {
      return;
    }
    currentView = view;
    document.body.setAttribute('data-active-view', view);

    tabs.forEach(function (tab) {
      var selected = tab.getAttribute('data-view') === view;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.setAttribute('tabindex', selected ? '0' : '-1');
    });

    panels.forEach(function (panel) {
      var visible = panel.getAttribute('data-view') === view;
      panel.hidden = !visible;
    });

    var info = metaFor(view);
    var titleEl = document.getElementById('masthead-title');
    var ledeEl = document.getElementById('masthead-lede');
    if (titleEl) {
      titleEl.textContent = info.title;
    }
    if (ledeEl) {
      ledeEl.textContent = info.lede;
    }
    document.title = info.title + '可视化 · 搜索算法学习工具';

    document.dispatchEvent(new CustomEvent('app:viewchange', {
      detail: { view: view }
    }));

    if (options && options.focusTab) {
      var activeTab = tabs.filter(function (tab) {
        return tab.getAttribute('data-view') === view;
      })[0];
      if (activeTab) {
        activeTab.focus();
      }
    }
  }

  function tabIndexFor(view) {
    var index = -1;
    tabs.forEach(function (tab, i) {
      if (tab.getAttribute('data-view') === view) {
        index = i;
      }
    });
    return index;
  }

  function handleTabKeydown(event) {
    var key = event.key;
    if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') {
      return;
    }
    event.preventDefault();
    var index = tabs.indexOf(event.currentTarget);
    if (index < 0) {
      return;
    }
    var nextIndex = index;
    if (key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (key === 'Home') {
      nextIndex = 0;
    } else if (key === 'End') {
      nextIndex = tabs.length - 1;
    }
    var next = tabs[nextIndex];
    if (next) {
      activate(next.getAttribute('data-view'), { focusTab: true });
    }
  }

  function init() {
    tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"][data-view]'));
    panels = Array.prototype.slice.call(document.querySelectorAll('[role="tabpanel"][data-view]'));

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        activate(tab.getAttribute('data-view'));
      });
      tab.addEventListener('keydown', handleTabKeydown);
    });

    var initial = document.body.getAttribute('data-active-view') || 'binary';
    if (tabIndexFor(initial) < 0) {
      initial = 'binary';
    }
    activate(initial);
  }

  global.AppViews = {
    activate: activate,
    isActive: function (view) {
      return currentView === view;
    },
    current: function () {
      return currentView;
    }
  };

  init();
})(window);

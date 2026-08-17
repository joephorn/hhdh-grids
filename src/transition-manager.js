(function () {
  const config = {
    enabled: true,
    durationMs: 1000,
    easing: 'linear',
    updateUI: false,
    stepCount: 5,
    excludedParams: ['fg', 'bg'],
  };

  const easings = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
    easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    easeInOutCubic: (t) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    step: (t) => {
      const steps = Math.max(1, Math.round(config.stepCount));
      if (t >= 1) return 1;
      return Math.floor(t * steps) / steps;
    },
  };

  const state = {
    active: false,
    startMs: 0,
    durationMs: 1000,
    easingFn: easings.easeInOutQuad,
    from: null,
    to: null,
    excluded: new Set(),
    updateUI: false,
  };

  function nowMs() {
    return typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  }

  function cloneParams(params) {
    return params ? { ...params } : {};
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function setParamValue(key, value, updateUI) {
    if (updateUI && window.PARAMS && typeof window.PARAMS.set === 'function') {
      window.PARAMS.set(key, value);
      return;
    }
    if (typeof window !== 'undefined') {
      window[key] = value;
    }
    if (window.PARAMS && window.PARAMS.values) {
      window.PARAMS.values[key] = value;
    }
  }

  function applyExcludedImmediately(toParams) {
    state.excluded.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(toParams, key)) {
        setParamValue(key, toParams[key], state.updateUI);
      }
    });
  }

  function computeInterpolatedParams(t) {
    const out = {};
    const toParams = state.to || {};
    const fromParams = state.from || {};
    Object.keys(toParams).forEach((key) => {
      if (state.excluded.has(key)) return;
      const a = fromParams[key];
      const b = toParams[key];
      if (typeof a === 'number' && typeof b === 'number') {
        out[key] = lerp(a, b, t);
        return;
      }
      out[key] = t < 0.5 ? a : b;
    });
    return out;
  }

  let rafId = null;
  function tick() {
    if (!state.active) {
      rafId = null;
      return;
    }
    const elapsed = nowMs() - state.startMs;
    const t = state.durationMs <= 0 ? 1 : Math.min(elapsed / state.durationMs, 1);
    const eased = state.easingFn(t);
    const nextParams = computeInterpolatedParams(eased);
    Object.entries(nextParams).forEach(([key, value]) => {
      setParamValue(key, value, state.updateUI);
    });
    if (t >= 1) {
      state.active = false;
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startTween(fromParams, toParams, options = {}) {
    if (!config.enabled) return false;
    const easingName = options.easing || config.easing;
    state.easingFn = easings[easingName] || easings.linear;
    state.durationMs = Number.isFinite(options.durationMs)
      ? options.durationMs
      : config.durationMs;
    state.updateUI =
      typeof options.updateUI === 'boolean' ? options.updateUI : config.updateUI;
    state.excluded = new Set(
      Array.isArray(options.excludedParams) ? options.excludedParams : config.excludedParams
    );
    state.from = cloneParams(fromParams);
    state.to = cloneParams(toParams);
    state.startMs = nowMs();
    state.active = true;

    applyExcludedImmediately(state.to);

    if (!rafId) {
      rafId = requestAnimationFrame(tick);
    }
    return true;
  }

  function tweenTo(toParams, options = {}) {
    if (!window.PARAMS || typeof window.PARAMS.get !== 'function') {
      return startTween({}, toParams, options);
    }
    const current = window.PARAMS.get();
    return startTween(current, toParams, options);
  }

  function setEnabled(next) {
    config.enabled = Boolean(next);
  }

  function isEnabled() {
    return Boolean(config.enabled);
  }

  if (typeof window !== 'undefined') {
    window.TRANSITIONS = {
      config,
      easings,
      tweenTo,
      startTween,
      setEnabled,
      isEnabled,
    };
  }
})();

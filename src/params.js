(function () {
  const config = {
    excludedParams: ['fg'],
  };
  const registry = new Map();
  const values = {};

  function toNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function formatValue(value) {
    if (Number.isFinite(value)) {
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    if (value == null) return '';
    return String(value);
  }

  function formatParamValue(key, value) {
    if (key === 'blobScale' && Number.isFinite(value)) return `×${value.toFixed(1)}`;
    return formatValue(value);
  }

  function ensureOutputElement(key, inputEl) {
    if (!key || !inputEl || typeof document === 'undefined') return null;
    if (key === 'canvasWidth' || key === 'canvasHeight' || inputEl.type === 'checkbox' || inputEl.type === 'radio' || inputEl.type === 'color') return null;
    const existing = document.getElementById(`${key}Out`);
    if (existing) return existing;

    const outputEl = document.createElement('output');
    outputEl.id = `${key}Out`;
    inputEl.insertAdjacentText('afterend', ' ');
    inputEl.insertAdjacentElement('afterend', outputEl);
    return outputEl;
  }

  function updateOutput(param, value) {
    if (!param.outputEl) return;
    const text = formatParamValue(param.key, value);
    param.outputEl.textContent = text;
    param.outputEl.value = text;
  }

  function updateGlobalParam(param, value) {
    if (typeof window === 'undefined') return;
    if (!param || !param.key) return;
    window[param.key] = value;
  }

  function syncParamFromElement(param) {
    const value = param.isNumeric
      ? toNumber(param.el.value, param.defaultValue)
      : String(param.el.value ?? param.defaultValue ?? '');
    values[param.key] = value;
    updateGlobalParam(param, value);
    updateOutput(param, value);
    if (typeof window !== 'undefined' && typeof window.redraw === 'function') {
      window.redraw();
    }
  }

  function registerParams(root = document) {
    registry.clear();

    const inputs = root.querySelectorAll('input[id]');
    inputs.forEach((el) => {
      const key = (el.id || '').trim();
      if (!key) return;

      const isNumeric = el.type === 'range' || el.type === 'number';
      const defaultValue = isNumeric ? toNumber(el.value, 0) : String(el.value || '');
      const min = toNumber(el.min, Number.NEGATIVE_INFINITY);
      const max = toNumber(el.max, Number.POSITIVE_INFINITY);
      const step = toNumber(el.step, 0);
      const outputEl = ensureOutputElement(key, el);
      const param = {
        key,
        el,
        defaultValue,
        min,
        max,
        step,
        isNumeric,
        outputEl,
      };

      registry.set(key, param);

      el.addEventListener('input', () => syncParamFromElement(param));
      el.addEventListener('change', () => syncParamFromElement(param));
      syncParamFromElement(param);
    });
  }

  function clampToStep(value, param) {
    if (!Number.isFinite(param.step) || param.step <= 0) return value;
    if (!Number.isFinite(param.min)) return value;
    const steps = Math.round((value - param.min) / param.step);
    const snapped = param.min + steps * param.step;
    return Math.round(snapped * 1000) / 1000;
  }

  function setParamValue(key, value) {
    const param = registry.get(key);
    if (!param) return;

    let next;
    if (param.isNumeric) {
      next = toNumber(value, param.defaultValue);
      if (Number.isFinite(param.min)) next = Math.max(param.min, next);
      if (Number.isFinite(param.max)) next = Math.min(param.max, next);
      next = clampToStep(next, param);
    } else {
      next = String(value ?? param.defaultValue ?? '');
    }

    param.el.value = String(next);
    syncParamFromElement(param);
  }

  function getParameters() {
    return { ...values };
  }

  function randomValueForParam(param) {
    const min = Number.isFinite(param.min) ? param.min : 0;
    const max = Number.isFinite(param.max) ? param.max : 1;
    if (!Number.isFinite(param.step) || param.step <= 0) {
      return min + Math.random() * (max - min);
    }
    const steps = Math.round((max - min) / param.step);
    const idx = Math.floor(Math.random() * (steps + 1));
    return min + idx * param.step;
  }

  function randomColorValue() {
    const value = Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0');
    return `#${value}`;
  }

  function randomize(options = {}) {
    const excluded = new Set(
      Array.isArray(options.excludedParams)
        ? options.excludedParams
        : config.excludedParams
    );
    registry.forEach((param) => {
      if (excluded.has(param.key)) return;
      if (!param.isNumeric) {
        if (param.el && param.el.type === 'color') {
          setParamValue(param.key, randomColorValue());
        }
        return;
      }
      const value = randomValueForParam(param);
      setParamValue(param.key, value);
    });
  }

  function resetDefaults() {
    registry.forEach((param) => {
      setParamValue(param.key, param.defaultValue);
    });
  }

  if (typeof window !== 'undefined') {
    window.PARAMS = {
      config,
      register: registerParams,
      randomize,
      resetDefaults,
      set: setParamValue,
      get: getParameters,
      values,
      registry,
    };
  }
})();

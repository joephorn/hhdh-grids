(function () {
  const scene = {
    name: 'scene',
    keyframes: [],
  };
  let activeIndex = -1;

  function cloneParams(values) {
    return { ...values };
  }

  function normalizeKeyframe(item) {
    if (!item || typeof item !== 'object') return null;
    const params = item.params && typeof item.params === 'object' ? item.params : null;
    if (!params) return null;
    return { params: cloneParams(params) };
  }

  function normalizeScene(input) {
    if (!input || typeof input !== 'object') return null;
    const keyframes = Array.isArray(input.keyframes) ? input.keyframes : [];
    const normalized = keyframes.map(normalizeKeyframe).filter(Boolean);
    return {
      name: typeof input.name === 'string' ? input.name : 'scene',
      keyframes: normalized,
    };
  }

  function rebuildNav(navEl, onSelect) {
    if (!navEl) return;
    navEl.innerHTML = '';
    scene.keyframes.forEach((frame, idx) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(idx + 1);
      button.className = 'keyframe-nav';
      if (idx === activeIndex) button.classList.add('is-active');
      button.addEventListener('click', () => onSelect(idx));
      navEl.appendChild(button);
    });
  }

  function ensureAtLeastOne() {
    if (scene.keyframes.length === 0) {
      const params =
        typeof window !== 'undefined' && window.PARAMS
          ? window.PARAMS.get()
          : {};
      scene.keyframes.push({ params: cloneParams(params) });
      activeIndex = 0;
      return;
    }
    if (activeIndex < 0) activeIndex = 0;
    if (activeIndex >= scene.keyframes.length) {
      activeIndex = scene.keyframes.length - 1;
    }
  }

  function syncActiveFromParams() {
    if (typeof window === 'undefined' || !window.PARAMS) return;
    const frame = scene.keyframes[activeIndex];
    if (!frame) return;
    frame.params = cloneParams(window.PARAMS.get());
  }

  let listenersBound = false;
  function bindParamListeners() {
    if (listenersBound) return;
    if (typeof window === 'undefined' || !window.PARAMS) return;
    if (!window.PARAMS.registry || typeof window.PARAMS.registry.forEach !== 'function') {
      return;
    }
    window.PARAMS.registry.forEach((param) => {
      if (!param || !param.el || typeof param.el.addEventListener !== 'function') return;
      param.el.addEventListener('input', syncActiveFromParams);
      param.el.addEventListener('change', syncActiveFromParams);
    });
    listenersBound = true;
  }

  function addKeyframe(params) {
    if (typeof window === 'undefined' || !window.PARAMS) return null;
    const snapshot = params ? cloneParams(params) : cloneParams(window.PARAMS.get());
    const entry = { params: snapshot };
    scene.keyframes.push(entry);
    activeIndex = scene.keyframes.length - 1;
    return entry;
  }

  function removeKeyframe(index) {
    if (scene.keyframes.length <= 1) return null;
    const idx = Number.isFinite(index) ? index : activeIndex;
    const safeIndex =
      idx >= 0 && idx < scene.keyframes.length ? idx : scene.keyframes.length - 1;
    if (safeIndex < 0 || safeIndex >= scene.keyframes.length) return null;
    const removed = scene.keyframes.splice(safeIndex, 1)[0];
    if (activeIndex >= scene.keyframes.length) activeIndex = scene.keyframes.length - 1;
    ensureAtLeastOne();
    return removed;
  }

  function stepKeyframe(delta) {
    if (!Number.isFinite(delta) || delta === 0) return;
    ensureAtLeastOne();
    if (!scene.keyframes.length) return;
    const count = scene.keyframes.length;
    let nextIndex = (activeIndex + delta) % count;
    if (nextIndex < 0) nextIndex += count;
    if (nextIndex === activeIndex) return;
    applyKeyframe(nextIndex);
  }

  function isEditableTarget(target) {
    if (!target || typeof target !== 'object') return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  let keydownHandler = null;

  function applyKeyframe(index) {
    if (typeof window === 'undefined' || !window.PARAMS) return;
    const idx = Number.isFinite(index) ? index : activeIndex;
    const frame = scene.keyframes[idx];
    if (!frame || !frame.params) return;
    if (
      window.TRANSITIONS &&
      typeof window.TRANSITIONS.tweenTo === 'function' &&
      typeof window.TRANSITIONS.isEnabled === 'function' &&
      window.TRANSITIONS.isEnabled()
    ) {
      window.TRANSITIONS.tweenTo(frame.params);
      activeIndex = idx;
      return;
    }
    Object.entries(frame.params).forEach(([key, value]) => {
      window.PARAMS.set(key, value);
    });
    activeIndex = idx;
  }

  function setScene(input) {
    const normalized = normalizeScene(input);
    if (!normalized) return false;
    scene.name = normalized.name;
    scene.keyframes = normalized.keyframes;
    activeIndex = scene.keyframes.length ? 0 : -1;
    ensureAtLeastOne();
    return true;
  }

  function getScene() {
    return {
      name: scene.name,
      keyframes: scene.keyframes.map((frame) => ({
        params: cloneParams(frame.params),
      })),
    };
  }

  function exportScene(filename = 'scene.json') {
    const data = JSON.stringify(getScene(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function importSceneFromJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return false;
    }
    return setScene(parsed);
  }

  function importSceneFromFile(file, onDone) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importSceneFromJson(reader.result);
      if (typeof onDone === 'function') onDone(ok);
    };
    reader.readAsText(file);
  }

  function register(options = {}) {
    const addId = options.addId || 'addKeyframe';
    const removeId = options.removeId || 'removeKeyframe';
    const exportId = options.exportId || 'exportScene';
    const importInputId = options.importInputId || 'importSceneInput';
    const importButtonId = options.importButtonId || 'importScene';
    const navId = options.navId || 'keyframeNav';

    const addButton = document.getElementById(addId);
    const removeButton = document.getElementById(removeId);
    const exportButton = document.getElementById(exportId);
    const importInput = document.getElementById(importInputId);
    const importButton = document.getElementById(importButtonId);
    const navOutput = document.getElementById(navId);

    function updateUI() {
      ensureAtLeastOne();
      rebuildNav(navOutput, (idx) => {
        applyKeyframe(idx);
        updateUI();
      });
    }

    if (typeof window !== 'undefined') {
      if (keydownHandler) {
        window.removeEventListener('keydown', keydownHandler);
      }
      keydownHandler = (event) => {
        if (!event || event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (isEditableTarget(event.target)) return;
        const key = event.key;
        if (!key) return;

        if (key === '+' || key === '=') {
          addKeyframe();
          updateUI();
          event.preventDefault();
          return;
        }

        if (key === '-' || key === '_') {
          removeKeyframe();
          updateUI();
          event.preventDefault();
          return;
        }

        if (key === 'r' || key === 'R') {
          if (window.PARAMS && typeof window.PARAMS.randomize === 'function') {
            window.PARAMS.randomize();
            syncActiveFromParams();
          }
          event.preventDefault();
          return;
        }

        if (key === 'ArrowRight' || key === '>' || key === '.') {
          stepKeyframe(1);
          updateUI();
          event.preventDefault();
          return;
        }

        if (key === 'ArrowLeft' || key === '<' || key === ',') {
          stepKeyframe(-1);
          updateUI();
          event.preventDefault();
        }
      };
      window.addEventListener('keydown', keydownHandler);
    }

    if (addButton) {
      addButton.addEventListener('click', () => {
        addKeyframe();
        updateUI();
      });
    }

    if (removeButton) {
      removeButton.addEventListener('click', () => {
        removeKeyframe();
        updateUI();
      });
    }

    if (exportButton) {
      exportButton.addEventListener('click', () => exportScene());
    }

    if (importInput) {
      importInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        importSceneFromFile(file, () => updateUI());
      });
    }

    if (importButton && importInput) {
      importButton.addEventListener('click', () => {
        importInput.click();
      });
    }

    updateUI();
    bindParamListeners();
  }

  if (typeof window !== 'undefined') {
    window.SCENES = {
      register,
      addKeyframe,
      removeKeyframe,
      applyKeyframe,
      setScene,
      getScene,
      exportScene,
      importSceneFromJson,
      importSceneFromFile,
    };
  }
})();

(function () {
  const DEFAULT_RECORD_MS = 5000;
  const DEFAULT_FPS = 30;

  function getCanvasElement() {
    return (
      document.querySelector('#canvasWrap canvas') ||
      document.querySelector('canvas')
    );
  }

  function getSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
      'video/mp4;codecs=avc1',
      'video/mp4',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function recordMP4(options = {}) {
    if (typeof MediaRecorder === 'undefined') return;
    const canvas = getCanvasElement();
    if (!canvas || typeof canvas.captureStream !== 'function') return;

    const mimeType = getSupportedMimeType();
    if (!mimeType) return;

    const durationMs = Number.isFinite(options.durationMs)
      ? options.durationMs
      : DEFAULT_RECORD_MS;
    const fps = Number.isFinite(options.fps) ? options.fps : DEFAULT_FPS;

    const stream = canvas.captureStream(fps);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      const blob = new Blob(chunks, { type: mimeType });
      downloadBlob(blob, 'recording.mp4');
    });

    recorder.start();
    setTimeout(() => recorder.stop(), Math.max(0, durationMs));
  }

  function register(options = {}) {
    const recordId = options.recordId || 'recordMp4';
    const recordButton = document.getElementById(recordId);
    if (recordButton) {
      recordButton.addEventListener('click', () =>
        recordMP4({
          durationMs: options.recordDurationMs || DEFAULT_RECORD_MS,
          fps: options.recordFps || DEFAULT_FPS,
        })
      );
    }
  }

  if (typeof window !== 'undefined') {
    window.EXPORTS = {
      register,
      export: recordMP4,
    };
  }
})();

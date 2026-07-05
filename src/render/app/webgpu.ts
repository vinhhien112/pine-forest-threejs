export interface WebGPUStatus {
  readonly supported: boolean;
  readonly reason?: string;
}

export function getWebGPUStatus(): WebGPUStatus {
  if (!("gpu" in navigator)) {
    return {
      supported: false,
      reason:
        "navigator.gpu is unavailable. LAAS intentionally has no WebGL fallback; enable WebGPU or use a browser/GPU stack that supports it."
    };
  }

  if (!window.isSecureContext) {
    return {
      supported: false,
      reason:
        "WebGPU requires a secure context. Serve LAAS from localhost or HTTPS."
    };
  }

  return {
    supported: true
  };
}

export function renderWebGPUError(root: HTMLElement, reason: string): void {
  root.innerHTML = `
    <section class="webgpu-error" data-testid="webgpu-error">
      <div class="webgpu-error__panel">
        <h1>LAAS requires WebGPU</h1>
        <p>${escapeHtml(reason)}</p>
      </div>
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

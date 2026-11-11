// The WASM subpath's exports map omits the ambient package declaration.
// Re-export the canonical typed public API directly; no untyped runtime shim.
declare module 'onnxruntime-web/wasm' {
  export * from 'onnxruntime-common';
}

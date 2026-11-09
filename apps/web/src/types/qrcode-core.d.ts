// The QR encoder alone, without the canvas, SVG and terminal renderers the
// package's main entry also loads; the dashboard draws its own SVG.
declare module "qrcode/lib/core/qrcode" {
  export { create } from "qrcode";
}

import animation from './searchAnimation.json' with { type: 'json' };
export { animation };
export const PAYMENT_LAYERS = ['approved', 'phone', 'paid', 'logged', 'existing', 'transaction', 'flash'];

export function phoneProgress(time) {
  const p = animation.phone;
  if (time < p.start) return 0;
  if (time < p.arrive) return (1 - Math.cos(Math.PI * (time - p.start) / (p.arrive - p.start))) / 2;
  return 1;
}
export function layerOpacity(layer, time) {
  const phase = animation.layers[layer];
  if (time <= phase.in || (phase.hidden !== undefined && time >= phase.hidden)) return 0;
  const peak = phase.peakOpacity ?? 1;
  if (time < phase.visible) return peak * (time - phase.in) / (phase.visible - phase.in);
  if (phase.out === undefined || time <= phase.out) return peak;
  return peak * (phase.hidden - time) / (phase.hidden - phase.out);
}
// Match the app's iOS spring response, played at the configured rate.
export function insertionProgress(time) {
  const p = animation.ledger.insertion;
  const elapsed = (time - p.start) * (p.playbackRate ?? 1);
  if (elapsed <= 0) return 0;
  if (elapsed >= p.duration) return 1;
  const decay = p.damping / 2;
  const frequency = Math.sqrt(p.stiffness - decay ** 2);
  return 1 - Math.exp(-decay * elapsed) * (Math.cos(frequency * elapsed) + decay / frequency * Math.sin(frequency * elapsed));
}
export function insertionMotionExpression(variable = 't') {
  const p = animation.ledger.insertion;
  const decay = p.damping / 2;
  const frequency = Math.sqrt(p.stiffness - decay ** 2);
  const rate = p.playbackRate ?? 1;
  const elapsed = `((${variable}-${p.start})*${rate})`;
  return `if(lte(${variable},${p.start}),0,if(gte(${variable},${p.start+p.duration/rate}),1,1-exp(-${decay}*${elapsed})*(cos(${frequency}*${elapsed})+${decay/frequency}*sin(${frequency}*${elapsed}))))`;
}
// Sampling the shared cosine curve at the video frame rate keeps preview and export aligned.
export function paymentKeyframes() {
  let css = '@keyframes payment-phone {';
  for (let frame = 0; frame <= animation.duration * animation.fps; frame++) {
    const time = frame / animation.fps;
    const progress = phoneProgress(time);
    css += `${time / animation.duration * 100}%{transform:translate(${progress * animation.phone.x}px,${progress * animation.phone.y}px)}`;
  }
  css += '}';
  css += '@keyframes payment-insert {';
  for (let frame = 0; frame <= animation.duration * animation.fps; frame++) {
    const time = frame / animation.fps;
    css += `${time / animation.duration * 100}%{transform:translateY(${insertionProgress(time) * animation.ledger.entryHeight * animation.ledger.screen.height / animation.ledger.sourceHeight}px)}`;
  }
  css += '}@keyframes payment-entry-reveal {';
  for (let frame = 0; frame <= animation.duration * animation.fps; frame++) {
    const time = frame / animation.fps;
    const progress = Math.min(1, Math.max(0, insertionProgress(time)));
    css += `${time / animation.duration * 100}%{clip-path:inset(0 0 ${(1-progress)*100}% 0)}`;
  }
  css += '}';
  for (const layer of Object.keys(animation.layers)) {
    const p = animation.layers[layer];
    const peak = p.peakOpacity ?? 1;
    const end = p.out === undefined ? `100%{opacity:${peak}}`
      : `${p.out / animation.duration * 100}%{opacity:${peak}}${p.hidden / animation.duration * 100}%,100%{opacity:0}`;
    css += `@keyframes payment-${layer}{0%,${p.in / animation.duration * 100}%{opacity:0}${p.visible / animation.duration * 100}%{opacity:${peak}}${end}}`;
  }
  return css;
}
export function phoneMotionExpression() {
  const p = animation.phone;
  return `if(lt(t,${p.start}),0,if(lt(t,${p.arrive}),(1-cos(PI*(t-${p.start})/${p.arrive-p.start}))/2,1))`;
}

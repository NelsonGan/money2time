import animation from './searchAnimation.json' with { type: 'json' };

const clamp = value => Math.min(1, Math.max(0, value));
const ease = value => { const p = clamp(value); return 1 - (1-p) ** 3; };
const number = value => value.toFixed(3);

export function faceIdExpansion(time) {
  const p = animation.faceId;
  if (time < p.start || time >= p.end) return 0;
  if (time < p.expanded) return ease((time-p.start)/(p.expanded-p.start));
  if (time < p.contract) return 1;
  return 1-ease((time-p.contract)/(p.end-p.contract));
}

/** Original vector animation of the island expansion, Face ID scan and recognition.
 * Both the browser and encoder render these exact frames; no downloaded Apple art. */
export function faceIdSvg(time) {
  const config = animation.faceId;
  const expansion = faceIdExpansion(time);
  const width = 94 + 14 * expansion;
  const height = 27 + 85 * expansion;
  const radius = 13.5 + 13.5 * expansion;
  const color = config.color;
  let content = '';
  if (expansion > 0) {
    const scan = clamp((time-config.scanStart)/(config.scanEnd-config.scanStart));
    const centerY = 8 + height / 2;
    const recognized = ease((time-config.scanEnd+.1)/.2);
    const scanning = Math.sin(Math.PI*scan);
    const corner = 'M23 7h-4A12 12 0 0 0 7 19v4';
    const corners = 'M23 7h-4A12 12 0 0 0 7 19v4M41 7h4a12 12 0 0 1 12 12v4M57 41v4a12 12 0 0 1-12 12h-4M23 57h-4A12 12 0 0 1 7 45v-4';
    const features = 'M23 27v5m18-5v5m-8-6v13q0 3-4 3m-6 4q9 8 18 0';
    const scanCorners = [0,1,2,3].map(index => {
      const brightness = scanning * Math.max(0,Math.cos(2*Math.PI*(scan*1.5-index/4))) ** 2;
      return `<path d="${corner}" transform="rotate(${index*90} 32 32)" stroke="${color}" opacity="${number(brightness)}"/>`;
    }).join('');
    // Keep the Face ID glyph visible during the scan. A moving green stroke
    // follows its four rounded corners, then resolves into the recognition face.
    content = `<g opacity="${number(expansion)}" transform="translate(56 ${number(centerY-24)}) scale(.75)" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><g opacity="${number(1-recognized)}"><path d="${corners}" stroke="#99999E"/>${scanCorners}</g><circle cx="32" cy="32" r="25" stroke="${color}" opacity="${number(recognized)}"/><path d="${features}" stroke="#99999E" opacity="${number(1-recognized)}"/><path d="${features}" stroke="${color}" opacity="${number(Math.max(recognized,scanning*.45))}"/></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}"><defs><clipPath id="island-clip"><rect x="${number(80-width/2)}" y="8" width="${number(width)}" height="${number(height)}" rx="${number(radius)}"/></clipPath><filter id="island-shadow" x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="${number(3*expansion)}" flood-opacity="${number(.18*expansion)}"/></filter><radialGradient id="camera-lens"><stop stop-color="#1E3B75"/><stop offset=".4" stop-color="#101D3D"/><stop offset="1" stop-color="#08090D"/></radialGradient></defs><rect x="${number(80-width/2)}" y="8" width="${number(width)}" height="${number(height)}" rx="${number(radius)}" fill="#090909" filter="url(#island-shadow)"/><circle cx="119" cy="21.5" r="3.2" fill="url(#camera-lens)"/><g clip-path="url(#island-clip)">${content}</g></svg>`;
}

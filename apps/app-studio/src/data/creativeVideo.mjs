import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { run, runJson, briefError } from './storeUpload.mjs';
import { validateCreativeImage } from './creativeImage.mjs';
import { IOS_LOCALE_MAP } from './storeLocales.mjs';
import { animation, PAYMENT_LAYERS, phoneMotionExpression, insertionMotionExpression } from './paymentAnimation.mjs';
import { faceIdSvg } from './faceIdAnimation.mjs';

export const SEARCH_VIDEO = { width: animation.videoWidth, height: animation.videoHeight, fps: animation.fps, duration: animation.duration };
const MAX_BYTES = 24 * 1024 * 1024;
let faceIdFramesPromise;
// Hardware is shared across locales. Rasterize the original vector animation once.
function faceIdFrames() {
  return faceIdFramesPromise ??= (async () => {
    const config = animation.faceId;
    const scale = config.unitScale * animation.phone.scale * SEARCH_VIDEO.width / 3840;
    const frames = [];
    for(let frame=0;frame<SEARCH_VIDEO.duration*SEARCH_VIDEO.fps;frame++) {
      frames.push(await sharp(Buffer.from(faceIdSvg(frame/SEARCH_VIDEO.fps)))
        .resize(Math.ceil(config.width*scale),Math.ceil(config.height*scale)).png().toBuffer());
    }
    return frames;
  })();
}
export function validateVideoBytes({ locale, data } = {}) {
  if (!Object.hasOwn(IOS_LOCALE_MAP, locale) && locale !== 'fil') throw new Error('Unsupported Studio language.');
  const bytes = decodeBase64(data, MAX_BYTES);
  if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new Error('Search uploads require an MP4 video, not a still image.');
  return bytes;
}
function decodeBase64(data, limit) {
  if (typeof data !== 'string' || !data.length || data.length > Math.ceil(limit / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Provide complete base64 media within the size limit.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > limit || bytes.toString('base64') !== data) throw new Error('Provide complete base64 media within the size limit.');
  return bytes;
}
async function probeVideo(file) {
  const result = await runJson('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file], { timeout:30_000 });
  const streams = result.json?.streams ?? [];
  const video = streams.find(s => s.codec_type === 'video');
  const parts = video?.avg_frame_rate?.split('/').map(Number);
  const fps = parts?.length === 2 ? parts[0] / parts[1] : NaN;
  const duration = Number(result.json?.format?.duration);
  if (!result.ok || streams.length !== 1 || !video || video.width !== SEARCH_VIDEO.width || video.height !== SEARCH_VIDEO.height
    || !Number.isFinite(fps) || !Number.isFinite(duration) || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p' || Math.abs(fps - SEARCH_VIDEO.fps) > .01 || Math.abs(duration - SEARCH_VIDEO.duration) > .05) {
    throw new Error(`Search requires the generated ${SEARCH_VIDEO.width} × ${SEARCH_VIDEO.height}, ${SEARCH_VIDEO.fps} fps, ${SEARCH_VIDEO.duration}-second silent H.264 MP4. ${result.ok ? 'The video format does not match.' : briefError(result)}`);
  }
  return { width:video.width,height:video.height,fps,duration };
}
export async function validateCreativeVideo(input) {
  const bytes = validateVideoBytes(input);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'money2time-validate-video-'));
  try {
    const file = path.join(directory,'search.mp4');
    await fs.writeFile(file,bytes);
    return { bytes,...await probeVideo(file) };
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
}
/** Compose captured DOM layers using the same timeline as the live Studio scene. */
export async function renderSearchVideo({locale,data,layers} = {}) {
  const base = validateCreativeImage({placement:'search',locale,data});
  if (!layers || PAYMENT_LAYERS.some(key => !Object.hasOwn(layers,key))) throw new Error('The payment animation layers are missing.');
  const images = PAYMENT_LAYERS.map(key => decodeBase64(layers[key],10*1024*1024));
  if (base.length + images.reduce((size,image) => size+image.length,0) > MAX_BYTES) throw new Error('Payment artwork must be smaller than 24 MB.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'money2time-search-video-'));
  try {
    const args = ['-hide_banner','-loglevel','error','-y'];
    for (let index=0;index<=images.length;index++) {
      const bytes = index === 0 ? base : images[index-1];
      const image = sharp(bytes,{limitInputPixels:3840*2560,failOn:'warning'});
      const meta = await image.metadata();
      if (meta.width !== 3840 || meta.height !== 2560 || (index > 0 && (meta.format !== 'png' || !meta.hasAlpha))) throw new Error('Payment layers must be 3840 × 2560 transparent PNGs.');
      const file = path.join(directory,`layer-${index}.png`);
      await image.resize(SEARCH_VIDEO.width,SEARCH_VIDEO.height).png().toFile(file);
      args.push('-loop','1','-framerate',String(SEARCH_VIDEO.fps),'-i',file);
    }
    const frames = await faceIdFrames();
    for(let frame=0;frame<frames.length;frame++) await fs.writeFile(path.join(directory,`face-id-${String(frame).padStart(3,'0')}.png`),frames[frame]);
    args.push('-framerate',String(SEARCH_VIDEO.fps),'-i',path.join(directory,'face-id-%03d.png'));
    const filters = ['[0:v]format=yuv420p[base0]'];
    const progress = phoneMotionExpression();
    const insertion = insertionMotionExpression();
    const ratio = SEARCH_VIDEO.width / 3840;
    // Moving layers are captured in the raised pose; lower them to start at rest.
    // Capturing at rest would discard content below the frame before it rises.
    const x = `${animation.phone.x*ratio}*((${progress})-1)`;
    const y = `${animation.phone.y*ratio}*((${progress})-1)`;
    PAYMENT_LAYERS.forEach((layer,index) => {
      const phase = animation.layers[layer];
      let input = `${index+1}:v`;
      if (phase) {
        const fadeOut = phase.out === undefined ? '' : `,fade=t=out:st=${phase.out}:d=${phase.hidden-phase.out}:alpha=1`;
        const peak = phase.peakOpacity === undefined ? '' : `,colorchannelmixer=aa=${phase.peakOpacity}`;
        filters.push(`[${input}]format=rgba,fade=t=in:st=${phase.in}:d=${phase.visible-phase.in}:alpha=1${fadeOut}${peak}[layer${index}]`);
        input = `layer${index}`;
      }
      const moving = layer !== 'approved';
      let overlayX = moving ? x : '0';
      let overlayY = moving ? y : '0';
      if (layer === 'existing') {
        const shift = animation.ledger.entryHeight / animation.ledger.sourceHeight * animation.ledger.screen.height * animation.phone.scale * ratio;
        overlayY = `(${y})+${shift}*(${insertion})`;
      }
      if (layer === 'transaction' || layer === 'flash') {
        const { phone, ledger } = animation;
        const left = Math.floor((phone.left+phone.x+phone.width*(1-phone.scale)/2+ledger.screen.left*phone.scale)*ratio);
        const top = Math.floor((phone.top+phone.y+(ledger.screen.top+ledger.entryTop/ledger.sourceHeight*ledger.screen.height)*phone.scale)*ratio);
        const width = Math.ceil(ledger.screen.width*phone.scale*ratio);
        const height = Math.ceil(ledger.entryHeight/ledger.sourceHeight*ledger.screen.height*phone.scale*ratio);
        // Reveal only the space opened by the layout spring; older rows remain visible.
        const reveal = `min(1,max(0,${insertionMotionExpression('T')}))`;
        filters.push(`[${input}]crop=${width}:${height}:${left}:${top},format=gbrap,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*lte(Y,${height}*(${reveal}))',format=rgba[entry${index}]`);
        input = `entry${index}`;
        overlayX = `${left}+(${x})`;
        overlayY = `${top}+(${y})`;
      }
      const output = layer === 'phone' ? 'phone-base' : `base${index+1}`;
      filters.push(`[base${index}][${input}]overlay=x='${overlayX}':y='${overlayY}':eval=frame:shortest=1[${output}]`);
      if (layer === 'phone') {
        const {phone,faceId}=animation;
        const left = (phone.left+phone.x+phone.width*(1-phone.scale)/2+faceId.left*phone.scale)*ratio;
        const top = (phone.top+phone.y+faceId.top*phone.scale)*ratio;
        filters.push(`[${output}][${images.length+1}:v]overlay=x='${left}+(${x})':y='${top}+(${y})':eval=frame:shortest=1[base${index+1}]`);
      }
    });
    const videoFile = path.join(directory,'search.mp4');
    args.push('-filter_complex',filters.join(';'),'-map',`[base${PAYMENT_LAYERS.length}]`,'-frames:v',String(SEARCH_VIDEO.fps*SEARCH_VIDEO.duration),
      '-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-an','-color_range','tv','-movflags','+faststart',videoFile);
    const result = await run('ffmpeg',args,{timeout:180_000});
    if (!result.ok) throw new Error(`Could not encode the payment animation: ${briefError(result)}`);
    await probeVideo(videoFile);
    const video = await fs.readFile(videoFile);
    if (video.length > MAX_BYTES) throw new Error('The video exceeds 24 MB.');
    return video;
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
}

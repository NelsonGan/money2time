import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderSearchVideo, validateCreativeVideo, validateVideoBytes, SEARCH_VIDEO } from '../src/data/creativeVideo.mjs';
import { animation, PAYMENT_LAYERS, phoneProgress, layerOpacity } from '../src/data/paymentAnimation.mjs';
import { uploadIOSCreative, resumeIOSCreative, CREATIVE_UPLOAD_SPECS } from '../src/data/storeCreativeUpload.mjs';
import { run } from '../src/data/storeUpload.mjs';

const {phone,ledger}=animation;
const entryLeft=phone.left+phone.x+phone.width*(1-phone.scale)/2+ledger.screen.left*phone.scale;
const entryTop=phone.top+phone.y+(ledger.screen.top+ledger.entryTop/ledger.sourceHeight*ledger.screen.height)*phone.scale;
const entryShift=ledger.entryHeight/ledger.sourceHeight*ledger.screen.height*phone.scale;
const transactionPoint=[Math.floor((entryLeft+200)/2),Math.floor((entryTop+20)/2)];
const cardPoint=[Math.floor((entryLeft+400)/2),Math.floor((entryTop+180)/2)];
let fixturePromise;
function fixture() {
  return fixturePromise ??= (async () => {
    const base = await sharp({create:{width:3840,height:2560,channels:3,background:'#FBF2EA'}}).jpeg().toBuffer();
    const layers = {};
    for (const name of PAYMENT_LAYERS) {
      const color = name === 'phone' ? '#B1525F' : '#355a46';
      const y = name === 'phone' ? 900 : name === 'logged' ? 1400 : name === 'transaction' ? 1800 : 800;
      const x = name === 'phone' ? 1000 : name === 'approved' ? 2400 : 2000;
      // A confirmation panel over a white phone screen catches dark alpha-edge seams.
      const screen = name === 'phone' ? '<rect x="3100" y="500" width="600" height="1400" fill="white"/>'
        : name === 'paid' ? '<rect x="3100" y="1000" width="600" height="600" fill="white"/>' : '';
      // A phone extending through the frame edge must not expose a floating cut
      // as it rises. The last strip also identifies the fully raised capture pose.
      const edge = name === 'phone' ? '<rect x="1500" y="2000" width="300" height="560" fill="#B1525F"/><rect x="1500" y="2520" width="300" height="40" fill="#355a46"/>' : '';
      const card=`<rect x="${entryLeft+100}" y="${entryTop+100}" width="500" height="160" fill="${name==='existing'?'#355a46':name==='flash'?'#B1525F':'white'}"/>`;
      const content = name === 'transaction' ? `<rect x="${entryLeft+100}" y="${entryTop+5}" width="500" height="35" fill="#007AFF"/>${card}`
        : name === 'existing' || name === 'flash' ? card
        : `<rect x="${x}" y="${y}" width="400" height="200" fill="${color}"/>`;
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2560">${content}${screen}${edge}</svg>`);
      layers[name] = (await sharp(svg).png().toBuffer()).toString('base64');
    }
    const artwork = {locale:'en',data:base.toString('base64'),layers};
    const video = await renderSearchVideo(artwork);
    return {artwork,video};
  })();
}

test('the actual encoder makes a silent 3:2 H.264 video with moving phone, payment confirmation and a logged transaction', async () => {
  const {video} = await fixture();
  const result = await validateCreativeVideo({locale:'en',data:video.toString('base64')});
  assert.deepEqual({width:result.width,height:result.height,fps:result.fps,duration:result.duration}, SEARCH_VIDEO);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'money2time-video-test-'));
  try {
    const file = path.join(dir,'search.mp4'); await fs.writeFile(file,video);
    const colors = [];
    const confirmed=(animation.layers.paid.visible+animation.layers.paid.out)/2;
    for (const time of [0,confirmed,5,6.8,7.6,7.95]) {
      const frame = path.join(dir,`${time}.png`);
      const decoded = await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(time),'-i',file,'-frames:v','1',frame]);
      assert.equal(decoded.ok,true,decoded.stderr);
      const at = async (left,top) => [...await sharp(frame).extract({left,top,width:1,height:1}).removeAlpha().raw().toBuffer()];
      colors.push({phone:await at(680,475-animation.phone.y/2),approach:await at(550,475),paid:await at(1050,450),logged:await at(1050,750),transaction:await at(...transactionPoint),edge:await at(800,1270)});
      if (time === confirmed) {
        const whiteScreen = await sharp(frame).extract({left:1600,top:250,width:140,height:400}).removeAlpha().raw().toBuffer();
        assert.ok(whiteScreen.every(channel => channel > 245),'Confirmation stays white across the panel edges');
      }
    }
    const cream = ([r,g,b]) => r>240 && g>220 && b>210;
    assert.equal(cream(colors[0].phone),false);
    assert.equal(cream(colors[1].phone),true,'Phone leaves its original position as it approaches the reader');
    assert.equal(cream(colors[3].phone),true,'Phone stays raised after payment');
    assert.equal(cream(colors[4].phone),true,'The phone never returns to its original position');
    assert.equal(cream(colors[5].phone),true);
    assert.equal(cream(colors[0].approach),true);
    assert.equal(cream(colors[1].approach),false,'The phone rises from below to the reader position');
    assert.equal(cream(colors[3].approach),false,'Phone holds the tap position while the transaction is shown');
    assert.equal(cream(colors[4].approach),false,'The phone remains visible throughout the last second');
    assert.equal(cream(colors[5].approach),false,'The final encoded frame retains the raised phone');
    assert.equal(cream(colors[0].paid),true);
    assert.equal(cream(colors[1].paid),false,'Done appears after the phone taps the reader');
    assert.equal(cream(colors[2].paid),true,'The confirmation gives way to the app ledger');
    assert.equal(cream(colors[0].logged),true);
    assert.equal(cream(colors[1].logged),true,'Transaction screen waits for confirmation');
    assert.equal(cream(colors[2].logged),false,'Logged transaction appears inside the moving phone');
    assert.equal(cream(colors[3].logged),false);
    assert.equal(cream(colors[4].logged),false);
    assert.equal(cream(colors[5].logged),false,'The app remains on screen at the end');
    assert.equal(cream(colors[1].transaction),true,'The new ledger entry waits until payment is done');
    assert.equal(cream(colors[2].transaction),false,'The real ledger entry appears after the app opens');
    assert.equal(cream(colors[3].transaction),false);
    assert.equal(cream(colors[4].transaction),false);
    assert.equal(cream(colors[5].transaction),false,'The logged entry stays visible in the final frame');
    assert.equal(cream(colors[0].edge),false,'The phone naturally continues through the frame edge at rest');
    assert.ok(colors[1].edge[1] > colors[1].edge[0],'Rising reveals the bottom of the raised capture without an interior cut');
    assert.equal(cream(colors[2].edge),false,'The phone still meets the frame edge while the transaction is shown');
    assert.equal(cream(colors[3].edge),false);
    assert.equal(cream(colors[4].edge),false,'The phone never disappears from the bottom edge');
    assert.equal(cream(colors[5].edge),false);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('encoded Face ID grows down from the island, animates the face outline, and contracts after recognition', async () => {
  const {video}=await fixture();
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'money2time-face-id-test-'));
  try {
    const file=path.join(dir,'search.mp4');await fs.writeFile(file,video);
    const scanFrames=[];
    const {faceId,phone}=animation;
    const scanA=faceId.scanStart+(faceId.scanEnd-faceId.scanStart)*.35;
    const scanB=faceId.scanStart+(faceId.scanEnd-faceId.scanStart)*.6;
    const recognized=(faceId.scanEnd+faceId.contract)/2;
    for(const [time,expanded] of [[0,false],[scanA,true],[scanB,true],[recognized,true],[faceId.end+.25,false]]) {
      const frame=path.join(dir,`${time}.png`);
      const decoded=await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(time),'-i',file,'-frames:v','1',frame]);
      assert.equal(decoded.ok,true,decoded.stderr);
      const scale=faceId.unitScale*phone.scale/2;
      const offset=-phone.y/2*(1-phoneProgress(time));
      const left=Math.floor((phone.left+phone.x+phone.width*(1-phone.scale)/2+faceId.left*phone.scale)/2);
      const top=Math.round((phone.top+phone.y+faceId.top*phone.scale)/2+offset);
      const expandedPixel=[...await sharp(frame).extract({left:Math.round(left+80*scale),top:Math.round(top+105*scale),width:1,height:1}).removeAlpha().raw().toBuffer()];
      assert.equal(expandedPixel.every(channel=>channel<35),expanded,'The black island extends downward only during authentication');
      // Inspect the panel rather than transparent space that exposes the terminal.
      const pixels=await sharp(frame).extract({left,top,width:Math.ceil(faceId.width*scale),height:Math.ceil((expanded?120:35)*scale)}).removeAlpha().raw().toBuffer();
      let green=0;for(let i=0;i<pixels.length;i+=3)if(pixels[i+1]>50&&pixels[i+1]>pixels[i]*1.5&&pixels[i+1]>pixels[i+2]*1.25)green++;
      assert.equal(green>100,expanded,'Green recognition appears inside the expanded island');
      if(time===scanA||time===scanB)scanFrames.push(pixels);
    }
    let changed=0;for(let i=0;i<scanFrames[0].length;i++)if(Math.abs(scanFrames[0][i]-scanFrames[1][i])>30)changed++;
    assert.ok(changed>500,'The green scan moves along the Face ID outline');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('a new expense opens space, pushes older rows down, flashes rose briefly, and remains after the flash', async () => {
  const {video}=await fixture();
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'money2time-insert-test-'));
  try {
    const file=path.join(dir,'search.mp4');await fs.writeFile(file,video);
    const positions=[];
    const before=ledger.insertion.start-.15;
    const entering=ledger.insertion.start+.1;
    const peak=animation.layers.flash.visible+1/animation.fps;
    const settled=ledger.insertion.start+ledger.insertion.duration/ledger.insertion.playbackRate+.1;
    for(const time of [before,entering,peak,settled,6.2,7.95]) {
      const frame=path.join(dir,`${time}.png`);
      const decoded=await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(time),'-i',file,'-frames:v','1',frame]);
      assert.equal(decoded.ok,true,decoded.stderr);
      const point=[...await sharp(frame).extract({left:cardPoint[0],top:cardPoint[1],width:1,height:1}).removeAlpha().raw().toBuffer()];
      if(time===before)assert.ok(point[1]>point[0]+15,'The older expense initially occupies this slot');
      if(time===peak)assert.ok(point[0]>point[1]+15&&point[1]<225,'The inserted expense has a brief rose background');
      if(time>=6.2)assert.ok(point.every(channel=>channel>245),'The new row returns to its normal white background');
      const top=Math.floor(entryTop/2);
      const pixels=await sharp(frame).extract({left:Math.floor((entryLeft+200)/2),top,width:80,height:450}).removeAlpha().raw().toBuffer();
      let sum=0,count=0;for(let i=0;i<pixels.length;i+=3)if(pixels[i+1]>pixels[i]+15&&pixels[i+2]<120){sum+=Math.floor(i/3/80);count++;}
      assert.ok(count>500,'Older expenses stay visible during and after insertion');
      if(time===before||time===entering||time===6.2)positions.push(sum/count);
    }
    assert.ok(positions[1]>positions[0]+30&&positions[1]<positions[2],'Existing rows move smoothly while the new row enters');
    assert.ok(Math.abs(positions[2]-positions[0]-entryShift/2)<2,'The old expense is displaced by one new day section');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('rejects still images, forged MP4s, incomplete layers and opaque animation layers locally', async () => {
  const {artwork} = await fixture();
  assert.throws(()=>validateVideoBytes({locale:'en',data:artwork.data}),/MP4 video/);
  assert.throws(()=>validateVideoBytes({locale:'__proto__',data:artwork.data}),/Unsupported/);
  const forged = Buffer.alloc(24); forged.write('ftyp',4);
  await assert.rejects(validateCreativeVideo({locale:'en',data:forged.toString('base64')}),/generated/);
  await assert.rejects(renderSearchVideo({...artwork,layers:{}}),/layers are missing/);
  const opaque = await sharp({create:{width:3840,height:2560,channels:3,background:'#fff'}}).png().toBuffer();
  await assert.rejects(renderSearchVideo({...artwork,layers:{...artwork.layers,phone:opaque.toString('base64')}}),/transparent PNG/);
  assert.equal(phoneProgress(0),0); assert.equal(phoneProgress(animation.duration),1);
  assert.equal(layerOpacity('transaction',3),0); assert.equal(layerOpacity('transaction',5),1);
  assert.equal(layerOpacity('transaction',animation.duration),1);
  assert.equal(layerOpacity('logged',animation.duration+1),1);
  assert.equal(layerOpacity('approved',animation.duration),1);
});

function videoStore(video, {failNew = false} = {}) {
  const calls = [];
  let playable = false;
  let oldIndex = 0;
  const placements = new Map();
  const current = locale => {
    if (!placements.has(locale)) placements.set(locale,[{id:`old-${++oldIndex}`,attributes:{placementType:CREATIVE_UPLOAD_SPECS.search.placementType,state:'ACTIVE'},relationships:{image:{data:{type:'appAssetLibraryImages',id:'old-image'}}}}]);
    return placements.get(locale);
  };
  const opts = {
    appId:'app',jobs:new Map(),processingTimeoutMs:0,wait:async()=>{},
    version:async()=>({id:'version',versionString:'2.0'}),localization:async(_,locale)=>({id:locale}),
    fetchBinary:async(_,init)=>{assert.deepEqual(init.body,video);return {ok:true};},
    request:async(url,{method='GET',body}={})=>{
      calls.push({url,method,body});
      if(url==='/v1/appStoreVersions/version') return {data:{attributes:{platform:'IOS',appStoreState:'PREPARE_FOR_SUBMISSION'}}};
      if(url==='/v1/apps/app/assetLibrary') return {data:{type:'appAssetLibraries',id:'library'}};
      if(url==='/v1/appAssetLibraryVideos' && method==='POST') return {data:{id:'new-video',attributes:{uploadOperations:[{method:'PUT',url:'https://uploads.apple.com/video',offset:0,length:video.length}]}}};
      if(url==='/v1/appAssetLibraryVideos/new-video' && method==='PATCH') return {};
      if(url==='/v1/appAssetLibraryVideos/new-video') return {data:{attributes:{state:'PREPARE_FOR_SUBMISSION',specId:'spec',videoAsset:playable?'https://video.apple.com/asset':null,previewFrameImage:{image:{width:1920,height:1280}}}}};
      if(url.includes('/placements?')) return {data:structuredClone(current(url.split('/')[3]))};
      if(method==='DELETE') {for(const list of placements.values()){const i=list.findIndex(p=>p.id===url.split('/').at(-1));if(i>=0)list.splice(i,1);}return {};}
      if(url==='/v1/appAssetLibraryPlacements' && method==='POST') {
        if(failNew && body.data.relationships.video) throw new Error('Assignment rejected');
        const locale=body.data.relationships.appStoreVersionLocalization.data.id;
        current(locale).push({...structuredClone(body.data),id:`p-${calls.length}`,attributes:{...body.data.attributes,state:'ACTIVE'}});
        return {};
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    }
  };
  return {opts,calls,current,ready:()=>{playable=true;}};
}

test('Search waits for a playable video, resumes one reservation and assigns video to every regional field', async () => {
  const {video} = await fixture();
  const store = videoStore(video);
  const pending = await uploadIOSCreative({placement:'search',locale:'en',data:video.toString('base64')},store.opts);
  assert.equal(pending.pending,true,'Ready state plus poster is insufficient without playable video');
  assert.equal(store.calls.some(c=>c.url.includes('placements')),false);
  const reserve=store.calls.find(c=>c.url==='/v1/appAssetLibraryVideos');
  assert.equal(reserve.body.data.attributes.fileName,'money2time-search-en.mp4');
  store.ready();
  store.opts.version=()=>{throw new Error('Do not choose another draft');};
  const result=await resumeIOSCreative(pending,store.opts);
  assert.deepEqual(result.uploaded,['en-US','en-GB','en-AU','en-CA']);
  assert.equal(store.calls.filter(c=>c.url==='/v1/appAssetLibraryVideos').length,1);
  assert.ok(result.uploaded.every(locale=>store.current(locale)[0].relationships.video.data.id==='new-video'));
  await resumeIOSCreative(result,store.opts);
  assert.equal(store.calls.filter(c=>c.url==='/v1/appAssetLibraryPlacements' && c.method==='POST').length,4);
});

test('failed video assignment restores the previous image, and invalid video makes no Store request', async () => {
  const {video,artwork} = await fixture();
  const store = videoStore(video,{failNew:true});store.ready();
  const result = await uploadIOSCreative({placement:'search',locale:'de',data:video.toString('base64')},store.opts);
  assert.equal(result.uploaded.length,0); assert.match(result.errors[0],/previous creative was restored/);
  assert.equal(store.current('de-DE')[0].relationships.image.data.id,'old-image');
  store.calls.length=0;
  await assert.rejects(uploadIOSCreative({placement:'search',locale:'en',data:artwork.data},store.opts),/MP4 video/);
  const forged=Buffer.alloc(24);forged.write('ftyp',4);
  await assert.rejects(uploadIOSCreative({placement:'search',locale:'en',data:forged.toString('base64')},store.opts),/generated/);
  assert.equal(store.calls.length,0);
});

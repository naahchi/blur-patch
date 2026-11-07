import {
  Input, BlobSource, ALL_FORMATS,
  Output, Mp4OutputFormat, StreamTarget, Conversion
} from "https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm";

const $ = id => document.getElementById(id);
const video = $("preview"), canvas = $("canvas"), ctx = canvas.getContext("2d");
let file=null, fileUrl=null, resultUrl=null, selection=null, pointerStart=null;
let shape="rect", cloneSource=null, running=false, cancelFlag=false, conversionRef=null;
let timer=null, started=0;

function say(s){$("status").textContent=s}
function setProgress(p){p=Math.max(0,Math.min(100,p));$("bar").style.width=p+"%";$("pct").textContent=p.toFixed(1)+"%"}
function fmt(ms){let s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")}
function elapsed(){ $("elapsed").textContent=fmt(performance.now()-started); }

function drawSelection(){
 if(!canvas.width)return;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 if(video.readyState>=2)ctx.drawImage(video,0,0,canvas.width,canvas.height);
 if(selection){
  ctx.save();ctx.strokeStyle="#ff3b30";ctx.lineWidth=Math.max(2,canvas.width/400);ctx.setLineDash([9,6]);
  const {x,y,w,h}=selection;
  if(shape==="circle"){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,Math.abs(w)/2,Math.abs(h)/2,0,0,Math.PI*2);ctx.stroke()}
  else ctx.strokeRect(x,y,w,h);
  ctx.restore();
 }
}
function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
canvas.addEventListener("pointerdown",e=>{
 if(!file||running)return;
 const p=pos(e);
 if($("method").value==="clone"&&selection&&!cloneSource){cloneSource=p;$("cloneStatus").textContent=`Clone source: ${Math.round(p.x)}, ${Math.round(p.y)}`;return}
 pointerStart=p;selection={x:p.x,y:p.y,w:0,h:0};canvas.setPointerCapture(e.pointerId);drawSelection();
});
canvas.addEventListener("pointermove",e=>{
 if(!pointerStart)return;const p=pos(e);selection.w=p.x-pointerStart.x;selection.h=p.y-pointerStart.y;drawSelection();
});
canvas.addEventListener("pointerup",()=>{if(pointerStart){pointerStart=null;normalizeSelection();drawSelection();say("Selection तैयार है।")}});

function normalizeSelection(){
 if(!selection)return;
 let {x,y,w,h}=selection;
 if(w<0){x+=w;w=-w}if(h<0){y+=h;h=-h}
 selection={x:Math.max(0,x),y:Math.max(0,y),w:Math.min(w,canvas.width-x),h:Math.min(h,canvas.height-y)};
}
$("rect").onclick=()=>{shape="rect";$("rect").classList.add("selected");$("circle").classList.remove("selected");drawSelection()};
$("circle").onclick=()=>{shape="circle";$("circle").classList.add("selected");$("rect").classList.remove("selected");drawSelection()};
$("clear").onclick=()=>{selection=null;cloneSource=null;$("cloneStatus").textContent="Clone source सेट नहीं है।";drawSelection();say("Selection साफ कर दी गई।")};
$("method").onchange=()=>{
 const m=$("method").value;
 $("blurOptions").hidden=m!=="blur";$("pixelOptions").hidden=m!=="pixel";$("cloneOptions").hidden=m!=="clone";
 if(m==="clone")$("cloneStatus").textContent="पहले watermark area select करें, फिर पास के साफ हिस्से पर tap करें।";
};
for(const [id,label] of [["blur","blurVal"],["pixel","pixelVal"],["soft","softVal"]])$(id).oninput=e=>$(label).textContent=e.target.value;

$("file").onchange=e=>{
 const f=e.target.files?.[0];if(!f)return;
 if(fileUrl)URL.revokeObjectURL(fileUrl);if(resultUrl)URL.revokeObjectURL(resultUrl);
 file=f;fileUrl=URL.createObjectURL(f);video.src=fileUrl;selection=null;cloneSource=null;
 $("download").hidden=true;$("placeholder").hidden=false;$("start").disabled=true;setProgress(0);
};
video.addEventListener("loadedmetadata",()=>{
 canvas.width=video.videoWidth;canvas.height=video.videoHeight;drawSelection();$("placeholder").hidden=true;
 $("meta").textContent=`${video.videoWidth} × ${video.videoHeight} · ${video.duration.toFixed(2)} sec · ${(file.size/1048576).toFixed(2)} MB`;
 $("start").disabled=false;say("वीडियो तैयार है। Watermark area select करें।");
});
video.addEventListener("timeupdate",drawSelection);

function buildPatchResources(width,height,sel,clonePoint){
 const x=Math.max(0,Math.floor(sel.x)),y=Math.max(0,Math.floor(sel.y));
 const rw=Math.max(1,Math.min(width-x,Math.ceil(sel.w))),rh=Math.max(1,Math.min(height-y,Math.ceil(sel.h)));
 const patch=document.createElement("canvas");patch.width=rw;patch.height=rh;
 const patchCtx=patch.getContext("2d");
 const mask=document.createElement("canvas");mask.width=rw;mask.height=rh;
 const mc=mask.getContext("2d");
 mc.fillStyle="#fff";
 if(shape==="circle"){mc.beginPath();mc.ellipse(rw/2,rh/2,rw/2,rh/2,0,0,Math.PI*2);mc.fill()}
 else mc.fillRect(0,0,rw,rh);
 const soft=Number($("soft").value);
 if(soft>0){
  mc.globalCompositeOperation="destination-out";
  const fades=[
   [mc.createLinearGradient(0,0,soft,0),0,0,soft,rh],
   [mc.createLinearGradient(rw,0,rw-soft,0),rw-soft,0,soft,rh],
   [mc.createLinearGradient(0,0,0,soft),0,0,rw,soft],
   [mc.createLinearGradient(0,rh,0,rh-soft),0,rh-soft,rw,soft]
  ];
  for(const [g,x0,y0,w0,h0] of fades){g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,1)");mc.fillStyle=g;mc.fillRect(x0,y0,w0,h0)}
 }
 return {x,y,rw,rh,patch,patchCtx,mask,clonePoint};
}
function patchFrame(frameCanvas, resources){
 const {x,y,rw,rh,patch,patchCtx,mask,clonePoint}=resources;
 const method=$("method").value;
 patchCtx.clearRect(0,0,rw,rh);
 if(method==="blur"){
  // Downsample first, then blur the small patch to reduce per-frame work.
  const scale=Math.max(1,Math.round(Number($("blur").value)/2));
  const sw=Math.max(1,Math.ceil(rw/scale)),sh=Math.max(1,Math.ceil(rh/scale));
  if(!resources.small){resources.small=document.createElement("canvas");resources.smallCtx=resources.small.getContext("2d")}
  resources.small.width=sw;resources.small.height=sh;
  resources.smallCtx.drawImage(frameCanvas,x,y,rw,rh,0,0,sw,sh);
  patchCtx.imageSmoothingEnabled=true;
  patchCtx.filter=`blur(${Number($("blur").value)}px)`;
  patchCtx.drawImage(resources.small,0,0,sw,sh,0,0,rw,rh);
  patchCtx.filter="none";
 }else if(method==="pixel"){
  const block=Number($("pixel").value),sw=Math.max(1,Math.ceil(rw/block)),sh=Math.max(1,Math.ceil(rh/block));
  if(!resources.small){resources.small=document.createElement("canvas");resources.smallCtx=resources.small.getContext("2d")}
  resources.small.width=sw;resources.small.height=sh;
  resources.smallCtx.imageSmoothingEnabled=false;
  resources.smallCtx.drawImage(frameCanvas,x,y,rw,rh,0,0,sw,sh);
  patchCtx.imageSmoothingEnabled=false;patchCtx.drawImage(resources.small,0,0,sw,sh,0,0,rw,rh);patchCtx.imageSmoothingEnabled=true;
 }else{
  if(!clonePoint)throw new Error("Clone source select नहीं किया गया।");
  const sx=Math.max(0,Math.min(frameCanvas.width-rw,Math.round(clonePoint.x-rw/2)));
  const sy=Math.max(0,Math.min(frameCanvas.height-rh,Math.round(clonePoint.y-rh/2)));
  if(Math.abs(sx-x)<rw*0.7&&Math.abs(sy-y)<rh*0.7)throw new Error("Clone source watermark selection से दूर चुनें।");
  patchCtx.drawImage(frameCanvas,sx,sy,rw,rh,0,0,rw,rh);
 }
 patchCtx.globalCompositeOperation="destination-in";
 patchCtx.drawImage(mask,0,0);
 patchCtx.globalCompositeOperation="source-over";
 frameCanvas.getContext("2d").drawImage(patch,x,y);
}


async function saveToDevice(){
 const a=$("download");
 if(a.hidden||!resultUrl)return say("पहले वीडियो प्रोसेस करें।");
 try{
  const sourceFile=await (await fetch(resultUrl)).blob();
  const suggestedName=`watermark-patched-${Date.now()}.mp4`;
  if(window.showSaveFilePicker){
   const handle=await window.showSaveFilePicker({
    suggestedName,
    types:[{description:"MP4 video",accept:{"video/mp4":[".mp4"]}}]
   });
   const writable=await handle.createWritable();
   await sourceFile.stream().pipeTo(writable);
   say(`वीडियो डिवाइस में सेव हो गया · ${(sourceFile.size/1048576).toFixed(2)} MB`);
   return;
  }
  if(navigator.canShare && navigator.share && window.File){
   const f=new File([sourceFile],suggestedName,{type:"video/mp4"});
   if(navigator.canShare({files:[f]})){
    await navigator.share({files:[f],title:"Processed video"});
    say("Share sheet खुल गई। Save to device/Files चुनें।");
    return;
   }
  }
  // Fallback: normal browser download; keep OPFS source file until page closes.
  a.click();
  say("Chrome download शुरू करने की कोशिश की गई। अगर confirmation आए तो Download दबाएँ।");
 }catch(err){
  if(err?.name==="AbortError")say("Save cancel किया गया। वीडियो अभी तैयार है; दोबारा Save to device दबा सकते हैं।");
  else {console.error(err);say("Save error: "+(err?.message||String(err))+". तैयार वीडियो अभी पेज में मौजूद है; दोबारा कोशिश करें।");}
 }
}

async function process(){
 if(running)return;
 if(!file||!selection)return say("वीडियो और watermark selection जरूरी हैं।");
 if(selection.w<3||selection.h<3)return say("Selection थोड़ा बड़ा बनाएं।");
 if($("method").value==="clone"&&!cloneSource)return say("Clone Patch के लिए दूसरा साफ source point चुनें।");
 if(typeof VideoDecoder==="undefined"||typeof VideoEncoder==="undefined")return say("इस browser में WebCodecs उपलब्ध नहीं है।");
 running=true;let maskCanvas,conversion,output,opfsRoot,outputName,outputHandle,outputWritable,completed=false;
 cancelFlag=false;started=performance.now();
 $("start").disabled=true;$("cancel").disabled=false;$("file").disabled=true;$("download").hidden=true;
 timer=setInterval(elapsed,500);setProgress(0);$("frames").textContent="0";
 try{
  say("Video demux और codec जांच शुरू…");
  const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
  const track=await input.getPrimaryVideoTrack();
  if(!track)throw new Error("Video track नहीं मिला।");
  if(!(await track.canDecode()))throw new Error("Source video codec decode नहीं हो रहा।");
  const width=await track.getDisplayWidth(),height=await track.getDisplayHeight(),duration=await input.computeDuration();
  const frameCanvas=document.createElement("canvas");frameCanvas.width=width;frameCanvas.height=height;
  const frameCtx=frameCanvas.getContext("2d");
  const patchResources=buildPatchResources(width,height,selection,cloneSource);
  let count=0,lastPaint=0;
  if(!navigator.storage?.getDirectory)throw new Error("इस Chrome में OPFS disk storage उपलब्ध नहीं है। डाउनलोड को सुरक्षित रखने के लिए यह जरूरी है।");
  say("फोन की disk storage तैयार हो रही है…");
  opfsRoot=await navigator.storage.getDirectory();
  outputName=`watermark-patched-v4-${Date.now()}.mp4`;
  outputHandle=await opfsRoot.getFileHandle(outputName,{create:true});
  outputWritable=await outputHandle.createWritable({keepExistingData:false});
  output=new Output({
    format:new Mp4OutputFormat(),
    target:new StreamTarget(outputWritable,{chunked:true,chunkSize:1024*1024})
  });
  conversion=await Conversion.init({
   input,output,tracks:"primary",
   video:{
    forceTranscode:true,
    process:async sample=>{
     if(cancelFlag)throw new Error("आपने processing रोक दी।");
     sample.draw(frameCtx,0,0,width,height);
     patchFrame(frameCanvas,patchResources);
     count++;$("frames").textContent=String(count);
     const p=duration?Math.min(99,sample.timestamp/duration*100):0;setProgress(p);
     if(performance.now()-lastPaint>200){lastPaint=performance.now();say(`Frame processing… ${p.toFixed(1)}% · ${count} frames · ${sample.timestamp.toFixed(2)}s / ${duration.toFixed(2)}s`);}
     await new Promise(r=>setTimeout(r,0));
     if(cancelFlag)throw new Error("आपने processing रोक दी।");
     return frameCanvas;
    }
   }
  });
  conversionRef=conversion;
  if(!conversion.isValid)throw new Error("Video conversion unsupported: "+conversion.discardedTracks.map(x=>x.reason).join("; "));
  conversion.onProgress=p=>{setProgress(p*100);say(`Encoding… ${(p*100).toFixed(1)}% · ${count} frames`)};
  say("Frame-by-frame processing शुरू…");
  await conversion.execute();
  if(cancelFlag)throw new Error("आपने processing रोक दी।");
  const savedFile=await outputHandle.getFile();
  if(!savedFile.size)throw new Error("Output file खाली है।");
  resultUrl=URL.createObjectURL(savedFile);
  const a=$("download");a.href=resultUrl;a.download=`watermark-patched-${new Date().toISOString().replace(/[:.]/g,"-")}.mp4`;a.hidden=false;
  $("saveDevice").hidden=false;
  completed=true; // Keep the OPFS file alive: the download URL reads from this file.
  setProgress(100);say(`पूरा हुआ · ${count} frames · ${(savedFile.size/1048576).toFixed(2)} MB · MP4 तैयार है। अब “Save to device” दबाएँ।`);
 }catch(e){console.error(e);say("Error: "+(e.message||e));}
 finally{
  try{if(conversion&&conversion.state!=="done")await conversion.cancel()}catch{}
  if(!completed&&outputWritable){try{await outputWritable.abort()}catch{}}
  if(!completed&&opfsRoot&&outputName){try{await opfsRoot.removeEntry(outputName)}catch{}}
  conversionRef=null;running=false;clearInterval(timer);$("start").disabled=false;$("cancel").disabled=true;$("file").disabled=false;
 }
}
$("start").onclick=process;
$("cancel").onclick=async()=>{cancelFlag=true;$("cancel").disabled=true;say("Cancel request भेजा गया…");try{await conversionRef?.cancel()}catch{}};

$("saveDevice").onclick=saveToDevice;

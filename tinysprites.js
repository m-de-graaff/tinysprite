/*!
 * TinySprites v2.1.1 — tiny runtime (no editor)
 * MIT License
 *
 * Packed format:
 *   "{w36}x{h36}|{pal}|{rle}"
 *   - w36,h36: base36 integers
 *   - pal: dot or comma separated hex tokens WITHOUT '#', e.g. "000.fc0.d70"
 *           (You can still pass "#000,#fc0" and we'll accept it on decode.)
 *           Index 0 is implicit transparent; tokens map to indices 1..26 (A..Z).
 *   - rle: base36 run length + symbol, where symbol is:
 *           'T' => index 0 (transparent), 'A'..'Z' => 1..26
 *
 * API:
 *   create, makePalette, encodePacked, decodePacked,
 *   toImageData, toCanvas, draw,
 *   flipH, flipV, rot90, rot180, rot270,
 *   toImage, toBitmap
 */

(function(){
    const b36=n=>n.toString(36), p36=s=>parseInt(s,36);
    const symToIndex=ch=>ch==='T'?0:(ch.charCodeAt(0)-64);
    const indexToSym=i=>i===0?'T':String.fromCharCode(64+i);
  
    function hexToRgba(hex){
      if(!hex)return[0,0,0,0];
      hex=String(hex).replace('#','').trim().toLowerCase();
      let r=0,g=0,b=0,a=255;
      if(hex.length===3){r=parseInt(hex[0]+hex[0],16);g=parseInt(hex[1]+hex[1],16);b=parseInt(hex[2]+hex[2],16);}
      else if(hex.length===4){r=parseInt(hex[0]+hex[0],16);g=parseInt(hex[1]+hex[1],16);b=parseInt(hex[2]+hex[2],16);a=parseInt(hex[3]+hex[3],16);}
      else if(hex.length===6){r=parseInt(hex.slice(0,2),16);g=parseInt(hex.slice(2,4),16);b=parseInt(hex.slice(4,6),16);}
      else if(hex.length===8){r=parseInt(hex.slice(0,2),16);g=parseInt(hex.slice(2,4),16);b=parseInt(hex.slice(4,6),16);a=parseInt(hex.slice(6,8),16);}
      else a=0;
      return[r,g,b,a];
    }
  
    function makePalette(hexTokens){
      const pal=[[0,0,0,0]]; if(!hexTokens)hexTokens=[];
      for(let i=0;i<hexTokens.length&&pal.length<27;i++) pal.push(hexToRgba(hexTokens[i]));
      return pal;
    }
  
    function create(w,h,fillIndex,paletteHex){
      w|=0;h|=0; if(fillIndex==null)fillIndex=0; if(!paletteHex)paletteHex=[];
      const data=new Uint8Array(w*h); if(fillIndex)data.fill(fillIndex);
      return{w,h,data,palette:makePalette(paletteHex)};
    }

    const toRGB3=t=>{
        t=(t[0]==='#'?t.slice(1):t).toLowerCase();
        if(t.length===6){
          const q=n=>Math.max(0,Math.min(15,Math.round(parseInt(n,16)/17))).toString(16);
          return q(t.slice(0,2))+q(t.slice(2,4))+q(t.slice(4,6));
        }
        return t.slice(0,3);
      };
  
      // rawMode=true => literal symbols (TTT…); false (default) => base36 RLE (5T)
      function encodePacked(sprite,paletteHex,rawMode){
        const {w,h,data}=sprite;
        let palStr=''; if(paletteHex&&paletteHex.length){
          palStr=paletteHex.map(toRGB3).join('.');
        }
        let end=data.length;
        while(end>0&&data[end-1]===0)end--; // trim trailing transparent
        let rle='';
        if(rawMode){
          for(let i=0;i<end;i++) rle+=indexToSym(data[i]);
        }else{
          if(end>0){
            let runSym=data[0],runLen=1;
            for(let i=1;i<end;i++){
              const v=data[i];
              if(v===runSym) runLen++;
              else{ rle+=b36(runLen)+indexToSym(runSym); runSym=v; runLen=1; }
            }
            if(runSym!==0) rle+=b36(runLen)+indexToSym(runSym);
          }
        }
        return b36(w)+'x'+b36(h)+'|'+palStr+'|'+rle;
      }

    function encodeWithBestOrder(sprite,paletteHex,rawMode=false){
      const orders=[{id:'',map:null},{id:'Z',map:zigzagMap(sprite.w,sprite.h)}];
      let best=null;
      for(const o of orders){
        const mapped=o.map?{w:sprite.w,h:sprite.h,data:(()=>{const d=new Uint8Array(sprite.data.length);for(let i=0;i<o.map.length;i++)d[i]=sprite.data[o.map[i]];return d;})(),palette:sprite.palette}:sprite;
        const enc=encodePacked(mapped,paletteHex,rawMode);
        const parts=enc.split('|');
        const cand=o.id?parts[0]+'|'+parts[1]+'|'+o.id+parts[2]:enc;
        if(!best||cand.length<best.length)best=cand;
      }
      return best;
    }

    function encodeAuto(sprite,paletteHex){
      const a=encodeWithBestOrder(sprite,paletteHex,false);
      const b=encodeWithBestOrder(sprite,paletteHex,true);
      return a.length<=b.length?a:b;
    }

    function decodePacked(str){
      const parts=String(str).split('|');
      const dims=(parts[0]||'').split('x');
      const w=p36(dims[0]||'0')|0, h=p36(dims[1]||'0')|0;
      const palette=makePalette((parts[1]||'').split(/[.,]/).filter(Boolean).map(t=>t[0]==='#'?t:'#'+t));
      let rle=parts[2]||'';
      let order='';
      if(rle[0]==='Z'){ order='Z'; rle=rle.slice(1); }
      const tmp=new Uint8Array(w*h); let i=0,n='';
      for(const ch of rle){
        const isSym=(ch==='T')||(ch>='A'&&ch<='Z');
        if(isSym){
          if(n===''){ tmp[i++]=symToIndex(ch); }
          else{ const count=p36(n)|0, idx=symToIndex(ch); for(let c=0;c<count;c++) tmp[i++]=idx; }
          n='';
        }else n+=ch;
      }
      let data=tmp;
      if(order==='Z'){
        const m=zigzagMap(w,h);
        const out=new Uint8Array(tmp.length);
        for(let j=0;j<m.length;j++) out[m[j]]=tmp[j];
        data=out;
      }
      return{w,h,data,palette};
    }
  
    function toImageData(sprite){
      const {w,h,data,palette}=sprite, img=new ImageData(w,h); let p=0;
      for(const idx of data){ const c=palette[idx]||[0,0,0,0]; img.data[p++]=c[0]; img.data[p++]=c[1]; img.data[p++]=c[2]; img.data[p++]=c[3]; }
      return img;
    }
  
    function toCanvas(sprite,scale=1){
      const {w,h}=sprite, cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
      const c=document.createElement('canvas'); c.width=cw; c.height=ch;
      const ctx=c.getContext('2d',{alpha:true}); ctx.imageSmoothingEnabled=false;
      const raw=document.createElement('canvas'); raw.width=w; raw.height=h;
      raw.getContext('2d').putImageData(toImageData(sprite),0,0);
      ctx.drawImage(raw,0,0,cw,ch); return c;
    }
  
    function draw(ctx,sprite,x=0,y=0,opts={}){
      const {w,h}=sprite; let z=1;
      if(opts.fit?.w&&opts.fit?.h) z=Math.min(opts.fit.w/w,opts.fit.h/h);
      else if(opts.scale) z=opts.scale;
      ctx.imageSmoothingEnabled=false; ctx.drawImage(toCanvas(sprite,z),x|0,y|0);
    }
  
    const mapIndices=(w,h,fn)=>{const out=new Uint32Array(w*h);let i=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[i++]=fn(x,y);return out;};
    const zigzagMap=(w,h)=>{const m=new Uint32Array(w*h);let i=0;for(let y=0;y<h;y++){if(y%2===0){for(let x=0;x<w;x++)m[i++]=y*w+x;}else{for(let x=w-1;x>=0;x--)m[i++]=y*w+x;}}return m;};
    const remap=(s,w2,h2,m)=>{const out=new Uint8Array(w2*h2);for(let i=0;i<out.length;i++)out[i]=s.data[m[i]];return{w:w2,h:h2,data:out,palette:s.palette.slice()};};
    const flipH=s=>remap(s,s.w,s.h,mapIndices(s.w,s.h,(x,y)=>y*s.w+(s.w-1-x)));
    const flipV=s=>remap(s,s.w,s.h,mapIndices(s.w,s.h,(x,y)=>(s.h-1-y)*s.w+x));
    const rot90=s=>{const{w,h}=s,m=new Uint32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)m[x*h+(h-1-y)]=y*w+x;const out=new Uint8Array(w*h);for(let i=0;i<out.length;i++)out[i]=s.data[m[i]];return{w:h,h:w,data:out,palette:s.palette.slice()};};
    const rot180=s=>flipV(flipH(s));
    const rot270=s=>rot90(rot180(s));
  
    const toImage=(s,scale)=>{const img=new Image(); img.src=toCanvas(s,scale||1).toDataURL('image/png'); return img;};
    const toBitmap=(s,scale)=>{const c=toCanvas(s,scale||1); return (typeof window!=='undefined'&&window.createImageBitmap)?window.createImageBitmap(c):Promise.resolve(null);};
  
    const TinySprites={create,makePalette,encodePacked,encodeWithBestOrder,encodeAuto,decodePacked,toImageData,toCanvas,draw,flipH,flipV,rot90,rot180,rot270,toImage,toBitmap};
    if(typeof window!=='undefined')window.TinySprites=TinySprites;
    if(typeof module!=='undefined'&&module.exports)module.exports=TinySprites;
  })();
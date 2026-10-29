import puppeteer from '@cloudflare/puppeteer';
import { allowedResource, validateShare, assemblePages } from './core.js';
export default { async fetch(request,env) {
 const origin=request.headers.get('Origin');
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...(origin===env.ALLOWED_ORIGIN?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'}:{})};
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin && origin!==env.ALLOWED_ORIGIN)return reply({error:'来源不允许'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});

 if(!env.READER_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.READER_TOKEN}`)return reply({error:'访问令牌不正确'},401);
 const path=new URL(request.url).pathname;
 if(path==='/health'&&request.method==='GET')return reply({service:'morpho-document-reader-v1',ok:!!env.BROWSER});
 if(path==='/browser-check'&&request.method==='POST'){
  let instance;
  try{instance=await puppeteer.launch(env.BROWSER);return reply({service:'morpho-document-reader-v1',ok:true});}
  catch{return reply({service:'morpho-document-reader-v1',ok:false},503);}
  finally{if(instance)await instance.close().catch(()=>{});}
 }
 if(request.method!=='POST'||path!=='/')return reply({error:'无效路径'},404);
 let url;
 try {const body=await request.text();if(body.length>4096)throw Error();url=validateShare(JSON.parse(body).url);}catch{return reply({error:'请提供金山文档分享链接'},400);}
 let browser;
 let timer;
 try {
  browser=await puppeteer.launch(env.BROWSER);
  // Bound browser lifetime even if WPS never finishes loading.
  timer=setTimeout(()=>void browser.close().catch(()=>{}),75000);
  const page=await browser.newPage();
  await page.setViewport({width:1280,height:900});
  await page.setRequestInterception(true);
  page.on('request',req=>{void (allowedResource(req.url())?req.continue():req.abort()).catch(()=>{});});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  // Only dismiss optional prompts; never log in, solve a challenge, or change document permissions.
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{
   for(const dialog of document.querySelectorAll('[role="dialog"], .login-modal, .login-dialog')){
    if(/登录/.test(dialog.textContent||'')){
     const close=dialog.querySelector('button[aria-label="关闭"],button[aria-label="Close"],.close-button,.dialog-close');
     if(close)close.click();
    }
   }
  });
  await page.waitForSelector('#workspace svg.text-page',{timeout:20000});
  const pages=new Map();let bottom=false,height=0;const start=Date.now();
  for(let i=0;i<100&&Date.now()-start<35000;i++){
   const snap=await page.evaluate(()=>{
    const area=document.getElementById('workspace');
    const container=area?.querySelector('.page-container');
    return {height:container?.clientHeight||0,bottom:area?area.scrollTop+area.clientHeight>=area.scrollHeight-3:false,pages:[...document.querySelectorAll('#workspace .canvas-unit')].map(unit=>({top:parseFloat(unit.style.top)||0,height:unit.clientHeight,text:[...unit.querySelectorAll('svg.text-page text')].map(t=>t.textContent||'').join('')}))};
   });
   height=snap.height;
   for(const p of snap.pages)if(p.height>100)pages.set(p.top,p);
   bottom=snap.bottom;
   if(bottom)break;
   if([...pages.values()].reduce((n,p)=>n+p.text.length,0)>100000)break;
   await page.evaluate(()=>{const area=document.getElementById('workspace');if(area)area.scrollTop+=Math.max(200,area.clientHeight*.75);});
   await new Promise(r=>setTimeout(r,300));
  }
  const result=assemblePages(pages,bottom,height);
  if(!result.text.trim()||pages.size===0)return reply({error:'未读取到正文；文档可能需要登录或当前格式不受支持'},422);
  return reply({title:await page.title(),...result,text:result.text.slice(0,100000),complete:result.complete&&result.text.length<=100000});
 }catch{return reply({error:'浏览器读取未完成；请确认访客可查看，或改用发送文件'},422);}
 finally{clearTimeout(timer);if(browser)await browser.close().catch(()=>{});}
}};

import {describe,it,expect,vi,afterEach} from 'vitest';
import {inspectReaderToken,deployReader,testReaderService,READER_ID} from './documentReaderSetup';
import {getSharedCloudflareToken,rememberCloudflareToken,forgetCloudflareToken} from './cloudflareTokenSession';
const id='a'.repeat(32);const id2='b'.repeat(32);
const response=(result:any,status=200)=>new Response(JSON.stringify({success:status===200,result}),{status});
function network(opts:{existing?:boolean;owned?:boolean;multiple?:boolean;deny?:boolean}={}){
 return vi.fn(async (url:any,init:any={})=>{
  const u=new URL(String(url));const path=u.searchParams.get('path');
  if(u.pathname.endsWith('document-reader.bundle.js'))return new Response('// '+READER_ID+'\n'+' '.repeat(11000));
  if(!path)return new Response(JSON.stringify({relay:'cf-api'}));
  if(path==='/user/tokens/verify')return response({status:'active'});
  if(path==='/accounts?per_page=50')return response([{id,name:'测试账号'},...(opts.multiple?[{id:id2,name:'账号二'}]:[])]);
  if(path.endsWith('/workers/scripts'))return response(opts.existing?[{id:'morpho-document-reader'}]:[],opts.deny?403:200);
  if(path.endsWith('/settings'))return response({bindings:opts.owned?[{name:'MORPHO_READER_ID',text:READER_ID}]:[]});
  if(path.endsWith('/workers/subdomain'))return response({subdomain:'example'});
  return response({});
 });
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();forgetCloudflareToken();localStorage.clear();});
describe('文档读取配置',()=>{
 it('会话复用不写入本地存储，并会过期',()=>{vi.useFakeTimers();rememberCloudflareToken(' demo-token ','主动消息');expect(getSharedCloudflareToken()?.token).toBe('demo-token');expect(localStorage.length).toBe(0);vi.advanceTimersByTime(1800001);expect(getSharedCloudflareToken()).toBeUndefined();});
 it('主动清除会话令牌',()=>{rememberCloudflareToken('demo','协同工作');forgetCloudflareToken();expect(getSharedCloudflareToken()).toBeUndefined();});
 it('空令牌不发请求',async()=>{const f=network();vi.stubGlobal('fetch',f);expect((await inspectReaderToken('')).canDeploy).toBe(false);expect(f).not.toHaveBeenCalled();});
 it('体检全部只读，写入权限标成待确认',async()=>{const f=network();vi.stubGlobal('fetch',f);const r=await inspectReaderToken('test');expect(r.canDeploy).toBe(true);expect(r.checks.at(-1)?.state).toBe('warn');for(const call of f.mock.calls){expect(call[1]?.headers?.['X-CF-Method']||'GET').toBe('GET');}});
 it('多账号必须选择，不默认部署第一个',async()=>{vi.stubGlobal('fetch',network({multiple:true}));expect((await inspectReaderToken('test')).canDeploy).toBe(false);expect((await inspectReaderToken('test',id2)).accountId).toBe(id2);});
 it('不能读取 Worker 时不启用部署，也不索要 D1',async()=>{vi.stubGlobal('fetch',network({deny:true}));const r=await inspectReaderToken('test');expect(r.canDeploy).toBe(false);expect(r.checks.at(-1)?.detail).toContain('Workers Scripts:Edit');expect(r.checks.at(-1)?.detail).not.toContain('D1');});
 it('同名非本服务禁止覆盖',async()=>{const f=network({existing:true});vi.stubGlobal('fetch',f);await expect(deployReader('test',id,()=>{})).rejects.toThrow('避免覆盖');expect(f.mock.calls.some(c=>c[1]?.headers?.['X-CF-Method']==='PUT')).toBe(false);});
 it('Token 失效时停止检查',async()=>{vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).includes('path=')?response({status:'expired'}):new Response('{"relay":"cf-api"}')));expect((await inspectReaderToken('test')).canDeploy).toBe(false);});
 it('部署只修改读取服务，密钥不含 CF Token，返回自动配置',async()=>{const f=network();vi.stubGlobal('fetch',f);vi.stubGlobal('location',{href:'https://example.org/Morpho/',origin:'https://example.org'});const result=await deployReader('sensitive-test-token',id,()=>{});expect(result.endpoint).toBe('https://morpho-document-reader.example.workers.dev');expect(result.token).toHaveLength(64);const writes=f.mock.calls.filter(c=>c[1]?.headers?.['X-CF-Method']==='PUT');expect(writes).toHaveLength(1);expect(decodeURIComponent(String(writes[0][0]))).toContain('/morpho-document-reader');const form=writes[0][1].body as FormData;const meta=JSON.parse(await (form.get('metadata') as Blob).text());expect(meta.bindings).toContainEqual({type:'browser',name:'BROWSER'});expect(JSON.stringify(meta)).not.toContain('sensitive-test-token');expect(JSON.stringify(meta)).not.toContain('d1');});
 it('健康检查拒绝伪成功 HTML/未知服务',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"ok":true}')));expect((await testReaderService({endpoint:'https://reader.example',token:'x'})).state).toBe('fail');});
 it('健康检查带口令，仅浏览器启动按钮用 POST',async()=>{const f=vi.fn(async()=>new Response(JSON.stringify({service:READER_ID,ok:true})));vi.stubGlobal('fetch',f);expect((await testReaderService({endpoint:'https://reader.example',token:'x'})).state).toBe('pass');expect(f.mock.calls[0][0]).toBe('https://reader.example/health');});
});

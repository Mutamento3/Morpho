import { ChatPrompts } from './chatPrompts';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readWorkFile, readWorkLink, documentApiContent, documentContext, loadReaderConfig, READER_CONFIG_KEY } from './workDocuments';
import { cleanApiMessages, flattenImageContentParts, flattenContentPartsToText } from './promptMessageCleanup';
import { normalizeMessageContent } from './messageFormat';
const file=(name:string,text:string)=>({name,size:new TextEncoder().encode(text).length,text:async()=>text,arrayBuffer:async()=>new TextEncoder().encode(text).buffer}) as File;
afterEach(()=>vi.unstubAllGlobals());
describe('协同文档',()=>{
 it('读取文本并保留超过旧网页上限的正文',async()=>{const d=await readWorkFile(file('材料.txt','内容'.repeat(2500)));expect(d.status).toBe('ready');expect(normalizeMessageContent({type:'document_card',metadata:{document:d,documentNote:'请校对'}} as any,'角色','我')).toContain('内容'.repeat(2500));});
 it('PDF 原件进入 file 多模态部件',async()=>{const d=await readWorkFile(file('材料.pdf','%PDF-1.7\nfixture'));expect(documentApiContent(d)[1]).toMatchObject({type:'file',file:{filename:'材料.pdf'}});});
 it('没有 PDF 原件不能声称有附件',()=>expect(documentContext({name:'p.pdf',source:'file',status:'native'})).toContain('原件缺失'));
 it('拒绝超大、空白和不支持格式',async()=>{await expect(readWorkFile({...file('a.txt','a'),size:11*1024*1024})).rejects.toThrow('10 MB');await expect(readWorkFile(file('a.txt',' '))).rejects.toThrow('没有提取');await expect(readWorkFile(file('a.doc','a'))).rejects.toThrow('DOCX');await expect(readWorkFile(file('a.pdf','not pdf'))).rejects.toThrow('有效');});
 it('未部署服务不发请求、不声称正文已读',async()=>{const fn=vi.fn();vi.stubGlobal('fetch',fn);const d=await readWorkLink('https://www.kdocs.cn/l/test');expect(d.status).toBe('needs-service');expect(fn).not.toHaveBeenCalled();expect(documentContext(d)).toContain('尚未取得正文');});
 it('拒绝脚本 URL',async()=>await expect(readWorkLink('javascript:alert(1)')).rejects.toThrow());
 it('服务未确认末页只能报部分正文',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({text:'第一页',complete:false}))));expect((await readWorkLink('https://www.kdocs.cn/l/test',{endpoint:'https://reader.example'})).status).toBe('partial');});
 it('服务明确完成并保留末页',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({text:'首页\n末页',complete:true,pages:2}))));expect(await readWorkLink('https://www.kdocs.cn/l/test',{endpoint:'https://reader.example',token:'test-only'})).toMatchObject({status:'ready',pages:2,text:'首页\n末页'});});
 it('服务失败显示失败而不是空正文成功',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:401})));expect((await readWorkLink('https://www.kdocs.cn/l/test',{endpoint:'https://reader.example'})).status).toBe('failed');});
 it('长正文不会悄悄假装完整',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({text:'字'.repeat(100001),complete:true}))));expect((await readWorkLink('https://www.kdocs.cn/l/test',{endpoint:'https://reader.example'})).status).toBe('partial');});
 it('双语清理不会误截文档内容',()=>{const parts=documentApiContent({name:'a',source:'file',status:'ready',text:'前%%BILINGUAL%%后'});expect(JSON.stringify(cleanApiMessages([{role:'user',content:parts}]))).toContain('前%%BILINGUAL%%后');});
 it('纯文本降级说明 PDF 附件被省略',async()=>{const parts=documentApiContent(await readWorkFile(file('a.pdf','%PDF-1.7')));expect(flattenImageContentParts([{role:'user',content:parts}])[0].content).toContain('未传输');expect(flattenContentPartsToText(parts)).toContain('未传输');});
 it('损坏的配置不会使界面崩溃',()=>{localStorage.setItem(READER_CONFIG_KEY,'null');expect(loadReaderConfig()).toEqual({endpoint:'',token:''});});
});

it('实际聊天历史将正文和附言送入请求',async()=>{
 const d=await readWorkFile(file('a.txt','开始'+ '正文'.repeat(2000)+'末页内容'));
 const {apiMessages}=ChatPrompts.buildMessageHistory([{id:1,charId:'test',role:'user',type:'document_card',content:d.name,metadata:{document:d,documentNote:'请帮我改第二段'},timestamp:Date.now()}] as any,10,{id:'test',name:'角色'} as any,{name:'我'} as any,[]);
 const payload=JSON.stringify(cleanApiMessages(apiMessages));expect(payload).toContain('末页内容');expect(payload).toContain('请帮我改第二段');
});
it('实际聊天历史保留 PDF 附件',async()=>{
 const d=await readWorkFile(file('a.pdf','%PDF-1.7'));
 const {apiMessages}=ChatPrompts.buildMessageHistory([{id:1,charId:'test',role:'user',type:'document_card',content:d.name,metadata:{document:d},timestamp:Date.now()}] as any,10,{id:'test',name:'角色'} as any,{name:'我'} as any,[]);
 expect(JSON.stringify(cleanApiMessages(apiMessages))).toContain('file_data');
});

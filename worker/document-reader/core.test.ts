import { describe, it, expect } from 'vitest';
import { allowedResource, validateShare, assemblePages } from './core.js';
describe('浏览器读取边界',()=>{
 it('仅允许 WPS 分享导航',()=>{expect(validateShare('https://www.kdocs.cn/l/abc')).toContain('/l/abc');for(const u of ['http://127.0.0.1','https://www.kdocs.cn.evil.test/l/a','https://www.kdocs.cn/login'])expect(()=>validateShare(u)).toThrow();});
 it('拒绝内网和伪造域名子请求',()=>{expect(allowedResource('https://cdn.wps.cn/a')).toBe(true);for(const u of ['http://localhost','https://127.0.0.1','https://wps.cn.evil.test','file:///a'])expect(allowedResource(u)).toBe(false);});
 it('缺页或未到末页不能报告完成',()=>{const p=new Map([[7,{top:7,height:1125,text:'首'}],[2290,{top:2290,height:1125,text:'末'}]]);expect(assemblePages(p,true,3415).complete).toBe(false);expect(assemblePages(new Map([[7,{top:7,height:1125,text:'首'}]]),false,1125).complete).toBe(false);});
 it('完整的连续页面按位置排序而非去重文字',()=>{const p=new Map([[1140,{top:1140,height:1125,text:'相同'}],[7,{top:7,height:1125,text:'相同'}]]);const r=assemblePages(p,true,2265);expect(r.complete).toBe(true);expect(r.pages).toBe(2);expect(r.text.match(/相同/g)?.length).toBe(2);});
});

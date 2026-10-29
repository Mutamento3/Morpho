# 协同文档读取服务（待部署联调）

这是独立 Worker，不修改现有 Morpho 代理。仅适配访客可查看的金山文字文档分享链接（www.kdocs.cn/l/...），不支持表格、演示、加密/强制登录文档。读取的是页面文字，不包含图片识别。不会使用你的 WPS 账号。

## 部署
1. 在 Cloudflare 账号中确认 Browser Run / Browser Rendering 可用，并查看自己套餐的额度。
2. 在本目录执行 `pnpm install`，然后 `pnpm exec wrangler login`，用你自己的账号登录。
3. `pnpm exec wrangler secret put READER_TOKEN`，输入一段自行生成的长随机令牌。不要发到群里或写进 Git。
4. `pnpm run deploy`，获得 `https://morpho-document-reader.你的子域.workers.dev`。
5. Morpho 私聊「＋」尾页 → 协同工作 → 浏览器读取服务设置：填写 Worker 地址和同一个令牌，保存。
6. 粘贴一个允许访客查看的 WPS 链接，核对卡片中的页数/正文，尤其末页，再点闪电。

`ALLOWED_ORIGIN` 默认只允许当前 Morpho GitHub Pages 来源。若更换网站需修改后重新部署。访问令牌保存在本机浏览器 localStorage，服务不会打印文档、链接或令牌。浏览器会话最多约 75 秒；未确认末页、页面有缺口或超过十万字时报告部分正文。等待登录、验证码或拒绝访问时不会绕过。

部署前尚未做 Cloudflare 实际端到端验证。WPS 页面结构或资源域名变动可能导致读取失败；错误会显示在文档卡片，仍可发送本地文件。不要把令牌嵌入公开前端代码。本服务每次读取需要启动云端浏览器，可能使用套餐额度。

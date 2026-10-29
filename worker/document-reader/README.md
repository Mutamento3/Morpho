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
## 小手机内一键部署（新版）

协同工作 → 链接读取 · Token 配置与体检。主动消息和协同工作会共享本次应用会话输入的 Cloudflare 用户 API Token（内存中保留，30 分钟后不再自动带入，刷新/退出丢失）。旧版已存到云端的 CF_API_TOKEN 密钥无法读回，第一次需再粘贴原来的 Token。不会把主动消息的服务口令误当成 Cloudflare Token。

先运行只读体检，选择账号。权限建议 Account Settings:Read、Workers Scripts:Edit；不需要 D1。只读检查不证明写入权限，黄色提示必须保留。多账号需要显式选择。同名 Worker 没有本功能身份标识时拒绝覆盖。

体检通过后点“部署／更新文档读取服务”，会自动写入 BROWSER 绑定、站点来源和独立的读取口令，然后保存服务配置。网络请求沿用主动消息当前的 /cf-api 代理，界面会显示地址；Cloudflare Token 会经过该代理，请只使用信任的代理。

最后点“测试已配置的服务”，再按需点“测试浏览器启动”。后者会短暂启动并关闭云端浏览器，使用少量额度但不访问文档。账号额度、WPS 读取仍须真实账号实测。一键部署不会把 Cloudflare Token 写入读取 Worker，仅使用独立读取口令。部署中断会保留本地读取口令草稿，重试同一地址可恢复。

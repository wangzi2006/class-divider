# 分班程序（Web）

## 本地运行

在 `web/` 目录下：

```bash
npm install
npm run dev
```

浏览器打开：
- http://localhost:5173/
- 若浏览器会把 localhost 自动跳到 https，建议用 http://127.0.0.1:5173/

## 构建

```bash
npm run build
```

产物在 `web/dist/`。

## 部署到 GitHub Pages（推荐：GitHub Actions）

仓库根目录已包含工作流文件：
- `.github/workflows/deploy-pages.yml`

部署步骤：
1. 把整个仓库推送到 GitHub（默认分支名为 `main`）
2. 打开 GitHub 仓库 → Settings → Pages
3. 在 “Build and deployment” 里把 Source 选择为 “GitHub Actions”
4. 之后每次 push 到 `main` 都会自动构建并发布

发布完成后，Pages 会提供一个访问地址（形如 `https://<user>.github.io/<repo>/`）。

## 说明
- 本项目是纯前端：Excel 解析、模拟退火、导出 Excel 都在浏览器本地完成，不上传服务器
- 为适配 GitHub Pages：
  - `vite.config.ts` 在 production 模式下使用相对 base（`./`）
  - 路由使用 HashRouter，避免刷新 404

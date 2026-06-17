# ╔══════════════════════════════════════════════════════════╗
# ║  Memi Agent — 一键安装脚本 (Windows PowerShell)           ║
# ║  irm https://memi.ai/install.ps1 | iex                    ║
# ╚══════════════════════════════════════════════════════════╝
Write-Host ""
Write-Host "  🦞 Memi Agent Installer" -ForegroundColor Cyan
Write-Host "  ───────────────────────"
Write-Host ""

# 检测 Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "  ⚠ Node.js 未安装。请先安装: https://nodejs.org" -ForegroundColor Yellow
    Write-Host "  下载 Node.js 18+ LTS 安装包并安装后重试。"
    exit 1
}

$nodeVer = (node -v).TrimStart('v').Split('.')[0]
if ([int]$nodeVer -lt 18) {
    Write-Host "  ✗ Node.js >= 18 需要, 当前: $(node -v)" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Node.js $(node -v)" -ForegroundColor Green

# 安装
Write-Host "  📦 安装 memi-agent..."
npm install -g memi-agent@latest

Write-Host ""
Write-Host "  ✓ 安装完成！" -ForegroundColor Green
Write-Host ""
Write-Host "  运行引导程序:"
Write-Host "    memi onboard"
Write-Host ""

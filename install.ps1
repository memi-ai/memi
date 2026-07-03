# ╔══════════════════════════════════════════════════════════╗
# ║  Memi Agent — 一键安装脚本 (Windows PowerShell)           ║
# ║  irm https://memi.ai/install.ps1 | iex                    ║
# ╚══════════════════════════════════════════════════════════╝

function Write-Step($text, $color) { Write-Host "  $text" -ForegroundColor $color }
function Write-Done { Write-Host "  ✓ 完成" -ForegroundColor Green }

# ─── 镜像自动检测 ───────────────────────────────────────
Write-Host ""
Write-Host "  🦞 Memi Agent Installer" -ForegroundColor Cyan
Write-Host "  ───────────────────────"
Write-Host ""

$NPM_REGISTRY = "https://registry.npmjs.org"
$USE_MIRROR = $false

if ($env:MEMI_NPM_MIRROR -eq "mirror") {
    $USE_MIRROR = $true
} elseif ($env:MEMI_NPM_MIRROR -ne "direct") {
    # 自动检测 npmjs.org 是否可达
    try {
        $req = [System.Net.WebRequest]::Create("https://registry.npmjs.org/")
        $req.Timeout = 4000
        $req.GetResponse() | Out-Null
        Write-Step "🌐 npmjs.org 可达，使用官方源" -ForegroundColor Green
    } catch {
        $USE_MIRROR = $true
        Write-Step "🌐 npmjs.org 不可达，自动切换镜像" -ForegroundColor Yellow
    }
}

if ($USE_MIRROR) {
    $NPM_REGISTRY = "https://registry.npmmirror.com"
    Write-Step "📡 npm 镜像: $NPM_REGISTRY" -ForegroundColor Cyan
    Write-Step "💡 设置 `$env:MEMI_NPM_MIRROR='direct' 强制直连" -ForegroundColor Gray
}

# ─── Node.js 检测 ───────────────────────────────────────
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Step "⚠ Node.js 未安装" -ForegroundColor Yellow
    $installChoice = Read-Host "  是否自动下载安装 Node.js？(Y/n)"
    if ($installChoice -ne "n" -and $installChoice -ne "N") {
        Write-Step "📥 下载 Node.js 安装包..." -ForegroundColor Cyan
        $nodeUrl = if ($USE_MIRROR) {
            "https://npmmirror.com/mirrors/node/v22.14.0/node-v22.14.0-x64.msi"
        } else {
            "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
        }
        $installer = "$env:TEMP\node-installer.msi"
        try {
            # 使用多个备用 CDN
            $urls = @(
                $nodeUrl,
                "https://cdn.npmmirror.com/binaries/node/v22.14.0/node-v22.14.0-x64.msi",
                # 备用: 使用 GitHub release (国内可用 fastgit 镜像)
                "https://github.com/nodejs/node/releases/download/v22.14.0/node-v22.14.0-x64.msi"
            )
            $downloaded = $false
            foreach ($url in $urls) {
                try {
                    Write-Step "  → $url" -ForegroundColor DarkGray
                    Invoke-WebRequest -Uri $url -OutFile $installer -TimeoutSec 120 -ErrorAction Stop
                    $downloaded = $true
                    break
                } catch { continue }
            }
            if (-not $downloaded) { throw "所有下载源均失败" }
            
            Write-Step "📦 安装 Node.js..." -ForegroundColor Cyan
            Start-Process msiexec.exe -ArgumentList "/i `"$installer`" /quiet /norestart" -Wait
            Remove-Item $installer -ErrorAction SilentlyContinue
            # 刷新 PATH
            $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
            Write-Done
        } catch {
            Write-Step "✗ 下载失败: $($_.Exception.Message)" -ForegroundColor Red
            Write-Step "请手动安装 Node.js 18+ : https://nodejs.org" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Step "请手动安装 Node.js 18+ : https://nodejs.org" -ForegroundColor Yellow
        exit 1
    }
}

$nodeVer = (node -v).TrimStart('v').Split('.')[0]
if ([int]$nodeVer -lt 18) {
    Write-Step "✗ Node.js >= 18 需要, 当前: $(node -v)" -ForegroundColor Red
    exit 1
}
Write-Step "✓ Node.js $(node -v)" -ForegroundColor Green

# ─── 安装 Memi ────────────────────────────────────────
Write-Step "📦 安装 memi-agent..." -ForegroundColor Cyan

$npmArgs = @("install", "-g", "memi-agent@latest")
if ($USE_MIRROR) {
    $npmArgs += "--registry=$NPM_REGISTRY"
}

$process = Start-Process -FilePath "npm" -ArgumentList $npmArgs -Wait -NoNewWindow -PassThru
if ($process.ExitCode -eq 0) {
    Write-Host ""
    Write-Step "✓ 安装完成！" -ForegroundColor Green
    Write-Host ""
    Write-Step "运行引导程序:" -ForegroundColor Cyan
    Write-Step "  memi onboard" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Step "✗ 安装失败。" -ForegroundColor Red
    Write-Step "常见原因:" -ForegroundColor Yellow
    Write-Step "1. 网络问题 → 设置镜像: `$env:MEMI_NPM_MIRROR='mirror'; irm https://memi.ai/install.ps1 | iex" -ForegroundColor Gray
    Write-Step "2. 权限问题 → 以管理员身份运行 PowerShell" -ForegroundColor Gray
    Write-Step "3. 直接安装: npm install -g memi-agent --registry=https://registry.npmmirror.com" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

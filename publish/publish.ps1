# ============================================================
#  publish.ps1 —— 一键发布新版（给玩家发 exe 用）
#  流程：重打包 法言天地.exe（最新代码）→ 更新发布版文件夹
#       → 生成「法言天地-v版本号.zip」（只含 exe，玩家解压覆盖即可）
#
#  用法（脚本放在任意位置均可）：
#     1) 放在 xianxia-game 目录里，或它的子目录（如 publish\）：
#        右键“使用 PowerShell 运行”即可，自动识别项目目录；
#     2) 放在别处：显式指定项目目录：
#         pwsh -File "本脚本路径" -ProjectDir "C:\...\xianxia-game" -Version 1.2.0
#  可选参数：-ReleaseDir 发布版文件夹（默认 项目上级\法言天地-发布版）
#            -OutDir zip 输出目录（默认 项目上级）
#            -DryRun 只打印解析出的路径，不实际打包
#  注意：发版前先改 public/game.js 里的 GAME_VERSION。
# ============================================================
param(
  [string]$Version = '1.1.0',
  [string]$ProjectDir = '',
  [string]$ReleaseDir = '',
  [string]$OutDir = '',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

# ---- 项目目录识别：参数 > 脚本所在目录 > 脚本上级目录（publish\ 子目录场景）----
if (-not $ProjectDir) {
  if (Test-Path (Join-Path $PSScriptRoot 'build-exe.ps1')) {
    $ProjectDir = $PSScriptRoot
  } elseif (Test-Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'build-exe.ps1')) {
    $ProjectDir = Split-Path $PSScriptRoot -Parent
  } else {
    throw "自动识别项目目录失败 —— 请用 -ProjectDir 指定 xianxia-game 目录"
  }
}
$ProjectDir = (Resolve-Path $ProjectDir).Path

# 防止游戏 exe 正在运行导致文件占用、打包失败
$running = Get-Process -Name '法言天地' -ErrorAction SilentlyContinue
if ($running) {
  Write-Host '' -ForegroundColor Red
  Write-Host '✗ 检测到 法言天地.exe 正在运行！' -ForegroundColor Red
  Write-Host '  请先关闭游戏窗口（黑色控制台），再重新运行本脚本，否则打包会因文件占用失败。' -ForegroundColor Yellow
  exit 1
}

$buildScript = Join-Path $ProjectDir 'build-exe.ps1'
if (-not (Test-Path $buildScript)) { throw "在 $ProjectDir 找不到 build-exe.ps1" }
$exe = Join-Path $ProjectDir '法言天地.exe'

if (-not $ReleaseDir) { $ReleaseDir = Join-Path (Split-Path $ProjectDir -Parent) '法言天地-发布版' }
if (-not $OutDir)    { $OutDir    = Split-Path $ProjectDir -Parent }
$zip = Join-Path $OutDir ("法言天地-v" + $Version + ".zip")

# 核对游戏内声明的版本号（防止 zip 名与实际版本不一致）
$gameJs = Join-Path $ProjectDir 'public\game.js'
$declared = ''
if (Test-Path $gameJs) {
  $m = [regex]::Match((Get-Content $gameJs -Raw -Encoding UTF8), "GAME_VERSION\s*=\s*'([^']+)'")
  if ($m.Success) { $declared = $m.Groups[1].Value }
}

Write-Host '解析结果：'
Write-Host "  项目目录 : $ProjectDir"
Write-Host "  打包脚本 : $buildScript"
Write-Host "  输出 exe : $exe"
Write-Host "  发布版夹 : $ReleaseDir"
Write-Host "  发送 zip : $zip"
Write-Host "  游戏版本 : $declared（public/game.js 声明）"
if ($declared -and $declared -ne $Version) {
  Write-Host "  ⚠ 警告：-Version 参数为 $Version，但 game.js 里声明的是 $declared —— 二者不一致！" -ForegroundColor Yellow
  Write-Host "     请先修改 public/game.js 的 GAME_VERSION，或改用 -Version $declared 重新运行。" -ForegroundColor Yellow
}

if ($DryRun) {
  Write-Host '  （-DryRun：仅预览，不打包）'
  exit 0
}

Write-Host '[1/3] 重新打包 exe ...' -ForegroundColor Cyan
Set-Location $ProjectDir
& $buildScript
if ($LASTEXITCODE -ne 0) { throw '打包失败' }
if (-not (Test-Path $exe)) { throw '未找到 法言天地.exe' }

Write-Host '[2/3] 更新发布版文件夹...' -ForegroundColor Cyan
if (Test-Path $ReleaseDir) {
  Copy-Item $exe (Join-Path $ReleaseDir '法言天地.exe') -Force
  Write-Host "  已更新：$ReleaseDir\法言天地.exe"
} else {
  Write-Host "  未找到发布版文件夹（$ReleaseDir），跳过"
}

Write-Host '[3/3] 生成发送用 zip ...' -ForegroundColor Cyan
Compress-Archive -Path $exe -DestinationPath $zip -Force
Write-Host "  已生成：$zip"

Write-Host ''
Write-Host "发布完成！把 $zip 发给玩家，解压后用新 exe 覆盖旧文件即可（浏览器存档不受影响）。" -ForegroundColor Green

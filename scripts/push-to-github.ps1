# 把 v1.56.0 推到 GitHub 的新分支上（不动 main，也不动原分支）
#
# 用法（在本仓库根目录）：
#   powershell -ExecutionPolicy Bypass -File scripts\push-to-github.ps1
#
# 说明：
#   - 只推 codex/sect-v1.56.0 到同名远端分支，**不使用 --force**，不会覆盖任何已有分支。
#   - 本机曾经出现过：凭据里的账号是 pmyxw，对 junfei1016-source/xianxia-game 没有写权限（403）。
#     遇到 403 时，需要仓库所有者把 pmyxw 加为协作者，或者换一个有写权限的账号。
#   - 本机 DNS 是 fake-ip，git 默认走 schannel 会报 SEC_E_NO_CREDENTIALS，所以固定用 openssl 后端。

$ErrorActionPreference = 'Stop'
$branch = 'codex/sect-v1.56.0'

Write-Host "== 连通性检查 ==" -ForegroundColor Cyan
$ok = Test-NetConnection github.com -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $ok) {
  Write-Host "连不上 github.com:443 —— 先解决网络（代理/VPN），然后再跑这个脚本。" -ForegroundColor Yellow
  exit 2
}

Write-Host "== 推送 $branch（不强制）==" -ForegroundColor Cyan
$env:GIT_TERMINAL_PROMPT = '0'
& git -c http.sslBackend=openssl push origin "${branch}:${branch}" 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -eq 0) {
  Write-Host "推送完成：https://github.com/junfei1016-source/xianxia-game/tree/$branch" -ForegroundColor Green
  exit 0
}

Write-Host "推送失败。若是 403 / Permission denied，说明当前账号没有该仓库的写权限：" -ForegroundColor Yellow
Write-Host "  · 让仓库所有者在 Settings → Collaborators 里把当前账号加进去，或" -ForegroundColor Yellow
Write-Host "  · 换一个有写权限的账号（清除 Windows 凭据里的 git:https://github.com 后重试）" -ForegroundColor Yellow
exit 1

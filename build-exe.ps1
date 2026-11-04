# ============================================================
#  build-exe.ps1 —— 一键打包「法言天地」为单文件 exe
#  原理（Node 官方 SEA + Windows PE 资源注入）：
#    1. node --experimental-sea-config 生成 sea-prep.blob
#       （内含 server.cjs 主程序 + public/ 全部静态资源）
#    2. 复制本机 node.exe（必须与生成 blob 的 Node 版本一致）
#    3. 用 Win32 资源 API 把 blob 注入为 PE 资源：
#       RT_RCDATA(10) / 名称 NODE_SEA_BLOB
#    4. 翻转哨兵熔丝 NODE_SEA_FUSE_...:0 -> :1 标记已注入
#  运行：右键“使用 PowerShell 运行”或
#        pwsh -File build-exe.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host '[1/4] 生成 blob ...' -ForegroundColor Cyan
node --experimental-sea-config sea-config.json
if ($LASTEXITCODE -ne 0) { throw 'blob 生成失败' }

# 防止游戏 exe 正在运行导致文件占用
if (Get-Process -Name '法言天地' -ErrorAction SilentlyContinue) {
  throw '法言天地.exe 正在运行：请先关闭游戏窗口再打包，否则文件被占用无法写入。'
}

Write-Host '[2/4] 复制全新 node.exe ...' -ForegroundColor Cyan
Copy-Item "$env:ProgramFiles\nodejs\node.exe" "$PSScriptRoot\法言天地.exe" -Force

Write-Host '[3/4] 注入 PE 资源 NODE_SEA_BLOB ...' -ForegroundColor Cyan
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class PeResInject {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr BeginUpdateResource(string pFileName, [MarshalAs(UnmanagedType.Bool)] bool bDeleteExistingResources);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, IntPtr lpData, uint cbData);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool EndUpdateResource(IntPtr hUpdate, [MarshalAs(UnmanagedType.Bool)] bool fDiscard);
}
"@
$exe = "$PSScriptRoot\法言天地.exe"
$blobBytes = [System.IO.File]::ReadAllBytes("$PSScriptRoot\sea-prep.blob")
$h = [PeResInject]::BeginUpdateResource($exe, $false)
if ($h -eq [IntPtr]::Zero) { throw "BeginUpdateResource 失败, win32err=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
$namePtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni('NODE_SEA_BLOB')
$dataPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal($blobBytes.Length)
[Runtime.InteropServices.Marshal]::Copy($blobBytes, 0, $dataPtr, $blobBytes.Length)
try {
  $ok1 = [PeResInject]::UpdateResource($h, [IntPtr]10, $namePtr, [uint16]0x0409, $dataPtr, [uint32]$blobBytes.Length)
  if (-not $ok1) { throw "UpdateResource 失败, win32err=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
} finally {
  [Runtime.InteropServices.Marshal]::FreeHGlobal($namePtr)
  [Runtime.InteropServices.Marshal]::FreeHGlobal($dataPtr)
}
$ok2 = [PeResInject]::EndUpdateResource($h, $false)
if (-not $ok2) { throw "EndUpdateResource 失败, win32err=$([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }

Write-Host '[4/4] 翻转哨兵熔丝 ...' -ForegroundColor Cyan
node sea-flip.mjs 法言天地.exe
if ($LASTEXITCODE -ne 0) { throw '熔丝翻转失败' }

Write-Host ''
Write-Host '打包完成！双击 法言天地.exe 即可开始游戏。' -ForegroundColor Green

; 桌宠Mini 独立卸载工具（随发布包分发，放在与安装包同一文件夹）
; 作用：在目标电脑上定位已安装的桌宠Mini，触发静默卸载并兜底清理残留。
; 不依赖安装包本身，双击即可卸载，无需通过控制面板。

Unicode true
!include "LogicLib.nsh"
; 注意：不要用 highest/管理员提权。以管理员权限运行时 NSIS 的 $DESKTOP 会解析到
; 管理员账户桌面，而桌宠是 per-user 安装、快捷方式实际建在「当前用户桌面」，
; 提权会导致桌面快捷方式删除错位、残留。改用 user（不弹 UAC），路径才正确。
RequestExecutionLevel user

Name "桌宠Mini 卸载工具"
OutFile "G:\桌宠Mini_发布包_v1.0.0\卸载 桌宠Mini.exe"
Caption "桌宠Mini 卸载工具"
Icon "G:\desktop-pet\pet-mini\build\icon.ico"

Var /GLOBAL uninstPath
Var /GLOBAL foundKey

Section "主"
  StrCpy $uninstPath ""
  StrCpy $foundKey ""

  ; 0) 先结束可能仍在运行的桌宠进程（否则文件被锁无法删除）
  ExecWait '"$SYSDIR\taskkill.exe" /f /im "桌宠Mini.exe"'
  Sleep 1000

  ; 1) 在 HKCU / HKLM 的 Uninstall 下枚举，匹配 DisplayName 以「桌宠Mi」开头的条目
  Call FindUninstall_HKCU
  Call FindUninstall_HKLM

  ${If} $uninstPath != ""
    ; 2a) 找到官方卸载程序 → 静默运行（它负责删安装目录/快捷方式/注册表/userData）
    ExecWait '$uninstPath /S'
    Sleep 1500
  ${Else}
    ; 2b) 未找到官方卸载程序（可能已被手动删除）→ 按已知默认路径兜底删除
    RMDir /r "$LOCALAPPDATA\Programs\桌宠Mini"
    RMDir /r "$PROGRAMFILES\桌宠Mini"
    RMDir /r "$PROGRAMFILES64\桌宠Mini"
  ${EndIf}

  ; 3) 兜底清理：确保 userData 与快捷方式/注册表无残留
  RMDir /r "$APPDATA\desk-pet-mini"
  RMDir /r "$LOCALAPPDATA\desk-pet-mini"

  ; 删除桌面与开始菜单快捷方式：同时覆盖「当前用户」与「公共」两个位置，
  ; 避免 per-user / per-machine 安装差异或权限错位导致快捷方式残留。
  SetShellVarContext current
  Delete "$DESKTOP\桌宠Mini.lnk"
  Delete "$SMPROGRAMS\桌宠Mini\桌宠Mini.lnk"
  Delete "$SMPROGRAMS\桌宠Mini\Uninstall 桌宠Mini.lnk"
  RMDir "$SMPROGRAMS\桌宠Mini"
  SetShellVarContext all
  Delete "$DESKTOP\桌宠Mini.lnk"
  Delete "$SMPROGRAMS\桌宠Mini\桌宠Mini.lnk"
  Delete "$SMPROGRAMS\桌宠Mini\Uninstall 桌宠Mini.lnk"
  RMDir "$SMPROGRAMS\桌宠Mini"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.deskpet.mini"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.deskpet.mini"

  ${If} $uninstPath == ""
  ${AndIf} $foundKey == ""
    MessageBox MB_OK|MB_ICONINFORMATION "未检测到已安装的「桌宠Mini」。$\n如已卸载则无需操作；如仍残留文件，请手动删除安装目录。"
  ${Else}
    MessageBox MB_OK|MB_ICONINFORMATION "桌宠Mini 已卸载完成。$\n所有程序文件与用户数据均已清理。"
  ${EndIf}
SectionEnd

Function FindUninstall_HKCU
  Push $0
  Push $1
  Push $R0
  StrCpy $R0 0
loop_hkcu:
  EnumRegKey $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
  StrCmp $0 "" end_hkcu
  ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$0" "DisplayName"
  StrCpy $1 $1 4
  StrCmp $1 "桌宠Mi" found_hkcu next_hkcu
next_hkcu:
  IntOp $R0 $R0 + 1
  Goto loop_hkcu
found_hkcu:
  ReadRegStr $uninstPath HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$0" "UninstallString"
  StrCpy $foundKey "1"
end_hkcu:
  Pop $R0
  Pop $1
  Pop $0
FunctionEnd

Function FindUninstall_HKLM
  Push $0
  Push $1
  Push $R0
  StrCpy $R0 0
loop_hklm:
  EnumRegKey $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
  StrCmp $0 "" end_hklm
  ReadRegStr $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$0" "DisplayName"
  StrCpy $1 $1 4
  StrCmp $1 "桌宠Mi" found_hklm next_hklm
next_hklm:
  IntOp $R0 $R0 + 1
  Goto loop_hklm
found_hklm:
  ReadRegStr $uninstPath HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$0" "UninstallString"
  StrCpy $foundKey "1"
end_hklm:
  Pop $R0
  Pop $1
  Pop $0
FunctionEnd

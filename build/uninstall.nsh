; 自定义卸载脚本：彻底清理桌宠的全部用户填充数据
; 所有可填充内容（人设 persona.json / 记忆 memory / API 配置 config / 待办 todo.json /
; 番茄钟 pomodoro.json / 角色图 character.json 等）统一存放在 app.getPath('userData')
; = %APPDATA%\desk-pet-mini。这里在卸载时整目录删除，确保重装后回到「全新未配置」状态。
;
; 根因修复：桌宠默认常驻系统托盘，卸载时进程仍在运行会锁住 userData 目录，
; 导致 RMDir 静默失败（character.json 等残留）。故先强制结束进程再删除。

!macro customInstall
  ; 安装/重装时先清理旧残留，避免「点击没反应」「向导不弹」「旧配置纠缠」
  ; 1) 结束可能仍在后台运行的旧实例（单例锁会让新启动被秒杀）
  ExecWait '"$SYSDIR\taskkill.exe" /f /im "桌宠Mini.exe"'
  Sleep 1000
  ; 2) 删除旧 userData（人设 / 记忆 / api / 待办 / 角色图 等），让重装回到全新向导
  RMDir /r "$APPDATA\desk-pet-mini"
  RMDir /r "$LOCALAPPDATA\desk-pet-mini"
!macroend

!macro customUnInstall
  ; 1) 强制结束仍在运行的桌宠主进程（托盘常驻），释放对 userData 的文件锁
  ExecWait '"$SYSDIR\taskkill.exe" /f /im "桌宠Mini.exe"'
  Sleep 1500
  ; 2) 彻底删除用户数据目录（人设 / 记忆 / api 配置 / 待办 / 角色图 等全部填充内容）
  RMDir /r "$APPDATA\desk-pet-mini"
  RMDir /r "$LOCALAPPDATA\desk-pet-mini"
  ; 3) 兜底删除桌面 / 开始菜单快捷方式（覆盖当前用户 + 公共位置，
  ;    防止以管理员权限运行时路径错位导致快捷方式残留）
  SetShellVarContext current
  Delete "$DESKTOP\桌宠Mini.lnk"
  RMDir /r "$SMPROGRAMS\桌宠Mini"
  SetShellVarContext all
  Delete "$DESKTOP\桌宠Mini.lnk"
  RMDir /r "$SMPROGRAMS\桌宠Mini"
!macroend

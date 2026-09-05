; Jaygo AU — 自定义 NSIS 片段
; 通过 customInit 宏（在 initMultiUser 之后执行）强制默认安装目录为 D:\JaygoAU
; 用户在安装向导中仍可通过"选择安装位置"改为其它路径（allowToChangeInstallationDirectory=true）
!macro customInit
  StrCpy $INSTDIR "D:\JaygoAU"
!macroend

!macro customInstall
  ; 强制刷新桌面图标缓存与外壳通知
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  ExecWait 'ie4uinit.exe -show'
!macroend

; Jaygo AU — 自定义 NSIS 片段
; 通过 customInit 宏（在 initMultiUser 之后执行）强制默认安装目录为 D:\JaygoAU
; 用户在安装向导中仍可通过"选择安装位置"改为其它路径（allowToChangeInstallationDirectory=true）
!macro customInit
  StrCpy $INSTDIR "D:\JaygoAU"
!macroend

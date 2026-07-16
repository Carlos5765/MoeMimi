# MoeMimi

MoeMimi 是一个基于 Tauri v2、Vue 3、TypeScript 和 Vite 的模块化桌宠平台。

第一阶段支持：

- 同一进程内的 `main` 主界面和 `pet` 透明桌宠窗口
- 静态图片桌宠资源包
- 本地预设对话与 Galgame 风格对话框
- 默认桌宠、正常启动目标和开机启动目标设置
- 单实例、托盘入口和统一退出

Live2D、LLM、语音、SQLite 和口型同步尚未实现，只保留了类型接口和 TODO。

## 开发

```powershell
npm.cmd install
npm.cmd run tauri dev
```

## 验证

```powershell
npm.cmd run test
npm.cmd run build
cargo check --manifest-path src-tauri\Cargo.toml
```

## 数据位置

应用配置由 Tauri Store 保存为应用数据目录中的 `app-config.json`。桌宠资源保存在：

```text
<app-data>/pets/<petId>/
├─ pet.json
├─ avatar.png
└─ dialogue.json
```

Windows 上的应用数据目录通常是：

```text
%APPDATA%\com.moemimi.desktop
```

首次启动只会创建桌宠资源目录，不会自动生成或恢复示例桌宠；用户删除的桌宠不会在重启后重新出现。

## 启动规则

- 没有默认桌宠或默认桌宠不存在：打开主界面。
- 正常启动：读取 `launch`，未设置时打开主界面。
- 使用 `--autostart` 启动：读取 `autostart`，未设置时打开主界面。
- 已运行时再次启动：不创建第二个进程，显示并聚焦主界面。

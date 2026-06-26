# Memi Mobile App

React Native (Expo) 手机 App。随时随地跟 Memi 聊天。

## 快速体验（扫码）

```bash
cd memi-mobile
npm install
npx expo start
```

手机装 [Expo Go](https://expo.dev/go)，扫描终端二维码。

## 打包 APK（独立安装包）

```bash
cd memi-mobile
npm install

# 安装 EAS CLI
npm install -g eas-cli

# 登录 Expo 账号
eas login

# 初始化 EAS 项目
eas init

# 打包预览版 APK
eas build --platform android --profile preview
```

等待 10 分钟，下载 APK 直接安装。

## 打包 AAB（上架 Google Play）

```bash
eas build --platform android --profile production
eas submit --platform android
```

## 上架 App Store (iOS)

```bash
eas build --platform ios --profile production
eas submit --platform ios
```

## 项目结构

```
memi-mobile/
├── App.js              # 入口
├── app.json            # Expo 配置
├── eas.json            # EAS Build 配置
├── screens/
│   └── ChatScreen.js   # 聊天界面
└── assets/
    └── icon.png        # App 图标
```

## 前置条件

- Memi 服务正在运行（`memi server start`）
- 手机 App 设置里填入服务器地址
- 局域网: `memi expose lan`
- 公网: 用 ngrok/Cloudflare Tunnel

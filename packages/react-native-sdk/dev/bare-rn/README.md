# Reflag React Native SDK Bare RN Smoke App

This app is a non-Expo React Native example for validating `@reflag/react-native-sdk` behavior in a bare runtime.

It is intentionally useful for catching runtime compatibility differences that Expo can hide.

## Run

Prerequisites for iOS:

- Full Xcode app installed (not just Command Line Tools).
- Non-system Ruby on PATH (Homebrew Ruby recommended), because system Ruby on macOS often fails building native gems used by CocoaPods.

```sh
brew install ruby
echo 'export PATH="/opt/homebrew/opt/ruby/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

If Xcode is installed, select it as active developer directory:

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
```

Prerequisites for Android:

- Android SDK installed (via Android Studio recommended).
- Android SDK packages required by this project:
  - Android SDK Platform 36
  - Android SDK Build-Tools 36.0.0
  - Android SDK Platform-Tools (`adb`)
  - Android Emulator
- At least one emulator (AVD) created, or a physical Android device connected.

Set Android environment variables (`~/.zshrc`):

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin"
source ~/.zshrc
```

Create `android/local.properties`:

```sh
printf "sdk.dir=%s/Library/Android/sdk\n" "$HOME" > packages/react-native-sdk/dev/bare-rn/android/local.properties
```

Sanity checks:

```sh
adb --version
emulator -list-avds
npx react-native doctor
```

From the repo root:

```sh
yarn install
```

For iOS (first run, and after native dependency changes):

```sh
cd packages/react-native-sdk/dev/bare-rn
bundle install
bundle exec pod install --project-directory=ios
```

Start Metro:

```sh
cd packages/react-native-sdk/dev/bare-rn
yarn start
```

Run the app:

```sh
yarn ios
# or
yarn android
```

If using a physical device:

```sh
adb devices
adb reverse tcp:8081 tcp:8081
```

## Troubleshooting

- `/.../adb: No such file or directory`
  - `platform-tools` is missing or `ANDROID_HOME` / `PATH` is not set correctly.
- `No emulators found as an output of emulator -list-avds`
  - Create an emulator in Android Studio Device Manager, or connect a physical device.
- `SDK location not found ... android/local.properties`
  - Set `ANDROID_HOME` / `ANDROID_SDK_ROOT` and create `packages/react-native-sdk/dev/bare-rn/android/local.properties`.

## Notes

- This app calls `@reflag/react-native-sdk` directly (no Expo runtime).
- `App.tsx` includes runtime diagnostics for URL/search params and related globals.
- By default it runs offline with fallback flag `bare-rn-demo`.
- To hit live APIs, set `publishableKey` in `App.tsx`.
- `yarn start` / `yarn ios` / `yarn android` only rebuild SDK deps if `dist` outputs are missing.
- If you change SDK source in this monorepo, run `yarn build:deps` in this app before retesting.

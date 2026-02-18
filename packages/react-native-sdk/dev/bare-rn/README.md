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

## Notes

- This app calls `@reflag/react-native-sdk` directly (no Expo runtime).
- `App.tsx` includes runtime diagnostics for URL/search params and related globals.
- By default it runs offline with fallback flag `bare-rn-demo`.
- To hit live APIs, set `publishableKey` in `App.tsx`.
- `yarn start` / `yarn ios` / `yarn android` only rebuild SDK deps if `dist` outputs are missing.
- If you change SDK source in this monorepo, run `yarn build:deps` in this app before retesting.

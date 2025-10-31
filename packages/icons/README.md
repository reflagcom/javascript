# @reflag/icons

A universal icon library compatible with both **React** and **Preact**.

## Installation

```bash
npm install @reflag/icons
# or
yarn add @reflag/icons
# or
pnpm add @reflag/icons
```

## Peer Dependencies

This library requires either React or Preact:

- **React**: `^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0`
- **Preact**: `^10.0.0`

You only need to install one of them based on your project's framework.

## Usage

### Basic Usage (React)

```tsx
import { Icon } from "@reflag/icons";
import Icons from "@reflag/icons/icons.svg?raw";

function App() {
  return (
    <>
      {/* Load the SVG sprite (only once in your app) */}
      <div dangerouslySetInnerHTML={{ __html: Icons }} />

      {/* Use the Icon component */}
      <Icon name="Project" size={24} color="#ff0000" />
    </>
  );
}
```

### Basic Usage (Preact)

For Preact projects, you need to configure your build tool to alias React to Preact:

#### Using Vite

```js
// vite.config.js
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
});
```

Then use the same component:

```tsx
import { Icon } from "@reflag/icons";
import Icons from "@reflag/icons/icons.svg?raw";

export function App() {
  return (
    <>
      {/* Load the SVG sprite (only once in your app) */}
      <div dangerouslySetInnerHTML={{ __html: Icons }} />

      {/* Use the Icon component */}
      <Icon name="Project" size={24} color="#ff0000" />
    </>
  );
}
```

## API

### `Icon` Component

#### Props

| Prop       | Type               | Default          | Description                     |
| ---------- | ------------------ | ---------------- | ------------------------------- |
| `name`     | `IconKey`          | _required_       | The name of the icon to display |
| `size`     | `number \| string` | `16`             | Width and height of the icon    |
| `color`    | `string`           | `"currentColor"` | Color of the icon               |
| `...props` | `SVGAttributes`    | -                | Any other valid SVG attributes  |

#### Example with all props

```tsx
<Icon
  name="Project"
  size={32}
  color="#3b82f6"
  className="my-icon"
  style={{ margin: "10px" }}
  onClick={() => console.log("clicked")}
/>
```

## TypeScript

The library is fully typed. The `IconKey` type provides autocomplete for all available icon names.

```tsx
import type { IconProps, IconKey } from "@reflag/icons";

const iconName: IconKey = "Project"; // Autocomplete available!

function MyIcon(props: IconProps) {
  return <Icon {...props} />;
}
```

## How It Works

This library uses React's JSX runtime but is compatible with both React and Preact:

- **For React projects**: The library works out of the box
- **For Preact projects**: Use Preact's compatibility layer by aliasing `react` to `preact/compat`

The library exports React types but Preact's compatibility layer ensures they work seamlessly in Preact applications.

## Available Icons

The library includes icons synced from Figma. To see all available icons, check the type definitions or run the dev examples:

```bash
# React example
cd dev/react && npm install && npm run dev

# Preact example
cd dev/preact && npm install && npm run dev
```

## Development

### Building the library

```bash
yarn build
```

### Syncing icons from Figma

```bash
yarn sync
```

### Linting

```bash
yarn lint
```

## License

MIT

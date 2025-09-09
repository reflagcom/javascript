# Reflag CLI

Command-line interface for interacting with Reflag services. The CLI allows you to manage apps,
flags, authentication, and generate TypeScript types for your Reflag flags. With this tool,
you can streamline your flagging workflow directly from your terminal.

## Installation

Get started by installing the CLI locally in your project:

```bash
# npm
npm install --save-dev @reflag/cli

# yarn
yarn add --dev @reflag/cli
```

Then running the `new` command from your project's root directory,
initializing the CLI, creating a flag, and generating the types all at once:

```bash
# npm
npx reflag new

# yarn
yarn reflag new
```

## Migrating from Bucket SDK

If you have been using the Bucket CLI, the following list will help you migrate to Reflag CLI:

- The command has been renamed from `bucket` to `reflag`
- The default name of the file that contains the type definitions has been renamed to `flags.d.ts` from `features.d.ts`. You will need to manually remove `features.d.ts` if it was checked into the repository
- The name of the file that stores personal authentication details has been changed to `.reflag-auth` from `.bucket-auth`. You will need to rename or remove `.bucket-auth`
- The name of the file that stores CLI configuration has been changed to `reflag.config.json` from `bucket.config.json`. You will need to rename or remove `bucket.config.json`
- The `features` command has been renamed to `flags`
- The API key should now be supplied through `REFLAG_API_KEY` environment variable instead of `BUCKET_API_KEY`

Do not forget to update your scripts, build steps and `.gitignore` patterns

### Individual commands

Instead of running `new` you can call each step individually.

```bash
# Initialize Reflag in your project (if not already setup)
npx reflag init

# Create a new flag
npx reflag flags create "My Flag"

# Generate TypeScript types for your flags
npx reflag flags types
```

## Configuration

The CLI creates a `reflag.config.json` file in your project directory when you run `reflag init`.
This file contains all the necessary settings for your Reflag integration.

### Configuration File Structure

Here's a comprehensive list of configuration options available in the `reflag.config.json` file:

```json
{
  "$schema": "https://unpkg.com/@reflag/cli@latest/schema.json",
  "baseUrl": "https://app.reflag.com",
  "apiUrl": "https://app.reflag.com/api",
  "appId": "ap123456789",
  "typesOutput": [
    {
      "path": "gen/flags.d.ts",
      "format": "react"
    }
  ]
}
```

| Option        | Description                                                                                                                                                          | Default                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `$schema`     | Autocompletion for the config. `latest` can be replaced with a specific version.                                                                                     | "https://unpkg.com/@reflag/cli@latest/schema.json" |
| `baseUrl`     | Base URL for Reflag services.                                                                                                                                        | "https://app.reflag.com"                           |
| `apiUrl`      | API URL for Reflag services (overrides baseUrl for API calls).                                                                                                       | "https://app.reflag.com/api"                       |
| `appId`       | Your Reflag application ID.                                                                                                                                          | Required                                           |
| `typesOutput` | Path(s) where TypeScript types will be generated. Can be a string or an array of objects with `path` and `format` properties. Available formats: `react` and `node`. | "gen/flags.ts" with format "react"                 |

You can override these settings using command-line options for individual commands.

## Commands

### `reflag init`

Initialize a new Reflag configuration in your project.
This creates a `reflag.config.json` file with your settings and prompts for any required information not provided via options.

```bash
npx reflag init [--overwrite]
```

Options:

- `--overwrite`: Overwrite existing configuration file if one exists.
- `--app-id <id>`: Set the application ID.
- `--key-format <format>`: Set the key format for flags.

### `reflag new [flagName]`

All-in-one command to get started quickly. This command combines `init`, flag creation,
and type generation in a single step. Use this for the fastest way to get up and running with Reflag.

```bash
npx reflag new "My Flag" [--app-id ap123456789] [--key my-flag]  [--key-format custom] [--out gen/flags.ts] [--format react]
```

Options:

- `--key`: Specific key for the flag.
- `--app-id`: App ID to use.
- `--key-format`: Format for flag keys (custom, snake, camel, etc.).
- `--out`: Path to generate TypeScript types.
- `--format`: Format of the generated types (react or node).

If you prefer more control over each step, you can use the individual commands (`init`, `flags create`, `flags types`) instead.

### `reflag login`

Log in to your Reflag account. This will authenticate your CLI for subsequent operations and store credentials securely.

```bash
npx reflag login
```

### `reflag logout`

Log out from your Reflag account, removing stored credentials.

```bash
npx reflag logout
```

### `reflag flags`

Manage your Reflag flags with the following subcommands.

#### `reflag flags create [flagName]`

Create a new flag in your Reflag app.
The command guides you through the flag creation process with interactive prompts if options are not provided.

```bash
npx reflag flags create "My Flag" [--app-id ap123456789] [--key my-flag] [--key-format custom]
```

Options:

- `--key`: Specific key for the flag.
- `--app-id`: App ID to use.
- `--key-format`: Format for flag keys.

#### `reflag flags list`

List all flags for the current app.
This helps you visualize what flags are available and their current configurations.

```bash
npx reflag flags list [--app-id ap123456789]
```

Options:

- `--app-id`: App ID to use.

#### `reflag flags types`

Generate TypeScript types for your flags.
This ensures type safety when using Reflag flags in your TypeScript/JavaScript applications.

```bash
npx reflag flags types [--app-id ap123456789] [--out gen/flags.ts] [--format react]
```

Options:

- `--app-id`: App ID to use.
- `--out`: Path to generate TypeScript types.
- `--format`: Format of the generated types (react or node).

### `reflag apps`

Commands for managing Reflag apps.

## Global Options

These options can be used with any command:

- `--debug`: Enable debug mode for verbose output.
- `--base-url <url>`: Set the base URL for Reflag API.
- `--api-url <url>`: Set the API URL directly (overrides base URL).
- `--api-key <key>`: Reflag API key for non-interactive authentication.
- `--help`: Display help information for a command.

## AI-Assisted Development

Reflag provides powerful AI-assisted development capabilities through rules and Model Context Protocol (MCP). These flags help your AI development tools better understand your flags and provide more accurate assistance.

### Reflag Rules (Recommended)

The `rules` command helps you set up AI-specific rules for your project. These rules enable AI tools to better understand how to work with Reflag and flags and how they should be used in your codebase.

```bash
npx reflag rules [--format <cursor|copilot>] [--yes]
```

Options:

- `--format`: Format to add rules in:
  - `cursor`: Adds rules to `.cursor/rules/reflag.mdc` for Cursor IDE integration.
  - `copilot`: Adds rules to `.github/copilot-instructions.md` for GitHub Copilot integration.
- `--yes`: Skip confirmation prompts and overwrite existing files without asking.

This command will add rules to your project that provide AI tools with context about how to setup and use Reflag flags. For the copilot format, the rules will be added to a dedicated section in the file, allowing you to maintain other copilot instructions alongside Reflag's rules.

## Model Context Protocol

The Model Context Protocol (MCP) is an open protocol that provides a standardized way to connect AI models to different data sources and tools. In the context of Reflag, MCP enables your code editor to understand your flags, their states, and their relationships within your codebase. This creates a seamless bridge between your flag management workflow and AI-powered development tools. The MCP server is hosted by Reflag, so it's very easy to get started.

_\*\*Note: The Reflag `mcp` CLI command was previously used for a \_local_ server. However, in recent versions of the Reflag CLI, the `mcp` command has been repurposed to help you connect to the new remote MCP server.\*\*\_

### Setting up MCP

The `mcp` command helps you configure your editor or AI client to connect with Reflag's remote MCP server. This allows your AI tools to understand your flags and provide more contextual assistance.

```bash
npx reflag mcp [--app-id <id>] [--editor <editor>] [--scope <local|global>]
```

Options:

- `--app-id`: App ID to use for the MCP connection.
- `--editor`: The editor/client to configure:
  - `cursor`: [Cursor IDE](https://www.cursor.com/)
  - `vscode`: [Visual Studio Code](https://code.visualstudio.com/)
  - `claude`: [Claude Desktop](https://claude.ai/download)
  - `windsurf`: [Windsurf](https://windsurf.com/editor)
- `--scope`: Whether to configure settings globally or locally for the project.

The command will guide you through:

1. Selecting which editor/client to configure.
2. Choosing which Reflag app to connect to.
3. Deciding between global or project-local configuration.
4. Setting up the appropriate configuration file for your chosen editor .

_**Note: The setup uses [mcp-remote](https://github.com/geelen/mcp-remote) as a compatibility layer allowing the remote hosted Reflag MCP server to work with all editors/clients that support MCP STDIO servers. If your editor/client supports HTTP Streaming with OAuth you can connect to the Reflag MCP server directly.**_

## Using in CI/CD Pipelines (Beta)

The Reflag CLI is designed to work seamlessly in CI/CD pipelines. For automated environments where interactive login is not possible, use the `--api-key` option,
or specify the API key in `REFLAG_API_KEY` environment variable.

```bash
# Generate types in CI/CD
npx reflag apps list --api-key $REFLAG_API_KEY
```

**Important restrictions:**

- When using `--api-key`, the `login` and `logout` commands are disabled.
- API keys bypass all interactive authentication flows.
- Only _read-only_ access to Reflag API is granted at the moment.
- API keys are bound to one app only. Commands such as `apps list` will only return the bound app.
- Store API keys securely using your CI/CD platform's secret management.

Example CI workflow:

```yaml
# GitHub Actions example
- name: Generate types
  run: npx reflag flags types --api-key ${{ secrets.REFLAG_API_KEY }}

# GitHub Actions example (using environment):
- name: Generate types (environment)
  run: npx reflag flags types
  env:
    REFLAG_API_KEY: ${{ secrets.REFLAG_CI_API_KEY }}
```

## Development

```bash
# Build the CLI
yarn build

# Run the CLI locally
yarn reflag [command]

# Lint and format code
yarn lint
yarn format
```

## Requirements

- Node.js >=18.0.0

## License

> MIT License
> Copyright (c) 2025 Bucket ApS

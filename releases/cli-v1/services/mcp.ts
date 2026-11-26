import { resolvePath } from "../utils/file.js";

export const SupportedEditors = [
  "cursor",
  "vscode",
  "claude",
  "windsurf",
] as const;
export type SupportedEditor = (typeof SupportedEditors)[number];

type ConfigPaths = {
  name: string;
  global:
    | {
        mac: string;
        windows: string;
        linux?: string;
      }
    | string;
  local?: string;
};

export const ConfigPaths: Record<SupportedEditor, ConfigPaths> = {
  cursor: {
    name: "Cursor",
    global: "~/.cursor/mcp.json",
    local: ".cursor/mcp.json",
  },
  vscode: {
    name: "Visual Studio Code",
    global: {
      mac: "~/Library/Application Support/Code/User/settings.json",
      linux: "~/.config/Code/User/settings.json",
      windows: "@/Code/User/settings.json",
    },
    local: ".vscode/mcp.json",
  },
  claude: {
    name: "Claude Desktop",
    global: {
      mac: "~/Library/Application Support/Claude/claude_desktop_config.json",
      windows: "@/Claude/claude_desktop_config.json",
    },
  },
  windsurf: {
    name: "Windsurf",
    global: "~/.codeium/windsurf/mcp_config.json",
  },
};

export function resolveConfigPath(editor: SupportedEditor, local = false) {
  const editorConfig = ConfigPaths[editor];
  const paths = local ? editorConfig.local : editorConfig.global;

  if (!paths) return undefined;

  if (typeof paths === "string") {
    return resolvePath(paths);
  }

  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (process.platform) {
    case "darwin":
      return resolvePath(paths.mac);
    case "win32":
      return resolvePath(paths.windows);
    case "linux":
      return paths.linux ? resolvePath(paths.linux) : undefined;
    default:
      return undefined;
  }
}

export function getServersConfig(
  editorConfig: any,
  selectedEditor: SupportedEditor,
  configPathType: "global" | "local",
) {
  if (selectedEditor === "vscode") {
    if (configPathType === "global") {
      editorConfig.mcp = editorConfig.mcp || {};
      editorConfig.mcp.servers = editorConfig.mcp.servers || {};
      return editorConfig.mcp.servers;
    } else {
      editorConfig.servers = editorConfig.servers || {};
      return editorConfig.servers;
    }
  }
  editorConfig.mcpServers = editorConfig.mcpServers || {};
  return editorConfig.mcpServers;
}

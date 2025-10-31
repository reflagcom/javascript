import fs from "node:fs/promises";
import path from "node:path";
import SVGSpriter from "svg-sprite";
import * as figmaExport from "@figma-export/core";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const GEN_DIR = path.resolve(process.cwd(), "lib", "gen");
const DIST_DIR = path.resolve(process.cwd(), "dist");

const config = {
  shape: {
    transform: [
      {
        svgo: {
          plugins: [
            "preset-default",
            {
              name: "convertColors",
              params: {
                currentColor: true,
              },
            },
          ],
        },
      },
    ],
  },
  mode: {
    symbol: {
      dest: DIST_DIR,
      sprite: "icons.svg",
    },
  },
};

const spriter = new SVGSpriter(config);

async function clean(dir) {
  if (
    await fs
      .stat(dir)
      .then(() => true)
      .catch(() => false)
  ) {
    await fs.rm(dir, { recursive: true });
  }
  await fs.mkdir(dir, { recursive: true });
}

async function syncFigmaIcons() {
  const res = await figmaExport.components({
    fileId: process.env.FIGMA_FILE_ID,
    ids: [process.env.FIGMA_NODE_ID],
    token: process.env.FIGMA_TOKEN,
  });
  return (
    res[0]?.components.map(({ name, svg }) => ({
      name: name.replace("key=", ""),
      svg,
    })) ?? []
  );
}

async function buildSvgSheet(iconFiles) {
  for (const { name, svg } of iconFiles) {
    spriter.add(name, null, svg);
  }

  const { result } = await spriter.compileAsync();

  for (const mode of Object.values(result)) {
    for (const resource of Object.values(mode)) {
      await fs.mkdir(path.dirname(resource.path), { recursive: true });
      await fs.writeFile(resource.path, resource.contents);
    }
  }
}

async function generateTypes(iconFiles) {
  await fs.writeFile(
    path.resolve(GEN_DIR, "icons-keys.ts"),
    `export const IconKeys = [
${iconFiles.map(({ name }) => `  "${name}"`).join(",\n")}
] as const;

export type IconKey = (typeof IconKeys)[number];
    `,
  );
}

async function main() {
  const iconFiles = await syncFigmaIcons();
  await clean(GEN_DIR);
  await generateTypes(iconFiles);

  await clean(DIST_DIR);
  await buildSvgSheet(iconFiles);
}

main();

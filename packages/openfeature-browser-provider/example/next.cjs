// Yarn's virtual-package bin mapping can select another workspace's Next CLI.
// Resolve it here so the CLI and application imports use the same Next runtime.
require("next/dist/bin/next");

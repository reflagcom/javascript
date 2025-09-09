import { FunctionComponent, h } from "preact";

import { Logo } from "../../ui/icons/Logo";

export const Plug: FunctionComponent = () => {
  return (
    <footer class="plug">
      <a href="https://reflag.com" rel="noreferrer" target="_blank">
        Powered by <Logo height="10px" width="10px" /> Reflag
      </a>
    </footer>
  );
};

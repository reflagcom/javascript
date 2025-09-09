import { FunctionComponent, h } from "preact";

export const Logo: FunctionComponent<h.JSX.SVGAttributes<SVGSVGElement>> = (
  props = { height: "10px", width: "10px" },
) => (
  <svg
    width="128"
    height="128"
    viewBox="0 0 128 128"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M117.333 0C123.224 0 128 4.77563 128 10.6667V117.333C128 123.224 123.224 128 117.333 128H10.6667C4.77563 128 1.71804e-07 123.224 0 117.333V10.6667C0 4.77563 4.77563 1.71801e-07 10.6667 0H117.333ZM10.6667 10.6667V117.333L117.333 10.6667H10.6667Z"
      fill="currentColor"
    />
  </svg>
);

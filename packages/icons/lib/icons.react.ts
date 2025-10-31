import {
  createElement,
  type SVGAttributes,
  type FunctionComponent,
} from "react";
import type { IconKey } from "./gen/icons-keys";

type AllSVGProps = SVGAttributes<SVGSVGElement>;
type ReservedProps =
  | "name"
  | "color"
  | "size"
  | "width"
  | "height"
  | "fill"
  | "viewBox";
export interface IconProps extends Omit<AllSVGProps, ReservedProps> {
  name: IconKey;
  color?: string;
  size?: number | string;
  children?: never;
}
export type IconComponentType = FunctionComponent<IconProps>;

export const Icon: IconComponentType = ({
  name,
  size = 16,
  color = "currentColor",
  ...props
}) => {
  return createElement(
    "svg",
    { ...props, width: size, height: size, color },
    createElement("use", { href: `#${name}` }),
  );
};

export type { IconKey };
export * from "./emojis";

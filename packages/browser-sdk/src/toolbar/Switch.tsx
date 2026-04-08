import { h } from "preact";

interface SwitchProps extends h.JSX.HTMLAttributes<HTMLInputElement> {
  checked: boolean;
  width?: number;
  height?: number;
}

const gutter = 1;

export function Switch({
  checked,
  width = 24,
  height = 14,
  ...props
}: SwitchProps) {
  return (
    <label class="switch" data-enabled={checked}>
      <input
        checked={checked}
        class="switch-input"
        name="enabled"
        type="checkbox"
        {...props}
      />
      <div
        class="switch-track"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${height}px`,
        }}
      >
        <div
          class="switch-dot"
          style={{
            width: `${height - gutter * 2}px`,
            height: `${height - gutter * 2}px`,
            transform: checked
              ? `translateX(${width - (height - gutter * 2) - gutter}px)`
              : `translateX(${gutter}px)`,
            top: `${gutter}px`,
          }}
        />
      </div>
    </label>
  );
}

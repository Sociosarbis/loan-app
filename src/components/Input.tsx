import { createRenderEffect, createSignal } from "solid-js";

export function Input(props: {
  value?: string;
  required?: boolean;
  placeholder?: string;
  onChange?: (
    e: Event & {
      currentTarget: HTMLInputElement;
      target: HTMLInputElement;
    },
  ) => void;
}) {
  const [value, setValue] = createSignal(props.value);
  createRenderEffect(() => {
    setValue(props.value)
  })
  return (
    <input
      type="text"
      value={value()}
      class="input"
      classList={{
        "input-error": props.required && !value(),
      }}
      placeholder={props.placeholder}
      onChange={(e) => {
        setValue(e.target.value?.trim());
        props.onChange?.(e);
      }}
    ></input>
  );
}

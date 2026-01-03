import { createEffect, JSXElement, Show } from "solid-js";

export function Modal(props: {
  visible?: boolean;
  onCancel?: () => void;
  onOk?: () => void;
  title: JSXElement;
  content: JSXElement;
  loading?: boolean;
}) {
  let modelRef: HTMLDialogElement | undefined;
  createEffect(() => {
    if (props.visible) {
      modelRef?.show();
    } else {
      modelRef?.close();
    }
  });
  return (
    <dialog
      ref={modelRef}
      class="modal"
      onClick={props.loading ? undefined : props.onCancel}
    >
      {/* 弹窗内容：阻止冒泡，避免点击内容时关闭 */}
      <div class="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 class="text-lg font-bold">{props.title}</h2>
        <p class="py-4">{props.content}</p>
        <div class="modal-action">
          <button onClick={props.onCancel} disabled={props.loading} class="btn">
            取消
          </button>
          <button
            onClick={props.onOk}
            class="btn btn-primary"
            disabled={props.loading}
          >
            <Show when={props.loading}>
              <span class="loading loading-spinner mx-1"></span>
            </Show>
            确定
          </button>
        </div>
      </div>
    </dialog>
  );
}

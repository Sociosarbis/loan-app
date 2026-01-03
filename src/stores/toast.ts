import { createSelector } from "solid-js";
import { createStore, produce } from "solid-js/store";

export function createToastStore() {
  let id = 0;
  const [state, set] = createStore<{
    messages: Array<{ id: number; text: string; type: string }>;
  }>({
    messages: [],
  });

  const showMessage = (params: { text: string; type: string }) => {
    const currentId = id++;
    set(
      "messages",
      produce((messages) => {
        messages.push({
          id: currentId,
          type: params.type,
          text: params.text,
        });
      })
    );
    setTimeout(() => {
      set("messages", (messages) =>
        messages.filter((message) => message.id !== currentId)
      );
    }, 5000);
  };

  return {
    state,
    set,
    showMessage,
  };
}

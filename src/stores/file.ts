import { createStore } from "solid-js/store";
import { OneDriveFile } from "~/types/OneDrive";

export function createFileStore() {
  const [state, set] = createStore<{
    folderId?: string;
    files: Array<OneDriveFile>;
  }>({
    files: [],
  });

  return {
    state,
    set,
  };
}

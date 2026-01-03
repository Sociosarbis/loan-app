import { createContext } from "solid-js";
import { createUserStore } from "./user";
import { createToastStore } from "./toast";
import { createFileStore } from "./file";
import { Client } from "~/utils/onedrive";

const userStore = createUserStore();

export const AppContext = createContext({
  userStore: userStore,
  toastStore: createToastStore(),
  fileStore: createFileStore(),
  oneDriveClient: new Client({
    accessToken: () => userStore.state.accessToken,
    refreshToken: () => userStore.state.refreshToken,
    onRefresh: (tokens) => userStore.setTokens(tokens),
  }),
});

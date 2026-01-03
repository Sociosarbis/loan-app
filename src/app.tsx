import { createAsync, Router, useNavigate } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { For, Suspense } from "solid-js";
import "./app.css";
import { AppContext } from "./stores";
import { createUserStore } from "./stores/user";
import { createToastStore } from "./stores/toast";
import { createFileStore } from "./stores/file";
import { Client } from "./utils/onedrive";

export default function App() {
  const toastStore = createToastStore();
  const userStore = createUserStore();
  return (
    <>
      <Router
        root={(props) => {
          const navigate = useNavigate();
          return (
            <AppContext.Provider
              value={{
                userStore,
                toastStore,
                fileStore: createFileStore(),
                oneDriveClient: new Client(
                  {
                    accessToken: () => userStore.state.accessToken,
                    refreshToken: () => userStore.state.refreshToken,
                    onRefresh: (tokens) => {
                      userStore.setTokens(tokens);
                    },
                  },
                  () => {
                    userStore.setTokens({});
                    navigate("/login");
                  }
                ),
              }}
            >
              <Suspense>{props.children}</Suspense>
            </AppContext.Provider>
          );
        }}
      >
        <FileRoutes />
      </Router>
      <div class="toast toast-top toast-center">
        <For each={toastStore.state.messages}>
          {(item) => {
            return (
              <div
                class="alert alert-soft"
                classList={{
                  [item.type === "error"
                    ? "alert-error"
                    : item.type === "warning"
                    ? "alert-warning"
                    : item.type === "success"
                    ? "alert-success"
                    : "alert-info"]: true,
                }}
              >
                {item.text}
              </div>
            );
          }}
        </For>
      </div>
    </>
  );
}

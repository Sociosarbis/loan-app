import { Component, Show, useContext } from "solid-js";
import { createStore } from "solid-js/store";
import { isServer } from "solid-js/web";
import { AppContext } from ".";
import { Navigate } from "@solidjs/router";

export function createUserStore() {
  let tokens:
    | {
        accessToken?: string;
        refreshToken?: string;
      }
    | undefined;
  try {
    if (!isServer) {
      const data = window.localStorage.getItem("onedrive_tokens");
      if (data) {
        tokens = JSON.parse(data);
      }
    }
  } catch (e) {}
  const [state, set] = createStore<{
    accessToken?: string;
    refreshToken?: string;
  }>(tokens ?? {});

  const setTokens = (tokens: {
    accessToken?: string;
    refreshToken?: string;
  }) => {
    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    if (!isServer) {
      localStorage.setItem("onedrive_tokens", JSON.stringify(tokens));
    }
  };
  return {
    state,
    set,
    setTokens,
  };
}

export function NeedLoggedIn<P extends Record<string, any> = {}>(
  Component: Component<P>
) {
  return (props: P) => {
    const { userStore } = useContext(AppContext);
    return (
      <Show
        when={!!userStore.state.accessToken}
        fallback={<Navigate href="/login" />}
      >
        <Component {...props} />
      </Show>
    );
  };
}

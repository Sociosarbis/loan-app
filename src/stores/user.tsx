import { Component, Show, Suspense, useContext } from "solid-js";
import { createStore } from "solid-js/store";
import { isServer } from "solid-js/web";
import { AppContext } from ".";
import { createAsync, Navigate, query } from "@solidjs/router";
import { Tokens } from "~/types/Tokens";
import { getUserSession } from "~/utils/session";

export function createUserStore(initState?: Partial<Tokens>) {
  let tokens = initState;
  try {
    if (!isServer && !tokens) {
      const data = window.localStorage.getItem("onedrive_tokens");
      if (data) {
        tokens = JSON.parse(data);
      }
    }
  } catch (e) {}
  const [state, set] = createStore<Partial<Tokens>>(tokens ?? {});

  const setTokens = (tokens: Partial<Tokens>) => {
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
    const getUserSessionQuery = query(() => getUserSession(), "sess");
    const sess = createAsync(() =>
      getUserSessionQuery().then((data) => {
        if (data?.accessToken) {
          userStore.setTokens(data);
        }
        return data;
      })
    );
    return (
      <Suspense>
        <Show when={sess()}>
          <Show
            when={!!userStore.state.accessToken}
            fallback={<Navigate href="/login" />}
          >
            <Component {...props} />
          </Show>
        </Show>
      </Suspense>
    );
  };
}

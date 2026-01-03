import { action } from "@solidjs/router";
import { pick } from "lodash-es";
import { getRequestEvent } from "solid-js/web";
import { getSession } from "vinxi/http";
import { Tokens } from "~/types/Tokens";

export const config = {
  password: process.env.SESSION_PASSWORD,
  name: "user",
};

export async function getUserSession() {
  "use server";
  const event = getRequestEvent()?.nativeEvent;
  if (event) {
    const sess = await getSession<Tokens>(event, {
      ...config,
      cookie: false,
    });
    return sess.data;
  }
}

export const saveSession = async (params: Tokens) => {
  return fetch("/api/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  }).then((res) => pick(res, "ok", "status"));
};

export const clearSession = async () => {
  return fetch("/api/session", {
    method: "DELETE",
  }).then((res) => pick(res, "ok", "status"));
};

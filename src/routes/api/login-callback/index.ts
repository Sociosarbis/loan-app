import { redirect } from "@solidjs/router";
import { APIEvent } from "@solidjs/start/server";
import { isString } from "lodash-es";
import { useUserSession } from "~/composables/useUserSession";
import { exchangeCodeForTokens } from "~/utils/onedrive";

export async function GET({ params }: APIEvent) {
  if (isString(params.code) && params.code) {
    const tokens = await exchangeCodeForTokens(params.code);
    if (tokens) {
      const session = await useUserSession();
      await session.update(tokens);
      return redirect("/list");
    }
  }
  return redirect("/login", { status: 302 });
}

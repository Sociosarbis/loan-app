import { useSession } from "vinxi/http";
import { Tokens } from "~/types/Tokens";
import { config } from "~/utils/session";

export function useUserSession() {
  "user server";
  return useSession<Tokens>(config);
}

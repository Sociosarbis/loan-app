import { useSession } from "vinxi/http";
import { Tokens } from "~/types/Tokens";

const config = {
  password: process.env.SESSION_PASSWORD,
  name: "user",
};

export function useUserSession() {
  "user server";
  return useSession<Tokens>(config);
}

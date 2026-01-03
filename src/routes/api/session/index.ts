import { APIEvent } from "@solidjs/start/server";
import { useUserSession } from "~/composables/useUserSession";

export async function POST({ request }: APIEvent) {
  const body = await request.json();
  const session = await useUserSession();
  await session.update(body);
  return new Response();
}

export async function DELETE(_: APIEvent) {
  const session = await useUserSession();
  await session.clear();
  return new Response();
}

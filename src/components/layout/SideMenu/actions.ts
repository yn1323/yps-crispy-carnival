"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function signout() {
  const error = false;

  if (error) {
    redirect("/error");
  }

  revalidatePath("/", "layout");
  redirect("/");
}

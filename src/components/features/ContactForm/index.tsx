import { TURNSTILE_SITE_KEY } from "@/src/configs/publicEnv";
import { ContactFormController } from "./ContactFormController";
import { submitContactRequest } from "./submitContactRequest";

export function ContactForm() {
  return <ContactFormController onSubmit={submitContactRequest} verification={{ siteKey: TURNSTILE_SITE_KEY }} />;
}

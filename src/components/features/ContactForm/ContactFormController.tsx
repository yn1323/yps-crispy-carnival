import { ContactFormView } from "./ContactFormView";
import type { ContactSubmitData } from "./submitContactRequest";
import { type ContactVerification, useContactFormController } from "./useContactFormController";

type Props = {
  onSubmit: (data: ContactSubmitData) => Promise<void>;
  verification: ContactVerification;
};

export function ContactFormController(props: Props) {
  const viewProps = useContactFormController(props);

  return <ContactFormView {...viewProps} />;
}

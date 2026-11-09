"use server";

import { getTranslations } from "next-intl/server";

import { createContactMailto } from "@/lib/contact";
import type { ContactErrors, ContactFormState } from "./form-state";

type ContactPayload = {
  email: string;
  honeypot: string;
  message: string;
  name: string;
  subject: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 80;
const MAX_SUBJECT_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 3000;

function getField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function validateContactPayload(
  payload: ContactPayload,
): Promise<ContactErrors> {
  const t = await getTranslations("contact.validation");
  const errors: ContactErrors = {};

  if (!payload.name) {
    errors.name = t("nameRequired");
  } else if (payload.name.length > MAX_NAME_LENGTH) {
    errors.name = t("nameTooLong", { max: MAX_NAME_LENGTH });
  }

  if (!payload.email) {
    errors.email = t("emailRequired");
  } else if (!EMAIL_PATTERN.test(payload.email)) {
    errors.email = t("emailInvalid");
  }

  if (payload.subject.length > MAX_SUBJECT_LENGTH) {
    errors.subject = t("subjectTooLong", { max: MAX_SUBJECT_LENGTH });
  }

  if (!payload.message) {
    errors.message = t("messageRequired");
  } else if (payload.message.length > MAX_MESSAGE_LENGTH) {
    errors.message = t("messageTooLong", { max: MAX_MESSAGE_LENGTH });
  }

  return errors;
}

export async function submitContactForm(
  _previousState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const t = await getTranslations("contact.status");
  const payload: ContactPayload = {
    email: getField(formData, "email"),
    honeypot: getField(formData, "company"),
    message: getField(formData, "message"),
    name: getField(formData, "name"),
    subject: getField(formData, "subject"),
  };

  if (payload.honeypot) {
    return {
      message: t("honeypot"),
      status: "success",
    };
  }

  const errors = await validateContactPayload(payload);
  if (Object.keys(errors).length > 0) {
    return {
      errors,
      message: t("error"),
      status: "error",
    };
  }

  // The site has no mail server: a valid message opens the visitor's own mail
  // app with everything filled in, addressed to support.
  return {
    mailtoUrl: createContactMailto(payload),
    message: t("mailto"),
    status: "mailto",
  };
}

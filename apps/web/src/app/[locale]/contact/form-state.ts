export type ContactField = "name" | "email" | "subject" | "message";
export type ContactErrors = Partial<Record<ContactField, string>>;

export type ContactFormState = {
  errors?: ContactErrors;
  mailtoUrl?: string;
  message: string;
  status: "idle" | "success" | "error" | "mailto";
};

export const initialContactFormState: ContactFormState = {
  message: "",
  status: "idle",
};

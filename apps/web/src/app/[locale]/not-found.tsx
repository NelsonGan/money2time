import { useTranslations } from "next-intl";

import { Header } from "@/components/site-chrome";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <div className="min-h-[100svh] flex flex-col">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p
            className="text-8xl font-black tracking-tight mb-6"
            style={{ color: "#B65F48" }}
          >
            404
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight mb-3">
            {t("title")}
          </h1>
          <p className="text-foreground-muted text-[15px] mb-8">
            {t("body")}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
          >
            {t("home")}
          </Link>
        </div>
      </main>
    </div>
  );
}

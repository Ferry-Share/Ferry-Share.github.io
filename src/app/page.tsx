import { FerryApp } from "@/components/FerryApp";
import { HomeContent } from "@/components/HomeContent";
import { SiteFooter } from "@/components/SiteChrome";

/**
 * The front page: the app, then the page about the app.
 *
 * This file is a server component even though the app inside it is not. The
 * app fills the first screen and needs a browser to exist at all; everything
 * under it is prose, rendered here to plain HTML so it is in the document for
 * anyone — or anything — that reads the page without running JavaScript.
 */
export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-12 sm:px-6">
      <div className="flex min-h-dvh flex-col">
        <FerryApp />
      </div>
      <HomeContent />
      <SiteFooter />
    </div>
  );
}

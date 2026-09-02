/**
 * A block of structured data.
 *
 * Search engines and the crawlers behind AI assistants both read JSON-LD to
 * work out what a page is *about* rather than guessing from prose. The `<`
 * escape matters: a `</script>` sequence inside the JSON would end the tag
 * early and spill the rest of the document, so it never reaches the markup
 * literally.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/**
 * The trail from the front page to this one. Search results render it in
 * place of the raw URL, and it tells a crawler how the site fits together.
 */
export function breadcrumbs(
  siteUrl: string,
  trail: { name: string; url: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: step.url,
    })),
  };
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "progetto";
}

// Rule: NomeProgetto-DataCreazione (slugified project name + creation date).
export function buildCommessaId(name: string, createdAt: Date): string {
  const datePart = createdAt.toISOString().slice(0, 10);
  return `${slugify(name)}-${datePart}`;
}

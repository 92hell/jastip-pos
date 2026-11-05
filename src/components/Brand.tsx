/** The shop's name in the logo's hand-lettered style, on its sky blue. */
export function Brand({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span className={`inline-block rounded-2xl bg-sky px-3 py-1 font-display leading-none text-ink ${size === "lg" ? "text-4xl sm:text-5xl" : "text-2xl"}`}>
      {name}
    </span>
  );
}

import { notFound } from "next/navigation";
import StyleGuideClient from "./StyleGuideClient";

export const dynamic = "force-dynamic";

export default function DevStylePage() {
  const isDev = process.env.NODE_ENV !== "production";
  const isEnabled =
    process.env.ENABLE_STYLE_GUIDE === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_STYLE_GUIDE === "true";

  if (!isDev && !isEnabled) {
    notFound();
  }

  return <StyleGuideClient />;
}

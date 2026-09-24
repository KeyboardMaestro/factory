"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/client/analytics";

export function LandingTracker({ source }: { source: "kakao" | "copy" | "native" | "instagram" | "direct" }) {
  useEffect(() => { trackEvent({ name: "landing_view", source }); }, [source]);
  return null;
}

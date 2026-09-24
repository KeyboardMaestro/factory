import { describe, expect, it } from "vitest";
import { HOBBY_TAGS, PERSONALITY_TAGS } from "@/lib/domain";
import { HOBBY_LABELS, PERSONALITY_LABELS, makeCustomTag, normalizeTagText, resolveTagInput, tagLabel } from "@/lib/tags";

describe("direct-entry tags and autocomplete values", () => {
  it("normalizes spaces, full-width text and Latin case consistently", () => {
    expect(normalizeTagText("  Ｃｌｉｍｂｉｎｇ   모임  ")).toBe("climbing 모임");
    expect(makeCustomTag("  클라이밍  ")).toBe("custom:클라이밍");
  });
  it("maps a typed preset label to its existing canonical tag", () => {
    expect(resolveTagInput("  다정함 ", PERSONALITY_TAGS, PERSONALITY_LABELS)).toBe("warm");
    expect(resolveTagInput(" 음악 ", HOBBY_TAGS, HOBBY_LABELS)).toBe("music");
  });
  it("stores suggested and arbitrary direct input in the same custom format", () => {
    const tag = resolveTagInput(" 클라이밍 ", HOBBY_TAGS, HOBBY_LABELS);
    expect(tag).toBe("custom:클라이밍");
    expect(tagLabel(tag!, HOBBY_LABELS)).toBe("클라이밍");
    expect(resolveTagInput("<script>", HOBBY_TAGS, HOBBY_LABELS)).toBeNull();
  });
});

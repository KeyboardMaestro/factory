import {
  HOBBY_TAGS,
  PERSONALITY_TAGS,
  type CustomTag,
  type HobbyTag,
  type PersonalityTag,
} from "@/lib/domain";

export const PERSONALITY_LABELS: Record<PersonalityTag, string> = {
  warm: "다정함", calm: "차분함", outgoing: "활발함", humorous: "유머감각",
  honest: "솔직함", organized: "계획적", spontaneous: "즉흥적", independent: "독립적",
};

export const HOBBY_LABELS: Record<HobbyTag, string> = {
  screen: "영화·드라마", music: "음악", exercise: "운동", gaming: "게임", reading: "독서",
  travel: "여행", food_cafe: "맛집·카페", arts: "전시·공연", making: "만들기·창작", outdoors: "산책·자연",
};

export const PERSONALITY_SUGGESTIONS = ["배려심", "공감", "성실함", "호기심", "신중함", "낙천적"] as const;
export const HOBBY_SUGGESTIONS = ["러닝", "요리", "사진", "캠핑", "반려동물", "클라이밍", "보드게임"] as const;

const customTextPattern = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9][가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 .·&+_-]{0,19}$/u;
const customPrefix = "custom:";

export function normalizeTagText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function makeCustomTag(value: string): CustomTag | null {
  const normalized = normalizeTagText(value);
  return customTextPattern.test(normalized) ? `${customPrefix}${normalized}` : null;
}

export function isValidTagValue<T extends string>(value: string, presets: readonly T[]): value is T | CustomTag {
  if (presets.includes(value as T)) return true;
  if (!value.startsWith(customPrefix)) return false;
  const text = value.slice(customPrefix.length);
  return makeCustomTag(text) === value;
}

export function resolveTagInput<T extends string>(
  input: string,
  presets: readonly T[],
  labels: Readonly<Record<T, string>>,
): T | CustomTag | null {
  const normalized = normalizeTagText(input);
  const existing = presets.find((tag) => normalizeTagText(tag) === normalized || normalizeTagText(labels[tag]) === normalized);
  return existing ?? makeCustomTag(input);
}

export function tagLabel<T extends string>(value: T | CustomTag, labels: Readonly<Record<T, string>>): string {
  return value.startsWith(customPrefix) ? value.slice(customPrefix.length) : labels[value as T] ?? value;
}

export const PERSONALITY_CHOICES = PERSONALITY_TAGS.map((value) => ({ value, label: PERSONALITY_LABELS[value] }));
export const HOBBY_CHOICES = HOBBY_TAGS.map((value) => ({ value, label: HOBBY_LABELS[value] }));
